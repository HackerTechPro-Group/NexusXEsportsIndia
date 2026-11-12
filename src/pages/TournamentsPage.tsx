import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSiteData } from '../context/SiteDataContext';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';
import { TournamentCard } from '../components/tournament/TournamentCard';
import { getRegistrationButtonState } from '../utils/registration';
import type { TournamentRecord } from '../types/data';

type TournamentFilter =
  | 'all'
  | 'solo'
  | 'duo'
  | 'squad'
  | 'upcoming'
  | 'open'
  | 'full'
  | 'closed';

function matchesFilter(t: TournamentRecord, filter: TournamentFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'solo':
      return t.format === 'Solo';
    case 'duo':
      return t.format === 'Duo';
    case 'squad':
      return t.format === 'Squad';
    case 'upcoming':
      return t.status === 'upcoming' || t.status === 'registration_open';
    case 'open':
      return getRegistrationButtonState(t).isEnabled;
    case 'full':
      return t.registration.status === 'full';
    case 'closed':
      return (
        t.registration.status === 'closed' ||
        t.status === 'registration_closed' ||
        t.status === 'completed'
      );
  }
}

const FILTER_DEFS: { id: TournamentFilter; label: string }[] = [
  { id: 'all', label: 'All Tournaments' },
  { id: 'solo', label: 'Solo' },
  { id: 'duo', label: 'Duo' },
  { id: 'squad', label: 'Squad' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'open', label: 'Registration Open' },
  { id: 'full', label: 'Registration Full' },
  { id: 'closed', label: 'Registration Closed' },
];

export const TournamentsPage: React.FC = () => {
  const { publishedTournaments, datasetErrors, reloadData } = useSiteData();
  const [activeFilter, setActiveFilter] = useState<TournamentFilter>('all');

  // Only display filters that have meaningful data (always keep "All Tournaments")
  const visibleFilters = useMemo(() => {
    return FILTER_DEFS.filter(
      (f) => f.id === 'all' || publishedTournaments.some((t) => matchesFilter(t, f.id))
    );
  }, [publishedTournaments]);

  const effectiveFilter = visibleFilters.some((f) => f.id === activeFilter)
    ? activeFilter
    : 'all';

  const filteredTournaments = useMemo(
    () => publishedTournaments.filter((t) => matchesFilter(t, effectiveFilter)),
    [publishedTournaments, effectiveFilter]
  );

  return (
    <div className="pb-16">
      <PageMeta
        title="BGMI Tournaments | NexusX Esports India"
        description="Browse published BGMI Solo, Duo, and Squad tournaments hosted by NexusX Esports India. Filter events, check prize pools, and register via Google Forms."
      />

      <PageHeader
        eyebrow="Competitive Divisions"
        title="BGMI Tournaments"
        description="Browse all published Solo, Duo, and Squad events. Open any tournament card to inspect schedules, rules, eligibility, and Google Form registration."
        actions={
          <Link
            to="/schedule"
            className="inline-flex items-center px-5 py-3 border border-slate-700 hover:border-white bg-[#131722] text-xs font-mono uppercase tracking-wider text-white transition-colors"
          >
            View Schedule →
          </Link>
        }
      />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {/* Meaningful-Data Filter Bar */}
        {visibleFilters.length > 1 && (
          <div
            role="group"
            aria-label="Tournament filters"
            className="flex flex-wrap gap-2"
          >
            {visibleFilters.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={`rounded-lg px-4 py-2 font-mono text-xs uppercase tracking-wider border transition-colors cursor-pointer ${
                  effectiveFilter === f.id
                    ? 'bg-[#22C55E] border-[#22C55E] text-[#050709] font-bold'
                    : 'bg-[#080B10] border-white/10 text-slate-300 hover:text-white hover:border-[#22C55E]/40'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Tournament Cards Grid */}
        {datasetErrors.tournaments ? (
          <DataErrorCard
            title="Unable to Load Tournaments"
            detail={datasetErrors.tournaments}
            onRetry={() => void reloadData(true)}
          />
        ) : filteredTournaments.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredTournaments.map((tournament) => (
              <TournamentCard key={tournament.id} tournament={tournament} />
            ))}
          </div>
        ) : (
          <div className="border border-slate-800 bg-[#0D0F14] p-12 text-center space-y-2">
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              No Tournaments Available
            </h2>
            <p className="text-sm text-slate-400">
              No tournaments are currently published under this category. Check back soon or follow
              News &amp; Updates.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
