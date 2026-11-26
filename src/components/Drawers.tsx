import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCheck,
  CheckCircle2,
  Navigation,
  PlaneLanding,
  PlaneTakeoff,
  RefreshCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { AIRPORT_MAP } from '../data/airports';
import {
  Flight,
  NotificationScope,
  STATUS_META,
  ScheduleNotification,
} from '../types/flight';
import { formatTimeHM, formatTimeHMS } from '../utils/geoMath';

type FlightTab = 'SEMUA' | 'BERLEPAS_KLIA' | 'KETIBAAN_KLIA' | 'DIPANTAU';

interface FlightsDrawerProps {
  open: boolean;
  flights: Flight[];
  selectedFlightId: string | null;
  watchedIds: Set<string>;
  onClose: () => void;
  onSelectFlight: (flightId: string) => void;
  onToggleWatch: (flightId: string) => void;
}

export function FlightsDrawer({
  open,
  flights,
  selectedFlightId,
  watchedIds,
  onClose,
  onSelectFlight,
  onToggleWatch,
}: FlightsDrawerProps) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<FlightTab>('SEMUA');

  const filteredFlights = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flights.filter((f) => {
      if (activeTab === 'BERLEPAS_KLIA' && f.origin !== 'KUL') return false;
      if (activeTab === 'KETIBAAN_KLIA' && f.destination !== 'KUL') return false;
      if (activeTab === 'DIPANTAU' && !watchedIds.has(f.id)) return false;
      if (!q) return true;
      const orig = AIRPORT_MAP[f.origin];
      const dest = AIRPORT_MAP[f.destination];
      return (
        f.flightNumber.toLowerCase().includes(q) ||
        f.airline.toLowerCase().includes(q) ||
        f.origin.toLowerCase().includes(q) ||
        f.destination.toLowerCase().includes(q) ||
        orig.city.toLowerCase().includes(q) ||
        dest.city.toLowerCase().includes(q)
      );
    });
  }, [flights, query, activeTab, watchedIds]);

  if (!open) return null;

  return (
    <aside
      aria-label="Senarai Penerbangan KLIA"
      className="fixed top-16 right-4 sm:right-6 bottom-24 z-30 w-[min(400px,calc(100vw-2rem))] rounded-xl bg-[#0a101d]/96 border border-white/12 shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Penerbangan KLIA</h2>
          <p className="text-xs text-slate-400 font-mono-tabular">
            {filteredFlights.length} daripada {flights.length} penerbangan
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup senarai penerbangan"
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Carian & Tab KLIA */}
      <div className="px-4 py-3 border-b border-white/8 space-y-2.5">
        <div className="relative">
          <Search
            className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kod, syarikat, bandar (cth. MH, AK, BKI)..."
            className="w-full pl-8 pr-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 bg-slate-900 border border-white/10 rounded-lg focus:outline-none focus:border-sky-400"
          />
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 bg-slate-900 rounded-lg border border-white/5">
          {(
            [
              { id: 'SEMUA', label: 'Semua' },
              { id: 'BERLEPAS_KLIA', label: 'Berlepas' },
              { id: 'KETIBAAN_KLIA', label: 'Ketibaan' },
              { id: 'DIPANTAU', label: `Pantau (${watchedIds.size})` },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`py-1 px-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap truncate cursor-pointer ${
                activeTab === tab.id
                  ? tab.id === 'DIPANTAU'
                    ? 'bg-sky-500 text-slate-950'
                    : 'bg-slate-100 text-slate-950'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Senarai Penerbangan */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/6">
        {filteredFlights.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-slate-400">
            Tiada penerbangan yang sepadan dengan carian anda.
          </div>
        ) : (
          filteredFlights.map((flight) => {
            const meta = STATUS_META[flight.status];
            const isSelected = flight.id === selectedFlightId;
            const isWatched = watchedIds.has(flight.id);
            const orig = AIRPORT_MAP[flight.origin];
            const dest = AIRPORT_MAP[flight.destination];

            return (
              <div
                key={flight.id}
                className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                  isSelected ? 'bg-sky-500/12' : 'hover:bg-white/[0.04]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectFlight(flight.id)}
                  className="flex-1 min-w-0 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white font-mono-tabular">
                      {flight.flightNumber}
                    </span>
                    <span className="text-xs text-slate-400 truncate">
                      {flight.airline}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-200 font-mono-tabular">
                    <span>
                      {orig.code} ({orig.city})
                    </span>
                    <span className="text-slate-500">→</span>
                    <span>
                      {dest.code} ({dest.city})
                    </span>
                  </div>

                  <div className="mt-1 flex items-center gap-2 text-[11px] font-mono-tabular text-slate-400">
                    <span className={meta.textClass}>{meta.label}</span>
                    <span aria-hidden="true">·</span>
                    <span>ETD {formatTimeHM(flight.estimatedDepartureMs)}</span>
                    <span aria-hidden="true">·</span>
                    <span>ETA {formatTimeHM(flight.estimatedArrivalMs)}</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => onToggleWatch(flight.id)}
                  title={
                    isWatched
                      ? 'Henti memantau notifikasi penerbangan ini'
                      : 'Pantau notifikasi perubahan status penerbangan ini'
                  }
                  aria-label={isWatched ? 'Henti pantau' : 'Pantau notifikasi'}
                  className={`p-2 rounded-lg border transition-colors shrink-0 cursor-pointer ${
                    isWatched
                      ? 'bg-sky-500/15 text-sky-300 border-sky-400/30'
                      : 'bg-slate-900/70 text-slate-500 border-white/8 hover:text-slate-200'
                  }`}
                >
                  {isWatched ? (
                    <Bell className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <BellOff className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}

interface NotificationsDrawerProps {
  open: boolean;
  notifications: ScheduleNotification[];
  notificationScope: NotificationScope;
  desktopAlertsEnabled: boolean;
  sampleFlightId: string | null;
  onClose: () => void;
  onChangeScope: (scope: NotificationScope) => void;
  onToggleDesktopAlerts: () => void;
  onMarkAllRead: () => void;
  onClearAll: () => void;
  onFocusFlight: (flightId: string) => void;
  onTriggerTestUpdate: (flightId: string) => void;
}

const SCOPE_OPTIONS: Array<{ id: NotificationScope; label: string }> = [
  { id: 'SEMUA', label: 'Semua' },
  { id: 'DIPANTAU', label: 'Dipantau' },
  { id: 'GANGGUAN_DAN_TIBA', label: 'Tangguh & Tiba' },
];

export function NotificationsDrawer({
  open,
  notifications,
  notificationScope,
  desktopAlertsEnabled,
  sampleFlightId,
  onClose,
  onChangeScope,
  onToggleDesktopAlerts,
  onMarkAllRead,
  onClearAll,
  onFocusFlight,
  onTriggerTestUpdate,
}: NotificationsDrawerProps) {
  if (!open) return null;

  return (
    <aside
      aria-label="Pusat Notifikasi Jadual Penerbangan KLIA"
      className="fixed top-16 right-4 sm:right-6 bottom-24 z-30 w-[min(410px,calc(100vw-2rem))] rounded-xl bg-[#0a101d]/96 border border-white/12 shadow-2xl shadow-black/60 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-white">Notifikasi Jadual Automatik</h2>
          <p className="text-xs text-slate-400">
            Kemas kini status berlepas & ketibaan KLIA masa nyata
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup pusat notifikasi"
          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Tetapan Penapis Notifikasi */}
      <div className="px-4 py-3 border-b border-white/8 space-y-2.5">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-slate-400">Penapis amaran automatik</span>
          <div className="flex items-center gap-1 p-0.5 bg-slate-900 rounded-lg border border-white/5">
            {SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChangeScope(opt.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  notificationScope === opt.id
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-400 hover:text-slate-100'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={onToggleDesktopAlerts}
            className="text-slate-300 hover:text-white transition-colors cursor-pointer"
          >
            Notifikasi pelayar:{' '}
            <span
              className={
                desktopAlertsEnabled ? 'text-emerald-300 font-medium' : 'text-slate-500'
              }
            >
              {desktopAlertsEnabled ? 'Aktif' : 'Nyahaktif'}
            </span>
          </button>

          <div className="flex items-center gap-2">
            {sampleFlightId && (
              <button
                type="button"
                onClick={() => onTriggerTestUpdate(sampleFlightId)}
                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-sky-300 hover:text-slate-950 hover:bg-sky-400 rounded-md border border-sky-400/30 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RefreshCw className="w-3 h-3" aria-hidden="true" />
                <span>Uji Notifikasi</span>
              </button>
            )}
            {notifications.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  title="Tanda semua telah dibaca"
                  className="p-1.5 text-slate-400 hover:text-sky-300 rounded-md hover:bg-white/5 cursor-pointer"
                >
                  <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={onClearAll}
                  title="Padam sejarah notifikasi"
                  className="p-1.5 text-slate-400 hover:text-rose-300 rounded-md hover:bg-white/5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Suapan Kronologi */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/6">
        {notifications.length === 0 ? (
          <div className="px-5 py-12 text-center space-y-2">
            <p className="text-sm font-medium text-slate-200">
              Menunggu perubahan status jadual
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Setiap perubahan status berlepas (Sedang Menaiki, Berlepas, Tertangguh) serta ketibaan (Menghampiri, Telah Mendarat, kemas kini ETA) di KLIA akan dipaparkan secara automatik di sini.
            </p>
          </div>
        ) : (
          notifications.map((item) => {
            const meta = STATUS_META[item.newStatus];
            const Icon =
              item.severity === 'warning' || item.severity === 'alert'
                ? AlertTriangle
                : item.newStatus === 'MENDARAT'
                ? CheckCircle2
                : item.category === 'KEDATANGAN'
                ? PlaneLanding
                : PlaneTakeoff;

            const iconClass =
              item.severity === 'warning'
                ? 'text-amber-300'
                : item.severity === 'alert'
                ? 'text-rose-400'
                : item.severity === 'success'
                ? 'text-emerald-300'
                : 'text-sky-300';

            return (
              <div
                key={item.id}
                className={`px-4 py-3 transition-colors ${
                  item.read ? 'opacity-80' : 'bg-sky-500/[0.04]'
                } hover:bg-white/[0.04]`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconClass}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono-tabular text-slate-400">
                      <span>
                        <span className={meta.textClass}>{meta.label}</span>
                        {' · '}
                        {item.origin} → {item.destination}
                      </span>
                      <span>{formatTimeHMS(item.timestampMs)}</span>
                    </div>

                    <p className="mt-0.5 text-xs font-semibold text-slate-100">
                      {item.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                      {item.message}
                    </p>

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500">{item.airline}</span>
                      <button
                        type="button"
                        onClick={() => onFocusFlight(item.flightId)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-300 hover:text-sky-200 cursor-pointer"
                      >
                        <Navigation className="w-3 h-3" aria-hidden="true" />
                        <span>Jejak di 3D</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
}
