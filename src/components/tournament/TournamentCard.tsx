import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Calendar, Clock, Crosshair, Trophy, Users } from 'lucide-react';
import type { TournamentRecord } from '../../types/data';
import { formatDisplayDate } from '../../utils/dateFormat';
import { validateImageAssetUrl } from '../../utils/validation';
import { RegistrationButton } from '../common/RegistrationButton';
import { RegistrationStatusBadge } from '../common/StatusBadge';

interface TournamentCardProps {
  tournament: TournamentRecord;
  previewMode?: boolean;
  liveSlotInfo?: {
    registeredSlots: number;
    maxSlots: number;
  };
  onViewDetails?: (tournament: TournamentRecord) => void;
}

export const TournamentCard: React.FC<TournamentCardProps> = ({
  tournament,
  previewMode = false,
  liveSlotInfo,
  onViewDetails,
}) => {
  const detailsPath = `/`;
  const bannerCheck = validateImageAssetUrl(tournament.banner, 'Banner');
  const bannerSrc =
    bannerCheck.valid && bannerCheck.normalized
      ? bannerCheck.normalized
      : './images/hero-arena.jpg';

  const hasValidExternalForm = Boolean(tournament.registration.formUrl?.trim());
  const slotsPct = liveSlotInfo
    ? Math.min(100, Math.round((liveSlotInfo.registeredSlots / Math.max(1, liveSlotInfo.maxSlots)) * 100))
    : 0;

  const formatPillStyle =
    tournament.format === 'Solo'
      ? 'bg-sky-500/20 border-sky-400/50 text-sky-200'
      : tournament.format === 'Duo'
        ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
        : 'bg-indigo-500/20 border-indigo-400/50 text-indigo-200';

  return (
    <article className="group rounded-2xl nx-glass nx-glass-hover flex flex-col overflow-hidden">
      {/* Banner */}
      <div className="relative h-48 sm:h-52 bg-[#06090B] overflow-hidden border-b border-emerald-500/20">
        <img
          src={bannerSrc}
          alt={`${tournament.title} banner`}
          className="h-full w-full object-cover object-center opacity-90 group-hover:scale-[1.04] transition-transform duration-500"
          loading="lazy"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-[#070E0B] via-[#070E0B]/45 to-[#050908]/40"
          aria-hidden="true"
        />
        <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 border font-mono text-[11px] font-bold uppercase tracking-wider backdrop-blur-md ${formatPillStyle}`}
          >
            <Crosshair className="h-3 w-3" aria-hidden="true" />
            {tournament.format} Division
          </span>
          <RegistrationStatusBadge
            status={tournament.registration.status}
            lifecycleStatus={tournament.status}
            hasValidUrl={hasValidExternalForm}
          />
        </div>
        <div className="absolute bottom-3 left-3.5 right-3.5 flex items-center justify-between gap-2">
          <span className="rounded-md bg-[#040807]/85 border border-white/15 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-slate-200">
            {tournament.game} • {tournament.mode}
          </span>
          <span className="rounded-md bg-amber-500/20 border border-amber-400/40 px-2.5 py-0.5 font-display text-xs font-bold text-amber-200">
            {tournament.prizes.totalPrizePool || 'TBA'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 flex-1 flex flex-col justify-between gap-5">
        <div className="space-y-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-widest text-[#22C55E]">
              {tournament.game} • {tournament.format} • {tournament.mode}
              {tournament.season?.trim() ? ` • ${tournament.season.trim()}` : ''}
            </div>
            <h3 className="mt-1 font-display text-xl sm:text-2xl font-bold text-white uppercase tracking-tight leading-snug">
              {tournament.title}
            </h3>
          </div>

          <dl className="grid grid-cols-2 gap-3 text-xs pt-2 border-t border-white/10">
            <div className="rounded-xl bg-[#050809]/90 border border-white/5 p-3">
              <dt className="flex items-center gap-1.5 text-slate-400 font-mono uppercase tracking-wider text-[10px]">
                <Trophy className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                Prize Pool
              </dt>
              <dd className="mt-1 font-display text-base font-bold text-white">
                {tournament.prizes.totalPrizePool || 'TBA'}
              </dd>
            </div>

            <div className="rounded-xl bg-[#050809]/90 border border-white/5 p-3">
              <dt className="flex items-center gap-1.5 text-slate-400 font-mono uppercase tracking-wider text-[10px]">
                <Calendar className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                Match Date
              </dt>
              <dd className="mt-1 text-xs sm:text-sm font-medium text-white">
                {formatDisplayDate(tournament.schedule.date)}
              </dd>
            </div>

            <div className="rounded-xl bg-[#050809]/90 border border-white/5 p-3">
              <dt className="flex items-center gap-1.5 text-slate-400 font-mono uppercase tracking-wider text-[10px]">
                <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                Reg Closes
              </dt>
              <dd className="mt-1 text-xs sm:text-sm font-medium text-slate-200">
                {formatDisplayDate(tournament.registration.closingDate)}
              </dd>
            </div>

            <div className="rounded-xl bg-[#050809]/90 border border-white/5 p-3">
              <dt className="flex items-center gap-1.5 text-slate-400 font-mono uppercase tracking-wider text-[10px]">
                <Crosshair className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                Map / Mode
              </dt>
              <dd className="mt-1 text-xs sm:text-sm font-medium text-slate-200 truncate">
                {tournament.map || tournament.mode}
              </dd>
            </div>
          </dl>

          {liveSlotInfo && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                <span className="inline-flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                  Registered Slots
                </span>
                <span className="font-semibold text-white">
                  {liveSlotInfo.registeredSlots} / {liveSlotInfo.maxSlots}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#22C55E] to-[#16FF6E]"
                  style={{ width: `${slotsPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Action Row */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-4 border-t border-white/10">
          {!previewMode &&
            (onViewDetails ? (
              <button
                type="button"
                onClick={() => onViewDetails(tournament)}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 border border-white/15 hover:border-emerald-500/45 bg-[#0C1216] hover:bg-[#131C21] text-white font-display font-semibold text-xs sm:text-sm uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer"
              >
                View Details
                <ArrowUpRight className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              </button>
            ) : (
              <Link
                to={detailsPath}
                className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 border border-white/15 hover:border-emerald-500/45 bg-[#0C1216] hover:bg-[#131C21] text-white font-display font-semibold text-xs sm:text-sm uppercase tracking-wider transition-colors whitespace-nowrap"
              >
                View Details
                <ArrowUpRight className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              </Link>
            ))}
          <div className="flex-1">
            <RegistrationButton tournament={tournament} fullWidth />
          </div>
        </div>
      </div>
    </article>
  );
};
