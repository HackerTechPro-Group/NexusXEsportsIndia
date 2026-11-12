import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Trophy, Users } from 'lucide-react';
import { fetchPlatformTeamDetail } from '../api/platformClient';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';

export const TeamProfilePage: React.FC = () => {
  const { slug = '' } = useParams<{ slug: string }>();
  const [data, setData] = useState<Awaited<ReturnType<typeof fetchPlatformTeamDetail>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    let active = true;
    setLoading(true);
    void fetchPlatformTeamDetail(slug)
      .then((res) => {
        if (active) setData(res);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Team not found.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [slug]);

  return (
    <div className="pb-16">
      <PageMeta
        title={data ? `[${data.team.tag}] ${data.team.name} | NexusX Esports India` : 'Team Profile | NexusX Esports India'}
        description="Official BGMI team roster and verified match results profile."
      />
      <PageHeader
        eyebrow={data ? `${data.team.division} Roster • [${data.team.tag}]` : 'BGMI Team Profile'}
        title={data ? data.team.name : 'Team Roster'}
        description={data?.team.description || 'Competitive BGMI tournament team profile.'}
        actions={
          <Link
            to="/teams"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 border border-white/15 bg-[#0C1216] text-xs font-mono uppercase tracking-wider text-slate-200 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All Teams
          </Link>
        }
      />

      <section className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {loading ? (
          <div className="h-56 rounded-2xl nx-glass animate-pulse" />
        ) : error || !data ? (
          <DataErrorCard title="Team Profile Unavailable" detail={error} />
        ) : (
          <>
            <div className="rounded-2xl nx-glass p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-[#22C55E]" aria-hidden="true" />
                <h2 className="font-display text-2xl font-bold text-white uppercase">
                  Active Roster ({data.members.length})
                </h2>
              </div>
              {data.members.length === 0 ? (
                <p className="text-sm text-slate-400">No players assigned to this roster yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {data.members.map((member) => (
                    <Link
                      key={member.playerId}
                      to={`/players/${member.playerId}`}
                      className="rounded-xl bg-[#050809] border border-white/10 hover:border-emerald-500/40 p-4 space-y-2 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300">
                          {member.memberRole}
                        </span>
                        {member.verified && <CheckCircle2 className="h-4 w-4 text-[#22C55E]" aria-hidden="true" />}
                      </div>
                      <div className="font-display text-lg font-bold text-white">{member.bgmiIgn}</div>
                      <div className="font-mono text-xs text-slate-400">
                        {member.roleTag} • {member.totalPoints} pts
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl nx-glass p-6 space-y-4">
              <div className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-[#22C55E]" aria-hidden="true" />
                <h2 className="font-display text-2xl font-bold text-white uppercase">
                  Verified Match Results
                </h2>
              </div>
              {data.recentResults.length === 0 ? (
                <p className="text-sm text-slate-400">No verified tournament match results recorded for this team yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/10 font-mono text-[11px] uppercase text-slate-400">
                        <th className="py-2.5 pr-4">Tournament</th>
                        <th className="py-2.5 pr-4">Match / Map</th>
                        <th className="py-2.5 pr-4">Placement</th>
                        <th className="py-2.5 pr-4">Kills</th>
                        <th className="py-2.5">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {data.recentResults.map((row) => (
                        <tr key={row.id}>
                          <td className="py-3 pr-4 font-medium text-white">{row.tournament_title}</td>
                          <td className="py-3 pr-4 text-slate-300">
                            {row.match_title} ({row.map})
                          </td>
                          <td className="py-3 pr-4 font-mono text-emerald-300">#{row.placement}</td>
                          <td className="py-3 pr-4 font-mono text-slate-300">{row.kills}</td>
                          <td className="py-3 font-mono font-bold text-white">{row.total_points}</td>
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
