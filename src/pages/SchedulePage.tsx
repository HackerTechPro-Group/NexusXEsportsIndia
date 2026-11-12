import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Clock, Mail, MapPin } from 'lucide-react';
import { useSiteData } from '../context/SiteDataContext';
import {
  fetchPlatformMatches,
  getPlatformApiBaseUrl,
  type PlatformMatchItem,
} from '../api/platformClient';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';
import { TacticalBadge } from '../components/common/StatusBadge';
import type { ScheduleEntry, TournamentFormat } from '../types/data';

type FilterType = 'All' | TournamentFormat;

export const SchedulePage: React.FC = () => {
  const { bundle, datasetErrors, reloadData } = useSiteData();
  const [filter, setFilter] = useState<FilterType>('All');
  const [liveMatches, setLiveMatches] = useState<PlatformMatchItem[]>([]);

  useEffect(() => {
    const base = getPlatformApiBaseUrl();
    if (!base) return;
    let active = true;
    void fetchPlatformMatches()
      .then((matches) => {
        if (active && Array.isArray(matches)) {
          setLiveMatches(matches);
        }
      })
      .catch(() => {
        // Fallback to static/empty cleanly
      });
    return () => {
      active = false;
    };
  }, []);

  const mappedLiveItems: ScheduleEntry[] = useMemo(
    () =>
      liveMatches.map((m) => ({
        id: m.id,
        tournamentName: `${m.tournament_title || m.tournament_id} — ${m.title}`,
        format: (m.division === 'Solo' || m.division === 'Duo' || m.division === 'Squad'
          ? m.division
          : 'Squad') as TournamentFormat,
        date: m.scheduled_at ? m.scheduled_at.slice(0, 10) : 'TBA',
        reportingTime: 'Check Email / Lobby Notice',
        startTime: m.scheduled_at ? `${m.scheduled_at.slice(11, 16) || 'TBA'} IST` : 'TBA',
        timezone: 'IST',
        map: m.map || 'Erangel',
        status:
          m.status === 'live'
            ? 'Live'
            : m.status === 'completed'
            ? 'Completed'
            : m.status === 'cancelled'
            ? 'Cancelled'
            : 'Upcoming',
        notes: `${m.group_label || 'Main Lobby'} • Room IDs emailed to confirmed rosters prior to drop.`,
      })),
    [liveMatches]
  );

  const combinedSource = mappedLiveItems.length > 0 ? mappedLiveItems : bundle.schedule.entries;

  const items = combinedSource.filter((item) =>
    filter === 'All' ? true : item.format === filter || item.format === 'All'
  );

  const statusVariant = (status: ScheduleEntry['status']) => {
    if (status === 'Live' || status === 'Registration Open') return 'emerald';
    if (status === 'Completed' || status === 'Registration Closed') return 'silver';
    if (status === 'Cancelled') return 'amber';
    return 'emerald';
  };

  return (
    <div className="pb-16">
      <PageMeta
        title="Match Schedule | NexusX Esports India"
        description="Match schedule and reporting policy for NexusX Esports India BGMI tournaments. Detailed lobby schedules and room briefings are emailed to registered competitors."
      />

      <PageHeader
        eyebrow="Matchday Briefing & Lobbies"
        title="Tournament Schedule"
        description="Live organizer-published BGMI match schedules, reporting windows, and lobby status updates."
        actions={
          mappedLiveItems.length > 0 ? (
            <TacticalBadge variant="emerald">Live Match Feed</TacticalBadge>
          ) : (
            <TacticalBadge variant="silver">Email Delivery</TacticalBadge>
          )
        }
      />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <div
          role="note"
          className="nx-glass rounded-xl flex items-start gap-3 p-5 text-slate-200 text-sm"
        >
          <Mail className="h-5 w-5 text-[#22C55E] shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <strong className="font-mono uppercase tracking-wider text-white block mb-1">
              Match Schedules &amp; Lobby Timings Sent via Email
            </strong>
            <p className="text-slate-300 leading-relaxed">
              Official match timings and lobby details will be sent to registered participants
              through email. Core tournament dates and prize pools are listed on each{' '}
              <Link
                to="/tournaments"
                className="text-white underline underline-offset-4 hover:text-[#22C55E]"
              >
                Tournament Page
              </Link>
              .
            </p>
          </div>
        </div>

        {combinedSource.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(['All', 'Solo', 'Duo', 'Squad'] as FilterType[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setFilter(tab)}
                className={`rounded-lg px-4 py-2 font-mono text-xs uppercase tracking-wider border transition-colors cursor-pointer ${
                  filter === tab
                    ? 'bg-[#22C55E] border-[#22C55E] text-[#050709] font-bold'
                    : 'bg-[#080B10] border-white/10 text-slate-300 hover:text-white hover:border-[#22C55E]/40'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-4">
          {items.map((item) => (
            <article
              key={item.id}
              className="nx-glass rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6"
            >
              <div className="space-y-2 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2">
                  <TacticalBadge variant="emerald">{item.format}</TacticalBadge>
                  <TacticalBadge variant={statusVariant(item.status)}>{item.status}</TacticalBadge>
                </div>
                <h2 className="font-display text-xl sm:text-2xl font-bold text-white uppercase">
                  {item.tournamentName}
                </h2>
                {item.notes && (
                  <p className="text-sm text-slate-300 leading-relaxed">{item.notes}</p>
                )}
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:min-w-[320px] text-xs font-mono rounded-xl bg-[#080B10] border border-white/10 p-4">
                <div>
                  <dt className="text-slate-500 uppercase text-[10px]">Date</dt>
                  <dd className="flex items-center gap-1.5 text-slate-200 mt-0.5">
                    <Calendar className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                    {item.date || 'TBA'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 uppercase text-[10px]">Map</dt>
                  <dd className="flex items-center gap-1.5 text-slate-200 mt-0.5">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {item.map || 'TBA'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 uppercase text-[10px]">Reporting Time</dt>
                  <dd className="flex items-center gap-1.5 text-slate-200 mt-0.5">
                    <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    {item.reportingTime || 'TBA'}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 uppercase text-[10px]">Match Start Time</dt>
                  <dd className="flex items-center gap-1.5 text-white font-semibold mt-0.5">
                    <Clock className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                    {item.startTime || 'TBA'}
                  </dd>
                </div>
              </dl>
            </article>
          ))}

          {datasetErrors.schedule && items.length === 0 && (
            <DataErrorCard
              title="Unable to Load Match Schedule"
              detail={datasetErrors.schedule}
              onRetry={() => void reloadData(true)}
            />
          )}

          {!datasetErrors.schedule && items.length === 0 && (
            <div className="nx-glass rounded-2xl p-12 text-center space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/40 text-[#22C55E]">
                <Calendar className="h-6 w-6" aria-hidden="true" />
              </div>
              <h2 className="font-display text-2xl font-bold text-white uppercase">
                Schedules Shared via Registered Email
              </h2>
              <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
                Group check-in times and match schedules are emailed directly to confirmed
                participants. Review published event dates and register on the Tournaments page.
              </p>
              <div className="pt-2">
                <Link
                  to="/tournaments"
                  className="nx-btn-neon inline-flex items-center px-5 py-2.5 text-xs"
                >
                  View Active Tournaments
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};
