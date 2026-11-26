import {
  AttributionControl,
  GlobeControl,
  Map as MapLibreMap,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
  type StyleSpecification,
} from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import 'maplibre-gl/dist/maplibre-gl.css';

// Register MapLibre GL JS v6 Web Worker explicitly so vector tiles & 3D buildings render in Vite dev and production builds
setWorkerUrl(maplibreWorkerUrl);
import { AIRPORTS, AIRPORT_MAP } from '../data/airports';
import {
  CameraPreset,
  Flight,
  MapStyleId,
  PinnedWindProbe,
  ProjectedLabel,
  ProjectedWindStation,
  STATUS_META,
  StatusFilter,
} from '../types/flight';
import {
  WIND_STATIONS,
  WindSample,
  sampleWindAt,
  sampleWindVector,
  windSpeedToRGB,
} from '../three/windField';

export interface HoverPayload {
  kind: 'flight' | 'airport' | 'wind_probe';
  id: string;
  screenX: number;
  screenY: number;
  lat?: number;
  lon?: number;
  wind?: WindSample;
}

export interface FlightMapCallbacks {
  onSelectFlight: (flightId: string | null) => void;
  onPinWindProbe: (probe: PinnedWindProbe | null) => void;
  onHoverChange: (hover: HoverPayload | null) => void;
  onLabelsUpdate: (
    labels: ProjectedLabel[],
    windStations: ProjectedWindStation[]
  ) => void;
  onContextLostChange?: (lost: boolean) => void;
}

interface ScreenFlightHit {
  id: string;
  x: number;
  y: number;
}

interface ScreenAirportHit {
  code: string;
  x: number;
  y: number;
}

interface WindParticle {
  x: number;
  y: number;
  age: number;
  maxAge: number;
  trailX: Float32Array;
  trailY: Float32Array;
  trailLen: number;
}

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const GRID_W = 88;
const GRID_H = 52;
const PARTICLE_COUNT = 560;
const TRAIL_POINTS = 7;
const ARC_SEGMENTS = 36;

// Official free open-source MapLibre GL JS vector styles (no API key required)
const OPENFREEMAP_LIBERTY_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const CARTO_DARK_MATTER_VECTOR_STYLE =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

/**
 * Resolves free open-source MapLibre GL JS styles:
 * - 'jalan': OpenFreeMap Liberty Vector Style (sharp vector roads, KLIA runways, upright labels & 3D extruded buildings)
 * - 'radar': CARTO Dark Matter Vector Style (crisp dark vector aviation radar map)
 * - 'satelit': Esri World Imagery aerial photography + CARTO labels
 */
function getFreeMapLibreStyle(styleId: MapStyleId): string | StyleSpecification {
  if (styleId === 'jalan') {
    return OPENFREEMAP_LIBERTY_STYLE;
  }

  if (styleId === 'radar') {
    return CARTO_DARK_MATTER_VECTOR_STYLE;
  }

  // 'satelit': High-res aerial satellite photography + clean place labels
  return {
    version: 8,
    sources: {
      'esri-satellite': {
        type: 'raster',
        tiles: [
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        ],
        tileSize: 256,
        maxzoom: 18,
        attribution: '© Esri, Maxar, Earthstar Geographics · © OpenStreetMap · CARTO',
      },
      'carto-labels': {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
          'https://c.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
          'https://d.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
        ],
        tileSize: 256,
        maxzoom: 19,
      },
    },
    layers: [
      {
        id: 'satellite-base',
        type: 'raster',
        source: 'esri-satellite',
      },
      {
        id: 'satellite-labels',
        type: 'raster',
        source: 'carto-labels',
        paint: {
          'raster-opacity': 0.94,
        },
      },
    ],
  };
}

/**
 * Great-circle spherical interpolation returning { lat, lon } along route at t in [0, 1].
 */
function interpolateGreatCircle(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
  t: number
): { lat: number; lon: number } {
  const phi1 = lat1 * DEG2RAD;
  const lam1 = lon1 * DEG2RAD;
  const phi2 = lat2 * DEG2RAD;
  const lam2 = lon2 * DEG2RAD;

  const x1 = Math.cos(phi1) * Math.cos(lam1);
  const y1 = Math.cos(phi1) * Math.sin(lam1);
  const z1 = Math.sin(phi1);

  const x2 = Math.cos(phi2) * Math.cos(lam2);
  const y2 = Math.cos(phi2) * Math.sin(lam2);
  const z2 = Math.sin(phi2);

  const dot = Math.max(-1, Math.min(1, x1 * x2 + y1 * y2 + z1 * z2));
  const omega = Math.acos(dot);

  if (omega < 1e-5) {
    return { lat: lat1, lon: lon1 };
  }

  const sinOmega = Math.sin(omega);
  const s0 = Math.sin((1 - t) * omega) / sinOmega;
  const s1 = Math.sin(t * omega) / sinOmega;

  const x = x1 * s0 + x2 * s1;
  const y = y1 * s0 + y2 * s1;
  const z = z1 * s0 + z2 * s1;

  const lat = Math.atan2(z, Math.hypot(x, y)) * RAD2DEG;
  const lon = Math.atan2(y, x) * RAD2DEG;
  return { lat, lon };
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export class FlightMapScene {
  private container: HTMLElement;
  private callbacks: FlightMapCallbacks;

  private mapEl: HTMLDivElement;
  private overlayCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private map: MapLibreMap;

  // Offscreen Windy-style wind field cache (recomputed only when map camera changes)
  private heatmapCanvas: HTMLCanvasElement;
  private heatmapCtx: CanvasRenderingContext2D;
  private heatmapImageData: ImageData;
  private gridU = new Float32Array(GRID_W * GRID_H);
  private gridV = new Float32Array(GRID_W * GRID_H);
  private gridSpeed = new Float32Array(GRID_W * GRID_H);
  private windFieldDirty = true;
  private lastWindGridBuildMs = 0;

  // Flowing white wind streamline particles
  private particles: WindParticle[] = [];

  // Precomputed regional wind station samples
  private windStationData = WIND_STATIONS.map((st) => ({
    ...st,
    sample: sampleWindAt(st.lat, st.lon),
  }));

  // State synced from React
  private latestFlights: Flight[] = [];
  private selectedFlightId: string | null = null;
  private hoveredFlightId: string | null = null;
  private statusFilter: StatusFilter = 'SEMUA';
  private mapStyle: MapStyleId = 'jalan';
  private showRoutes = true;
  private showWeather = true;
  private showAirportLabels = true;
  private followSelected = false;
  private tilt3D = true;

  // Hit-testing caches rebuilt every draw frame
  private screenFlightHits: ScreenFlightHit[] = [];
  private screenAirportHits: ScreenAirportHit[] = [];

  // Lifecycle & loop
  private width = 1;
  private height = 1;
  private dpr = 1;
  private rafId = 0;
  private lastFrameMs = 0;
  private lastLabelEmitMs = 0;
  private lastHoverSampleMs = 0;
  private reticleAngle = 0;
  private disposed = false;
  private pointerDownPos = { x: 0, y: 0 };

  private handleResizeBound: () => void;
  private handlePointerMoveBound: (e: PointerEvent) => void;
  private handlePointerDownBound: (e: PointerEvent) => void;
  private handlePointerUpBound: (e: PointerEvent) => void;
  private handlePointerLeaveBound: () => void;

  constructor(container: HTMLElement, callbacks: FlightMapCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    // 1. Dedicated MapLibre GL JS container
    this.mapEl = document.createElement('div');
    this.mapEl.style.position = 'absolute';
    this.mapEl.style.inset = '0';
    this.mapEl.style.width = '100%';
    this.mapEl.style.height = '100%';
    container.appendChild(this.mapEl);

    // 2. Synchronized High-DPI Overlay Canvas (Windy heatmap + streamlines + 3D flight arcs + mini aircraft)
    this.overlayCanvas = document.createElement('canvas');
    this.overlayCanvas.style.position = 'absolute';
    this.overlayCanvas.style.inset = '0';
    this.overlayCanvas.style.width = '100%';
    this.overlayCanvas.style.height = '100%';
    this.overlayCanvas.style.pointerEvents = 'none';
    this.overlayCanvas.style.zIndex = '5';
    container.appendChild(this.overlayCanvas);
    this.ctx = this.overlayCanvas.getContext('2d')!;

    // 3. Offscreen Windy Heatmap Canvas
    this.heatmapCanvas = document.createElement('canvas');
    this.heatmapCanvas.width = GRID_W;
    this.heatmapCanvas.height = GRID_H;
    this.heatmapCtx = this.heatmapCanvas.getContext('2d')!;
    this.heatmapImageData = this.heatmapCtx.createImageData(GRID_W, GRID_H);

    // 4. Initialize MapLibre GL JS with free OpenFreeMap vector tiles, 3D buildings & native Globe projection
    this.map = new MapLibreMap({
      container: this.mapEl,
      style: getFreeMapLibreStyle(this.mapStyle),
      center: [102.35, 3.25],
      zoom: 6.4,
      pitch: 44,
      bearing: -8,
      minZoom: 1.5,
      maxZoom: 18.5,
      maxPitch: 68,
      attributionControl: false,
      pitchWithRotate: true,
      dragRotate: true,
    });

    // Native MapLibre GL JS controls (3D pitch/compass/zoom, Globe/Mercator switch, Metric Scale & Attribution)
    this.map.addControl(
      new NavigationControl({
        visualizePitch: true,
        showCompass: true,
        showZoom: true,
      }),
      'bottom-right'
    );
    this.map.addControl(new GlobeControl(), 'bottom-right');
    this.map.addControl(
      new ScaleControl({ maxWidth: 96, unit: 'metric' }),
      'bottom-right'
    );
    this.map.addControl(
      new AttributionControl({ compact: true }),
      'bottom-right'
    );

    const applyProjectionAndSky = () => {
      try {
        this.map.setProjection({ type: 'globe' });
        const isDark = this.mapStyle !== 'jalan';
        this.map.setSky({
          'sky-color': isDark ? '#050914' : '#1b365d',
          'horizon-color': isDark ? '#0f1f3a' : '#7bb8e8',
          'sky-horizon-blend': 0.55,
          'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 0.75, 7, 0],
        });
      } catch {
        // Fallback silently if style does not accept sky updates yet
      }
      this.windFieldDirty = true;
    };

    const markDirty = () => {
      this.windFieldDirty = true;
    };
    this.map.on('style.load', applyProjectionAndSky);
    this.map.on('move', markDirty);
    this.map.on('zoom', markDirty);
    this.map.on('rotate', markDirty);
    this.map.on('pitch', markDirty);
    this.map.on('load', () => {
      this.windFieldDirty = true;
      this.emitProjectedLabels();
    });

    // Cancel follow mode when user manually drags
    this.map.on('dragstart', () => {
      this.followSelected = false;
    });

    const mapCanvas = this.map.getCanvas();
    mapCanvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.callbacks.onContextLostChange?.(true);
    });
    mapCanvas.addEventListener('webglcontextrestored', () => {
      this.callbacks.onContextLostChange?.(false);
    });

    // Size overlay canvas & initialize streamlines
    this.resizeCanvas();
    this.initParticles();

    // Pointer listeners on map container (non-blocking so MapLibre drag/zoom/tilt/rotate work natively)
    this.handleResizeBound = this.resizeCanvas.bind(this);
    this.handlePointerMoveBound = this.handlePointerMove.bind(this);
    this.handlePointerDownBound = this.handlePointerDown.bind(this);
    this.handlePointerUpBound = this.handlePointerUp.bind(this);
    this.handlePointerLeaveBound = () => {
      if (this.hoveredFlightId !== null) {
        this.hoveredFlightId = null;
      }
      this.callbacks.onHoverChange(null);
    };

    window.addEventListener('resize', this.handleResizeBound);
    this.mapEl.addEventListener('pointermove', this.handlePointerMoveBound);
    this.mapEl.addEventListener('pointerdown', this.handlePointerDownBound);
    this.mapEl.addEventListener('pointerup', this.handlePointerUpBound);
    this.mapEl.addEventListener('pointerleave', this.handlePointerLeaveBound);

    this.lastFrameMs = performance.now();
    this.startLoop();
  }

  private isGlobeProjectionActive(): boolean {
    try {
      return this.map.getProjection()?.type === 'globe';
    } catch {
      return false;
    }
  }

  /**
   * Prevents far-side globe bleed-through AND behind-camera perspective projection wrap
   * when pitched (e.g. preventing distant European airports from projecting onto the Malaysia viewport).
   */
  private isGeoPointOnFrontHemisphere(lat: number, lon: number): boolean {
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    const phi1 = center.lat * DEG2RAD;
    const lam1 = center.lng * DEG2RAD;
    const phi2 = lat * DEG2RAD;
    const lam2 = lon * DEG2RAD;

    const dot = clamp(
      Math.sin(phi1) * Math.sin(phi2) +
        Math.cos(phi1) * Math.cos(phi2) * Math.cos(lam2 - lam1),
      -1,
      1
    );
    const angularDistDeg = Math.acos(dot) * RAD2DEG;
    const maxVisibleDeg = Math.min(82, 340 / Math.pow(2, zoom) + 14);
    return angularDistDeg <= maxVisibleDeg;
  }

  /**
   * Verifies that a screen pixel hits Earth's surface (not outer space around the 3D globe).
   */
  private unprojectSurface(sx: number, sy: number): { lat: number; lng: number } | null {
    const ll = this.map.unproject([sx, sy]);
    if (!ll || !Number.isFinite(ll.lat) || !Number.isFinite(ll.lng) || Math.abs(ll.lat) > 85) {
      return null;
    }
    if (this.isGlobeProjectionActive() && this.map.getZoom() < 5.5) {
      const pBack = this.map.project([ll.lng, ll.lat]);
      if (Math.hypot(pBack.x - sx, pBack.y - sy) > 10) {
        return null;
      }
    }
    return ll;
  }

  private resizeCanvas(): void {
    if (this.disposed) return;
    this.width = this.container.clientWidth || window.innerWidth;
    this.height = this.container.clientHeight || window.innerHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);

    this.overlayCanvas.width = Math.max(1, Math.floor(this.width * this.dpr));
    this.overlayCanvas.height = Math.max(1, Math.floor(this.height * this.dpr));
    this.windFieldDirty = true;
    this.map.resize();
  }

  private initParticles(): void {
    this.particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p: WindParticle = {
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        age: Math.random() * 1.8,
        maxAge: 1.1 + Math.random() * 1.4,
        trailX: new Float32Array(TRAIL_POINTS),
        trailY: new Float32Array(TRAIL_POINTS),
        trailLen: 0,
      };
      this.resetParticle(p, true);
      this.particles.push(p);
    }
  }

  private resetParticle(p: WindParticle, randomAge = false): void {
    p.x = Math.random() * this.width;
    p.y = Math.random() * this.height;
    p.maxAge = 1.0 + Math.random() * 1.5;
    p.age = randomAge ? Math.random() * p.maxAge : 0;
    p.trailLen = 1;
    p.trailX[0] = p.x;
    p.trailY[0] = p.y;
  }

  /**
   * Recomputes the screen-aligned 88x52 wind vector grid and smooth Windy heatmap image
   * whenever the map camera moves. Masks cleanly onto Earth's globe horizon in 3D Globe mode.
   */
  private rebuildWindGrid(): void {
    const data = this.heatmapImageData.data;
    const w = this.width;
    const h = this.height;
    if (w <= 2 || h <= 2) return;

    for (let gy = 0; gy < GRID_H; gy++) {
      const sy = ((gy + 0.5) / GRID_H) * h;
      for (let gx = 0; gx < GRID_W; gx++) {
        const sx = ((gx + 0.5) / GRID_W) * w;
        const idx = gy * GRID_W + gx;
        const pIdx = idx * 4;

        const ll = this.unprojectSurface(sx, sy);
        if (!ll) {
          this.gridU[idx] = 0;
          this.gridV[idx] = 0;
          this.gridSpeed[idx] = 0;
          data[pIdx] = 0;
          data[pIdx + 1] = 0;
          data[pIdx + 2] = 0;
          data[pIdx + 3] = 0;
          continue;
        }

        const { u, v } = sampleWindVector(ll.lat, ll.lng);
        const speed = Math.hypot(u, v);
        this.gridU[idx] = u;
        this.gridV[idx] = v;
        this.gridSpeed[idx] = speed;

        const [r, g, b] = windSpeedToRGB(speed);
        data[pIdx] = r;
        data[pIdx + 1] = g;
        data[pIdx + 2] = b;
        data[pIdx + 3] = 255;
      }
    }

    this.heatmapCtx.putImageData(this.heatmapImageData, 0, 0);
    this.windFieldDirty = false;
    this.lastWindGridBuildMs = performance.now();
  }

  private sampleGridWind(sx: number, sy: number): { u: number; v: number; speed: number } {
    const fx = clamp((sx / this.width) * (GRID_W - 1), 0, GRID_W - 1.001);
    const fy = clamp((sy / this.height) * (GRID_H - 1), 0, GRID_H - 1.001);
    const x0 = Math.floor(fx);
    const y0 = Math.floor(fy);
    const tx = fx - x0;
    const ty = fy - y0;

    const i00 = y0 * GRID_W + x0;
    const i10 = i00 + 1;
    const i01 = i00 + GRID_W;
    const i11 = i01 + 1;

    // Abort cleanly if any corner is in space outside the globe disc
    if (
      this.gridSpeed[i00] <= 0.01 ||
      this.gridSpeed[i10] <= 0.01 ||
      this.gridSpeed[i01] <= 0.01 ||
      this.gridSpeed[i11] <= 0.01
    ) {
      return { u: 0, v: 0, speed: 0 };
    }

    const w00 = (1 - tx) * (1 - ty);
    const w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty;
    const w11 = tx * ty;

    const u =
      this.gridU[i00] * w00 +
      this.gridU[i10] * w10 +
      this.gridU[i01] * w01 +
      this.gridU[i11] * w11;
    const v =
      this.gridV[i00] * w00 +
      this.gridV[i10] * w10 +
      this.gridV[i01] * w01 +
      this.gridV[i11] * w11;
    const speed =
      this.gridSpeed[i00] * w00 +
      this.gridSpeed[i10] * w10 +
      this.gridSpeed[i01] * w01 +
      this.gridSpeed[i11] * w11;

    return { u, v, speed };
  }

  private matchesFilter(flight: Flight): boolean {
    switch (this.statusFilter) {
      case 'SEMUA':
        return true;
      case 'MENGUDARA':
        return (
          flight.status === 'BERANGKAT' ||
          flight.status === 'MENGUDARA' ||
          flight.status === 'MENDEKAT'
        );
      case 'KEBERANGKATAN':
        return flight.status === 'TERJADWAL' || flight.status === 'BOARDING';
      case 'TERTUNDA':
        return flight.status === 'TERTUNDA' || flight.status === 'DIALIHKAN';
      case 'MENDARAT':
        return flight.status === 'MENDARAT';
    }
  }

  public syncFlights(flights: Flight[]): void {
    this.latestFlights = flights;
  }

  public setSelectedFlight(flightId: string | null, focusCamera = false): void {
    this.selectedFlightId = flightId;
    if (!flightId) {
      this.followSelected = false;
    } else if (focusCamera) {
      this.focusOnFlight(flightId);
    }
  }

  public setStatusFilter(filter: StatusFilter): void {
    this.statusFilter = filter;
  }

  public setMapStyle(styleId: MapStyleId): void {
    if (this.mapStyle === styleId) return;
    this.mapStyle = styleId;
    this.map.setStyle(getFreeMapLibreStyle(styleId));
    this.windFieldDirty = true;
  }

  public setLayerOptions(opts: {
    showRoutes?: boolean;
    showAirportLabels?: boolean;
    showWeather?: boolean;
    followSelected?: boolean;
    tilt3D?: boolean;
  }): void {
    if (opts.showRoutes !== undefined) this.showRoutes = opts.showRoutes;
    if (opts.showAirportLabels !== undefined) this.showAirportLabels = opts.showAirportLabels;
    if (opts.showWeather !== undefined) {
      this.showWeather = opts.showWeather;
      if (opts.showWeather) {
        this.windFieldDirty = true;
      }
    }
    if (opts.followSelected !== undefined) this.followSelected = opts.followSelected;
    if (opts.tilt3D !== undefined && opts.tilt3D !== this.tilt3D) {
      this.tilt3D = opts.tilt3D;
      this.map.easeTo({
        pitch: opts.tilt3D ? 52 : 0,
        bearing: opts.tilt3D ? this.map.getBearing() : 0,
        duration: 650,
      });
    }
  }

  public setCameraPreset(preset: CameraPreset): void {
    if (preset === 'IKUTI' && this.selectedFlightId) {
      this.followSelected = true;
      return;
    }

    this.followSelected = false;
    const pitchBase = this.tilt3D ? 1 : 0;

    switch (preset) {
      case 'KLIA':
        this.map.flyTo({
          center: [101.7099, 2.7456],
          zoom: 12.2,
          pitch: 56 * pitchBase,
          bearing: -16 * pitchBase,
          duration: 1150,
        });
        break;
      case 'MALAYSIA':
        this.map.flyTo({
          center: [106.4, 3.85],
          zoom: 5.5,
          pitch: 36 * pitchBase,
          bearing: 0,
          duration: 1100,
        });
        break;
      case 'ASIA_PASIFIK':
        this.map.flyTo({
          center: [109.0, 11.2],
          zoom: 3.7,
          pitch: 24 * pitchBase,
          bearing: 0,
          duration: 1150,
        });
        break;
      case 'GLOBAL':
        this.map.flyTo({
          center: [92.0, 14.0],
          zoom: 1.9,
          pitch: 0,
          bearing: 0,
          duration: 1200,
        });
        break;
      default:
        this.map.flyTo({
          center: [102.35, 3.25],
          zoom: 6.4,
          pitch: 44 * pitchBase,
          bearing: -8 * pitchBase,
          duration: 1000,
        });
        break;
    }
  }

  public focusOnFlight(flightId: string): void {
    const f = this.latestFlights.find((item) => item.id === flightId);
    if (!f) return;
    this.map.flyTo({
      center: [f.lon, f.lat],
      zoom: Math.max(this.map.getZoom(), 7.8),
      pitch: this.tilt3D ? 52 : 0,
      duration: 950,
    });
  }

  public focusOnAirport(airportCode: string): void {
    const ap = AIRPORT_MAP[airportCode];
    if (!ap) return;
    this.followSelected = false;
    this.map.flyTo({
      center: [ap.lon, ap.lat],
      zoom: airportCode === 'KUL' ? 12.8 : 10.5,
      pitch: this.tilt3D ? 56 : 0,
      duration: 1050,
    });
  }

  private hitTestScreen(x: number, y: number): { kind: 'flight' | 'airport'; id: string } | null {
    // Flights have highest click/hover priority
    let bestFlightId: string | null = null;
    let bestFlightDistSq = 19 * 19;
    for (let i = 0; i < this.screenFlightHits.length; i++) {
      const h = this.screenFlightHits[i];
      const dx = h.x - x;
      const dy = h.y - y;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestFlightDistSq) {
        bestFlightDistSq = dSq;
        bestFlightId = h.id;
      }
    }
    if (bestFlightId) return { kind: 'flight', id: bestFlightId };

    // Airport beacons next
    let bestAirportCode: string | null = null;
    let bestAirportDistSq = 15 * 15;
    for (let i = 0; i < this.screenAirportHits.length; i++) {
      const a = this.screenAirportHits[i];
      const dx = a.x - x;
      const dy = a.y - y;
      const dSq = dx * dx + dy * dy;
      if (dSq < bestAirportDistSq) {
        bestAirportDistSq = dSq;
        bestAirportCode = a.code;
      }
    }
    if (bestAirportCode) return { kind: 'airport', id: bestAirportCode };

    return null;
  }

  private handlePointerDown(e: PointerEvent): void {
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
  }

  private handlePointerUp(e: PointerEvent): void {
    // Ignore clicks on native MapLibre controls
    const target = e.target as HTMLElement | null;
    if (target?.closest('.maplibregl-ctrl')) return;

    const dx = e.clientX - this.pointerDownPos.x;
    const dy = e.clientY - this.pointerDownPos.y;
    if (dx * dx + dy * dy > 36) return;

    const rect = this.mapEl.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;

    const hit = this.hitTestScreen(lx, ly);
    if (hit) {
      if (hit.kind === 'flight') {
        this.callbacks.onPinWindProbe(null);
        this.callbacks.onSelectFlight(hit.id);
        this.focusOnFlight(hit.id);
        return;
      }
      if (hit.kind === 'airport') {
        this.focusOnAirport(hit.id);
        return;
      }
    }

    // Pin detailed surface weather card when Cuaca overlay is enabled
    if (this.showWeather) {
      const ll = this.unprojectSurface(lx, ly);
      if (ll) {
        const sample = sampleWindAt(ll.lat, ll.lng);
        this.callbacks.onSelectFlight(null);
        this.callbacks.onPinWindProbe({
          lat: ll.lat,
          lon: ll.lng,
          speedKmh: sample.speedKmh,
          speedKts: sample.speedKts,
          flowAngleDeg: sample.flowAngleDeg,
          fromCardinal: sample.fromCardinal,
          tempC: sample.tempC,
          pressureHpa: sample.pressureHpa,
          rainMmHr: sample.rainMmHr,
          condition: sample.condition,
        });
      }
    }
  }

  private handlePointerMove(e: PointerEvent): void {
    const target = e.target as HTMLElement | null;
    if (target?.closest('.maplibregl-ctrl')) {
      this.callbacks.onHoverChange(null);
      return;
    }

    const now = performance.now();
    if (now - this.lastHoverSampleMs < 35) return;
    this.lastHoverSampleMs = now;

    const rect = this.mapEl.getBoundingClientRect();
    const lx = e.clientX - rect.left;
    const ly = e.clientY - rect.top;

    const hit = this.hitTestScreen(lx, ly);
    if (hit) {
      this.mapEl.style.cursor = 'pointer';
      this.hoveredFlightId = hit.kind === 'flight' ? hit.id : null;
      this.callbacks.onHoverChange({
        kind: hit.kind,
        id: hit.id,
        screenX: e.clientX,
        screenY: e.clientY,
      });
      return;
    }

    this.hoveredFlightId = null;

    if (this.showWeather) {
      const ll = this.unprojectSurface(lx, ly);
      if (ll) {
        this.mapEl.style.cursor = 'crosshair';
        const sample = sampleWindAt(ll.lat, ll.lng);
        this.callbacks.onHoverChange({
          kind: 'wind_probe',
          id: 'surface',
          screenX: e.clientX,
          screenY: e.clientY,
          lat: ll.lat,
          lon: ll.lng,
          wind: sample,
        });
        return;
      }
    }

    this.mapEl.style.cursor = 'grab';
    this.callbacks.onHoverChange(null);
  }

  private drawWindLayer(delta: number): void {
    const ctx = this.ctx;
    const now = performance.now();

    // Throttle wind grid rebuild slightly during continuous drag so panning stays silky 60fps
    if (this.windFieldDirty && now - this.lastWindGridBuildMs > 55) {
      this.rebuildWindGrid();
    }

    // 1. Draw smooth Windy-style meteorological surface heatmap over the vector map
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.globalAlpha =
      this.mapStyle === 'radar' ? 0.44 : this.mapStyle === 'satelit' ? 0.36 : 0.38;
    ctx.drawImage(this.heatmapCanvas, 0, 0, this.width, this.height);
    ctx.restore();

    // 2. Advect & render 560 silky flowing white wind streamlines
    const bearingRad = (this.map.getBearing() * Math.PI) / 180;
    const pitchCos = Math.cos(((this.map.getPitch() * Math.PI) / 180) * 0.65);
    const cosB = Math.cos(-bearingRad);
    const sinB = Math.sin(-bearingRad);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.35;

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.age += delta;

      if (
        p.age >= p.maxAge ||
        p.x < -12 ||
        p.x > this.width + 12 ||
        p.y < -12 ||
        p.y > this.height + 12
      ) {
        this.resetParticle(p, false);
        continue;
      }

      const { u, v, speed } = this.sampleGridWind(p.x, p.y);
      if (speed < 0.5) {
        this.resetParticle(p, false);
        continue;
      }

      const rawDx = u;
      const rawDy = -v;
      const rotX = rawDx * cosB - rawDy * sinB;
      const rotY = (rawDx * sinB + rawDy * cosB) * pitchCos;

      const stepScale = (1.6 + Math.min(speed, 58) * 0.042) * delta * 1.45;
      p.x += rotX * stepScale;
      p.y += rotY * stepScale;

      const nextLen = Math.min(p.trailLen + 1, TRAIL_POINTS);
      for (let t = nextLen - 1; t > 0; t--) {
        p.trailX[t] = p.trailX[t - 1];
        p.trailY[t] = p.trailY[t - 1];
      }
      p.trailX[0] = p.x;
      p.trailY[0] = p.y;
      p.trailLen = nextLen;

      if (p.trailLen < 2) continue;

      const lifeT = p.age / p.maxAge;
      const fadeEnvelope = Math.sin(Math.PI * lifeT);
      const speedBoost = clamp(0.45 + speed / 48, 0.45, 1.0);
      const baseAlpha = fadeEnvelope * speedBoost * 0.86;
      if (baseAlpha < 0.04) continue;

      const tailIdx = p.trailLen - 1;
      const grad = ctx.createLinearGradient(
        p.trailX[0],
        p.trailY[0],
        p.trailX[tailIdx],
        p.trailY[tailIdx]
      );
      grad.addColorStop(0, `rgba(255, 255, 255, ${baseAlpha.toFixed(3)})`);
      grad.addColorStop(0.55, `rgba(226, 245, 255, ${(baseAlpha * 0.48).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(226, 245, 255, 0)');

      ctx.strokeStyle = grad;
      ctx.beginPath();
      ctx.moveTo(p.trailX[0], p.trailY[0]);
      for (let t = 1; t < p.trailLen; t++) {
        ctx.lineTo(p.trailX[t], p.trailY[t]);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawAirportBeacons(): void {
    const ctx = this.ctx;
    const zoom = this.map.getZoom();
    this.screenAirportHits = [];

    ctx.save();
    for (let i = 0; i < AIRPORTS.length; i++) {
      const ap = AIRPORTS[i];
      const isKlia = ap.code === 'KUL';
      const isMy = ap.region === 'MALAYSIA';

      if (
        zoom < 3.6 &&
        !isMy &&
        !['SIN', 'HND', 'DXB', 'LHR', 'SYD', 'JFK', 'SFO'].includes(ap.code)
      ) {
        continue;
      }

      if (!this.isGeoPointOnFrontHemisphere(ap.lat, ap.lon)) continue;

      const pt = this.map.project([ap.lon, ap.lat]);
      if (pt.x < -30 || pt.x > this.width + 30 || pt.y < -30 || pt.y > this.height + 30) {
        continue;
      }

      this.screenAirportHits.push({ code: ap.code, x: pt.x, y: pt.y });

      if (isKlia) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 13, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.65)';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 7.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.28)';
        ctx.fill();
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#fef3c7';
        ctx.fill();
      } else if (isMy) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(14, 165, 233, 0.24)';
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.3;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#e0f2fe';
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.88)';
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private getAltitudeLiftPx(t: number, distanceKm: number, pitchDeg: number, zoom: number): number {
    const pitchFactor = Math.sin(pitchDeg * DEG2RAD) * 0.92 + 0.16;
    const zoomFactor = clamp(0.55 + (zoom - 2) * 0.12, 0.5, 1.45);
    const maxLift = clamp(24 + (distanceKm / 14000) * 62, 24, 88) * pitchFactor * zoomFactor;
    const curve = Math.pow(Math.sin(Math.PI * clamp(t, 0, 1)), 0.72);
    return curve * maxLift;
  }

  private drawFlightsAndArcs(): void {
    const ctx = this.ctx;
    const zoom = this.map.getZoom();
    const pitch = this.map.getPitch();
    this.screenFlightHits = [];

    const isLightBase = this.mapStyle === 'jalan' && !this.showWeather;

    const visibleFlights: Flight[] = [];
    for (let i = 0; i < this.latestFlights.length; i++) {
      const f = this.latestFlights[i];
      if (this.matchesFilter(f)) visibleFlights.push(f);
    }

    // Pass 1: 3D-elevated geodesic route arcs & active status contrails
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < visibleFlights.length; i++) {
      const f = visibleFlights[i];
      const orig = AIRPORT_MAP[f.origin];
      const dest = AIRPORT_MAP[f.destination];
      if (!orig || !dest) continue;

      const isSelected = f.id === this.selectedFlightId;
      const isHovered = f.id === this.hoveredFlightId;
      const drawArc = this.showRoutes || isSelected || isHovered;
      if (!drawArc) continue;

      const tNow = clamp(f.progress, 0.002, 0.998);
      const statusColor = STATUS_META[f.status].colorHex;

      // Ground shadow track for selected/hovered flight
      if (isSelected || isHovered) {
        ctx.beginPath();
        let prevX = 0;
        let hasStart = false;
        for (let s = 0; s <= ARC_SEGMENTS; s++) {
          const st = s / ARC_SEGMENTS;
          const geo = interpolateGreatCircle(orig.lat, orig.lon, dest.lat, dest.lon, st);
          if (!this.isGeoPointOnFrontHemisphere(geo.lat, geo.lon)) {
            hasStart = false;
            continue;
          }
          const pt = this.map.project([geo.lon, geo.lat]);
          if (!hasStart || Math.abs(pt.x - prevX) > this.width * 0.5) {
            ctx.moveTo(pt.x, pt.y);
            hasStart = true;
          } else {
            ctx.lineTo(pt.x, pt.y);
          }
          prevX = pt.x;
        }
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.38)';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Full planned elevated 3D geodesic arc
      ctx.beginPath();
      let prevX = 0;
      let started = false;
      for (let s = 0; s <= ARC_SEGMENTS; s++) {
        const st = s / ARC_SEGMENTS;
        const geo = interpolateGreatCircle(orig.lat, orig.lon, dest.lat, dest.lon, st);
        if (!this.isGeoPointOnFrontHemisphere(geo.lat, geo.lon)) {
          started = false;
          continue;
        }
        const pt = this.map.project([geo.lon, geo.lat]);
        const lift = this.getAltitudeLiftPx(st, f.distanceKm, pitch, zoom);
        const sy = pt.y - lift;
        if (!started || Math.abs(pt.x - prevX) > this.width * 0.5) {
          ctx.moveTo(pt.x, sy);
          started = true;
        } else {
          ctx.lineTo(pt.x, sy);
        }
        prevX = pt.x;
      }
      ctx.strokeStyle = isSelected
        ? statusColor
        : f.status === 'TERTUNDA'
        ? 'rgba(245, 158, 11, 0.48)'
        : isLightBase
        ? 'rgba(2, 132, 199, 0.36)'
        : 'rgba(56, 189, 248, 0.28)';
      ctx.lineWidth = isSelected ? 2.2 : isHovered ? 1.7 : 1.05;
      ctx.stroke();

      // Active completed contrail
      if (tNow > 0.01) {
        const steps = Math.max(4, Math.floor(tNow * ARC_SEGMENTS));
        ctx.beginPath();
        let trailPrevX = 0;
        let trailStarted = false;
        for (let s = 0; s <= steps; s++) {
          const st = (s / steps) * tNow;
          const geo = interpolateGreatCircle(orig.lat, orig.lon, dest.lat, dest.lon, st);
          if (!this.isGeoPointOnFrontHemisphere(geo.lat, geo.lon)) {
            trailStarted = false;
            continue;
          }
          const pt = this.map.project([geo.lon, geo.lat]);
          const lift = this.getAltitudeLiftPx(st, f.distanceKm, pitch, zoom);
          const sy = pt.y - lift;
          if (!trailStarted || Math.abs(pt.x - trailPrevX) > this.width * 0.5) {
            ctx.moveTo(pt.x, sy);
            trailStarted = true;
          } else {
            ctx.lineTo(pt.x, sy);
          }
          trailPrevX = pt.x;
        }
        ctx.strokeStyle = isSelected ? '#ffffff' : statusColor;
        ctx.globalAlpha = isSelected ? 0.95 : isHovered ? 0.88 : 0.74;
        ctx.lineWidth = isSelected ? 2.6 : isHovered ? 2.0 : 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();

    // Pass 2: Ground shadows, 3D altitude drop-stems, and compact 3D-shaded mini airliners
    visibleFlights.sort((a, b) => {
      const aPri = a.id === this.selectedFlightId ? 2 : a.id === this.hoveredFlightId ? 1 : 0;
      const bPri = b.id === this.selectedFlightId ? 2 : b.id === this.hoveredFlightId ? 1 : 0;
      return aPri - bPri;
    });

    for (let i = 0; i < visibleFlights.length; i++) {
      const f = visibleFlights[i];
      const orig = AIRPORT_MAP[f.origin];
      const dest = AIRPORT_MAP[f.destination];
      if (!orig || !dest) continue;

      const t = clamp(f.progress, 0.002, 0.998);
      const tNext = Math.min(0.9995, t + 0.01);

      const gPos = interpolateGreatCircle(orig.lat, orig.lon, dest.lat, dest.lon, t);
      if (!this.isGeoPointOnFrontHemisphere(gPos.lat, gPos.lon)) continue;

      const gNext = interpolateGreatCircle(orig.lat, orig.lon, dest.lat, dest.lon, tNext);

      const pGround = this.map.project([gPos.lon, gPos.lat]);
      const pNextGround = this.map.project([gNext.lon, gNext.lat]);

      if (
        pGround.x < -50 ||
        pGround.x > this.width + 50 ||
        pGround.y < -60 ||
        pGround.y > this.height + 90
      ) {
        continue;
      }

      const lift = this.getAltitudeLiftPx(t, f.distanceKm, pitch, zoom);
      const nextLift = this.getAltitudeLiftPx(tNext, f.distanceKm, pitch, zoom);

      const ax = pGround.x;
      const ay = pGround.y - lift;
      const nx = pNextGround.x;
      const ny = pNextGround.y - nextLift;

      const screenHeading = Math.atan2(ny - ay, nx - ax) + Math.PI / 2;
      const isSelected = f.id === this.selectedFlightId;
      const isHovered = f.id === this.hoveredFlightId;

      this.screenFlightHits.push({ id: f.id, x: ax, y: ay });

      const scale = isSelected ? 1.22 : isHovered ? 1.06 : 0.82;

      // 1. Vertical 3D altitude drop-stem & ground contact shadow
      if (lift > 5) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(ax, ay + 4);
        ctx.lineTo(pGround.x, pGround.y);
        ctx.strokeStyle = isSelected
          ? 'rgba(56, 189, 248, 0.72)'
          : isLightBase
          ? 'rgba(15, 23, 42, 0.25)'
          : 'rgba(148, 163, 184, 0.30)';
        ctx.lineWidth = isSelected ? 1.2 : 0.8;
        ctx.stroke();

        ctx.translate(pGround.x, pGround.y);
        ctx.rotate(screenHeading);
        ctx.scale(scale * 0.72, scale * 0.72);
        this.traceAirlinerSilhouette(ctx);
        ctx.fillStyle = 'rgba(2, 6, 23, 0.30)';
        ctx.fill();
        ctx.restore();
      }

      // 2. Selection / Hover rotating target reticle
      if (isSelected || isHovered) {
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(this.reticleAngle);
        ctx.beginPath();
        ctx.arc(0, 0, isSelected ? 17 : 13, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(125, 211, 252, 0.8)';
        ctx.lineWidth = isSelected ? 1.8 : 1.2;
        ctx.setLineDash([5, 4]);
        ctx.stroke();
        ctx.restore();
      }

      // 3. Detailed compact 3D-shaded mini airliner
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(screenHeading);
      ctx.scale(scale, scale);

      this.traceAirlinerSilhouette(ctx);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = 'rgba(2, 6, 23, 0.80)';
      ctx.stroke();

      const bodyGrad = ctx.createLinearGradient(-9, -8, 9, 8);
      if (f.status === 'TERTUNDA') {
        bodyGrad.addColorStop(0, '#fef3c7');
        bodyGrad.addColorStop(0.55, '#fbbf24');
        bodyGrad.addColorStop(1, '#d97706');
      } else {
        bodyGrad.addColorStop(0, '#ffffff');
        bodyGrad.addColorStop(0.55, '#e2e8f0');
        bodyGrad.addColorStop(1, '#94a3b8');
      }
      ctx.fillStyle = bodyGrad;
      ctx.fill();

      // Airline livery tailfin
      ctx.fillStyle = f.airlineColor || '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, 4.5);
      ctx.lineTo(-4.2, 8.8);
      ctx.lineTo(4.2, 8.8);
      ctx.closePath();
      ctx.fill();

      // Spine highlight
      ctx.beginPath();
      ctx.moveTo(0, -8.5);
      ctx.lineTo(0, 6.2);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.lineWidth = 0.9;
      ctx.stroke();

      // Wingtip navigation lights
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(-9.2, 1.8, 0.95, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(9.2, 1.8, 0.95, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  private traceAirlinerSilhouette(ctx: CanvasRenderingContext2D): void {
    ctx.beginPath();
    ctx.moveTo(0, -9.8);
    ctx.quadraticCurveTo(1.5, -7.2, 1.45, -2.8);
    ctx.lineTo(9.4, 1.5);
    ctx.lineTo(9.2, 2.9);
    ctx.lineTo(1.55, 1.3);
    ctx.lineTo(1.25, 6.1);
    ctx.lineTo(4.3, 8.3);
    ctx.lineTo(4.1, 9.3);
    ctx.lineTo(0, 8.1);
    ctx.lineTo(-4.1, 9.3);
    ctx.lineTo(-4.3, 8.3);
    ctx.lineTo(-1.25, 6.1);
    ctx.lineTo(-1.55, 1.3);
    ctx.lineTo(-9.2, 2.9);
    ctx.lineTo(-9.4, 1.5);
    ctx.lineTo(-1.45, -2.8);
    ctx.quadraticCurveTo(-1.5, -7.2, 0, -9.8);
    ctx.closePath();
  }

  private emitProjectedLabels(): void {
    const zoom = this.map.getZoom();
    const pitch = this.map.getPitch();
    const labels: ProjectedLabel[] = [];
    const windStations: ProjectedWindStation[] = [];

    // 1. Airport labels
    if (this.showAirportLabels) {
      for (let i = 0; i < AIRPORTS.length; i++) {
        const ap = AIRPORTS[i];
        const isMy = ap.region === 'MALAYSIA';
        if (
          zoom < 4.2 &&
          !isMy &&
          !['SIN', 'HND', 'DXB', 'LHR', 'SYD', 'JFK', 'SFO'].includes(ap.code)
        ) {
          continue;
        }
        if (!this.isGeoPointOnFrontHemisphere(ap.lat, ap.lon)) continue;

        const pt = this.map.project([ap.lon, ap.lat]);
        if (pt.x < 42 || pt.x > this.width - 42 || pt.y < 58 || pt.y > this.height - 96) {
          continue;
        }
        labels.push({
          id: `ap-${ap.code}`,
          code: ap.code === 'KUL' ? 'KLIA (KUL)' : ap.code,
          subtitle: ap.city,
          x: pt.x,
          y: pt.y,
          visible: true,
          kind: 'airport',
        });
      }
    }

    // 2. Windy-style city wind chips (speed + directional arrow) when Cuaca is active
    if (this.showWeather && zoom >= 3.6 && zoom <= 9.8) {
      for (let i = 0; i < this.windStationData.length; i++) {
        const st = this.windStationData[i];
        if (zoom < 4.7 && st.region !== 'MY_CORE') continue;
        if (!this.isGeoPointOnFrontHemisphere(st.lat, st.lon)) continue;

        const pt = this.map.project([st.lon, st.lat]);
        if (pt.x < 64 || pt.x > this.width - 64 || pt.y < 68 || pt.y > this.height - 175) {
          continue;
        }
        windStations.push({
          id: st.id,
          name: st.name,
          x: pt.x,
          y: pt.y,
          speedKmh: st.sample.speedKmh,
          flowAngleDeg: st.sample.flowAngleDeg,
          fromCardinal: st.sample.fromCardinal,
          lat: st.lat,
          lon: st.lon,
        });
      }
    }

    // 3. Selected flight floating callsign tag at elevated 3D screen position
    if (this.selectedFlightId) {
      const f = this.latestFlights.find((item) => item.id === this.selectedFlightId);
      if (f && this.matchesFilter(f)) {
        const orig = AIRPORT_MAP[f.origin];
        const dest = AIRPORT_MAP[f.destination];
        if (orig && dest) {
          const t = clamp(f.progress, 0.002, 0.998);
          const geo = interpolateGreatCircle(orig.lat, orig.lon, dest.lat, dest.lon, t);
          if (this.isGeoPointOnFrontHemisphere(geo.lat, geo.lon)) {
            const pt = this.map.project([geo.lon, geo.lat]);
            const lift = this.getAltitudeLiftPx(t, f.distanceKm, pitch, zoom);
            const sx = pt.x;
            const sy = pt.y - lift;
            if (sx > 24 && sx < this.width - 24 && sy > 48 && sy < this.height - 64) {
              labels.push({
                id: `fl-${f.id}`,
                code: f.flightNumber,
                subtitle: `${f.origin} → ${f.destination}`,
                x: sx,
                y: sy,
                visible: true,
                kind: 'flight',
                status: f.status,
              });
            }
          }
        }
      }
    }

    this.callbacks.onLabelsUpdate(labels, windStations);
  }

  private startLoop(): void {
    const tick = (now: number) => {
      if (this.disposed) return;

      const delta = Math.min((now - this.lastFrameMs) / 1000, 0.08);
      this.lastFrameMs = now;
      this.reticleAngle += delta * 1.15;

      // Smooth follow mode for selected aircraft
      if (this.followSelected && this.selectedFlightId) {
        const f = this.latestFlights.find((item) => item.id === this.selectedFlightId);
        if (f) {
          const center = this.map.getCenter();
          const nextLng = center.lng + (f.lon - center.lng) * Math.min(1, delta * 3.5);
          const nextLat = center.lat + (f.lat - center.lat) * Math.min(1, delta * 3.5);
          this.map.setCenter([nextLng, nextLat]);
        }
      }

      // Render high-DPI overlay canvas
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);

      if (this.showWeather) {
        this.drawWindLayer(delta);
      }
      this.drawAirportBeacons();
      this.drawFlightsAndArcs();

      // Emit projected 2D DOM badges at ~20 fps
      if (now - this.lastLabelEmitMs > 50) {
        this.lastLabelEmitMs = now;
        this.emitProjectedLabels();
      }

      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);

    window.removeEventListener('resize', this.handleResizeBound);
    this.mapEl.removeEventListener('pointermove', this.handlePointerMoveBound);
    this.mapEl.removeEventListener('pointerdown', this.handlePointerDownBound);
    this.mapEl.removeEventListener('pointerup', this.handlePointerUpBound);
    this.mapEl.removeEventListener('pointerleave', this.handlePointerLeaveBound);

    this.map.remove();
    if (this.overlayCanvas.parentNode === this.container) {
      this.container.removeChild(this.overlayCanvas);
    }
    if (this.mapEl.parentNode === this.container) {
      this.container.removeChild(this.mapEl);
    }
  }
}
