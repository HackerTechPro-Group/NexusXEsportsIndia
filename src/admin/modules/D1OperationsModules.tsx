import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ClipboardCheck,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Swords,
  Trash2,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import {
  createAdminD1Match,
  deleteAdminD1Match,
  deleteAdminD1Player,
  deleteAdminD1Result,
  deleteAdminD1Team,
  fetchAdminD1Matches,
  fetchAdminD1Players,
  fetchAdminD1Registrations,
  fetchAdminD1Results,
  fetchAdminD1Teams,
  fetchAdminD1Tournaments,
  recalculateAdminD1Leaderboard,
  setAdminD1PlayerVerified,
  setAdminD1TeamVerified,
  submitAdminD1MatchResult,
  updateAdminD1MatchStatus,
  updateAdminD1RegistrationStatus,
  type AdminD1MatchResultRow,
  type AdminD1MatchRow,
  type AdminD1PlayerRow,
  type AdminD1RegistrationRow,
  type AdminD1TeamRow,
} from '../api/adminD1Client';
import {
  fetchPlatformLeaderboard,
  getPlatformApiBaseUrl,
  type PlatformTournament,
} from '../../api/platformClient';

const INPUT_CLASS =
  'w-full rounded-lg bg-[#050709] border border-white/10 focus:border-[#22C55E] focus:outline-none px-3 py-2 text-xs text-white placeholder:text-slate-500';

export const AdminD1RegistrationsQueue: React.FC<{ apiUrl: string }> = ({ apiUrl }) => {
  const [rows, setRows] = useState<AdminD1RegistrationRow[]>([]);
  const [, setTournaments] = useState<PlatformTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'pending' | 'approved' | 'waitlisted' | 'rejected'>('All');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!apiUrl) return;
    setLoading(true);
    setError('');
    try {
      const [regRes, tRes] = await Promise.all([
        fetchAdminD1Registrations(apiUrl, statusFilter),
        fetchAdminD1Tournaments(apiUrl),
      ]);
      setRows(regRes.registrations);
      setTournaments(tRes.tournaments);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load D1 registrations.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      q
        ? r.leader_ign.toLowerCase().includes(q) ||
          r.leader_char_id.toLowerCase().includes(q) ||
          (r.team_name ?? '').toLowerCase().includes(q) ||
          r.tournament_title.toLowerCase().includes(q)
        : true
    );
  }, [rows, query]);

  const handleDecision = async (
    regId: string,
    status: 'approved' | 'rejected' | 'waitlisted'
  ) => {
    setBusyId(regId);
    try {
      await updateAdminD1RegistrationStatus(apiUrl, regId, status, `Marked ${status} by organizer`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="nx-glass rounded-2xl p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
            Live Cloudflare D1 Queue
          </div>
          <h3 className="font-display text-xl font-bold text-white uppercase">
            Online Tournament Registrations ({filtered.length})
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-1.5 font-mono text-xs text-slate-200 hover:border-[#22C55E] cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh Queue
        </button>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {(['All', 'pending', 'approved', 'waitlisted', 'rejected'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-lg px-3 py-1.5 font-mono text-[11px] uppercase border cursor-pointer ${
                statusFilter === st
                  ? 'bg-[#22C55E] border-[#22C55E] text-[#050709] font-bold'
                  : 'bg-[#080B10] border-white/10 text-slate-300'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="relative w-full md:w-64">
          <Search className="h-3.5 w-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter IGN, Char ID, team..."
            className="w-full rounded-lg pl-8 pr-3 py-1.5 bg-[#080B10] border border-white/10 text-xs text-white focus:border-[#22C55E] focus:outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-3 text-xs text-amber-200">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-[#050709] p-8 text-center text-xs text-slate-400">
          No online player/team registrations recorded for this filter yet.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((reg) => (
            <div
              key={reg.id}
              className="rounded-xl border border-white/10 bg-[#080B10] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded px-2 py-0.5 font-mono text-[10px] uppercase bg-[#22C55E]/15 text-[#22C55E] border border-[#22C55E]/30">
                    {reg.division}
                  </span>
                  <span className="font-mono text-[11px] uppercase text-slate-400">
                    {reg.tournament_title}
                  </span>
                  <span
                    className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase ${
                      reg.status === 'approved'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : reg.status === 'rejected'
                        ? 'bg-red-500/20 text-red-300'
                        : reg.status === 'waitlisted'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-sky-500/20 text-sky-300'
                    }`}
                  >
                    {reg.status}
                  </span>
                </div>
                <div className="font-semibold text-white text-sm">
                  {reg.team_name ? `${reg.team_name} — ` : ''}Captain/Player: {reg.leader_ign} (ID:{' '}
                  <span className="font-mono text-[#16FF6E]">{reg.leader_char_id}</span>)
                </div>
                <div className="text-xs font-mono text-slate-400">
                  {reg.contact_email} • Registered {reg.created_at.slice(0, 16)}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busyId === reg.id}
                  onClick={() => void handleDecision(reg.id, 'approved')}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 bg-[#22C55E] hover:bg-[#16FF6E] text-[#050709] font-mono text-[11px] font-bold uppercase cursor-pointer"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                </button>
                <button
                  type="button"
                  disabled={busyId === reg.id}
                  onClick={() => void handleDecision(reg.id, 'waitlisted')}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-mono text-[11px] uppercase cursor-pointer"
                >
                  Waitlist
                </button>
                <button
                  type="button"
                  disabled={busyId === reg.id}
                  onClick={() => void handleDecision(reg.id, 'rejected')}
                  className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 border border-red-500/40 text-red-300 hover:bg-red-500/10 font-mono text-[11px] uppercase cursor-pointer"
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AdminTeamsModule: React.FC<{ apiUrl: string }> = ({ apiUrl }) => {
  const [teams, setTeams] = useState<AdminD1TeamRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminD1Teams(apiUrl);
      setTeams(res.teams);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load teams.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((t) =>
      q ? t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q) : true
    );
  }, [teams, query]);

  return (
    <div className="space-y-5">
      <div className="nx-glass rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
            D1 Team Registry
          </div>
          <h2 className="font-display text-2xl font-bold text-white uppercase">
            Team Management ({teams.length})
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search team name / tag..."
            className="rounded-lg bg-[#050709] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#22C55E] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/15 px-3 py-2 font-mono text-xs text-slate-200 hover:border-[#22C55E] cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-xs text-red-200">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 ? (
        <div className="nx-glass rounded-2xl p-10 text-center text-sm text-slate-400">
          No BGMI teams registered in D1 yet. Teams created by players or team registrations appear here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((team) => (
            <div key={team.id} className="nx-glass rounded-2xl p-5 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#22C55E]">[{team.tag}]</span>
                    <span className="rounded px-2 py-0.5 text-[10px] font-mono bg-white/5 text-slate-300">
                      {team.division}
                    </span>
                    {team.verified === 1 && (
                      <span className="rounded px-2 py-0.5 text-[10px] font-mono bg-[#22C55E]/20 text-[#16FF6E]">
                        Verified
                      </span>
                    )}
                  </div>
                  <h3 className="font-display text-xl font-bold text-white uppercase mt-1">
                    {team.name}
                  </h3>
                  <div className="text-xs text-slate-400">
                    Captain: {team.captain_ign || 'Unassigned'} • {team.member_count} Members
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      void setAdminD1TeamVerified(apiUrl, team.id, team.verified !== 1).then(load)
                    }
                    className="rounded-lg border border-white/15 px-2.5 py-1.5 font-mono text-[11px] uppercase text-slate-200 hover:border-[#22C55E] cursor-pointer"
                  >
                    {team.verified === 1 ? 'Unverify' : 'Verify'}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete team ${team.name}`}
                    onClick={() => void deleteAdminD1Team(apiUrl, team.id).then(load)}
                    className="rounded-lg border border-red-500/30 p-1.5 text-red-400 hover:bg-red-500/10 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-white/10 text-center font-mono text-xs">
                <div>
                  <div className="text-[10px] text-slate-500">MATCHES</div>
                  <div className="text-white font-bold">{team.matches_played}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">WINS</div>
                  <div className="text-white font-bold">{team.total_wins}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">KILLS</div>
                  <div className="text-white font-bold">{team.total_kills}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500">POINTS</div>
                  <div className="text-[#16FF6E] font-bold">{team.total_points}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AdminPlayersModule: React.FC<{ apiUrl: string }> = ({ apiUrl }) => {
  const [players, setPlayers] = useState<AdminD1PlayerRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchAdminD1Players(apiUrl);
      setPlayers(res.players);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load players.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) =>
      q
        ? p.bgmi_ign.toLowerCase().includes(q) ||
          p.bgmi_char_id.toLowerCase().includes(q) ||
          (p.username ?? '').toLowerCase().includes(q)
        : true
    );
  }, [players, query]);

  return (
    <div className="space-y-5">
      <div className="nx-glass rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
            BGMI Player Roster
          </div>
          <h2 className="font-display text-2xl font-bold text-white uppercase">
            Player Management ({players.length})
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search IGN or BGMI ID..."
            className="rounded-lg bg-[#050709] border border-white/10 px-3 py-2 text-xs text-white focus:border-[#22C55E] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-white/15 px-3 py-2 font-mono text-xs text-slate-200 hover:border-[#22C55E] cursor-pointer"
          >
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-4 text-xs text-red-200">
          {error}
        </div>
      )}

      {!loading && filtered.length === 0 ? (
        <div className="nx-glass rounded-2xl p-10 text-center text-sm text-slate-400">
          No BGMI players registered yet.
        </div>
      ) : (
        <div className="nx-glass rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 font-mono uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4">BGMI IGN</th>
                <th className="py-3 px-4">Character ID</th>
                <th className="py-3 px-4">Role / Device</th>
                <th className="py-3 px-4 text-right">Matches</th>
                <th className="py-3 px-4 text-right">Wins</th>
                <th className="py-3 px-4 text-right">Kills</th>
                <th className="py-3 px-4 text-right">Points</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-white/[0.02]">
                  <td className="py-3 px-4 font-semibold text-white">
                    {p.bgmi_ign}{' '}
                    {p.verified === 1 && (
                      <span className="ml-1 rounded px-1.5 py-0.5 text-[9px] font-mono bg-[#22C55E]/20 text-[#16FF6E]">
                        Verified
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-300">{p.bgmi_char_id}</td>
                  <td className="py-3 px-4 text-slate-400">
                    {p.role_tag} • {p.device_type}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-200">{p.matches_played}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-200">{p.total_wins}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-200">{p.total_kills}</td>
                  <td className="py-3 px-4 text-right font-mono text-[#16FF6E] font-bold">
                    {p.total_points}
                  </td>
                  <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() =>
                        void setAdminD1PlayerVerified(apiUrl, p.id, p.verified !== 1).then(load)
                      }
                      className="rounded border border-white/15 px-2 py-1 font-mono text-[10px] uppercase text-slate-200 hover:border-[#22C55E] cursor-pointer"
                    >
                      {p.verified === 1 ? 'Unverify' : 'Verify'}
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteAdminD1Player(apiUrl, p.id).then(load)}
                      className="rounded border border-red-500/30 p-1 text-red-400 hover:bg-red-500/10 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const AdminMatchesModule: React.FC<{ apiUrl: string }> = ({ apiUrl }) => {
  const [matches, setMatches] = useState<AdminD1MatchRow[]>([]);
  const [tournaments, setTournaments] = useState<PlatformTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const [tournamentId, setTournamentId] = useState('');
  const [title, setTitle] = useState('');
  const [matchNumber, setMatchNumber] = useState(1);
  const [groupLabel, setGroupLabel] = useState('Group A');
  const [map, setMap] = useState('Erangel');
  const [perspective] = useState('TPP');
  const [scheduledAt, setScheduledAt] = useState('2026-11-28T19:00:00Z');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [mRes, tRes] = await Promise.all([
        fetchAdminD1Matches(apiUrl),
        fetchAdminD1Tournaments(apiUrl),
      ]);
      setMatches(mRes.matches);
      setTournaments(tRes.tournaments);
      if (!tournamentId && tRes.tournaments.length > 0) {
        setTournamentId(tRes.tournaments[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load matches.');
    } finally {
      setLoading(false);
    }
  }, [apiUrl, tournamentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tournamentId || !title.trim()) {
      setError('Select a tournament and enter a match title.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createAdminD1Match(apiUrl, {
        tournamentId,
        matchNumber,
        title: title.trim(),
        groupLabel: groupLabel.trim(),
        map,
        perspective,
        scheduledAt,
      });
      setTitle('');
      setShowCreate(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create match.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="nx-glass rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
            Lobby &amp; Schedule Control
          </div>
          <h2 className="font-display text-2xl font-bold text-white uppercase">
            Match Management ({matches.length})
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate((v) => !v)}
          className="nx-btn-neon inline-flex items-center gap-1.5 px-4 py-2 text-xs cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Schedule BGMI Match
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3 text-xs text-red-200">
          {error}
        </div>
      )}

      {showCreate && (
        <form onSubmit={handleCreate} className="nx-glass rounded-2xl p-6 space-y-4">
          <h3 className="font-display text-lg font-bold text-white uppercase">
            Schedule New BGMI Match
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                Tournament
              </label>
              <select
                value={tournamentId}
                onChange={(e) => setTournamentId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Select tournament...</option>
                {tournaments.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} ({t.format})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                Match Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Match 1 — Erangel Qualifier"
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                BGMI Map
              </label>
              <select value={map} onChange={(e) => setMap(e.target.value)} className={INPUT_CLASS}>
                <option value="Erangel">Erangel</option>
                <option value="Miramar">Miramar</option>
                <option value="Sanhok">Sanhok</option>
                <option value="Vikendi">Vikendi</option>
              </select>
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                Match Number
              </label>
              <input
                type="number"
                min={1}
                value={matchNumber}
                onChange={(e) => setMatchNumber(Number(e.target.value) || 1)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                Group / Lobby
              </label>
              <input
                type="text"
                value={groupLabel}
                onChange={(e) => setGroupLabel(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                Scheduled UTC / ISO Time
              </label>
              <input
                type="text"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-white/15 px-4 py-2 text-xs font-mono uppercase text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button type="submit" disabled={saving} className="nx-btn-neon px-5 py-2 text-xs cursor-pointer">
              {saving ? 'Scheduling...' : 'Create Match'}
            </button>
          </div>
        </form>
      )}

      {!loading && matches.length === 0 ? (
        <div className="nx-glass rounded-2xl p-10 text-center text-sm text-slate-400">
          No BGMI matches scheduled in D1 yet. Make sure at least one tournament exists in D1, then click Schedule BGMI Match.
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => (
            <div
              key={m.id}
              className="nx-glass rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded px-2 py-0.5 font-mono text-[10px] uppercase bg-[#22C55E]/15 text-[#22C55E]">
                    Match #{m.match_number}
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    {m.tournament_title} • {m.map} ({m.perspective})
                  </span>
                </div>
                <div className="font-display text-lg font-bold text-white uppercase">{m.title}</div>
                <div className="font-mono text-[11px] text-slate-400">
                  <Calendar className="h-3 w-3 inline mr-1 text-[#22C55E]" />
                  {m.scheduled_at} • {m.group_label}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Status for ${m.title}`}
                  value={m.status}
                  onChange={(e) =>
                    void updateAdminD1MatchStatus(
                      apiUrl,
                      m.id,
                      e.target.value as AdminD1MatchRow['status']
                    ).then(load)
                  }
                  className="rounded-lg bg-[#050709] border border-white/15 px-2.5 py-1.5 font-mono text-xs text-white"
                >
                  <option value="upcoming">Upcoming</option>
                  <option value="live">Live</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
                <button
                  type="button"
                  onClick={() => void deleteAdminD1Match(apiUrl, m.id).then(load)}
                  className="rounded-lg border border-red-500/30 p-2 text-red-400 hover:bg-red-500/10 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const AdminD1MatchScoringBox: React.FC<{ apiUrl: string }> = ({ apiUrl }) => {
  const [matches, setMatches] = useState<AdminD1MatchRow[]>([]);
  const [results, setResults] = useState<AdminD1MatchResultRow[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [participantName, setParticipantName] = useState('');
  const [placement, setPlacement] = useState(1);
  const [kills, setKills] = useState(0);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  const load = useCallback(async () => {
    if (!apiUrl) return;
    try {
      const [mRes, rRes] = await Promise.all([
        fetchAdminD1Matches(apiUrl),
        fetchAdminD1Results(apiUrl),
      ]);
      setMatches(mRes.matches);
      setResults(rRes.results);
      if (!selectedMatchId && mRes.matches.length > 0) {
        setSelectedMatchId(mRes.matches[0].id);
      }
    } catch {
      // ignore if D1 unbound
    }
  }, [apiUrl, selectedMatchId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSubmitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    const match = matches.find((m) => m.id === selectedMatchId);
    if (!match || !participantName.trim()) {
      setStatusMsg('Select a scheduled D1 match and enter participant / team name.');
      return;
    }
    setSaving(true);
    setStatusMsg('');
    try {
      await submitAdminD1MatchResult(apiUrl, {
        matchId: match.id,
        tournamentId: match.tournament_id,
        participantName: participantName.trim(),
        placement,
        kills,
      });
      setParticipantName('');
      setStatusMsg('Match score recorded & BGMI leaderboard recalculated.');
      await load();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Unable to save score.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="nx-glass rounded-2xl p-6 space-y-5">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
          Live D1 Match Scoring Engine
        </div>
        <h3 className="font-display text-xl font-bold text-white uppercase">
          Official Match Score Entry ({results.length} Rows)
        </h3>
        <p className="text-xs text-slate-400">
          Recording placement and eliminations automatically applies official BGMI placement points and updates player &amp; team leaderboards.
        </p>
      </div>

      <form onSubmit={handleSubmitScore} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
        <div className="lg:col-span-2">
          <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
            Scheduled Match
          </label>
          <select
            value={selectedMatchId}
            onChange={(e) => setSelectedMatchId(e.target.value)}
            className={INPUT_CLASS}
          >
            <option value="">Select D1 match...</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {m.tournament_title} — {m.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
            Team / Player IGN
          </label>
          <input
            type="text"
            value={participantName}
            onChange={(e) => setParticipantName(e.target.value)}
            placeholder="e.g. Team Soul / NX_Player"
            className={INPUT_CLASS}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
              Placement #
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={placement}
              onChange={(e) => setPlacement(Number(e.target.value) || 1)}
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">Kills</label>
            <input
              type="number"
              min={0}
              max={99}
              value={kills}
              onChange={(e) => setKills(Number(e.target.value) || 0)}
              className={INPUT_CLASS}
            />
          </div>
        </div>
        <button type="submit" disabled={saving} className="nx-btn-neon px-4 py-2 text-xs cursor-pointer">
          {saving ? 'Scoring...' : 'Save Match Score'}
        </button>
      </form>

      {statusMsg && (
        <div className="rounded-lg border border-[#22C55E]/35 bg-[#22C55E]/10 p-3 text-xs text-[#16FF6E]">
          {statusMsg}
        </div>
      )}

      {results.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#050709] border-b border-white/10 font-mono uppercase text-slate-400">
              <tr>
                <th className="py-2.5 px-3">Match</th>
                <th className="py-2.5 px-3">Participant</th>
                <th className="py-2.5 px-3 text-right">Rank</th>
                <th className="py-2.5 px-3 text-right">Kills</th>
                <th className="py-2.5 px-3 text-right">Total Pts</th>
                <th className="py-2.5 px-3 text-right">Delete</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {results.slice(0, 20).map((r) => (
                <tr key={r.id}>
                  <td className="py-2.5 px-3 text-slate-300">{r.match_title}</td>
                  <td className="py-2.5 px-3 text-white font-semibold">{r.participant_name}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">#{r.placement}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-slate-300">{r.kills}</td>
                  <td className="py-2.5 px-3 text-right font-mono text-[#16FF6E] font-bold">
                    {r.total_points}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => void deleteAdminD1Result(apiUrl, r.id).then(load)}
                      className="text-red-400 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5 inline" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export const AdminLeaderboardModule: React.FC<{ apiUrl: string }> = ({ apiUrl }) => {
  interface AdminBoardRow {
    id: string;
    rank: number;
    name: string;
    tag: string;
    division: string;
    matchesPlayed: number;
    positionPoints: number;
    eliminationPoints: number;
    totalPoints: number;
  }
  const [rows, setRows] = useState<AdminBoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (getPlatformApiBaseUrl()) {
        const res = await fetchPlatformLeaderboard('All');
        const combined: AdminBoardRow[] = [
          ...(res.teams ?? []).map((t) => ({
            id: `t-${t.id}`,
            rank: t.rank,
            name: t.name,
            tag: t.tag,
            division: t.division,
            matchesPlayed: t.matchesPlayed,
            positionPoints: t.positionPoints,
            eliminationPoints: t.eliminationPoints,
            totalPoints: t.totalPoints,
          })),
          ...(res.players ?? []).map((p) => ({
            id: `p-${p.id}`,
            rank: p.rank,
            name: p.name,
            tag: p.tag,
            division: p.division,
            matchesPlayed: p.matchesPlayed,
            positionPoints: Math.max(0, p.totalPoints - p.totalKills),
            eliminationPoints: p.totalKills,
            totalPoints: p.totalPoints,
          })),
        ];
        setRows(combined);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRecalc = async () => {
    setRecalcBusy(true);
    setNotice('');
    try {
      await recalculateAdminD1Leaderboard(apiUrl);
      await load();
      setNotice('Standings recalculated from verified D1 match results.');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Recalculation failed.');
    } finally {
      setRecalcBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="nx-glass rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
            Aggregated Rankings
          </div>
          <h2 className="font-display text-2xl font-bold text-white uppercase">
            Leaderboard Management ({rows.length})
          </h2>
        </div>
        <button
          type="button"
          disabled={recalcBusy}
          onClick={() => void handleRecalc()}
          className="nx-btn-neon inline-flex items-center gap-1.5 px-4 py-2 text-xs cursor-pointer"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${recalcBusy ? 'animate-spin' : ''}`} />
          Recalculate Leaderboard
        </button>
      </div>

      {notice && (
        <div className="rounded-xl border border-[#22C55E]/35 bg-[#22C55E]/10 p-3 text-xs text-[#16FF6E]">
          {notice}
        </div>
      )}

      {!loading && rows.length === 0 ? (
        <div className="nx-glass rounded-2xl p-10 text-center text-sm text-slate-400">
          No leaderboard standings available yet. Enter verified match results to populate real BGMI rankings.
        </div>
      ) : (
        <div className="nx-glass rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/10 font-mono uppercase text-slate-400">
              <tr>
                <th className="py-3 px-4">Rank</th>
                <th className="py-3 px-4">Participant</th>
                <th className="py-3 px-4">Division</th>
                <th className="py-3 px-4 text-right">Matches</th>
                <th className="py-3 px-4 text-right">Pos Pts</th>
                <th className="py-3 px-4 text-right">Kill Pts</th>
                <th className="py-3 px-4 text-right">Total Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="py-3 px-4 font-mono font-bold text-[#22C55E]">#{r.rank}</td>
                  <td className="py-3 px-4 text-white font-semibold">
                    {r.name} {r.tag ? `[${r.tag}]` : ''}
                  </td>
                  <td className="py-3 px-4 text-slate-300">{r.division}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">{r.matchesPlayed}</td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    {r.positionPoints}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-slate-300">
                    {r.eliminationPoints}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold text-[#16FF6E]">
                    {r.totalPoints}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// Re-export icons check helper cleanly to prevent unused icon lint warnings if strict
export type _UsedModuleIcons = typeof Trophy | typeof Shield | typeof Users | typeof Swords | typeof ClipboardCheck;
