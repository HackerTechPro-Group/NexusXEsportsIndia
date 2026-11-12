import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { useSiteData } from '../../context/SiteDataContext';
import { isSecretAdminPathname } from '../../utils/adminRoute';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { pathname } = useLocation();
  const { isLoading, loadErrors, reloadData } = useSiteData();
  const isAdminRoute = isSecretAdminPathname(pathname);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);

  if (isAdminRoute) {
    return (
      <div className="min-h-screen flex flex-col bg-[#060709] text-slate-100 overflow-x-hidden">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#22C55E] focus:text-[#050709] focus:font-bold focus:font-mono focus:text-xs"
        >
          Skip to main content
        </a>
        <main id="main-content" className="flex-1 flex flex-col">
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#060709] text-slate-100 overflow-x-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#22C55E] focus:text-[#050709] focus:font-bold focus:font-mono focus:text-xs"
      >
        Skip to main content
      </a>

      <Navbar />

      {loadErrors.length > 0 && (
        <div
          role="alert"
          className="bg-red-950/60 border-b border-[#E11D2E]/50 px-4 py-2 text-xs text-red-200"
        >
          <div className="mx-auto max-w-7xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#E11D2E] shrink-0" aria-hidden="true" />
              <span>
                Data Unavailable: Could not load verified content ({loadErrors[0]}). Placeholder
                records are disabled.
              </span>
            </div>
            <button
              type="button"
              onClick={() => void reloadData(true)}
              className="inline-flex items-center gap-1 rounded px-2.5 py-1 border border-red-400/40 hover:bg-red-900/50 font-mono uppercase cursor-pointer shrink-0"
            >
              <RefreshCw className="h-3 w-3" aria-hidden="true" />
              Retry
            </button>
          </div>
        </div>
      )}

      <main id="main-content" className="flex-1">
        {isLoading ? (
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
            <div className="animate-pulse space-y-6">
              <div className="h-6 w-44 rounded bg-slate-800" />
              <div className="h-12 w-2/3 rounded bg-slate-800/80" />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div className="h-64 rounded-xl bg-[#0D0F14] border border-white/10" />
                <div className="h-64 rounded-xl bg-[#0D0F14] border border-white/10" />
              </div>
            </div>
          </div>
        ) : (
          children
        )}
      </main>

      <Footer />
    </div>
  );
};
