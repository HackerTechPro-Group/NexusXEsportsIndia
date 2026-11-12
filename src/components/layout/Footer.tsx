import React from 'react';
import { ArrowUp, ExternalLink, Mail, Share2, Trophy } from 'lucide-react';
import { BrandLogo } from '../common/BrandLogo';
import { SocialLinks } from '../common/SocialLinks';
import { useSiteData } from '../../context/SiteDataContext';
import { DEFAULT_CMS_SNAPSHOT, resolveMediaAssetUrl } from '../../types/cms';

function handleFooterLinkClick(href: string) {
  if (href === '#top') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  if (href.startsWith('#')) {
    document.getElementById(href.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}

export const Footer: React.FC = () => {
  const { bundle } = useSiteData();
  const { siteConfig } = bundle;
  const cms = bundle.cms ?? DEFAULT_CMS_SNAPSHOT;
  const footer = cms.footer;

  if (!footer.visible) {
    return null;
  }

  const contactEmail = cms.aboutContact.contactEmail || siteConfig.community.contactEmail;

  return (
    <footer className="border-t border-emerald-500/15 bg-[#050709] text-slate-400">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 lg:gap-12">
          {/* Brand Summary */}
          <div className="md:col-span-6 space-y-3">
            <BrandLogo
              logoSrc={footer.logoUrl ? resolveMediaAssetUrl(footer.logoUrl) : undefined}
              brandName={footer.brandName || siteConfig.brandName}
              tagline={footer.tagline || siteConfig.tagline}
            />
            <p className="font-mono text-xs font-semibold tracking-[0.2em] text-emerald-400 uppercase pt-1">
              {footer.tagline || siteConfig.tagline}
            </p>
            <p className="text-sm text-slate-400 leading-relaxed max-w-md">
              {footer.description}
            </p>
            {contactEmail && (
              <div className="pt-1">
                <a
                  href={`mailto:${contactEmail}`}
                  className="inline-flex items-center gap-2 text-xs font-mono text-slate-300 hover:text-white transition-colors"
                >
                  <Mail className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                  {contactEmail}
                </a>
              </div>
            )}
          </div>

          {/* Quick Navigation & Legal Links */}
          <div className="md:col-span-3 space-y-4">
            <div>
              <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-white mb-4">
                Quick Menu
              </h2>
              <ul className="space-y-2.5 text-sm">
                <li>
                  <button
                    type="button"
                    onClick={() => handleFooterLinkClick('#top')}
                    className="inline-flex items-center gap-2 hover:text-[#22C55E] transition-colors cursor-pointer"
                  >
                    <ArrowUp className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                    Back to Top
                  </button>
                </li>
                {footer.quickLinks.map((ql) => (
                  <li key={`${ql.label}-${ql.href}`}>
                    <button
                      type="button"
                      onClick={() => handleFooterLinkClick(ql.href)}
                      className="inline-flex items-center gap-2 hover:text-[#22C55E] transition-colors cursor-pointer"
                    >
                      <Trophy className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                      {ql.label}
                    </button>
                  </li>
                ))}
                {footer.legalLinks.map((ll) => (
                  <li key={`${ll.label}-${ll.href}`}>
                    <button
                      type="button"
                      onClick={() => handleFooterLinkClick(ll.href)}
                      className="inline-flex items-center gap-2 hover:text-[#22C55E] transition-colors cursor-pointer text-slate-400"
                    >
                      {ll.href.startsWith('https://') ? (
                        <ExternalLink className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                      ) : (
                        <Share2 className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                      )}
                      {ll.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Official Social Media Links with Icons */}
          <div className="md:col-span-3">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-white mb-4">
              Follow NexusX
            </h2>
            <SocialLinks
              community={siteConfig.community}
              cmsSocialLinks={cms.socialLinks}
              variant="compact"
            />
          </div>
        </div>

        {/* Bottom Copyright & Disclaimer */}
        <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
          <div className="space-y-1">
            <p>{footer.copyrightText}</p>
            {footer.legalNote && <p className="text-[11px] text-slate-500/90">{footer.legalNote}</p>}
          </div>
          <span>{footer.disclaimerText}</span>
        </div>
      </div>
    </footer>
  );
};
