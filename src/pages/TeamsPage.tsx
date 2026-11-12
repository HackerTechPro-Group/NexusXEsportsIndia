import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Search, Shield, Users } from 'lucide-react';
import { fetchPlatformTeams, getPlatformApiBaseUrl, type PlatformTeamSummary } from '../api/platformClient';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';

export const TeamsPage: React.FC = () => {
  const [teams, setTeams] = useState<PlatformTeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [division, setDivision] = useState<'All' | 'Solo' | 'Duo' | 'Squad'>('All');

  const loadTeams = async () => {
    setLoading(true);
    setError('');
    if (!getPlatformApiBaseUrl()) {
      setTeams([]);
      setLoading(false);
      return;
    }
    try {
      const list = await fetchPlatformTeams();
      setTeams(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load BGMI teams.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTeams();
  }, []);

  const filtered = teams.filter((team) => {
    if (division !== 'All' && team.division !== division) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      team.name.toLowerCase().includes(q) ||
      team.tag.toLowerCase().includes(q) ||
      team.captainIgn.toLowerCase().includes(q)
    );
  });

  return (
    <div className="pb-16">
      <PageMeta
        title="BGMI Teams Directory | NexusX Esports India"
        description="Verified BGMI Solo, Duo, and Squad teams competing on NexusX Esports India."
      />
      <PageHeader
        eyebrow="Competitive Rosters"
        title="BGMI Teams Directory"
        description="Registered competitive rosters competing across NexusX Esports India BGMI brackets."
        actions={
          <Link
            to="/player/dashboard"
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 nx-btn-neon font-display font-bold text-xs uppercase tracking-wider"
          >
            Create / Manage Team
          </Link>
        }
      />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <div className="rounded-2xl nx-glass p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {(['All', 'Solo', 'Duo', 'Squad'] as const).map((div) => (
              <button
                key={div}
                type="button"
                onClick={() => setDivision(div)}
                className={`px-4 py-2 rounded-lg font-mono text-xs uppercase tracking-wider border cursor-pointer transition-colors ${
                  division === div
                    ? 'bg-[#22C55E] border-[#22C55E] text-[#050809] font-bold'
                    : 'bg-[#050809] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                {div}
              </button>
            ))}
          </div>
          <label className="relative flex-1 sm:max-w-xs">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search team name, tag, captain..."
              className="w-full rounded-xl bg-[#050809] border border-white/15 pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[#22C55E]"
            />
          </label>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-2xl nx-glass animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <DataErrorCard title="Unable to Load Teams" detail={error} onRetry={() => void loadTeams()} />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl nx-glass p-12 text-center space-y-3">
            <Shield className="h-10 w-10 text-[#22C55E] mx-auto" aria-hidden="true" />
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              No Registered BGMI Teams Found
            </h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Teams created by registered players appear here automatically from the live database.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((team) => (
              <Link
                key={team.id}
                to={`/teams/${team.slug}`}
                className="rounded-2xl nx-glass nx-glass-hover p-6 flex flex-col justify-between gap-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="inline-flex items-center gap-2 font-mono text-xs text-emerald-400">
                      <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/35">
                        [{team.tag}]
                      </span>
                      <span>{team.division}</span>
                    </div>
                    <h2 className="mt-2 font-display text-xl font-bold text-white uppercase">
                      {team.name}
                    </h2>
                  </div>
                  {team.verified && (
                    <CheckCircle2 className="h-5 w-5 text-[#22C55E] shrink-0" aria-label="Verified team" />
                  )}
                </div>
                <p className="text-xs text-slate-400 line-clamp-2">
                  {team.description || 'Competitive BGMI tournament roster.'}
                </p>
                <div className="pt-3 border-t border-white/10 flex items-center justify-between text-xs font-mono text-slate-300">
                  <span>Captain: {team.captainIgn || 'Assigned'}</span>
                  <span className="inline-flex items-center gap-1 text-emerald-300">
                    <Users className="h-3.5 w-3.5" aria-hidden="true" />
                    {team.memberCount} Members
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
