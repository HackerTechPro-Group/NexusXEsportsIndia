import React from 'react';
import { ExternalLink, Lock, Clock } from 'lucide-react';
import type { TournamentRecord } from '../../types/data';
import { getRegistrationButtonState } from '../../utils/registration';

interface RegistrationButtonProps {
  tournament: TournamentRecord;
  className?: string;
  showHelper?: boolean;
  fullWidth?: boolean;
}

export const RegistrationButton: React.FC<RegistrationButtonProps> = ({
  tournament,
  className = '',
  showHelper = false,
  fullWidth = false,
}) => {
  const state = getRegistrationButtonState(tournament);
  const widthClass = fullWidth ? 'w-full justify-center' : '';

  if (state.isEnabled && state.href) {
    return (
      <div className={fullWidth ? 'w-full' : ''}>
        <a
          href={state.href}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 nx-btn-neon font-display font-bold text-sm uppercase tracking-wider focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 ${widthClass} ${className}`}
        >
          <span>{state.label}</span>
          <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" />
        </a>
        {showHelper && <p className="mt-2 text-xs text-slate-400">{state.helperText}</p>}
      </div>
    );
  }

  return (
    <div className={fullWidth ? 'w-full' : ''}>
      <button
        type="button"
        disabled
        aria-disabled="true"
        title={state.helperText}
        className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 bg-[#121621] border border-white/10 text-slate-300 font-display font-medium text-xs sm:text-sm uppercase tracking-wider cursor-not-allowed ${widthClass} ${className}`}
      >
        {state.reason === 'closed' || state.reason === 'cancelled' || state.reason === 'full' ? (
          <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
        ) : (
          <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400/90" aria-hidden="true" />
        )}
        <span>{state.label}</span>
      </button>
      {showHelper && <p className="mt-2 text-xs text-slate-400">{state.helperText}</p>}
    </div>
  );
};
