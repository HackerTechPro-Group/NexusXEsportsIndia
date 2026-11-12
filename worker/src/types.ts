export type TournamentFormat = 'Solo' | 'Duo' | 'Squad';
export type PerspectiveMode = 'TPP' | 'FPP';
export type RegistrationStatus = 'open' | 'closed' | 'full';
export type TournamentLifecycleStatus =
  | 'draft'
  | 'upcoming'
  | 'registration_open'
  | 'registration_closed'
  | 'live'
  | 'completed'
  | 'cancelled'
  | 'archived';

export interface SquadRequirements {
  teamRequirements: string;
  captainRequirements: string;
  playerRequirements: string;
}

export interface TournamentRecord {
  id: string;
  slug: string;
  title: string;
  season?: string;
  description: string;
  game: string;
  format: TournamentFormat;
  mode: PerspectiveMode;
  matchFormat?: string;
  map: string;
  banner: string;
  thumbnail: string;
  matchesCount: number;
  teamSize: string;
  eligibleDevices: string;
  eligibility: string[];
  squadDetails?: SquadRequirements;
  registration: {
    status: RegistrationStatus;
    formUrl: string;
    buttonText: string;
    openingDate: string;
    closingDate: string;
    closingMessage?: string;
    whatsappCommunityUrl: string;
    instructions: string;
    additionalInstructions?: string;
  };
  schedule: {
    date: string;
    reportingTime: string;
    startTime: string;
    timezone: string;
  };
  prizes: {
    entryFee: string;
    totalPrizePool: string;
    first: string;
    second: string;
    third: string;
    other: string;
  };
  rules: string[];
  status: TournamentLifecycleStatus;
  published?: boolean;
  featured: boolean;
}

export interface TournamentsData {
  schemaVersion: number;
  lastUpdated: string;
  tournaments: TournamentRecord[];
}

export interface ResultRankingRow {
  rank: number;
  teamOrPlayer: string;
  totalPoints: number;
  prize: string;
}

export interface TournamentResultEntry {
  id: string;
  tournamentId?: string;
  tournamentName: string;
  division: TournamentFormat;
  date: string;
  winner: string;
  finalRankings: ResultRankingRow[];
  prizeDistribution: string;
  summary: string;
  published?: boolean;
}

export interface ResultsData {
  schemaVersion: number;
  lastUpdated: string;
  entries: TournamentResultEntry[];
}

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  publishedDate: string;
  banner: string;
  externalUrl: string;
  category: 'Tournament' | 'Rules' | 'Community' | 'Updates';
  pinned: boolean;
  published?: boolean;
  archived?: boolean;
}

export interface NewsData {
  schemaVersion: number;
  lastUpdated: string;
  entries: NewsArticle[];
}

export interface TermsSection {
  id: string;
  title: string;
  content: string;
}

export interface CommunityConfig {
  whatsappCommunityUrl: string;
  whatsappChannelUrl?: string;
  whatsappContactUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  discordUrl: string;
  contactEmail: string;
}

export interface SiteConfigData {
  schemaVersion: number;
  lastUpdated: string;
  brandName: string;
  tagline: string;
  heroDescription: string;
  tickerAnnouncement: string;
  whyJoin: { title: string; description: string }[];
  about: {
    heading: string;
    paragraphs: string[];
    pillars: { title: string; description: string }[];
    vision: string;
  };
  community: CommunityConfig;
  termsSections: TermsSection[];
}

export interface AdminContentBundle {
  tournaments: TournamentsData;
  results: ResultsData;
  news: NewsData;
  siteConfig?: SiteConfigData;
}

export interface RateLimiterBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface SecurityKvBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete?(key: string): Promise<void>;
}

export type RevokedSessionsKvBinding = SecurityKvBinding;

export interface StoredOwnerAccount {
  version: number;
  username: string;
  passwordHash: string;
  setupCompletedAt: string;
  credentialUpdatedAt: string;
  tokenInvalidBefore: number;
  tokenInvalidBeforeMs?: number;
}

export interface StoredSessionRecord {
  jti: string;
  username: string;
  issuedAt: number;
  expiresAt: number;
  userAgentSummary: string;
  ipMasked: string;
}

export type SecurityAuditEventType =
  | 'setup_completed'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'admin_id_changed'
  | 'password_changed'
  | 'session_revoked'
  | 'sessions_revoked_all'
  | 'content_published'
  | 'private_config_updated'
  | 'unauthorized_access';

export interface SecurityAuditEntry {
  id: string;
  timestamp: string;
  event: SecurityAuditEventType;
  actor: string;
  ipMasked: string;
  summary: string;
}

export interface PrivateSheetEntry {
  sheetUrl: string;
  notes?: string;
  updatedAt: string;
}

export interface PrivateSheetsConfig {
  schemaVersion: number;
  updatedAt: string;
  sheetsByTournamentId: Record<string, PrivateSheetEntry>;
}

export interface D1Meta {
  changes?: number;
  last_row_id?: number;
}

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: D1Meta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(colName?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<{ count: number; duration: number }>;
}

export type RoleName =
  | 'owner'
  | 'tournament_manager'
  | 'moderator'
  | 'result_manager'
  | 'player';

export type StaffRoleName = Exclude<RoleName, 'player'>;

export interface R2ObjectBody {
  key: string;
  size: number;
  etag?: string;
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  body: ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface R2PutOptions {
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  customMetadata?: Record<string, string>;
}

export interface R2Bucket {
  get(key: string): Promise<R2ObjectBody | null>;
  put(key: string, value: ArrayBuffer | Uint8Array | Blob | string, options?: R2PutOptions): Promise<{ key: string; size: number; etag?: string } | null>;
  delete(keys: string | string[]): Promise<void>;
}

export type CmsSectionKey =
  | 'hero'
  | 'featured_tournaments'
  | 'tournaments'
  | 'results'
  | 'news'
  | 'social'
  | 'navigation'
  | 'footer'
  | 'about'
  | 'contact'
  | 'seo';

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

export interface WorkerEnv {
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD_HASH?: string;
  ADMIN_SETUP_TOKEN?: string;
  CLOUDFLARE_ACCESS_OWNER_EMAIL?: string;
  SESSION_SECRET: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_INSTALLATION_ID: string;
  GITHUB_APP_PRIVATE_KEY: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  GITHUB_BRANCH: string;
  ALLOWED_ORIGINS: string;
  ENVIRONMENT?: string;
  ALLOWED_GITHUB_OWNER?: string;
  ALLOWED_GITHUB_REPO?: string;
  RATE_LIMITER?: RateLimiterBinding;
  SECURITY_KV?: SecurityKvBinding;
  REVOKED_SESSIONS_KV?: SecurityKvBinding;
  DB?: D1Database;
  MEDIA_BUCKET?: R2Bucket;
  R2_PUBLIC_BASE_URL?: string;
}

export function resolveSecurityKv(env: WorkerEnv): SecurityKvBinding | undefined {
  return env.SECURITY_KV ?? env.REVOKED_SESSIONS_KV;
}
