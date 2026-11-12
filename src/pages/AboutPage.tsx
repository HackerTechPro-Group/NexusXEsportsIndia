import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Target, Users } from 'lucide-react';
import { useSiteData } from '../context/SiteDataContext';
import { PageMeta } from '../components/common/PageMeta';
import { PageHeader } from '../components/common/PageHeader';
import { DataErrorCard } from '../components/common/DataErrorCard';
import { SocialLinks } from '../components/common/SocialLinks';

export const AboutPage: React.FC = () => {
  const { bundle, datasetErrors, reloadData } = useSiteData();
  const { about, brandName, community } = bundle.siteConfig;
  const icons = [Users, ShieldCheck, Target];

  return (
    <div className="pb-16">
      <PageMeta
        title={`About Us | ${brandName}`}
        description={`Learn about ${brandName}, our BGMI gaming community, competitive opportunities, fair play standards, and future vision.`}
      />

      <PageHeader
        eyebrow="Organization Overview"
        title={`About ${brandName}`}
        description="Dedicated to fair, structured BGMI tournaments and community participation across India."
      />

      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-10 space-y-12">
        {datasetErrors.siteConfig ? (
          <DataErrorCard
            title="Unable to Load Organization Profile"
            detail={datasetErrors.siteConfig}
            onRetry={() => void reloadData(true)}
          />
        ) : (
        <>
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-7 nx-glass rounded-2xl p-6 sm:p-8 space-y-5">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-white uppercase">
              {about.heading}
            </h2>
            {about.paragraphs.map((p, idx) => (
              <p key={`about-p-${idx}`} className="text-slate-300 leading-relaxed">
                {p}
              </p>
            ))}

            {about.vision && (
              <div className="border-l-2 border-[#22C55E] bg-[#080B10] rounded-r-xl p-4">
                <div className="font-mono text-xs uppercase tracking-wider text-[#22C55E] mb-1">
                  Future Vision
                </div>
                <p className="text-sm text-slate-200 leading-relaxed">{about.vision}</p>
              </div>
            )}

            <div className="pt-2 flex flex-wrap gap-3">
              <Link
                to="/tournaments"
                className="nx-btn-neon px-5 py-3 text-sm"
              >
                Explore Tournaments
              </Link>
              <Link
                to="/contact"
                className="rounded-lg px-5 py-3 border border-white/15 hover:border-[#22C55E]/60 text-slate-200 font-display font-semibold text-sm uppercase tracking-wider transition-colors"
              >
                Contact Us
              </Link>
            </div>
          </div>

          <div className="lg:col-span-5 space-y-4">
            {about.pillars.map((pillar, idx) => {
              const Icon = icons[idx % icons.length];
              return (
                <div
                  key={pillar.title}
                  className="nx-glass rounded-xl p-5 flex items-start gap-4"
                >
                  <Icon className="h-6 w-6 text-[#22C55E] shrink-0 mt-0.5" aria-hidden="true" />
                  <div>
                    <h3 className="font-display text-lg font-bold text-white uppercase">
                      {pillar.title}
                    </h3>
                    <p className="mt-1 text-sm text-slate-400 leading-relaxed">
                      {pillar.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="font-display text-2xl font-bold text-white uppercase mb-5">
            Community Channels
          </h2>
          <SocialLinks community={community} variant="cards" />
        </div>
        </>
        )}
      </section>
    </div>
  );
};
