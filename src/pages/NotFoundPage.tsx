import React from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, Home, Trophy } from 'lucide-react';
import { PageMeta } from '../components/common/PageMeta';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-24 text-center">
      <PageMeta
        title="404 Page Not Found | NexusX Esports India"
        description="The requested NexusX Esports India page could not be found."
        noIndex
      />

      <div className="nx-glass rounded-2xl p-8 sm:p-12 relative overflow-hidden">
        <div className="absolute top-0 inset-x-0 h-1 bg-[#22C55E]" aria-hidden="true" />
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/40 text-[#22C55E] mb-6">
          <AlertOctagon className="h-7 w-7" aria-hidden="true" />
        </div>
        <div className="font-mono text-xs uppercase tracking-[0.22em] text-[#22C55E] mb-2">
          Error 404 // Sector Offline
        </div>
        <h1 className="font-display text-4xl sm:text-5xl font-bold text-white uppercase">
          Drop Zone Not Found
        </h1>
        <p className="mt-4 text-slate-400 leading-relaxed max-w-xl mx-auto">
          The route you navigated to does not exist or has been relocated. Return to the main hub
          or check active BGMI tournaments.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            to="/"
            className="nx-btn-neon inline-flex items-center gap-2 px-6 py-3 text-sm"
          >
            <Home className="h-4 w-4" aria-hidden="true" />
            Return Home
          </Link>
          <Link
            to="/tournaments"
            className="inline-flex items-center gap-2 rounded-lg px-6 py-3 border border-white/15 hover:border-[#22C55E]/60 text-slate-200 font-display font-semibold text-sm uppercase tracking-wider transition-colors"
          >
            <Trophy className="h-4 w-4" aria-hidden="true" />
            Browse Tournaments
          </Link>
        </div>
      </div>
    </div>
  );
};
