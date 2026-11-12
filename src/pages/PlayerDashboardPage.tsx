import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, LogOut, PlusCircle, Save, Shield, Trophy, User } from 'lucide-react';
import {
  createMyPlayerTeam,
  fetchMyPlayerDashboard,
  updateMyPlayerProfile,
} from '../api/platformClient';
import { usePlayerAuth } from '../context/PlayerAuthContext';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';

export const PlayerDashboardPage: React.FC = () => {
  const { playerUser, csrfToken, isCheckingSession, logout } = usePlayerAuth();
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState<Awaited<ReturnType<typeof fetchMyPlayerDashboard>> | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bannerMsg, setBannerMsg] = useState('');

  const [bgmiIgn, setBgmiIgn] = useState('');
  const [bgmiCharId, setBgmiCharId] = useState('');
  const [roleTag, setRoleTag] = useState('Assaulter');
  const [bio, setBio] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [teamName, setTeamName] = useState('');
  const [teamTag, setTeamTag] = useState('');
  const [teamDivision, setTeamDivision] = useState<'Solo' | 'Duo' | 'Squad'>('Squad');
  const [creatingTeam, setCreatingTeam] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchMyPlayerDashboard();
      setDashboard(data);
      setBgmiIgn(data.player.bgmiIgn);
      setBgmiCharId(data.player.bgmiCharId);
      setRoleTag(data.player.roleTag);
      setBio(data.player.bio);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isCheckingSession && !playerUser) {
      navigate('/player/login', { replace: true });
      return;
    }
    if (playerUser) {
      void loadDashboard();
    }
  }, [isCheckingSession, playerUser, navigate, loadDashboard]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setBannerMsg('');
    setError('');
    try {
      await updateMyPlayerProfile({ bgmiIgn, bgmiCharId, roleTag, bio }, csrfToken);
      setBannerMsg('BGMI player profile updated.');
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Profile update failed.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTeam(true);
    setBannerMsg('');
    setError('');
    try {
      await createMyPlayerTeam({ name: teamName, tag: teamTag, division: teamDivision }, csrfToken);
      setTeamName('');
      setTeamTag('');
      setBannerMsg('New BGMI team created.');
      await loadDashboard();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Team creation failed.');
    } finally {
      setCreatingTeam(false);
    }
  };

  return (
    <div className="pb-16">
      <PageMeta
        title="Player Dashboard | NexusX Esports India"
        description="Manage your BGMI IGN, Character ID, teams, and tournament registration status."
      />
      <PageHeader
        eyebrow="Competitor Account"
        title={dashboard ? `Welcome, ${dashboard.player.bgmiIgn}` : 'Player Dashboard'}
        description="Update your verified BGMI ID, create competitive rosters, and track live tournament registrations."
        actions={
          <button
            type="button"
            onClick={() => void logout().then(() => navigate('/'))}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 border border-white/15 bg-[#0C1216] hover:border-red-500/40 text-xs font-mono uppercase text-slate-200 hover:text-white cursor-pointer"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Sign Out
          </button>
        }
      />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
        {bannerMsg && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-4 flex items-center gap-2 text-sm text-emerald-200">
            <CheckCircle2 className="h-5 w-5 text-[#22C55E]" aria-hidden="true" />
            <span>{bannerMsg}</span>
          </div>
        )}

        {error && <DataErrorCard title="Action Issue" detail={error} onRetry={() => void loadDashboard()} />}

        {loading || !dashboard ? (
          <div className="h-64 rounded-2xl nx-glass animate-pulse" />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Profile Settings (5 cols) */}
            <form onSubmit={handleSaveProfile} className="lg:col-span-5 rounded-2xl nx-glass p-6 space-y-4">
              <div className="flex items-center gap-2">
                <User className="h-5 w-5 text-[#22C55E]" aria-hidden="true" />
                <h2 className="font-display text-xl font-bold text-white uppercase">
                  BGMI Competitor Profile
                </h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                    BGMI IGN
                  </label>
                  <input
                    required
                    value={bgmiIgn}
                    onChange={(e) => setBgmiIgn(e.target.value)}
                    className="w-full rounded-xl bg-[#050809] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                    BGMI Character ID
                  </label>
                  <input
                    required
                    value={bgmiCharId}
                    onChange={(e) => setBgmiCharId(e.target.value)}
                    className="w-full rounded-xl bg-[#050809] border border-white/15 px-3.5 py-2.5 text-sm font-mono text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                  Primary In-Game Role
                </label>
                <select
                  value={roleTag}
                  onChange={(e) => setRoleTag(e.target.value)}
                  className="w-full rounded-xl bg-[#050809] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                >
                  <option value="IGL">IGL</option>
                  <option value="Assaulter">Assaulter</option>
                  <option value="Fragger">Fragger</option>
                  <option value="Sniper">Sniper</option>
                  <option value="Support">Support</option>
                </select>
              </div>
              <div>
                <label className="block font-mono text-[10px] uppercase text-slate-400 mb-1">
                  Competitor Bio
                </label>
                <textarea
                  rows={3}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Share experience, preferred maps, and availability..."
                  className="w-full rounded-xl bg-[#050809] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                />
              </div>
              <button
                type="submit"
                disabled={savingProfile}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl py-3 nx-btn-neon font-display font-bold text-xs uppercase tracking-wider cursor-pointer"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {savingProfile ? 'Saving...' : 'Save BGMI Profile'}
              </button>
            </form>

            {/* Right Column: Teams + Registrations (7 cols) */}
            <div className="lg:col-span-7 space-y-6">
              {/* My Teams */}
              <div className="rounded-2xl nx-glass p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Shield className="h-5 w-5 text-[#22C55E]" aria-hidden="true" />
                    <h2 className="font-display text-xl font-bold text-white uppercase">My Teams</h2>
                  </div>
                </div>

                {dashboard.teams.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {dashboard.teams.map((tm) => (
                      <Link
                        key={tm.id}
                        to={`/teams/${tm.slug}`}
                        className="rounded-xl bg-[#050809] border border-white/10 hover:border-emerald-500/40 p-4 flex items-center justify-between"
                      >
                        <div>
                          <div className="font-mono text-xs text-emerald-400">
                            [{tm.tag}] • {tm.division}
                          </div>
                          <div className="font-display text-base font-bold text-white">{tm.name}</div>
                        </div>
                        <span className="font-mono text-[10px] uppercase px-2 py-1 rounded bg-white/5 text-slate-300">
                          {tm.member_role}
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                <form onSubmit={handleCreateTeam} className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <input
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="New Team Name"
                    className="sm:col-span-2 rounded-xl bg-[#050809] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                  />
                  <input
                    required
                    value={teamTag}
                    onChange={(e) => setTeamTag(e.target.value.toUpperCase())}
                    placeholder="TAG (2-6)"
                    maxLength={8}
                    className="rounded-xl bg-[#050809] border border-white/15 px-3.5 py-2.5 text-sm font-mono uppercase text-white"
                  />
                  <select
                    value={teamDivision}
                    onChange={(e) => setTeamDivision(e.target.value as 'Solo' | 'Duo' | 'Squad')}
                    className="rounded-xl bg-[#050809] border border-white/15 px-3 py-2.5 text-sm text-white"
                  >
                    <option value="Squad">Squad</option>
                    <option value="Duo">Duo</option>
                    <option value="Solo">Solo</option>
                  </select>
                  <button
                    type="submit"
                    disabled={creatingTeam}
                    className="sm:col-span-4 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 border border-emerald-500/35 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 font-display font-semibold text-xs uppercase tracking-wider cursor-pointer"
                  >
                    <PlusCircle className="h-4 w-4" aria-hidden="true" />
                    {creatingTeam ? 'Creating Team...' : 'Create BGMI Team Roster'}
                  </button>
                </form>
              </div>

              {/* My Tournament Registrations */}
              <div className="rounded-2xl nx-glass p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-[#22C55E]" aria-hidden="true" />
                    <h2 className="font-display text-xl font-bold text-white uppercase">
                      Tournament Registrations ({dashboard.registrations.length})
                    </h2>
                  </div>
                  <Link to="/tournaments" className="font-mono text-xs text-emerald-400 hover:underline">
                    Browse Events →
                  </Link>
                </div>

                {dashboard.registrations.length === 0 ? (
                  <p className="text-sm text-slate-400">
                    You have not registered for any BGMI tournaments yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {dashboard.registrations.map((reg) => (
                      <div
                        key={reg.id}
                        className="rounded-xl bg-[#050809] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div>
                          <Link
                            to={`/tournaments/${reg.tournament_slug}`}
                            className="font-display text-base font-bold text-white hover:text-[#22C55E]"
                          >
                            {reg.tournament_title}
                          </Link>
                          <div className="font-mono text-xs text-slate-400 mt-0.5">
                            {reg.division} {reg.team_name ? `• ${reg.team_name}` : ''} • Match Date:{' '}
                            {reg.match_date}
                          </div>
                          {reg.review_notes && (
                            <p className="text-xs text-slate-300 mt-1">Note: {reg.review_notes}</p>
                          )}
                        </div>
                        <span
                          className={`self-start sm:self-center px-3 py-1 rounded-lg font-mono text-xs uppercase font-semibold border ${
                            reg.status === 'approved'
                              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                              : reg.status === 'rejected'
                              ? 'bg-red-950/50 border-red-500/40 text-red-300'
                              : 'bg-amber-950/50 border-amber-500/40 text-amber-300'
                          }`}
                        >
                          {reg.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
