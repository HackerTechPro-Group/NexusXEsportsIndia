import React from 'react';
import { Link } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { useSiteData } from '../../context/SiteDataContext';
import { DataErrorCard } from '../common/DataErrorCard';
import { PageHeader } from '../common/PageHeader';
import { PageMeta } from '../common/PageMeta';
import type { TournamentFormat } from '../../types/data';
import { TournamentDetailsView } from './TournamentDetailsView';

interface DivisionTournamentPageProps {
  division: TournamentFormat;
  preferredSlug?: string;
  alternateLink?: {
    to: string;
    label: string;
  };
}

export const DivisionTournamentPage: React.FC<DivisionTournamentPageProps> = ({
  division,
  preferredSlug,
  alternateLink,
}) => {
  const { bundle, publishedTournaments, isLoading, datasetErrors, reloadData } = useSiteData();

  const match =
    (preferredSlug ? publishedTournaments.find((t) => t.slug === preferredSlug) : undefined) ??
    publishedTournaments.find((t) => t.format === division);

  if (!match) {
    if (isLoading) {
      return (
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 text-center font-mono text-xs uppercase tracking-wider text-slate-400">
          Loading tournament details...
        </div>
      );
    }

    if (datasetErrors.tournaments) {
      return (
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16">
          <PageMeta
            title={`${division} BGMI Tournament | NexusX Esports India`}
            description={`Official ${division} BGMI tournament details from NexusX Esports India.`}
          />
          <DataErrorCard
            title={`Unable to Load ${division} Tournament`}
            detail={datasetErrors.tournaments}
            onRetry={() => void reloadData(true)}
          />
        </div>
      );
    }

    return (
      <div className="pb-16">
        <PageMeta
          title={`${division} BGMI Tournaments | NexusX Esports India`}
          description={`Upcoming ${division} BGMI tournaments organized by NexusX Esports India.`}
        />
        <PageHeader
          eyebrow={`${division} Division`}
          title={`${division} BGMI Tournaments`}
          description={`Live ${division} division brackets, schedules, and verified Google Form registrations appear here once published.`}
        />
        <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-10">
          <div className="rounded-xl border border-white/10 bg-[#0C0F16] p-10 text-center space-y-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-[#E11D2E]/15 border border-[#E11D2E]/40 text-[#E11D2E]">
              <Trophy className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              No {division} Tournament Published Yet
            </h2>
            <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
              No live {division} event is currently open. Browse all tournament announcements or
              check back shortly for upcoming brackets.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/tournaments"
                className="inline-flex items-center px-5 py-2.5 bg-[#E11D2E] hover:bg-[#FF2D3F] text-white font-display font-bold text-xs uppercase tracking-wider transition-colors"
              >
                All Tournaments
              </Link>
              {alternateLink && (
                <Link
                  to={alternateLink.to}
                  className="inline-flex items-center px-5 py-2.5 border border-white/15 hover:border-white/35 bg-[#121621] text-slate-200 hover:text-white font-display font-semibold text-xs uppercase tracking-wider transition-colors"
                >
                  {alternateLink.label}
                </Link>
              )}
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <>
      <PageMeta
        title={`${match.title} | ${division} BGMI Tournament`}
        description={match.description || `${match.title} hosted by NexusX Esports India.`}
      />
      <TournamentDetailsView
        tournament={match}
        whatsappFallbackUrl={bundle.siteConfig.community.whatsappCommunityUrl}
        alternateLink={alternateLink}
      />
    </>
  );
};
