export interface CmsHeroSlide {
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

export interface CmsHeroSectionConfig {
  visible: boolean;
  displayOrder: number;
  slides: CmsHeroSlide[];
}

export interface CmsFeaturedSectionConfig {
  visible: boolean;
  displayOrder: number;
  heading: string;
  description: string;
  tournamentIds: string[];
  bannerOverrides?: Record<string, string>;
}

export interface CmsSectionLayoutConfig {
  visible: boolean;
  displayOrder: number;
  heading: string;
  subtitle: string;
}

export interface CmsNavItem {
  id: string;
  label: string;
  href: string;
  itemType: 'anchor' | 'route' | 'external';
  visible: boolean;
  showMobile: boolean;
  openInNewTab: boolean;
  displayOrder: number;
}

export interface CmsSocialLink {
  id: string;
  platform: 'whatsapp' | 'instagram' | 'youtube' | 'discord' | 'x' | 'telegram' | 'website';
  label: string;
  subtitle: string;
  url: string;
  iconName: string;
  visible: boolean;
  displayOrder: number;
}

export interface CmsFooterConfig {
  visible: boolean;
  brandName: string;
  tagline: string;
  logoUrl: string;
  description: string;
  copyrightText: string;
  disclaimerText: string;
  legalNote: string;
  quickLinks: { label: string; href: string }[];
  legalLinks: { label: string; href: string }[];
}

export interface CmsAboutContactConfig {
  aboutVisible: boolean;
  aboutOrder: number;
  aboutHeading: string;
  aboutBody: string;
  aboutVision: string;
  aboutImageUrl: string;
  contactVisible: boolean;
  contactOrder: number;
  contactHeading: string;
  contactSubtitle: string;
  contactEmail: string;
  whatsappSupportUrl: string;
}

export interface CmsSeoSettings {
  siteTitle: string;
  siteDescription: string;
  ogTitle: string;
  ogDescription: string;
  ogImageUrl: string;
  twitterCard: 'summary' | 'summary_large_image';
  canonicalUrl: string;
}

export interface CmsSnapshotPayload {
  hero: CmsHeroSectionConfig;
  featured: CmsFeaturedSectionConfig;
  sections: {
    tournaments: CmsSectionLayoutConfig;
    results: CmsSectionLayoutConfig;
    news: CmsSectionLayoutConfig;
    social: CmsSectionLayoutConfig;
  };
  navigation: CmsNavItem[];
  socialLinks: CmsSocialLink[];
  footer: CmsFooterConfig;
  aboutContact: CmsAboutContactConfig;
  seo: CmsSeoSettings;
}

export interface CmsPublicationState {
  publishedVersion: number;
  draftVersion: number;
  etag: string;
  lastPublishedAt: string | null;
  lastPublishedBy: string | null;
  lastRollbackAt: string | null;
  hasUnpublishedChanges: boolean;
}

export interface CmsRevisionRecord {
  id: string;
  versionNumber: number;
  summary: string;
  createdBy: string;
  createdAt: string;
  status: 'published' | 'rollback';
}

export interface MediaAssetRecord {
  id: string;
  r2Key: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  publicUrl: string;
  folder: string;
  altText: string;
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
  referenceCount?: number;
  referencedIn?: string[];
}

export const DEFAULT_CMS_SNAPSHOT: CmsSnapshotPayload = {
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

export function resolveMediaAssetUrl(rawUrl: string): string {
  const trimmed = (rawUrl ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/api/media/')) {
    const apiBase = String(import.meta.env.VITE_ADMIN_API_URL ?? '').trim().replace(/\/+$/g, '');
    return apiBase ? `${apiBase}${trimmed}` : trimmed;
  }
  return trimmed;
}
