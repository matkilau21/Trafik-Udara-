import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed top-16 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-2 rounded-lg bg-amber-500/95 border border-amber-300/40 px-3.5 py-1.5 text-xs font-semibold text-slate-950 shadow-xl"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>Mod Luar Talian — Menggunakan data cache</span>
    </div>
  );
}
