import React from 'react';
import { useParams } from 'react-router-dom';
import { useSiteData } from '../context/SiteDataContext';
import { DataErrorCard } from '../components/common/DataErrorCard';
import { PageMeta } from '../components/common/PageMeta';
import { TournamentDetailsView } from '../components/tournament/TournamentDetailsView';
import { NotFoundPage } from './NotFoundPage';

export const TournamentSlugPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { bundle, publishedTournaments, isLoading, datasetErrors, reloadData } = useSiteData();
  const tournament = publishedTournaments.find((t) => t.slug === slug);

  if (!tournament) {
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
            title="BGMI Tournament | NexusX Esports India"
            description="Official BGMI tournament details from NexusX Esports India."
          />
          <DataErrorCard
            title="Unable to Load Tournament Details"
            detail={datasetErrors.tournaments}
            onRetry={() => void reloadData(true)}
          />
        </div>
      );
    }
    return <NotFoundPage />;
  }

  return (
    <>
      <PageMeta
        title={`${tournament.title} | ${bundle.siteConfig.brandName}`}
        description={tournament.description}
      />
      <TournamentDetailsView
        tournament={tournament}
        whatsappFallbackUrl={bundle.siteConfig.community.whatsappCommunityUrl}
      />
    </>
  );
};
