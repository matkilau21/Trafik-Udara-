import { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton() {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // Sembunyikan butang apabila aplikasi sudah dipasang dalam mod standalone
  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
      return;
    }
    setShowGuide(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        title="Pasang Aero3D KLIA sebagai aplikasi di telefon atau komputer"
        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-sky-400/35 bg-sky-500/15 text-sky-200 hover:bg-sky-500 hover:text-slate-950 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
      >
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">Pasang Aplikasi</span>
        <span className="sm:hidden">Pasang</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-guide-title"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-[#0a101d] border border-white/15 p-5 shadow-2xl text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-sky-500/15 border border-sky-400/30 text-sky-300 shrink-0">
                  <Smartphone className="w-4 h-4" aria-hidden="true" />
                </span>
                <div>
                  <h3 id="pwa-guide-title" className="text-sm font-semibold text-white">
                    Pasang Aero3D KLIA
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Akses skrin penuh seperti aplikasi natif
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Tutup panduan pemasangan"
                className="p-1 text-slate-400 hover:text-white rounded-md hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {isIOS ? (
              <ol className="mt-4 space-y-2 text-xs text-slate-300 leading-relaxed list-decimal list-inside">
                <li>
                  Buka pautan aplikasi ini dalam pelayar <strong className="text-white">Safari</strong>.
                </li>
                <li>
                  Tekan butang <strong className="text-white">Kongsi (Share)</strong> di bar bawah Safari.
                </li>
                <li>
                  Tatal ke bawah dan pilih <strong className="text-white">Tambah ke Skrin Utama (Add to Home Screen)</strong>.
                </li>
              </ol>
            ) : (
              <ol className="mt-4 space-y-2 text-xs text-slate-300 leading-relaxed list-decimal list-inside">
                <li>
                  Buka pautan aplikasi ini terus di tab penuh pelayar <strong className="text-white">Google Chrome</strong> pada telefon Android anda.
                </li>
                <li>
                  Tekan ikon menu <strong className="text-white">⋮</strong> di penjuru kanan atas Chrome.
                </li>
                <li>
                  Pilih <strong className="text-white">Pasang aplikasi (Install app)</strong> atau <strong className="text-white">Tambah ke skrin utama</strong>.
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full rounded-lg bg-sky-500 hover:bg-sky-400 py-2 text-xs font-semibold text-slate-950 transition-colors cursor-pointer"
            >
              Faham
            </button>
          </div>
        </div>
      )}
    </>
  );
}
