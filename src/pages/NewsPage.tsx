import React, { useState } from 'react';
import { ExternalLink, Pin } from 'lucide-react';
import { useSiteData } from '../context/SiteDataContext';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';
import { TacticalBadge } from '../components/common/StatusBadge';
import { ShareMenu } from '../components/common/ShareMenu';
import { formatDisplayDate } from '../utils/dateFormat';
import { validateHttpsUrl, validateImageAssetUrl } from '../utils/validation';
import type { NewsArticle } from '../types/data';

type CategoryFilter = 'All' | NewsArticle['category'];

export const NewsPage: React.FC = () => {
  const { bundle, datasetErrors, reloadData } = useSiteData();
  const [category, setCategory] = useState<CategoryFilter>('All');

  const visibleEntries = bundle.news.entries.filter(
    (item) => item.published !== false && !item.archived
  );

  const items = [...visibleEntries]
    .filter((item) => (category === 'All' ? true : item.category === category))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  return (
    <div className="pb-16">
      <PageMeta
        title="News & Updates | NexusX Esports India"
        description="Tournament announcements, community updates, and rule bulletins from NexusX Esports India."
      />

      <PageHeader
        eyebrow="Announcements & Advisories"
        title="News & Updates"
        description="Official tournament announcements, schedule updates, and community advisories."
      />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {visibleEntries.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(['All', 'Tournament', 'Rules', 'Community', 'Updates'] as CategoryFilter[]).map(
              (cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategory(cat)}
                  className={`rounded-lg px-4 py-2 font-mono text-xs uppercase tracking-wider border transition-colors cursor-pointer ${
                    category === cat
                      ? 'bg-[#22C55E] border-[#22C55E] text-[#050709] font-bold'
                      : 'bg-[#080B10] border-white/10 text-slate-300 hover:text-white hover:border-[#22C55E]/40'
                  }`}
                >
                  {cat}
                </button>
              )
            )}
          </div>
        )}

        {datasetErrors.news ? (
          <DataErrorCard
            title="Unable to Load Announcements"
            detail={datasetErrors.news}
            onRetry={() => void reloadData(true)}
          />
        ) : items.length === 0 ? (
          <div className="nx-glass rounded-2xl p-12 text-center text-slate-400">
            No announcements published yet.
          </div>
        ) : (
          <div className="space-y-8">
            {items.map((item, idx) => {
              const bannerCheck = validateImageAssetUrl(item.banner, 'News banner');
              const bannerUrl =
                bannerCheck.valid && bannerCheck.normalized ? bannerCheck.normalized : '';
              const extCheck = validateHttpsUrl(item.externalUrl, 'External link');
              const isSpotlight = idx === 0 && Boolean(bannerUrl);

              if (isSpotlight) {
                return (
                  <article
                    key={item.id}
                    className="group nx-glass nx-glass-hover rounded-3xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 border border-[#22C55E]/35"
                  >
                    <div className="relative lg:col-span-6 min-h-[240px] sm:min-h-[300px] bg-[#06090B] overflow-hidden">
                      <img
                        src={bannerUrl}
                        alt={`${item.title} banner`}
                        className="h-full w-full object-cover opacity-90 group-hover:scale-[1.03] transition-transform duration-500"
                      />
                      <div
                        className="absolute inset-0 bg-gradient-to-t from-[#050809]/85 via-transparent to-transparent"
                        aria-hidden="true"
                      />
                      <div className="absolute top-4 left-4 flex items-center gap-2">
                        <span className="rounded-lg bg-[#22C55E] px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#041108]">
                          Featured Dispatch
                        </span>
                      </div>
                    </div>

                    <div className="lg:col-span-6 p-6 sm:p-8 flex flex-col justify-between gap-5">
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <TacticalBadge variant={item.pinned ? 'emerald' : 'silver'}>
                              {item.category}
                            </TacticalBadge>
                            {item.pinned && (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-[#16FF6E]">
                                <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                                Pinned
                              </span>
                            )}
                          </div>
                          <time className="font-mono text-xs text-slate-400">
                            {formatDisplayDate(item.publishedDate)}
                          </time>
                        </div>

                        <h2 className="font-display text-2xl sm:text-3xl font-bold text-white uppercase leading-tight">
                          {item.title}
                        </h2>
                        <p className="text-sm sm:text-base text-slate-300 leading-relaxed whitespace-pre-line">
                          {item.description}
                        </p>

                        {extCheck.valid && extCheck.normalized && (
                          <div className="pt-1">
                            <a
                              href={extCheck.normalized}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="nx-btn-neon inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-display font-bold uppercase tracking-wider"
                            >
                              Read Full Announcement
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                        <span className="font-mono text-xs text-slate-500 uppercase">
                          Share Update
                        </span>
                        <ShareMenu title={item.title} text={item.description} />
                      </div>
                    </div>
                  </article>
                );
              }

              return null;
            })}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {items.map((item, idx) => {
                const bannerCheck = validateImageAssetUrl(item.banner, 'News banner');
                const bannerUrl =
                  bannerCheck.valid && bannerCheck.normalized ? bannerCheck.normalized : '';
                const extCheck = validateHttpsUrl(item.externalUrl, 'External link');
                if (idx === 0 && Boolean(bannerUrl)) {
                  return null;
                }

                return (
                  <article
                    key={item.id}
                    className="group nx-glass nx-glass-hover rounded-2xl overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      {bannerUrl && (
                        <div className="relative h-52 bg-[#080A0E] border-b border-emerald-500/20 overflow-hidden">
                          <img
                            src={bannerUrl}
                            alt={`${item.title} banner`}
                            className="h-full w-full object-cover opacity-85 group-hover:scale-[1.04] transition-transform duration-500"
                            loading="lazy"
                          />
                          <div
                            className="absolute inset-0 bg-gradient-to-t from-[#060A0D] via-transparent to-transparent"
                            aria-hidden="true"
                          />
                        </div>
                      )}

                      <div className="p-6 space-y-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <TacticalBadge variant={item.pinned ? 'emerald' : 'silver'}>
                              {item.category}
                            </TacticalBadge>
                            {item.pinned && (
                              <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-[#22C55E]">
                                <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                                Pinned
                              </span>
                            )}
                          </div>
                          <time className="font-mono text-xs text-slate-400">
                            {formatDisplayDate(item.publishedDate)}
                          </time>
                        </div>

                        <h2 className="font-display text-xl sm:text-2xl font-bold text-white uppercase">
                          {item.title}
                        </h2>
                        <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-line">
                          {item.description}
                        </p>

                        {extCheck.valid && extCheck.normalized && (
                          <div className="pt-1">
                            <a
                              href={extCheck.normalized}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 bg-[#080B10] hover:bg-[#22C55E] border border-white/15 hover:border-[#22C55E] text-xs font-mono uppercase tracking-wider text-white hover:text-[#050709] font-semibold transition-colors"
                            >
                              Read Full Announcement
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="px-6 py-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                      <span className="font-mono text-xs text-slate-500 uppercase">
                        Share Update
                      </span>
                      <ShareMenu title={item.title} text={item.description} />
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
