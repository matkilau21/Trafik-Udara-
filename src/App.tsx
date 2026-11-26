import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BottomDock } from './components/BottomDock';
import { FlightsDrawer, NotificationsDrawer } from './components/Drawers';
import { FlightInspector } from './components/FlightInspector';
import { NotificationToasts } from './components/NotificationToasts';
import { TopBar } from './components/TopBar';
import { AIRPORT_MAP } from './data/airports';
import { useFlightSimulation } from './hooks/useFlightSimulation';
import { FlightGlobeScene, HoverPayload } from './three/FlightGlobeScene';
import {
  CameraPreset,
  ProjectedLabel,
  STATUS_META,
  StatusFilter,
} from './types/flight';
import { unlockAudioContext } from './utils/audioChime';

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
  const sceneRef = useRef<FlightGlobeScene | null>(null);

  const [selectedFlightId, setSelectedFlightId] = useState<string | null>(null);
  const [hoveredTarget, setHoveredTarget] = useState<HoverPayload | null>(null);
  const [projectedLabels, setProjectedLabels] = useState<ProjectedLabel[]>([]);
  const [contextLost, setContextLost] = useState(false);

  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('KLIA');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('SEMUA');
  const [showRoutes, setShowRoutes] = useState(true);
  const [showAirportLabels, setShowAirportLabels] = useState(true);
  const [autoRotate, setAutoRotate] = useState(false);
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

  // Initialize Three.js 3D Globe Scene once inside isolated container ref
  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const globeScene = new FlightGlobeScene(container, {
      onSelectFlight: (id) => {
        setSelectedFlightId(id);
        setFollowSelected(false);
      },
      onHoverChange: (hover) => {
        setHoveredTarget(hover);
      },
      onLabelsUpdate: (labels) => {
        setProjectedLabels(labels);
      },
      onContextLostChange: (lost) => {
        setContextLost(lost);
      },
    });

    sceneRef.current = globeScene;

    return () => {
      globeScene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Sync real-time flight positions & statuses into WebGL scene
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

  // Sync 3D layer & camera follow options
  useEffect(() => {
    sceneRef.current?.setLayerOptions({
      showRoutes,
      showAirportLabels,
      autoRotate,
      followSelected,
    });
  }, [showRoutes, showAirportLabels, autoRotate, followSelected]);

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
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeDrawer, selectedFlightId, setIsPlaying]);

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

  // Sample flight ID for on-demand notification testing in the Notifications drawer
  const testFlightId = selectedFlightId ?? flights[0]?.id ?? null;

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

      {/* Projected 3D Airport & Selected Flight Labels (pointer-events-none, zero occlusion) */}
      <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
        {projectedLabels.map((lbl) =>
          lbl.kind === 'airport' ? (
            <div
              key={lbl.id}
              className="absolute -translate-x-1/2 -translate-y-full pb-2"
              style={{
                transform: `translate3d(${lbl.x}px, ${lbl.y}px, 0) translate(-50%, -100%)`,
              }}
            >
              <div
                className={`font-mono-tabular font-semibold tracking-wide drop-shadow-[0_1px_4px_rgba(0,0,0,0.98)] whitespace-nowrap ${
                  lbl.id === 'ap-KUL'
                    ? 'text-[11px] text-amber-300'
                    : 'text-[10px] text-sky-200/90'
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
                transform: `translate3d(${lbl.x}px, ${lbl.y - 18}px, 0) translate(-50%, -100%)`,
              }}
            >
              <div className="px-2 py-0.5 rounded bg-[#0a101d]/92 border border-sky-400/50 text-[11px] font-mono-tabular font-semibold text-white whitespace-nowrap shadow-lg">
                {lbl.code} · {lbl.subtitle}
              </div>
            </div>
          )
        )}
      </div>

      {/* Hover Cursor Tooltip for 3D Aircraft or Airport */}
      {hoveredTarget && (hoveredFlight || hoveredAirport) && (
        <div
          className="fixed z-30 pointer-events-none px-3 py-2 rounded-lg bg-[#0a101d]/96 border border-white/15 shadow-xl text-xs"
          style={{
            left: Math.min(hoveredTarget.screenX + 14, window.innerWidth - 230),
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

      {/* Slim Top Navigation & Live Summary HUD */}
      <TopBar
        flights={flights}
        unreadCount={unreadCount}
        soundEnabled={soundEnabled}
        activeDrawer={activeDrawer}
        onToggleDrawer={handleToggleDrawer}
        onToggleSound={() => setSoundEnabled((prev) => !prev)}
      />

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
        liftAboveStats={showStats && !dockCollapsed}
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
        showAirportLabels={showAirportLabels}
        onToggleAirportLabels={() => setShowAirportLabels((prev) => !prev)}
        autoRotate={autoRotate}
        onToggleAutoRotate={() => setAutoRotate((prev) => !prev)}
      />
    </main>
  );
}
