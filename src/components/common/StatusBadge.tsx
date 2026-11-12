import React from 'react';
import type { RegistrationStatus, TournamentLifecycleStatus } from '../../types/data';

interface RegistrationStatusBadgeProps {
  status: RegistrationStatus;
  lifecycleStatus?: TournamentLifecycleStatus;
  hasValidUrl?: boolean;
}

export const RegistrationStatusBadge: React.FC<RegistrationStatusBadgeProps> = ({
  status,
  lifecycleStatus,
  hasValidUrl = true,
}) => {
  if (lifecycleStatus === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono uppercase tracking-wider bg-red-950/60 border border-[#E11D2E]/50 text-red-200">
        Cancelled
      </span>
    );
  }

  if (status === 'full') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono uppercase tracking-wider bg-amber-950/60 border border-amber-500/45 text-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
        Registration Full
      </span>
    );
  }

  if (
    lifecycleStatus === 'archived' ||
    status === 'closed' ||
    lifecycleStatus === 'registration_closed' ||
    lifecycleStatus === 'completed'
  ) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono uppercase tracking-wider bg-slate-900 border border-slate-700 text-slate-300">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" aria-hidden="true" />
        Registration Closed
      </span>
    );
  }

  if (!hasValidUrl) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono uppercase tracking-wider bg-amber-950/40 border border-amber-500/35 text-amber-200">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" aria-hidden="true" />
        Registration Opening Soon
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-mono uppercase tracking-wider bg-emerald-950/55 border border-emerald-500/40 text-emerald-300">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
      Registration Open
    </span>
  );
};

interface GenericBadgeProps {
  variant?: 'crimson' | 'silver' | 'amber' | 'emerald';
  children: React.ReactNode;
}

export const TacticalBadge: React.FC<GenericBadgeProps> = ({
  variant = 'silver',
  children,
}) => {
  const styles: Record<NonNullable<GenericBadgeProps['variant']>, string> = {
    crimson: 'bg-[#22C55E]/15 border-[#22C55E]/45 text-emerald-200',
    silver: 'bg-white/[0.04] border-white/15 text-slate-200',
    amber: 'bg-amber-950/50 border-amber-500/35 text-amber-200',
    emerald: 'bg-emerald-950/50 border-emerald-500/35 text-emerald-200',
  };

  return (
    <span
      className={`inline-flex items-center rounded-md px-2.5 py-1 text-[11px] font-mono uppercase tracking-wider border ${styles[variant]}`}
    >
      {children}
    </span>
  );
};
