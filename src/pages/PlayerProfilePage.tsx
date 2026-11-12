import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Smartphone, Trophy } from 'lucide-react';
import { fetchPlatformPlayerProfile } from '../api/platformClient';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';

export const PlayerProfilePage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPlatformPlayerProfile>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    let active = true;
    setLoading(true);
    void fetchPlatformPlayerProfile(id)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Player not found.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <div className="pb-16">
      <PageMeta
        title={data ? `${data.player.bgmiIgn} | BGMI Player Profile` : 'Player Profile | NexusX Esports India'}
        description="Official BGMI competitor profile and verified tournament history."
      />
      <PageHeader
        eyebrow={data ? `BGMI ${data.player.roleTag} • ${data.player.region}` : 'BGMI Player Profile'}
        title={data ? data.player.bgmiIgn : 'Competitor Profile'}
        description={data?.player.bio || 'Verified competitive BGMI competitor on NexusX Esports India.'}
        actions={
          <Link
            to="/players"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 border border-white/15 bg-[#0C1216] text-xs font-mono uppercase tracking-wider text-slate-200 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All Players
          </Link>
        }
      />

      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        {loading ? (
          <div className="h-52 rounded-2xl nx-glass animate-pulse" />
        ) : error || !data ? (
          <DataErrorCard title="Player Profile Unavailable" detail={error} />
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="rounded-2xl nx-glass p-6 space-y-3 md:col-span-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs uppercase text-emerald-400">
                    {data.player.roleTag}
                  </span>
                  {data.player.verified && (
                    <span className="inline-flex items-center gap-1 text-xs font-mono text-[#22C55E]">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Verified
                    </span>
                  )}
                </div>
                <div className="font-display text-2xl font-bold text-white">{data.player.bgmiIgn}</div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <Smartphone className="h-4 w-4 text-[#22C55E]" aria-hidden="true" />
                  {data.player.deviceType}
                </div>
                {data.player.team && (
                  <Link
                    to={`/teams/${data.player.team.slug}`}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 font-mono text-xs text-emerald-300 hover:text-white"
                  >
                    [{data.player.team.tag}] {data.player.team.name}
                  </Link>
                )}
              </div>

              <div className="rounded-2xl nx-glass p-6 md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-4 items-center">
                <div className="rounded-xl bg-[#050809] border border-white/10 p-4 text-center">
                  <div className="font-display text-3xl font-bold text-white">{data.player.matchesPlayed}</div>
                  <div className="font-mono text-[10px] uppercase text-slate-400 mt-1">Matches</div>
                </div>
                <div className="rounded-xl bg-[#050809] border border-white/10 p-4 text-center">
                  <div className="font-display text-3xl font-bold text-white">{data.player.totalKills}</div>
                  <div className="font-mono text-[10px] uppercase text-slate-400 mt-1">Finishes</div>
                </div>
                <div className="rounded-xl bg-[#050809] border border-white/10 p-4 text-center">
                  <div className="font-display text-3xl font-bold text-white">{data.player.totalWins}</div>
                  <div className="font-mono text-[10px] uppercase text-slate-400 mt-1">WWCD Wins</div>
                </div>
                <div className="rounded-xl bg-[#050809] border border-emerald-500/30 p-4 text-center">
                  <div className="font-display text-3xl font-bold text-[#22C55E]">{data.player.totalPoints}</div>
                  <div className="font-mono text-[10px] uppercase text-emerald-300 mt-1">Total Points</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl nx-glass p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-[#22C55E]" aria-hidden="true" />
                <h2 className="font-display text-xl font-bold text-white uppercase">Match History</h2>
              </div>
              {data.matchHistory.length === 0 ? (
                <p className="text-sm text-slate-400">No verified match appearances recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 font-mono text-[11px] uppercase text-slate-400">
                        <th className="py-2.5 pr-4">Tournament</th>
                        <th className="py-2.5 pr-4">Match</th>
                        <th className="py-2.5 pr-4">Map</th>
                        <th className="py-2.5 pr-4">Placement</th>
                        <th className="py-2.5 pr-4">Kills</th>
                        <th className="py-2.5">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.matchHistory.map((m) => (
                        <tr key={m.id}>
                          <td className="py-3 pr-4 text-white">{m.tournament_title}</td>
                          <td className="py-3 pr-4 text-slate-300">{m.match_title}</td>
                          <td className="py-3 pr-4 text-slate-400">{m.map}</td>
                          <td className="py-3 pr-4 font-mono text-emerald-300">#{m.placement}</td>
                          <td className="py-3 pr-4 font-mono">{m.kills}</td>
                          <td className="py-3 font-mono font-bold text-white">{m.total_points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
