import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  ExternalLink,
  FileText,
  Globe2,
  Megaphone,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { SiteConfigData } from '../../types/data';
import { validateSiteConfigForAdmin } from '../../utils/validation';

export type SiteSettingsSection = 'hero' | 'social' | 'about' | 'terms';

interface SiteSettingsModuleProps {
  siteConfig: SiteConfigData;
  onChange: (next: SiteConfigData) => void;
  activeSection?: SiteSettingsSection;
  onSectionChange?: (section: SiteSettingsSection) => void;
}

const INPUT_CLASS =
  'w-full rounded-xl bg-[#07090E] border border-slate-700/80 focus:border-[#E11D2E] focus:outline-none px-3.5 py-2 text-sm text-white placeholder:text-slate-500 transition-colors';
const LABEL_CLASS = 'block text-xs font-medium text-slate-300 mb-1.5';

const SECTIONS: Array<{
  id: SiteSettingsSection;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'hero', label: 'Hero & Ticker', desc: 'Brand, tagline & banner strip', icon: Megaphone },
  { id: 'social', label: 'Social & Contact', desc: 'WhatsApp, Instagram, YouTube & email', icon: Share2 },
  { id: 'about', label: 'About & Why Join', desc: 'Story, pillars & highlights', icon: Globe2 },
  { id: 'terms', label: 'Terms & Rules', desc: 'Policy clauses shown on /terms', icon: FileText },
];

export const SiteSettingsModule: React.FC<SiteSettingsModuleProps> = ({
  siteConfig,
  onChange,
  activeSection,
  onSectionChange,
}) => {
  const [internalSection, setInternalSection] = useState<SiteSettingsSection>('hero');
  const currentSection = activeSection ?? internalSection;
  const setSection = (next: SiteSettingsSection) => {
    setInternalSection(next);
    onSectionChange?.(next);
  };

  const errors = useMemo(() => validateSiteConfigForAdmin(siteConfig), [siteConfig]);

  const updateConfig = (updater: (prev: SiteConfigData) => SiteConfigData) => {
    const today = new Date().toISOString().slice(0, 10);
    onChange({
      ...updater(siteConfig),
      lastUpdated: today,
    });
  };

  const renderLinkPreview = (url: string, label: string) => {
    const trimmed = url.trim();
    if (!trimmed.startsWith('https://')) return null;
    return (
      <a
        href={trimmed}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 mt-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300 hover:text-emerald-200 transition-colors"
      >
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
        Test {label}
      </a>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-white/[0.08] bg-[#0B0E15] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[#FF2D3F] mb-1">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Public Website Information • site-config.json
          </div>
          <h2 className="font-display font-bold text-2xl uppercase tracking-tight text-white">
            Site Settings &amp; Social Links
          </h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Edit public branding, ticker alerts, WhatsApp &amp; social links, About section, and Terms.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#07090E] px-3.5 py-2 font-mono text-[11px] text-slate-300 shrink-0">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" aria-hidden="true" />
          <span>{errors.length === 0 ? 'All Settings Valid' : `${errors.length} Check(s) Needed`}</span>
        </div>
      </div>

      {/* Section Sub-Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Site Settings Sections"
        className="grid grid-cols-2 lg:grid-cols-4 gap-2.5"
      >
        {SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const active = currentSection === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSection(sec.id)}
              className={`group text-left p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer ${
                active
                  ? 'border-[#22C55E] bg-[#22C55E]/12 shadow-[0_6px_20px_rgba(34,197,94,0.18)]'
                  : 'border-white/[0.08] bg-[#0B0E15] hover:border-emerald-500/40 hover:bg-[#10181C] hover:-translate-y-0.5'
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon
                  className={`h-4 w-4 transition-colors ${
                    active ? 'text-[#16FF6E]' : 'text-slate-400 group-hover:text-white'
                  }`}
                />
                <span
                  className={`font-display font-bold text-xs uppercase tracking-wider ${
                    active ? 'text-white' : 'text-slate-200 group-hover:text-white'
                  }`}
                >
                  {sec.label}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-400 line-clamp-1">{sec.desc}</p>
            </button>
          );
        })}
      </div>

      {errors.length > 0 && (
        <div
          role="alert"
          className="border border-red-500/60 bg-red-950/35 p-4 text-xs text-red-200 space-y-1"
        >
          <div className="flex items-center gap-2 font-mono uppercase tracking-wider text-red-300 font-semibold">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Please fix before publishing Site Settings:
          </div>
          <ul className="list-disc pl-5 space-y-0.5">
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 1. HERO & LIVE TICKER */}
      {currentSection === 'hero' && (
        <div className="border border-slate-800 bg-[#0D0F14] p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="site-brand-name" className={LABEL_CLASS}>
                Brand Name
              </label>
              <input
                id="site-brand-name"
                type="text"
                maxLength={80}
                value={siteConfig.brandName}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, brandName: e.target.value }))
                }
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label htmlFor="site-tagline" className={LABEL_CLASS}>
                Hero Tagline Headline
              </label>
              <input
                id="site-tagline"
                type="text"
                maxLength={140}
                value={siteConfig.tagline}
                onChange={(e) =>
                  updateConfig((prev) => ({ ...prev, tagline: e.target.value }))
                }
                placeholder="COMPETE. CONNECT. CONQUER."
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label htmlFor="site-hero-description" className={LABEL_CLASS}>
              Hero Intro Description
            </label>
            <textarea
              id="site-hero-description"
              rows={3}
              maxLength={600}
              value={siteConfig.heroDescription}
              onChange={(e) =>
                updateConfig((prev) => ({ ...prev, heroDescription: e.target.value }))
              }
              className={INPUT_CLASS}
            />
          </div>

          <div className="border-t border-slate-800 pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
              <label htmlFor="site-ticker" className={`${LABEL_CLASS} mb-0`}>
                Live Top Announcement Ticker (Leave blank to hide strip on Home page)
              </label>
              {siteConfig.tickerAnnouncement.trim() && (
                <button
                  type="button"
                  onClick={() =>
                    updateConfig((prev) => ({ ...prev, tickerAnnouncement: '' }))
                  }
                  className="font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 border border-slate-700 hover:border-red-500 text-slate-300 hover:text-red-200 transition-colors cursor-pointer"
                >
                  Clear & Hide Ticker
                </button>
              )}
            </div>
            <input
              id="site-ticker"
              type="text"
              maxLength={300}
              value={siteConfig.tickerAnnouncement}
              onChange={(e) =>
                updateConfig((prev) => ({ ...prev, tickerAnnouncement: e.target.value }))
              }
              placeholder="e.g. NEXUSX SEASON 2 REGISTRATIONS OPEN NOW — LIMITED SQUAD SLOTS!"
              className={INPUT_CLASS}
            />
            <p className="mt-1 font-mono text-[10px] text-slate-500">
              {siteConfig.tickerAnnouncement.length}/300 characters
            </p>
          </div>
        </div>
      )}

      {/* 2. WHATSAPP, SOCIALS & CONTACT */}
      {currentSection === 'social' && (
        <div className="border border-slate-800 bg-[#0D0F14] p-5 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label htmlFor="social-wa-community" className={LABEL_CLASS}>
                WhatsApp Community URL (https://)
              </label>
              <input
                id="social-wa-community"
                type="url"
                value={siteConfig.community.whatsappCommunityUrl}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    community: { ...prev.community, whatsappCommunityUrl: e.target.value },
                  }))
                }
                placeholder="https://chat.whatsapp.com/..."
                className={INPUT_CLASS}
              />
              {renderLinkPreview(siteConfig.community.whatsappCommunityUrl, 'WhatsApp Community')}
            </div>

            <div>
              <label htmlFor="social-wa-channel" className={LABEL_CLASS}>
                WhatsApp Channel URL (https://)
              </label>
              <input
                id="social-wa-channel"
                type="url"
                value={siteConfig.community.whatsappChannelUrl ?? ''}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    community: { ...prev.community, whatsappChannelUrl: e.target.value },
                  }))
                }
                placeholder="https://whatsapp.com/channel/..."
                className={INPUT_CLASS}
              />
              {renderLinkPreview(siteConfig.community.whatsappChannelUrl ?? '', 'WhatsApp Channel')}
            </div>

            <div>
              <label htmlFor="social-wa-contact" className={LABEL_CLASS}>
                Organizer WhatsApp Helpdesk URL (https://wa.me/...)
              </label>
              <input
                id="social-wa-contact"
                type="url"
                value={siteConfig.community.whatsappContactUrl}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    community: { ...prev.community, whatsappContactUrl: e.target.value },
                  }))
                }
                placeholder="https://wa.me/91..."
                className={INPUT_CLASS}
              />
              {renderLinkPreview(siteConfig.community.whatsappContactUrl, 'WhatsApp Contact')}
            </div>

            <div>
              <label htmlFor="social-instagram" className={LABEL_CLASS}>
                Instagram Page URL (https://)
              </label>
              <input
                id="social-instagram"
                type="url"
                value={siteConfig.community.instagramUrl}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    community: { ...prev.community, instagramUrl: e.target.value },
                  }))
                }
                placeholder="https://www.instagram.com/..."
                className={INPUT_CLASS}
              />
              {renderLinkPreview(siteConfig.community.instagramUrl, 'Instagram')}
            </div>

            <div>
              <label htmlFor="social-youtube" className={LABEL_CLASS}>
                YouTube Channel URL (https://)
              </label>
              <input
                id="social-youtube"
                type="url"
                value={siteConfig.community.youtubeUrl}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    community: { ...prev.community, youtubeUrl: e.target.value },
                  }))
                }
                placeholder="https://www.youtube.com/@..."
                className={INPUT_CLASS}
              />
              {renderLinkPreview(siteConfig.community.youtubeUrl, 'YouTube')}
            </div>

            <div>
              <label htmlFor="social-discord" className={LABEL_CLASS}>
                Discord Invite URL (Optional https://)
              </label>
              <input
                id="social-discord"
                type="url"
                value={siteConfig.community.discordUrl}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    community: { ...prev.community, discordUrl: e.target.value },
                  }))
                }
                placeholder="https://discord.gg/..."
                className={INPUT_CLASS}
              />
              {renderLinkPreview(siteConfig.community.discordUrl, 'Discord')}
            </div>

            <div className="md:col-span-2">
              <label htmlFor="social-contact-email" className={LABEL_CLASS}>
                Official Contact Email (Public Footer & Community Page — Leave blank to hide)
              </label>
              <input
                id="social-contact-email"
                type="email"
                maxLength={120}
                value={siteConfig.community.contactEmail}
                onChange={(e) =>
                  updateConfig((prev) => ({
                    ...prev,
                    community: { ...prev.community, contactEmail: e.target.value },
                  }))
                }
                placeholder="contact@nexusxesports.in"
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </div>
      )}

      {/* 3. ABOUT & WHY JOIN CARDS */}
      {currentSection === 'about' && (
        <div className="space-y-6">
          <div className="border border-slate-800 bg-[#0D0F14] p-5 sm:p-6 space-y-4">
            <h3 className="font-display font-bold text-base uppercase tracking-wider text-white">
              About Narrative & Community Vision
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="about-heading" className={LABEL_CLASS}>
                  About Heading
                </label>
                <input
                  id="about-heading"
                  type="text"
                  maxLength={120}
                  value={siteConfig.about.heading}
                  onChange={(e) =>
                    updateConfig((prev) => ({
                      ...prev,
                      about: { ...prev.about, heading: e.target.value },
                    }))
                  }
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="about-vision" className={LABEL_CLASS}>
                  Mission / Vision Statement
                </label>
                <input
                  id="about-vision"
                  type="text"
                  maxLength={400}
                  value={siteConfig.about.vision}
                  onChange={(e) =>
                    updateConfig((prev) => ({
                      ...prev,
                      about: { ...prev.about, vision: e.target.value },
                    }))
                  }
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <span className={LABEL_CLASS}>About Paragraphs ({siteConfig.about.paragraphs.length}/6)</span>
                {siteConfig.about.paragraphs.length < 6 && (
                  <button
                    type="button"
                    onClick={() =>
                      updateConfig((prev) => ({
                        ...prev,
                        about: {
                          ...prev.about,
                          paragraphs: [...prev.about.paragraphs, 'New community overview paragraph.'],
                        },
                      }))
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-700 hover:border-[#E11D2E] text-[11px] font-mono uppercase text-slate-200 cursor-pointer"
                  >
                    <Plus className="h-3 w-3" aria-hidden="true" /> Add Paragraph
                  </button>
                )}
              </div>
              {siteConfig.about.paragraphs.map((para, idx) => (
                <div key={idx} className="flex gap-2">
                  <textarea
                    rows={2}
                    maxLength={600}
                    aria-label={`About Paragraph ${idx + 1}`}
                    value={para}
                    onChange={(e) =>
                      updateConfig((prev) => ({
                        ...prev,
                        about: {
                          ...prev.about,
                          paragraphs: prev.about.paragraphs.map((p, i) =>
                            i === idx ? e.target.value : p
                          ),
                        },
                      }))
                    }
                    className={INPUT_CLASS}
                  />
                  {siteConfig.about.paragraphs.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove paragraph ${idx + 1}`}
                      onClick={() =>
                        updateConfig((prev) => ({
                          ...prev,
                          about: {
                            ...prev.about,
                            paragraphs: prev.about.paragraphs.filter((_, i) => i !== idx),
                          },
                        }))
                      }
                      className="px-2.5 border border-slate-800 hover:border-red-500 text-slate-400 hover:text-red-300 cursor-pointer"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Why Join Cards */}
          <div className="border border-slate-800 bg-[#0D0F14] p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-base uppercase tracking-wider text-white">
                Home Page "Why Join NexusX" Cards ({siteConfig.whyJoin.length}/8)
              </h3>
              {siteConfig.whyJoin.length < 8 && (
                <button
                  type="button"
                  onClick={() =>
                    updateConfig((prev) => ({
                      ...prev,
                      whyJoin: [
                        ...prev.whyJoin,
                        { title: 'New Highlight', description: 'Describe why players love competing here.' },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 border border-slate-700 hover:border-[#E11D2E] text-[11px] font-mono uppercase text-slate-200 cursor-pointer"
                >
                  <Plus className="h-3 w-3" aria-hidden="true" /> Add Card
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {siteConfig.whyJoin.map((card, idx) => (
                <div key={idx} className="border border-slate-800 bg-[#080A0E] p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                      Card #{idx + 1}
                    </span>
                    {siteConfig.whyJoin.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          updateConfig((prev) => ({
                            ...prev,
                            whyJoin: prev.whyJoin.filter((_, i) => i !== idx),
                          }))
                        }
                        className="text-slate-400 hover:text-red-300 cursor-pointer"
                        aria-label={`Remove why join card ${idx + 1}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    maxLength={80}
                    aria-label={`Why Join Title ${idx + 1}`}
                    value={card.title}
                    onChange={(e) =>
                      updateConfig((prev) => ({
                        ...prev,
                        whyJoin: prev.whyJoin.map((item, i) =>
                          i === idx ? { ...item, title: e.target.value } : item
                        ),
                      }))
                    }
                    className={INPUT_CLASS}
                  />
                  <textarea
                    rows={2}
                    maxLength={320}
                    aria-label={`Why Join Description ${idx + 1}`}
                    value={card.description}
                    onChange={(e) =>
                      updateConfig((prev) => ({
                        ...prev,
                        whyJoin: prev.whyJoin.map((item, i) =>
                          i === idx ? { ...item, description: e.target.value } : item
                        ),
                      }))
                    }
                    className={INPUT_CLASS}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 4. TERMS & POLICIES */}
      {currentSection === 'terms' && (
        <div className="border border-slate-800 bg-[#0D0F14] p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display font-bold text-base uppercase tracking-wider text-white">
              Terms & Tournament Policy Clauses ({siteConfig.termsSections.length}/20)
            </h3>
            {siteConfig.termsSections.length < 20 && (
              <button
                type="button"
                onClick={() =>
                  updateConfig((prev) => ({
                    ...prev,
                    termsSections: [
                      ...prev.termsSections,
                      {
                        id: `clause-${prev.termsSections.length + 1}`,
                        title: `${prev.termsSections.length + 1}. Additional Rule`,
                        content: 'Describe tournament policy requirement.',
                      },
                    ],
                  }))
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#E11D2E] hover:bg-[#FF2D3F] text-white font-display font-bold text-xs uppercase tracking-wider cursor-pointer transition-colors"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Rule Clause
              </button>
            )}
          </div>

          <div className="space-y-4">
            {siteConfig.termsSections.map((sec, idx) => (
              <div key={idx} className="border border-slate-800 bg-[#080A0E] p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label htmlFor={`term-id-${idx}`} className={LABEL_CLASS}>
                      Clause Anchor ID
                    </label>
                    <input
                      id={`term-id-${idx}`}
                      type="text"
                      maxLength={60}
                      value={sec.id}
                      onChange={(e) =>
                        updateConfig((prev) => ({
                          ...prev,
                          termsSections: prev.termsSections.map((s, i) =>
                            i === idx ? { ...s, id: e.target.value } : s
                          ),
                        }))
                      }
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div className="sm:col-span-2 flex gap-2 items-end">
                    <div className="flex-1">
                      <label htmlFor={`term-title-${idx}`} className={LABEL_CLASS}>
                        Clause Heading
                      </label>
                      <input
                        id={`term-title-${idx}`}
                        type="text"
                        maxLength={140}
                        value={sec.title}
                        onChange={(e) =>
                          updateConfig((prev) => ({
                            ...prev,
                            termsSections: prev.termsSections.map((s, i) =>
                              i === idx ? { ...s, title: e.target.value } : s
                            ),
                          }))
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                    {siteConfig.termsSections.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Delete clause ${sec.title || idx + 1}`}
                        onClick={() =>
                          updateConfig((prev) => ({
                            ...prev,
                            termsSections: prev.termsSections.filter((_, i) => i !== idx),
                          }))
                        }
                        className="h-[38px] px-3 border border-slate-700 hover:border-red-500 text-slate-400 hover:text-red-300 cursor-pointer transition-colors"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <label htmlFor={`term-body-${idx}`} className={LABEL_CLASS}>
                    Policy Details
                  </label>
                  <textarea
                    id={`term-body-${idx}`}
                    rows={3}
                    maxLength={1500}
                    value={sec.content}
                    onChange={(e) =>
                      updateConfig((prev) => ({
                        ...prev,
                        termsSections: prev.termsSections.map((s, i) =>
                          i === idx ? { ...s, content: e.target.value } : s
                        ),
                      }))
                    }
                    className={INPUT_CLASS}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
