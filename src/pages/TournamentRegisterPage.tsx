import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ExternalLink, ShieldAlert, Trophy, Users } from 'lucide-react';
import {
  fetchMyPlayerDashboard,
  fetchPlatformTournamentDetail,
  getPlatformApiBaseUrl,
  submitPlatformTournamentRegistration,
  type PlatformTournament,
} from '../api/platformClient';
import { useSiteData } from '../context/SiteDataContext';
import { useOptionalPlayerAuth } from '../context/PlayerAuthContext';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { validateHttpsUrl } from '../utils/validation';

interface RosterEntryState {
  ign: string;
  charId: string;
  role: string;
}

export const TournamentRegisterPage: React.FC<{ divisionOverride?: 'Solo' | 'Duo' | 'Squad' }> = ({
  divisionOverride,
}) => {
  const { slug } = useParams<{ slug?: string }>();
  const { publishedTournaments } = useSiteData();
  const playerAuth = useOptionalPlayerAuth();

  const [selectedSlug, setSelectedSlug] = useState(slug ?? '');
  const [liveTourn, setLiveTourn] = useState<PlatformTournament | null>(null);
  const [myTeams, setMyTeams] = useState<Array<{ id: string; name: string; tag: string; division: string }>>([]);

  const matchedStatic =
    publishedTournaments.find((t) => (selectedSlug ? t.slug === selectedSlug || t.id === selectedSlug : divisionOverride ? t.format === divisionOverride : false)) ??
    null;

  const activeFormat = liveTourn?.format ?? matchedStatic?.format ?? divisionOverride ?? 'Squad';
  const requiredCount = activeFormat === 'Solo' ? 1 : activeFormat === 'Duo' ? 2 : 4;

  const [teamId, setTeamId] = useState('');
  const [teamName, setTeamName] = useState('');
  const [leaderIgn, setLeaderIgn] = useState('');
  const [leaderCharId, setLeaderCharId] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactDiscord, setContactDiscord] = useState('');
  const [roster, setRoster] = useState<RosterEntryState[]>(() =>
    Array.from({ length: requiredCount }, (_, idx) => ({
      ign: '',
      charId: '',
      role: idx === 0 ? 'Captain' : 'Player',
    }))
  );

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successInfo, setSuccessInfo] = useState<{
    registrationId: string;
    status: 'pending' | 'waitlisted';
  } | null>(null);

  useEffect(() => {
    if (slug) {
      setSelectedSlug(slug);
    } else if (divisionOverride) {
      const firstMatch = publishedTournaments.find((t) => t.format === divisionOverride);
      if (firstMatch) setSelectedSlug(firstMatch.slug);
    }
  }, [slug, divisionOverride, publishedTournaments]);

  useEffect(() => {
    setRoster((prev) => {
      const next: RosterEntryState[] = [];
      for (let i = 0; i < requiredCount; i += 1) {
        next.push(
          prev[i] ?? {
            ign: '',
            charId: '',
            role: i === 0 ? 'Captain' : 'Player',
          }
        );
      }
      return next;
    });
  }, [requiredCount]);

  useEffect(() => {
    if (!selectedSlug || !getPlatformApiBaseUrl()) return;
    let mounted = true;
    void fetchPlatformTournamentDetail(selectedSlug)
      .then((res) => {
        if (mounted) setLiveTourn(res.tournament);
      })
      .catch(() => {
        if (mounted) setLiveTourn(null);
      });
    return () => {
      mounted = false;
    };
  }, [selectedSlug]);

  useEffect(() => {
    if (!playerAuth?.playerUser || !getPlatformApiBaseUrl()) return;
    let mounted = true;
    void fetchMyPlayerDashboard()
      .then((dash) => {
        if (!mounted) return;
        setLeaderIgn((prev) => prev || dash.player.bgmiIgn);
        setLeaderCharId((prev) => prev || dash.player.bgmiCharId);
        setContactEmail((prev) => prev || dash.player.email);
        setMyTeams(dash.teams);
        setRoster((prev) =>
          prev.map((row, idx) =>
            idx === 0
              ? {
                  ...row,
                  ign: row.ign || dash.player.bgmiIgn,
                  charId: row.charId || dash.player.bgmiCharId,
                }
              : row
          )
        );
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [playerAuth?.playerUser]);

  const activeTournId = liveTourn?.id ?? matchedStatic?.id ?? '';
  const activeTitle = liveTourn?.title ?? matchedStatic?.title ?? `${activeFormat} BGMI Tournament`;
  const externalFormUrl = liveTourn?.externalFormUrl ?? matchedStatic?.registration.formUrl ?? '';
  const externalValid = externalFormUrl ? validateHttpsUrl(externalFormUrl, 'Form URL').valid : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!activeTournId) {
      setErrorMsg('Please select an active published BGMI tournament first.');
      return;
    }

    const syncedRoster = roster.map((row, idx) =>
      idx === 0
        ? {
            ign: row.ign.trim() || leaderIgn.trim(),
            charId: row.charId.trim() || leaderCharId.trim(),
            role: 'Captain',
          }
        : row
    );

    setSubmitting(true);
    try {
      const res = await submitPlatformTournamentRegistration(
        activeTournId,
        {
          teamId: teamId || undefined,
          teamName: activeFormat === 'Solo' ? '' : teamName.trim(),
          leaderIgn: leaderIgn.trim(),
          leaderCharId: leaderCharId.trim(),
          contactEmail: contactEmail.trim(),
          contactDiscord: contactDiscord.trim(),
          roster: syncedRoster,
        },
        playerAuth?.csrfToken
      );
      setSuccessInfo({ registrationId: res.registrationId, status: res.status });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to submit registration.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="pb-20">
      <PageMeta
        title={`${activeFormat} Registration | NexusX Esports India`}
        description={`Official BGMI ${activeFormat} registration portal for NexusX Esports India.`}
      />

      <PageHeader
        eyebrow={`BGMI ${activeFormat} Registration`}
        title={activeTitle}
        description="Submit your verified BGMI In-Game Name, Character ID, and roster details. Duplicate BGMI IDs are blocked and slots are enforced live."
        actions={
          <Link
            to="/tournaments"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 border border-white/15 bg-[#0C1216] text-xs font-mono uppercase tracking-wider text-slate-200 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All Tournaments
          </Link>
        }
      />

      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-10">
        {!activeTournId ? (
          <div className="rounded-2xl nx-glass p-8 text-center space-y-4">
            <Trophy className="h-10 w-10 text-[#22C55E] mx-auto" aria-hidden="true" />
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              No Open {activeFormat} Tournament Selected
            </h2>
            <p className="text-sm text-slate-400">
              Select a published BGMI tournament from the Tournaments page to register your entry.
            </p>
            <Link
              to="/tournaments"
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 nx-btn-neon font-display font-bold text-xs uppercase tracking-wider"
            >
              Browse BGMI Tournaments
            </Link>
          </div>
        ) : successInfo ? (
          <div className="rounded-2xl nx-glass p-8 space-y-5 text-center border-emerald-500/40">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-[#22C55E]">
              <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
            </div>
            <h2 className="font-display text-3xl font-bold text-white uppercase">
              {successInfo.status === 'waitlisted'
                ? 'Added to Official Waitlist'
                : 'Registration Submitted'}
            </h2>
            <p className="text-sm text-slate-300 max-w-xl mx-auto">
              Reference ID: <span className="font-mono text-emerald-300">{successInfo.registrationId}</span>.{' '}
              Current verification status:{' '}
              <strong className="uppercase text-[#22C55E]">{successInfo.status}</strong>.
            </p>
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              <Link
                to={`/tournaments/${selectedSlug}`}
                className="rounded-xl px-5 py-2.5 border border-white/15 bg-[#0C1216] text-xs font-mono uppercase tracking-wider text-white"
              >
                Back to Event Details
              </Link>
              {playerAuth?.playerUser && (
                <Link
                  to="/player/dashboard"
                  className="rounded-xl px-5 py-2.5 nx-btn-neon font-display font-bold text-xs uppercase tracking-wider"
                >
                  Track in Player Dashboard
                </Link>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl nx-glass p-6 sm:p-8 space-y-6">
            {publishedTournaments.length > 1 && !slug && (
              <div>
                <label className="block font-mono text-xs uppercase tracking-wider text-slate-300 mb-2">
                  Select BGMI Tournament
                </label>
                <select
                  value={selectedSlug}
                  onChange={(e) => setSelectedSlug(e.target.value)}
                  className="w-full rounded-xl bg-[#050809] border border-emerald-500/25 px-4 py-3 text-sm text-white"
                >
                  {publishedTournaments.map((t) => (
                    <option key={t.id} value={t.slug}>
                      {t.title} ({t.format} • {t.prizes.totalPrizePool})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {externalValid && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-300">
                  Prefer submitting via organizer Google Form? Both options are available for this event.
                </p>
                <a
                  href={externalFormUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-3 py-1.5 font-mono text-xs uppercase text-emerald-300 hover:text-white shrink-0"
                >
                  Open Google Form <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              </div>
            )}

            {errorMsg && (
              <div
                role="alert"
                className="rounded-xl border border-red-500/40 bg-red-950/40 p-4 flex items-center gap-3 text-sm text-red-200"
              >
                <ShieldAlert className="h-5 w-5 text-red-400 shrink-0" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}

            {activeFormat !== 'Solo' && myTeams.length > 0 && (
              <div>
                <label className="block font-mono text-xs uppercase tracking-wider text-slate-300 mb-2">
                  Use Your Saved Team (Optional)
                </label>
                <select
                  value={teamId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTeamId(id);
                    const found = myTeams.find((tm) => tm.id === id);
                    if (found) setTeamName(found.name);
                  }}
                  className="w-full rounded-xl bg-[#050809] border border-white/15 px-4 py-3 text-sm text-white"
                >
                  <option value="">-- Enter Team Details Manually --</option>
                  {myTeams.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      [{tm.tag}] {tm.name} ({tm.division})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeFormat !== 'Solo' && (
                <div className="sm:col-span-2">
                  <label className="block font-mono text-xs uppercase tracking-wider text-slate-300 mb-2">
                    Team / Squad Name *
                  </label>
                  <input
                    required
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder={`Enter ${activeFormat} team name`}
                    className="w-full rounded-xl bg-[#050809] border border-white/15 focus:border-[#22C55E] px-4 py-3 text-sm text-white focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block font-mono text-xs uppercase tracking-wider text-slate-300 mb-2">
                  {activeFormat === 'Solo' ? 'Player BGMI IGN *' : 'Captain BGMI IGN *'}
                </label>
                <input
                  required
                  value={leaderIgn}
                  onChange={(e) => setLeaderIgn(e.target.value)}
                  placeholder="Exact in-game name"
                  className="w-full rounded-xl bg-[#050809] border border-white/15 focus:border-[#22C55E] px-4 py-3 text-sm text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs uppercase tracking-wider text-slate-300 mb-2">
                  BGMI Character ID (6-16 digits) *
                </label>
                <input
                  required
                  value={leaderCharId}
                  onChange={(e) => setLeaderCharId(e.target.value)}
                  placeholder="e.g., 5123456789"
                  className="w-full rounded-xl bg-[#050809] border border-white/15 focus:border-[#22C55E] px-4 py-3 text-sm font-mono text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs uppercase tracking-wider text-slate-300 mb-2">
                  Contact Email (Room Details Delivery) *
                </label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="captain@example.com"
                  className="w-full rounded-xl bg-[#050809] border border-white/15 focus:border-[#22C55E] px-4 py-3 text-sm text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-mono text-xs uppercase tracking-wider text-slate-300 mb-2">
                  Discord / WhatsApp Handle (Optional)
                </label>
                <input
                  value={contactDiscord}
                  onChange={(e) => setContactDiscord(e.target.value)}
                  placeholder="username#0001 or +91..."
                  className="w-full rounded-xl bg-[#050809] border border-white/15 focus:border-[#22C55E] px-4 py-3 text-sm text-white focus:outline-none"
                />
              </div>
            </div>

            {activeFormat !== 'Solo' && (
              <div className="space-y-3 pt-2 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-[#22C55E]" aria-hidden="true" />
                  <h3 className="font-display text-lg font-bold text-white uppercase">
                    {activeFormat} Playing Roster ({requiredCount} Players Required)
                  </h3>
                </div>
                <div className="space-y-3">
                  {roster.map((member, idx) => (
                    <div key={idx} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        required
                        value={idx === 0 && !member.ign ? leaderIgn : member.ign}
                        onChange={(e) =>
                          setRoster((prev) =>
                            prev.map((m, i) => (i === idx ? { ...m, ign: e.target.value } : m))
                          )
                        }
                        placeholder={`Player ${idx + 1} BGMI IGN`}
                        className="rounded-xl bg-[#050809] border border-white/15 px-3.5 py-2.5 text-sm text-white"
                      />
                      <input
                        required
                        value={idx === 0 && !member.charId ? leaderCharId : member.charId}
                        onChange={(e) =>
                          setRoster((prev) =>
                            prev.map((m, i) => (i === idx ? { ...m, charId: e.target.value } : m))
                          )
                        }
                        placeholder={`Player ${idx + 1} Character ID`}
                        className="rounded-xl bg-[#050809] border border-white/15 px-3.5 py-2.5 text-sm font-mono text-white"
                      />
                      <input
                        value={member.role}
                        onChange={(e) =>
                          setRoster((prev) =>
                            prev.map((m, i) => (i === idx ? { ...m, role: e.target.value } : m))
                          )
                        }
                        placeholder="Role (IGL / Assaulter)"
                        className="rounded-xl bg-[#050809] border border-white/15 px-3.5 py-2.5 text-sm text-slate-200"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl py-3.5 nx-btn-neon font-display font-bold text-sm uppercase tracking-wider cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Submitting Entry...' : `Submit ${activeFormat} Registration`}
            </button>
          </form>
        )}
      </section>
    </div>
  );
};
