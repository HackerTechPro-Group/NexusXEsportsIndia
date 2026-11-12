import { mapTournamentRow, recordActivityLog, safeJsonParse, type D1PublicTournament } from './d1PublicAndPlayer.ts';
import {
  invalidateLivePublicCms,
  readLivePublicCms,
  writeLivePublicCms,
  type LocalSecurityFallback,
} from './securityStore.ts';
import { ensureD1Schema } from './schema.ts';
import type {
  CmsAboutContactConfig,
  CmsFeaturedSectionConfig,
  CmsFooterConfig,
  CmsHeroSectionConfig,
  CmsNavItem,
  CmsPublicationState,
  CmsRevisionRecord,
  CmsSectionLayoutConfig,
  CmsSeoSettings,
  CmsSnapshotPayload,
  CmsSocialLink,
  D1Database,
  MediaAssetRecord,
  RoleName,
  SiteConfigData,
  WorkerEnv,
} from './types.ts';
import { containsPrivateSheetReference, containsSecretMaterial } from './validators.ts';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

const ALLOWED_IMAGE_MIMES = new Map<string, string>([
  ['image/jpeg', 'jpg'],
  ['image/jpg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif'],
]);

const ALLOWED_NAV_TYPES = new Set(['anchor', 'route', 'external']);
const ALLOWED_SOCIAL_PLATFORMS = new Set([
  'whatsapp',
  'instagram',
  'youtube',
  'discord',
  'x',
  'telegram',
  'website',
]);
const SAFE_RELATIVE_MEDIA_RE = /^\/api\/media\/[A-Za-z0-9._/-]+\.(?:jpg|jpeg|png|webp|avif)$/i;
const SAFE_STATIC_IMAGE_RE = /^(?:\.\/|\/)images\/[A-Za-z0-9._/-]+\.(?:jpg|jpeg|png|webp|avif|svg)$/i;
const CONTROL_CHAR_RE = /[\u0000-\u001f\u007f]/;

export interface CmsActor {
  username: string;
  role: RoleName;
  ipMasked: string;
}

export function buildDefaultCmsSnapshot(): CmsSnapshotPayload {
  return {
    hero: {
      visible: true,
      displayOrder: 1,
      slides: [
        {
          id: 'slide-bgmi-series',
          badge: 'OFFICIAL BGMI ARENA',
          heading: 'COMPETE. CONNECT. CONQUER.',
          subtitle: 'NexusX Esports India • BGMI Tournament Platform',
          description: 'Play • Compete • Win across verified Solo, Duo & Squad BGMI championships.',
          desktopImage: './images/hero-arena.jpg',
          mobileImage: './images/hero-arena.jpg',
          primaryCtaText: 'View Tournaments',
          primaryCtaHref: '#tournaments',
          secondaryCtaText: 'Latest Results',
          secondaryCtaHref: '#results',
          textAlign: 'left',
        },
        {
          id: 'slide-squad-showdown',
          badge: 'VERIFIED PRIZE POOLS',
          heading: 'BGMI SQUAD CHAMPIONSHIP',
          subtitle: 'Fair Scoring • Real Competition',
          description: 'Official BGMI room fixtures, transparent WWCD scoring points, and verified standings.',
          desktopImage: './images/nexusx-trophy-arena.jpg',
          mobileImage: './images/nexusx-trophy-arena.jpg',
          primaryCtaText: 'Explore Tournaments',
          primaryCtaHref: '#tournaments',
          secondaryCtaText: 'Official Results',
          secondaryCtaHref: '#results',
          textAlign: 'left',
        },
        {
          id: 'slide-duo-tactical',
          badge: 'SOLO • DUO • SQUAD',
          heading: 'DROP ZONE READY',
          subtitle: 'Erangel • Miramar • Sanhok',
          description: 'Join structured custom lobbies for BGMI mobile players and rising teams across India.',
          desktopImage: './images/tactical-night-vista.jpg',
          mobileImage: './images/tactical-night-vista.jpg',
          primaryCtaText: 'View Open Events',
          primaryCtaHref: '#tournaments',
          secondaryCtaText: 'Join Community',
          secondaryCtaHref: '#social',
          textAlign: 'left',
        },
      ],
    },
    featured: {
      visible: true,
      displayOrder: 2,
      heading: 'Upcoming & Featured BGMI Tournaments',
      description: 'Inspect schedule, map pool, rules, and verified Google Form registration links for every active event.',
      tournamentIds: [],
      bannerOverrides: {},
    },
    sections: {
      tournaments: {
        visible: true,
        displayOrder: 3,
        heading: 'BGMI Tournaments',
        subtitle: 'Live lobbies, open registrations, and upcoming Indian BGMI custom rooms.',
      },
      results: {
        visible: true,
        displayOrder: 4,
        heading: 'Tournament Results',
        subtitle: 'Verified Podium & Points — audited by NexusX tournament officials.',
      },
      news: {
        visible: true,
        displayOrder: 5,
        heading: 'Latest Updates & Announcements',
        subtitle: 'Schedule advisories, rulebook clarifications, and season dispatches.',
      },
      social: {
        visible: true,
        displayOrder: 6,
        heading: 'Official Social Channels',
        subtitle: 'Stay connected for room IDs, passwords, scrim alerts, and highlight reels.',
      },
    },
    navigation: [
      {
        id: 'nav-tournaments',
        label: 'Tournaments',
        href: '#tournaments',
        itemType: 'anchor',
        visible: true,
        showMobile: true,
        openInNewTab: false,
        displayOrder: 1,
      },
      {
        id: 'nav-results',
        label: 'Results',
        href: '#results',
        itemType: 'anchor',
        visible: true,
        showMobile: true,
        openInNewTab: false,
        displayOrder: 2,
      },
    ],
    socialLinks: [
      {
        id: 'social-whatsapp-group',
        platform: 'whatsapp',
        label: 'WhatsApp Group',
        subtitle: 'Lobby alerts & player check-ins',
        url: 'https://chat.whatsapp.com/Bb5wB0uhUjL7M1Zvcze0bT?s=cl&p=a&iam=2',
        iconName: 'message-circle',
        visible: true,
        displayOrder: 1,
      },
      {
        id: 'social-whatsapp-channel',
        platform: 'whatsapp',
        label: 'WhatsApp Channel',
        subtitle: 'Official broadcast feed',
        url: 'https://whatsapp.com/channel/0029VbBpaitADTOINkNfLn28',
        iconName: 'radio',
        visible: true,
        displayOrder: 2,
      },
      {
        id: 'social-instagram',
        platform: 'instagram',
        label: 'Instagram',
        subtitle: 'Highlights & winner cards',
        url: 'https://www.instagram.com/nexusxesportsindia/',
        iconName: 'instagram',
        visible: true,
        displayOrder: 3,
      },
      {
        id: 'social-youtube',
        platform: 'youtube',
        label: 'YouTube',
        subtitle: 'Live finals & match VODs',
        url: 'https://www.youtube.com/@NexusXEsportsIndia',
        iconName: 'youtube',
        visible: true,
        displayOrder: 4,
      },
    ],
    footer: {
      visible: true,
      brandName: 'NEXUSX ESPORTS INDIA',
      tagline: 'BGMI Tournament Platform',
      logoUrl: './images/nexusx-logo.png',
      description:
        'Independent Indian BGMI esports tournament organizer delivering verified custom lobbies, fair rules, and competitive prize events.',
      copyrightText: '© 2026 NexusX Esports India. All rights reserved.',
      disclaimerText: 'Independent BGMI tournament platform — not affiliated with or endorsed by Krafton, Inc.',
      legalNote: 'BGMI (Battlegrounds Mobile India) Solo, Duo & Squad custom tournament competitions.',
      quickLinks: [
        { label: 'Tournaments', href: '#tournaments' },
        { label: 'Official Results', href: '#results' },
      ],
      legalLinks: [
        { label: 'Fair Play & Rules', href: '#tournaments' },
        { label: 'Official Channels', href: '#social' },
      ],
    },
    aboutContact: {
      aboutVisible: false,
      aboutOrder: 7,
      aboutHeading: 'About NexusX Esports India',
      aboutBody:
        'NexusX Esports India runs structured Battlegrounds Mobile India (BGMI) competitions with transparent point tables, verified referee scoring, and community-first lobby operations.',
      aboutVision: 'Empowering grassroots Indian BGMI squads with fair, reliable tournament competition.',
      aboutImageUrl: './images/tactical-night-vista.jpg',
      contactVisible: false,
      contactOrder: 8,
      contactHeading: 'Contact & Organizer Desk',
      contactSubtitle: 'Reach our BGMI tournament admins for slot queries, dispute reviews, or partnership inquiries.',
      contactEmail: 'contact@nexusxesports.in',
      whatsappSupportUrl: 'https://wa.me/910000000000',
    },
    seo: {
      siteTitle: 'NexusX Esports India | BGMI Tournament Platform',
      siteDescription:
        'Official NexusX Esports India portal for Battlegrounds Mobile India (BGMI) Solo, Duo & Squad tournaments, verified results, and schedules.',
      ogTitle: 'NexusX Esports India | BGMI Tournament Platform',
      ogDescription:
        'Compete in verified BGMI Solo, Duo, and Squad tournaments across India with transparent scoring and official podium standings.',
      ogImageUrl: './images/hero-arena.jpg',
      twitterCard: 'summary_large_image',
      canonicalUrl: 'https://hackertechpro-group.github.io/NexusXEsportsIndia/',
    },
  };
}

function isValidCmsImage(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return true;
  if (CONTROL_CHAR_RE.test(trimmed)) return false;
  if (trimmed.startsWith('./') || trimmed.startsWith('/')) {
    if (trimmed.includes('..') || trimmed.includes('\\')) return false;
    return SAFE_STATIC_IMAGE_RE.test(trimmed) || SAFE_RELATIVE_MEDIA_RE.test(trimmed);
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function isValidCmsLink(href: string, allowAnchor = true): boolean {
  const trimmed = href.trim();
  if (!trimmed) return false;
  if (CONTROL_CHAR_RE.test(trimmed)) return false;
  if (allowAnchor && trimmed.startsWith('#') && /^#[A-Za-z0-9_-]{1,60}$/.test(trimmed)) {
    return true;
  }
  if (trimmed.startsWith('/#') || trimmed.startsWith('./#') || trimmed.startsWith('/')) {
    return !trimmed.includes('..') && !trimmed.includes('<') && !trimmed.includes('>');
  }
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'mailto:') &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export function validateCmsSnapshot(
  raw: unknown
): { ok: true; snapshot: CmsSnapshotPayload } | { ok: false; errors: string[] } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['CMS snapshot payload must be an object.'] };
  }
  if (containsSecretMaterial(raw)) {
    return { ok: false, errors: ['Payload rejected: contains disallowed token or secret pattern.'] };
  }
  if (containsPrivateSheetReference(raw)) {
    return { ok: false, errors: ['Payload rejected: private Google Sheet URLs cannot appear in public CMS data.'] };
  }

  const defaults = buildDefaultCmsSnapshot();
  const input = raw as Partial<CmsSnapshotPayload>;
  const errors: string[] = [];

  const heroInput = input.hero ?? defaults.hero;
  const rawSlides = Array.isArray(heroInput.slides) ? heroInput.slides : defaults.hero.slides;
  if (rawSlides.length === 0 || rawSlides.length > 8) {
    errors.push('Hero section must contain between 1 and 8 slides.');
  }
  const slides = rawSlides.map((s, idx) => {
    const heading = String(s?.heading ?? '').trim();
    const subtitle = String(s?.subtitle ?? '').trim();
    const description = String(s?.description ?? '').trim();
    const desktopImage = String(s?.desktopImage ?? '').trim();
    const mobileImage = String(s?.mobileImage ?? desktopImage).trim();
    const primaryCtaText = String(s?.primaryCtaText ?? 'View Tournaments').trim();
    const primaryCtaHref = String(s?.primaryCtaHref ?? '#tournaments').trim();
    const secondaryCtaText = String(s?.secondaryCtaText ?? '').trim();
    const secondaryCtaHref = String(s?.secondaryCtaHref ?? '').trim();

    if (!heading || heading.length > 100) {
      errors.push(`Hero slide #${idx + 1} heading must be 1–100 characters.`);
    }
    if (!desktopImage || !isValidCmsImage(desktopImage)) {
      errors.push(`Hero slide #${idx + 1} desktop image must be an uploaded media asset, ./images/ asset, or https:// URL.`);
    }
    if (mobileImage && !isValidCmsImage(mobileImage)) {
      errors.push(`Hero slide #${idx + 1} mobile image is invalid.`);
    }
    if (!primaryCtaText || !isValidCmsLink(primaryCtaHref, true)) {
      errors.push(`Hero slide #${idx + 1} primary CTA link or label is invalid.`);
    }
    if (secondaryCtaText && secondaryCtaHref && !isValidCmsLink(secondaryCtaHref, true)) {
      errors.push(`Hero slide #${idx + 1} secondary CTA link is invalid.`);
    }
    return {
      id: String(s?.id ?? `slide-${idx + 1}`).trim() || `slide-${idx + 1}`,
      badge: String(s?.badge ?? '').trim().slice(0, 50),
      heading,
      subtitle: subtitle.slice(0, 120),
      description: description.slice(0, 320),
      desktopImage,
      mobileImage: mobileImage || desktopImage,
      primaryCtaText: primaryCtaText.slice(0, 48),
      primaryCtaHref,
      secondaryCtaText: secondaryCtaText.slice(0, 48),
      secondaryCtaHref,
      textAlign: (s?.textAlign === 'center' ? 'center' : 'left') as 'left' | 'center',
    };
  });

  const featuredInput = input.featured ?? defaults.featured;
  const featuredBannerOverrides: Record<string, string> = {};
  if (featuredInput.bannerOverrides && typeof featuredInput.bannerOverrides === 'object') {
    for (const [tid, url] of Object.entries(featuredInput.bannerOverrides)) {
      const cleanUrl = String(url ?? '').trim();
      if (cleanUrl) {
        if (!isValidCmsImage(cleanUrl)) {
          errors.push(`Featured banner override for tournament "${tid}" is invalid.`);
        } else {
          featuredBannerOverrides[tid] = cleanUrl;
        }
      }
    }
  }

  const navInput = Array.isArray(input.navigation) ? input.navigation : defaults.navigation;
  if (navInput.length > 12) {
    errors.push('Maximum 12 navigation items are supported.');
  }
  const navigation: CmsNavItem[] = navInput.map((item, idx) => {
    const label = String(item?.label ?? '').trim();
    const href = String(item?.href ?? '').trim();
    const itemType = ALLOWED_NAV_TYPES.has(String(item?.itemType))
      ? (item.itemType as 'anchor' | 'route' | 'external')
      : 'anchor';
    if (!label || label.length > 32) {
      errors.push(`Navigation item #${idx + 1} label must be 1–32 characters.`);
    }
    if (!isValidCmsLink(href, true)) {
      errors.push(`Navigation item "${label || idx + 1}" has an invalid link target.`);
    }
    return {
      id: String(item?.id ?? `nav-${idx + 1}`).trim() || `nav-${idx + 1}`,
      label,
      href,
      itemType,
      visible: item?.visible !== false,
      showMobile: item?.showMobile !== false,
      openInNewTab: Boolean(item?.openInNewTab),
      displayOrder: Number.isFinite(Number(item?.displayOrder)) ? Number(item.displayOrder) : idx + 1,
    };
  });

  const socialInput = Array.isArray(input.socialLinks) ? input.socialLinks : defaults.socialLinks;
  const socialLinks: CmsSocialLink[] = socialInput.map((item, idx) => {
    const label = String(item?.label ?? '').trim();
    const url = String(item?.url ?? '').trim();
    const platform = ALLOWED_SOCIAL_PLATFORMS.has(String(item?.platform))
      ? (item.platform as CmsSocialLink['platform'])
      : 'website';
    if (!label || label.length > 48) {
      errors.push(`Social link #${idx + 1} label is required.`);
    }
    if (!isValidCmsLink(url, false)) {
      errors.push(`Social link "${label || idx + 1}" must use a valid https:// or mailto: URL.`);
    }
    return {
      id: String(item?.id ?? `social-${idx + 1}`).trim() || `social-${idx + 1}`,
      platform,
      label,
      subtitle: String(item?.subtitle ?? '').trim().slice(0, 90),
      url,
      iconName: String(item?.iconName ?? platform).trim().slice(0, 32),
      visible: item?.visible !== false,
      displayOrder: Number.isFinite(Number(item?.displayOrder)) ? Number(item.displayOrder) : idx + 1,
    };
  });

  const footerInput = input.footer ?? defaults.footer;
  if (!String(footerInput.brandName ?? '').trim()) {
    errors.push('Footer brand name is required.');
  }
  if (!isValidCmsImage(String(footerInput.logoUrl ?? defaults.footer.logoUrl))) {
    errors.push('Footer logo URL must be a clean ./images/, /api/media/, or https:// image.');
  }
  const cleanFooterLinks = (links: unknown, fallbackLinks: { label: string; href: string }[]) => {
    if (!Array.isArray(links)) return fallbackLinks;
    return links
      .slice(0, 8)
      .map((l) => ({
        label: String((l as { label?: string })?.label ?? '').trim(),
        href: String((l as { href?: string })?.href ?? '').trim(),
      }))
      .filter((l) => l.label && isValidCmsLink(l.href, true));
  };

  const aboutInput = input.aboutContact ?? defaults.aboutContact;
  if (aboutInput.aboutImageUrl && !isValidCmsImage(aboutInput.aboutImageUrl)) {
    errors.push('About section image URL is invalid.');
  }
  if (aboutInput.whatsappSupportUrl && !isValidCmsLink(aboutInput.whatsappSupportUrl, false)) {
    errors.push('Contact WhatsApp support URL must be valid https://.');
  }

  const seoInput = input.seo ?? defaults.seo;
  if (!String(seoInput.siteTitle ?? '').trim() || String(seoInput.siteTitle).length > 90) {
    errors.push('SEO site title must be 1–90 characters.');
  }
  if (!String(seoInput.siteDescription ?? '').trim() || String(seoInput.siteDescription).length > 200) {
    errors.push('SEO site description must be 1–200 characters.');
  }
  if (seoInput.ogImageUrl && !isValidCmsImage(seoInput.ogImageUrl)) {
    errors.push('SEO Open Graph image URL is invalid.');
  }
  if (seoInput.canonicalUrl && !isValidCmsLink(seoInput.canonicalUrl, false)) {
    errors.push('SEO canonical URL must be valid https://.');
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const normalizedSections = {
    tournaments: {
      visible: input.sections?.tournaments?.visible ?? defaults.sections.tournaments.visible,
      displayOrder: Number(input.sections?.tournaments?.displayOrder ?? 3),
      heading: String(input.sections?.tournaments?.heading ?? defaults.sections.tournaments.heading).trim(),
      subtitle: String(input.sections?.tournaments?.subtitle ?? defaults.sections.tournaments.subtitle).trim(),
    },
    results: {
      visible: input.sections?.results?.visible ?? defaults.sections.results.visible,
      displayOrder: Number(input.sections?.results?.displayOrder ?? 4),
      heading: String(input.sections?.results?.heading ?? defaults.sections.results.heading).trim(),
      subtitle: String(input.sections?.results?.subtitle ?? defaults.sections.results.subtitle).trim(),
    },
    news: {
      visible: input.sections?.news?.visible ?? defaults.sections.news.visible,
      displayOrder: Number(input.sections?.news?.displayOrder ?? 5),
      heading: String(input.sections?.news?.heading ?? defaults.sections.news.heading).trim(),
      subtitle: String(input.sections?.news?.subtitle ?? defaults.sections.news.subtitle).trim(),
    },
    social: {
      visible: input.sections?.social?.visible ?? defaults.sections.social.visible,
      displayOrder: Number(input.sections?.social?.displayOrder ?? 6),
      heading: String(input.sections?.social?.heading ?? defaults.sections.social.heading).trim(),
      subtitle: String(input.sections?.social?.subtitle ?? defaults.sections.social.subtitle).trim(),
    },
  };

  return {
    ok: true,
    snapshot: {
      hero: {
        visible: heroInput.visible !== false,
        displayOrder: Number.isFinite(Number(heroInput.displayOrder)) ? Number(heroInput.displayOrder) : 1,
        slides,
      },
      featured: {
        visible: featuredInput.visible !== false,
        displayOrder: Number.isFinite(Number(featuredInput.displayOrder)) ? Number(featuredInput.displayOrder) : 2,
        heading: String(featuredInput.heading ?? defaults.featured.heading).trim(),
        description: String(featuredInput.description ?? defaults.featured.description).trim(),
        tournamentIds: Array.isArray(featuredInput.tournamentIds)
          ? featuredInput.tournamentIds.map((id) => String(id).trim()).filter(Boolean)
          : [],
        bannerOverrides: featuredBannerOverrides,
      },
      sections: normalizedSections,
      navigation: [...navigation].sort((a, b) => a.displayOrder - b.displayOrder),
      socialLinks: [...socialLinks].sort((a, b) => a.displayOrder - b.displayOrder),
      footer: {
        visible: footerInput.visible !== false,
        brandName: String(footerInput.brandName ?? defaults.footer.brandName).trim().slice(0, 80),
        tagline: String(footerInput.tagline ?? defaults.footer.tagline).trim().slice(0, 120),
        logoUrl: String(footerInput.logoUrl ?? defaults.footer.logoUrl).trim(),
        description: String(footerInput.description ?? '').trim().slice(0, 420),
        copyrightText: String(footerInput.copyrightText ?? defaults.footer.copyrightText).trim().slice(0, 140),
        disclaimerText: String(footerInput.disclaimerText ?? defaults.footer.disclaimerText).trim().slice(0, 220),
        legalNote: String(footerInput.legalNote ?? defaults.footer.legalNote).trim().slice(0, 220),
        quickLinks: cleanFooterLinks(footerInput.quickLinks, defaults.footer.quickLinks),
        legalLinks: cleanFooterLinks(footerInput.legalLinks, defaults.footer.legalLinks),
      },
      aboutContact: {
        aboutVisible: Boolean(aboutInput.aboutVisible),
        aboutOrder: Number.isFinite(Number(aboutInput.aboutOrder)) ? Number(aboutInput.aboutOrder) : 7,
        aboutHeading: String(aboutInput.aboutHeading ?? defaults.aboutContact.aboutHeading).trim(),
        aboutBody: String(aboutInput.aboutBody ?? '').trim().slice(0, 2000),
        aboutVision: String(aboutInput.aboutVision ?? '').trim().slice(0, 320),
        aboutImageUrl: String(aboutInput.aboutImageUrl ?? '').trim(),
        contactVisible: Boolean(aboutInput.contactVisible),
        contactOrder: Number.isFinite(Number(aboutInput.contactOrder)) ? Number(aboutInput.contactOrder) : 8,
        contactHeading: String(aboutInput.contactHeading ?? defaults.aboutContact.contactHeading).trim(),
        contactSubtitle: String(aboutInput.contactSubtitle ?? '').trim().slice(0, 320),
        contactEmail: String(aboutInput.contactEmail ?? '').trim().slice(0, 120),
        whatsappSupportUrl: String(aboutInput.whatsappSupportUrl ?? '').trim(),
      },
      seo: {
        siteTitle: String(seoInput.siteTitle ?? defaults.seo.siteTitle).trim(),
        siteDescription: String(seoInput.siteDescription ?? defaults.seo.siteDescription).trim(),
        ogTitle: String(seoInput.ogTitle ?? seoInput.siteTitle ?? defaults.seo.ogTitle).trim(),
        ogDescription: String(seoInput.ogDescription ?? seoInput.siteDescription ?? defaults.seo.ogDescription).trim(),
        ogImageUrl: String(seoInput.ogImageUrl ?? defaults.seo.ogImageUrl).trim(),
        twitterCard: seoInput.twitterCard === 'summary' ? 'summary' : 'summary_large_image',
        canonicalUrl: String(seoInput.canonicalUrl ?? defaults.seo.canonicalUrl).trim(),
      },
    },
  };
}

export async function ensureCmsInitialized(db: D1Database): Promise<void> {
  await ensureD1Schema(db);
  const pubRow = await db
    .prepare(`SELECT id FROM content_publication WHERE id = 'global' LIMIT 1`)
    .first<{ id: string }>();
  if (pubRow) {
    return;
  }

  const now = new Date().toISOString();
  const defaults = buildDefaultCmsSnapshot();

  // Preserve any already-saved site_config social links if present in DB
  const existingSettings = await db
    .prepare(`SELECT value_json FROM site_settings WHERE setting_key = 'site_config' LIMIT 1`)
    .first<{ value_json: string }>();
  if (existingSettings?.value_json) {
    const parsedCfg = safeJsonParse<Partial<SiteConfigData> | null>(existingSettings.value_json, null);
    if (parsedCfg?.brandName) {
      defaults.footer.brandName = parsedCfg.brandName;
    }
    if (parsedCfg?.tagline) {
      defaults.footer.tagline = parsedCfg.tagline;
    }
    if (parsedCfg?.community) {
      const c = parsedCfg.community;
      if (c.whatsappCommunityUrl) defaults.socialLinks[0].url = c.whatsappCommunityUrl;
      if (c.whatsappChannelUrl) defaults.socialLinks[1].url = c.whatsappChannelUrl;
      if (c.instagramUrl) defaults.socialLinks[2].url = c.instagramUrl;
      if (c.youtubeUrl) defaults.socialLinks[3].url = c.youtubeUrl;
      if (c.contactEmail) defaults.aboutContact.contactEmail = c.contactEmail;
      if (c.whatsappContactUrl) defaults.aboutContact.whatsappSupportUrl = c.whatsappContactUrl;
    }
  }

  await persistSnapshotStage(db, defaults, 'draft', 'system', now, 1);
  await persistSnapshotStage(db, defaults, 'published', 'system', now, 1);

  const etag = `cms-v1-${Date.now().toString(36)}`;
  await db
    .prepare(
      `INSERT OR IGNORE INTO content_publication
       (id, published_version, draft_version, etag, last_published_at, last_published_by, last_rollback_at, updated_at)
       VALUES ('global', 1, 1, ?, ?, 'system', NULL, ?)`
    )
    .bind(etag, now, now)
    .run();

  await db
    .prepare(
      `INSERT OR IGNORE INTO content_revisions
       (id, version_number, snapshot_json, summary, created_by, created_at, status)
       VALUES ('rev-init-1', 1, ?, 'Initial NexusX Esports India CMS baseline', 'system', ?, 'published')`
    )
    .bind(JSON.stringify(defaults), now)
    .run();
}

async function persistSnapshotStage(
  db: D1Database,
  snapshot: CmsSnapshotPayload,
  stage: 'draft' | 'published',
  actorUsername: string,
  now: string,
  versionNum: number
): Promise<void> {
  const isDraft = stage === 'draft';
  const col = isDraft ? 'draft_json' : 'published_json';
  const verCol = isDraft ? 'draft_version' : 'published_version';

  const sectionEntries: Array<{ key: string; title: string; visible: boolean; order: number; data: unknown }> = [
    { key: 'hero', title: 'Hero Showcase', visible: snapshot.hero.visible, order: snapshot.hero.displayOrder, data: snapshot.hero },
    { key: 'featured_tournaments', title: 'Featured Tournaments', visible: snapshot.featured.visible, order: snapshot.featured.displayOrder, data: snapshot.featured },
    { key: 'tournaments', title: 'Tournaments Section', visible: snapshot.sections.tournaments.visible, order: snapshot.sections.tournaments.displayOrder, data: snapshot.sections.tournaments },
    { key: 'results', title: 'Results Section', visible: snapshot.sections.results.visible, order: snapshot.sections.results.displayOrder, data: snapshot.sections.results },
    { key: 'news', title: 'Latest News Section', visible: snapshot.sections.news.visible, order: snapshot.sections.news.displayOrder, data: snapshot.sections.news },
    { key: 'social', title: 'Social Channels Section', visible: snapshot.sections.social.visible, order: snapshot.sections.social.displayOrder, data: snapshot.sections.social },
    { key: 'about_contact', title: 'About & Contact Sections', visible: snapshot.aboutContact.aboutVisible || snapshot.aboutContact.contactVisible, order: snapshot.aboutContact.aboutOrder, data: snapshot.aboutContact },
  ];

  for (const s of sectionEntries) {
    const existing = await db
      .prepare(`SELECT section_key FROM site_sections WHERE section_key = ? LIMIT 1`)
      .bind(s.key)
      .first<{ section_key: string }>();
    if (!existing) {
      await db
        .prepare(
          `INSERT INTO site_sections
           (section_key, title, visible, display_order, draft_json, published_json, draft_version, published_version, updated_at, updated_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          s.key,
          s.title,
          s.visible ? 1 : 0,
          s.order,
          JSON.stringify(s.data),
          JSON.stringify(s.data),
          versionNum,
          versionNum,
          now,
          actorUsername
        )
        .run();
    } else {
      await db
        .prepare(
          `UPDATE site_sections
           SET visible = ?, display_order = ?, ${col} = ?, ${verCol} = ?, updated_at = ?, updated_by = ?
           WHERE section_key = ?`
        )
        .bind(s.visible ? 1 : 0, s.order, JSON.stringify(s.data), versionNum, now, actorUsername, s.key)
        .run();
    }
  }

  // Persist keyed hero headline/subfields into site_content as normalized audit mirrors
  const firstSlide = snapshot.hero.slides[0];
  if (firstSlide) {
    const valCol = isDraft ? 'draft_value' : 'published_value';
    const fields: Array<[string, string, string]> = [
      ['hero.primary.heading', 'hero', firstSlide.heading],
      ['hero.primary.subtitle', 'hero', firstSlide.subtitle],
      ['hero.primary.image', 'hero', firstSlide.desktopImage],
      ['footer.brand_name', 'footer', snapshot.footer.brandName],
      ['seo.site_title', 'seo', snapshot.seo.siteTitle],
    ];
    for (const [k, sec, v] of fields) {
      const exists = await db.prepare(`SELECT content_key FROM site_content WHERE content_key = ?`).bind(k).first();
      if (!exists) {
        await db
          .prepare(
            `INSERT INTO site_content (content_key, section_key, field_type, draft_value, published_value, updated_at, updated_by)
             VALUES (?, ?, 'text', ?, ?, ?, ?)`
          )
          .bind(k, sec, v, v, now, actorUsername)
          .run();
      } else {
        await db
          .prepare(`UPDATE site_content SET ${valCol} = ?, updated_at = ?, updated_by = ? WHERE content_key = ?`)
          .bind(v, now, actorUsername, k)
          .run();
      }
    }
  }

  // Navigation items for stage
  await db.prepare(`DELETE FROM navigation_items WHERE stage = ?`).bind(stage).run();
  for (const nav of snapshot.navigation) {
    await db
      .prepare(
        `INSERT INTO navigation_items (id, label, href, item_type, visible, show_mobile, open_in_new_tab, display_order, stage, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `${stage}::${nav.id}`,
        nav.label,
        nav.href,
        nav.itemType,
        nav.visible ? 1 : 0,
        nav.showMobile ? 1 : 0,
        nav.openInNewTab ? 1 : 0,
        nav.displayOrder,
        stage,
        now
      )
      .run();
  }

  // Social links for stage
  await db.prepare(`DELETE FROM social_links WHERE stage = ?`).bind(stage).run();
  for (const soc of snapshot.socialLinks) {
    await db
      .prepare(
        `INSERT INTO social_links (id, platform, label, subtitle, url, icon_name, visible, display_order, stage, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        `${stage}::${soc.id}`,
        soc.platform,
        soc.label,
        soc.subtitle,
        soc.url,
        soc.iconName,
        soc.visible ? 1 : 0,
        soc.displayOrder,
        stage,
        now
      )
      .run();
  }

  // Footer
  const footerExists = await db.prepare(`SELECT id FROM footer_content WHERE id = 'main'`).first();
  if (!footerExists) {
    await db
      .prepare(
        `INSERT INTO footer_content (id, draft_json, published_json, draft_version, published_version, updated_at, updated_by)
         VALUES ('main', ?, ?, ?, ?, ?, ?)`
      )
      .bind(JSON.stringify(snapshot.footer), JSON.stringify(snapshot.footer), versionNum, versionNum, now, actorUsername)
      .run();
  } else {
    await db
      .prepare(`UPDATE footer_content SET ${col} = ?, ${verCol} = ?, updated_at = ?, updated_by = ? WHERE id = 'main'`)
      .bind(JSON.stringify(snapshot.footer), versionNum, now, actorUsername)
      .run();
  }

  // SEO
  const seoExists = await db.prepare(`SELECT id FROM seo_settings WHERE id = 'main'`).first();
  if (!seoExists) {
    await db
      .prepare(
        `INSERT INTO seo_settings (id, draft_json, published_json, draft_version, published_version, updated_at, updated_by)
         VALUES ('main', ?, ?, ?, ?, ?, ?)`
      )
      .bind(JSON.stringify(snapshot.seo), JSON.stringify(snapshot.seo), versionNum, versionNum, now, actorUsername)
      .run();
  } else {
    await db
      .prepare(`UPDATE seo_settings SET ${col} = ?, ${verCol} = ?, updated_at = ?, updated_by = ? WHERE id = 'main'`)
      .bind(JSON.stringify(snapshot.seo), versionNum, now, actorUsername)
      .run();
  }
}

export async function readSnapshotStage(db: D1Database, stage: 'draft' | 'published'): Promise<CmsSnapshotPayload> {
  await ensureCmsInitialized(db);
  const defaults = buildDefaultCmsSnapshot();
  const jsonCol = stage === 'draft' ? 'draft_json' : 'published_json';

  const [sectionRows, navRows, socialRows, footerRow, seoRow] = await Promise.all([
    db.prepare(`SELECT section_key, ${jsonCol} AS payload FROM site_sections`).all<{ section_key: string; payload: string }>(),
    db.prepare(`SELECT * FROM navigation_items WHERE stage = ? ORDER BY display_order ASC`).bind(stage).all<Record<string, unknown>>(),
    db.prepare(`SELECT * FROM social_links WHERE stage = ? ORDER BY display_order ASC`).bind(stage).all<Record<string, unknown>>(),
    db.prepare(`SELECT ${jsonCol} AS payload FROM footer_content WHERE id = 'main' LIMIT 1`).first<{ payload: string }>(),
    db.prepare(`SELECT ${jsonCol} AS payload FROM seo_settings WHERE id = 'main' LIMIT 1`).first<{ payload: string }>(),
  ]);

  const bySection = new Map<string, unknown>();
  for (const row of sectionRows.results) {
    bySection.set(row.section_key, safeJsonParse(row.payload, null));
  }

  const navigation: CmsNavItem[] =
    navRows.results.length > 0
      ? navRows.results.map((r) => ({
          id: String(r.id).replace(`${stage}::`, ''),
          label: String(r.label),
          href: String(r.href),
          itemType: (String(r.item_type) as CmsNavItem['itemType']) || 'anchor',
          visible: Number(r.visible) === 1,
          showMobile: Number(r.show_mobile) === 1,
          openInNewTab: Number(r.open_in_new_tab) === 1,
          displayOrder: Number(r.display_order ?? 1),
        }))
      : defaults.navigation;

  const socialLinks: CmsSocialLink[] =
    socialRows.results.length > 0
      ? socialRows.results.map((r) => ({
          id: String(r.id).replace(`${stage}::`, ''),
          platform: (String(r.platform) as CmsSocialLink['platform']) || 'website',
          label: String(r.label),
          subtitle: String(r.subtitle ?? ''),
          url: String(r.url),
          iconName: String(r.icon_name ?? 'globe'),
          visible: Number(r.visible) === 1,
          displayOrder: Number(r.display_order ?? 1),
        }))
      : defaults.socialLinks;

  const hero = (bySection.get('hero') as CmsHeroSectionConfig | null) ?? defaults.hero;
  const featured = (bySection.get('featured_tournaments') as CmsFeaturedSectionConfig | null) ?? defaults.featured;
  const aboutContact = (bySection.get('about_contact') as CmsAboutContactConfig | null) ?? defaults.aboutContact;

  return {
    hero,
    featured,
    sections: {
      tournaments: (bySection.get('tournaments') as CmsSectionLayoutConfig | null) ?? defaults.sections.tournaments,
      results: (bySection.get('results') as CmsSectionLayoutConfig | null) ?? defaults.sections.results,
      news: (bySection.get('news') as CmsSectionLayoutConfig | null) ?? defaults.sections.news,
      social: (bySection.get('social') as CmsSectionLayoutConfig | null) ?? defaults.sections.social,
    },
    navigation,
    socialLinks,
    footer: (footerRow?.payload ? safeJsonParse<CmsFooterConfig>(footerRow.payload, defaults.footer) : defaults.footer),
    aboutContact,
    seo: (seoRow?.payload ? safeJsonParse<CmsSeoSettings>(seoRow.payload, defaults.seo) : defaults.seo),
  };
}

export async function getPublicationState(db: D1Database): Promise<CmsPublicationState> {
  await ensureCmsInitialized(db);
  const row = await db
    .prepare(`SELECT * FROM content_publication WHERE id = 'global' LIMIT 1`)
    .first<Record<string, unknown>>();
  const publishedVersion = Number(row?.published_version ?? 1);
  const draftVersion = Number(row?.draft_version ?? 1);
  const draftSnap = await readSnapshotStage(db, 'draft');
  const pubSnap = await readSnapshotStage(db, 'published');
  return {
    publishedVersion,
    draftVersion,
    etag: String(row?.etag ?? `cms-v${publishedVersion}`),
    lastPublishedAt: row?.last_published_at ? String(row.last_published_at) : null,
    lastPublishedBy: row?.last_published_by ? String(row.last_published_by) : null,
    lastRollbackAt: row?.last_rollback_at ? String(row.last_rollback_at) : null,
    hasUnpublishedChanges: JSON.stringify(draftSnap) !== JSON.stringify(pubSnap),
  };
}

function inspectImageMagicBytes(bytes: Uint8Array, mimeType: string): boolean {
  if (bytes.length < 12) return false;
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (mimeType === 'image/png') {
    return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  }
  if (mimeType === 'image/webp') {
    const riff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
    const webp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return riff === 'RIFF' && webp === 'WEBP';
  }
  if (mimeType === 'image/avif') {
    const ftyp = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
    return ftyp === 'ftyp' && (brand === 'avif' || brand === 'avis' || brand === 'mif1');
  }
  return false;
}

function resolvePublicMediaUrl(env: WorkerEnv, r2Key: string): string {
  const customBase = (env.R2_PUBLIC_BASE_URL ?? '').trim().replace(/\/+$/g, '');
  if (customBase) {
    return `${customBase}/${r2Key}`;
  }
  return `/api/media/${r2Key}`;
}

export async function findMediaAssetReferences(db: D1Database, publicUrl: string, r2Key: string): Promise<string[]> {
  const refs: string[] = [];
  const candidates = Array.from(new Set([publicUrl, r2Key].filter(Boolean)));
  const matchesTarget = (text: string) => candidates.some((c) => text.includes(c));

  const [sections, footer, seo, tournaments, news] = await Promise.all([
    db.prepare(`SELECT section_key, draft_json, published_json FROM site_sections`).all<{ section_key: string; draft_json: string; published_json: string }>(),
    db.prepare(`SELECT draft_json, published_json FROM footer_content`).all<{ draft_json: string; published_json: string }>(),
    db.prepare(`SELECT draft_json, published_json FROM seo_settings`).all<{ draft_json: string; published_json: string }>(),
    db.prepare(`SELECT id, title, banner_url FROM tournaments`).all<{ id: string; title: string; banner_url: string }>(),
    db.prepare(`SELECT id, title, banner_url FROM news`).all<{ id: string; title: string; banner_url: string }>(),
  ]);

  for (const s of sections.results) {
    if (matchesTarget(s.draft_json)) refs.push(`Draft Section: ${s.section_key}`);
    if (matchesTarget(s.published_json)) refs.push(`Published Section: ${s.section_key}`);
  }
  for (const f of footer.results) {
    if (matchesTarget(f.draft_json) || matchesTarget(f.published_json)) refs.push('Footer');
  }
  for (const se of seo.results) {
    if (matchesTarget(se.draft_json) || matchesTarget(se.published_json)) refs.push('SEO Open Graph');
  }
  for (const t of tournaments.results) {
    if (matchesTarget(t.banner_url ?? '')) refs.push(`Tournament: ${t.title}`);
  }
  for (const n of news.results) {
    if (matchesTarget(n.banner_url ?? '')) refs.push(`News: ${n.title}`);
  }
  return Array.from(new Set(refs));
}

export async function listMediaAssets(db: D1Database): Promise<MediaAssetRecord[]> {
  await ensureCmsInitialized(db);
  const rows = await db
    .prepare(`SELECT * FROM media_assets ORDER BY created_at DESC LIMIT 120`)
    .all<Record<string, unknown>>();
  const out: MediaAssetRecord[] = [];
  for (const r of rows.results) {
    const publicUrl = String(r.public_url);
    const r2Key = String(r.r2_key);
    const referencedIn = await findMediaAssetReferences(db, publicUrl, r2Key);
    out.push({
      id: String(r.id),
      r2Key,
      originalName: String(r.original_name),
      mimeType: String(r.mime_type),
      sizeBytes: Number(r.size_bytes ?? 0),
      publicUrl,
      folder: String(r.folder ?? 'uploads'),
      altText: String(r.alt_text ?? ''),
      uploadedBy: String(r.uploaded_by ?? 'owner'),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
      referenceCount: referencedIn.length,
      referencedIn,
    });
  }
  return out;
}

export async function listCmsRevisions(db: D1Database): Promise<CmsRevisionRecord[]> {
  await ensureCmsInitialized(db);
  const rows = await db
    .prepare(`SELECT id, version_number, summary, created_by, created_at, status FROM content_revisions ORDER BY version_number DESC LIMIT 30`)
    .all<Record<string, unknown>>();
  return rows.results.map((r) => ({
    id: String(r.id),
    versionNumber: Number(r.version_number ?? 1),
    summary: String(r.summary ?? ''),
    createdBy: String(r.created_by ?? 'owner'),
    createdAt: String(r.created_at),
    status: r.status === 'rollback' ? 'rollback' : 'published',
  }));
}

async function resolveOrderedFeaturedTournaments(db: D1Database, featuredIds: string[], includeDrafts = false): Promise<D1PublicTournament[]> {
  const query = includeDrafts
    ? `SELECT t.*, (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = t.id AND r.status IN ('approved','pending')) AS registered_slots FROM tournaments t ORDER BY t.featured DESC, t.match_date ASC`
    : `SELECT t.*, (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = t.id AND r.status IN ('approved','pending')) AS registered_slots FROM tournaments t WHERE t.published = 1 AND t.status NOT IN ('draft', 'archived') ORDER BY t.featured DESC, t.match_date ASC`;

  const rows = await db.prepare(query).all<Record<string, unknown>>();
  const mapped = rows.results.map((r) => mapTournamentRow(r, Number(r.registered_slots ?? 0)));
  if (featuredIds.length === 0) {
    return mapped.filter((t) => t.featured);
  }
  const byId = new Map(mapped.map((t) => [t.id, t]));
  const ordered: D1PublicTournament[] = [];
  for (const id of featuredIds) {
    const match = byId.get(id);
    if (match) ordered.push(match);
  }
  return ordered;
}

export async function handlePublicCmsRequest(
  db: D1Database | undefined,
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<{
  available: boolean;
  version: number;
  etag: string;
  updatedAt: string;
  cms: CmsSnapshotPayload;
  featuredTournaments: D1PublicTournament[];
}> {
  if (!db) {
    const defaults = buildDefaultCmsSnapshot();
    return {
      available: true,
      version: 1,
      etag: 'cms-default',
      updatedAt: new Date().toISOString(),
      cms: defaults,
      featuredTournaments: [],
    };
  }

  let cached = await readLivePublicCms(env, fallback);
  if (!cached) {
    await ensureCmsInitialized(db);
    const [publishedSnap, pubState] = await Promise.all([
      readSnapshotStage(db, 'published'),
      getPublicationState(db),
    ]);
    cached = {
      version: pubState.publishedVersion,
      etag: pubState.etag,
      updatedAt: pubState.lastPublishedAt ?? new Date().toISOString(),
      snapshot: publishedSnap,
    };
    await writeLivePublicCms(cached, env, fallback);
  }

  const featuredTournaments = await resolveOrderedFeaturedTournaments(db, cached.snapshot.featured.tournamentIds, false);
  return {
    available: true,
    version: cached.version,
    etag: cached.etag,
    updatedAt: cached.updatedAt,
    cms: cached.snapshot,
    featuredTournaments,
  };
}

const KV_MEDIA_PREFIX = 'media_kv:';

function encodeBytesBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64Bytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function getMediaKv(env: WorkerEnv) {
  return env.SECURITY_KV ?? env.REVOKED_SESSIONS_KV;
}

async function putStoredMediaObject(
  env: WorkerEnv,
  r2Key: string,
  fileBytes: Uint8Array,
  mimeType: string,
  actorUsername: string,
  originalName: string
): Promise<'r2' | 'kv'> {
  if (env.MEDIA_BUCKET) {
    await env.MEDIA_BUCKET.put(r2Key, fileBytes, {
      httpMetadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
      customMetadata: {
        uploadedBy: actorUsername,
        originalName: originalName.slice(0, 120),
      },
    });
    return 'r2';
  }
  const kv = getMediaKv(env);
  if (!kv) {
    throw new Error('Neither R2 MEDIA_BUCKET nor KV storage is bound on this Worker.');
  }
  await kv.put(
    `${KV_MEDIA_PREFIX}${r2Key}`,
    JSON.stringify({
      mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
      etag: `kv-${fileBytes.byteLength}-${Date.now()}`,
      base64: encodeBytesBase64(fileBytes),
    })
  );
  return 'kv';
}

async function deleteStoredMediaObject(env: WorkerEnv, r2Key: string): Promise<void> {
  if (!r2Key) return;
  if (env.MEDIA_BUCKET) {
    await env.MEDIA_BUCKET.delete(r2Key);
  }
  const kv = getMediaKv(env);
  if (kv?.delete) {
    await kv.delete(`${KV_MEDIA_PREFIX}${r2Key}`);
  }
}

export async function uploadImageAssetToR2(params: {
  request: Request;
  db: D1Database;
  env: WorkerEnv;
  actor: CmsActor;
  replaceAssetId?: string;
}): Promise<{ ok: true; asset: MediaAssetRecord; status: number } | { ok: false; error: string; status: number }> {
  const { request, db, env, actor, replaceAssetId } = params;
  await ensureCmsInitialized(db);

  if (!env.MEDIA_BUCKET && !getMediaKv(env)) {
    return {
      ok: false,
      error: 'No media storage backend (R2 MEDIA_BUCKET or KV) is configured on this Worker.',
      status: 503,
    };
  }

  const contentTypeHeader = (request.headers.get('Content-Type') ?? '').toLowerCase();
  let fileBytes: Uint8Array;
  let mimeType = '';
  let originalName = 'upload.png';
  let folder = 'uploads';
  let altText = '';

  if (contentTypeHeader.includes('multipart/form-data')) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return { ok: false, error: 'Malformed multipart upload body.', status: 400 };
    }
    const uploaded = form.get('file');
    if (!uploaded || typeof uploaded === 'string') {
      return { ok: false, error: 'Image file field ("file") is required.', status: 400 };
    }
    mimeType = (uploaded.type || '').toLowerCase().trim();
    originalName = uploaded.name || 'image.png';
    folder = String(form.get('folder') ?? 'uploads').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'uploads';
    altText = String(form.get('altText') ?? '').trim().slice(0, 140);
    fileBytes = new Uint8Array(await uploaded.arrayBuffer());
  } else {
    return { ok: false, error: 'Upload requests must use multipart/form-data.', status: 415 };
  }

  const ext = ALLOWED_IMAGE_MIMES.get(mimeType);
  if (!ext) {
    return { ok: false, error: 'Only JPEG, PNG, WebP, and AVIF images are permitted.', status: 415 };
  }
  if (fileBytes.byteLength === 0) {
    return { ok: false, error: 'Uploaded image file cannot be empty.', status: 400 };
  }
  if (fileBytes.byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Image exceeds the 5 MB upload limit.', status: 413 };
  }
  if (!inspectImageMagicBytes(fileBytes, mimeType)) {
    return { ok: false, error: 'File contents do not match declared image MIME signature.', status: 400 };
  }

  const safeSlug = originalName
    .replace(/\.[A-Za-z0-9]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'asset';
  const now = new Date().toISOString();
  const r2Key = `cms/${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeSlug}.${ext}`;

  const storageBackend = await putStoredMediaObject(
    env,
    r2Key,
    fileBytes,
    mimeType,
    actor.username,
    originalName
  );

  const publicUrl = resolvePublicMediaUrl(env, r2Key);

  if (replaceAssetId) {
    const existing = await db
      .prepare(`SELECT * FROM media_assets WHERE id = ? LIMIT 1`)
      .bind(replaceAssetId)
      .first<Record<string, unknown>>();
    if (!existing) {
      await deleteStoredMediaObject(env, r2Key);
      return { ok: false, error: 'Target media asset was not found for replacement.', status: 404 };
    }
    const oldR2Key = String(existing.r2_key);
    await db
      .prepare(
        `UPDATE media_assets
         SET r2_key = ?, original_name = ?, mime_type = ?, size_bytes = ?, public_url = ?, alt_text = ?, uploaded_by = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(r2Key, originalName.slice(0, 120), mimeType, fileBytes.byteLength, publicUrl, altText || String(existing.alt_text ?? ''), actor.username, now, replaceAssetId)
      .run();
    if (oldR2Key && oldR2Key !== r2Key) {
      await deleteStoredMediaObject(env, oldR2Key);
    }
    await recordActivityLog(db, {
      actorUsername: actor.username,
      actorRole: actor.role,
      action: 'media_replaced',
      targetType: 'media',
      targetId: replaceAssetId,
      ipMasked: actor.ipMasked,
      summary: `Replaced ${storageBackend.toUpperCase()} image "${originalName}" (${r2Key}).`,
    });
    return {
      ok: true,
      status: 200,
      asset: {
        id: replaceAssetId,
        r2Key,
        originalName: originalName.slice(0, 120),
        mimeType,
        sizeBytes: fileBytes.byteLength,
        publicUrl,
        folder: String(existing.folder ?? folder),
        altText: altText || String(existing.alt_text ?? ''),
        uploadedBy: actor.username,
        createdAt: String(existing.created_at),
        updatedAt: now,
      },
    };
  }

  const assetId = `med-${crypto.randomUUID().slice(0, 12)}`;
  await db
    .prepare(
      `INSERT INTO media_assets (id, r2_key, original_name, mime_type, size_bytes, public_url, folder, alt_text, uploaded_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(assetId, r2Key, originalName.slice(0, 120), mimeType, fileBytes.byteLength, publicUrl, folder, altText, actor.username, now, now)
    .run();

  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'media_uploaded',
    targetType: 'media',
    targetId: assetId,
    ipMasked: actor.ipMasked,
    summary: `Uploaded R2 image "${originalName}" (${(fileBytes.byteLength / 1024).toFixed(1)} KB).`,
  });

  return {
    ok: true,
    status: 201,
    asset: {
      id: assetId,
      r2Key,
      originalName: originalName.slice(0, 120),
      mimeType,
      sizeBytes: fileBytes.byteLength,
      publicUrl,
      folder,
      altText,
      uploadedBy: actor.username,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export async function deleteMediaAssetFromR2(params: {
  db: D1Database;
  env: WorkerEnv;
  assetId: string;
  force?: boolean;
  actor: CmsActor;
}): Promise<{ ok: true } | { ok: false; error: string; status: number; referencedIn?: string[] }> {
  const { db, env, assetId, force = false, actor } = params;
  await ensureCmsInitialized(db);
  const existing = await db
    .prepare(`SELECT * FROM media_assets WHERE id = ? LIMIT 1`)
    .bind(assetId)
    .first<Record<string, unknown>>();
  if (!existing) {
    return { ok: false, error: 'Media asset not found.', status: 404 };
  }

  const publicUrl = String(existing.public_url);
  const r2Key = String(existing.r2_key);
  const referencedIn = await findMediaAssetReferences(db, publicUrl, r2Key);
  if (referencedIn.length > 0 && !force) {
    return {
      ok: false,
      error: `Cannot delete image because it is actively referenced (${referencedIn.join(', ')}). Replace or unlink it first.`,
      status: 409,
      referencedIn,
    };
  }

  await deleteStoredMediaObject(env, r2Key);
  await db.prepare(`DELETE FROM media_assets WHERE id = ?`).bind(assetId).run();
  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'media_deleted',
    targetType: 'media',
    targetId: assetId,
    ipMasked: actor.ipMasked,
    summary: `Deleted media asset "${String(existing.original_name)}".`,
  });
  return { ok: true };
}

export async function handlePublicMediaGet(r2Key: string, env: WorkerEnv, corsHeaders: Headers): Promise<Response> {
  if (!r2Key || r2Key.includes('..') || r2Key.includes('\\')) {
    return new Response(JSON.stringify({ error: 'Invalid media key.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...Object.fromEntries(corsHeaders.entries()) },
    });
  }
  if (env.MEDIA_BUCKET) {
    const object = await env.MEDIA_BUCKET.get(r2Key);
    if (object) {
      const headers = new Headers(corsHeaders);
      headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
      headers.set('Cache-Control', object.httpMetadata?.cacheControl || 'public, max-age=86400');
      headers.set('X-Content-Type-Options', 'nosniff');
      if (object.etag) headers.set('ETag', object.etag);
      return new Response(object.body, { status: 200, headers });
    }
  }

  const kv = getMediaKv(env);
  if (kv) {
    const raw = await kv.get(`${KV_MEDIA_PREFIX}${r2Key}`);
    if (raw) {
      const parsed = safeJsonParse<{
        mimeType?: string;
        cacheControl?: string;
        etag?: string;
        base64?: string;
      } | null>(raw, null);
      if (parsed?.base64) {
        const bytes = decodeBase64Bytes(parsed.base64);
        const headers = new Headers(corsHeaders);
        headers.set('Content-Type', parsed.mimeType || 'application/octet-stream');
        headers.set('Cache-Control', parsed.cacheControl || 'public, max-age=86400');
        headers.set('X-Content-Type-Options', 'nosniff');
        if (parsed.etag) headers.set('ETag', parsed.etag);
        return new Response(bytes as unknown as BodyInit, { status: 200, headers });
      }
    }
  }

  if (!env.MEDIA_BUCKET && !kv) {
    return new Response(JSON.stringify({ error: 'Media storage is not configured.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', ...Object.fromEntries(corsHeaders.entries()) },
    });
  }

  return new Response(JSON.stringify({ error: 'Media object not found.' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', ...Object.fromEntries(corsHeaders.entries()) },
  });
}

export async function saveCmsDraftStage(params: {
  db: D1Database;
  actor: CmsActor;
  payload: unknown;
  expectedDraftVersion?: number;
}): Promise<{ ok: true; draftVersion: number; publication: CmsPublicationState } | { ok: false; error: string; status: number; details?: string[] }> {
  const { db, actor, payload, expectedDraftVersion } = params;
  await ensureCmsInitialized(db);

  const currentPub = await getPublicationState(db);
  if (
    expectedDraftVersion !== undefined &&
    Number.isFinite(expectedDraftVersion) &&
    expectedDraftVersion !== currentPub.draftVersion
  ) {
    return {
      ok: false,
      error: `Draft version conflict: expected v${expectedDraftVersion}, but server is already at v${currentPub.draftVersion}. Reload latest CMS state.`,
      status: 409,
    };
  }

  const check = validateCmsSnapshot(payload);
  if (!check.ok) {
    return {
      ok: false,
      error: check.errors[0] || 'CMS draft validation failed.',
      status: 400,
      details: check.errors,
    };
  }

  const now = new Date().toISOString();
  const nextDraftVersion = currentPub.draftVersion + 1;
  await persistSnapshotStage(db, check.snapshot, 'draft', actor.username, now, nextDraftVersion);
  await db
    .prepare(`UPDATE content_publication SET draft_version = ?, updated_at = ? WHERE id = 'global'`)
    .bind(nextDraftVersion, now)
    .run();

  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'cms_draft_saved',
    targetType: 'cms',
    targetId: 'global',
    ipMasked: actor.ipMasked,
    summary: `Saved CMS draft v${nextDraftVersion} (isolated from live public website until published).`,
  });

  const publication = await getPublicationState(db);
  return { ok: true, draftVersion: nextDraftVersion, publication };
}

export async function publishCmsDraftToLive(params: {
  db: D1Database;
  env: WorkerEnv;
  fallback: LocalSecurityFallback;
  actor: CmsActor;
  summary?: string;
  onSyncLegacyCache?: (draftSnapshot: CmsSnapshotPayload) => Promise<void>;
}): Promise<{ ok: true; version: number; etag: string; publication: CmsPublicationState } | { ok: false; error: string; status: number }> {
  const { db, env, fallback, actor, summary, onSyncLegacyCache } = params;
  await ensureCmsInitialized(db);

  const draft = await readSnapshotStage(db, 'draft');
  const validated = validateCmsSnapshot(draft);
  if (!validated.ok) {
    return { ok: false, error: validated.errors[0] || 'Draft validation failed.', status: 400 };
  }

  const currentPub = await getPublicationState(db);
  const nextPublishedVersion = currentPub.publishedVersion + 1;
  const now = new Date().toISOString();
  const etag = `cms-v${nextPublishedVersion}-${crypto.randomUUID().slice(0, 8)}`;

  await persistSnapshotStage(db, validated.snapshot, 'published', actor.username, now, nextPublishedVersion);
  await db
    .prepare(
      `UPDATE content_publication
       SET published_version = ?, etag = ?, last_published_at = ?, last_published_by = ?, updated_at = ?
       WHERE id = 'global'`
    )
    .bind(nextPublishedVersion, etag, now, actor.username, now)
    .run();

  const revId = `rev-${nextPublishedVersion}-${crypto.randomUUID().slice(0, 6)}`;
  await db
    .prepare(
      `INSERT INTO content_revisions (id, version_number, snapshot_json, summary, created_by, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'published')`
    )
    .bind(
      revId,
      nextPublishedVersion,
      JSON.stringify(validated.snapshot),
      (summary ?? '').trim() || `Published CMS v${nextPublishedVersion}`,
      actor.username,
      now
    )
    .run();

  await invalidateLivePublicCms(env, fallback);
  await writeLivePublicCms(
    { version: nextPublishedVersion, etag, updatedAt: now, snapshot: validated.snapshot },
    env,
    fallback
  );

  if (onSyncLegacyCache) {
    await onSyncLegacyCache(validated.snapshot);
  }

  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'cms_published',
    targetType: 'cms',
    targetId: revId,
    ipMasked: actor.ipMasked,
    summary: `Published CMS v${nextPublishedVersion} to live website & refreshed KV cache.`,
  });

  const publication = await getPublicationState(db);
  return { ok: true, version: nextPublishedVersion, etag, publication };
}

export async function rollbackCmsToRevision(params: {
  db: D1Database;
  env: WorkerEnv;
  fallback: LocalSecurityFallback;
  actor: CmsActor;
  revisionId: string;
  onSyncLegacyCache?: (snapshot: CmsSnapshotPayload) => Promise<void>;
}): Promise<{ ok: true; version: number; etag: string; publication: CmsPublicationState; snapshot: CmsSnapshotPayload } | { ok: false; error: string; status: number }> {
  const { db, env, fallback, actor, revisionId, onSyncLegacyCache } = params;
  await ensureCmsInitialized(db);

  const revRow = await db
    .prepare(`SELECT * FROM content_revisions WHERE id = ? LIMIT 1`)
    .bind(revisionId)
    .first<{ id: string; version_number: number; snapshot_json: string }>();
  if (!revRow) {
    return { ok: false, error: 'Target CMS revision not found.', status: 404 };
  }

  const parsed = safeJsonParse<unknown>(revRow.snapshot_json, null);
  const check = validateCmsSnapshot(parsed);
  if (!check.ok) {
    return { ok: false, error: 'Stored revision failed validation check.', status: 422 };
  }

  const currentPub = await getPublicationState(db);
  const nextPublishedVersion = currentPub.publishedVersion + 1;
  const nextDraftVersion = currentPub.draftVersion + 1;
  const now = new Date().toISOString();
  const etag = `cms-v${nextPublishedVersion}-rb-${crypto.randomUUID().slice(0, 6)}`;

  await persistSnapshotStage(db, check.snapshot, 'draft', actor.username, now, nextDraftVersion);
  await persistSnapshotStage(db, check.snapshot, 'published', actor.username, now, nextPublishedVersion);
  await db
    .prepare(
      `UPDATE content_publication
       SET published_version = ?, draft_version = ?, etag = ?, last_published_at = ?, last_published_by = ?, last_rollback_at = ?, updated_at = ?
       WHERE id = 'global'`
    )
    .bind(nextPublishedVersion, nextDraftVersion, etag, now, actor.username, now, now)
    .run();

  const newRevId = `rev-${nextPublishedVersion}-${crypto.randomUUID().slice(0, 6)}`;
  await db
    .prepare(
      `INSERT INTO content_revisions (id, version_number, snapshot_json, summary, created_by, created_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'rollback')`
    )
    .bind(
      newRevId,
      nextPublishedVersion,
      JSON.stringify(check.snapshot),
      `Rollback to v${revRow.version_number} (${revRow.id})`,
      actor.username,
      now
    )
    .run();

  await invalidateLivePublicCms(env, fallback);
  await writeLivePublicCms(
    { version: nextPublishedVersion, etag, updatedAt: now, snapshot: check.snapshot },
    env,
    fallback
  );
  if (onSyncLegacyCache) {
    await onSyncLegacyCache(check.snapshot);
  }

  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'cms_rollback',
    targetType: 'cms',
    targetId: revRow.id,
    ipMasked: actor.ipMasked,
    summary: `Rolled back live website CMS to revision v${revRow.version_number} (now v${nextPublishedVersion}).`,
  });

  const publication = await getPublicationState(db);
  return { ok: true, version: nextPublishedVersion, etag, publication, snapshot: check.snapshot };
}

export async function syncCmsIntoSiteSettings(
  db: D1Database,
  snapshot: CmsSnapshotPayload,
  now = new Date().toISOString()
): Promise<void> {
  const existing = await db
    .prepare(`SELECT value_json FROM site_settings WHERE setting_key = 'site_config' LIMIT 1`)
    .first<{ value_json: string }>();
  const current = safeJsonParse<SiteConfigData>(existing?.value_json ?? '', {
    schemaVersion: 1,
    lastUpdated: now.slice(0, 10),
    brandName: snapshot.footer.brandName,
    tagline: snapshot.footer.tagline,
    heroDescription: snapshot.hero.slides[0]?.description ?? '',
    tickerAnnouncement: snapshot.hero.slides[0]?.subtitle ?? '',
    whyJoin: [],
    about: {
      heading: snapshot.aboutContact.aboutHeading,
      paragraphs: [snapshot.aboutContact.aboutBody],
      pillars: [],
      vision: snapshot.aboutContact.aboutVision,
    },
    community: {
      whatsappCommunityUrl: '',
      whatsappChannelUrl: '',
      whatsappContactUrl: '',
      instagramUrl: '',
      youtubeUrl: '',
      discordUrl: '',
      contactEmail: snapshot.aboutContact.contactEmail,
    },
    termsSections: [],
  });

  const byPlatform = new Map<string, string>();
  for (const s of snapshot.socialLinks) {
    if (!byPlatform.has(s.platform) && s.url) {
      byPlatform.set(s.platform, s.url);
    }
    if (s.label.toLowerCase().includes('channel')) {
      current.community.whatsappChannelUrl = s.url;
    } else if (s.label.toLowerCase().includes('group')) {
      current.community.whatsappCommunityUrl = s.url;
    }
  }
  current.lastUpdated = now.slice(0, 10);
  current.brandName = snapshot.footer.brandName;
  current.tagline = snapshot.footer.tagline;
  current.heroDescription = snapshot.hero.slides[0]?.description ?? current.heroDescription;
  if (byPlatform.get('instagram')) current.community.instagramUrl = byPlatform.get('instagram')!;
  if (byPlatform.get('youtube')) current.community.youtubeUrl = byPlatform.get('youtube')!;
  if (byPlatform.get('discord')) current.community.discordUrl = byPlatform.get('discord')!;
  if (snapshot.aboutContact.contactEmail) current.community.contactEmail = snapshot.aboutContact.contactEmail;
  if (snapshot.aboutContact.whatsappSupportUrl) {
    current.community.whatsappContactUrl = snapshot.aboutContact.whatsappSupportUrl;
  }

  await db
    .prepare(
      `INSERT INTO site_settings (setting_key, value_json, updated_at) VALUES ('site_config', ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    .bind(JSON.stringify(current), now)
    .run();
}

export async function getAdminCmsWorkspace(db: D1Database): Promise<{
  draft: CmsSnapshotPayload;
  published: CmsSnapshotPayload;
  publication: CmsPublicationState;
  revisions: CmsRevisionRecord[];
  mediaAssets: MediaAssetRecord[];
  availableTournaments: D1PublicTournament[];
}> {
  await ensureCmsInitialized(db);
  const [draft, published, publication, revisions, mediaAssets, tournRows] = await Promise.all([
    readSnapshotStage(db, 'draft'),
    readSnapshotStage(db, 'published'),
    getPublicationState(db),
    listCmsRevisions(db),
    listMediaAssets(db),
    db
      .prepare(
        `SELECT t.*, (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = t.id AND r.status IN ('approved','pending')) AS registered_slots
         FROM tournaments t ORDER BY t.updated_at DESC`
      )
      .all<Record<string, unknown>>(),
  ]);

  return {
    draft,
    published,
    publication,
    revisions,
    mediaAssets,
    availableTournaments: tournRows.results.map((r) => mapTournamentRow(r, Number(r.registered_slots ?? 0))),
  };
}
