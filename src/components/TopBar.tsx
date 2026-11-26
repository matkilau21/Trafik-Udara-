import { Bell, ListFilter, Volume2, VolumeX } from 'lucide-react';
import { Flight } from '../types/flight';

interface TopBarProps {
  flights: Flight[];
  unreadCount: number;
  soundEnabled: boolean;
  activeDrawer: 'flights' | 'notifications' | null;
  onToggleDrawer: (drawer: 'flights' | 'notifications') => void;
  onToggleSound: () => void;
}

export function TopBar({
  flights,
  unreadCount,
  soundEnabled,
  activeDrawer,
  onToggleDrawer,
  onToggleSound,
}: TopBarProps) {
  const airborneCount = flights.filter(
    (f) =>
      f.status === 'BERANGKAT' ||
      f.status === 'MENGUDARA' ||
      f.status === 'MENDEKAT'
  ).length;
  const delayedCount = flights.filter(
    (f) => f.status === 'TERTUNDA' || f.status === 'DIALIHKAN'
  ).length;
  const landedCount = flights.filter((f) => f.status === 'MENDARAT').length;

  return (
    <header className="fixed top-0 inset-x-0 z-20 pointer-events-none px-4 sm:px-6 pt-3">
      <div className="mx-auto max-w-[1440px] flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="pointer-events-auto flex items-center px-3.5 py-2 rounded-lg bg-[#0a101d]/92 border border-white/10">
          <span className="text-base font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
            Aero3D
          </span>
        </div>

        {/* Zone 2: Ringkasan Armada KLIA */}
        <div className="hidden lg:flex pointer-events-auto items-center gap-3 px-4 py-2 rounded-lg bg-[#0a101d]/90 border border-white/10 text-xs text-slate-300 font-mono-tabular whitespace-nowrap">
          <span className="text-amber-300 font-semibold">KLIA</span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>
            <strong className="text-slate-100 font-semibold">{flights.length}</strong> Jumlah
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>
            <strong className="text-sky-300 font-semibold">{airborneCount}</strong> Di Udara
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>
            <strong className="text-amber-300 font-semibold">{delayedCount}</strong> Tertangguh
          </span>
          <span className="text-slate-600" aria-hidden="true">·</span>
          <span>
            <strong className="text-emerald-300 font-semibold">{landedCount}</strong> Mendarat
          </span>
        </div>

        {/* Zone 3: Kawalan Tindakan */}
        <div className="pointer-events-auto flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onToggleDrawer('flights')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              activeDrawer === 'flights'
                ? 'bg-sky-500 text-slate-950 border-sky-400'
                : 'bg-[#0a101d]/92 text-slate-200 border-white/10 hover:bg-slate-800/95 hover:text-white'
            }`}
          >
            <ListFilter className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Penerbangan</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleDrawer('notifications')}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              activeDrawer === 'notifications'
                ? 'bg-sky-500 text-slate-950 border-sky-400'
                : 'bg-[#0a101d]/92 text-slate-200 border-white/10 hover:bg-slate-800/95 hover:text-white'
            }`}
            aria-label={`Pusat Notifikasi, ${unreadCount} belum dibaca`}
          >
            <Bell className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Notifikasi</span>
            {unreadCount > 0 && (
              <span
                className={`font-mono-tabular text-[11px] font-semibold px-1.5 py-0.2 rounded ${
                  activeDrawer === 'notifications'
                    ? 'bg-slate-950/20 text-slate-950'
                    : 'bg-sky-500/20 text-sky-300'
                }`}
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={onToggleSound}
            title={soundEnabled ? 'Senyapkan bunyi notifikasi' : 'Aktifkan bunyi notifikasi'}
            aria-label={soundEnabled ? 'Senyapkan bunyi notifikasi' : 'Aktifkan bunyi notifikasi'}
            className={`inline-flex items-center justify-center w-9 h-8.5 rounded-lg border transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
              soundEnabled
                ? 'bg-[#0a101d]/92 text-sky-300 border-white/10 hover:bg-slate-800/95'
                : 'bg-[#0a101d]/92 text-slate-500 border-white/10 hover:text-slate-300'
            }`}
          >
            {soundEnabled ? (
              <Volume2 className="w-4 h-4" aria-hidden="true" />
            ) : (
              <VolumeX className="w-4 h-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
