import React, { useMemo, useState } from 'react';
import { Award, Compass, Globe, Info, Mail, Menu, Share2, Trophy, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSiteData } from '../../context/SiteDataContext';
import { DEFAULT_CMS_SNAPSHOT, resolveMediaAssetUrl, type CmsNavItem } from '../../types/cms';
import { BrandLogo } from '../common/BrandLogo';

function resolveNavIcon(item: CmsNavItem): React.ComponentType<{ className?: string }> {
  const target = `${item.label} ${item.href}`.toLowerCase();
  if (target.includes('tournament')) return Trophy;
  if (target.includes('result') || target.includes('podium')) return Award;
  if (target.includes('about')) return Info;
  if (target.includes('contact')) return Mail;
  if (target.includes('social')) return Share2;
  if (item.itemType === 'external') return Globe;
  return Compass;
}

export const Navbar: React.FC = () => {
  const { bundle } = useSiteData();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeNavId, setActiveNavId] = useState<string>('');
  const location = useLocation();
  const navigate = useNavigate();

  const cms = bundle.cms ?? DEFAULT_CMS_SNAPSHOT;

  const navItems = useMemo(
    () =>
      [...cms.navigation]
        .filter((item) => item.visible)
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [cms.navigation]
  );

  const mobileNavItems = useMemo(
    () => navItems.filter((item) => item.showMobile),
    [navItems]
  );

  const handleNavAction = (item: CmsNavItem | 'top') => {
    setMobileOpen(false);
    if (item === 'top') {
      setActiveNavId('');
      if (location.pathname !== '/') {
        navigate('/');
        window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 60);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    setActiveNavId(item.id);
    if (item.itemType === 'external' || item.href.startsWith('https://')) {
      window.open(
        item.href,
        item.openInNewTab ? '_blank' : '_self',
        item.openInNewTab ? 'noopener,noreferrer' : undefined
      );
      return;
    }

    if (item.href.startsWith('#')) {
      const targetId = item.href.slice(1);
      const scrollNow = () => {
        document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      if (location.pathname !== '/') {
        navigate('/');
        window.setTimeout(scrollNow, 60);
      } else {
        scrollNow();
      }
      return;
    }

    navigate(item.href);
  };

  const navItemClass = (active: boolean) =>
    `inline-flex items-center gap-2 px-4 py-2 text-xs font-mono uppercase tracking-wider transition-all whitespace-nowrap rounded-lg cursor-pointer ${
      active
        ? 'text-[#031107] bg-gradient-to-r from-[#22C55E] to-[#16FF6E] font-bold shadow-[0_0_18px_rgba(34,197,94,0.45)]'
        : 'text-slate-200 hover:text-white hover:bg-white/[0.06]'
    }`;

  return (
    <header className="sticky top-0 z-40 bg-[#050709]/90 backdrop-blur-xl border-b border-emerald-500/15">
      <nav
        aria-label="Primary Navigation"
        className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4"
      >
        <button
          type="button"
          onClick={() => handleNavAction('top')}
          aria-label="NexusX Esports India Home"
          className="shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#22C55E] rounded-lg cursor-pointer text-left"
        >
          <BrandLogo
            logoSrc={cms.footer.logoUrl ? resolveMediaAssetUrl(cms.footer.logoUrl) : undefined}
            brandName={cms.footer.brandName}
            tagline={cms.footer.tagline}
          />
        </button>

        {/* Desktop CMS Navigation */}
        {navItems.length > 0 && (
          <div className="hidden sm:flex items-center gap-1 rounded-xl border border-emerald-500/25 bg-[#0A1013]/85 p-1">
            {navItems.map((item) => {
              const Icon = resolveNavIcon(item);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavAction(item)}
                  className={navItemClass(activeNavId === item.id)}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Mobile Hamburger Control */}
        {mobileNavItems.length > 0 && (
          <div className="flex sm:hidden items-center">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav-drawer"
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              className="inline-flex items-center justify-center rounded-lg p-2 border border-emerald-500/25 bg-[#0A1013] text-slate-200 hover:text-white cursor-pointer"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        )}
      </nav>

      {/* Mobile Drawer */}
      {mobileOpen && mobileNavItems.length > 0 && (
        <div
          id="mobile-nav-drawer"
          className="sm:hidden border-t border-emerald-500/15 bg-[#070B0D] px-4 py-3"
        >
          <div className="grid grid-cols-2 gap-2">
            {mobileNavItems.map((item) => {
              const Icon = resolveNavIcon(item);
              const isActive = activeNavId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleNavAction(item)}
                  className={`inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-mono uppercase tracking-wider border cursor-pointer ${
                    isActive
                      ? 'bg-[#22C55E] border-[#22C55E] text-[#050809] font-bold'
                      : 'bg-[#0C1216] border-white/10 text-slate-200 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </header>
  );
};
