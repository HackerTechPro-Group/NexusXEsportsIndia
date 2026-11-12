import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  ExternalLink,
  MapPin,
  ShieldCheck,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  fetchPlatformBootstrap,
  fetchPlatformResults,
  getPlatformApiBaseUrl,
  type PlatformBootstrapResponse,
} from '../api/platformClient';
import { useSiteData } from '../context/SiteDataContext';
import { PageMeta } from '../components/common/PageMeta';
import { DataErrorCard } from '../components/common/DataErrorCard';
import { TournamentCard } from '../components/tournament/TournamentCard';
import { RegistrationButton } from '../components/common/RegistrationButton';
import { SocialLinks } from '../components/common/SocialLinks';
import { ShareMenu } from '../components/common/ShareMenu';
import { RegistrationStatusBadge, TacticalBadge } from '../components/common/StatusBadge';
import { getRegistrationButtonState } from '../utils/registration';
import { formatDisplayDate } from '../utils/dateFormat';
import { validateHttpsUrl, validateImageAssetUrl } from '../utils/validation';
import { DEFAULT_CMS_SNAPSHOT, resolveMediaAssetUrl } from '../types/cms';
import type { TournamentFormat, TournamentRecord, TournamentResultEntry } from '../types/data';

type TournamentFilter = 'all' | 'solo' | 'duo' | 'squad' | 'open' | 'upcoming' | 'completed';
type ResultDivisionFilter = 'All' | TournamentFormat;
type D1ResultRow = Awaited<ReturnType<typeof fetchPlatformResults>>['results'][number];

interface RenderedHeroSlide {
  id: string;
  badge: string;
  heading: string;
  subtitle: string;
  description: string;
  desktopImage: string;
  mobileImage: string;
  primaryCtaText: string;
  primaryCtaHref: string;
  secondaryCtaText: string;
  secondaryCtaHref: string;
  textAlign: 'left' | 'center';
}

const DIVISION_QUICK_CARDS: Array<{
  filter: TournamentFilter;
  division: string;
  subtitle: string;
  description: string;
  image: string;
  badge: string;
}> = [
  {
    filter: 'solo',
    division: 'Solo Brackets',
    subtitle: '100 Players • Pure Gunskill',
    description: '1v99 positioning, drop duels, and individual late-circle clutches.',
    image: './images/solo-banner.jpg',
    badge: 'SOLO',
  },
  {
    filter: 'duo',
    division: 'Duo Brackets',
    subtitle: '2-Player Synergy • Tactical Split',
    description: 'Tight twin trades, utility coordination, and intense duo finishes.',
    image: './images/duo-banner.jpg',
    badge: 'DUO',
  },
  {
    filter: 'squad',
    division: 'Squad Brackets',
    subtitle: '4+1 Roster • Main Circuit',
    description: 'IGL macro calls, vehicle splits, and premier multi-lobby BGMI action.',
    image: './images/squad-banner.jpg',
    badge: 'SQUAD',
  },
];

const ARENA_VISUAL_SHOWCASE = [
  {
    eyebrow: '8x8 KM Classic Drops',
    title: 'Erangel Tactical Lobbies',
    caption: 'Structured qualifier flight paths, zone rotations, and evening custom rooms.',
    image: './images/map-erangel.jpg',
  },
  {
    eyebrow: 'Final Circle Intensity',
    title: 'Clutch Podium Finishes',
    caption: 'WWCD placement scoring paired with every verified elimination point.',
    image: './images/gallery-clutch.jpg',
  },
  {
    eyebrow: 'Official Finals',
    title: 'Championship Stage',
    caption: 'Transparent prize distribution and audited scoreboards updated via Admin.',
    image: './images/news-season.jpg',
  },
];

function matchesTournamentFilter(t: TournamentRecord, filter: TournamentFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'solo':
      return t.format === 'Solo';
    case 'duo':
      return t.format === 'Duo';
    case 'squad':
      return t.format === 'Squad';
    case 'open':
      return getRegistrationButtonState(t).isEnabled;
    case 'upcoming':
      return t.status === 'upcoming' || t.status === 'registration_open';
    case 'completed':
      return t.status === 'completed';
  }
}

const TOURNAMENT_FILTER_DEFS: { id: TournamentFilter; label: string }[] = [
  { id: 'all', label: 'All Tournaments' },
  { id: 'solo', label: 'Solo' },
  { id: 'duo', label: 'Duo' },
  { id: 'squad', label: 'Squad' },
  { id: 'open', label: 'Registration Open' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Completed' },
];

export const HomePage: React.FC = () => {
  const { bundle, publishedTournaments, datasetErrors, reloadData } = useSiteData();
  const { siteConfig, news } = bundle;

  const [bootstrap, setBootstrap] = useState<PlatformBootstrapResponse | null>(null);
  const [liveResults, setLiveResults] = useState<D1ResultRow[]>([]);
  const [slideIndex, setSlideIndex] = useState(0);
  const [sliderPaused, setSliderPaused] = useState(false);

  const [tournamentFilter, setTournamentFilter] = useState<TournamentFilter>('all');
  const [resultFilter, setResultFilter] = useState<ResultDivisionFilter>('All');
  const [selectedTournament, setSelectedTournament] = useState<TournamentRecord | null>(null);

  useEffect(() => {
    const base = getPlatformApiBaseUrl();
    if (!base) return;
    let active = true;

    void fetchPlatformBootstrap().then((res) => {
      if (active && res) setBootstrap(res);
    });
    void fetchPlatformResults()
      .then((res) => {
        if (active && Array.isArray(res.results)) {
          setLiveResults(res.results);
        }
      })
      .catch(() => {
        // Static / Worker KV results remain fallback cleanly
      });

    return () => {
      active = false;
    };
  }, []);

  const cms = bundle.cms ?? DEFAULT_CMS_SNAPSHOT;

  // Build Hero Carousel slides directly from CMS (or fallback cleanly)
  const heroSlides: RenderedHeroSlide[] = useMemo(() => {
    const rawSlides = cms.hero.slides.length > 0 ? cms.hero.slides : DEFAULT_CMS_SNAPSHOT.hero.slides;
    return rawSlides.map((s) => ({
      id: s.id,
      badge: s.badge || 'BGMI OFFICIAL',
      heading: s.heading || siteConfig.brandName || 'NEXUSX ESPORTS INDIA',
      subtitle: s.subtitle || siteConfig.tagline || 'BGMI Tournament Platform',
      description: s.description || siteConfig.heroDescription || '',
      desktopImage: resolveMediaAssetUrl(s.desktopImage) || './images/hero-arena.jpg',
      mobileImage: resolveMediaAssetUrl(s.mobileImage || s.desktopImage) || './images/hero-arena.jpg',
      primaryCtaText: s.primaryCtaText || 'View Tournaments',
      primaryCtaHref: s.primaryCtaHref || '#tournaments',
      secondaryCtaText: s.secondaryCtaText || 'Latest Results',
      secondaryCtaHref: s.secondaryCtaHref || '#results',
      textAlign: s.textAlign === 'center' ? 'center' : 'left',
    }));
  }, [cms.hero.slides, siteConfig.brandName, siteConfig.heroDescription, siteConfig.tagline]);

  useEffect(() => {
    setSlideIndex((prev) => (prev >= heroSlides.length ? 0 : prev));
  }, [heroSlides.length]);

  useEffect(() => {
    if (sliderPaused || heroSlides.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % heroSlides.length);
    }, 5500);
    return () => window.clearInterval(timer);
  }, [sliderPaused, heroSlides.length]);

  useEffect(() => {
    if (!selectedTournament) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedTournament(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedTournament]);

  const activeSlide = heroSlides[slideIndex] ?? heroSlides[0];

  const handleCtaHref = (href: string) => {
    const clean = (href || '').trim();
    if (!clean) return;
    if (clean.startsWith('#')) {
      document.getElementById(clean.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    if (clean.startsWith('https://')) {
      window.open(clean, '_blank', 'noopener,noreferrer');
    }
  };

  const featuredTournamentsList = useMemo(() => {
    const configuredIds = cms.featured.tournamentIds.length > 0
      ? cms.featured.tournamentIds
      : bundle.featuredTournamentIds ?? [];
    const byId = new Map(publishedTournaments.map((t) => [t.id, t]));
    const baseList =
      configuredIds.length > 0
        ? configuredIds.map((id) => byId.get(id)).filter((t): t is TournamentRecord => Boolean(t))
        : publishedTournaments.filter((t) => t.featured);
    const overrides = cms.featured.bannerOverrides ?? {};
    return baseList.map((t) =>
      overrides[t.id]
        ? { ...t, banner: resolveMediaAssetUrl(overrides[t.id]) }
        : { ...t, banner: resolveMediaAssetUrl(t.banner) || t.banner }
    );
  }, [cms.featured.tournamentIds, cms.featured.bannerOverrides, bundle.featuredTournamentIds, publishedTournaments]);

  // Tournament filters & slot lookup
  const d1TournSlotMap = useMemo(
    () =>
      new Map(
        (bootstrap?.tournaments ?? []).map((t) => [
          t.id,
          { registeredSlots: t.registeredSlots, maxSlots: t.maxSlots },
        ])
      ),
    [bootstrap?.tournaments]
  );

  const visibleTournamentFilters = useMemo(
    () =>
      TOURNAMENT_FILTER_DEFS.filter(
        (f) => f.id === 'all' || publishedTournaments.some((t) => matchesTournamentFilter(t, f.id))
      ),
    [publishedTournaments]
  );

  const effectiveTournamentFilter = visibleTournamentFilters.some((f) => f.id === tournamentFilter)
    ? tournamentFilter
    : 'all';

  const filteredTournaments = useMemo(
    () => publishedTournaments.filter((t) => matchesTournamentFilter(t, effectiveTournamentFilter)),
    [publishedTournaments, effectiveTournamentFilter]
  );

  // Merge D1 verified results with published static/KV results cleanly
  const groupedLiveResults: TournamentResultEntry[] = useMemo(() => {
    if (liveResults.length === 0) return [];
    const byMatch = new Map<string, D1ResultRow[]>();
    for (const r of liveResults) {
      const key = `${r.tournament_id}::${r.match_id}`;
      const list = byMatch.get(key) || [];
      list.push(r);
      byMatch.set(key, list);
    }
    const output: TournamentResultEntry[] = [];
    for (const [key, rows] of byMatch.entries()) {
      const sorted = [...rows].sort(
        (a, b) => b.total_points - a.total_points || a.placement - b.placement
      );
      const top = sorted[0];
      const div: TournamentFormat =
        top.division === 'Solo' || top.division === 'Duo' || top.division === 'Squad'
          ? top.division
          : 'Squad';
      output.push({
        id: `d1-${key}`,
        tournamentId: top.tournament_id,
        tournamentName: `${top.tournament_title} — ${top.match_title}`,
        division: div,
        date: top.created_at ? top.created_at.slice(0, 10) : '',
        winner: top.participant_name || 'Confirmed Winner',
        prizeDistribution: top.prize_pool || '',
        finalRankings: sorted.map((row, idx) => ({
          rank: idx + 1,
          teamOrPlayer: row.participant_name || 'Participant',
          totalPoints: row.total_points,
          prize: row.placement === 1 ? 'WWCD' : `${row.kills} Kills`,
        })),
        summary: `Official verified scoring: ${sorted.length} roster(s) scored from verified match sheet.`,
        published: true,
      });
    }
    return output;
  }, [liveResults]);

  const publishedStaticResults = useMemo(
    () => bundle.results.entries.filter((res) => res.published !== false),
    [bundle.results.entries]
  );

  const allPublishedResults =
    groupedLiveResults.length > 0 ? groupedLiveResults : publishedStaticResults;

  const filteredResults = useMemo(
    () =>
      allPublishedResults.filter((res) =>
        resultFilter === 'All' ? true : res.division === resultFilter
      ),
    [allPublishedResults, resultFilter]
  );

  const latestNews = useMemo(
    () =>
      [...news.entries]
        .filter((item) => item.published !== false && !item.archived)
        .sort((a, b) => {
          if (Number(b.pinned) !== Number(a.pinned)) {
            return Number(b.pinned) - Number(a.pinned);
          }
          return b.publishedDate.localeCompare(a.publishedDate);
        })
        .slice(0, 4),
    [news.entries]
  );

  const ongoingCount = bootstrap?.databaseConnected
    ? bootstrap.metrics.ongoingTournaments
    : publishedTournaments.filter(
        (t) => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'archived'
      ).length;
  const completedMatchesCount = bootstrap?.databaseConnected
    ? bootstrap.metrics.completedMatches
    : allPublishedResults.length;

  const isCenterAlign = activeSlide.textAlign === 'center';

  const sectionEntries: Array<{ key: string; order: number; visible: boolean; node: React.ReactNode }> = [
    {
      key: 'hero',
      order: cms.hero.displayOrder,
      visible: cms.hero.visible,
      node: (
        <section
          className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-6 pb-8"
          onMouseEnter={() => setSliderPaused(true)}
          onMouseLeave={() => setSliderPaused(false)}
        >
          <div className="relative rounded-3xl overflow-hidden border border-[#22C55E]/40 bg-[#050A08] shadow-[0_0_65px_-18px_rgba(34,197,94,0.4)] min-h-[390px] sm:min-h-[430px] flex flex-col justify-between">
            {/* Active Slide Backdrop (Desktop & Mobile responsive source via CMS) */}
            <picture>
              <source media="(max-width: 639px)" srcSet={activeSlide.mobileImage} />
              <img
                key={activeSlide.id}
                src={activeSlide.desktopImage}
                alt={activeSlide.heading}
                className="absolute inset-0 h-full w-full object-cover object-center opacity-55 transition-opacity duration-700"
              />
            </picture>
            <div
              className="absolute inset-0 bg-gradient-to-r from-[#040907]/95 via-[#06150D]/75 to-emerald-950/30"
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 bg-[radial-gradient(circle_at_70%_38%,rgba(22,255,110,0.22),transparent_52%)]"
              aria-hidden="true"
            />
            <div
              className="absolute inset-0 bg-gradient-to-t from-[#040907]/95 via-transparent to-[#040907]/45"
              aria-hidden="true"
            />

            {/* Top Badge + Prev/Next Controls */}
            <div className="relative z-10 flex items-start justify-between gap-4 px-6 pt-6 sm:px-10 sm:pt-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-[#22C55E]/45 bg-[#0A1711]/90 px-3.5 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-[#16FF6E]">
                <span
                  className="h-2 w-2 rounded-full bg-[#16FF6E] shadow-[0_0_10px_#16FF6E]"
                  aria-hidden="true"
                />
                {activeSlide.badge}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Previous slide"
                  onClick={() =>
                    setSlideIndex((prev) => (prev - 1 + heroSlides.length) % heroSlides.length)
                  }
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-[#050A08]/80 hover:border-[#22C55E] text-white transition-colors cursor-pointer"
                >
                  <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Next slide"
                  onClick={() => setSlideIndex((prev) => (prev + 1) % heroSlides.length)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/20 bg-[#050A08]/80 hover:border-[#22C55E] text-white transition-colors cursor-pointer"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            {/* Slide Body */}
            <div className="relative z-10 px-6 py-6 sm:px-10 lg:px-12 flex flex-col justify-end">
              <div className={`space-y-4 ${isCenterAlign ? 'mx-auto text-center max-w-3xl' : 'max-w-2xl text-left'}`}>
                <div className="space-y-1">
                  <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold italic uppercase tracking-tight text-white leading-none">
                    {activeSlide.heading}
                  </h1>
                  {activeSlide.subtitle && (
                    <p className="font-display text-xl sm:text-2xl lg:text-3xl font-bold uppercase tracking-wide text-[#16FF6E] pt-1">
                      {activeSlide.subtitle}
                    </p>
                  )}
                </div>

                {activeSlide.description && (
                  <p className={`text-sm sm:text-base text-slate-200/90 leading-relaxed max-w-xl ${isCenterAlign ? 'mx-auto' : ''}`}>
                    {activeSlide.description}
                  </p>
                )}

                <div className={`pt-1 flex flex-wrap items-center gap-3.5 ${isCenterAlign ? 'justify-center' : ''}`}>
                  <button
                    type="button"
                    onClick={() => handleCtaHref(activeSlide.primaryCtaHref)}
                    className="inline-flex items-center gap-2 rounded-xl px-6 py-3 nx-btn-neon font-display font-bold text-sm uppercase tracking-wider cursor-pointer"
                  >
                    <Trophy className="h-4 w-4" aria-hidden="true" />
                    {activeSlide.primaryCtaText}
                  </button>

                  {activeSlide.secondaryCtaText && (
                    <button
                      type="button"
                      onClick={() => handleCtaHref(activeSlide.secondaryCtaHref)}
                      className="inline-flex items-center gap-2 rounded-xl px-5 py-3 border border-[#22C55E]/40 hover:border-[#16FF6E] bg-[#07110C]/85 hover:bg-[#0D1E16] text-white font-display font-semibold text-sm uppercase tracking-wider transition-colors cursor-pointer"
                    >
                      <Award className="h-4 w-4 text-[#22C55E]" aria-hidden="true" />
                      {activeSlide.secondaryCtaText}
                    </button>
                  )}
                </div>
              </div>

              {/* Slide Indicator Dots */}
              <div className="mt-6 flex items-center justify-between gap-4">
                <div className="flex items-center gap-2" role="tablist" aria-label="Hero showcase slides">
                  {heroSlides.map((slide, idx) => (
                    <button
                      key={slide.id}
                      type="button"
                      role="tab"
                      aria-selected={idx === slideIndex}
                      aria-label={`Slide ${idx + 1}: ${slide.heading}`}
                      onClick={() => setSlideIndex(idx)}
                      className={`h-2 rounded-full transition-all cursor-pointer ${
                        idx === slideIndex
                          ? 'w-8 bg-[#16FF6E] shadow-[0_0_12px_rgba(22,255,110,0.65)]'
                          : 'w-2.5 bg-white/30 hover:bg-white/60'
                      }`}
                    />
                  ))}
                </div>
                <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-[0.2em] text-emerald-300/80">
                  {String(slideIndex + 1).padStart(2, '0')} / {String(heroSlides.length).padStart(2, '0')} • BGMI CIRCUIT
                </span>
              </div>
            </div>
          </div>

          {/* LIVE STATS BAR */}
          <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl nx-glass nx-glass-hover p-4 sm:p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-[#16FF6E] shrink-0">
                <Trophy className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <div className="font-display text-2xl sm:text-3xl font-bold text-white leading-none">
                  {ongoingCount}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Active Tournaments
                </div>
              </div>
            </div>

            <div className="rounded-2xl nx-glass nx-glass-hover p-4 sm:p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center text-cyan-400 shrink-0">
                <Crosshair className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <div className="font-display text-2xl sm:text-3xl font-bold text-white leading-none">
                  {publishedTournaments.length}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Total Events
                </div>
              </div>
            </div>

            <div className="rounded-2xl nx-glass nx-glass-hover p-4 sm:p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-400 shrink-0">
                <Award className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <div className="font-display text-2xl sm:text-3xl font-bold text-white leading-none">
                  {allPublishedResults.length}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Published Results
                </div>
              </div>
            </div>

            <div className="rounded-2xl nx-glass nx-glass-hover p-4 sm:p-5 flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-purple-500/15 border border-purple-500/35 flex items-center justify-center text-purple-400 shrink-0">
                <ShieldCheck className="h-6 w-6" aria-hidden="true" />
              </div>
              <div>
                <div className="font-display text-2xl sm:text-3xl font-bold text-white leading-none">
                  {completedMatchesCount}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  Verified Matches
                </div>
              </div>
            </div>
          </div>
        </section>
      ),
    },
    {
      key: 'featured',
      order: cms.featured.displayOrder,
      visible: cms.featured.visible && featuredTournamentsList.length > 0,
      node: (
        <section id="featured" className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10 border-t border-white/10 space-y-6">
          <div className="border-l-4 border-[#16FF6E] pl-3.5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#22C55E]">
              Spotlight Selection • Managed in CMS
            </p>
            <h2 className="mt-0.5 font-display text-2xl sm:text-3xl font-bold text-white uppercase">
              {cms.featured.heading}
            </h2>
            {cms.featured.description && (
              <p className="mt-1 text-sm text-slate-400 max-w-2xl">{cms.featured.description}</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {featuredTournamentsList.map((tournament) => (
              <TournamentCard
                key={`feat-${tournament.id}`}
                tournament={tournament}
                liveSlotInfo={d1TournSlotMap.get(tournament.id)}
                onViewDetails={(t) => setSelectedTournament(t)}
              />
            ))}
          </div>
        </section>
      ),
    },
    {
      key: 'tournaments',
      order: cms.sections.tournaments.displayOrder,
      visible: cms.sections.tournaments.visible,
      node: (
        <section
          id="tournaments"
          className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-t border-b border-white/10 space-y-8"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="border-l-4 border-[#16FF6E] pl-3.5">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#22C55E]">
                {cms.sections.tournaments.subtitle || 'Live Event Brackets • Updated via Admin'}
              </p>
              <h2 className="mt-0.5 font-display text-2xl sm:text-4xl font-bold text-white uppercase">
                {cms.sections.tournaments.heading || 'BGMI Tournaments'}
              </h2>
            </div>

            {visibleTournamentFilters.length > 1 && (
              <div role="group" aria-label="Tournament filters" className="flex flex-wrap gap-2">
                {visibleTournamentFilters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTournamentFilter(f.id)}
                    className={`rounded-lg px-3.5 py-2 font-mono text-xs uppercase tracking-wider border transition-colors cursor-pointer ${
                      effectiveTournamentFilter === f.id
                        ? 'bg-[#22C55E] border-[#22C55E] text-[#050709] font-bold'
                        : 'bg-[#080B10] border-white/10 text-slate-300 hover:text-white hover:border-[#22C55E]/40'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {datasetErrors.tournaments ? (
            <DataErrorCard
              title="Unable to Load Tournaments"
              detail={datasetErrors.tournaments}
              onRetry={() => void reloadData(true)}
            />
          ) : filteredTournaments.length === 0 ? (
            <div className="rounded-2xl nx-glass p-10 text-center space-y-4">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-[#22C55E]">
                <Trophy className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="font-display text-2xl font-bold text-white uppercase">
                No Tournaments Published Yet
              </h3>
              <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
                New BGMI Solo, Duo, and Squad tournaments published from the NexusX Admin Dashboard
                appear here live. Follow our official social channels below for instant drop alerts.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTournaments.map((tournament) => (
                <TournamentCard
                  key={tournament.id}
                  tournament={{
                    ...tournament,
                    banner: resolveMediaAssetUrl(tournament.banner) || tournament.banner,
                  }}
                  liveSlotInfo={d1TournSlotMap.get(tournament.id)}
                  onViewDetails={(t) => setSelectedTournament(t)}
                />
              ))}
            </div>
          )}

          {/* Quick Division Visual Filter Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
            {DIVISION_QUICK_CARDS.map((item) => (
              <button
                key={item.division}
                type="button"
                onClick={() => {
                  setTournamentFilter(item.filter);
                  handleCtaHref('#tournaments');
                }}
                className="group relative rounded-2xl nx-glass nx-glass-hover overflow-hidden flex flex-col justify-end min-h-[210px] text-left cursor-pointer"
              >
                <img
                  src={item.image}
                  alt={item.division}
                  className="absolute inset-0 h-full w-full object-cover opacity-75 group-hover:scale-[1.06] transition-transform duration-500"
                  loading="lazy"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-[#030706] via-[#030706]/65 to-transparent"
                  aria-hidden="true"
                />
                <div className="relative p-5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-lg bg-[#22C55E]/20 border border-[#22C55E]/50 px-2.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-widest text-[#16FF6E]">
                      {item.badge}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-wider text-slate-300">
                      {item.subtitle}
                    </span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-white uppercase group-hover:text-[#16FF6E] transition-colors">
                    {item.division}
                  </h3>
                  <p className="text-xs text-slate-300 leading-relaxed">{item.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ),
    },
    {
      key: 'results',
      order: cms.sections.results.displayOrder,
      visible: cms.sections.results.visible,
      node: (
        <section
          id="results"
          className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-b border-white/10 space-y-8"
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="border-l-4 border-[#16FF6E] pl-3.5">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#22C55E]">
                {cms.sections.results.subtitle || 'Verified Podium & Points'}
              </p>
              <h2 className="mt-0.5 font-display text-2xl sm:text-4xl font-bold text-white uppercase">
                {cms.sections.results.heading || 'Tournament Results'}
              </h2>
            </div>

            {allPublishedResults.length > 0 && (
              <div role="group" aria-label="Result division filters" className="flex flex-wrap gap-2">
                {(['All', 'Solo', 'Duo', 'Squad'] as ResultDivisionFilter[]).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setResultFilter(tab)}
                    className={`rounded-lg px-4 py-2 font-mono text-xs uppercase tracking-wider border transition-colors cursor-pointer ${
                      resultFilter === tab
                        ? 'bg-[#22C55E] border-[#22C55E] text-[#050709] font-bold'
                        : 'bg-[#080B10] border-white/10 text-slate-300 hover:text-white hover:border-[#22C55E]/40'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            )}
          </div>

          {datasetErrors.results && allPublishedResults.length === 0 ? (
            <DataErrorCard
              title="Unable to Load Tournament Results"
              detail={datasetErrors.results}
              onRetry={() => void reloadData(true)}
            />
          ) : filteredResults.length === 0 ? (
            <div className="nx-glass rounded-2xl p-10 text-center space-y-3">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#22C55E]/10 border border-[#22C55E]/40 text-[#22C55E]">
                <Award className="h-6 w-6" aria-hidden="true" />
              </div>
              <h3 className="font-display text-2xl font-bold text-white uppercase">
                No Official Tournament Results Published Yet
              </h3>
              <p className="text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
                Verified BGMI winners, final rankings, and prize distributions published from the
                Admin Dashboard will appear here immediately.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredResults.map((res) => (
                <article
                  key={res.id}
                  className="w-full min-w-0 max-w-full overflow-hidden nx-glass rounded-2xl p-4 sm:p-8 space-y-6"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <TacticalBadge variant="emerald">{res.division}</TacticalBadge>
                        {res.tournamentId && (
                          <TacticalBadge variant="silver">{res.tournamentId}</TacticalBadge>
                        )}
                        {res.date && (
                          <span className="font-mono text-xs text-slate-400">
                            {formatDisplayDate(res.date)}
                          </span>
                        )}
                      </div>
                      <h3 className="font-display text-2xl sm:text-3xl font-bold text-white uppercase">
                        {res.tournamentName}
                      </h3>
                    </div>

                    <div className="rounded-xl bg-[#080B10] border border-[#22C55E]/40 px-5 py-3">
                      <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
                        <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                        Tournament Winner
                      </div>
                      <div className="font-display text-xl font-bold text-white mt-0.5">
                        {res.winner}
                      </div>
                    </div>
                  </div>

                  {res.prizeDistribution && (
                    <div className="rounded-xl bg-[#080B10] border border-white/10 p-4 text-sm">
                      <span className="font-mono text-xs uppercase tracking-wider text-slate-400 block mb-1">
                        Prize Distribution
                      </span>
                      <span className="text-slate-200">{res.prizeDistribution}</span>
                    </div>
                  )}

                  {res.finalRankings.length > 0 && (
                    <div className="w-full min-w-0 max-w-full overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full text-left text-xs sm:text-sm">
                        <thead className="bg-[#080B10] border-b border-white/10 font-mono text-[11px] sm:text-xs uppercase text-slate-400">
                          <tr>
                            <th className="py-2.5 px-3 sm:py-3 sm:px-4">Rank</th>
                            <th className="py-2.5 px-3 sm:py-3 sm:px-4">Team / Player</th>
                            <th className="py-2.5 px-3 sm:py-3 sm:px-4 text-right">Pts</th>
                            <th className="py-2.5 px-3 sm:py-3 sm:px-4 text-right">Note</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                          {res.finalRankings.map((row) => (
                            <tr key={`${res.id}-${row.rank}`}>
                              <td className="py-2.5 px-3 sm:py-3 sm:px-4 font-mono font-bold text-[#22C55E]">
                                #{String(row.rank).padStart(2, '0')}
                              </td>
                              <td className="py-2.5 px-3 sm:py-3 sm:px-4 font-medium text-white">
                                {row.teamOrPlayer}
                              </td>
                              <td className="py-2.5 px-3 sm:py-3 sm:px-4 text-right font-mono text-[#16FF6E] font-semibold">
                                {row.totalPoints}
                              </td>
                              <td className="py-2.5 px-3 sm:py-3 sm:px-4 text-right font-mono text-slate-300">
                                {row.prize || '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {res.summary && (
                    <p className="text-sm text-slate-300 leading-relaxed">{res.summary}</p>
                  )}

                  <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-4">
                    <span className="font-mono text-xs text-slate-500 uppercase">
                      Share Official Result
                    </span>
                    <ShareMenu title={res.tournamentName} text={`Official Winner: ${res.winner}`} />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      ),
    },
    {
      key: 'news',
      order: cms.sections.news.displayOrder,
      visible: cms.sections.news.visible,
      node: (
        <section id="news" className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-b border-white/10 space-y-12">
          {latestNews.length > 0 && (
            <div className="space-y-6">
              <div className="border-l-4 border-[#16FF6E] pl-3.5">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#22C55E]">
                  {cms.sections.news.subtitle || 'Platform Announcements'}
                </p>
                <h2 className="mt-0.5 font-display text-2xl sm:text-3xl font-bold text-white uppercase">
                  {cms.sections.news.heading || 'Latest Updates'}
                </h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {latestNews.map((item) => {
                  const bannerCheck = validateImageAssetUrl(item.banner, 'News banner');
                  const thumb =
                    bannerCheck.valid && bannerCheck.normalized
                      ? resolveMediaAssetUrl(bannerCheck.normalized)
                      : './images/news-season.jpg';
                  const extCheck = item.externalUrl
                    ? validateHttpsUrl(item.externalUrl, 'Announcement link')
                    : { valid: false, normalized: '' };

                  return (
                    <article
                      key={item.id}
                      className="rounded-2xl nx-glass nx-glass-hover p-4 sm:p-5 flex gap-4"
                    >
                      <img
                        src={thumb}
                        alt={item.title}
                        className="h-24 w-28 sm:w-32 rounded-xl object-cover shrink-0 border border-emerald-500/25"
                        loading="lazy"
                      />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase text-emerald-400">
                          <span>{item.category}</span>
                          <span>•</span>
                          <span className="inline-flex items-center gap-1 text-slate-400">
                            <Calendar className="h-3 w-3" aria-hidden="true" />
                            {formatDisplayDate(item.publishedDate)}
                          </span>
                        </div>
                        <h3 className="font-display text-base sm:text-lg font-bold text-white uppercase leading-snug">
                          {item.title}
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-400 line-clamp-2">
                          {item.description}
                        </p>
                        {extCheck.valid && extCheck.normalized && (
                          <a
                            href={extCheck.normalized}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase text-[#22C55E] hover:text-white pt-0.5"
                          >
                            Read Update <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <div className="mb-6 border-l-4 border-[#16FF6E] pl-3.5">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[#22C55E]">
                Maps &amp; Matchday Atmosphere
              </p>
              <h2 className="mt-0.5 font-display text-2xl sm:text-3xl font-bold text-white uppercase">
                Battleground Arena Showcase
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {ARENA_VISUAL_SHOWCASE.map((card) => (
                <div
                  key={card.title}
                  className="group rounded-2xl nx-glass nx-glass-hover overflow-hidden flex flex-col"
                >
                  <div className="relative h-52 overflow-hidden border-b border-emerald-500/20">
                    <img
                      src={card.image}
                      alt={card.title}
                      className="h-full w-full object-cover opacity-90 group-hover:scale-[1.05] transition-transform duration-500"
                      loading="lazy"
                    />
                    <div
                      className="absolute inset-0 bg-gradient-to-t from-[#050A08] via-transparent to-transparent"
                      aria-hidden="true"
                    />
                    <span className="absolute bottom-3 left-3.5 rounded-md bg-[#040807]/85 border border-[#22C55E]/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#16FF6E]">
                      {card.eyebrow}
                    </span>
                  </div>
                  <div className="p-5 space-y-1.5">
                    <h3 className="font-display text-lg font-bold text-white uppercase">{card.title}</h3>
                    <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">{card.caption}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ),
    },
    {
      key: 'about',
      order: cms.aboutContact.aboutOrder,
      visible: cms.aboutContact.aboutVisible,
      node: (
        <section id="about" className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-b border-white/10">
          <div className="rounded-3xl nx-glass p-6 sm:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#22C55E]">
                Organization Profile
              </p>
              <h2 className="font-display text-2xl sm:text-4xl font-bold text-white uppercase">
                {cms.aboutContact.aboutHeading}
              </h2>
              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                {cms.aboutContact.aboutBody}
              </p>
              {cms.aboutContact.aboutVision && (
                <div className="rounded-2xl bg-[#070E0B] border border-[#22C55E]/30 p-4 text-xs sm:text-sm text-emerald-200">
                  <strong className="font-mono uppercase text-[10px] text-[#22C55E] block mb-1">
                    Our Vision
                  </strong>
                  {cms.aboutContact.aboutVision}
                </div>
              )}
            </div>
            {cms.aboutContact.aboutImageUrl && (
              <div className="lg:col-span-5">
                <img
                  src={resolveMediaAssetUrl(cms.aboutContact.aboutImageUrl)}
                  alt={cms.aboutContact.aboutHeading}
                  className="w-full h-64 object-cover rounded-2xl border border-[#22C55E]/30"
                  loading="lazy"
                />
              </div>
            )}
          </div>
        </section>
      ),
    },
    {
      key: 'contact',
      order: cms.aboutContact.contactOrder,
      visible: cms.aboutContact.contactVisible,
      node: (
        <section id="contact" className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16 border-b border-white/10">
          <div className="rounded-3xl nx-glass p-6 sm:p-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#22C55E]">
                Organizer Support Desk
              </p>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-white uppercase">
                {cms.aboutContact.contactHeading}
              </h2>
              <p className="text-sm text-slate-300 leading-relaxed">
                {cms.aboutContact.contactSubtitle}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              {cms.aboutContact.contactEmail && (
                <a
                  href={`mailto:${cms.aboutContact.contactEmail}`}
                  className="rounded-xl border border-[#22C55E]/40 bg-[#08120D] hover:bg-[#10241A] px-5 py-3 text-xs font-mono uppercase text-white"
                >
                  {cms.aboutContact.contactEmail}
                </a>
              )}
              {cms.aboutContact.whatsappSupportUrl && (
                <a
                  href={cms.aboutContact.whatsappSupportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl nx-btn-neon px-5 py-3 text-xs font-display font-bold uppercase tracking-wider"
                >
                  WhatsApp Organizer Desk
                </a>
              )}
            </div>
          </div>
        </section>
      ),
    },
    {
      key: 'social',
      order: cms.sections.social.displayOrder,
      visible: cms.sections.social.visible,
      node: (
        <section
          id="social"
          className="scroll-mt-20 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-16"
        >
          <div className="rounded-3xl nx-glass overflow-hidden border border-[#22C55E]/35">
            <div className="p-6 sm:p-10 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div className="space-y-1.5">
                  <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#22C55E]">
                    Connect With Us
                  </p>
                  <h2 className="font-display text-2xl sm:text-4xl font-bold text-white uppercase">
                    {cms.sections.social.heading || 'Official Social Channels'}
                  </h2>
                  <p className="text-sm text-slate-300 max-w-2xl leading-relaxed">
                    {cms.sections.social.subtitle}
                  </p>
                </div>
              </div>

              <SocialLinks
                community={siteConfig.community}
                cmsSocialLinks={cms.socialLinks}
                variant="icons"
              />
            </div>

            <div className="bg-gradient-to-r from-[#0D381C] via-[#13552B] to-[#0D381C] border-t border-[#22C55E]/35 px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-center sm:text-left">
              <div className="font-display text-lg font-extrabold uppercase tracking-wider text-white">
                {cms.footer.brandName}
              </div>
              <div className="font-mono text-xs tracking-[0.2em] text-[#16FF6E] uppercase">
                Play • Compete • Win.
              </div>
            </div>
          </div>
        </section>
      ),
    },
  ];

  const orderedSections = sectionEntries
    .filter((entry) => entry.visible)
    .sort((a, b) => a.order - b.order);

  return (
    <div id="top">
      <PageMeta
        title={cms.seo.siteTitle || `${siteConfig.brandName} | ${siteConfig.tagline}`}
        description={
          cms.seo.siteDescription ||
          'Official NexusX Esports India BGMI Tournament & Results Hub. Browse Solo, Duo, and Squad tournaments updated live by organizers.'
        }
        ogTitle={cms.seo.ogTitle}
        ogDescription={cms.seo.ogDescription}
        ogImage={cms.seo.ogImageUrl ? resolveMediaAssetUrl(cms.seo.ogImageUrl) : undefined}
        twitterCard={cms.seo.twitterCard}
        canonicalUrl={cms.seo.canonicalUrl}
      />

      {orderedSections.map((sec) => (
        <React.Fragment key={sec.key}>{sec.node}</React.Fragment>
      ))}

      {/* IN-PAGE TOURNAMENT QUICK DETAILS MODAL (Stays Single-Page!) */}
      {selectedTournament && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-tournament-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          onClick={() => setSelectedTournament(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-3xl border border-[#22C55E]/40 bg-[#070B0E] shadow-[0_0_60px_rgba(34,197,94,0.28)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Banner Header */}
            <div className="relative h-52 sm:h-60 bg-[#050809] border-b border-white/10">
              <img
                src={
                  validateImageAssetUrl(selectedTournament.banner, 'Modal banner').normalized ||
                  './images/hero-arena.jpg'
                }
                alt={selectedTournament.title}
                className="h-full w-full object-cover opacity-85"
              />
              <div
                className="absolute inset-0 bg-gradient-to-t from-[#070B0E] via-[#070B0E]/45 to-transparent"
                aria-hidden="true"
              />
              <button
                type="button"
                aria-label="Close tournament details"
                onClick={() => setSelectedTournament(null)}
                className="absolute top-4 right-4 h-10 w-10 rounded-xl bg-black/75 border border-white/20 hover:border-[#22C55E] text-white flex items-center justify-center cursor-pointer"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
              <div className="absolute bottom-4 left-6 right-6 flex flex-wrap items-center justify-between gap-2">
                <TacticalBadge variant="emerald">
                  {selectedTournament.game} • {selectedTournament.format} • {selectedTournament.mode}
                </TacticalBadge>
                <RegistrationStatusBadge
                  status={selectedTournament.registration.status}
                  lifecycleStatus={selectedTournament.status}
                  hasValidUrl={Boolean(selectedTournament.registration.formUrl?.trim())}
                />
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 sm:p-8 space-y-6">
              <div>
                <h2
                  id="modal-tournament-title"
                  className="font-display text-2xl sm:text-3xl font-bold text-white uppercase"
                >
                  {selectedTournament.title}
                </h2>
                <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                  {selectedTournament.description}
                </p>
              </div>

              {/* Key Info Tiles */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="rounded-xl bg-[#0B1114] border border-white/10 p-3">
                  <div className="font-mono text-[10px] uppercase text-slate-400">Prize Pool</div>
                  <div className="mt-1 font-display text-base font-bold text-[#16FF6E]">
                    {selectedTournament.prizes.totalPrizePool || 'TBA'}
                  </div>
                </div>
                <div className="rounded-xl bg-[#0B1114] border border-white/10 p-3">
                  <div className="font-mono text-[10px] uppercase text-slate-400">Match Date</div>
                  <div className="mt-1 font-semibold text-white">
                    {formatDisplayDate(selectedTournament.schedule.date)}
                  </div>
                </div>
                <div className="rounded-xl bg-[#0B1114] border border-white/10 p-3">
                  <div className="font-mono text-[10px] uppercase text-slate-400">Check-In / Drop</div>
                  <div className="mt-1 font-semibold text-white inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                    {selectedTournament.schedule.reportingTime} / {selectedTournament.schedule.startTime}
                  </div>
                </div>
                <div className="rounded-xl bg-[#0B1114] border border-white/10 p-3">
                  <div className="font-mono text-[10px] uppercase text-slate-400">Map / Format</div>
                  <div className="mt-1 font-semibold text-white inline-flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-[#22C55E]" aria-hidden="true" />
                    {selectedTournament.map || selectedTournament.mode}
                  </div>
                </div>
              </div>

              {/* Podium Prize Breakdown */}
              {(selectedTournament.prizes.first ||
                selectedTournament.prizes.second ||
                selectedTournament.prizes.third) && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {selectedTournament.prizes.first && (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 p-3.5">
                      <div className="font-mono text-[10px] uppercase text-amber-300">1st Place</div>
                      <div className="font-display text-lg font-bold text-white">
                        {selectedTournament.prizes.first}
                      </div>
                    </div>
                  )}
                  {selectedTournament.prizes.second && (
                    <div className="rounded-xl bg-white/[0.04] border border-white/15 p-3.5">
                      <div className="font-mono text-[10px] uppercase text-slate-300">2nd Place</div>
                      <div className="font-display text-lg font-bold text-white">
                        {selectedTournament.prizes.second}
                      </div>
                    </div>
                  )}
                  {selectedTournament.prizes.third && (
                    <div className="rounded-xl bg-orange-500/10 border border-orange-400/30 p-3.5">
                      <div className="font-mono text-[10px] uppercase text-orange-300">3rd Place</div>
                      <div className="font-display text-lg font-bold text-white">
                        {selectedTournament.prizes.third}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Rules & Instructions */}
              {selectedTournament.rules.length > 0 && (
                <div className="space-y-2.5">
                  <h3 className="font-mono text-xs uppercase tracking-wider text-[#22C55E]">
                    Official Tournament Rules
                  </h3>
                  <ul className="space-y-2 text-sm text-slate-300">
                    {selectedTournament.rules.map((rule, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <CheckCircle2
                          className="h-4 w-4 text-[#22C55E] shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedTournament.registration.instructions && (
                <div className="rounded-xl bg-[#0B1114] border border-emerald-500/25 p-4 text-xs sm:text-sm text-slate-300">
                  <strong className="font-mono uppercase text-[11px] text-[#22C55E] block mb-1">
                    Registration Instructions
                  </strong>
                  {selectedTournament.registration.instructions}
                </div>
              )}

              <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
                  <Users className="h-4 w-4 text-[#22C55E]" aria-hidden="true" />
                  {selectedTournament.teamSize}
                </div>
                <div className="sm:min-w-[230px]">
                  <RegistrationButton tournament={selectedTournament} fullWidth showHelper />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
