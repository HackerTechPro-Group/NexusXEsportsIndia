import React from 'react';
import { DataErrorCard } from '../components/common/DataErrorCard';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { useSiteData } from '../context/SiteDataContext';

export const TermsPage: React.FC = () => {
  const { bundle, datasetErrors, reloadData } = useSiteData();
  const { brandName, termsSections } = bundle.siteConfig;

  return (
    <div className="pb-16">
      <PageMeta
        title={`Terms & Conditions | ${brandName}`}
        description={`Official terms and conditions governing tournament registration, eligibility, fair play, verification, and prize distribution for ${brandName}.`}
      />

      <PageHeader
        eyebrow="Governance & Compliance"
        title="Terms & Conditions"
        description="Participation guidelines, fair-play standards, verification policies, and organizer authority."
      />

      <article className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-10 space-y-6 text-slate-300 leading-relaxed text-sm sm:text-base">
        {datasetErrors.siteConfig ? (
          <DataErrorCard
            title="Unable to Load Terms & Conditions"
            detail={datasetErrors.siteConfig}
            onRetry={() => void reloadData(true)}
          />
        ) : (
          termsSections.map((section) => (
            <section
              key={section.id}
              className="border border-slate-800 bg-[#0D0F14] p-6 sm:p-8 space-y-3"
            >
              <h2 className="font-display text-xl font-bold text-white uppercase">
                {section.title}
              </h2>
              <p className="whitespace-pre-line">{section.content}</p>
            </section>
          ))
        )}

        <section className="border border-slate-800 bg-[#090B0F] p-6 text-xs text-slate-400">
          Independent Community Disclaimer: {brandName} is an independent esports community
          platform and is not affiliated with, sponsored by, or endorsed by Krafton, Inc.
        </section>
      </article>
    </div>
  );
};
