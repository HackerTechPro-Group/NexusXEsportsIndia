import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { useSiteData } from '../context/SiteDataContext';
import {
  fetchPlatformResults,
  getPlatformApiBaseUrl,
} from '../api/platformClient';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';
import { TacticalBadge } from '../components/common/StatusBadge';
import { ShareMenu } from '../components/common/ShareMenu';
import type { TournamentFormat, TournamentResultEntry } from '../types/data';

type DivisionFilter = 'All' | TournamentFormat;
type D1ResultRow = Awaited<ReturnType<typeof fetchPlatformResults>>['results'][number];

export const ResultsPage: React.FC = () => {
  const { bundle, publishedTournaments, datasetErrors, reloadData } = useSiteData();
  const [filter, setFilter] = useState<DivisionFilter>('All');
  const [liveResults, setLiveResults] = useState<D1ResultRow[]>([]);

  useEffect(() => {
    const base = getPlatformApiBaseUrl();
    if (!base) return;
    let active = true;
    void fetchPlatformResults()
      .then((res) => {
        if (active && Array.isArray(res.results)) {
          setLiveResults(res.results);
        }
      })
      .catch(() => {
        // Fallback cleanly to static archive when Worker offline
      });
    return () => {
      active = false;
    };
  }, []);

  // Group D1 match-level rows into per-match Official Result blocks cleanly
  const groupedLiveResults: TournamentResultEntry[] = useMemo(() => {
    if (liveResults.length === 0) return [];
    const byMatch = new Map<string, D1ResultRow[]>();
    for (const r of liveResults) {
      const key = `${r.tournament_id}::${r.match_id}`;
      const list = byMatch.get(key) || [];
      list.push(r);
      byMatch.set(key, list);
    }
    const output: TournamentResultEntry[] = [];
    for (const [key, rows] of byMatch.entries()) {
      const sorted = [...rows].sort(
        (a, b) => b.total_points - a.total_points || a.placement - b.placement
      );
      const top = sorted[0];
      const div: TournamentFormat =
        top.division === 'Solo' || top.division === 'Duo' || top.division === 'Squad'
          ? top.division
          : 'Squad';
      output.push({
        id: `d1-${key}`,
        tournamentId: top.tournament_id,
        tournamentName: `${top.tournament_title} — ${top.match_title}`,
        division: div,
        date: top.created_at ? top.created_at.slice(0, 10) : '',
        winner: top.participant_name || 'Confirmed Winner',
        prizeDistribution: top.prize_pool || '',
        finalRankings: sorted.map((row, idx) => ({
          rank: idx + 1,
          teamOrPlayer: row.participant_name || 'Participant',
          totalPoints: row.total_points,
          prize: row.placement === 1 ? 'WWCD' : `${row.kills} Kills`,
        })),
        summary: `Official verified scoring: ${sorted.length} roster(s) scored from verified match sheet.`,
        published: true,
      });
    }
    return output;
  }, [liveResults]);

  const publishedStaticEntries = bundle.results.entries.filter((res) => res.published !== false);
  const allPublished = groupedLiveResults.length > 0 ? groupedLiveResults : publishedStaticEntries;

  const items = allPublished.filter((res) =>
    filter === 'All' ? true : res.division === filter
  );

  return (
    <div className="pb-16">
      <PageMeta
        title="Results | NexusX Esports India"
        description="Published official BGMI tournament winners, final rankings, prize distributions, and match summaries for NexusX Esports India."
      />

      <PageHeader
        eyebrow="Verified Podium Archive"
        title="Tournament Results"
        description="Official tournament winners, final rankings, prize distributions, and published match recaps."
      />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {allPublished.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {(['All', 'Solo', 'Duo', 'Squad'] as DivisionFilter[]).map((tab) => (
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

        {datasetErrors.results && allPublished.length === 0 ? (
          <DataErrorCard
            title="Unable to Load Tournament Results"
            detail={datasetErrors.results}
            onRetry={() => void reloadData(true)}
          />
        ) : items.length > 0 ? (
          <div className="space-y-6">
            {items.map((res) => {
              const linkedTournament = res.tournamentId
                ? publishedTournaments.find((t) => t.id === res.tournamentId)
                : undefined;

              return (
                <article
                  key={res.id}
                  className="nx-glass rounded-2xl p-6 sm:p-8 space-y-6"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <TacticalBadge variant="emerald">{res.division}</TacticalBadge>
                        {res.tournamentId && (
                          <TacticalBadge variant="silver">{res.tournamentId}</TacticalBadge>
                        )}
                        <span className="font-mono text-xs text-slate-400">{res.date}</span>
                      </div>
                      <h2 className="font-display text-2xl sm:text-3xl font-bold text-white uppercase">
                        {linkedTournament ? (
                          <Link
                            to={`/tournaments/${linkedTournament.slug}`}
                            className="hover:text-[#22C55E] transition-colors"
                          >
                            {res.tournamentName}
                          </Link>
                        ) : (
                          res.tournamentName
                        )}
                      </h2>
                    </div>

                    <div className="rounded-xl bg-[#080B10] border border-[#22C55E]/40 px-5 py-3">
                      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
                        <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                        Tournament Winner
                      </div>
                      <div className="font-display text-xl font-bold text-white mt-0.5">
                        {res.winner}
                      </div>
                    </div>
                  </div>

                  {res.prizeDistribution && (
                    <div className="rounded-xl bg-[#080B10] border border-white/10 p-4 text-sm">
                      <span className="font-mono text-xs uppercase tracking-wider text-slate-400 block mb-1">
                        Prize Distribution
                      </span>
                      <span className="text-slate-200">{res.prizeDistribution}</span>
                    </div>
                  )}

                  {res.finalRankings.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-[#080B10] border-b border-white/10 font-mono text-xs uppercase text-slate-400">
                          <tr>
                            <th className="py-3 px-4">Rank</th>
                            <th className="py-3 px-4">Team / Player</th>
                            <th className="py-3 px-4 text-right">Total Points</th>
                            <th className="py-3 px-4 text-right">Note / Kills</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {res.finalRankings.map((row) => (
                            <tr key={`${res.id}-${row.rank}`}>
                              <td className="py-3 px-4 font-mono font-bold text-[#22C55E]">
                                #{String(row.rank).padStart(2, '0')}
                              </td>
                              <td className="py-3 px-4 font-medium text-white">
                                {row.teamOrPlayer}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-[#16FF6E] font-semibold">
                                {row.totalPoints}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-300">
                                {row.prize || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {res.summary && (
                    <p className="text-sm text-slate-300 leading-relaxed">{res.summary}</p>
                  )}

                  <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                    <span className="font-mono text-xs text-slate-500 uppercase">
                      Share Official Result
                    </span>
                    <ShareMenu
                      title={res.tournamentName}
                      text={`Official Winner: ${res.winner}`}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="nx-glass rounded-2xl p-12 text-center space-y-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/40 text-[#22C55E]">
              <Trophy className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              No Official Tournament Results Published Yet
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
              Verified match winners, final standings, and prize distributions will be published
              here once active tournaments conclude.
            </p>
            <div className="pt-2">
              <Link
                to="/tournaments"
                className="nx-btn-neon inline-flex items-center px-5 py-2.5 text-xs"
              >
                Explore Active Tournaments
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
