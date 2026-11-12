import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  Eye,
  EyeOff,
  Globe,
  History,
  Image as ImageIcon,
  Info,
  Layout,
  Menu as MenuIcon,
  Plus,
  RefreshCw,
  Rocket,
  RotateCcw,
  Save,
  Search,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { PlatformTournament } from '../../api/platformClient';
import { ConfirmModal } from '../../components/common/ConfirmModal';
import {
  DEFAULT_CMS_SNAPSHOT,
  resolveMediaAssetUrl,
  type CmsNavItem,
  type CmsPublicationState,
  type CmsRevisionRecord,
  type CmsSnapshotPayload,
  type CmsSocialLink,
  type MediaAssetRecord,
} from '../../types/cms';
import {
  deleteAdminMediaAsset,
  fetchAdminCmsPreview,
  fetchAdminCmsWorkspace,
  publishAdminCmsLive,
  rollbackAdminCmsRevision,
  saveAdminCmsDraft,
} from '../api/cmsClient';
import { R2MediaPickerModal } from '../components/R2MediaPickerModal';
import type { AdminModuleTab } from '../types';

interface WebsiteCmsModuleProps {
  apiUrl: string;
  onJumpModule?: (tab: AdminModuleTab) => void;
  onSitePublished?: () => Promise<void> | void;
}

type CmsSectionTab =
  | 'hero'
  | 'featured'
  | 'navigation'
  | 'social'
  | 'footer'
  | 'about-contact'
  | 'seo'
  | 'media'
  | 'revisions';

const INPUT_CLASS =
  'w-full rounded-xl bg-[#070B0E] border border-white/15 focus:border-[#22C55E] focus:outline-none px-3.5 py-2 text-sm text-white placeholder:text-slate-500 transition-colors';
const LABEL_CLASS = 'block font-mono text-[11px] uppercase tracking-wider text-slate-300 mb-1.5';

function reorderArray<T>(list: T[], index: number, delta: -1 | 1): T[] {
  const nextIdx = index + delta;
  if (nextIdx < 0 || nextIdx >= list.length) return list;
  const copy = [...list];
  const [moved] = copy.splice(index, 1);
  copy.splice(nextIdx, 0, moved);
  return copy;
}

export const WebsiteCmsModule: React.FC<WebsiteCmsModuleProps> = ({
  apiUrl,
  onJumpModule,
  onSitePublished,
}) => {
  const [sectionTab, setSectionTab] = useState<CmsSectionTab>('hero');
  const [draft, setDraft] = useState<CmsSnapshotPayload>(() =>
    structuredClone(DEFAULT_CMS_SNAPSHOT)
  );
  const [publication, setPublication] = useState<CmsPublicationState>({
    publishedVersion: 1,
    draftVersion: 1,
    etag: 'cms-v1',
    lastPublishedAt: null,
    lastPublishedBy: null,
    lastRollbackAt: null,
    hasUnpublishedChanges: false,
  });
  const [revisions, setRevisions] = useState<CmsRevisionRecord[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAssetRecord[]>([]);
  const [availableTournaments, setAvailableTournaments] = useState<PlatformTournament[]>([]);

  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [publishSummary, setPublishSummary] = useState('');

  const [previewSnapshot, setPreviewSnapshot] = useState<CmsSnapshotPayload | null>(null);
  const [rollbackConfirmRev, setRollbackConfirmRev] = useState<CmsRevisionRecord | null>(null);
  const [pickerTarget, setPickerTarget] = useState<{
    folder: string;
    onApply: (publicUrl: string) => void;
  } | null>(null);

  const loadWorkspace = useCallback(async () => {
    if (!apiUrl) return;
    setLoading(true);
    setError(null);
    try {
      const ws = await fetchAdminCmsWorkspace(apiUrl);
      setDraft(ws.draft);
      setPublication(ws.publication);
      setRevisions(ws.revisions);
      setMediaAssets(ws.mediaAssets);
      setAvailableTournaments(ws.availableTournaments);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load Website Content Manager workspace from Cloudflare D1.'
      );
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const handleSaveDraft = async (): Promise<boolean> => {
    if (!apiUrl) {
      setError('Connect a Worker API URL to save CMS drafts.');
      return false;
    }
    setBusyAction('draft');
    setError(null);
    setNotice(null);
    try {
      const res = await saveAdminCmsDraft(apiUrl, draft, publication.draftVersion);
      setPublication(res.publication);
      setNotice(
        `Saved CMS draft v${res.draftVersion} cleanly (isolated from live public website until published).`
      );
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save CMS draft.');
      return false;
    } finally {
      setBusyAction(null);
    }
  };

  const handleOpenPreview = async () => {
    if (!apiUrl) {
      setPreviewSnapshot(draft);
      return;
    }
    setBusyAction('preview');
    setError(null);
    try {
      const saved = await saveAdminCmsDraft(apiUrl, draft, publication.draftVersion);
      setPublication(saved.publication);
      const previewRes = await fetchAdminCmsPreview(apiUrl);
      setPreviewSnapshot(previewRes.draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate CMS draft preview.');
    } finally {
      setBusyAction(null);
    }
  };

  const handlePublishLive = async () => {
    if (!apiUrl) {
      setError('Connect a Worker API URL to publish CMS updates.');
      return;
    }
    setBusyAction('publish');
    setError(null);
    setNotice(null);
    try {
      const saved = await saveAdminCmsDraft(apiUrl, draft, publication.draftVersion);
      setPublication(saved.publication);
      const pubRes = await publishAdminCmsLive(
        apiUrl,
        publishSummary.trim() || `Live publish v${publication.publishedVersion + 1}`
      );
      setPublication(pubRes.publication);
      setPublishSummary('');
      await loadWorkspace();
      await onSitePublished?.();
      setNotice(
        `Published CMS v${pubRes.version} to the live website & refreshed Cloudflare KV edge cache.`
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to publish live website updates (Owner privilege required).'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleConfirmRollback = async () => {
    if (!apiUrl || !rollbackConfirmRev) return;
    setBusyAction('rollback');
    setError(null);
    setNotice(null);
    try {
      const res = await rollbackAdminCmsRevision(apiUrl, rollbackConfirmRev.id);
      setDraft(res.snapshot);
      setPublication(res.publication);
      setRollbackConfirmRev(null);
      await loadWorkspace();
      await onSitePublished?.();
      setNotice(
        `Rolled back live website to revision v${rollbackConfirmRev.versionNumber} (now live v${res.version}).`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rollback failed.');
    } finally {
      setBusyAction(null);
    }
  };

  const formatFieldValue = (current: string, wrapper: '**' | '• ') => {
    if (wrapper === '**') {
      return current ? `${current} **highlight**` : '**Bold Heading**';
    }
    return current ? `${current}\n• Bullet point` : '• First highlight';
  };

  const cmsTabs: Array<{ id: CmsSectionTab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'hero', label: 'Hero Section', icon: Sparkles },
    { id: 'featured', label: 'Featured & Order', icon: Layout },
    { id: 'navigation', label: 'Navigation', icon: MenuIcon },
    { id: 'social', label: 'Social Channels', icon: Share2 },
    { id: 'footer', label: 'Footer', icon: Globe },
    { id: 'about-contact', label: 'About & Contact', icon: Info },
    { id: 'seo', label: 'SEO & Meta', icon: Search },
    { id: 'media', label: `R2 Media (${mediaAssets.length})`, icon: ImageIcon },
    { id: 'revisions', label: `History (${revisions.length})`, icon: History },
  ];

  const sortableLayoutSections = [
    {
      key: 'hero',
      label: 'Hero Carousel Showcase',
      visible: draft.hero.visible,
      order: draft.hero.displayOrder,
      setVisible: (v: boolean) => setDraft((p) => ({ ...p, hero: { ...p.hero, visible: v } })),
      setOrder: (o: number) => setDraft((p) => ({ ...p, hero: { ...p.hero, displayOrder: o } })),
    },
    {
      key: 'featured',
      label: 'Featured Tournaments Spotlight',
      visible: draft.featured.visible,
      order: draft.featured.displayOrder,
      setVisible: (v: boolean) => setDraft((p) => ({ ...p, featured: { ...p.featured, visible: v } })),
      setOrder: (o: number) => setDraft((p) => ({ ...p, featured: { ...p.featured, displayOrder: o } })),
    },
    {
      key: 'tournaments',
      label: 'BGMI Tournaments Grid',
      visible: draft.sections.tournaments.visible,
      order: draft.sections.tournaments.displayOrder,
      setVisible: (v: boolean) =>
        setDraft((p) => ({
          ...p,
          sections: { ...p.sections, tournaments: { ...p.sections.tournaments, visible: v } },
        })),
      setOrder: (o: number) =>
        setDraft((p) => ({
          ...p,
          sections: { ...p.sections, tournaments: { ...p.sections.tournaments, displayOrder: o } },
        })),
    },
    {
      key: 'results',
      label: 'Verified Podium & Results',
      visible: draft.sections.results.visible,
      order: draft.sections.results.displayOrder,
      setVisible: (v: boolean) =>
        setDraft((p) => ({
          ...p,
          sections: { ...p.sections, results: { ...p.sections.results, visible: v } },
        })),
      setOrder: (o: number) =>
        setDraft((p) => ({
          ...p,
          sections: { ...p.sections, results: { ...p.sections.results, displayOrder: o } },
        })),
    },
    {
      key: 'news',
      label: 'Latest Updates & Arena Gallery',
      visible: draft.sections.news.visible,
      order: draft.sections.news.displayOrder,
      setVisible: (v: boolean) =>
        setDraft((p) => ({
          ...p,
          sections: { ...p.sections, news: { ...p.sections.news, visible: v } },
        })),
      setOrder: (o: number) =>
        setDraft((p) => ({
          ...p,
          sections: { ...p.sections, news: { ...p.sections.news, displayOrder: o } },
        })),
    },
    {
      key: 'social',
      label: 'Official Social Channels',
      visible: draft.sections.social.visible,
      order: draft.sections.social.displayOrder,
      setVisible: (v: boolean) =>
        setDraft((p) => ({
          ...p,
          sections: { ...p.sections, social: { ...p.sections.social, visible: v } },
        })),
      setOrder: (o: number) =>
        setDraft((p) => ({
          ...p,
          sections: { ...p.sections, social: { ...p.sections.social, displayOrder: o } },
        })),
    },
    {
      key: 'about',
      label: 'About NexusX Section',
      visible: draft.aboutContact.aboutVisible,
      order: draft.aboutContact.aboutOrder,
      setVisible: (v: boolean) =>
        setDraft((p) => ({ ...p, aboutContact: { ...p.aboutContact, aboutVisible: v } })),
      setOrder: (o: number) =>
        setDraft((p) => ({ ...p, aboutContact: { ...p.aboutContact, aboutOrder: o } })),
    },
    {
      key: 'contact',
      label: 'Organizer Contact Section',
      visible: draft.aboutContact.contactVisible,
      order: draft.aboutContact.contactOrder,
      setVisible: (v: boolean) =>
        setDraft((p) => ({ ...p, aboutContact: { ...p.aboutContact, contactVisible: v } })),
      setOrder: (o: number) =>
        setDraft((p) => ({ ...p, aboutContact: { ...p.aboutContact, contactOrder: o } })),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Studio Command Bar */}
      <div className="nx-glass rounded-2xl p-5 border border-[#22C55E]/35 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#22C55E]/15 border border-[#22C55E]/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#16FF6E]">
                Dynamic Website CMS + R2 Media
              </span>
              <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] text-slate-200">
                Live v{publication.publishedVersion} • Draft v{publication.draftVersion}
              </span>
              {publication.hasUnpublishedChanges && (
                <span className="rounded-md bg-amber-500/20 border border-amber-400/40 px-2 py-0.5 font-mono text-[10px] text-amber-300">
                  Unpublished Draft Changes
                </span>
              )}
            </div>
            <h2 className="font-display text-2xl font-bold text-white uppercase">
              Website Content Manager
            </h2>
            <p className="text-xs text-slate-400">
              Edit Hero slides, Featured tournaments, Navigation, Social links, Footer, About/Contact &amp; SEO. Save isolated drafts, preview, and publish live to Cloudflare D1 + KV.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              disabled={loading || Boolean(busyAction)}
              onClick={() => void loadWorkspace()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/15 bg-black/40 hover:border-white/35 px-3.5 py-2 text-xs font-mono text-slate-200 cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
              Refresh
            </button>

            <button
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => void handleSaveDraft()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/45 bg-cyan-500/15 hover:bg-cyan-500/25 px-4 py-2 text-xs font-mono font-bold uppercase text-cyan-300 cursor-pointer"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {busyAction === 'draft' ? 'Saving Draft...' : 'Save Draft'}
            </button>

            <button
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => void handleOpenPreview()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-mono font-bold uppercase text-white cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
              {busyAction === 'preview' ? 'Opening...' : 'Preview Draft'}
            </button>

            <button
              type="button"
              disabled={Boolean(busyAction)}
              onClick={() => void handlePublishLive()}
              className="inline-flex items-center gap-1.5 rounded-xl nx-btn-neon px-4 py-2 text-xs font-mono font-bold uppercase cursor-pointer"
            >
              <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
              {busyAction === 'publish' ? 'Publishing...' : 'Publish Live Website'}
            </button>
          </div>
        </div>

        {/* Quick Links to Core Content Managers (No Duplicate Forms) */}
        {onJumpModule && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10 text-xs">
            <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 mr-1">
              Connected Data Records:
            </span>
            <button
              type="button"
              onClick={() => onJumpModule('tournaments')}
              className="rounded-lg border border-white/15 bg-black/40 hover:border-[#22C55E] px-2.5 py-1 font-mono text-[11px] text-slate-200 hover:text-[#16FF6E] cursor-pointer"
            >
              Manage BGMI Tournaments →
            </button>
            <button
              type="button"
              onClick={() => onJumpModule('results')}
              className="rounded-lg border border-white/15 bg-black/40 hover:border-[#22C55E] px-2.5 py-1 font-mono text-[11px] text-slate-200 hover:text-[#16FF6E] cursor-pointer"
            >
              Manage Verified Podium &amp; Results →
            </button>
            <button
              type="button"
              onClick={() => onJumpModule('news')}
              className="rounded-lg border border-white/15 bg-black/40 hover:border-[#22C55E] px-2.5 py-1 font-mono text-[11px] text-slate-200 hover:text-[#16FF6E] cursor-pointer"
            >
              Manage News &amp; Updates →
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/45 bg-red-950/35 px-4 py-3 text-xs text-red-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="rounded-xl border border-emerald-500/45 bg-emerald-950/35 px-4 py-3 text-xs text-emerald-200 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-[#16FF6E] shrink-0 mt-0.5" aria-hidden="true" />
            <span>{notice}</span>
          </div>
        )}
      </div>

      {/* CMS Section Tabs */}
      <div className="flex flex-wrap gap-2">
        {cmsTabs.map((tab) => {
          const Icon = tab.icon;
          const active = sectionTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSectionTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-mono uppercase tracking-wider border transition-colors cursor-pointer ${
                active
                  ? 'bg-[#22C55E] border-[#22C55E] text-[#050709] font-bold'
                  : 'bg-[#080C10] border-white/10 text-slate-300 hover:text-white hover:border-[#22C55E]/40'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SECTION A: HERO SECTION MANAGER */}
      {sectionTab === 'hero' && (
        <div className="nx-glass rounded-2xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <h3 className="font-display text-lg font-bold text-white uppercase">
                Hero Carousel Slides ({draft.hero.slides.length}/8)
              </h3>
              <p className="text-xs text-slate-400">
                Configure slide headings, descriptions, desktop &amp; mobile artwork (with Cloudflare R2 uploads), CTAs, and text alignment.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-mono text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.hero.visible}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, hero: { ...p.hero, visible: e.target.checked } }))
                  }
                  className="accent-[#22C55E]"
                />
                Section Visible
              </label>
              <button
                type="button"
                disabled={draft.hero.slides.length >= 8}
                onClick={() =>
                  setDraft((p) => ({
                    ...p,
                    hero: {
                      ...p.hero,
                      slides: [
                        ...p.hero.slides,
                        {
                          id: `slide-${Date.now().toString(36)}`,
                          badge: 'BGMI TOURNAMENT',
                          heading: 'NEW BGMI SHOWDOWN',
                          subtitle: 'Play • Compete • Win',
                          description: 'Register your squad and compete in official NexusX BGMI custom rooms.',
                          desktopImage: './images/hero-arena.jpg',
                          mobileImage: './images/hero-arena.jpg',
                          primaryCtaText: 'View Tournaments',
                          primaryCtaHref: '#tournaments',
                          secondaryCtaText: 'Latest Results',
                          secondaryCtaHref: '#results',
                          textAlign: 'left',
                        },
                      ],
                    },
                  }))
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#22C55E]/15 hover:bg-[#22C55E]/25 border border-[#22C55E]/40 px-3 py-1.5 text-xs font-mono text-[#16FF6E] cursor-pointer disabled:opacity-40"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add Slide
              </button>
            </div>
          </div>

          <div className="space-y-5">
            {draft.hero.slides.map((slide, idx) => (
              <div
                key={slide.id}
                className="rounded-2xl border border-white/10 bg-[#05090C]/90 p-5 space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold uppercase text-[#16FF6E]">
                    Slide #{idx + 1} — {slide.heading || 'Untitled'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() =>
                        setDraft((p) => ({
                          ...p,
                          hero: { ...p.hero, slides: reorderArray(p.hero.slides, idx, -1) },
                        }))
                      }
                      aria-label="Move slide up"
                      className="rounded-lg border border-white/15 p-1.5 text-slate-300 hover:text-white disabled:opacity-35 cursor-pointer"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draft.hero.slides.length - 1}
                      onClick={() =>
                        setDraft((p) => ({
                          ...p,
                          hero: { ...p.hero, slides: reorderArray(p.hero.slides, idx, 1) },
                        }))
                      }
                      aria-label="Move slide down"
                      className="rounded-lg border border-white/15 p-1.5 text-slate-300 hover:text-white disabled:opacity-35 cursor-pointer"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    {draft.hero.slides.length > 1 && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((p) => ({
                            ...p,
                            hero: {
                              ...p.hero,
                              slides: p.hero.slides.filter((s) => s.id !== slide.id),
                            },
                          }))
                        }
                        aria-label="Delete slide"
                        className="rounded-lg border border-red-500/30 p-1.5 text-red-300 hover:text-red-200 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className={LABEL_CLASS}>Main Heading</label>
                      <input
                        type="text"
                        value={slide.heading}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft((p) => ({
                            ...p,
                            hero: {
                              ...p.hero,
                              slides: p.hero.slides.map((s) =>
                                s.id === slide.id ? { ...s, heading: v } : s
                              ),
                            },
                          }));
                        }}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Subtitle</label>
                      <input
                        type="text"
                        value={slide.subtitle}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft((p) => ({
                            ...p,
                            hero: {
                              ...p.hero,
                              slides: p.hero.slides.map((s) =>
                                s.id === slide.id ? { ...s, subtitle: v } : s
                              ),
                            },
                          }));
                        }}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Badge Tag</label>
                      <input
                        type="text"
                        value={slide.badge}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft((p) => ({
                            ...p,
                            hero: {
                              ...p.hero,
                              slides: p.hero.slides.map((s) =>
                                s.id === slide.id ? { ...s, badge: v } : s
                              ),
                            },
                          }));
                        }}
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Text Alignment</label>
                      <select
                        value={slide.textAlign}
                        onChange={(e) => {
                          const v = e.target.value === 'center' ? 'center' : 'left';
                          setDraft((p) => ({
                            ...p,
                            hero: {
                              ...p.hero,
                              slides: p.hero.slides.map((s) =>
                                s.id === slide.id ? { ...s, textAlign: v } : s
                              ),
                            },
                          }));
                        }}
                        className={INPUT_CLASS}
                      >
                        <option value="left">Left Aligned (Classic)</option>
                        <option value="center">Center Spotlight</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <div className="flex items-center justify-between mb-1">
                        <label className={LABEL_CLASS}>Description</label>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setDraft((p) => ({
                                ...p,
                                hero: {
                                  ...p.hero,
                                  slides: p.hero.slides.map((s) =>
                                    s.id === slide.id
                                      ? { ...s, description: formatFieldValue(s.description, '**') }
                                      : s
                                  ),
                                },
                              }))
                            }
                            className="rounded border border-white/15 px-2 py-0.5 font-mono text-[10px] text-slate-300 hover:text-white cursor-pointer"
                          >
                            + Bold Snippet
                          </button>
                        </div>
                      </div>
                      <textarea
                        rows={2}
                        value={slide.description}
                        onChange={(e) => {
                          const v = e.target.value;
                          setDraft((p) => ({
                            ...p,
                            hero: {
                              ...p.hero,
                              slides: p.hero.slides.map((s) =>
                                s.id === slide.id ? { ...s, description: v } : s
                              ),
                            },
                          }));
                        }}
                        className={INPUT_CLASS}
                      />
                    </div>

                    <div>
                      <label className={LABEL_CLASS}>Primary CTA Text &amp; Link</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={slide.primaryCtaText}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft((p) => ({
                              ...p,
                              hero: {
                                ...p.hero,
                                slides: p.hero.slides.map((s) =>
                                  s.id === slide.id ? { ...s, primaryCtaText: v } : s
                                ),
                              },
                            }));
                          }}
                          className={INPUT_CLASS}
                        />
                        <input
                          type="text"
                          value={slide.primaryCtaHref}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft((p) => ({
                              ...p,
                              hero: {
                                ...p.hero,
                                slides: p.hero.slides.map((s) =>
                                  s.id === slide.id ? { ...s, primaryCtaHref: v } : s
                                ),
                              },
                            }));
                          }}
                          placeholder="#tournaments"
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Secondary CTA Text &amp; Link</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={slide.secondaryCtaText}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft((p) => ({
                              ...p,
                              hero: {
                                ...p.hero,
                                slides: p.hero.slides.map((s) =>
                                  s.id === slide.id ? { ...s, secondaryCtaText: v } : s
                                ),
                              },
                            }));
                          }}
                          className={INPUT_CLASS}
                        />
                        <input
                          type="text"
                          value={slide.secondaryCtaHref}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft((p) => ({
                              ...p,
                              hero: {
                                ...p.hero,
                                slides: p.hero.slides.map((s) =>
                                  s.id === slide.id ? { ...s, secondaryCtaHref: v } : s
                                ),
                              },
                            }));
                          }}
                          placeholder="#results"
                          className={INPUT_CLASS}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Desktop + Mobile Image Preview + R2 Upload Picker */}
                  <div className="lg:col-span-4 space-y-3">
                    <div>
                      <label className={LABEL_CLASS}>Desktop Image</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={slide.desktopImage}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft((p) => ({
                              ...p,
                              hero: {
                                ...p.hero,
                                slides: p.hero.slides.map((s) =>
                                  s.id === slide.id ? { ...s, desktopImage: v } : s
                                ),
                              },
                            }));
                          }}
                          className={INPUT_CLASS}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPickerTarget({
                              folder: 'hero',
                              onApply: (url) =>
                                setDraft((p) => ({
                                  ...p,
                                  hero: {
                                    ...p.hero,
                                    slides: p.hero.slides.map((s) =>
                                      s.id === slide.id ? { ...s, desktopImage: url } : s
                                    ),
                                  },
                                })),
                            })
                          }
                          className="shrink-0 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/15 px-3 text-xs font-mono text-[#16FF6E] cursor-pointer"
                        >
                          R2 / Pick
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className={LABEL_CLASS}>Mobile Image (Optional)</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={slide.mobileImage}
                          onChange={(e) => {
                            const v = e.target.value;
                            setDraft((p) => ({
                              ...p,
                              hero: {
                                ...p.hero,
                                slides: p.hero.slides.map((s) =>
                                  s.id === slide.id ? { ...s, mobileImage: v } : s
                                ),
                              },
                            }));
                          }}
                          className={INPUT_CLASS}
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPickerTarget({
                              folder: 'hero-mobile',
                              onApply: (url) =>
                                setDraft((p) => ({
                                  ...p,
                                  hero: {
                                    ...p.hero,
                                    slides: p.hero.slides.map((s) =>
                                      s.id === slide.id ? { ...s, mobileImage: url } : s
                                    ),
                                  },
                                })),
                            })
                          }
                          className="shrink-0 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/15 px-3 text-xs font-mono text-[#16FF6E] cursor-pointer"
                        >
                          R2 / Pick
                        </button>
                      </div>
                    </div>

                    <div className="relative h-28 rounded-xl overflow-hidden border border-white/15 bg-black">
                      <img
                        src={resolveMediaAssetUrl(slide.desktopImage) || './images/hero-arena.jpg'}
                        alt="Hero preview"
                        className="h-full w-full object-cover opacity-80"
                      />
                      <span className="absolute bottom-1.5 left-2 rounded bg-black/80 px-2 py-0.5 font-mono text-[10px] text-[#16FF6E]">
                        Live Visual Preview
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION B & PAGE SECTION ORDERING */}
      {sectionTab === 'featured' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 nx-glass rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="font-display text-lg font-bold text-white uppercase">
                  Featured Tournaments Selector
                </h3>
                <p className="text-xs text-slate-400">
                  Featured items pull dynamically from real BGMI tournaments in D1 — zero duplicated data.
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-mono text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.featured.visible}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      featured: { ...p.featured, visible: e.target.checked },
                    }))
                  }
                  className="accent-[#22C55E]"
                />
                Visible
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LABEL_CLASS}>Featured Section Heading</label>
                <input
                  type="text"
                  value={draft.featured.heading}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      featured: { ...p.featured, heading: e.target.value },
                    }))
                  }
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Description</label>
                <input
                  type="text"
                  value={draft.featured.description}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      featured: { ...p.featured, description: e.target.value },
                    }))
                  }
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="space-y-2.5">
              <div className={LABEL_CLASS}>Select &amp; Order Featured Real D1 Tournaments</div>
              {availableTournaments.length === 0 ? (
                <p className="text-xs text-slate-400">
                  No tournaments found in D1 yet. Create or sync tournaments first.
                </p>
              ) : (
                <div className="space-y-2">
                  {availableTournaments.map((t) => {
                    const checked = draft.featured.tournamentIds.includes(t.id);
                    return (
                      <div
                        key={t.id}
                        className="rounded-xl border border-white/10 bg-[#05090C] p-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const nextIds = e.target.checked
                                ? [...draft.featured.tournamentIds, t.id]
                                : draft.featured.tournamentIds.filter((id) => id !== t.id);
                              setDraft((p) => ({
                                ...p,
                                featured: { ...p.featured, tournamentIds: nextIds },
                              }));
                            }}
                            className="accent-[#22C55E]"
                          />
                          <div>
                            <div className="text-sm font-semibold text-white">{t.title}</div>
                            <div className="font-mono text-[10px] text-slate-400">
                              {t.format} • {t.map} • {t.prizePool}
                            </div>
                          </div>
                        </label>
                        {checked && (
                          <button
                            type="button"
                            onClick={() =>
                              setPickerTarget({
                                folder: 'featured',
                                onApply: (url) =>
                                  setDraft((p) => ({
                                    ...p,
                                    featured: {
                                      ...p.featured,
                                      bannerOverrides: {
                                        ...(p.featured.bannerOverrides ?? {}),
                                        [t.id]: url,
                                      },
                                    },
                                  })),
                              })
                            }
                            className="rounded-lg border border-[#22C55E]/35 bg-[#22C55E]/10 px-2.5 py-1 font-mono text-[10px] text-[#16FF6E] cursor-pointer"
                          >
                            {draft.featured.bannerOverrides?.[t.id]
                              ? 'Banner Override Set'
                              : 'Custom Banner'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Section Visibility & Page Order Control */}
          <div className="lg:col-span-5 nx-glass rounded-2xl p-6 space-y-4">
            <h3 className="font-display text-lg font-bold text-white uppercase border-b border-white/10 pb-3">
              Public Page Section Order &amp; Visibility
            </h3>
            <div className="space-y-2.5">
              {sortableLayoutSections.map((sec) => (
                <div
                  key={sec.key}
                  className="rounded-xl border border-white/10 bg-[#05090C] p-3 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-sm font-medium text-white">{sec.label}</div>
                    <div className="font-mono text-[10px] text-slate-400">Order #{sec.order}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={sec.order}
                      onChange={(e) => sec.setOrder(Number(e.target.value) || 1)}
                      aria-label={`${sec.label} order`}
                      className="w-14 rounded-lg bg-black border border-white/15 px-2 py-1 text-center font-mono text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => sec.setVisible(!sec.visible)}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-mono text-[10px] uppercase border cursor-pointer ${
                        sec.visible
                          ? 'bg-[#22C55E]/15 border-[#22C55E]/40 text-[#16FF6E]'
                          : 'bg-white/5 border-white/15 text-slate-400'
                      }`}
                    >
                      {sec.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                      {sec.visible ? 'Shown' : 'Hidden'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SECTION G: NAVIGATION MANAGER */}
      {sectionTab === 'navigation' && (
        <div className="nx-glass rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="font-display text-lg font-bold text-white uppercase">
                Public Navigation Menu ({draft.navigation.length})
              </h3>
              <p className="text-xs text-slate-400">
                Rename, reorder, toggle desktop/mobile visibility, or add smooth-scroll anchors &amp; external links.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next: CmsNavItem = {
                  id: `nav-${Date.now().toString(36)}`,
                  label: 'New Link',
                  href: '#tournaments',
                  itemType: 'anchor',
                  visible: true,
                  showMobile: true,
                  openInNewTab: false,
                  displayOrder: draft.navigation.length + 1,
                };
                setDraft((p) => ({ ...p, navigation: [...p.navigation, next] }));
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 px-3 py-1.5 text-xs font-mono text-[#16FF6E] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Menu Item
            </button>
          </div>

          <div className="space-y-3">
            {draft.navigation.map((item, idx) => (
              <div
                key={item.id}
                className="rounded-xl border border-white/10 bg-[#05090C] p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
              >
                <div className="md:col-span-3">
                  <label className={LABEL_CLASS}>Label</label>
                  <input
                    type="text"
                    value={item.label}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        navigation: p.navigation.map((n) =>
                          n.id === item.id ? { ...n, label: e.target.value } : n
                        ),
                      }))
                    }
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="md:col-span-3">
                  <label className={LABEL_CLASS}>Target URL / Anchor</label>
                  <input
                    type="text"
                    value={item.href}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        navigation: p.navigation.map((n) =>
                          n.id === item.id ? { ...n, href: e.target.value } : n
                        ),
                      }))
                    }
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={LABEL_CLASS}>Type</label>
                  <select
                    value={item.itemType}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        navigation: p.navigation.map((n) =>
                          n.id === item.id
                            ? { ...n, itemType: e.target.value as CmsNavItem['itemType'] }
                            : n
                        ),
                      }))
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="anchor">Anchor (#)</option>
                    <option value="route">Route (/)</option>
                    <option value="external">External HTTPS</option>
                  </select>
                </div>
                <div className="md:col-span-4 flex flex-wrap items-center justify-end gap-3 pt-4 md:pt-0">
                  <label className="inline-flex items-center gap-1 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.visible}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          navigation: p.navigation.map((n) =>
                            n.id === item.id ? { ...n, visible: e.target.checked } : n
                          ),
                        }))
                      }
                      className="accent-[#22C55E]"
                    />
                    Visible
                  </label>
                  <label className="inline-flex items-center gap-1 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.showMobile}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          navigation: p.navigation.map((n) =>
                            n.id === item.id ? { ...n, showMobile: e.target.checked } : n
                          ),
                        }))
                      }
                      className="accent-[#22C55E]"
                    />
                    Mobile
                  </label>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        navigation: reorderArray(p.navigation, idx, -1).map((n, i) => ({
                          ...n,
                          displayOrder: i + 1,
                        })),
                      }))
                    }
                    className="rounded-lg border border-white/15 p-1.5 text-slate-300 cursor-pointer disabled:opacity-35"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === draft.navigation.length - 1}
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        navigation: reorderArray(p.navigation, idx, 1).map((n, i) => ({
                          ...n,
                          displayOrder: i + 1,
                        })),
                      }))
                    }
                    className="rounded-lg border border-white/15 p-1.5 text-slate-300 cursor-pointer disabled:opacity-35"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        navigation: p.navigation.filter((n) => n.id !== item.id),
                      }))
                    }
                    className="rounded-lg border border-red-500/30 p-1.5 text-red-300 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION F: SOCIAL LINKS MANAGER */}
      {sectionTab === 'social' && (
        <div className="nx-glass rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="font-display text-lg font-bold text-white uppercase">
                Official Social Channels ({draft.socialLinks.length})
              </h3>
              <p className="text-xs text-slate-400">
                Add, edit, toggle visibility, or reorder icon-labeled community links across homepage and footer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const next: CmsSocialLink = {
                  id: `social-${Date.now().toString(36)}`,
                  platform: 'discord',
                  label: 'Official Discord',
                  subtitle: 'Squad check-ins and voice lobbies',
                  url: 'https://discord.gg/nexusx-esports',
                  iconName: 'discord',
                  visible: true,
                  displayOrder: draft.socialLinks.length + 1,
                };
                setDraft((p) => ({ ...p, socialLinks: [...p.socialLinks, next] }));
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#22C55E]/15 border border-[#22C55E]/40 px-3 py-1.5 text-xs font-mono text-[#16FF6E] cursor-pointer"
            >
              <Plus className="h-3.5 w-3.5" /> Add Social Link
            </button>
          </div>

          <div className="space-y-3">
            {draft.socialLinks.map((soc, idx) => (
              <div
                key={soc.id}
                className="rounded-xl border border-white/10 bg-[#05090C] p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
              >
                <div className="md:col-span-2">
                  <label className={LABEL_CLASS}>Platform Icon</label>
                  <select
                    value={soc.platform}
                    onChange={(e) => {
                      const val = e.target.value as CmsSocialLink['platform'];
                      setDraft((p) => ({
                        ...p,
                        socialLinks: p.socialLinks.map((s) =>
                          s.id === soc.id ? { ...s, platform: val, iconName: val } : s
                        ),
                      }));
                    }}
                    className={INPUT_CLASS}
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="instagram">Instagram</option>
                    <option value="youtube">YouTube</option>
                    <option value="discord">Discord</option>
                    <option value="telegram">Telegram</option>
                    <option value="x">X / Twitter</option>
                    <option value="website">Website</option>
                  </select>
                </div>
                <div className="md:col-span-3">
                  <label className={LABEL_CLASS}>Display Label</label>
                  <input
                    type="text"
                    value={soc.label}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        socialLinks: p.socialLinks.map((s) =>
                          s.id === soc.id ? { ...s, label: e.target.value } : s
                        ),
                      }))
                    }
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="md:col-span-4">
                  <label className={LABEL_CLASS}>HTTPS Destination URL</label>
                  <input
                    type="url"
                    value={soc.url}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        socialLinks: p.socialLinks.map((s) =>
                          s.id === soc.id ? { ...s, url: e.target.value } : s
                        ),
                      }))
                    }
                    className={INPUT_CLASS}
                  />
                </div>
                <div className="md:col-span-3 flex items-center justify-end gap-2 pt-4 md:pt-0">
                  <label className="inline-flex items-center gap-1 text-xs text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={soc.visible}
                      onChange={(e) =>
                        setDraft((p) => ({
                          ...p,
                          socialLinks: p.socialLinks.map((s) =>
                            s.id === soc.id ? { ...s, visible: e.target.checked } : s
                          ),
                        }))
                      }
                      className="accent-[#22C55E]"
                    />
                    Visible
                  </label>
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        socialLinks: reorderArray(p.socialLinks, idx, -1).map((s, i) => ({
                          ...s,
                          displayOrder: i + 1,
                        })),
                      }))
                    }
                    className="rounded-lg border border-white/15 p-1.5 text-slate-300 cursor-pointer disabled:opacity-35"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        socialLinks: p.socialLinks.filter((s) => s.id !== soc.id),
                      }))
                    }
                    className="rounded-lg border border-red-500/30 p-1.5 text-red-300 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION H: FOOTER MANAGER */}
      {sectionTab === 'footer' && (
        <div className="nx-glass rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <h3 className="font-display text-lg font-bold text-white uppercase">
              Footer &amp; Brand Attribution
            </h3>
            <label className="inline-flex items-center gap-2 text-xs font-mono text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.footer.visible}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, footer: { ...p.footer, visible: e.target.checked } }))
                }
                className="accent-[#22C55E]"
              />
              Footer Visible
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Brand Name</label>
              <input
                type="text"
                value={draft.footer.brandName}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, footer: { ...p.footer, brandName: e.target.value } }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Tagline</label>
              <input
                type="text"
                value={draft.footer.tagline}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, footer: { ...p.footer, tagline: e.target.value } }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Footer Logo Image URL</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft.footer.logoUrl}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, footer: { ...p.footer, logoUrl: e.target.value } }))
                  }
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() =>
                    setPickerTarget({
                      folder: 'branding',
                      onApply: (url) =>
                        setDraft((p) => ({ ...p, footer: { ...p.footer, logoUrl: url } })),
                    })
                  }
                  className="shrink-0 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/15 px-3 text-xs font-mono text-[#16FF6E] cursor-pointer"
                >
                  R2 / Pick
                </button>
              </div>
            </div>
            <div>
              <label className={LABEL_CLASS}>Copyright Text</label>
              <input
                type="text"
                value={draft.footer.copyrightText}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    footer: { ...p.footer, copyrightText: e.target.value },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div className="md:col-span-2">
              <label className={LABEL_CLASS}>Footer Description</label>
              <textarea
                rows={2}
                value={draft.footer.description}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, footer: { ...p.footer, description: e.target.value } }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>BGMI / Krafton Disclaimer</label>
              <input
                type="text"
                value={draft.footer.disclaimerText}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    footer: { ...p.footer, disclaimerText: e.target.value },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Legal Note</label>
              <input
                type="text"
                value={draft.footer.legalNote}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, footer: { ...p.footer, legalNote: e.target.value } }))
                }
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION I: ABOUT & CONTACT */}
      {sectionTab === 'about-contact' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="nx-glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-display text-lg font-bold text-white uppercase">
                About NexusX Section
              </h3>
              <label className="inline-flex items-center gap-2 text-xs font-mono text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.aboutContact.aboutVisible}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      aboutContact: { ...p.aboutContact, aboutVisible: e.target.checked },
                    }))
                  }
                  className="accent-[#22C55E]"
                />
                Show on Website
              </label>
            </div>
            <div>
              <label className={LABEL_CLASS}>About Heading</label>
              <input
                type="text"
                value={draft.aboutContact.aboutHeading}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    aboutContact: { ...p.aboutContact, aboutHeading: e.target.value },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Organization Story</label>
              <textarea
                rows={4}
                value={draft.aboutContact.aboutBody}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    aboutContact: { ...p.aboutContact, aboutBody: e.target.value },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Future Vision Statement</label>
              <input
                type="text"
                value={draft.aboutContact.aboutVision}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    aboutContact: { ...p.aboutContact, aboutVision: e.target.value },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>About Feature Image</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft.aboutContact.aboutImageUrl}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      aboutContact: { ...p.aboutContact, aboutImageUrl: e.target.value },
                    }))
                  }
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() =>
                    setPickerTarget({
                      folder: 'about',
                      onApply: (url) =>
                        setDraft((p) => ({
                          ...p,
                          aboutContact: { ...p.aboutContact, aboutImageUrl: url },
                        })),
                    })
                  }
                  className="shrink-0 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/15 px-3 text-xs font-mono text-[#16FF6E] cursor-pointer"
                >
                  R2 / Pick
                </button>
              </div>
            </div>
          </div>

          <div className="nx-glass rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-display text-lg font-bold text-white uppercase">
                Contact &amp; Organizer Support
              </h3>
              <label className="inline-flex items-center gap-2 text-xs font-mono text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.aboutContact.contactVisible}
                  onChange={(e) =>
                    setDraft((p) => ({
                      ...p,
                      aboutContact: { ...p.aboutContact, contactVisible: e.target.checked },
                    }))
                  }
                  className="accent-[#22C55E]"
                />
                Show on Website
              </label>
            </div>
            <div>
              <label className={LABEL_CLASS}>Contact Heading</label>
              <input
                type="text"
                value={draft.aboutContact.contactHeading}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    aboutContact: { ...p.aboutContact, contactHeading: e.target.value },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Subtitle</label>
              <textarea
                rows={2}
                value={draft.aboutContact.contactSubtitle}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    aboutContact: { ...p.aboutContact, contactSubtitle: e.target.value },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Contact Email</label>
              <input
                type="email"
                value={draft.aboutContact.contactEmail}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    aboutContact: { ...p.aboutContact, contactEmail: e.target.value },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>WhatsApp Support URL</label>
              <input
                type="url"
                value={draft.aboutContact.whatsappSupportUrl}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    aboutContact: { ...p.aboutContact, whatsappSupportUrl: e.target.value },
                  }))
                }
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </div>
      )}

      {/* SECTION J: SEO SETTINGS */}
      {sectionTab === 'seo' && (
        <div className="nx-glass rounded-2xl p-6 space-y-5">
          <h3 className="font-display text-lg font-bold text-white uppercase border-b border-white/10 pb-3">
            SEO &amp; Open Graph Metadata
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={LABEL_CLASS}>Site Title Tag</label>
              <input
                type="text"
                value={draft.seo.siteTitle}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, seo: { ...p.seo, siteTitle: e.target.value } }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>Canonical URL</label>
              <input
                type="url"
                value={draft.seo.canonicalUrl}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, seo: { ...p.seo, canonicalUrl: e.target.value } }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div className="md:col-span-2">
              <label className={LABEL_CLASS}>Meta Description</label>
              <textarea
                rows={2}
                value={draft.seo.siteDescription}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, seo: { ...p.seo, siteDescription: e.target.value } }))
                }
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS}>OG / Social Share Image</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={draft.seo.ogImageUrl}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, seo: { ...p.seo, ogImageUrl: e.target.value } }))
                  }
                  className={INPUT_CLASS}
                />
                <button
                  type="button"
                  onClick={() =>
                    setPickerTarget({
                      folder: 'seo',
                      onApply: (url) =>
                        setDraft((p) => ({ ...p, seo: { ...p.seo, ogImageUrl: url } })),
                    })
                  }
                  className="shrink-0 rounded-xl border border-[#22C55E]/40 bg-[#22C55E]/15 px-3 text-xs font-mono text-[#16FF6E] cursor-pointer"
                >
                  R2 / Pick
                </button>
              </div>
            </div>
            <div>
              <label className={LABEL_CLASS}>Twitter Card Format</label>
              <select
                value={draft.seo.twitterCard}
                onChange={(e) =>
                  setDraft((p) => ({
                    ...p,
                    seo: {
                      ...p.seo,
                      twitterCard: e.target.value === 'summary' ? 'summary' : 'summary_large_image',
                    },
                  }))
                }
                className={INPUT_CLASS}
              >
                <option value="summary_large_image">Large Visual Card (summary_large_image)</option>
                <option value="summary">Compact Summary Card</option>
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#05090C] p-4 space-y-1">
            <div className="font-mono text-[10px] uppercase text-slate-400">Search Engine Snippet Preview</div>
            <div className="text-base font-semibold text-emerald-400">{draft.seo.siteTitle}</div>
            <div className="text-xs text-slate-400">{draft.seo.canonicalUrl}</div>
            <div className="text-xs text-slate-300">{draft.seo.siteDescription}</div>
          </div>
        </div>
      )}

      {/* MEDIA LIBRARY TAB (R2 ASSETS) */}
      {sectionTab === 'media' && (
        <div className="nx-glass rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
            <div>
              <h3 className="font-display text-lg font-bold text-white uppercase">
                Cloudflare R2 Image Storage ({mediaAssets.length})
              </h3>
              <p className="text-xs text-slate-400">
                Upload tournament banners, hero backgrounds, and team/news covers into Cloudflare R2. Referenced assets are delete-protected.
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                setPickerTarget({
                  folder: 'uploads',
                  onApply: () => void loadWorkspace(),
                })
              }
              className="rounded-xl nx-btn-neon px-4 py-2 text-xs font-mono font-bold uppercase cursor-pointer"
            >
              Upload / Manage R2 Images
            </button>
          </div>

          {mediaAssets.length === 0 ? (
            <p className="text-xs text-slate-400">No Cloudflare R2 images uploaded yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {mediaAssets.map((a) => (
                <div
                  key={a.id}
                  className="rounded-2xl border border-white/10 bg-[#05090C] overflow-hidden"
                >
                  <img
                    src={resolveMediaAssetUrl(a.publicUrl)}
                    alt={a.originalName}
                    className="h-36 w-full object-cover"
                  />
                  <div className="p-3 space-y-1.5 text-xs">
                    <div className="font-semibold text-white truncate">{a.originalName}</div>
                    <div className="font-mono text-[10px] text-slate-400 truncate">{a.publicUrl}</div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="font-mono text-[10px] text-[#22C55E]">
                        Refs: {a.referenceCount ?? 0}
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          setError(null);
                          try {
                            await deleteAdminMediaAsset(apiUrl, a.id, false);
                            await loadWorkspace();
                            setNotice(`Deleted "${a.originalName}".`);
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Delete blocked.');
                          }
                        }}
                        className="text-red-300 hover:text-red-200 font-mono text-[10px] uppercase cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* REVISIONS & ROLLBACK HISTORY TAB */}
      {sectionTab === 'revisions' && (
        <div className="nx-glass rounded-2xl p-6 space-y-4">
          <div className="border-b border-white/10 pb-3">
            <h3 className="font-display text-lg font-bold text-white uppercase">
              Publication Revision History &amp; Rollback
            </h3>
            <p className="text-xs text-slate-400">
              Every live publication creates an immutable snapshot in Cloudflare D1. Roll back anytime with instant KV edge cache refresh.
            </p>
          </div>
          <div className="space-y-2.5">
            {revisions.map((rev) => (
              <div
                key={rev.id}
                className="rounded-xl border border-white/10 bg-[#05090C] p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-[#22C55E]/15 border border-[#22C55E]/40 px-2 py-0.5 font-mono text-[10px] font-bold text-[#16FF6E]">
                      v{rev.versionNumber}
                    </span>
                    <span className="font-mono text-[10px] uppercase text-slate-400">
                      {rev.status} • {rev.createdBy}
                    </span>
                  </div>
                  <div className="text-sm text-white">{rev.summary}</div>
                  <div className="font-mono text-[10px] text-slate-500">{rev.createdAt}</div>
                </div>

                <button
                  type="button"
                  onClick={() => setRollbackConfirmRev(rev)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/40 bg-amber-500/10 hover:bg-amber-500/20 px-3.5 py-2 text-xs font-mono font-bold uppercase text-amber-300 cursor-pointer"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Rollback Live Website
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Draft Preview Modal (Draft Isolation Verified) */}
      {previewSnapshot && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cms-preview-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          onClick={() => setPreviewSnapshot(null)}
        >
          <div
            className="w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-3xl border border-[#22C55E]/45 bg-[#06090B] p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <span className="rounded bg-cyan-500/15 border border-cyan-400/40 px-2 py-0.5 font-mono text-[10px] uppercase text-cyan-300">
                  Admin Draft Preview — Not Visible Publicly Yet
                </span>
                <h3 id="cms-preview-title" className="font-display text-xl font-bold text-white uppercase mt-1">
                  {previewSnapshot.seo.siteTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewSnapshot(null)}
                className="rounded-xl border border-white/15 p-2 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {previewSnapshot.hero.slides[0] && (
              <div className="relative rounded-2xl overflow-hidden border border-[#22C55E]/35 min-h-[240px] p-6 flex flex-col justify-end">
                <img
                  src={resolveMediaAssetUrl(previewSnapshot.hero.slides[0].desktopImage)}
                  alt="Hero preview"
                  className="absolute inset-0 h-full w-full object-cover opacity-55"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
                <div className="relative space-y-2">
                  <span className="font-mono text-[10px] uppercase text-[#16FF6E]">
                    {previewSnapshot.hero.slides[0].badge}
                  </span>
                  <div className="font-display text-3xl font-extrabold text-white uppercase">
                    {previewSnapshot.hero.slides[0].heading}
                  </div>
                  <div className="text-sm text-emerald-300 font-semibold">
                    {previewSnapshot.hero.slides[0].subtitle}
                  </div>
                  <p className="text-xs text-slate-300 max-w-xl">
                    {previewSnapshot.hero.slides[0].description}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-1">
                <div className="font-mono uppercase text-[#22C55E]">Navigation Links</div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {previewSnapshot.navigation
                    .filter((n) => n.visible)
                    .map((n) => (
                      <span
                        key={n.id}
                        className="rounded-md bg-white/10 px-2.5 py-1 font-mono text-white"
                      >
                        {n.label} ({n.href})
                      </span>
                    ))}
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/40 p-4 space-y-1">
                <div className="font-mono uppercase text-[#22C55E]">Social Channels</div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {previewSnapshot.socialLinks
                    .filter((s) => s.visible)
                    .map((s) => (
                      <span
                        key={s.id}
                        className="rounded-md bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 font-mono text-emerald-200"
                      >
                        {s.label}
                      </span>
                    ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/40 p-4 text-xs text-slate-300 flex flex-wrap justify-between gap-2">
              <span>{previewSnapshot.footer.copyrightText}</span>
              <span className="text-slate-400">{previewSnapshot.footer.disclaimerText}</span>
            </div>
          </div>
        </div>
      )}

      {/* R2 Upload & Visual Asset Picker */}
      <R2MediaPickerModal
        open={Boolean(pickerTarget)}
        apiUrl={apiUrl}
        assets={mediaAssets}
        defaultFolder={pickerTarget?.folder}
        onClose={() => setPickerTarget(null)}
        onSelect={(url) => {
          pickerTarget?.onApply(url);
          setPickerTarget(null);
        }}
        onAssetsChanged={loadWorkspace}
      />

      {/* Confirm Rollback Modal */}
      <ConfirmModal
        open={Boolean(rollbackConfirmRev)}
        busy={busyAction === 'rollback'}
        variant="danger"
        title={`Rollback to CMS v${rollbackConfirmRev?.versionNumber ?? ''}?`}
        description="Restoring this revision updates both your working draft and the live public website immediately."
        confirmLabel="Confirm Rollback"
        onCancel={() => setRollbackConfirmRev(null)}
        onConfirm={() => void handleConfirmRollback()}
      />
    </div>
  );
};
