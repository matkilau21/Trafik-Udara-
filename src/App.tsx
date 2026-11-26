import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Map as MapIcon, X } from 'lucide-react';
import { BottomDock } from './components/BottomDock';
import { FlightsDrawer, NotificationsDrawer } from './components/Drawers';
import { FlightInspector } from './components/FlightInspector';
import { NotificationToasts } from './components/NotificationToasts';
import { TopBar } from './components/TopBar';
import { AIRPORT_MAP } from './data/airports';
import { useFlightSimulation } from './hooks/useFlightSimulation';
import { FlightMapScene, HoverPayload } from './map/FlightMapScene';
import {
  CameraPreset,
  MapStyleId,
  PinnedWindProbe,
  ProjectedLabel,
  ProjectedWindStation,
  STATUS_META,
  StatusFilter,
} from './types/flight';
import { unlockAudioContext } from './utils/audioChime';

const MAP_STYLES: Array<{ id: MapStyleId; label: string }> = [
  { id: 'jalan', label: 'Jalan' },
  { id: 'radar', label: 'Gelap' },
  { id: 'satelit', label: 'Satelit' },
];

function getStationChipBg(speedKmh: number): string {
  if (speedKmh >= 34) return 'bg-[#c4f06c] text-slate-950';
  if (speedKmh >= 24) return 'bg-[#5eead4] text-slate-950';
  if (speedKmh >= 15) return 'bg-[#7dd3fc] text-slate-950';
  return 'bg-[#a5b4fc] text-slate-950';
}

export default function App() {
  const {
    flights,
    trafficHistory,
    notifications,
    activeToasts,
    unreadCount,
    watchedIds,
    isPlaying,
    setIsPlaying,
    speedMultiplier,
    setSpeedMultiplier,
    soundEnabled,
    setSoundEnabled,
    desktopAlertsEnabled,
    toggleDesktopAlerts,
    notificationScope,
    setNotificationScope,
    toggleWatchFlight,
    dismissToast,
    markAllNotificationsRead,
    clearNotifications,
    triggerFlightStatusUpdate,
  } = useFlightSimulation();

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const sceneRef = useRef<FlightMapScene | null>(null);

  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [pinnedWindProbe, setPinnedWindProbe] = useState<PinnedWindProbe | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<HoverPayload | null>(null);
  const [projectedLabels, setProjectedLabels] = useState<ProjectedLabel[]>([]);
  const [windStations, setWindStations] = useState<ProjectedWindStation[]>([]);
  const [contextLost, setContextLost] = useState(false);

  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('MALAYSIA');
  const [mapStyle, setMapStyle] = useState<MapStyleId>('jalan');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('SEMUA');
  const [showRoutes, setShowRoutes] = useState(true);
  const [showWeather, setShowWeather] = useState(true);
  const [showAirportLabels, setShowAirportLabels] = useState(true);
  const [tilt3D, setTilt3D] = useState(true);
  const [followSelected, setFollowSelected] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showStats, setShowStats] = useState(true);
  const [activeDrawer, setActiveDrawer] = useState<'flights' | 'notifications' | null>(null);

  // Unlock Web Audio API cleanly on first user interaction
  useEffect(() => {
    const unlock = () => unlockAudioContext();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Initialize free high-detail MapLibre GL + 3D flight & Windy overlay scene
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const mapScene = new FlightMapScene(container, {
      onSelectFlight: (id) => {
        setSelectedFlightId(id);
        setFollowSelected(false);
      },
      onPinWindProbe: (probe) => {
        setPinnedWindProbe(probe);
      },
      onHoverChange: (hover) => {
        setHoveredTarget(hover);
      },
      onLabelsUpdate: (labels, stations) => {
        setProjectedLabels(labels);
        setWindStations(stations);
      },
      onContextLostChange: (lost) => {
        setContextLost(lost);
      },
    });

    sceneRef.current = mapScene;

    return () => {
      mapScene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Sync real-time flight positions & statuses into map scene
  useEffect(() => {
    sceneRef.current?.syncFlights(flights);
  }, [flights]);

  // Sync selected flight highlight
  useEffect(() => {
    sceneRef.current?.setSelectedFlight(selectedFlightId, false);
  }, [selectedFlightId]);

  // Sync status filter
  useEffect(() => {
    sceneRef.current?.setStatusFilter(statusFilter);
  }, [statusFilter]);

  // Sync free open-source basemap style (CARTO Voyager / Dark Matter / Esri Satellite)
  useEffect(() => {
    sceneRef.current?.setMapStyle(mapStyle);
  }, [mapStyle]);

  // Sync layer & 3D perspective options
  useEffect(() => {
    sceneRef.current?.setLayerOptions({
      showRoutes,
      showWeather,
      showAirportLabels,
      tilt3D,
      followSelected,
    });
  }, [showRoutes, showWeather, showAirportLabels, tilt3D, followSelected]);

  // Keyboard shortcuts: H = collapse/expand HUD, Space = play/pause, Escape = close drawers/deselect
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDockCollapsed((prev) => !prev);
      } else if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (activeDrawer) {
          setActiveDrawer(null);
        } else if (selectedFlightId) {
          setSelectedFlightId(null);
          setFollowSelected(false);
        } else if (pinnedWindProbe) {
          setPinnedWindProbe(null);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeDrawer, selectedFlightId, pinnedWindProbe, setIsPlaying]);

  const handleSelectCameraPreset = useCallback((preset: CameraPreset) => {
    setCameraPreset(preset);
    if (preset === 'IKUTI') {
      setFollowSelected(true);
    } else {
      setFollowSelected(false);
    }
    sceneRef.current?.setCameraPreset(preset);
  }, []);

  const handleFocusFlight = useCallback((flightId: string) => {
    setPinnedWindProbe(null);
    setSelectedFlightId(flightId);
    setFollowSelected(false);
    sceneRef.current?.setSelectedFlight(flightId, true);
  }, []);

  const handleToggleDrawer = useCallback(
    (drawer: 'flights' | 'notifications') => {
      setActiveDrawer((prev) => {
        const next = prev === drawer ? null : drawer;
        if (next === 'notifications') {
          markAllNotificationsRead();
        }
        return next;
      });
    },
    [markAllNotificationsRead]
  );

  const selectedFlight = useMemo(
    () => flights.find((f) => f.id === selectedFlightId) ?? null,
    [flights, selectedFlightId]
  );

  const hoveredFlight = useMemo(
    () =>
      hoveredTarget?.kind === 'flight'
        ? flights.find((f) => f.id === hoveredTarget.id) ?? null
        : null,
    [flights, hoveredTarget]
  );

  const hoveredAirport = useMemo(
    () =>
      hoveredTarget?.kind === 'airport'
        ? AIRPORT_MAP[hoveredTarget.id] ?? null
        : null,
    [hoveredTarget]
  );

  const hoveredWind =
    hoveredTarget?.kind === 'wind_probe' ? hoveredTarget.wind ?? null : null;

  const testFlightId = selectedFlightId ?? flights[0]?.id ?? null;
  const liftAboveStats = showStats && !dockCollapsed;

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#050811] select-none">
      {/* Dedicated Isolated 3D WebGL Canvas Mount */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Visualisasi Glob 3D Penjejak Penerbangan Masa Nyata KLIA"
      />

      {/* WebGL Context Lost Fallback */}
      {contextLost && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#050811]/95 px-6">
          <div className="max-w-sm rounded-xl bg-[#0a101d] border border-white/12 p-5 text-center">
            <h1 className="text-base font-semibold text-white">
              Konteks WebGL 3D Terhenti
            </h1>
            <p className="mt-2 text-xs text-slate-400 leading-relaxed">
              Memulihkan paparan glob 3D secara automatik. Muat semula halaman sekiranya paparan masih tidak muncul.
            </p>
          </div>
        </div>
      )}

      {/* Projected 3D Airport Labels, Selected Flight Tag & Windy-Style City Wind Readouts */}
      <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
        {/* Windy-style regional city wind markers (speed + flow arrow) */}
        {showWeather &&
          windStations.map((st) => (
            <div
              key={st.id}
              className="absolute flex flex-col items-center"
              style={{
                transform: `translate3d(${st.x}px, ${st.y}px, 0) translate(-50%, -50%)`,
              }}
            >
              <span className="text-[11px] font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)] whitespace-nowrap leading-tight">
                {st.name}
              </span>
              <span
                className={`mt-0.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono-tabular font-bold leading-none shadow-md ${getStationChipBg(
                  st.speedKmh
                )}`}
              >
                <span>{st.speedKmh}</span>
                <ArrowUp
                  className="w-2.5 h-2.5 stroke-[2.75]"
                  style={{ transform: `rotate(${st.flowAngleDeg}deg)` }}
                  aria-hidden="true"
                />
              </span>
            </div>
          ))}

        {/* Airport & Selected Flight Labels */}
        {projectedLabels.map((lbl) =>
          lbl.kind === 'airport' ? (
            <div
              key={lbl.id}
              className="absolute -translate-x-1/2 -translate-y-full pb-2"
              style={{
                transform: `translate3d(${lbl.x}px, ${lbl.y - (showWeather ? 12 : 4)}px, 0) translate(-50%, -100%)`,
              }}
            >
              <div
                className={`px-1.5 py-0.5 rounded font-mono-tabular font-semibold tracking-wide whitespace-nowrap shadow-md ${
                  lbl.id === 'ap-KUL'
                    ? 'bg-[#0a101d]/90 border border-amber-400/55 text-[11px] text-amber-300'
                    : 'bg-[#0a101d]/82 border border-white/12 text-[10px] text-sky-200'
                }`}
              >
                {lbl.code}
              </div>
            </div>
          ) : (
            <div
              key={lbl.id}
              className="absolute"
              style={{
                transform: `translate3d(${lbl.x}px, ${lbl.y - 22}px, 0) translate(-50%, -100%)`,
              }}
            >
              <div className="px-2 py-0.5 rounded bg-[#0a101d]/94 border border-sky-400/55 text-[11px] font-mono-tabular font-semibold text-white whitespace-nowrap shadow-lg">
                {lbl.code} · {lbl.subtitle}
              </div>
            </div>
          )
        )}
      </div>

      {/* Windy-Style Live Hover Callout (Flight, Airport, or Surface Wind Probe) */}
      {hoveredTarget && (hoveredFlight || hoveredAirport || hoveredWind) && (
        <>
          {hoveredWind ? (
            <div
              className="fixed z-30 pointer-events-none flex flex-col items-center"
              style={{
                left: hoveredTarget.screenX,
                top: hoveredTarget.screenY - 14,
                transform: 'translate(-50%, -100%)',
              }}
            >
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#1c212c]/96 border border-white/15 shadow-xl text-xs font-semibold text-white whitespace-nowrap">
                <span className="font-mono-tabular">{hoveredWind.speedKmh} km/h</span>
                <span
                  className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-300/80"
                  aria-hidden="true"
                >
                  <ArrowUp
                    className="w-2.5 h-2.5 text-white stroke-[2.5]"
                    style={{ transform: `rotate(${hoveredWind.flowAngleDeg}deg)` }}
                  />
                </span>
                <span className="font-mono-tabular text-slate-200">
                  {hoveredWind.fromCardinal}
                </span>
              </div>
              <div
                className="w-2 h-2 bg-[#1c212c] border-r border-b border-white/15 rotate-45 -mt-1"
                aria-hidden="true"
              />
            </div>
          ) : (
            <div
              className="fixed z-30 pointer-events-none px-3 py-2 rounded-lg bg-[#0a101d]/96 border border-white/15 shadow-xl text-xs max-w-[260px]"
              style={{
                left: Math.min(hoveredTarget.screenX + 14, window.innerWidth - 270),
                top: Math.max(hoveredTarget.screenY - 12, 60),
              }}
            >
              {hoveredFlight && (
                <div>
                  <div className="flex items-center gap-2 font-mono-tabular">
                    <span className="font-bold text-white">{hoveredFlight.flightNumber}</span>
                    <span className={STATUS_META[hoveredFlight.status].textClass}>
                      {STATUS_META[hoveredFlight.status].label}
                    </span>
                  </div>
                  <div className="mt-0.5 text-slate-300">
                    {hoveredFlight.airline} · {hoveredFlight.origin} → {hoveredFlight.destination}
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono-tabular text-slate-400">
                    {hoveredFlight.altitudeFt > 0
                      ? `${hoveredFlight.altitudeFt.toLocaleString('ms-MY')} ft · ${hoveredFlight.speedKts} kts`
                      : 'Di darat · Klik untuk butiran'}
                  </div>
                </div>
              )}

              {hoveredAirport && (
                <div>
                  <div className="font-mono-tabular font-bold text-white">
                    {hoveredAirport.code === 'KUL' ? 'KLIA (KUL)' : hoveredAirport.code} · {hoveredAirport.city}
                  </div>
                  <div className="mt-0.5 text-slate-300">{hoveredAirport.name}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">
                    {hoveredAirport.country} · Klik untuk fokus
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Slim Top Navigation & Live Summary HUD */}
      <TopBar
        flights={flights}
        unreadCount={unreadCount}
        soundEnabled={soundEnabled}
        activeDrawer={activeDrawer}
        onToggleDrawer={handleToggleDrawer}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
      />

      {/* Top-Left Compact Map Style Switcher (100% Free Open Maps) & Wind Legend */}
      <div className="fixed top-16 left-4 sm:left-6 z-20 flex flex-col gap-2 pointer-events-none">
        <div className="pointer-events-auto inline-flex items-center gap-1 p-1 rounded-lg bg-[#0a101d]/92 border border-white/10 shadow-lg w-fit">
          <MapIcon className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-0.5 shrink-0" aria-hidden="true" />
          {MAP_STYLES.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => setMapStyle(st.id)}
              className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                mapStyle === st.id
                  ? 'bg-sky-500 text-slate-950 font-semibold'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>

        {showWeather && (
          <div className="pointer-events-auto rounded-lg bg-[#0a101d]/92 border border-white/10 px-3 py-2 w-[212px] shadow-lg">
            <div className="flex items-center justify-between text-[10px] text-slate-300 font-medium mb-1">
              <span>Kelajuan Angin</span>
              <span className="font-mono-tabular text-slate-400">km/h</span>
            </div>
            <div
              className="h-2 w-full rounded-full"
              style={{
                background:
                  'linear-gradient(90deg, #4a34a8 0%, #594cc6 18%, #447ad6 34%, #40bada 52%, #6ce0b6 68%, #c4f06c 84%, #f8ce4a 94%, #f98048 100%)',
              }}
              aria-hidden="true"
            />
            <div className="mt-1 flex items-center justify-between text-[10px] font-mono-tabular text-slate-400">
              <span>0</span>
              <span>15</span>
              <span>30</span>
              <span>45</span>
              <span>60+</span>
            </div>
          </div>
        )}
      </div>

      {/* Automatic Real-Time Schedule Change Toast Notifications */}
      {activeDrawer === null && (
        <NotificationToasts
          toasts={activeToasts}
          onDismiss={dismissToast}
          onFocusFlight={handleFocusFlight}
        />
      )}

      {/* Contextual Bottom-Left Selected Flight Inspector */}
      <FlightInspector
        flight={selectedFlight}
        isWatched={selectedFlight ? watchedIds.has(selectedFlight.id) : false}
        isFollowing={followSelected}
        liftAboveStats={liftAboveStats}
        onClose={() => {
          setSelectedFlightId(null);
          setFollowSelected(false);
        }}
        onToggleWatch={toggleWatchFlight}
        onToggleFollow={() => {
          setFollowSelected((prev) => {
            const next = !prev;
            setCameraPreset(next ? 'IKUTI' : 'KLIA');
            return next;
          });
        }}
        onSimulateStatusChange={triggerFlightStatusUpdate}
      />

      {/* Contextual Bottom-Left Pinned Surface Wind & Weather Probe */}
      {!selectedFlight && pinnedWindProbe && (
        <section
          aria-label="Bacaan cuaca titik permukaan"
          className={`fixed left-4 sm:left-6 z-20 w-[min(310px,calc(100vw-2rem))] rounded-xl bg-[#0a101d]/95 border border-white/12 p-3.5 shadow-2xl shadow-black/60 transition-all duration-200 ${
            liftAboveStats ? 'bottom-[216px]' : 'bottom-24'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-mono-tabular text-slate-400">
                {pinnedWindProbe.lat.toFixed(2)}°, {pinnedWindProbe.lon.toFixed(2)}° ·{' '}
                <span className="text-teal-300">{pinnedWindProbe.condition}</span>
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-lg font-bold text-white font-mono-tabular">
                  {pinnedWindProbe.speedKmh} km/h
                </span>
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-white/30">
                  <ArrowUp
                    className="w-3 h-3 text-teal-300 stroke-[2.5]"
                    style={{ transform: `rotate(${pinnedWindProbe.flowAngleDeg}deg)` }}
                    aria-hidden="true"
                  />
                </span>
                <span className="text-sm font-mono-tabular text-slate-200">
                  {pinnedWindProbe.fromCardinal}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPinnedWindProbe(null)}
              aria-label="Tutup bacaan cuaca"
              className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 pt-2.5 border-t border-white/8 grid grid-cols-3 gap-2 font-mono-tabular">
            <div>
              <div className="text-[10px] text-slate-400">Suhu</div>
              <div className="text-xs font-semibold text-slate-100 mt-0.5">
                {pinnedWindProbe.tempC}°C
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Tekanan</div>
              <div className="text-xs font-semibold text-slate-100 mt-0.5">
                {pinnedWindProbe.pressureHpa} hPa
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Hujan</div>
              <div className="text-xs font-semibold text-slate-100 mt-0.5">
                {pinnedWindProbe.rainMmHr > 0
                  ? `${pinnedWindProbe.rainMmHr} mm/j`
                  : '0 mm/j'}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* On-Demand Slide-Over Drawers */}
      <FlightsDrawer
        open={activeDrawer === 'flights'}
        flights={flights}
        selectedFlightId={selectedFlightId}
        watchedIds={watchedIds}
        onClose={() => setActiveDrawer(null)}
        onSelectFlight={(id) => {
          handleFocusFlight(id);
          setActiveDrawer(null);
        }}
        onToggleWatch={toggleWatchFlight}
      />

      <NotificationsDrawer
        open={activeDrawer === 'notifications'}
        notifications={notifications}
        notificationScope={notificationScope}
        desktopAlertsEnabled={desktopAlertsEnabled}
        sampleFlightId={testFlightId}
        onClose={() => setActiveDrawer(null)}
        onChangeScope={setNotificationScope}
        onToggleDesktopAlerts={toggleDesktopAlerts}
        onMarkAllRead={markAllNotificationsRead}
        onClearAll={clearNotifications}
        onFocusFlight={(id) => {
          handleFocusFlight(id);
          setActiveDrawer(null);
        }}
        onTriggerTestUpdate={triggerFlightStatusUpdate}
      />

      {/* Collapsible Unified Bottom Control Dock */}
      <BottomDock
        collapsed={dockCollapsed}
        onToggleCollapsed={() => setDockCollapsed((prev) => !prev)}
        showStats={showStats}
        onToggleStats={() => setShowStats((prev) => !prev)}
        trafficHistory={trafficHistory}
        flights={flights}
        cameraPreset={cameraPreset}
        onSelectCameraPreset={handleSelectCameraPreset}
        hasSelectedFlight={selectedFlightId !== null}
        statusFilter={statusFilter}
        onSelectStatusFilter={setStatusFilter}
        isPlaying={isPlaying}
        onTogglePlaying={() => setIsPlaying((prev) => !prev)}
        speedMultiplier={speedMultiplier}
        onSelectSpeed={setSpeedMultiplier}
        showRoutes={showRoutes}
        onToggleRoutes={() => setShowRoutes((prev) => !prev)}
        showWeather={showWeather}
        onToggleWeather={() => {
          setShowWeather((prev) => {
            const next = !prev;
            if (!next) setPinnedWindProbe(null);
            return next;
          });
        }}
        showAirportLabels={showAirportLabels}
        onToggleAirportLabels={() => setShowAirportLabels((prev) => !prev)}
        tilt3D={tilt3D}
        onToggleTilt3D={() => setTilt3D((prev) => !prev)}
      />
    </main>
  );
}
