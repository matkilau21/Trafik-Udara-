import {
  BarChart3,
  Box,
  ChevronDown,
  ChevronUp,
  MapPin,
  Pause,
  Play,
  Route,
  Wind,
} from 'lucide-react';
import {
  CameraPreset,
  Flight,
  KliaTrafficPoint,
  StatusFilter,
} from '../types/flight';
import { KliaTrafficChart } from './KliaTrafficChart';

interface BottomDockProps {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  showStats: boolean;
  onToggleStats: () => void;
  trafficHistory: KliaTrafficPoint[];
  flights: Flight[];
  cameraPreset: CameraPreset;
  onSelectCameraPreset: (preset: CameraPreset) => void;
  hasSelectedFlight: boolean;
  statusFilter: StatusFilter;
  onSelectStatusFilter: (filter: StatusFilter) => void;
  isPlaying: boolean;
  onTogglePlaying: () => void;
  speedMultiplier: 1 | 5 | 15;
  onSelectSpeed: (speed: 1 | 5 | 15) => void;
  showRoutes: boolean;
  onToggleRoutes: () => void;
  showWeather: boolean;
  onToggleWeather: () => void;
  showAirportLabels: boolean;
  onToggleAirportLabels: () => void;
  tilt3D: boolean;
  onToggleTilt3D: () => void;
}

const CAMERA_OPTIONS: Array<{ id: CameraPreset; label: string }> = [
  { id: 'KLIA', label: 'KLIA' },
  { id: 'MALAYSIA', label: 'Malaysia' },
  { id: 'ASIA_PASIFIK', label: 'Asia-Pasifik' },
  { id: 'GLOBAL', label: 'Global' },
];

const FILTER_OPTIONS: Array<{ id: StatusFilter; label: string }> = [
  { id: 'SEMUA', label: 'Semua' },
  { id: 'MENGUDARA', label: 'Di Udara' },
  { id: 'KEBERANGKATAN', label: 'Jadual' },
  { id: 'TERTUNDA', label: 'Tertangguh' },
  { id: 'MENDARAT', label: 'Mendarat' },
];

const SPEEDS: Array<1 | 5 | 15> = [1, 5, 15];

export function BottomDock({
  collapsed,
  onToggleCollapsed,
  showStats,
  onToggleStats,
  trafficHistory,
  flights,
  cameraPreset,
  onSelectCameraPreset,
  hasSelectedFlight,
  statusFilter,
  onSelectStatusFilter,
  isPlaying,
  onTogglePlaying,
  speedMultiplier,
  onSelectSpeed,
  showRoutes,
  onToggleRoutes,
  showWeather,
  onToggleWeather,
  showAirportLabels,
  onToggleAirportLabels,
  tilt3D,
  onToggleTilt3D,
}: BottomDockProps) {
  return (
    <div
      className="fixed bottom-4 left-1/2 z-20 flex flex-col items-center transition-transform duration-200 ease-out"
      style={{
        transform: collapsed
          ? 'translate(-50%, calc(100% - 30px))'
          : 'translate(-50%, 0)',
        width: 'min(1040px, 95vw)',
      }}
    >
      {/* Tab Sembunyi / Papar */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        className="inline-flex items-center gap-1.5 px-3.5 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-[#0a101d]/94 border border-b-0 border-white/10 rounded-t-lg transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
        title="Sembunyikan atau paparkan kawalan (kekunci H)"
      >
        {collapsed ? (
          <>
            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Papar Kawalan</span>
          </>
        ) : (
          <>
            <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Sembunyikan Kawalan</span>
          </>
        )}
      </button>

      {/* Bar Kawalan Bawah Bersepadu + Panel Recharts KLIA */}
      <div className="w-full rounded-xl bg-[#0a101d]/94 border border-white/10 px-3.5 py-2.5 shadow-2xl shadow-black/50">
        {showStats && (
          <KliaTrafficChart trafficHistory={trafficHistory} flights={flights} />
        )}

        <div className="flex flex-wrap xl:flex-nowrap items-center justify-center gap-2">
          {/* Praset Kamera */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900/90 border border-white/5">
            {CAMERA_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectCameraPreset(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  cameraPreset === opt.id
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
            {hasSelectedFlight && (
              <button
                type="button"
                onClick={() => onSelectCameraPreset('IKUTI')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  cameraPreset === 'IKUTI'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-sky-300 hover:bg-sky-500/15'
                }`}
              >
                Ikuti
              </button>
            )}
          </div>

          <div className="hidden xl:block w-px h-6 bg-white/10 shrink-0" aria-hidden="true" />

          {/* Penapis Status */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900/90 border border-white/5 overflow-x-auto max-w-full">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelectStatusFilter(opt.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  statusFilter === opt.id
                    ? 'bg-slate-100 text-slate-950'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="hidden xl:block w-px h-6 bg-white/10 shrink-0" aria-hidden="true" />

          {/* Main & Kelajuan Simulasi */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-900/90 border border-white/5">
            <button
              type="button"
              onClick={onTogglePlaying}
              title={isPlaying ? 'Jeda simulasi (Space)' : 'Sambung simulasi (Space)'}
              aria-label={isPlaying ? 'Jeda simulasi' : 'Sambung simulasi'}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/5 text-slate-100 hover:bg-sky-500 hover:text-slate-950 transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              {isPlaying ? (
                <Pause className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <Play className="w-3.5 h-3.5" aria-hidden="true" />
              )}
            </button>
            {SPEEDS.map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onSelectSpeed(spd)}
                className={`px-2 py-1 text-xs font-mono-tabular font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  speedMultiplier === spd
                    ? 'bg-sky-500/20 text-sky-300'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <div className="hidden xl:block w-px h-6 bg-white/10 shrink-0" aria-hidden="true" />

          {/* Lapisan Visual 3D & Statistik */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onToggleStats}
              title="Papar atau sembunyikan carta statistik trafik KLIA"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                showStats
                  ? 'bg-sky-500/15 text-sky-200 border-sky-400/30'
                  : 'bg-slate-900/70 text-slate-400 border-white/5 hover:text-slate-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Statistik</span>
            </button>

            <button
              type="button"
              onClick={onToggleWeather}
              title="Papar peta aliran angin dan cuaca permukaan"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                showWeather
                  ? 'bg-teal-500/20 text-teal-200 border-teal-400/35'
                  : 'bg-slate-900/70 text-slate-400 border-white/5 hover:text-slate-200'
              }`}
            >
              <Wind className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Cuaca</span>
            </button>

            <button
              type="button"
              onClick={onToggleRoutes}
              title="Papar laluan penerbangan 3D"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                showRoutes
                  ? 'bg-sky-500/15 text-sky-200 border-sky-400/30'
                  : 'bg-slate-900/70 text-slate-400 border-white/5 hover:text-slate-200'
              }`}
            >
              <Route className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Laluan</span>
            </button>

            <button
              type="button"
              onClick={onToggleAirportLabels}
              title="Papar label kod lapangan terbang"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                showAirportLabels
                  ? 'bg-sky-500/15 text-sky-200 border-sky-400/30'
                  : 'bg-slate-900/70 text-slate-400 border-white/5 hover:text-slate-200'
              }`}
            >
              <MapPin className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Lapangan</span>
            </button>

            <button
              type="button"
              onClick={onToggleTilt3D}
              title={tilt3D ? 'Tukar kepada paparan rata 2D' : 'Aktifkan sudut perspektif 3D'}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                tilt3D
                  ? 'bg-sky-500/15 text-sky-200 border-sky-400/30'
                  : 'bg-slate-900/70 text-slate-400 border-white/5 hover:text-slate-200'
              }`}
            >
              <Box className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{tilt3D ? '3D' : '2D'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
