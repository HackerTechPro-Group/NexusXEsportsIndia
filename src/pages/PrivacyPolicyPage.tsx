import React from 'react';
import { DataErrorCard } from '../components/common/DataErrorCard';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { useSiteData } from '../context/SiteDataContext';

export const PrivacyPolicyPage: React.FC = () => {
  const { bundle, datasetErrors, reloadData } = useSiteData();
  const { brandName, community } = bundle.siteConfig;

  return (
    <div className="pb-16">
      <PageMeta
        title={`Privacy Policy | ${brandName}`}
        description={`Privacy policy detailing how ${brandName} uses Google Forms for tournament registration, handles submitted player screenshots, and responds to privacy requests.`}
      />

      <PageHeader
        eyebrow="Legal & Privacy"
        title="Privacy Policy"
        description="Transparent documentation of how registration information, Google Forms, and player screenshots are handled."
      />

      <article className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 pt-10 space-y-6 text-slate-300 leading-relaxed text-sm sm:text-base">
        {datasetErrors.siteConfig && (
          <DataErrorCard
            title="Unable to Load Organization Metadata"
            detail={datasetErrors.siteConfig}
            onRetry={() => void reloadData(true)}
          />
        )}
        <section className="border border-slate-800 bg-[#0D0F14] p-6 sm:p-8 space-y-3">
          <h2 className="font-display text-xl font-bold text-white uppercase">
            1. Static Website &amp; Information Collection
          </h2>
          <p>
            This public {brandName} website is hosted as a static site on GitHub Pages. The
            website itself does not contain user accounts, player databases, or payment gateways,
            and does not directly collect or store registration forms inside the website frontend.
          </p>
        </section>

        <section className="border border-slate-800 bg-[#0D0F14] p-6 sm:p-8 space-y-3">
          <h2 className="font-display text-xl font-bold text-white uppercase">
            2. Google Forms Usage
          </h2>
          <p>
            Tournament registrations are conducted through external Google Forms configured by
            tournament organizers. Any information you voluntarily submit in a registration form
            (such as In-Game Name, Character ID, team roster details, or contact information) is
            collected through Google Forms subject to Google’s Privacy Policy and reviewed by{' '}
            {brandName} solely to administer the tournament.
          </p>
        </section>

        <section className="border border-slate-800 bg-[#0D0F14] p-6 sm:p-8 space-y-3">
          <h2 className="font-display text-xl font-bold text-white uppercase">
            3. Profile &amp; Match Screenshot Handling
          </h2>
          <p>
            Where an event form or tournament verification step requests BGMI profile screenshots
            or end-of-match scoreboard screenshots, those images are used solely for confirming
            eligibility, verifying match results, and resolving fair-play disputes. They are not
            sold or distributed for commercial advertising.
          </p>
        </section>

        <section className="border border-slate-800 bg-[#0D0F14] p-6 sm:p-8 space-y-3">
          <h2 className="font-display text-xl font-bold text-white uppercase">
            4. Published Tournament Information
          </h2>
          <p>
            Registered team names, player IGNs, match rankings, and points may be displayed on the
            public Leaderboard and Results pages as part of official event standings.
          </p>
        </section>

        <section className="border border-slate-800 bg-[#0D0F14] p-6 sm:p-8 space-y-3">
          <h2 className="font-display text-xl font-bold text-white uppercase">
            5. Contact &amp; Privacy Requests
          </h2>
          <p>
            To request clarification, correction, or removal of published player details, please
            reach out via our official contact email
            {community.contactEmail ? (
              <>
                {' '}
                at{' '}
                <a
                  href={`mailto:${community.contactEmail}`}
                  className="text-white underline underline-offset-4 hover:text-[#22C55E]"
                >
                  {community.contactEmail}
                </a>
              </>
            ) : (
              ' listed on the Contact page'
            )}
            .
          </p>
        </section>
      </article>
    </div>
  );
};
