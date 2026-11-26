import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Navigation,
  PlaneLanding,
  PlaneTakeoff,
  X,
} from 'lucide-react';
import { STATUS_META, ScheduleNotification } from '../types/flight';
import { formatTimeHMS } from '../utils/geoMath';

interface NotificationToastsProps {
  toasts: ScheduleNotification[];
  onDismiss: (id: string) => void;
  onFocusFlight: (flightId: string) => void;
}

export function NotificationToasts({
  toasts,
  onDismiss,
  onFocusFlight,
}: NotificationToastsProps) {
  if (toasts.length === 0) return null;

  return (
    <aside
      aria-live="polite"
      aria-label="Notifikasi perubahan jadual penerbangan automatik"
      className="fixed top-16 right-4 sm:right-6 z-30 flex flex-col gap-2.5 w-[min(360px,calc(100vw-2rem))] pointer-events-none"
    >
      {toasts.map((toast) => {
        const meta = STATUS_META[toast.newStatus];
        const Icon =
          toast.severity === 'warning' || toast.severity === 'alert'
            ? AlertTriangle
            : toast.newStatus === 'MENDARAT'
            ? CheckCircle2
            : toast.category === 'KEDATANGAN'
            ? PlaneLanding
            : PlaneTakeoff;

        const iconColor =
          toast.severity === 'warning'
            ? 'text-amber-300'
            : toast.severity === 'alert'
            ? 'text-rose-400'
            : toast.severity === 'success'
            ? 'text-emerald-300'
            : 'text-sky-300';

        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto rounded-xl bg-[#0b1222]/96 border border-white/12 p-3.5 shadow-xl shadow-black/50 transition-all duration-200"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} aria-hidden="true" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono-tabular">
                    <span className={meta.textClass}>{meta.label}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {toast.origin} → {toast.destination}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatTimeHMS(toast.timestampMs)}</span>
                  </div>

                  <p className="mt-0.5 text-sm font-semibold text-slate-100 leading-snug truncate">
                    {toast.title}
                  </p>
                  <p className="mt-1 text-xs text-slate-300 leading-relaxed line-clamp-2">
                    {toast.message}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onDismiss(toast.id)}
                aria-label="Tutup notifikasi"
                className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-2.5 pt-2 border-t border-white/8 flex items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400 truncate">
                {toast.airline}
                {toast.previousStatus !== toast.newStatus && (
                  <>
                    {' · '}
                    {STATUS_META[toast.previousStatus].shortLabel}
                    <ArrowRight className="inline w-3 h-3 mx-0.5 text-slate-500" aria-hidden="true" />
                    <span className="text-slate-200">{meta.shortLabel}</span>
                  </>
                )}
              </span>

              <button
                type="button"
                onClick={() => {
                  onFocusFlight(toast.flightId);
                  onDismiss(toast.id);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-sky-300 hover:text-slate-950 hover:bg-sky-400 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Navigation className="w-3 h-3" aria-hidden="true" />
                <span>Jejak 3D</span>
              </button>
            </div>
          </div>
        );
      })}
    </aside>
  );
}
