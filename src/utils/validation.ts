import type {
  LeaderboardData,
  LeaderboardEntry,
  NewsArticle,
  NewsData,
  ResultsData,
  ScheduleData,
  ScheduleEntry,
  SiteConfigData,
  TournamentRecord,
  TournamentResultEntry,
  TournamentsData,
  ValidationResult,
} from '../types/data';

const ALLOWED_GOOGLE_FORM_HOSTS = new Set([
  'docs.google.com',
  'www.docs.google.com',
  'forms.gle',
]);

const ALLOWED_LIFECYCLE_STATUSES = new Set([
  'draft',
  'upcoming',
  'registration_open',
  'registration_closed',
  'live',
  'completed',
  'cancelled',
  'archived',
]);

const ALLOWED_NEWS_CATEGORIES = new Set(['Tournament', 'Rules', 'Community', 'Updates']);
const ALLOWED_SCHEDULE_STATUSES = new Set([
  'Upcoming',
  'Registration Open',
  'Registration Closed',
  'Live',
  'Completed',
  'Cancelled',
]);

const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
const SAFE_LOCAL_IMAGE_RE = /^(?:\.\/|\/)images\/[A-Za-z0-9._/-]+\.(?:jpg|jpeg|png|webp|avif|svg)$/i;
const SAFE_WORKER_MEDIA_RE = /^\/api\/media\/[A-Za-z0-9._/-]+\.(?:jpg|jpeg|png|webp|avif)$/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function validateIsoDateString(
  raw: string,
  label = 'Date',
  allowTba = false
): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return allowTba
      ? { valid: true, normalized: '' }
      : { valid: false, normalized: '', error: `${label} is required (YYYY-MM-DD).` };
  }

  if (allowTba && trimmed.toUpperCase() === 'TBA') {
    return { valid: true, normalized: 'TBA' };
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    return {
      valid: false,
      normalized: trimmed,
      error: `${label} must follow YYYY-MM-DD format${allowTba ? ' or TBA' : ''}.`,
    };
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return {
      valid: false,
      normalized: trimmed,
      error: `${label} is not a valid calendar date.`,
    };
  }

  return { valid: true, normalized: trimmed };
}

/**
 * Validates a Google Forms registration URL.
 * Rejects javascript:, data:, http:, embedded credentials, non-Google domains, and malformed URLs.
 */
export function validateGoogleFormUrl(raw: string, allowEmpty = true): ValidationResult {
  const trimmed = raw.trim();

  if (!trimmed) {
    if (allowEmpty) {
      return { valid: true, normalized: '' };
    }
    return {
      valid: false,
      normalized: '',
      error: 'Google Form URL cannot be empty.',
    };
  }

  if (trimmed.length > 2048 || CONTROL_CHARS_RE.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Google Form URL exceeds maximum length or contains invalid characters.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalized: trimmed,
      error:
        'Invalid URL structure. Include https:// (e.g., https://docs.google.com/forms/... or https://forms.gle/...).',
    };
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Unsafe protocol or URL credentials rejected. Google Form URLs must use https://.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_GOOGLE_FORM_HOSTS.has(host)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Domain not allowed. Use an official Google Forms URL (docs.google.com/forms or forms.gle).',
    };
  }

  if (
    (host === 'docs.google.com' || host === 'www.docs.google.com') &&
    !(parsed.pathname.startsWith('/forms/') && parsed.pathname.length > '/forms/'.length)
  ) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'docs.google.com URL must point to a /forms/ path.',
    };
  }

  if (host === 'forms.gle' && parsed.pathname.length <= 1) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'forms.gle link must include the form ID path.',
    };
  }

  return {
    valid: true,
    normalized: parsed.toString(),
  };
}

/**
 * Validates an optional Private Organizer Google Sheets tracking URL.
 * Accepts ONLY https://docs.google.com/spreadsheets/... without credentials or control characters.
 */
export function validateGoogleSheetUrl(raw: string, allowEmpty = true): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return allowEmpty
      ? { valid: true, normalized: '' }
      : { valid: false, normalized: '', error: 'Google Sheet URL cannot be empty.' };
  }

  if (trimmed.length > 2048 || CONTROL_CHARS_RE.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Google Sheet URL exceeds maximum length or contains invalid characters.',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Invalid Google Sheet URL structure. Include https://docs.google.com/spreadsheets/...',
    };
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Google Sheet URL must use https:// without embedded credentials.',
    };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    (host !== 'docs.google.com' && host !== 'www.docs.google.com') ||
    !parsed.pathname.startsWith('/spreadsheets/') ||
    parsed.pathname.length <= '/spreadsheets/'.length
  ) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Only https://docs.google.com/spreadsheets/... URLs are supported.',
    };
  }

  return {
    valid: true,
    normalized: parsed.toString(),
  };
}

const PRIVATE_SHEET_REF_RE = /(?:docs\.google\.com\/spreadsheets|sheets\.googleapis\.com)/i;

/**
 * Ensures private Google Sheet tracking links never appear inside public website JSON datasets.
 */
export function containsPrivateSheetReference(value: unknown): boolean {
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return PRIVATE_SHEET_REF_RE.test(serialized);
  } catch {
    return true;
  }
}

/**
 * Validates optional external HTTPS links (social, WhatsApp, news external links).
 * Rejects javascript:, data:, vbscript:, http:, and embedded credentials.
 */
export function validateHttpsUrl(raw: string, label = 'URL'): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, normalized: '' };
  }

  if (trimmed.length > 2048 || CONTROL_CHARS_RE.test(trimmed)) {
    return {
      valid: false,
      normalized: trimmed,
      error: `${label} exceeds maximum length or contains invalid characters.`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      valid: false,
      normalized: trimmed,
      error: `${label} is not a valid URL.`,
    };
  }

  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return {
      valid: false,
      normalized: trimmed,
      error: `${label} must start with https:// without embedded credentials.`,
    };
  }

  return {
    valid: true,
    normalized: parsed.toString(),
  };
}

/**
 * Validates image paths or URLs: allows safe relative assets (`./images/...`, `/images/...`)
 * or valid HTTPS URLs. Blocks path traversal, javascript:, and data: schemes.
 */
export function validateImageAssetUrl(raw: string, label = 'Image URL'): ValidationResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { valid: true, normalized: '' };
  }

  if (trimmed.startsWith('./') || trimmed.startsWith('/')) {
    const lower = trimmed.toLowerCase();
    if (
      trimmed.includes('..') ||
      trimmed.includes('\\') ||
      lower.includes('%2e') ||
      trimmed.includes('<') ||
      trimmed.includes('>') ||
      (!SAFE_LOCAL_IMAGE_RE.test(trimmed) && !SAFE_WORKER_MEDIA_RE.test(trimmed))
    ) {
      return {
        valid: false,
        normalized: trimmed,
        error: `${label} must reference a clean static image inside ./images/, an uploaded /api/media/ asset, or use https://.`,
      };
    }
    return { valid: true, normalized: trimmed };
  }

  return validateHttpsUrl(trimmed, label);
}

/**
 * Validates a TournamentRecord before saving, loading, or publishing.
 */
export function validateTournamentRecord(
  tournament: TournamentRecord,
  existingIds: string[] = []
): string[] {
  const errors: string[] = [];
  const isPublishedEvent =
    tournament.status !== 'draft' &&
    tournament.status !== 'archived' &&
    tournament.published !== false;

  if (!tournament.id.trim()) errors.push('Tournament ID is required.');
  if (!/^[A-Za-z0-9_-]+$/.test(tournament.id.trim())) {
    errors.push('Tournament ID may only contain letters, numbers, hyphens, and underscores.');
  }
  if (existingIds.includes(tournament.id.trim())) {
    errors.push(`Duplicate Tournament ID "${tournament.id.trim()}" detected.`);
  }
  if (!tournament.slug.trim() || !/^[a-z0-9-]+$/.test(tournament.slug.trim())) {
    errors.push('Tournament slug must be lowercase alphanumeric with hyphens (e.g., solo-cup-s1).');
  }
  if (!tournament.title.trim()) errors.push('Tournament Name is required.');
  if (!tournament.game.trim()) errors.push('Game Name is required.');
  if (isPublishedEvent) {
    if (!tournament.description.trim()) errors.push('Tournament Description is required to publish.');
    if (!tournament.map.trim()) errors.push('Map is required to publish.');
    if (!tournament.teamSize.trim()) errors.push('Team Size is required to publish.');
    if (!tournament.eligibleDevices.trim()) errors.push('Eligible Devices is required to publish.');
  }
  if (tournament.format !== 'Solo' && tournament.format !== 'Duo' && tournament.format !== 'Squad') {
    errors.push('Tournament format must be Solo, Duo, or Squad.');
  }
  if (tournament.mode !== 'TPP' && tournament.mode !== 'FPP') {
    errors.push('Tournament perspective mode must be TPP or FPP.');
  }
  if (!ALLOWED_LIFECYCLE_STATUSES.has(tournament.status)) {
    errors.push('Invalid tournament lifecycle status.');
  }
  if (!Number.isInteger(tournament.matchesCount) || tournament.matchesCount < 1 || tournament.matchesCount > 50) {
    errors.push('Match Count must be a whole number between 1 and 50.');
  }

  if (containsPrivateSheetReference(tournament)) {
    errors.push(
      'Public tournament records cannot contain Google Sheet URLs. Store private sheet links in Registration Management Private Settings.'
    );
  }

  const schedDateCheck = validateIsoDateString(tournament.schedule.date, 'Tournament Date', true);
  if (!schedDateCheck.valid && schedDateCheck.error) errors.push(schedDateCheck.error);

  const openDateCheck = validateIsoDateString(
    tournament.registration.openingDate,
    'Registration Opening Date',
    true
  );
  if (!openDateCheck.valid && openDateCheck.error) errors.push(openDateCheck.error);

  const closeDateCheck = validateIsoDateString(
    tournament.registration.closingDate,
    'Registration Closing Date',
    true
  );
  if (!closeDateCheck.valid && closeDateCheck.error) errors.push(closeDateCheck.error);

  const bannerCheck = validateImageAssetUrl(tournament.banner, 'Banner Image URL');
  if (!bannerCheck.valid && bannerCheck.error) errors.push(bannerCheck.error);

  const thumbCheck = validateImageAssetUrl(tournament.thumbnail, 'Thumbnail Image URL');
  if (!thumbCheck.valid && thumbCheck.error) errors.push(thumbCheck.error);

  const formCheck = validateGoogleFormUrl(tournament.registration.formUrl, true);
  if (!formCheck.valid && formCheck.error) errors.push(formCheck.error);

  if (
    tournament.registration.status === 'open' &&
    tournament.status === 'registration_open' &&
    !tournament.registration.formUrl.trim()
  ) {
    errors.push(
      'Registration is marked Open, but Google Form URL is empty. Add a Google Form URL or mark registration Closed.'
    );
  }

  const waCheck = validateHttpsUrl(
    tournament.registration.whatsappCommunityUrl,
    'WhatsApp Community URL'
  );
  if (!waCheck.valid && waCheck.error) errors.push(waCheck.error);

  return errors;
}

function isValidTournamentSchemaItem(item: unknown): item is TournamentRecord {
  if (!isPlainObject(item)) return false;
  if (
    typeof item.id !== 'string' ||
    typeof item.slug !== 'string' ||
    typeof item.title !== 'string' ||
    (item.season !== undefined && typeof item.season !== 'string') ||
    typeof item.description !== 'string' ||
    typeof item.game !== 'string' ||
    (item.format !== 'Solo' && item.format !== 'Duo' && item.format !== 'Squad') ||
    (item.mode !== 'TPP' && item.mode !== 'FPP') ||
    (item.matchFormat !== undefined && typeof item.matchFormat !== 'string') ||
    typeof item.map !== 'string' ||
    typeof item.banner !== 'string' ||
    typeof item.thumbnail !== 'string' ||
    typeof item.matchesCount !== 'number' ||
    typeof item.teamSize !== 'string' ||
    typeof item.eligibleDevices !== 'string' ||
    !isStringArray(item.eligibility) ||
    !isStringArray(item.rules) ||
    typeof item.status !== 'string' ||
    !ALLOWED_LIFECYCLE_STATUSES.has(item.status) ||
    (item.published !== undefined && typeof item.published !== 'boolean') ||
    typeof item.featured !== 'boolean'
  ) {
    return false;
  }

  if (item.squadDetails !== undefined) {
    if (
      !isPlainObject(item.squadDetails) ||
      typeof item.squadDetails.teamRequirements !== 'string' ||
      typeof item.squadDetails.captainRequirements !== 'string' ||
      typeof item.squadDetails.playerRequirements !== 'string'
    ) {
      return false;
    }
  }

  const reg = item.registration;
  const sch = item.schedule;
  const prz = item.prizes;
  if (!isPlainObject(reg) || !isPlainObject(sch) || !isPlainObject(prz)) return false;

  if (
    (reg.status !== 'open' && reg.status !== 'closed' && reg.status !== 'full') ||
    typeof reg.formUrl !== 'string' ||
    typeof reg.buttonText !== 'string' ||
    typeof reg.openingDate !== 'string' ||
    typeof reg.closingDate !== 'string' ||
    (reg.closingMessage !== undefined && typeof reg.closingMessage !== 'string') ||
    typeof reg.whatsappCommunityUrl !== 'string' ||
    typeof reg.instructions !== 'string' ||
    (reg.additionalInstructions !== undefined && typeof reg.additionalInstructions !== 'string')
  ) {
    return false;
  }

  if (
    typeof sch.date !== 'string' ||
    typeof sch.reportingTime !== 'string' ||
    typeof sch.startTime !== 'string' ||
    typeof sch.timezone !== 'string'
  ) {
    return false;
  }

  if (
    typeof prz.entryFee !== 'string' ||
    typeof prz.totalPrizePool !== 'string' ||
    typeof prz.first !== 'string' ||
    typeof prz.second !== 'string' ||
    typeof prz.third !== 'string' ||
    typeof prz.other !== 'string'
  ) {
    return false;
  }

  return true;
}

export function isValidSiteConfigData(data: unknown): data is SiteConfigData {
  if (!isPlainObject(data) || containsSecretMaterial(data)) return false;
  if (
    typeof data.schemaVersion !== 'number' ||
    typeof data.lastUpdated !== 'string' ||
    typeof data.brandName !== 'string' ||
    typeof data.tagline !== 'string' ||
    typeof data.heroDescription !== 'string' ||
    typeof data.tickerAnnouncement !== 'string' ||
    !Array.isArray(data.whyJoin) ||
    !isPlainObject(data.about) ||
    !isPlainObject(data.community) ||
    !Array.isArray(data.termsSections)
  ) {
    return false;
  }

  if (
    !data.whyJoin.every(
      (w) => isPlainObject(w) && typeof w.title === 'string' && typeof w.description === 'string'
    )
  ) {
    return false;
  }

  const about = data.about;
  if (
    typeof about.heading !== 'string' ||
    !isStringArray(about.paragraphs) ||
    !Array.isArray(about.pillars) ||
    !about.pillars.every(
      (p) => isPlainObject(p) && typeof p.title === 'string' && typeof p.description === 'string'
    ) ||
    typeof about.vision !== 'string'
  ) {
    return false;
  }

  const comm = data.community;
  if (
    typeof comm.whatsappCommunityUrl !== 'string' ||
    (comm.whatsappChannelUrl !== undefined && typeof comm.whatsappChannelUrl !== 'string') ||
    typeof comm.whatsappContactUrl !== 'string' ||
    typeof comm.instagramUrl !== 'string' ||
    typeof comm.youtubeUrl !== 'string' ||
    typeof comm.discordUrl !== 'string' ||
    typeof comm.contactEmail !== 'string'
  ) {
    return false;
  }

  return data.termsSections.every(
    (s) =>
      isPlainObject(s) &&
      typeof s.id === 'string' &&
      typeof s.title === 'string' &&
      typeof s.content === 'string'
  );
}

export function isValidTournamentsData(data: unknown): data is TournamentsData {
  if (!isPlainObject(data) || containsSecretMaterial(data) || containsPrivateSheetReference(data)) {
    return false;
  }
  if (typeof data.schemaVersion !== 'number' || typeof data.lastUpdated !== 'string') {
    return false;
  }
  return Array.isArray(data.tournaments) && data.tournaments.every(isValidTournamentSchemaItem);
}

export function isValidLeaderboardData(data: unknown): data is LeaderboardData {
  if (!isPlainObject(data) || containsSecretMaterial(data)) return false;
  if (
    typeof data.schemaVersion !== 'number' ||
    typeof data.lastUpdated !== 'string' ||
    typeof data.isDemoData !== 'boolean' ||
    !Array.isArray(data.entries)
  ) {
    return false;
  }
  return data.entries.every((e): e is LeaderboardEntry => {
    if (!isPlainObject(e)) return false;
    return (
      typeof e.id === 'string' &&
      (e.division === 'Solo' || e.division === 'Duo' || e.division === 'Squad') &&
      (e.tournamentId === undefined || typeof e.tournamentId === 'string') &&
      typeof e.rank === 'number' &&
      typeof e.name === 'string' &&
      typeof e.tag === 'string' &&
      typeof e.matchesPlayed === 'number' &&
      typeof e.positionPoints === 'number' &&
      typeof e.eliminationPoints === 'number' &&
      typeof e.totalPoints === 'number'
    );
  });
}

export function isValidScheduleData(data: unknown): data is ScheduleData {
  if (!isPlainObject(data) || containsSecretMaterial(data)) return false;
  if (
    typeof data.schemaVersion !== 'number' ||
    typeof data.lastUpdated !== 'string' ||
    !Array.isArray(data.entries)
  ) {
    return false;
  }
  return data.entries.every((e): e is ScheduleEntry => {
    if (!isPlainObject(e)) return false;
    return (
      typeof e.id === 'string' &&
      typeof e.tournamentName === 'string' &&
      typeof e.date === 'string' &&
      typeof e.reportingTime === 'string' &&
      typeof e.startTime === 'string' &&
      typeof e.timezone === 'string' &&
      typeof e.map === 'string' &&
      (e.format === 'Solo' || e.format === 'Duo' || e.format === 'Squad' || e.format === 'All') &&
      typeof e.status === 'string' &&
      ALLOWED_SCHEDULE_STATUSES.has(e.status) &&
      typeof e.notes === 'string'
    );
  });
}

export function isValidResultsData(data: unknown): data is ResultsData {
  if (!isPlainObject(data) || containsSecretMaterial(data) || containsPrivateSheetReference(data)) {
    return false;
  }
  if (
    typeof data.schemaVersion !== 'number' ||
    typeof data.lastUpdated !== 'string' ||
    !Array.isArray(data.entries)
  ) {
    return false;
  }
  return data.entries.every((e): e is TournamentResultEntry => {
    if (!isPlainObject(e)) return false;
    if (
      typeof e.id !== 'string' ||
      (e.tournamentId !== undefined && typeof e.tournamentId !== 'string') ||
      typeof e.tournamentName !== 'string' ||
      (e.division !== 'Solo' && e.division !== 'Duo' && e.division !== 'Squad') ||
      typeof e.date !== 'string' ||
      typeof e.winner !== 'string' ||
      !Array.isArray(e.finalRankings) ||
      typeof e.prizeDistribution !== 'string' ||
      typeof e.summary !== 'string' ||
      (e.published !== undefined && typeof e.published !== 'boolean')
    ) {
      return false;
    }
    return e.finalRankings.every(
      (row) =>
        isPlainObject(row) &&
        typeof row.rank === 'number' &&
        typeof row.teamOrPlayer === 'string' &&
        typeof row.totalPoints === 'number' &&
        typeof row.prize === 'string'
    );
  });
}

export function isValidNewsData(data: unknown): data is NewsData {
  if (!isPlainObject(data) || containsSecretMaterial(data) || containsPrivateSheetReference(data)) {
    return false;
  }
  if (
    typeof data.schemaVersion !== 'number' ||
    typeof data.lastUpdated !== 'string' ||
    !Array.isArray(data.entries)
  ) {
    return false;
  }
  return data.entries.every((e): e is NewsArticle => {
    if (!isPlainObject(e)) return false;
    return (
      typeof e.id === 'string' &&
      typeof e.title === 'string' &&
      typeof e.description === 'string' &&
      typeof e.publishedDate === 'string' &&
      typeof e.banner === 'string' &&
      typeof e.externalUrl === 'string' &&
      typeof e.category === 'string' &&
      ALLOWED_NEWS_CATEGORIES.has(e.category) &&
      typeof e.pinned === 'boolean' &&
      (e.published === undefined || typeof e.published === 'boolean') &&
      (e.archived === undefined || typeof e.archived === 'boolean')
    );
  });
}

/**
 * Validates a TournamentResultEntry before saving or publishing.
 */
export function validateResultEntry(entry: TournamentResultEntry): string[] {
  const errors: string[] = [];
  if (!entry.id.trim()) errors.push('Result ID is required.');
  if (!entry.tournamentName.trim()) errors.push('Tournament Name is required.');

  const dateCheck = validateIsoDateString(entry.date, 'Result Date', false);
  if (!dateCheck.valid && dateCheck.error) errors.push(dateCheck.error);

  if (!entry.winner.trim()) errors.push('Winner / Champion name is required.');
  if (entry.division !== 'Solo' && entry.division !== 'Duo' && entry.division !== 'Squad') {
    errors.push('Result division must be Solo, Duo, or Squad.');
  }
  for (const row of entry.finalRankings) {
    if (!Number.isFinite(row.rank) || row.rank < 1) {
      errors.push('Every final ranking row requires a valid rank >= 1.');
      break;
    }
    if (!Number.isFinite(row.totalPoints) || row.totalPoints < 0) {
      errors.push(`Rank #${row.rank} points must be a non-negative number.`);
      break;
    }
    if (!row.teamOrPlayer.trim()) {
      errors.push(`Rank #${row.rank} is missing a Team / Player name.`);
      break;
    }
  }
  return errors;
}

/**
 * Validates a NewsArticle before saving or publishing.
 */
export function validateNewsArticle(article: NewsArticle): string[] {
  const errors: string[] = [];
  if (!article.id.trim()) errors.push('Announcement ID is required.');
  if (!article.title.trim()) errors.push('Announcement Title is required.');
  if (!article.description.trim()) errors.push('Announcement Description is required.');

  const dateCheck = validateIsoDateString(article.publishedDate, 'Published Date', false);
  if (!dateCheck.valid && dateCheck.error) errors.push(dateCheck.error);

  if (!ALLOWED_NEWS_CATEGORIES.has(article.category)) {
    errors.push('Unsupported announcement category.');
  }

  const bannerCheck = validateImageAssetUrl(article.banner, 'Banner Image URL');
  if (!bannerCheck.valid && bannerCheck.error) errors.push(bannerCheck.error);

  const extCheck = validateHttpsUrl(article.externalUrl, 'External Link URL');
  if (!extCheck.valid && extCheck.error) errors.push(extCheck.error);

  return errors;
}

/**
 * Validates SiteConfigData (Hero, Ticker, About, Community Social Links, Terms) inside Admin.
 */
export function validateSiteConfigForAdmin(config: SiteConfigData): string[] {
  const errors: string[] = [];
  if (containsSecretMaterial(config)) {
    errors.push('Site settings contain secret-like token patterns.');
  }
  if (containsPrivateSheetReference(config)) {
    errors.push('Private Google Sheet URLs are not allowed in public Site Settings.');
  }
  if (!config.brandName.trim()) errors.push('Brand Name cannot be empty.');
  if (!config.tagline.trim()) errors.push('Hero Tagline cannot be empty.');
  if (!config.heroDescription.trim()) errors.push('Hero Description cannot be empty.');
  if (config.tickerAnnouncement.length > 300) {
    errors.push('Ticker announcement must stay within 300 characters.');
  }

  if (!config.about.heading.trim()) errors.push('About Heading cannot be empty.');
  if (!config.about.vision.trim()) errors.push('Community Vision statement cannot be empty.');
  if (
    config.about.paragraphs.length === 0 ||
    config.about.paragraphs.some((p) => !p.trim())
  ) {
    errors.push('About paragraphs cannot contain empty entries.');
  }
  if (
    config.about.pillars.length === 0 ||
    config.about.pillars.some((p) => !p.title.trim() || !p.description.trim())
  ) {
    errors.push('Every About pillar requires both a Title and Description.');
  }
  if (
    config.whyJoin.length === 0 ||
    config.whyJoin.some((card) => !card.title.trim() || !card.description.trim())
  ) {
    errors.push('Every Why Join card requires both a Title and Description.');
  }

  const linkChecks: Array<[string, string]> = [
    [config.community.whatsappCommunityUrl, 'WhatsApp Community URL'],
    [config.community.whatsappChannelUrl ?? '', 'WhatsApp Channel URL'],
    [config.community.whatsappContactUrl, 'WhatsApp Contact URL'],
    [config.community.instagramUrl, 'Instagram URL'],
    [config.community.youtubeUrl, 'YouTube URL'],
    [config.community.discordUrl, 'Discord URL'],
  ];
  for (const [raw, label] of linkChecks) {
    const res = validateHttpsUrl(raw, label);
    if (!res.valid && res.error) errors.push(res.error);
  }

  const email = config.community.contactEmail.trim();
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) {
    errors.push('Contact Email must be a valid email address or left blank.');
  }

  const seenIds = new Set<string>();
  config.termsSections.forEach((sec, idx) => {
    const id = sec.id.trim();
    if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
      errors.push(`Terms Section #${idx + 1} ID may only contain letters, numbers, "-" or "_".`);
    } else if (seenIds.has(id)) {
      errors.push(`Duplicate Terms Section ID "${id}".`);
    } else {
      seenIds.add(id);
    }
    if (!sec.title.trim()) errors.push(`Terms Section #${idx + 1} Title is required.`);
    if (!sec.content.trim()) errors.push(`Terms Section #${idx + 1} Content is required.`);
  });

  return errors;
}

const SECRET_PATTERN =
  /((?:ghp|gho|ghu|ghs)_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|AKIA[0-9A-Z]{16}|pbkdf2_sha256\$|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|xox[baprs]-[A-Za-z0-9-]{10,}|Bearer\s+[A-Za-z0-9\-._~+/]+=*)/;

/**
 * Scans serialized payload text for accidental secret/credential strings.
 */
export function containsSecretMaterial(value: unknown): boolean {
  try {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    return SECRET_PATTERN.test(serialized);
  } catch {
    return true;
  }
}
