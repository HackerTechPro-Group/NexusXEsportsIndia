import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpDown, Mail, Search, Trophy } from 'lucide-react';
import { useSiteData } from '../context/SiteDataContext';
import {
  fetchPlatformLeaderboard,
  getPlatformApiBaseUrl,
} from '../api/platformClient';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';
import { TacticalBadge } from '../components/common/StatusBadge';
import type { TournamentFormat } from '../types/data';

type DivisionFilter = 'All' | TournamentFormat;
type SortKey = 'rank' | 'matchesPlayed' | 'positionPoints' | 'eliminationPoints' | 'totalPoints';

interface UnifiedLeaderboardRow {
  id: string;
  rank: number;
  name: string;
  tag: string;
  division: TournamentFormat;
  matchesPlayed: number;
  positionPoints: number;
  eliminationPoints: number;
  totalPoints: number;
  linkTo?: string;
}

export const LeaderboardPage: React.FC = () => {
  const { bundle, datasetErrors, reloadData } = useSiteData();
  const { entries } = bundle.leaderboard;

  const [liveRows, setLiveRows] = useState<UnifiedLeaderboardRow[]>([]);
  const [division, setDivision] = useState<DivisionFilter>('All');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('totalPoints');
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    const base = getPlatformApiBaseUrl();
    if (!base) return;
    let active = true;
    void fetchPlatformLeaderboard('All')
      .then((res) => {
        if (!active) return;
        const mappedTeams: UnifiedLeaderboardRow[] = (res.teams ?? []).map((t) => ({
          id: `team-${t.id}`,
          rank: t.rank,
          name: t.name,
          tag: t.tag,
          division: (t.division === 'Solo' || t.division === 'Duo' ? t.division : 'Squad') as TournamentFormat,
          matchesPlayed: t.matchesPlayed,
          positionPoints: t.positionPoints,
          eliminationPoints: t.eliminationPoints,
          totalPoints: t.totalPoints,
          linkTo: t.slug ? `/teams/${t.slug}` : undefined,
        }));
        const mappedPlayers: UnifiedLeaderboardRow[] = (res.players ?? []).map((p) => ({
          id: `player-${p.id}`,
          rank: p.rank,
          name: p.name,
          tag: p.tag,
          division: (p.division === 'Squad' || p.division === 'Duo' ? p.division : 'Solo') as TournamentFormat,
          matchesPlayed: p.matchesPlayed,
          positionPoints: Math.max(0, p.totalPoints - p.totalKills),
          eliminationPoints: p.totalKills,
          totalPoints: p.totalPoints,
          linkTo: `/players/${p.id}`,
        }));
        setLiveRows([...mappedTeams, ...mappedPlayers]);
      })
      .catch(() => {
        // Fallback to static/empty cleanly if offline
      });
    return () => {
      active = false;
    };
  }, []);

  const combinedRows: UnifiedLeaderboardRow[] = useMemo(() => {
    if (liveRows.length > 0) {
      return liveRows;
    }
    return entries.map((e) => ({
      id: e.id,
      rank: e.rank,
      name: e.name,
      tag: e.tag,
      division: e.division,
      matchesPlayed: e.matchesPlayed,
      positionPoints: e.positionPoints,
      eliminationPoints: e.eliminationPoints,
      totalPoints: e.totalPoints,
    }));
  }, [liveRows, entries]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return combinedRows
      .filter((entry) => (division === 'All' ? true : entry.division === division))
      .filter((entry) =>
        q ? entry.name.toLowerCase().includes(q) || entry.tag.toLowerCase().includes(q) : true
      )
      .sort((a, b) => {
        const diff = a[sortKey] - b[sortKey];
        if (diff !== 0) return sortAsc ? diff : -diff;
        return a.rank - b.rank;
      });
  }, [combinedRows, division, query, sortKey, sortAsc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === 'rank');
    }
  };

  return (
    <div className="pb-16">
      <PageMeta
        title="Leaderboard | NexusX Esports India"
        description="Official BGMI tournament standings policy and live rankings for NexusX Esports India. Detailed lobby spreadsheets and room sheets are also shared via email with registered participants."
      />

      <PageHeader
        eyebrow="Standings & BGMI Rankings"
        title="Tournament Leaderboard"
        description="Verified BGMI tournament standings computed from official organizer match results, plus participant email distribution."
        actions={
          liveRows.length > 0 ? (
            <TacticalBadge variant="emerald">Live D1 Rankings</TacticalBadge>
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
              Official Standings Shared via Email
            </strong>
            <p className="text-slate-300 leading-relaxed">
              Official tournament standings will be shared directly with registered participants
              through email. Verified podium winners and tournament recaps are posted on the{' '}
              <Link to="/results" className="text-white underline underline-offset-4 hover:text-[#22C55E]">
                Results page
              </Link>
              .
            </p>
          </div>
        </div>

        {/* Search & Division Filter (shown when live or static entries exist) */}
        {combinedRows.length > 0 && (
          <div className="nx-glass rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Division filter">
              {(['All', 'Solo', 'Duo', 'Squad'] as DivisionFilter[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setDivision(tab)}
                  className={`rounded-lg px-4 py-2 font-mono text-xs uppercase tracking-wider border transition-colors cursor-pointer ${
                    division === tab
                      ? 'bg-[#22C55E] border-[#22C55E] text-[#050709] font-bold'
                      : 'bg-[#080B10] border-white/10 text-slate-300 hover:text-white hover:border-[#22C55E]/40'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-72">
              <Search
                className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
                aria-hidden="true"
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search team or player..."
                aria-label="Search team or player name"
                className="w-full rounded-lg pl-9 pr-3 py-2 bg-[#080B10] border border-white/10 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#22C55E]"
              />
            </div>
          </div>
        )}

        {/* Table or Clean Email-Delivery Empty State */}
        {datasetErrors.leaderboard && combinedRows.length === 0 ? (
          <DataErrorCard
            title="Unable to Load Leaderboard"
            detail={datasetErrors.leaderboard}
            onRetry={() => void reloadData(true)}
          />
        ) : combinedRows.length === 0 ? (
          <div className="nx-glass rounded-2xl p-12 text-center space-y-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/40 text-[#22C55E]">
              <Trophy className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              Leaderboard Distributed via Participant Email
            </h2>
            <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
              Match-by-match points tables are sent directly to registered players and team
              captains via email after each lobby finishes. Check back on the Results page for
              verified tournament winners.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/results"
                className="nx-btn-neon inline-flex items-center px-5 py-2.5 text-xs"
              >
                View Published Results
              </Link>
              <Link
                to="/tournaments"
                className="inline-flex items-center rounded-lg px-5 py-2.5 border border-white/15 hover:border-[#22C55E]/60 text-slate-200 font-display font-bold text-xs uppercase tracking-wider transition-colors"
              >
                Browse Tournaments
              </Link>
            </div>
          </div>
        ) : (
          <div className="nx-glass rounded-2xl overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#080B10]/80 border-b border-white/10 font-mono text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="py-3.5 px-4">
                    <button
                      type="button"
                      onClick={() => toggleSort('rank')}
                      className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                    >
                      Rank <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3.5 px-4">Team / Player Name</th>
                  <th className="py-3.5 px-4">Division</th>
                  <th className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('matchesPlayed')}
                      className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                    >
                      Matches Played <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('positionPoints')}
                      className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                    >
                      Position Points <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('eliminationPoints')}
                      className="inline-flex items-center gap-1 hover:text-white cursor-pointer"
                    >
                      Elimination Points <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                  <th className="py-3.5 px-4 text-right">
                    <button
                      type="button"
                      onClick={() => toggleSort('totalPoints')}
                      className="inline-flex items-center gap-1 text-white hover:text-[#22C55E] cursor-pointer"
                    >
                      Total Points <ArrowUpDown className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRows.map((entry, idx) => {
                  const effectiveRank = sortKey === 'totalPoints' && !sortAsc ? idx + 1 : entry.rank;
                  const isTop3 = effectiveRank <= 3;
                  const rowHighlight =
                    effectiveRank === 1
                      ? 'bg-[#22C55E]/10 border-l-2 border-l-[#22C55E]'
                      : effectiveRank === 2
                      ? 'bg-slate-800/35 border-l-2 border-l-slate-300'
                      : effectiveRank === 3
                      ? 'bg-amber-950/20 border-l-2 border-l-amber-400'
                      : '';

                  return (
                    <tr
                      key={entry.id}
                      className={`hover:bg-[#111820] transition-colors ${rowHighlight}`}
                    >
                      <td className="py-4 px-4 font-mono font-bold">
                        <span
                          className={
                            isTop3
                              ? 'rounded px-2 py-0.5 bg-[#22C55E]/20 border border-[#22C55E]/50 text-[#16FF6E]'
                              : 'text-[#22C55E]'
                          }
                        >
                          #{String(effectiveRank).padStart(2, '0')}
                        </span>
                      </td>
                      <td className="py-4 px-4">
                        {entry.linkTo ? (
                          <Link
                            to={entry.linkTo}
                            className="font-semibold text-white hover:text-[#22C55E] transition-colors"
                          >
                            {entry.name}
                          </Link>
                        ) : (
                          <div className="font-semibold text-white">{entry.name}</div>
                        )}
                        {entry.tag && (
                          <div className="font-mono text-[11px] text-slate-400">[{entry.tag}]</div>
                        )}
                      </td>
                      <td className="py-4 px-4">
                        <TacticalBadge variant={entry.division === 'Squad' ? 'emerald' : 'silver'}>
                          {entry.division}
                        </TacticalBadge>
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-300">
                        {entry.matchesPlayed}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-300">
                        {entry.positionPoints}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-slate-300">
                        {entry.eliminationPoints}
                      </td>
                      <td className="py-4 px-4 text-right font-mono text-base font-bold text-[#16FF6E]">
                        {entry.totalPoints}
                      </td>
                    </tr>
                  );
                })}

                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-slate-400">
                      No leaderboard entries match your search or division filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
