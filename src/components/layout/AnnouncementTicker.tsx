import React from 'react';
import { Radio, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSiteData } from '../../context/SiteDataContext';

export const AnnouncementTicker: React.FC = () => {
  const { bundle } = useSiteData();
  const text = bundle.siteConfig.tickerAnnouncement.trim();

  if (!text) return null;

  return (
    <div className="bg-[#0B0D12] border-b border-slate-800/90 text-xs">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-[#E11D2E]/15 border border-[#E11D2E]/50 text-[#E11D2E] font-mono text-[10px] font-semibold uppercase tracking-widest shrink-0">
            <Radio className="h-3 w-3" aria-hidden="true" />
            Update
          </span>
          <p className="text-slate-300 truncate">{text}</p>
        </div>
        <Link
          to="/news"
          className="hidden sm:inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-slate-300 hover:text-white shrink-0 transition-colors"
        >
          News &amp; Updates
          <ArrowRight className="h-3 w-3 text-[#E11D2E]" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
};
