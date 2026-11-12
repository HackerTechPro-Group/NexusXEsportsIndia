import { DEFAULT_CMS_SNAPSHOT, type CmsSnapshotPayload } from '../types/cms';
import type {
  LeaderboardData,
  NewsData,
  PublicSiteBundle,
  ResultsData,
  ScheduleData,
  SiteConfigData,
  TournamentsData,
} from '../types/data';
import {
  isValidLeaderboardData,
  isValidNewsData,
  isValidResultsData,
  isValidScheduleData,
  isValidSiteConfigData,
  isValidTournamentsData,
  validateHttpsUrl,
} from './validation';

export type DatasetKey =
  | 'siteConfig'
  | 'tournaments'
  | 'leaderboard'
  | 'schedule'
  | 'results'
  | 'news';

export type DatasetErrors = Partial<Record<DatasetKey, string>>;

/**
 * Empty structural scaffold used only while initial data loads or when an endpoint fails.
 * Contains ZERO invented contact emails, fake tournament records, demo stats, or placeholder news.
 */
export const EMPTY_SITE_BUNDLE: PublicSiteBundle = {
  siteConfig: {
    schemaVersion: 2,
    lastUpdated: '',
    brandName: 'NexusX Esports India',
    tagline: 'COMPETE. CONNECT. CONQUER.',
    heroDescription: '',
    tickerAnnouncement: '',
    whyJoin: [],
    about: {
      heading: '',
      paragraphs: [],
      pillars: [],
      vision: '',
    },
    community: {
      whatsappCommunityUrl: '',
      whatsappChannelUrl: '',
      whatsappContactUrl: '',
      instagramUrl: '',
      youtubeUrl: '',
      discordUrl: '',
      contactEmail: '',
    },
    termsSections: [],
  },
  tournaments: {
    schemaVersion: 2,
    lastUpdated: '',
    tournaments: [],
  },
  leaderboard: {
    schemaVersion: 2,
    lastUpdated: '',
    isDemoData: false,
    entries: [],
  },
  schedule: {
    schemaVersion: 2,
    lastUpdated: '',
    entries: [],
  },
  results: {
    schemaVersion: 2,
    lastUpdated: '',
    entries: [],
  },
  news: {
    schemaVersion: 2,
    lastUpdated: '',
    entries: [],
  },
  cms: DEFAULT_CMS_SNAPSHOT,
};

const REQUEST_TIMEOUT_MS = 8000;
const MAX_TRANSIENT_ATTEMPTS = 2;
const RETRY_DELAY_MS = 250;

class NonRetryableDataError extends Error {}

export function getPublicDataBaseUrl(): string {
  const configured = (import.meta.env.VITE_PUBLIC_DATA_BASE_URL ?? '').trim().replace(/\/+$/g, '');
  if (!configured) {
    return './data';
  }
  if (configured.startsWith('./') || configured.startsWith('/')) {
    if (!configured.includes('..')) {
      return configured;
    }
    return './data';
  }
  const httpsCheck = validateHttpsUrl(configured, 'Public data endpoint');
  return httpsCheck.valid && httpsCheck.normalized ? configured : './data';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function fetchJsonValidated<T>(
  baseUrl: string,
  relativePath: string,
  validator: (value: unknown) => value is T,
  emptyDefault: T,
  cacheBuster: number
): Promise<{ data: T; error: string | null }> {
  const targetUrl = `${baseUrl}/${relativePath}?v=${cacheBuster}`;

  for (let attempt = 1; attempt <= MAX_TRANSIENT_ATTEMPTS; attempt += 1) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller
      ? window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
      : null;

    try {
      const res = await fetch(targetUrl, {
        cache: 'no-store',
        signal: controller?.signal,
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new NonRetryableDataError(`HTTP ${res.status} loading ${relativePath}`);
        }
        throw new Error(`HTTP ${res.status} loading ${relativePath}`);
      }

      const parsed: unknown = await res.json();
      if (!validator(parsed)) {
        throw new NonRetryableDataError(`Schema validation failed for ${relativePath}`);
      }

      return { data: parsed, error: null };
    } catch (err) {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }

      const isAbort = err instanceof Error && err.name === 'AbortError';
      const normalizedErr = isAbort
        ? `Request timed out loading ${relativePath}`
        : err instanceof Error
          ? err.message
          : `Failed loading ${relativePath}`;

      const isRetryable = !(err instanceof NonRetryableDataError);
      if (isRetryable && attempt < MAX_TRANSIENT_ATTEMPTS) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      return {
        data: emptyDefault,
        error: normalizedErr,
      };
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  return {
    data: emptyDefault,
    error: `Failed loading ${relativePath}`,
  };
}

export interface FetchBundleResult {
  bundle: PublicSiteBundle;
  errors: string[];
  datasetErrors: DatasetErrors;
  fetchedAt: string;
}

interface LiveWorkerContentSlices {
  siteConfig?: SiteConfigData;
  tournaments?: TournamentsData;
  results?: ResultsData;
  news?: NewsData;
}

/**
 * Resolves the optional Worker API base URL configured via VITE_ADMIN_API_URL.
 * Permits HTTPS URLs and local development loopback origins (localhost / 127.0.0.1) only.
 */
function getPublicLiveApiUrl(): string {
  const raw = String(import.meta.env.VITE_ADMIN_API_URL ?? '').trim();
  if (!raw) {
    return '';
  }

  if (validateHttpsUrl(raw, 'Live API URL').valid) {
    return raw.replace(/\/+$/, '');
  }

  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      !parsed.username &&
      !parsed.password
    ) {
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
    }
  } catch {
    return '';
  }

  return '';
}

/**
 * Fetches live Admin-published overrides from the Worker public endpoint.
 * Always fails silently (`null`) when offline, unconfigured, or unseeded so static GitHub Pages JSON stays authoritative.
 */
async function fetchLiveWorkerContent(
  apiBaseUrl: string,
  cacheBuster: number
): Promise<LiveWorkerContentSlices | null> {
  if (!apiBaseUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId =
    typeof window !== 'undefined'
      ? window.setTimeout(() => controller.abort(), 3500)
      : null;

  try {
    const response = await fetch(`${apiBaseUrl}/api/public/content?_ts=${cacheBuster}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as Record<string, unknown> | null;
    if (!payload || payload.available !== true) {
      return null;
    }

    const slices: LiveWorkerContentSlices = {};
    if (isValidSiteConfigData(payload.siteConfig)) {
      slices.siteConfig = payload.siteConfig;
    }
    if (isValidTournamentsData(payload.tournaments)) {
      slices.tournaments = payload.tournaments;
    }
    if (isValidResultsData(payload.results)) {
      slices.results = payload.results;
    }
    if (isValidNewsData(payload.news)) {
      slices.news = payload.news;
    }

    return Object.keys(slices).length > 0 ? slices : null;
  } catch {
    return null;
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

interface LiveCmsResponse {
  cms: CmsSnapshotPayload;
  version: number;
  featuredIds: string[];
}

async function fetchLiveWorkerCms(
  apiBaseUrl: string,
  cacheBuster: number
): Promise<LiveCmsResponse | null> {
  if (!apiBaseUrl) {
    return null;
  }

  const controller = new AbortController();
  const timeoutId =
    typeof window !== 'undefined'
      ? window.setTimeout(() => controller.abort(), 3500)
      : null;

  try {
    const response = await fetch(`${apiBaseUrl}/api/public/cms?_ts=${cacheBuster}`, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      available?: boolean;
      cms?: CmsSnapshotPayload;
      version?: number;
      featuredTournaments?: Array<{ id?: string }>;
    } | null;
    if (!payload || payload.available !== true || !payload.cms) return null;
    return {
      cms: payload.cms,
      version: Number(payload.version ?? 1),
      featuredIds: Array.isArray(payload.featuredTournaments)
        ? payload.featuredTournaments.map((t) => String(t.id ?? '')).filter(Boolean)
        : [],
    };
  } catch {
    return null;
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}

function buildCmsFallbackFromSiteConfig(siteConfig: SiteConfigData): CmsSnapshotPayload {
  const cms = structuredClone(DEFAULT_CMS_SNAPSHOT);
  const community = siteConfig.community;
  if (!community) return cms;

  const findLink = (id: string) => cms.socialLinks.find((item) => item.id === id);
  const waGroup = findLink('social-whatsapp-group');
  if (waGroup && community.whatsappCommunityUrl) waGroup.url = community.whatsappCommunityUrl;
  const waChannel = findLink('social-whatsapp-channel');
  if (waChannel && community.whatsappChannelUrl) waChannel.url = community.whatsappChannelUrl;
  const ig = findLink('social-instagram');
  if (ig && community.instagramUrl) ig.url = community.instagramUrl;
  const yt = findLink('social-youtube');
  if (yt && community.youtubeUrl) yt.url = community.youtubeUrl;

  if (community.discordUrl && !cms.socialLinks.some((item) => item.platform === 'discord')) {
    cms.socialLinks.push({
      id: 'social-discord',
      platform: 'discord',
      label: 'Discord',
      subtitle: 'Coordinate lobbies and squad check-ins.',
      url: community.discordUrl,
      iconName: 'discord',
      visible: true,
      displayOrder: cms.socialLinks.length + 1,
    });
  }

  return cms;
}

let inflightBundlePromise: Promise<FetchBundleResult> | null = null;

async function performFetchPublicSiteBundle(): Promise<FetchBundleResult> {
  const ts = Date.now();
  const baseUrl = getPublicDataBaseUrl();
  const liveApiUrl = getPublicLiveApiUrl();

  const [siteRes, tourRes, lbRes, schRes, resRes, newsRes, liveSlices, liveCms] = await Promise.all([
    fetchJsonValidated<SiteConfigData>(
      baseUrl,
      'site-config.json',
      isValidSiteConfigData,
      EMPTY_SITE_BUNDLE.siteConfig,
      ts
    ),
    fetchJsonValidated<TournamentsData>(
      baseUrl,
      'tournaments.json',
      isValidTournamentsData,
      EMPTY_SITE_BUNDLE.tournaments,
      ts
    ),
    fetchJsonValidated<LeaderboardData>(
      baseUrl,
      'leaderboard.json',
      isValidLeaderboardData,
      EMPTY_SITE_BUNDLE.leaderboard,
      ts
    ),
    fetchJsonValidated<ScheduleData>(
      baseUrl,
      'schedule.json',
      isValidScheduleData,
      EMPTY_SITE_BUNDLE.schedule,
      ts
    ),
    fetchJsonValidated<ResultsData>(
      baseUrl,
      'results.json',
      isValidResultsData,
      EMPTY_SITE_BUNDLE.results,
      ts
    ),
    fetchJsonValidated<NewsData>(
      baseUrl,
      'news.json',
      isValidNewsData,
      EMPTY_SITE_BUNDLE.news,
      ts
    ),
    fetchLiveWorkerContent(liveApiUrl, ts),
    fetchLiveWorkerCms(liveApiUrl, ts),
  ]);

  const datasetErrors: DatasetErrors = {};
  if (siteRes.error && !liveSlices?.siteConfig) datasetErrors.siteConfig = siteRes.error;
  if (tourRes.error && !liveSlices?.tournaments) datasetErrors.tournaments = tourRes.error;
  if (lbRes.error) datasetErrors.leaderboard = lbRes.error;
  if (schRes.error) datasetErrors.schedule = schRes.error;
  if (resRes.error && !liveSlices?.results) datasetErrors.results = resRes.error;
  if (newsRes.error && !liveSlices?.news) datasetErrors.news = newsRes.error;

  const errors = Object.values(datasetErrors).filter((e): e is string => Boolean(e));

  const resolvedSiteConfig = liveSlices?.siteConfig ?? siteRes.data;

  return {
    bundle: {
      siteConfig: resolvedSiteConfig,
      tournaments: liveSlices?.tournaments ?? tourRes.data,
      leaderboard: lbRes.data,
      schedule: schRes.data,
      results: liveSlices?.results ?? resRes.data,
      news: liveSlices?.news ?? newsRes.data,
      cms: liveCms?.cms ?? buildCmsFallbackFromSiteConfig(resolvedSiteConfig),
      cmsVersion: liveCms?.version,
      featuredTournamentIds: liveCms?.featuredIds,
    },
    errors,
    datasetErrors,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetches and validates all public JSON data files cleanly with in-flight request deduplication.
 * Set `forceRefresh = true` on manual retries or post-Admin publication refreshes.
 */
export async function fetchPublicSiteBundle(forceRefresh = false): Promise<FetchBundleResult> {
  if (!forceRefresh && inflightBundlePromise) {
    return inflightBundlePromise;
  }

  const currentPromise = performFetchPublicSiteBundle().finally(() => {
    if (inflightBundlePromise === currentPromise) {
      inflightBundlePromise = null;
    }
  });
  inflightBundlePromise = currentPromise;
  return currentPromise;
}
