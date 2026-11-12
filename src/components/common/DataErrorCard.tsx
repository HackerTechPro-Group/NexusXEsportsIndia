import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface DataErrorCardProps {
  title: string;
  detail?: string;
  onRetry?: () => void;
}

/**
 * Explicit error state rendered when live JSON/API data is unavailable,
 * ensuring failed requests are never masked with dummy fallback records or misleading empty states.
 */
export const DataErrorCard: React.FC<DataErrorCardProps> = ({ title, detail, onRetry }) => {
  return (
    <div
      role="alert"
      className="rounded-xl border border-[#E11D2E]/45 bg-[#12090D] p-8 sm:p-10 text-center space-y-4"
    >
      <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[#E11D2E]/15 border border-[#E11D2E]/40 text-[#E11D2E]">
        <AlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <div className="space-y-1.5">
        <h2 className="font-display text-xl sm:text-2xl font-bold text-white uppercase">{title}</h2>
        <p className="text-sm text-red-200/85 max-w-xl mx-auto leading-relaxed">
          {detail
            ? `Unable to retrieve verified data (${detail}). Please check your network connection and retry.`
            : 'Unable to retrieve verified data at the moment. Please try again.'}
        </p>
      </div>
      {onRetry && (
        <div className="pt-1">
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 bg-[#E11D2E] hover:bg-[#FF2D3F] text-white font-display font-semibold text-xs uppercase tracking-wider transition-colors cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry Loading
          </button>
        </div>
      )}
    </div>
  );
};
