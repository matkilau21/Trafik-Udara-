import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { AIRPORTS, AIRPORT_MAP } from '../data/airports';
import {
  CameraPreset,
  Flight,
  ProjectedLabel,
  STATUS_META,
  StatusFilter,
} from '../types/flight';
import { GLOBE_RADIUS, getFlightArcPoint, latLonToVector3 } from '../utils/geoMath';
import {
  AircraftMeshBundle,
  SharedAircraftGeometries,
  buildAircraftGroup,
  createSharedAircraftGeometries,
} from './aircraftBuilder';
import { ProceduralEarthTextures, createProceduralEarthTextures } from './earthTexture';

// Pre-allocated module-scope scratch objects (zero GC in render loop)
const _vPos = new THREE.Vector3();
const _vNext = new THREE.Vector3();
const _vUp = new THREE.Vector3();
const _vForward = new THREE.Vector3();
const _vRight = new THREE.Vector3();
const _vCamDir = new THREE.Vector3();
const _vTargetPos = new THREE.Vector3();
const _vProj = new THREE.Vector3();
const _mBasis = new THREE.Matrix4();
const _qTarget = new THREE.Quaternion();
const _mouse = new THREE.Vector2();
const _colorScratch = new THREE.Color();

const ARC_SEGMENTS = 48;

export interface HoverPayload {
  kind: 'flight' | 'airport';
  id: string;
  screenX: number;
  screenY: number;
}

export interface FlightGlobeCallbacks {
  onSelectFlight: (flightId: string | null) => void;
  onHoverChange: (hover: HoverPayload | null) => void;
  onLabelsUpdate: (labels: ProjectedLabel[]) => void;
  onContextLostChange?: (lost: boolean) => void;
}

interface FlightVisualEntry {
  aircraft: AircraftMeshBundle;
  routeLine: THREE.Line;
  routeMaterial: THREE.LineBasicMaterial;
  trailLine: THREE.Line;
  trailGeometry: THREE.BufferGeometry;
  trailPositions: Float32Array;
  trailMaterial: THREE.LineBasicMaterial;
  origin: string;
  destination: string;
}

function detectSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createStarSpriteTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.28, 'rgba(219, 234, 254, 0.8)');
  grad.addColorStop(0.65, 'rgba(148, 163, 184, 0.15)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class FlightGlobeScene {
  private container: HTMLElement;
  private callbacks: FlightGlobeCallbacks;
  private isSoftwareGl: boolean;

  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private raycaster: THREE.Raycaster;
  private clock: THREE.Clock;

  private earthTextures: ProceduralEarthTextures;
  private sharedAircraftGeoms: SharedAircraftGeometries;
  private starTexture: THREE.CanvasTexture;
  private cloudMesh: THREE.Mesh;

  private flightEntries = new Map<string, FlightVisualEntry>();
  private airportHitMeshes: THREE.Mesh[] = [];
  private airportPositions = new Map<string, THREE.Vector3>();
  private allHitMeshes: THREE.Object3D[] = [];

  private latestFlights: Flight[] = [];
  private selectedFlightId: string | null = null;
  private hoveredFlightId: string | null = null;
  private statusFilter: StatusFilter = 'SEMUA';
  private showRoutes = true;
  private showAirportLabels = true;
  private autoRotate = false;
  private followSelected = false;

  // Smooth camera transition state
  private cameraTransitionActive = false;
  private desiredCamPos = new THREE.Vector3();
  private desiredTarget = new THREE.Vector3(0, 0, 0);

  private frameId = 0;
  private disposed = false;
  private contextLost = false;
  private lastRaycastTime = 0;
  private lastLabelEmitTime = 0;
  private pointerDownPos = { x: 0, y: 0 };

  private handleResizeBound: () => void;
  private handlePointerMoveBound: (e: PointerEvent) => void;
  private handlePointerDownBound: (e: PointerEvent) => void;
  private handlePointerUpBound: (e: PointerEvent) => void;
  private handleContextLostBound: (e: Event) => void;
  private handleContextRestoredBound: () => void;

  constructor(container: HTMLElement, callbacks: FlightGlobeCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();
    this.clock = new THREE.Clock();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#050811');
    this.scene.fog = new THREE.FogExp2('#050811', 0.0055);

    // Camera framed directly on KLIA (Kuala Lumpur International Airport) corridor
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 300);
    latLonToVector3(2.7456, 101.7099, 17.6, this.camera.position);
    this.camera.lookAt(0, 0, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);

    // Studio Environment Reflections (PMREM RoomEnvironment on all devices)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // Balanced 3-Point Space & Solar Lighting (warm sun key + cool hemisphere fill + sky rim)
    const hemiLight = new THREE.HemisphereLight('#93c5fd', '#0f172a', 1.15);
    this.scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fff7ed', 2.1);
    sunLight.position.set(24, 14, 28);
    this.scene.add(sunLight);

    const rimLight = new THREE.DirectionalLight('#38bdf8', 0.95);
    rimLight.position.set(-22, -10, -24);
    this.scene.add(rimLight);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan = false;
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 13.0;
    this.controls.maxDistance = 42.0;
    this.controls.rotateSpeed = 0.65;
    this.controls.zoomSpeed = 0.85;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.35;

    // Cancel scripted camera move whenever user manually drags/zooms
    this.controls.addEventListener('start', () => {
      this.cameraTransitionActive = false;
      this.followSelected = false;
    });

    // Raycaster strictly targeting Layer 1 (flight & airport hit proxies)
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.set(1);

    // Procedural Textures & Shared Geometries
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.earthTextures = createProceduralEarthTextures(maxAniso);
    this.sharedAircraftGeoms = createSharedAircraftGeometries();
    this.starTexture = createStarSpriteTexture();

    // Build World Objects
    this.buildStarfield();
    this.cloudMesh = this.buildEarthAndAtmosphere();
    this.buildAirportBeacons();

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Event bindings
    this.handleResizeBound = this.handleResize.bind(this);
    this.handlePointerMoveBound = this.handlePointerMove.bind(this);
    this.handlePointerDownBound = this.handlePointerDown.bind(this);
    this.handlePointerUpBound = this.handlePointerUp.bind(this);
    this.handleContextLostBound = (e: Event) => {
      e.preventDefault();
      this.contextLost = true;
      this.callbacks.onContextLostChange?.(true);
    };
    this.handleContextRestoredBound = () => {
      this.contextLost = false;
      this.callbacks.onContextLostChange?.(false);
    };

    window.addEventListener('resize', this.handleResizeBound);
    const dom = this.renderer.domElement;
    dom.addEventListener('pointermove', this.handlePointerMoveBound);
    dom.addEventListener('pointerdown', this.handlePointerDownBound);
    dom.addEventListener('pointerup', this.handlePointerUpBound);
    dom.addEventListener('webglcontextlost', this.handleContextLostBound);
    dom.addEventListener('webglcontextrestored', this.handleContextRestoredBound);

    this.startLoop();
  }

  private buildStarfield(): void {
    const count = 900;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      // Deterministic Fibonacci-ish distribution on deep outer sphere (radius 75-130)
      const u = ((i * 2654435761) % 10000) / 10000;
      const v = ((i * 1597334677) % 10000) / 10000;
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const r = 75 + ((i * 73) % 55);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.cos(phi);
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);

      const tint = i % 5 === 0 ? 0xbae6fd : i % 7 === 0 ? 0xfef3c7 : 0xe2e8f0;
      _colorScratch.setHex(tint);
      const brightness = 0.45 + ((i * 31) % 55) / 100;
      colors[i * 3] = _colorScratch.r * brightness;
      colors[i * 3 + 1] = _colorScratch.g * brightness;
      colors[i * 3 + 2] = _colorScratch.b * brightness;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.72,
      map: this.starTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    const stars = new THREE.Points(geo, mat);
    this.scene.add(stars);
  }

  private buildEarthAndAtmosphere(): THREE.Mesh {
    // 1. Primary Earth Sphere (PBR MeshStandardMaterial with Albedo + Roughness + Night City Emissive)
    const earthGeo = new THREE.SphereGeometry(GLOBE_RADIUS, 72, 48);
    const earthMat = new THREE.MeshStandardMaterial({
      map: this.earthTextures.albedoMap,
      roughnessMap: this.earthTextures.roughnessMap,
      roughness: 0.92,
      metalness: 0.15,
      emissiveMap: this.earthTextures.emissiveMap,
      emissive: new THREE.Color('#fde68a'),
      emissiveIntensity: 0.78,
    });
    const earthMesh = new THREE.Mesh(earthGeo, earthMat);
    earthMesh.name = 'earth-globe';
    this.scene.add(earthMesh);

    // 2. Subtle Elevated Atmospheric Cloud Layer
    const cloudGeo = new THREE.SphereGeometry(GLOBE_RADIUS + 0.09, 48, 32);
    const cloudMat = new THREE.MeshStandardMaterial({
      map: this.earthTextures.cloudMap,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      roughness: 0.9,
      metalness: 0.0,
    });
    const cloudMesh = new THREE.Mesh(cloudGeo, cloudMat);
    cloudMesh.renderOrder = 2;
    this.scene.add(cloudMesh);

    // 3. Fresnel Atmospheric Halo Shell (GLSL ShaderMaterial)
    const atmoGeo = new THREE.SphereGeometry(GLOBE_RADIUS * 1.075, 64, 48);
    const atmoMat = new THREE.ShaderMaterial({
      uniforms: {
        glowColor: { value: new THREE.Color('#38bdf8') },
      },
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vViewDir = normalize(-mvPosition.xyz);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 glowColor;
        varying vec3 vNormal;
        varying vec3 vViewDir;
        void main() {
          float rim = pow(0.66 - dot(vNormal, vViewDir), 3.6);
          float alpha = clamp(rim * 0.95, 0.0, 0.85);
          gl_FragColor = vec4(glowColor, alpha);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
    });
    const atmoMesh = new THREE.Mesh(atmoGeo, atmoMat);
    atmoMesh.renderOrder = 1;
    this.scene.add(atmoMesh);

    // 4. Subtle Equatorial Coordinate Ring for Aerospace Instrument Feel
    const ringGeo = new THREE.RingGeometry(GLOBE_RADIUS + 0.25, GLOBE_RADIUS + 0.27, 128);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.12,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const eqRing = new THREE.Mesh(ringGeo, ringMat);
    this.scene.add(eqRing);

    return cloudMesh;
  }

  private buildAirportBeacons(): void {
    const baseRingGeo = new THREE.RingGeometry(0.09, 0.14, 20);
    baseRingGeo.rotateX(-Math.PI / 2);
    const kliaOuterRingGeo = new THREE.RingGeometry(0.19, 0.25, 32);
    kliaOuterRingGeo.rotateX(-Math.PI / 2);
    const pylonGeo = new THREE.CylinderGeometry(0.014, 0.032, 0.22, 8);
    pylonGeo.translate(0, 0.11, 0);
    const kliaPylonGeo = new THREE.CylinderGeometry(0.02, 0.044, 0.36, 10);
    kliaPylonGeo.translate(0, 0.18, 0);
    const capGeo = new THREE.SphereGeometry(0.038, 10, 10);
    capGeo.translate(0, 0.23, 0);
    const kliaCapGeo = new THREE.SphereGeometry(0.058, 12, 12);
    kliaCapGeo.translate(0, 0.37, 0);
    const hitGeo = new THREE.SphereGeometry(0.32, 8, 8);

    const kliaRingMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    const myRingMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    const intlRingMat = new THREE.MeshBasicMaterial({
      color: 0x94a3b8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const kliaPylonMat = new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      metalness: 0.65,
      roughness: 0.25,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.65,
    });
    const pylonMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      metalness: 0.6,
      roughness: 0.3,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
    });
    const capKliaMat = new THREE.MeshBasicMaterial({ color: 0xfcd34d });
    const capMyMat = new THREE.MeshBasicMaterial({ color: 0x7dd3fc });
    const capIntlMat = new THREE.MeshBasicMaterial({ color: 0xe2e8f0 });
    const hitMat = new THREE.MeshBasicMaterial({ visible: false });

    const upAxis = new THREE.Vector3(0, 1, 0);

    AIRPORTS.forEach((airport) => {
      const pos = latLonToVector3(airport.lat, airport.lon, GLOBE_RADIUS + 0.015);
      this.airportPositions.set(airport.code, pos.clone());

      const group = new THREE.Group();
      group.position.copy(pos);

      const normal = pos.clone().normalize();
      group.quaternion.setFromUnitVectors(upAxis, normal);

      const isKlia = airport.code === 'KUL';
      const isMalaysia = airport.region === 'MALAYSIA';

      const ring = new THREE.Mesh(
        baseRingGeo,
        isKlia ? kliaRingMat : isMalaysia ? myRingMat : intlRingMat
      );
      const pylon = new THREE.Mesh(
        isKlia ? kliaPylonGeo : pylonGeo,
        isKlia ? kliaPylonMat : pylonMat
      );
      const cap = new THREE.Mesh(
        isKlia ? kliaCapGeo : capGeo,
        isKlia ? capKliaMat : isMalaysia ? capMyMat : capIntlMat
      );

      if (isKlia) {
        const outerRing = new THREE.Mesh(kliaOuterRingGeo, kliaRingMat);
        group.add(outerRing);
      }

      const hit = new THREE.Mesh(hitGeo, hitMat);
      hit.layers.set(1);
      hit.userData = { kind: 'airport', id: airport.code };
      this.airportHitMeshes.push(hit);

      group.add(ring, pylon, cap, hit);
      this.scene.add(group);
    });

    this.rebuildHitList();
  }

  private rebuildHitList(): void {
    const list: THREE.Object3D[] = [];
    this.flightEntries.forEach((entry) => {
      if (entry.aircraft.group.visible) {
        list.push(entry.aircraft.hitMesh);
      }
    });
    list.push(...this.airportHitMeshes);
    this.allHitMeshes = list;
  }

  private ensureFlightEntry(flight: Flight): FlightVisualEntry {
    const existing = this.flightEntries.get(flight.id);
    if (
      existing &&
      existing.origin === flight.origin &&
      existing.destination === flight.destination
    ) {
      return existing;
    }

    if (existing) {
      this.removeFlightEntry(flight.id);
    }

    const orig = AIRPORT_MAP[flight.origin];
    const dest = AIRPORT_MAP[flight.destination];

    // 1. Composite 9-part 3D aircraft
    const aircraft = buildAircraftGroup(
      flight.id,
      flight.airlineColor,
      this.sharedAircraftGeoms
    );
    this.scene.add(aircraft.group);

    // 2. Full planned geodesic arc line
    const fullPositions = new Float32Array((ARC_SEGMENTS + 1) * 3);
    for (let i = 0; i <= ARC_SEGMENTS; i++) {
      const t = i / ARC_SEGMENTS;
      getFlightArcPoint(
        orig.lat,
        orig.lon,
        dest.lat,
        dest.lon,
        t,
        flight.distanceKm,
        _vPos
      );
      fullPositions[i * 3] = _vPos.x;
      fullPositions[i * 3 + 1] = _vPos.y;
      fullPositions[i * 3 + 2] = _vPos.z;
    }
    const routeGeo = new THREE.BufferGeometry();
    routeGeo.setAttribute('position', new THREE.BufferAttribute(fullPositions, 3));
    const routeMaterial = new THREE.LineBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    });
    const routeLine = new THREE.Line(routeGeo, routeMaterial);
    this.scene.add(routeLine);

    // 3. Active completed contrail line
    const trailPositions = new Float32Array((ARC_SEGMENTS + 1) * 3);
    const trailGeometry = new THREE.BufferGeometry();
    trailGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(trailPositions, 3)
    );
    trailGeometry.setDrawRange(0, 0);
    const trailMaterial = new THREE.LineBasicMaterial({
      color: STATUS_META[flight.status].threeColor,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const trailLine = new THREE.Line(trailGeometry, trailMaterial);
    this.scene.add(trailLine);

    const entry: FlightVisualEntry = {
      aircraft,
      routeLine,
      routeMaterial,
      trailLine,
      trailGeometry,
      trailPositions,
      trailMaterial,
      origin: flight.origin,
      destination: flight.destination,
    };

    this.flightEntries.set(flight.id, entry);
    this.rebuildHitList();
    return entry;
  }

  private removeFlightEntry(flightId: string): void {
    const entry = this.flightEntries.get(flightId);
    if (!entry) return;
    this.scene.remove(entry.aircraft.group);
    entry.aircraft.disposeMaterials();
    this.scene.remove(entry.routeLine);
    entry.routeLine.geometry.dispose();
    entry.routeMaterial.dispose();
    this.scene.remove(entry.trailLine);
    entry.trailGeometry.dispose();
    entry.trailMaterial.dispose();
    this.flightEntries.delete(flightId);
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

  /**
   * Synchronizes React flight state into the 3D WebGL scene cleanly without rebuilding the canvas.
   */
  public syncFlights(flights: Flight[]): void {
    this.latestFlights = flights;

    let hitListChanged = false;

    for (let i = 0; i < flights.length; i++) {
      const f = flights[i];
      const entry = this.ensureFlightEntry(f);
      const visible = this.matchesFilter(f);

      if (entry.aircraft.group.visible !== visible) {
        entry.aircraft.group.visible = visible;
        hitListChanged = true;
      }

      const isSelected = f.id === this.selectedFlightId;
      const isHovered = f.id === this.hoveredFlightId;

      entry.routeLine.visible = visible && (this.showRoutes || isSelected || isHovered);
      entry.trailLine.visible = visible && (this.showRoutes || isSelected || isHovered);

      if (!visible) continue;

      const orig = AIRPORT_MAP[f.origin];
      const dest = AIRPORT_MAP[f.destination];

      // Place aircraft on geodesic arc
      const t = THREE.MathUtils.clamp(f.progress, 0.002, 0.998);
      const tNext = Math.min(0.9995, t + 0.008);

      getFlightArcPoint(
        orig.lat,
        orig.lon,
        dest.lat,
        dest.lon,
        t,
        f.distanceKm,
        _vPos
      );
      getFlightArcPoint(
        orig.lat,
        orig.lon,
        dest.lat,
        dest.lon,
        tNext,
        f.distanceKm,
        _vNext
      );

      entry.aircraft.group.position.copy(_vPos);

      // Compute tangent-aligned orthonormal basis: +Y radial out, +Z travel forward
      _vUp.copy(_vPos).normalize();
      _vForward.subVectors(_vNext, _vPos);
      if (_vForward.lengthSq() < 1e-8) {
        _vForward.set(0, 0, 1);
      } else {
        _vForward.normalize();
      }
      _vRight.crossVectors(_vUp, _vForward).normalize();
      _vForward.crossVectors(_vRight, _vUp).normalize();

      _mBasis.makeBasis(_vRight, _vUp, _vForward);
      _qTarget.setFromRotationMatrix(_mBasis);
      entry.aircraft.group.quaternion.copy(_qTarget);

      // Scale prominence for selected/hovered aircraft (sleek realistic sizing)
      const targetScale = isSelected ? 0.45 : isHovered ? 0.38 : 0.30;
      entry.aircraft.group.scale.setScalar(targetScale);
      entry.aircraft.selectionRing.visible = isSelected || isHovered;

      // Status color feedback on route & contrail
      const statusColorHex = STATUS_META[f.status].threeColor;
      entry.trailMaterial.color.setHex(isSelected ? 0xf8fafc : statusColorHex);
      entry.trailMaterial.opacity = isSelected ? 0.95 : isHovered ? 0.85 : 0.58;

      entry.routeMaterial.color.setHex(
        isSelected ? statusColorHex : f.status === 'TERTUNDA' ? 0xf59e0b : 0x38bdf8
      );
      entry.routeMaterial.opacity = isSelected ? 0.72 : isHovered ? 0.45 : 0.14;

      entry.aircraft.fuselageMaterial.emissive.setHex(
        isSelected ? 0x38bdf8 : f.status === 'TERTUNDA' ? 0xd97706 : 0x0c4a6e
      );
      entry.aircraft.fuselageMaterial.emissiveIntensity = isSelected ? 0.45 : 0.14;

      // Update completed contrail buffer up to progress t
      const trailSteps = Math.max(2, Math.floor(t * ARC_SEGMENTS));
      const posArr = entry.trailPositions;
      for (let s = 0; s <= trailSteps; s++) {
        const st = (s / trailSteps) * t;
        getFlightArcPoint(
          orig.lat,
          orig.lon,
          dest.lat,
          dest.lon,
          st,
          f.distanceKm,
          _vNext
        );
        posArr[s * 3] = _vNext.x;
        posArr[s * 3 + 1] = _vNext.y;
        posArr[s * 3 + 2] = _vNext.z;
      }
      const posAttr = entry.trailGeometry.getAttribute('position') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      entry.trailGeometry.setDrawRange(0, f.progress > 0.01 ? trailSteps + 1 : 0);
    }

    if (hitListChanged) {
      this.rebuildHitList();
    }
  }

  public setSelectedFlight(flightId: string | null, focusCamera = false): void {
    this.selectedFlightId = flightId;
    if (!flightId) {
      this.followSelected = false;
    } else if (focusCamera) {
      this.focusOnFlight(flightId);
    }
    this.syncFlights(this.latestFlights);
  }

  public setStatusFilter(filter: StatusFilter): void {
    this.statusFilter = filter;
    this.syncFlights(this.latestFlights);
  }

  public setLayerOptions(opts: {
    showRoutes?: boolean;
    showAirportLabels?: boolean;
    autoRotate?: boolean;
    followSelected?: boolean;
  }): void {
    if (opts.showRoutes !== undefined) this.showRoutes = opts.showRoutes;
    if (opts.showAirportLabels !== undefined) this.showAirportLabels = opts.showAirportLabels;
    if (opts.autoRotate !== undefined) {
      this.autoRotate = opts.autoRotate;
      this.controls.autoRotate = !this.isSoftwareGl && opts.autoRotate;
    }
    if (opts.followSelected !== undefined) {
      this.followSelected = opts.followSelected;
      if (opts.followSelected && this.selectedFlightId) {
        this.cameraTransitionActive = false;
      }
    }
    this.syncFlights(this.latestFlights);
  }

  public setCameraPreset(preset: CameraPreset): void {
    if (preset === 'IKUTI' && this.selectedFlightId) {
      this.followSelected = true;
      this.cameraTransitionActive = false;
      return;
    }

    this.followSelected = false;
    this.desiredTarget.set(0, 0, 0);

    switch (preset) {
      case 'KLIA':
        latLonToVector3(2.7456, 101.7099, 15.2, this.desiredCamPos);
        break;
      case 'MALAYSIA':
        latLonToVector3(3.8, 108.5, 19.2, this.desiredCamPos);
        break;
      case 'ASIA_PASIFIK':
        latLonToVector3(10.0, 112.0, 24.5, this.desiredCamPos);
        break;
      case 'GLOBAL':
        latLonToVector3(16.0, 82.0, 31.0, this.desiredCamPos);
        break;
      default:
        latLonToVector3(2.7456, 101.7099, 17.6, this.desiredCamPos);
        break;
    }
    this.cameraTransitionActive = true;
  }

  public focusOnFlight(flightId: string): void {
    const entry = this.flightEntries.get(flightId);
    if (!entry) return;
    _vCamDir.copy(entry.aircraft.group.position).normalize();
    this.desiredCamPos.copy(_vCamDir).multiplyScalar(17.8);
    this.desiredTarget.set(0, 0, 0);
    this.cameraTransitionActive = true;
  }

  public focusOnAirport(airportCode: string): void {
    const airport = AIRPORT_MAP[airportCode];
    if (!airport) return;
    latLonToVector3(airport.lat, airport.lon, 18.2, this.desiredCamPos);
    this.desiredTarget.set(0, 0, 0);
    this.followSelected = false;
    this.cameraTransitionActive = true;
  }

  private handleResize(): void {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  private updateMouseNDC(event: PointerEvent): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    _mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    _mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  private handlePointerDown(event: PointerEvent): void {
    this.pointerDownPos = { x: event.clientX, y: event.clientY };
  }

  private handlePointerUp(event: PointerEvent): void {
    // Distinguish genuine click from orbit drag
    const dx = event.clientX - this.pointerDownPos.x;
    const dy = event.clientY - this.pointerDownPos.y;
    if (dx * dx + dy * dy > 36) return;

    this.updateMouseNDC(event);
    this.raycaster.setFromCamera(_mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.allHitMeshes, false);

    if (hits.length > 0) {
      const { kind, id } = hits[0].object.userData as { kind: 'flight' | 'airport'; id: string };
      if (kind === 'flight') {
        this.callbacks.onSelectFlight(id);
        this.focusOnFlight(id);
        return;
      }
      if (kind === 'airport') {
        this.focusOnAirport(id);
        return;
      }
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    const now = performance.now();
    if (now - this.lastRaycastTime < 45) return;
    this.lastRaycastTime = now;

    this.updateMouseNDC(event);
    this.raycaster.setFromCamera(_mouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.allHitMeshes, false);

    if (hits.length > 0) {
      const { kind, id } = hits[0].object.userData as { kind: 'flight' | 'airport'; id: string };
      this.renderer.domElement.style.cursor = 'pointer';
      if (kind === 'flight' && this.hoveredFlightId !== id) {
        this.hoveredFlightId = id;
        this.syncFlights(this.latestFlights);
      } else if (kind !== 'flight' && this.hoveredFlightId !== null) {
        this.hoveredFlightId = null;
        this.syncFlights(this.latestFlights);
      }
      this.callbacks.onHoverChange({
        kind,
        id,
        screenX: event.clientX,
        screenY: event.clientY,
      });
    } else {
      this.renderer.domElement.style.cursor = 'grab';
      if (this.hoveredFlightId !== null) {
        this.hoveredFlightId = null;
        this.syncFlights(this.latestFlights);
      }
      this.callbacks.onHoverChange(null);
    }
  }

  private emitProjectedLabels(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    const camDist = this.camera.position.length();
    const camUnit = _vCamDir.copy(this.camera.position).normalize();

    const labels: ProjectedLabel[] = [];

    // Airport labels on front hemisphere
    if (this.showAirportLabels) {
      AIRPORTS.forEach((airport) => {
        // When zoomed far out, keep KLIA + Malaysia & key international hubs crisp
        if (
          camDist > 26 &&
          airport.region !== 'MALAYSIA' &&
          !['SIN', 'HND', 'DXB', 'LHR', 'SYD', 'JFK', 'SFO'].includes(airport.code)
        ) {
          return;
        }
        const worldPos = this.airportPositions.get(airport.code);
        if (!worldPos) return;

        // Occlusion check: only front hemisphere facing camera
        _vTargetPos.copy(worldPos).normalize();
        if (_vTargetPos.dot(camUnit) < 0.24) return;

        _vProj.copy(worldPos).project(this.camera);
        if (_vProj.z > 1) return;

        const x = ((_vProj.x + 1) / 2) * width;
        const y = ((-_vProj.y + 1) / 2) * height;
        if (x < 40 || x > width - 40 || y < 56 || y > height - 88) return;

        labels.push({
          id: `ap-${airport.code}`,
          code: airport.code === 'KUL' ? 'KLIA (KUL)' : airport.code,
          subtitle: airport.city,
          x,
          y,
          visible: true,
          kind: 'airport',
        });
      });
    }

    // Selected flight floating tag
    if (this.selectedFlightId) {
      const entry = this.flightEntries.get(this.selectedFlightId);
      const flight = this.latestFlights.find((f) => f.id === this.selectedFlightId);
      if (entry && flight && entry.aircraft.group.visible) {
        _vTargetPos.copy(entry.aircraft.group.position).normalize();
        if (_vTargetPos.dot(camUnit) > 0.05) {
          _vProj.copy(entry.aircraft.group.position).project(this.camera);
          if (_vProj.z <= 1) {
            labels.push({
              id: `fl-${flight.id}`,
              code: flight.flightNumber,
              subtitle: `${flight.origin} → ${flight.destination}`,
              x: ((_vProj.x + 1) / 2) * width,
              y: ((-_vProj.y + 1) / 2) * height,
              visible: true,
              kind: 'flight',
              status: flight.status,
            });
          }
        }
      }
    }

    this.callbacks.onLabelsUpdate(labels);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;

      const delta = Math.min(this.clock.getDelta(), 0.1);

      if (!this.contextLost) {
        // Gentle cloud atmospheric drift
        this.cloudMesh.rotation.y += delta * 0.012;

        // Smooth follow mode for selected aircraft
        if (this.followSelected && this.selectedFlightId) {
          const entry = this.flightEntries.get(this.selectedFlightId);
          if (entry && entry.aircraft.group.visible) {
            _vCamDir.copy(entry.aircraft.group.position).normalize();
            const currentDist = THREE.MathUtils.clamp(
              this.camera.position.length(),
              15.5,
              22.0
            );
            this.desiredCamPos.copy(_vCamDir).multiplyScalar(currentDist);
            this.camera.position.x = THREE.MathUtils.damp(
              this.camera.position.x,
              this.desiredCamPos.x,
              4.2,
              delta
            );
            this.camera.position.y = THREE.MathUtils.damp(
              this.camera.position.y,
              this.desiredCamPos.y,
              4.2,
              delta
            );
            this.camera.position.z = THREE.MathUtils.damp(
              this.camera.position.z,
              this.desiredCamPos.z,
              4.2,
              delta
            );
          }
        } else if (this.cameraTransitionActive) {
          this.camera.position.x = THREE.MathUtils.damp(
            this.camera.position.x,
            this.desiredCamPos.x,
            5.0,
            delta
          );
          this.camera.position.y = THREE.MathUtils.damp(
            this.camera.position.y,
            this.desiredCamPos.y,
            5.0,
            delta
          );
          this.camera.position.z = THREE.MathUtils.damp(
            this.camera.position.z,
            this.desiredCamPos.z,
            5.0,
            delta
          );
          this.controls.target.x = THREE.MathUtils.damp(
            this.controls.target.x,
            this.desiredTarget.x,
            5.0,
            delta
          );
          this.controls.target.y = THREE.MathUtils.damp(
            this.controls.target.y,
            this.desiredTarget.y,
            5.0,
            delta
          );
          this.controls.target.z = THREE.MathUtils.damp(
            this.controls.target.z,
            this.desiredTarget.z,
            5.0,
            delta
          );

          if (this.camera.position.distanceTo(this.desiredCamPos) < 0.08) {
            this.cameraTransitionActive = false;
          }
        }

        // Subtle selection halo gentle spin
        if (this.selectedFlightId) {
          const entry = this.flightEntries.get(this.selectedFlightId);
          if (entry) {
            entry.aircraft.selectionRing.rotation.z += delta * 1.1;
          }
        }

        this.controls.update();
        this.renderer.render(this.scene, this.camera);

        // Emit projected 2D labels throttled (~18 fps) for crisp DOM positioning
        const now = performance.now();
        if (now - this.lastLabelEmitTime > 55) {
          this.lastLabelEmitTime = now;
          this.emitProjectedLabels();
        }
      }

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    tick();
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.handleResizeBound);
    const dom = this.renderer.domElement;
    dom.removeEventListener('pointermove', this.handlePointerMoveBound);
    dom.removeEventListener('pointerdown', this.handlePointerDownBound);
    dom.removeEventListener('pointerup', this.handlePointerUpBound);
    dom.removeEventListener('webglcontextlost', this.handleContextLostBound);
    dom.removeEventListener('webglcontextrestored', this.handleContextRestoredBound);

    this.flightEntries.forEach((_, id) => this.removeFlightEntry(id));
    this.sharedAircraftGeoms.dispose();
    this.earthTextures.albedoMap.dispose();
    this.earthTextures.roughnessMap.dispose();
    this.earthTextures.emissiveMap.dispose();
    this.earthTextures.cloudMap.dispose();
    this.starTexture.dispose();

    this.controls.dispose();
    this.renderer.dispose();
    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
  }
}
