import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Crosshair,
  ExternalLink,
  MapPin,
  MessageCircle,
  ShieldAlert,
  Smartphone,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import type { TournamentRecord } from '../../types/data';
import { formatDisplayDate } from '../../utils/dateFormat';
import { RegistrationButton } from '../common/RegistrationButton';
import { RegistrationStatusBadge, TacticalBadge } from '../common/StatusBadge';
import { ShareMenu } from '../common/ShareMenu';
import {
  validateGoogleFormUrl,
  validateHttpsUrl,
  validateImageAssetUrl,
} from '../../utils/validation';

interface TournamentDetailsViewProps {
  tournament: TournamentRecord;
  whatsappFallbackUrl?: string;
  alternateLink?: {
    to: string;
    label: string;
  };
  previewMode?: boolean;
}

export const TournamentDetailsView: React.FC<TournamentDetailsViewProps> = ({
  tournament,
  whatsappFallbackUrl = '',
  alternateLink,
  previewMode = false,
}) => {
  const urlCheck = validateGoogleFormUrl(tournament.registration.formUrl, false);
  const bannerCheck = validateImageAssetUrl(tournament.banner, 'Banner');
  const bannerSrc =
    bannerCheck.valid && bannerCheck.normalized
      ? bannerCheck.normalized
      : './images/hero-arena.jpg';

  const whatsappCheck = validateHttpsUrl(
    tournament.registration.whatsappCommunityUrl || whatsappFallbackUrl,
    'WhatsApp Community'
  );

  const tzLabel =
    tournament.schedule.timezone === 'Asia/Kolkata' ? 'IST' : tournament.schedule.timezone;

  const prizeRows = [
    { label: '1st Place', value: tournament.prizes.first },
    { label: '2nd Place', value: tournament.prizes.second },
    { label: '3rd Place', value: tournament.prizes.third },
    { label: 'Additional Info', value: tournament.prizes.other },
  ].filter((row) => Boolean(row.value && row.value.trim()));

  return (
    <div className="pb-16">
      {/* Tournament Banner & Identity */}
      <section className="relative border-b border-white/10 bg-[#080A0E] overflow-hidden">
        <img
          src={bannerSrc}
          alt={`${tournament.title} cover banner`}
          className="absolute inset-0 h-full w-full object-cover object-center opacity-35"
        />
        <div
          className="absolute inset-0 bg-gradient-to-r from-[#060709] via-[#060709]/92 to-[#060709]/70"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
          {!previewMode && (
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <Link
                to="/tournaments"
                className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider text-slate-300 hover:text-white transition-colors"
              >
                <ArrowLeft className="h-4 w-4 text-[#22C55E]" aria-hidden="true" />
                Back to Tournaments
              </Link>
              {alternateLink && (
                <Link
                  to={alternateLink.to}
                  className="font-mono text-xs uppercase tracking-wider text-slate-300 hover:text-[#22C55E] underline underline-offset-4 transition-colors"
                >
                  {alternateLink.label} →
                </Link>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-4">
            <TacticalBadge variant="emerald">{tournament.format} Division</TacticalBadge>
            <TacticalBadge variant="silver">
              {tournament.game} • {tournament.mode}
            </TacticalBadge>
            {tournament.season?.trim() && (
              <TacticalBadge variant="silver">{tournament.season.trim()}</TacticalBadge>
            )}
            <RegistrationStatusBadge
              status={tournament.registration.status}
              lifecycleStatus={tournament.status}
              hasValidUrl={urlCheck.valid}
            />
          </div>

          <h1 className="font-display text-3xl sm:text-5xl font-bold text-white uppercase tracking-tight max-w-4xl">
            {tournament.title}
          </h1>
          {tournament.description.trim() && (
            <p className="mt-4 text-base sm:text-lg text-slate-300 max-w-3xl leading-relaxed">
              {tournament.description}
            </p>
          )}
        </div>
      </section>

      {/* Main Content Grid */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left 2 Columns */}
          <div className="lg:col-span-2 space-y-8">
            {/* Key Overview */}
            <div className="nx-glass rounded-xl p-6 sm:p-8">
              <h2 className="font-display text-xl font-bold text-white uppercase tracking-wide mb-5">
                Tournament Overview
              </h2>

              <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="rounded-lg bg-[#080B10] border border-white/5 p-4">
                  <dt className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <Trophy className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                    Prize Pool
                  </dt>
                  <dd className="mt-1 font-display text-xl font-bold text-[#16FF6E]">
                    {tournament.prizes.totalPrizePool || 'TBA'}
                  </dd>
                </div>

                <div className="rounded-lg bg-[#080B10] border border-white/5 p-4">
                  <dt className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <Wallet className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                    Entry Fee
                  </dt>
                  <dd className="mt-1 font-display text-xl font-bold text-white">
                    {tournament.prizes.entryFee || 'Free Entry'}
                  </dd>
                </div>

                <div className="rounded-lg bg-[#080A0E] border border-white/5 p-4">
                  <dt className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <Crosshair className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    Game Mode
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-white">
                    {tournament.game} • {tournament.format} • {tournament.mode}
                    {tournament.matchFormat?.trim() ? ` (${tournament.matchFormat.trim()})` : ''}
                  </dd>
                </div>

                <div className="rounded-lg bg-[#080A0E] border border-white/5 p-4">
                  <dt className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    Map
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-100">
                    {tournament.map || 'TBA'}
                  </dd>
                </div>

                <div className="rounded-lg bg-[#080A0E] border border-white/5 p-4">
                  <dt className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <Users className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    Team Format
                  </dt>
                  <dd className="mt-1 text-sm font-semibold text-slate-100">
                    {tournament.teamSize || `${tournament.format} Roster`} ({tournament.matchesCount}{' '}
                    Match{tournament.matchesCount === 1 ? '' : 'es'})
                  </dd>
                </div>

                <div className="rounded-lg bg-[#080A0E] border border-white/5 p-4">
                  <dt className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-slate-400">
                    <Smartphone className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    Eligible Devices
                  </dt>
                  <dd className="mt-1 text-xs font-medium text-slate-200 leading-snug">
                    {tournament.eligibleDevices || 'Not specified'}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Duo/Squad Roster Requirements */}
            {(tournament.format === 'Squad' || tournament.format === 'Duo') &&
              tournament.squadDetails &&
              (tournament.squadDetails.teamRequirements.trim() ||
                tournament.squadDetails.captainRequirements.trim() ||
                tournament.squadDetails.playerRequirements.trim()) && (
                <div className="rounded-xl border border-white/10 bg-[#0C0F16] p-6 sm:p-8 space-y-4">
                  <h2 className="font-display text-xl font-bold text-white uppercase tracking-wide">
                    {tournament.format} &amp; Roster Requirements
                  </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg bg-[#080A0E] border border-white/5 p-4">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-[#22C55E] mb-1.5">
                      Team Requirements
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {tournament.squadDetails.teamRequirements}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#080A0E] border border-white/5 p-4">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-[#22C55E] mb-1.5">
                      Captain Responsibilities
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {tournament.squadDetails.captainRequirements}
                    </p>
                  </div>
                  <div className="rounded-lg bg-[#080A0E] border border-white/5 p-4">
                    <div className="font-mono text-[11px] uppercase tracking-wider text-[#22C55E] mb-1.5">
                      Player Requirements
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">
                      {tournament.squadDetails.playerRequirements}
                    </p>
                  </div>
                </div>
              </div>
              )}

            {/* Prize Breakdown & Eligibility */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-xl border border-white/10 bg-[#0C0F16] p-6">
                <h2 className="font-display text-lg font-bold text-white uppercase tracking-wide mb-4">
                  Prize Breakdown
                </h2>
                {prizeRows.length > 0 ? (
                  <div className="divide-y divide-white/10">
                    {prizeRows.map((row) => (
                      <div key={row.label} className="py-3 flex items-center justify-between gap-4">
                        <span className="text-sm text-slate-300">{row.label}</span>
                        <span className="font-mono text-sm font-bold text-white text-right">
                          {row.value}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">
                    Prize breakdown details will be announced by tournament administration.
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0C0F16] p-6">
                <h2 className="font-display text-lg font-bold text-white uppercase tracking-wide mb-4">
                  Eligibility
                </h2>
                {tournament.eligibility.length > 0 ? (
                  <ul className="space-y-3">
                    {tournament.eligibility.map((item, idx) => (
                      <li
                        key={`elig-${idx}`}
                        className="flex items-start gap-2.5 text-sm text-slate-300"
                      >
                        <CheckCircle2
                          className="h-4 w-4 text-[#22C55E] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-400">
                    Open to eligible BGMI players meeting standard tournament rules.
                  </p>
                )}
              </div>
            </div>

            {/* Rules */}
            <div className="nx-glass rounded-xl p-6 sm:p-8">
              <div className="flex items-center gap-2 mb-4">
                <ShieldAlert className="h-5 w-5 text-[#22C55E]" aria-hidden="true" />
                <h2 className="font-display text-xl font-bold text-white uppercase tracking-wide">
                  Tournament Rules
                </h2>
              </div>
              {tournament.rules.length > 0 ? (
                <ol className="space-y-3">
                  {tournament.rules.map((rule, index) => (
                    <li
                      key={`rule-${index}`}
                      className="flex items-start gap-3 rounded-lg bg-[#080B10] border border-white/5 p-4 text-sm text-slate-300 leading-relaxed"
                    >
                      <span className="font-mono text-xs font-bold text-[#22C55E] bg-[#22C55E]/10 border border-[#22C55E]/30 rounded px-2 py-0.5 shrink-0">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-slate-400">
                  Tournament rules will be updated shortly by organizers.
                </p>
              )}
            </div>
          </div>

          {/* Right Sidebar: Schedule, Registration CTA & Status */}
          <aside className="space-y-6">
            <div className="nx-glass rounded-xl p-6 lg:sticky lg:top-24 space-y-6">
              <div className="border-b border-white/10 pb-4">
                <div className="font-mono text-xs uppercase tracking-widest text-[#22C55E]">
                  Dates &amp; Entry
                </div>
                <h2 className="font-display text-2xl font-bold text-white uppercase mt-1">
                  {tournament.format} Registration
                </h2>
              </div>

              <dl className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400 flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-[#22C55E]" aria-hidden="true" />
                    Tournament Date
                  </dt>
                  <dd className="font-medium text-white">
                    {formatDisplayDate(tournament.schedule.date)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400 flex items-center gap-1.5">
                    <Calendar className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    Reg Deadline
                  </dt>
                  <dd className="font-medium text-slate-200">
                    {formatDisplayDate(tournament.registration.closingDate)}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    Reporting Time
                  </dt>
                  <dd className="font-mono text-slate-200">
                    {tournament.schedule.reportingTime
                      ? `${tournament.schedule.reportingTime} ${tzLabel}`
                      : 'TBA'}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-slate-400 flex items-center gap-1.5">
                    <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    Match Start Time
                  </dt>
                  <dd className="font-mono text-slate-200">
                    {tournament.schedule.startTime
                      ? `${tournament.schedule.startTime} ${tzLabel}`
                      : 'TBA'}
                  </dd>
                </div>
              </dl>

              {tournament.registration.instructions && (
                <p className="rounded-lg text-xs text-slate-300 bg-[#080A0E] border border-white/5 p-3 leading-relaxed">
                  {tournament.registration.instructions}
                </p>
              )}

              {tournament.registration.additionalInstructions && (
                <p className="rounded-lg text-xs text-slate-400 bg-[#080A0E] border border-white/5 p-3 leading-relaxed">
                  {tournament.registration.additionalInstructions}
                </p>
              )}

              {!previewMode &&
                tournament.status !== 'draft' &&
                tournament.status !== 'archived' &&
                tournament.status !== 'registration_closed' &&
                tournament.registration.status !== 'closed' && (
                  <Link
                    to={`/tournaments/${tournament.slug}/register`}
                    className="nx-btn-neon w-full inline-flex items-center justify-center gap-2 px-5 py-3 text-xs"
                  >
                    Register Online ({tournament.format})
                  </Link>
                )}

              <RegistrationButton tournament={tournament} showHelper fullWidth />

              {whatsappCheck.valid && whatsappCheck.normalized && (
                <a
                  href={whatsappCheck.normalized}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg px-4 py-3 border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-950/60 text-emerald-200 font-display font-semibold text-sm uppercase tracking-wider transition-colors"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Join WhatsApp Community
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              )}

              {!previewMode && (
                <div className="pt-4 border-t border-white/10 space-y-3">
                  <div className="font-mono text-[11px] uppercase tracking-wider text-slate-400">
                    Share Tournament
                  </div>
                  <ShareMenu
                    title={tournament.title}
                    text={`${tournament.game} ${tournament.format} Tournament (${tournament.prizes.totalPrizePool})`}
                  />
                </div>
              )}
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
};
