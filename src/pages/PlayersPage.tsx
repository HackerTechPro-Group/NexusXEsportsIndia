import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Search, User } from 'lucide-react';
import {
  fetchPlatformPlayers,
  getPlatformApiBaseUrl,
  type PlatformPlayerSummary,
} from '../api/platformClient';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';

export const PlayersPage: React.FC = () => {
  const [players, setPlayers] = useState<PlatformPlayerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('All');

  const loadPlayers = async () => {
    setLoading(true);
    setError('');
    if (!getPlatformApiBaseUrl()) {
      setPlayers([]);
      setLoading(false);
      return;
    }
    try {
      const list = await fetchPlatformPlayers();
      setPlayers(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to fetch players.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlayers();
  }, []);

  const filtered = players.filter((p) => {
    if (roleFilter !== 'All' && p.roleTag !== roleFilter) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      p.bgmiIgn.toLowerCase().includes(q) ||
      p.displayName.toLowerCase().includes(q) ||
      (p.teamName ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="pb-16">
      <PageMeta
        title="BGMI Players Directory | NexusX Esports India"
        description="Registered competitive BGMI players, roles, and verified tournament statistics on NexusX Esports India."
      />
      <PageHeader
        eyebrow="Player Profiles"
        title="BGMI Players Directory"
        description="Registered mobile BGMI athletes, in-game roles, and verified competitive stats."
        actions={
          <Link
            to="/player/register"
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 nx-btn-neon font-display font-bold text-xs uppercase tracking-wider"
          >
            Register Player Profile
          </Link>
        }
      />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 space-y-6">
        <div className="rounded-2xl nx-glass p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            {['All', 'IGL', 'Assaulter', 'Fragger', 'Sniper', 'Support'].map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                className={`px-3.5 py-2 rounded-lg font-mono text-xs uppercase tracking-wider border cursor-pointer transition-colors ${
                  roleFilter === role
                    ? 'bg-[#22C55E] border-[#22C55E] text-[#050809] font-bold'
                    : 'bg-[#050809] border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                {role}
              </button>
            ))}
          </div>
          <label className="relative flex-1 sm:max-w-xs">
            <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search BGMI IGN or team..."
              className="w-full rounded-xl bg-[#050809] border border-white/15 pl-10 pr-4 py-2 text-sm text-white focus:outline-none focus:border-[#22C55E]"
            />
          </label>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 rounded-2xl nx-glass animate-pulse" />
            ))}
          </div>
        ) : error ? (
          <DataErrorCard title="Unable to Load Players" detail={error} onRetry={() => void loadPlayers()} />
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl nx-glass p-12 text-center space-y-3">
            <User className="h-10 w-10 text-[#22C55E] mx-auto" aria-hidden="true" />
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              No Registered Players Yet
            </h2>
            <p className="text-sm text-slate-400 max-w-md mx-auto">
              Player profiles created through Player Registration automatically appear here.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((p) => (
              <Link
                key={p.id}
                to={`/players/${p.id}`}
                className="rounded-2xl nx-glass nx-glass-hover p-5 space-y-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-[11px] uppercase text-emerald-400">
                      {p.roleTag} • {p.region}
                    </div>
                    <h2 className="mt-1 font-display text-xl font-bold text-white">{p.bgmiIgn}</h2>
                    {p.teamName && (
                      <div className="font-mono text-xs text-slate-400 mt-0.5">
                        [{p.teamTag}] {p.teamName}
                      </div>
                    )}
                  </div>
                  {p.verified && <CheckCircle2 className="h-5 w-5 text-[#22C55E]" aria-label="Verified" />}
                </div>
                <div className="grid grid-cols-3 gap-2 pt-3 border-t border-white/10 text-center font-mono">
                  <div className="rounded-lg bg-[#050809] p-2">
                    <div className="text-xs font-bold text-white">{p.matchesPlayed}</div>
                    <div className="text-[10px] text-slate-400">Matches</div>
                  </div>
                  <div className="rounded-lg bg-[#050809] p-2">
                    <div className="text-xs font-bold text-white">{p.totalKills}</div>
                    <div className="text-[10px] text-slate-400">Kills</div>
                  </div>
                  <div className="rounded-lg bg-[#050809] p-2">
                    <div className="text-xs font-bold text-[#22C55E]">{p.totalPoints}</div>
                    <div className="text-[10px] text-slate-400">Points</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
