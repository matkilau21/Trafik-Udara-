import {
  Bell,
  BellOff,
  Crosshair,
  RefreshCw,
  X,
} from 'lucide-react';
import { AIRPORT_MAP } from '../data/airports';
import { Flight, STATUS_META } from '../types/flight';
import { formatTimeHM } from '../utils/geoMath';

interface FlightInspectorProps {
  flight: Flight | null;
  isWatched: boolean;
  isFollowing: boolean;
  liftAboveStats?: boolean;
  onClose: () => void;
  onToggleWatch: (flightId: string) => void;
  onToggleFollow: () => void;
  onSimulateStatusChange: (flightId: string) => void;
}

export function FlightInspector({
  flight,
  isWatched,
  isFollowing,
  liftAboveStats = false,
  onClose,
  onToggleWatch,
  onToggleFollow,
  onSimulateStatusChange,
}: FlightInspectorProps) {
  if (!flight) return null;

  const orig = AIRPORT_MAP[flight.origin];
  const dest = AIRPORT_MAP[flight.destination];
  const meta = STATUS_META[flight.status];
  const progressPct = Math.round(flight.progress * 100);

  return (
    <section
      aria-label={`Butiran penerbangan ${flight.flightNumber}`}
      className={`fixed left-4 sm:left-6 z-20 w-[min(340px,calc(100vw-2rem))] rounded-xl bg-[#0a101d]/95 border border-white/12 p-4 shadow-2xl shadow-black/60 transition-all duration-200 ${
        liftAboveStats ? 'bottom-[216px]' : 'bottom-24'
      }`}
    >
      {/* Header Row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold text-slate-200 truncate">{flight.airline}</span>
            <span aria-hidden="true">·</span>
            <span className={`font-medium ${meta.textClass}`}>{meta.label}</span>
          </div>
          <h2 className="mt-0.5 text-lg font-bold tracking-tight text-white font-mono-tabular">
            {flight.flightNumber}
            <span className="ml-2 text-xs font-normal text-slate-400">
              {flight.aircraftType}
            </span>
          </h2>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup panel penerbangan"
          className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Blok Laluan & Jadual */}
      <div className="mt-3.5 pt-3 border-t border-white/8">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xl font-bold text-white font-mono-tabular leading-none">
              {orig.code}
            </div>
            <div className="mt-1 text-xs text-slate-400 truncate max-w-[115px]">
              {orig.city}
            </div>
            <div className="mt-1 text-xs font-mono-tabular text-slate-200">
              ETD {formatTimeHM(flight.estimatedDepartureMs)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono-tabular">
              {flight.departureTerminal} · Pintu {flight.departureGate}
            </div>
          </div>

          <div className="flex-1 px-2 flex flex-col items-center">
            <span className="text-[11px] font-mono-tabular text-slate-400">
              {progressPct}% · {flight.distanceKm.toLocaleString('ms-MY')} km
            </span>
            <div className="mt-1.5 w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.max(3, progressPct)}%`,
                  backgroundColor: meta.colorHex,
                }}
              />
            </div>
            {flight.delayMinutes !== 0 && (
              <span
                className={`mt-1 text-[11px] font-mono-tabular ${
                  flight.delayMinutes > 0 ? 'text-amber-300' : 'text-emerald-300'
                }`}
              >
                {flight.delayMinutes > 0
                  ? `Tertangguh +${flight.delayMinutes} min`
                  : `Lebih awal ${Math.abs(flight.delayMinutes)} min`}
              </span>
            )}
          </div>

          <div className="text-right">
            <div className="text-xl font-bold text-white font-mono-tabular leading-none">
              {dest.code}
            </div>
            <div className="mt-1 text-xs text-slate-400 truncate max-w-[115px]">
              {dest.city}
            </div>
            <div className="mt-1 text-xs font-mono-tabular text-slate-200">
              ETA {formatTimeHM(flight.estimatedArrivalMs)}
            </div>
            <div className="text-[11px] text-slate-500 font-mono-tabular">
              {flight.arrivalTerminal} · Pintu {flight.arrivalGate}
            </div>
          </div>
        </div>
      </div>

      {/* Telemetri Masa Nyata */}
      <div className="mt-3.5 pt-3 border-t border-white/8 grid grid-cols-3 gap-2">
        <div>
          <div className="text-[11px] text-slate-400">Ketinggian</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-100 font-mono-tabular">
            {flight.altitudeFt > 0
              ? `${flight.altitudeFt.toLocaleString('ms-MY')} ft`
              : 'Darat'}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Kelajuan</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-100 font-mono-tabular">
            {flight.speedKts > 0 ? `${flight.speedKts} kts` : '0 kts'}
          </div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">Haluan</div>
          <div className="mt-0.5 text-sm font-semibold text-slate-100 font-mono-tabular">
            {flight.headingDeg}°
          </div>
        </div>
      </div>

      {flight.statusNote && (
        <p className="mt-2.5 text-xs text-amber-200/90 leading-relaxed">
          Nota: {flight.statusNote}
        </p>
      )}

      {/* Butang Tindakan */}
      <div className="mt-3.5 pt-3 border-t border-white/8 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleWatch(flight.id)}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
            isWatched
              ? 'bg-sky-500/20 text-sky-200 border-sky-400/40'
              : 'bg-slate-900 text-slate-300 border-white/10 hover:text-white'
          }`}
        >
          {isWatched ? (
            <>
              <Bell className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Dipantau</span>
            </>
          ) : (
            <>
              <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Pantau</span>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onToggleFollow}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
            isFollowing
              ? 'bg-sky-500 text-slate-950 border-sky-400'
              : 'bg-slate-900 text-slate-300 border-white/10 hover:text-white'
          }`}
        >
          <Crosshair className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isFollowing ? 'Mengikuti' : 'Ikuti 3D'}</span>
        </button>

        <button
          type="button"
          onClick={() => onSimulateStatusChange(flight.id)}
          title="Cetuskan perubahan status jadual seterusnya untuk menguji notifikasi automatik"
          className="inline-flex items-center justify-center px-2.5 py-2 text-xs font-medium rounded-lg bg-slate-900 text-slate-300 border border-white/10 hover:text-sky-300 hover:border-sky-400/40 transition-colors cursor-pointer shrink-0"
        >
          <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
