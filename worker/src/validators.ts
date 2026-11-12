import { validateAdminUsername, validatePasswordPolicy } from './auth.ts';
import type {
  AdminContentBundle,
  NewsArticle,
  PrivateSheetEntry,
  SiteConfigData,
  TournamentFormat,
  TournamentLifecycleStatus,
  TournamentRecord,
  TournamentResultEntry,
} from './types.ts';

/**
 * Only these permitted repository JSON files can ever be updated through the Admin Worker.
 * Leaderboard and Match Schedule files are intentionally excluded per scope policy.
 */
export const ALLOWED_CONTENT_FILES = {
  tournaments: 'public/data/tournaments.json',
  results: 'public/data/results.json',
  news: 'public/data/news.json',
  siteConfig: 'public/data/site-config.json',
} as const;

const ALLOWED_REPO_PATHS = new Set<string>(Object.values(ALLOWED_CONTENT_FILES));
const ALLOWED_TOP_LEVEL_KEYS = new Set([
  'tournaments',
  'results',
  'news',
  'siteConfig',
  'commitMessage',
]);
const ALLOWED_TOURNAMENTS_WRAPPER_KEYS = new Set(['schemaVersion', 'lastUpdated', 'tournaments']);
const ALLOWED_ENTRIES_WRAPPER_KEYS = new Set(['schemaVersion', 'lastUpdated', 'entries']);
const ALLOWED_SITE_CONFIG_KEYS = new Set([
  'schemaVersion',
  'lastUpdated',
  'brandName',
  'tagline',
  'heroDescription',
  'tickerAnnouncement',
  'whyJoin',
  'about',
  'community',
  'termsSections',
]);
const ALLOWED_SITE_CARD_KEYS = new Set(['title', 'description']);
const ALLOWED_ABOUT_KEYS = new Set(['heading', 'paragraphs', 'pillars', 'vision']);
const ALLOWED_COMMUNITY_KEYS = new Set([
  'whatsappCommunityUrl',
  'whatsappChannelUrl',
  'whatsappContactUrl',
  'instagramUrl',
  'youtubeUrl',
  'discordUrl',
  'contactEmail',
]);
const ALLOWED_TERMS_SECTION_KEYS = new Set(['id', 'title', 'content']);
const ALLOWED_TOURNAMENT_KEYS = new Set([
  'id',
  'slug',
  'title',
  'season',
  'description',
  'game',
  'format',
  'mode',
  'matchFormat',
  'map',
  'banner',
  'thumbnail',
  'matchesCount',
  'teamSize',
  'eligibleDevices',
  'eligibility',
  'squadDetails',
  'registration',
  'schedule',
  'prizes',
  'rules',
  'status',
  'published',
  'featured',
]);
const ALLOWED_SQUAD_DETAILS_KEYS = new Set([
  'teamRequirements',
  'captainRequirements',
  'playerRequirements',
]);
const ALLOWED_REGISTRATION_KEYS = new Set([
  'status',
  'formUrl',
  'buttonText',
  'openingDate',
  'closingDate',
  'closingMessage',
  'whatsappCommunityUrl',
  'instructions',
  'additionalInstructions',
]);
const ALLOWED_SCHEDULE_KEYS = new Set(['date', 'reportingTime', 'startTime', 'timezone']);
const ALLOWED_PRIZES_KEYS = new Set(['entryFee', 'totalPrizePool', 'first', 'second', 'third', 'other']);
const ALLOWED_RESULT_KEYS = new Set([
  'id',
  'tournamentId',
  'tournamentName',
  'division',
  'date',
  'winner',
  'finalRankings',
  'prizeDistribution',
  'summary',
  'published',
]);
const ALLOWED_RANKING_ROW_KEYS = new Set(['rank', 'teamOrPlayer', 'totalPoints', 'prize']);
const ALLOWED_NEWS_KEYS = new Set([
  'id',
  'title',
  'description',
  'publishedDate',
  'banner',
  'externalUrl',
  'category',
  'pinned',
  'published',
  'archived',
]);
const ALLOWED_LOGIN_KEYS = new Set(['username', 'password']);
const ALLOWED_SETUP_KEYS = new Set(['setupToken', 'username', 'password']);
const ALLOWED_CHANGE_ID_KEYS = new Set(['currentPassword', 'newUsername']);
const ALLOWED_CHANGE_PASSWORD_KEYS = new Set(['currentPassword', 'newPassword']);
const ALLOWED_GENERATE_ID_KEYS = new Set(['format', 'existingIds']);
const ALLOWED_PRIVATE_CONFIG_KEYS = new Set(['sheetsByTournamentId']);
const ALLOWED_PRIVATE_SHEET_ENTRY_KEYS = new Set(['sheetUrl', 'notes', 'updatedAt']);
const FORBIDDEN_PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

const ALLOWED_GOOGLE_FORM_HOSTS = new Set(['docs.google.com', 'www.docs.google.com', 'forms.gle']);
const ALLOWED_LIFECYCLE_STATUSES = new Set<TournamentLifecycleStatus>([
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

const CONTROL_CHAR_PATTERN = /[\x00-\x1f\x7f]/;
const IMAGE_EXT_PATTERN = /\.(?:jpg|jpeg|png|webp|avif|svg)(?:[?#].*)?$/i;
const SAFE_WORKER_MEDIA_PATH = /^\/api\/media\/[A-Za-z0-9._/-]+\.(?:jpg|jpeg|png|webp|avif)$/i;

const SECRET_PATTERN =
  /(ghp_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|gh[ours]_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|pbkdf2_sha256\$\d+\$[^$\s]+\$[^$\s]+|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/;
const PRIVATE_SHEET_REF_PATTERN = /(?:docs\.google\.com\/spreadsheets|sheets\.googleapis\.com)/i;

export function assertPermittedRepoPath(repoPath: string): void {
  if (!ALLOWED_REPO_PATHS.has(repoPath)) {
    throw new Error(`Forbidden repository write target blocked: "${repoPath}".`);
  }
}

export function containsSecretMaterial(value: unknown): boolean {
  try {
    return SECRET_PATTERN.test(JSON.stringify(value));
  } catch {
    return true;
  }
}

export function containsPrivateSheetReference(value: unknown): boolean {
  try {
    return PRIVATE_SHEET_REF_PATTERN.test(JSON.stringify(value));
  } catch {
    return true;
  }
}

export function validateGoogleSheetUrl(raw: string, allowEmpty = true): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return allowEmpty ? null : 'Google Sheet URL cannot be empty.';
  }
  if (trimmed.length > 2048 || CONTROL_CHAR_PATTERN.test(trimmed)) {
    return 'Google Sheet URL contains invalid control characters or exceeds length limit.';
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Invalid Google Sheet URL format.';
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    return 'Google Sheet URL must use https:// without embedded credentials.';
  }
  const host = parsed.hostname.toLowerCase();
  if (
    (host !== 'docs.google.com' && host !== 'www.docs.google.com') ||
    !parsed.pathname.startsWith('/spreadsheets/') ||
    parsed.pathname.length <= '/spreadsheets/'.length
  ) {
    return 'Only https://docs.google.com/spreadsheets/... URLs are supported.';
  }
  return null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function checkAllowedObjectKeys(
  value: unknown,
  allowedKeys: Set<string>,
  label: string
): string[] {
  if (!isPlainRecord(value)) {
    return [`${label} must be an object.`];
  }
  const ownKeys = Object.getOwnPropertyNames(value);
  for (const key of ownKeys) {
    if (FORBIDDEN_PROTO_KEYS.has(key)) {
      return [`${label} contains forbidden property "${key}".`];
    }
    if (!allowedKeys.has(key)) {
      return [`${label} contains unsupported field "${key}".`];
    }
  }
  return [];
}

function validateIsoDate(raw: unknown, label: string, allowTbaOrEmpty = false): string | null {
  if (typeof raw !== 'string') return `${label} must be a string.`;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toUpperCase() === 'TBA') {
    return allowTbaOrEmpty ? null : `${label} must be a valid YYYY-MM-DD date.`;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) return `${label} must follow YYYY-MM-DD format.`;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    return `${label} is not a valid calendar date.`;
  }
  return null;
}

export function validateGoogleFormUrl(raw: string, allowEmpty = true): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return allowEmpty ? null : 'Google Form URL cannot be empty.';
  }
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    return 'Google Form URL contains invalid control characters.';
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return 'Invalid Google Form URL format.';
  }

  if (parsed.protocol !== 'https:') {
    return 'Google Form URL must use https://.';
  }
  if (parsed.username || parsed.password) {
    return 'Google Form URL must not contain embedded credentials.';
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_GOOGLE_FORM_HOSTS.has(host)) {
    return 'Domain not allowed. Use docs.google.com/forms or forms.gle.';
  }

  if (
    (host === 'docs.google.com' || host === 'www.docs.google.com') &&
    !(parsed.pathname.startsWith('/forms/') && parsed.pathname.length > '/forms/'.length)
  ) {
    return 'docs.google.com URL must target a /forms/ path.';
  }

  if (host === 'forms.gle' && parsed.pathname.length <= 1) {
    return 'forms.gle URL must include the form ID path.';
  }

  return null;
}

function validateHttpsUrl(raw: string, label: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    return `${label} contains invalid control characters.`;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:') {
      return `${label} must start with https://.`;
    }
    if (parsed.username || parsed.password) {
      return `${label} must not contain embedded credentials.`;
    }
    return null;
  } catch {
    return `${label} is not a valid URL.`;
  }
}

function validateImageUrl(raw: string, label: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (CONTROL_CHAR_PATTERN.test(trimmed)) {
    return `${label} contains invalid control characters.`;
  }
  if (trimmed.startsWith('./') || trimmed.startsWith('/')) {
    if (trimmed.includes('..') || trimmed.includes('\\') || trimmed.includes('<') || trimmed.includes('>')) {
      return `${label} contains unsafe relative path characters.`;
    }
    if (trimmed.startsWith('/api/media/') && SAFE_WORKER_MEDIA_PATH.test(trimmed)) {
      return null;
    }
    if (!IMAGE_EXT_PATTERN.test(trimmed)) {
      return `${label} relative asset must point to a .jpg, .jpeg, .png, .webp, .avif, or .svg image.`;
    }
    return null;
  }
  return validateHttpsUrl(trimmed, label);
}

function checkStringField(
  val: unknown,
  label: string,
  options: { required?: boolean; maxLen?: number } = {}
): string | null {
  if (typeof val !== 'string') return `${label} must be a string.`;
  const maxLen = options.maxLen ?? 1000;
  if (val.length > maxLen) return `${label} exceeds maximum length of ${maxLen} characters.`;
  if (options.required && !val.trim()) return `${label} cannot be empty.`;
  return null;
}

function validateStringArray(val: unknown, label: string, maxItems = 30, maxLen = 400): string[] {
  if (!Array.isArray(val)) return [`${label} must be an array.`];
  if (val.length > maxItems) return [`${label} exceeds maximum item limit (${maxItems}).`];
  for (let i = 0; i < val.length; i += 1) {
    if (typeof val[i] !== 'string' || !val[i].trim() || val[i].length > maxLen) {
      return [`${label} item #${i + 1} must be a non-empty string under ${maxLen} chars.`];
    }
  }
  return [];
}

function validateTournament(t: TournamentRecord, seenIds: Set<string>, seenSlugs: Set<string>): string[] {
  const keyErrors = checkAllowedObjectKeys(t, ALLOWED_TOURNAMENT_KEYS, 'Tournament entry');
  if (keyErrors.length > 0) return keyErrors;

  const errors: string[] = [];
  const id = String(t.id ?? '').trim();
  const slug = String(t.slug ?? '').trim();
  if (!id || id.length > 80 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    errors.push(`Invalid tournament ID "${id}".`);
  } else if (seenIds.has(id)) {
    errors.push(`Duplicate tournament ID "${id}".`);
  } else {
    seenIds.add(id);
  }

  if (!slug || slug.length > 100 || !/^[a-z0-9-]+$/.test(slug)) {
    errors.push(`Invalid tournament slug "${slug}".`);
  } else if (seenSlugs.has(slug)) {
    errors.push(`Duplicate tournament slug "${slug}".`);
  } else {
    seenSlugs.add(slug);
  }

  const isPublishedEvent =
    t.status !== 'draft' && t.status !== 'archived' && t.published !== false;

  for (const err of [
    checkStringField(t.title, `Tournament "${id}" title`, { required: true, maxLen: 160 }),
    checkStringField(t.description, `Tournament "${id}" description`, {
      required: isPublishedEvent,
      maxLen: 4000,
    }),
    checkStringField(t.game, `Tournament "${id}" game`, { required: true, maxLen: 80 }),
    checkStringField(t.map, `Tournament "${id}" map`, {
      required: isPublishedEvent,
      maxLen: 160,
    }),
    checkStringField(t.teamSize, `Tournament "${id}" teamSize`, {
      required: isPublishedEvent,
      maxLen: 120,
    }),
    checkStringField(t.eligibleDevices, `Tournament "${id}" eligibleDevices`, {
      required: isPublishedEvent,
      maxLen: 160,
    }),
  ]) {
    if (err) errors.push(err);
  }

  if (t.season !== undefined) {
    const seasonErr = checkStringField(t.season, `Tournament "${id}" season`, { maxLen: 80 });
    if (seasonErr) errors.push(seasonErr);
  }
  if (t.matchFormat !== undefined) {
    const mfErr = checkStringField(t.matchFormat, `Tournament "${id}" matchFormat`, { maxLen: 120 });
    if (mfErr) errors.push(mfErr);
  }
  if (t.published !== undefined && typeof t.published !== 'boolean') {
    errors.push(`Tournament "${id}" published flag must be boolean.`);
  }

  if (t.format !== 'Solo' && t.format !== 'Duo' && t.format !== 'Squad') {
    errors.push(`Tournament "${id}" format must be Solo, Duo, or Squad.`);
  }
  if (t.mode !== 'TPP' && t.mode !== 'FPP') {
    errors.push(`Tournament "${id}" mode must be TPP or FPP.`);
  }
  if (!ALLOWED_LIFECYCLE_STATUSES.has(t.status)) {
    errors.push(`Tournament "${id}" has invalid lifecycle status "${String(t.status)}".`);
  }
  if (typeof t.featured !== 'boolean') {
    errors.push(`Tournament "${id}" featured flag must be boolean.`);
  }
  if (
    typeof t.matchesCount !== 'number' ||
    !Number.isInteger(t.matchesCount) ||
    t.matchesCount < 1 ||
    t.matchesCount > 50
  ) {
    errors.push(`Tournament "${id}" matchesCount must be an integer between 1 and 50.`);
  }

  const bannerErr = validateImageUrl(String(t.banner ?? ''), `Tournament "${id}" banner`);
  if (bannerErr) errors.push(bannerErr);

  const thumbErr = validateImageUrl(String(t.thumbnail ?? ''), `Tournament "${id}" thumbnail`);
  if (thumbErr) errors.push(thumbErr);

  errors.push(...validateStringArray(t.eligibility, `Tournament "${id}" eligibility`));
  errors.push(...validateStringArray(t.rules, `Tournament "${id}" rules`));

  if (t.squadDetails !== undefined) {
    errors.push(
      ...checkAllowedObjectKeys(
        t.squadDetails,
        ALLOWED_SQUAD_DETAILS_KEYS,
        `Tournament "${id}" squadDetails`
      )
    );
    if (isPlainRecord(t.squadDetails)) {
      for (const k of ['teamRequirements', 'captainRequirements', 'playerRequirements'] as const) {
        const msg = checkStringField(t.squadDetails[k], `Tournament "${id}" squadDetails.${k}`, {
          maxLen: 600,
        });
        if (msg) errors.push(msg);
      }
    }
  }

  // Registration block
  errors.push(
    ...checkAllowedObjectKeys(t.registration, ALLOWED_REGISTRATION_KEYS, `Tournament "${id}" registration`)
  );
  if (isPlainRecord(t.registration)) {
    if (
      t.registration.status !== 'open' &&
      t.registration.status !== 'closed' &&
      t.registration.status !== 'full'
    ) {
      errors.push(`Tournament "${id}" registration.status must be open, closed, or full.`);
    }
    const formUrl = String(t.registration.formUrl ?? '');
    const formErr = validateGoogleFormUrl(formUrl, true);
    if (formErr) errors.push(`Tournament "${id}": ${formErr}`);

    if (
      t.registration.status === 'open' &&
      t.status === 'registration_open' &&
      t.published !== false &&
      !formUrl.trim()
    ) {
      errors.push(
        `Tournament "${id}" is marked registration_open with open registration, but Google Form URL is empty.`
      );
    }

    const openDateErr = validateIsoDate(
      t.registration.openingDate,
      `Tournament "${id}" openingDate`,
      true
    );
    if (openDateErr) errors.push(openDateErr);
    const closeDateErr = validateIsoDate(
      t.registration.closingDate,
      `Tournament "${id}" closingDate`,
      true
    );
    if (closeDateErr) errors.push(closeDateErr);

    const waErr = validateHttpsUrl(
      String(t.registration.whatsappCommunityUrl ?? ''),
      `Tournament "${id}" WhatsApp URL`
    );
    if (waErr) errors.push(waErr);

    for (const k of ['buttonText', 'instructions'] as const) {
      const msg = checkStringField(t.registration[k], `Tournament "${id}" registration.${k}`, {
        maxLen: 800,
      });
      if (msg) errors.push(msg);
    }
    if (t.registration.closingMessage !== undefined) {
      const msg = checkStringField(
        t.registration.closingMessage,
        `Tournament "${id}" registration.closingMessage`,
        { maxLen: 400 }
      );
      if (msg) errors.push(msg);
    }
    if (t.registration.additionalInstructions !== undefined) {
      const msg = checkStringField(
        t.registration.additionalInstructions,
        `Tournament "${id}" registration.additionalInstructions`,
        { maxLen: 1000 }
      );
      if (msg) errors.push(msg);
    }
  }

  // Schedule block
  errors.push(
    ...checkAllowedObjectKeys(t.schedule, ALLOWED_SCHEDULE_KEYS, `Tournament "${id}" schedule`)
  );
  if (isPlainRecord(t.schedule)) {
    const dateErr = validateIsoDate(t.schedule.date, `Tournament "${id}" schedule.date`, true);
    if (dateErr) errors.push(dateErr);
    for (const k of ['reportingTime', 'startTime', 'timezone'] as const) {
      const msg = checkStringField(t.schedule[k], `Tournament "${id}" schedule.${k}`, {
        maxLen: 120,
      });
      if (msg) errors.push(msg);
    }
  }

  // Prizes block
  errors.push(...checkAllowedObjectKeys(t.prizes, ALLOWED_PRIZES_KEYS, `Tournament "${id}" prizes`));
  if (isPlainRecord(t.prizes)) {
    for (const k of ['entryFee', 'totalPrizePool', 'first', 'second', 'third', 'other'] as const) {
      const msg = checkStringField(t.prizes[k], `Tournament "${id}" prizes.${k}`, { maxLen: 200 });
      if (msg) errors.push(msg);
    }
  }

  return errors;
}

function validateResult(entry: TournamentResultEntry, seenIds: Set<string>): string[] {
  const keyErrors = checkAllowedObjectKeys(entry, ALLOWED_RESULT_KEYS, 'Result entry');
  if (keyErrors.length > 0) return keyErrors;

  const errors: string[] = [];
  const id = String(entry.id ?? '').trim();
  if (!id || id.length > 80 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    errors.push(`Invalid result ID "${id}".`);
  } else if (seenIds.has(id)) {
    errors.push(`Duplicate result ID "${id}".`);
  } else {
    seenIds.add(id);
  }

  if (entry.tournamentId !== undefined && typeof entry.tournamentId !== 'string') {
    errors.push(`Result "${id}" tournamentId must be a string.`);
  }
  if (entry.published !== undefined && typeof entry.published !== 'boolean') {
    errors.push(`Result "${id}" published flag must be a boolean.`);
  }

  for (const err of [
    checkStringField(entry.tournamentName, `Result "${id}" tournamentName`, { required: true, maxLen: 160 }),
    checkStringField(entry.winner, `Result "${id}" winner`, { required: true, maxLen: 160 }),
    checkStringField(entry.prizeDistribution, `Result "${id}" prizeDistribution`, { maxLen: 400 }),
    checkStringField(entry.summary, `Result "${id}" summary`, { maxLen: 2000 }),
  ]) {
    if (err) errors.push(err);
  }

  if (entry.division !== 'Solo' && entry.division !== 'Duo' && entry.division !== 'Squad') {
    errors.push(`Result "${id}" division must be Solo, Duo, or Squad.`);
  }

  const dateErr = validateIsoDate(entry.date, `Result "${id}" date`, false);
  if (dateErr) errors.push(dateErr);

  if (!Array.isArray(entry.finalRankings) || entry.finalRankings.length > 100) {
    errors.push(`Result "${id}" finalRankings must be an array of at most 100 rows.`);
  } else {
    entry.finalRankings.forEach((row, idx) => {
      errors.push(
        ...checkAllowedObjectKeys(row, ALLOWED_RANKING_ROW_KEYS, `Result "${id}" row #${idx + 1}`)
      );
      if (isPlainRecord(row)) {
        if (typeof row.rank !== 'number' || !Number.isInteger(row.rank) || row.rank < 1 || row.rank > 100) {
          errors.push(`Result "${id}" row #${idx + 1} rank must be integer 1..100.`);
        }
        if (
          typeof row.totalPoints !== 'number' ||
          !Number.isFinite(row.totalPoints) ||
          row.totalPoints < 0 ||
          row.totalPoints > 10000
        ) {
          errors.push(`Result "${id}" row #${idx + 1} totalPoints must be finite >= 0.`);
        }
        const nameErr = checkStringField(row.teamOrPlayer, `Result "${id}" row #${idx + 1} name`, {
          required: true,
          maxLen: 120,
        });
        if (nameErr) errors.push(nameErr);
        const prizeErr = checkStringField(row.prize, `Result "${id}" row #${idx + 1} prize`, {
          maxLen: 120,
        });
        if (prizeErr) errors.push(prizeErr);
      }
    });
  }

  return errors;
}

export function validateNews(article: NewsArticle, seenIds: Set<string>): string[] {
  const keyErrors = checkAllowedObjectKeys(article, ALLOWED_NEWS_KEYS, 'News entry');
  if (keyErrors.length > 0) return keyErrors;

  const errors: string[] = [];
  const id = String(article.id ?? '').trim();
  if (!id || id.length > 80 || !/^[A-Za-z0-9_-]+$/.test(id)) {
    errors.push(`Invalid news ID "${id}".`);
  } else if (seenIds.has(id)) {
    errors.push(`Duplicate news ID "${id}".`);
  } else {
    seenIds.add(id);
  }

  if (typeof article.pinned !== 'boolean') {
    errors.push(`News "${id}" pinned flag must be a boolean.`);
  }
  if (article.published !== undefined && typeof article.published !== 'boolean') {
    errors.push(`News "${id}" published flag must be a boolean.`);
  }
  if (article.archived !== undefined && typeof article.archived !== 'boolean') {
    errors.push(`News "${id}" archived flag must be a boolean.`);
  }

  for (const err of [
    checkStringField(article.title, `News "${id}" title`, { required: true, maxLen: 160 }),
    checkStringField(article.description, `News "${id}" description`, { required: true, maxLen: 4000 }),
  ]) {
    if (err) errors.push(err);
  }

  const dateErr = validateIsoDate(article.publishedDate, `News "${id}" publishedDate`, false);
  if (dateErr) errors.push(dateErr);

  if (!ALLOWED_NEWS_CATEGORIES.has(article.category)) {
    errors.push(`News "${id}" has unsupported category "${String(article.category)}".`);
  }

  const bannerErr = validateImageUrl(String(article.banner ?? ''), `News "${id}" banner`);
  if (bannerErr) errors.push(bannerErr);

  const extErr = validateHttpsUrl(String(article.externalUrl ?? ''), `News "${id}" external URL`);
  if (extErr) errors.push(extErr);

  return errors;
}

export function validateLoginPayload(rawBody: unknown): {
  valid: boolean;
  error?: string;
  username?: string;
  password?: string;
} {
  const keyErrors = checkAllowedObjectKeys(rawBody, ALLOWED_LOGIN_KEYS, 'Login payload');
  if (keyErrors.length > 0) {
    return { valid: false, error: keyErrors[0] };
  }
  const record = rawBody as Record<string, unknown>;
  if (typeof record.username !== 'string' || typeof record.password !== 'string') {
    return { valid: false, error: 'username and password must be strings.' };
  }
  const username = record.username.trim();
  const password = record.password;
  if (!username || !password) {
    return { valid: false, error: 'username and password are required.' };
  }
  if (username.length > 128 || password.length > 256) {
    return { valid: false, error: 'Credential exceeds maximum allowed length.' };
  }
  return { valid: true, username, password };
}

function validateEmailAddress(raw: unknown, label: string): string | null {
  if (typeof raw !== 'string') return `${label} must be a string.`;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > 120) return `${label} exceeds 120 characters.`;
  if (CONTROL_CHAR_PATTERN.test(trimmed) || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(trimmed)) {
    return `${label} must be a valid email address.`;
  }
  return null;
}

export function validateSiteConfigData(rawSiteConfig: unknown): string[] {
  const topKeyErrors = checkAllowedObjectKeys(
    rawSiteConfig,
    ALLOWED_SITE_CONFIG_KEYS,
    'siteConfig'
  );
  if (topKeyErrors.length > 0) return topKeyErrors;

  const cfg = rawSiteConfig as SiteConfigData;
  const errors: string[] = [];

  if (
    typeof cfg.schemaVersion !== 'number' ||
    !Number.isInteger(cfg.schemaVersion) ||
    cfg.schemaVersion < 1 ||
    cfg.schemaVersion > 10
  ) {
    errors.push('siteConfig.schemaVersion must be an integer between 1 and 10.');
  }
  if (typeof cfg.lastUpdated !== 'string') {
    errors.push('siteConfig.lastUpdated must be a string.');
  }

  for (const err of [
    checkStringField(cfg.brandName, 'siteConfig.brandName', { required: true, maxLen: 80 }),
    checkStringField(cfg.tagline, 'siteConfig.tagline', { required: true, maxLen: 140 }),
    checkStringField(cfg.heroDescription, 'siteConfig.heroDescription', { required: true, maxLen: 600 }),
    checkStringField(cfg.tickerAnnouncement, 'siteConfig.tickerAnnouncement', { maxLen: 300 }),
  ]) {
    if (err) errors.push(err);
  }

  if (!Array.isArray(cfg.whyJoin) || cfg.whyJoin.length > 8) {
    errors.push('siteConfig.whyJoin must be an array with at most 8 items.');
  } else {
    cfg.whyJoin.forEach((item, idx) => {
      const itemErrs = checkAllowedObjectKeys(
        item,
        ALLOWED_SITE_CARD_KEYS,
        `siteConfig.whyJoin[${idx}]`
      );
      if (itemErrs.length > 0) {
        errors.push(...itemErrs);
        return;
      }
      for (const err of [
        checkStringField(item.title, `siteConfig.whyJoin[${idx}].title`, { required: true, maxLen: 80 }),
        checkStringField(item.description, `siteConfig.whyJoin[${idx}].description`, {
          required: true,
          maxLen: 320,
        }),
      ]) {
        if (err) errors.push(err);
      }
    });
  }

  const aboutErrs = checkAllowedObjectKeys(cfg.about, ALLOWED_ABOUT_KEYS, 'siteConfig.about');
  if (aboutErrs.length > 0) {
    errors.push(...aboutErrs);
  } else {
    for (const err of [
      checkStringField(cfg.about.heading, 'siteConfig.about.heading', { required: true, maxLen: 120 }),
      checkStringField(cfg.about.vision, 'siteConfig.about.vision', { required: true, maxLen: 400 }),
    ]) {
      if (err) errors.push(err);
    }
    errors.push(...validateStringArray(cfg.about.paragraphs, 'siteConfig.about.paragraphs', 6, 600));
    if (!Array.isArray(cfg.about.pillars) || cfg.about.pillars.length > 6) {
      errors.push('siteConfig.about.pillars must be an array with at most 6 items.');
    } else {
      cfg.about.pillars.forEach((pillar, idx) => {
        const pErrs = checkAllowedObjectKeys(
          pillar,
          ALLOWED_SITE_CARD_KEYS,
          `siteConfig.about.pillars[${idx}]`
        );
        if (pErrs.length > 0) {
          errors.push(...pErrs);
          return;
        }
        for (const err of [
          checkStringField(pillar.title, `siteConfig.about.pillars[${idx}].title`, {
            required: true,
            maxLen: 80,
          }),
          checkStringField(pillar.description, `siteConfig.about.pillars[${idx}].description`, {
            required: true,
            maxLen: 320,
          }),
        ]) {
          if (err) errors.push(err);
        }
      });
    }
  }

  const communityErrs = checkAllowedObjectKeys(
    cfg.community,
    ALLOWED_COMMUNITY_KEYS,
    'siteConfig.community'
  );
  if (communityErrs.length > 0) {
    errors.push(...communityErrs);
  } else {
    const urlFields: Array<[unknown, string]> = [
      [cfg.community.whatsappCommunityUrl, 'siteConfig.community.whatsappCommunityUrl'],
      [cfg.community.whatsappChannelUrl ?? '', 'siteConfig.community.whatsappChannelUrl'],
      [cfg.community.whatsappContactUrl, 'siteConfig.community.whatsappContactUrl'],
      [cfg.community.instagramUrl, 'siteConfig.community.instagramUrl'],
      [cfg.community.youtubeUrl, 'siteConfig.community.youtubeUrl'],
      [cfg.community.discordUrl, 'siteConfig.community.discordUrl'],
    ];
    for (const [val, label] of urlFields) {
      if (typeof val !== 'string') {
        errors.push(`${label} must be a string.`);
      } else {
        const err = validateHttpsUrl(val, label);
        if (err) errors.push(err);
      }
    }
    const emailErr = validateEmailAddress(cfg.community.contactEmail, 'siteConfig.community.contactEmail');
    if (emailErr) errors.push(emailErr);
  }

  if (!Array.isArray(cfg.termsSections) || cfg.termsSections.length > 20) {
    errors.push('siteConfig.termsSections must be an array with at most 20 items.');
  } else {
    const seenTermIds = new Set<string>();
    cfg.termsSections.forEach((sec, idx) => {
      const sErrs = checkAllowedObjectKeys(
        sec,
        ALLOWED_TERMS_SECTION_KEYS,
        `siteConfig.termsSections[${idx}]`
      );
      if (sErrs.length > 0) {
        errors.push(...sErrs);
        return;
      }
      const id = String(sec.id ?? '').trim();
      if (!id || id.length > 60 || !/^[A-Za-z0-9_-]+$/.test(id)) {
        errors.push(`siteConfig.termsSections[${idx}].id is invalid.`);
      } else if (seenTermIds.has(id)) {
        errors.push(`Duplicate termsSection id "${id}".`);
      } else {
        seenTermIds.add(id);
      }
      for (const err of [
        checkStringField(sec.title, `siteConfig.termsSections[${idx}].title`, {
          required: true,
          maxLen: 140,
        }),
        checkStringField(sec.content, `siteConfig.termsSections[${idx}].content`, {
          required: true,
          maxLen: 1500,
        }),
      ]) {
        if (err) errors.push(err);
      }
    });
  }

  return errors;
}

export function validateAdminContentBundle(rawBundle: unknown): {
  valid: boolean;
  errors: string[];
  bundle?: AdminContentBundle;
} {
  if (!isPlainRecord(rawBundle)) {
    return { valid: false, errors: ['Content bundle must be a JSON object.'] };
  }
  const { tournaments, results, news, siteConfig } = rawBundle;
  const errors: string[] = [];

  errors.push(...checkAllowedObjectKeys(tournaments, ALLOWED_TOURNAMENTS_WRAPPER_KEYS, 'tournaments'));
  errors.push(...checkAllowedObjectKeys(results, ALLOWED_ENTRIES_WRAPPER_KEYS, 'results'));
  errors.push(...checkAllowedObjectKeys(news, ALLOWED_ENTRIES_WRAPPER_KEYS, 'news'));
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const tObj = tournaments as AdminContentBundle['tournaments'];
  const rObj = results as AdminContentBundle['results'];
  const nObj = news as AdminContentBundle['news'];

  const validSchemaVersion = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 10;

  if (!validSchemaVersion(tObj.schemaVersion) || typeof tObj.lastUpdated !== 'string' || !Array.isArray(tObj.tournaments)) {
    errors.push('tournaments wrapper requires integer schemaVersion (1-10), string lastUpdated, and tournaments array.');
  }
  if (!validSchemaVersion(rObj.schemaVersion) || typeof rObj.lastUpdated !== 'string' || !Array.isArray(rObj.entries)) {
    errors.push('results wrapper requires integer schemaVersion (1-10), string lastUpdated, and entries array.');
  }
  if (!validSchemaVersion(nObj.schemaVersion) || typeof nObj.lastUpdated !== 'string' || !Array.isArray(nObj.entries)) {
    errors.push('news wrapper requires integer schemaVersion (1-10), string lastUpdated, and entries array.');
  }
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  if (tObj.tournaments.length > 50) errors.push('Maximum 50 tournaments supported.');
  if (rObj.entries.length > 100) errors.push('Maximum 100 result entries supported.');
  if (nObj.entries.length > 100) errors.push('Maximum 100 news entries supported.');
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const seenTourIds = new Set<string>();
  const seenTourSlugs = new Set<string>();
  for (const item of tObj.tournaments) {
    errors.push(...validateTournament(item, seenTourIds, seenTourSlugs));
  }

  const seenResIds = new Set<string>();
  for (const entry of rObj.entries) {
    errors.push(...validateResult(entry, seenResIds));
  }

  const seenNewsIds = new Set<string>();
  for (const article of nObj.entries) {
    errors.push(...validateNews(article, seenNewsIds));
  }

  if (siteConfig !== undefined) {
    errors.push(...validateSiteConfigData(siteConfig));
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    bundle: {
      tournaments: tObj,
      results: rObj,
      news: nObj,
      ...(siteConfig !== undefined ? { siteConfig: siteConfig as SiteConfigData } : {}),
    },
  };
}

export interface ValidatedAdminWrite {
  bundle: AdminContentBundle;
  commitMessage: string;
}

/**
 * Strictly validates PUT /api/admin/content payloads and blocks unauthorized modules or secret leaks.
 */
export function validateAdminContentPayload(rawBody: unknown): {
  valid: boolean;
  errors: string[];
  data?: ValidatedAdminWrite;
} {
  const topKeyErrors = checkAllowedObjectKeys(rawBody, ALLOWED_TOP_LEVEL_KEYS, 'Request body');
  if (topKeyErrors.length > 0) {
    return {
      valid: false,
      errors: [
        `Disallowed or unsupported admin modules/fields in payload: ${topKeyErrors.join(' ')}`,
      ],
    };
  }

  const record = rawBody as Record<string, unknown>;
  if (containsSecretMaterial(record)) {
    return {
      valid: false,
      errors: ['Payload rejected: potential secret token or private key detected in content.'],
    };
  }
  if (containsPrivateSheetReference(record)) {
    return {
      valid: false,
      errors: [
        'Payload rejected: private Google Sheet URLs are never permitted in public JSON files. Store private sheet tracking links in Private Organizer Settings instead.',
      ],
    };
  }

  const bundleCheck = validateAdminContentBundle({
    tournaments: record.tournaments,
    results: record.results,
    news: record.news,
    ...(record.siteConfig !== undefined ? { siteConfig: record.siteConfig } : {}),
  });
  if (!bundleCheck.valid || !bundleCheck.bundle) {
    return { valid: false, errors: bundleCheck.errors };
  }

  if (record.commitMessage !== undefined && typeof record.commitMessage !== 'string') {
    return { valid: false, errors: ['commitMessage must be a string when provided.'] };
  }

  const sanitizedMsg =
    typeof record.commitMessage === 'string' && record.commitMessage.trim()
      ? record.commitMessage.replace(/[\r\n\x00-\x1f\x7f]+/g, ' ').trim().slice(0, 160)
      : 'chore(admin): publish NexusX Esports tournament updates';

  return {
    valid: true,
    errors: [],
    data: {
      bundle: bundleCheck.bundle,
      commitMessage: sanitizedMsg,
    },
  };
}

export function validateSetupPayload(rawBody: unknown): {
  valid: boolean;
  error?: string;
  setupToken?: string;
  username?: string;
  password?: string;
} {
  const keyErrors = checkAllowedObjectKeys(rawBody, ALLOWED_SETUP_KEYS, 'Setup payload');
  if (keyErrors.length > 0) return { valid: false, error: keyErrors[0] };
  const record = rawBody as Record<string, unknown>;
  if (record.setupToken !== undefined && typeof record.setupToken !== 'string') {
    return { valid: false, error: 'setupToken must be a string when provided.' };
  }
  if (typeof record.username !== 'string' || typeof record.password !== 'string') {
    return { valid: false, error: 'username and password must be strings.' };
  }
  const userCheck = validateAdminUsername(record.username);
  if (!userCheck.valid) return { valid: false, error: userCheck.error };

  const passCheck = validatePasswordPolicy(record.password, userCheck.normalized);
  if (!passCheck.valid) return { valid: false, error: passCheck.error };

  return {
    valid: true,
    setupToken: typeof record.setupToken === 'string' ? record.setupToken.trim() : '',
    username: userCheck.normalized,
    password: record.password,
  };
}

export function validateChangeIdPayload(rawBody: unknown): {
  valid: boolean;
  error?: string;
  currentPassword?: string;
  newUsername?: string;
} {
  const keyErrors = checkAllowedObjectKeys(rawBody, ALLOWED_CHANGE_ID_KEYS, 'Change Admin ID payload');
  if (keyErrors.length > 0) return { valid: false, error: keyErrors[0] };
  const record = rawBody as Record<string, unknown>;
  if (typeof record.currentPassword !== 'string' || !record.currentPassword) {
    return { valid: false, error: 'Current password is required.' };
  }
  if (record.currentPassword.length > 256) {
    return { valid: false, error: 'Credential exceeds maximum allowed length.' };
  }
  if (typeof record.newUsername !== 'string') {
    return { valid: false, error: 'New Admin ID must be a string.' };
  }
  const userCheck = validateAdminUsername(record.newUsername);
  if (!userCheck.valid) return { valid: false, error: userCheck.error };

  return {
    valid: true,
    currentPassword: record.currentPassword,
    newUsername: userCheck.normalized,
  };
}

export function validateChangePasswordPayload(
  rawBody: unknown,
  currentUsername: string
): {
  valid: boolean;
  error?: string;
  currentPassword?: string;
  newPassword?: string;
} {
  const keyErrors = checkAllowedObjectKeys(
    rawBody,
    ALLOWED_CHANGE_PASSWORD_KEYS,
    'Change password payload'
  );
  if (keyErrors.length > 0) return { valid: false, error: keyErrors[0] };
  const record = rawBody as Record<string, unknown>;
  if (typeof record.currentPassword !== 'string' || !record.currentPassword) {
    return { valid: false, error: 'Current password is required.' };
  }
  if (record.currentPassword.length > 256) {
    return { valid: false, error: 'Credential exceeds maximum allowed length.' };
  }
  if (typeof record.newPassword !== 'string') {
    return { valid: false, error: 'New password must be a string.' };
  }
  const passCheck = validatePasswordPolicy(record.newPassword, currentUsername);
  if (!passCheck.valid) return { valid: false, error: passCheck.error };

  return {
    valid: true,
    currentPassword: record.currentPassword,
    newPassword: record.newPassword,
  };
}

export function validateGenerateIdPayload(rawBody: unknown): {
  valid: boolean;
  error?: string;
  format?: TournamentFormat;
  existingIds?: string[];
} {
  const keyErrors = checkAllowedObjectKeys(
    rawBody,
    ALLOWED_GENERATE_ID_KEYS,
    'Generate Tournament ID payload'
  );
  if (keyErrors.length > 0) return { valid: false, error: keyErrors[0] };
  const record = rawBody as Record<string, unknown>;
  if (record.format !== 'Solo' && record.format !== 'Duo' && record.format !== 'Squad') {
    return { valid: false, error: 'format must be Solo, Duo, or Squad.' };
  }
  let existingIds: string[] = [];
  if (record.existingIds !== undefined) {
    if (
      !Array.isArray(record.existingIds) ||
      record.existingIds.length > 100 ||
      !record.existingIds.every((id) => typeof id === 'string' && id.length <= 80)
    ) {
      return { valid: false, error: 'existingIds must be an array of at most 100 strings.' };
    }
    existingIds = record.existingIds.map((s) => s.trim()).filter(Boolean);
  }
  return { valid: true, format: record.format, existingIds };
}

export function validatePrivateSheetsPayload(rawBody: unknown): {
  valid: boolean;
  errors: string[];
  sheetsByTournamentId?: Record<string, PrivateSheetEntry>;
} {
  const keyErrors = checkAllowedObjectKeys(
    rawBody,
    ALLOWED_PRIVATE_CONFIG_KEYS,
    'Private organizer config'
  );
  if (keyErrors.length > 0) return { valid: false, errors: keyErrors };

  const record = rawBody as Record<string, unknown>;
  if (containsSecretMaterial(record)) {
    return { valid: false, errors: ['Private config contains secret-like token patterns.'] };
  }
  if (!isPlainRecord(record.sheetsByTournamentId)) {
    return { valid: false, errors: ['sheetsByTournamentId must be an object map.'] };
  }

  const keys = Object.getOwnPropertyNames(record.sheetsByTournamentId);
  if (keys.length > 100) {
    return { valid: false, errors: ['Maximum 100 private Google Sheet entries supported.'] };
  }

  const normalized: Record<string, PrivateSheetEntry> = {};
  const errors: string[] = [];
  const nowIso = new Date().toISOString();

  for (const tid of keys) {
    if (FORBIDDEN_PROTO_KEYS.has(tid) || !/^[A-Za-z0-9_-]{1,80}$/.test(tid)) {
      errors.push(`Invalid tournament ID key "${tid}" in private config.`);
      continue;
    }
    const entry = record.sheetsByTournamentId[tid];
    const entryKeyErrors = checkAllowedObjectKeys(
      entry,
      ALLOWED_PRIVATE_SHEET_ENTRY_KEYS,
      `Private sheet entry "${tid}"`
    );
    if (entryKeyErrors.length > 0) {
      errors.push(...entryKeyErrors);
      continue;
    }
    const entryObj = entry as Record<string, unknown>;
    if (typeof entryObj.sheetUrl !== 'string') {
      errors.push(`Private sheet entry "${tid}" sheetUrl must be a string.`);
      continue;
    }
    const urlErr = validateGoogleSheetUrl(entryObj.sheetUrl, true);
    if (urlErr) {
      errors.push(`Tournament "${tid}": ${urlErr}`);
      continue;
    }
    let notes = '';
    if (entryObj.notes !== undefined) {
      if (typeof entryObj.notes !== 'string' || entryObj.notes.length > 300) {
        errors.push(`Tournament "${tid}" notes must be a string under 300 chars.`);
        continue;
      }
      notes = entryObj.notes.trim();
    }
    const cleanedUrl = entryObj.sheetUrl.trim();
    if (cleanedUrl || notes) {
      normalized[tid] = {
        sheetUrl: cleanedUrl,
        notes,
        updatedAt: typeof entryObj.updatedAt === 'string' && entryObj.updatedAt.trim()
          ? entryObj.updatedAt.trim().slice(0, 64)
          : nowIso,
      };
    }
  }

  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, errors: [], sheetsByTournamentId: normalized };
}
