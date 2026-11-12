import { hashPasswordPBKDF2 } from './auth.ts';
import {
  listPublicResultsFromD1,
  mapTournamentRow,
  recordActivityLog,
  safeJsonParse,
  slugifyText,
} from './d1PublicAndPlayer.ts';
import { STAFF_ROLES } from './rbac.ts';
import { ensureD1Schema } from './schema.ts';
import {
  readLivePublicContent,
  writeLivePublicContent,
  type LocalSecurityFallback,
} from './securityStore.ts';
import type {
  AdminContentBundle,
  D1Database,
  NewsArticle,
  ResultsData,
  RoleName,
  SiteConfigData,
  TournamentFormat,
  TournamentLifecycleStatus,
  TournamentRecord,
  TournamentResultEntry,
  WorkerEnv,
} from './types.ts';
import {
  containsPrivateSheetReference,
  containsSecretMaterial,
  validateNews,
  validateSiteConfigData,
} from './validators.ts';

/**
 * Recomputes real player statistics (`matches_played`, `total_kills`, `total_wins`, `total_points`)
 * directly from verified `match_results` in D1. Zero fabricated stats.
 */
export async function recalculateAllPlayerStats(db: D1Database): Promise<void> {
  await ensureD1Schema(db);
  await db
    .prepare(
      `UPDATE players
       SET matches_played = COALESCE((
             SELECT COUNT(*) FROM match_results mr
             WHERE (mr.player_id = players.id OR (mr.team_id IS NOT NULL AND mr.team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.player_id = players.id)))
               AND mr.verified = 1
           ), 0),
           total_kills = COALESCE((
             SELECT SUM(mr.kills) FROM match_results mr
             WHERE (mr.player_id = players.id OR (mr.team_id IS NOT NULL AND mr.team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.player_id = players.id)))
               AND mr.verified = 1
           ), 0),
           total_wins = COALESCE((
             SELECT SUM(CASE WHEN mr.placement = 1 THEN 1 ELSE 0 END) FROM match_results mr
             WHERE (mr.player_id = players.id OR (mr.team_id IS NOT NULL AND mr.team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.player_id = players.id)))
               AND mr.verified = 1
           ), 0),
           total_points = COALESCE((
             SELECT SUM(mr.total_points) FROM match_results mr
             WHERE (mr.player_id = players.id OR (mr.team_id IS NOT NULL AND mr.team_id IN (SELECT tm.team_id FROM team_members tm WHERE tm.player_id = players.id)))
               AND mr.verified = 1
           ), 0),
           updated_at = ?`
    )
    .bind(new Date().toISOString())
    .run();
}

function buildGroupedD1Results(
  rows: Array<Record<string, unknown>>
): TournamentResultEntry[] {
  if (rows.length === 0) return [];
  const byMatch = new Map<string, Array<Record<string, unknown>>>();
  for (const row of rows) {
    const key = `${String(row.tournament_id)}::${String(row.match_id)}`;
    const list = byMatch.get(key) ?? [];
    list.push(row);
    byMatch.set(key, list);
  }
  const output: TournamentResultEntry[] = [];
  for (const [key, group] of byMatch.entries()) {
    const sorted = [...group].sort(
      (a, b) =>
        Number(b.total_points ?? 0) - Number(a.total_points ?? 0) ||
        Number(a.placement ?? 999) - Number(b.placement ?? 999)
    );
    const top = sorted[0];
    const div: TournamentFormat =
      top.division === 'Solo' || top.division === 'Duo' || top.division === 'Squad'
        ? top.division
        : 'Squad';
    output.push({
      id: `d1-${key}`,
      tournamentId: String(top.tournament_id),
      tournamentName: `${String(top.tournament_title)} — ${String(top.match_title)}`,
      division: div,
      date: String(top.created_at ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
      winner: String(top.participant_name || 'Confirmed Winner'),
      prizeDistribution: String(top.prize_pool ?? ''),
      finalRankings: sorted.map((item, idx) => ({
        rank: idx + 1,
        teamOrPlayer: String(item.participant_name || 'Participant'),
        totalPoints: Number(item.total_points ?? 0),
        prize: Number(item.placement) === 1 ? 'WWCD' : `${Number(item.kills ?? 0)} Kills`,
      })),
      summary: `Official verified scoring: ${sorted.length} roster(s) scored from verified match sheet.`,
      published: true,
    });
  }
  return output;
}

/**
 * Mirrors authoritative D1 tournaments/news/settings/results into the fast KV public read cache
 * without erasing existing manual results, news, or site settings.
 */
export async function syncD1ToPublicKv(
  db: D1Database,
  env: WorkerEnv,
  fallback: LocalSecurityFallback,
  manualResultsOverride?: ResultsData
): Promise<void> {
  await ensureD1Schema(db);
  const [tournRes, newsRes, settingsRow, d1ResultRows, existingLive] =
    await Promise.all([
      db
        .prepare(
          `SELECT * FROM tournaments WHERE published = 1 AND status NOT IN ('draft', 'archived') ORDER BY featured DESC, match_date ASC`
        )
        .all<Record<string, unknown>>(),
      db
        .prepare(
          `SELECT * FROM news WHERE published = 1 AND archived = 0 ORDER BY pinned DESC, published_date DESC`
        )
        .all<Record<string, unknown>>(),
      db
        .prepare(`SELECT value_json FROM site_settings WHERE setting_key = 'site_config' LIMIT 1`)
        .first<{ value_json: string }>(),
      listPublicResultsFromD1(db),
      readLivePublicContent(env, fallback),
    ]);

  const now = new Date().toISOString().slice(0, 10);
  const d1Results = buildGroupedD1Results(d1ResultRows);
  const baseManualResults =
    manualResultsOverride?.entries ??
    existingLive?.bundle.results.entries.filter((entry) => !entry.id.startsWith('d1-')) ??
    [];
  const mergedResultsEntries = [
    ...d1Results,
    ...baseManualResults.filter((entry) => !entry.id.startsWith('d1-')),
  ];

  const newsEntries: NewsArticle[] = newsRes.results.map((n) => ({
    id: String(n.id),
    title: String(n.title),
    description: String(n.description),
    publishedDate: String(n.published_date),
    banner: String(n.banner_url ?? './images/hero-arena.jpg'),
    externalUrl: String(n.external_url ?? ''),
    category: n.category as NewsArticle['category'],
    pinned: Number(n.pinned ?? 0) === 1,
    published: true,
    archived: false,
  }));

  const resolvedSiteConfig = settingsRow
    ? safeJsonParse<SiteConfigData | undefined>(settingsRow.value_json, undefined)
    : existingLive?.bundle.siteConfig;

  const bundle: AdminContentBundle = {
    tournaments: {
      schemaVersion: 2,
      lastUpdated: now,
      tournaments: tournRes.results.map((r) => {
        const t = mapTournamentRow(r);
        return {
          id: t.id,
          slug: t.slug,
          title: t.title,
          season: t.season,
          description: t.description,
          game: 'BGMI',
          format: t.format,
          mode: t.mode,
          matchFormat: t.matchFormat,
          map: t.map,
          banner: t.bannerUrl || './images/squad-banner.jpg',
          thumbnail: t.bannerUrl || './images/squad-banner.jpg',
          matchesCount: t.matchesCount,
          teamSize:
            t.format === 'Solo'
              ? '1 Player (Solo)'
              : t.format === 'Duo'
                ? '2 Players (Duo)'
                : '4 Main Players + Optional 1 Sub',
          eligibleDevices: 'Handset Mobile Smartphones Only (No Emulators / Tablets)',
          eligibility: t.eligibility,
          registration: {
            status: t.regStatus,
            formUrl: t.externalFormUrl,
            buttonText: 'Register Now',
            openingDate: t.regOpenDate,
            closingDate: t.regCloseDate,
            whatsappCommunityUrl: t.whatsappUrl,
            instructions: 'Register online or submit your BGMI IGN & Character ID cleanly before lock.',
          },
          schedule: {
            date: t.matchDate,
            reportingTime: t.reportingTime,
            startTime: t.startTime,
            timezone: t.timezone,
          },
          prizes: {
            entryFee: t.entryFee,
            totalPrizePool: t.prizePool,
            first: t.firstPrize,
            second: t.secondPrize,
            third: t.thirdPrize,
            other: '',
          },
          rules: t.rules,
          status: t.status as TournamentLifecycleStatus,
          published: true,
          featured: t.featured,
        };
      }),
    },
    results: {
      schemaVersion: 2,
      lastUpdated: now,
      entries: mergedResultsEntries,
    },
    news: {
      schemaVersion: 2,
      lastUpdated: now,
      entries: newsEntries,
    },
    ...(resolvedSiteConfig ? { siteConfig: resolvedSiteConfig } : {}),
  };

  await writeLivePublicContent(
    {
      updatedAt: new Date().toISOString(),
      source: 'd1-live',
      bundle,
    },
    env,
    fallback
  );
}

export async function adminUpsertNewsInD1(
  db: D1Database,
  env: WorkerEnv,
  fallback: LocalSecurityFallback,
  rawInput: Record<string, unknown>,
  actor: { username: string; role: string; ipMasked?: string }
): Promise<{ ok: true; id: string } | { ok: false; status: number; error: string }> {
  await ensureD1Schema(db);
  if (containsSecretMaterial(rawInput) || containsPrivateSheetReference(rawInput)) {
    return { ok: false, status: 400, error: 'Restricted secret or spreadsheet URL detected.' };
  }

  const now = new Date().toISOString();
  const id = String(rawInput.id ?? '').trim() || `news_${crypto.randomUUID().slice(0, 8)}`;
  const normalized: NewsArticle = {
    id,
    title: String(rawInput.title ?? '').trim(),
    description: String(rawInput.description ?? '').trim(),
    publishedDate: String(rawInput.publishedDate ?? now.slice(0, 10)).trim(),
    banner: String(rawInput.banner ?? rawInput.bannerUrl ?? './images/hero-arena.jpg').trim(),
    externalUrl: String(rawInput.externalUrl ?? '').trim(),
    category: (rawInput.category ?? 'Updates') as NewsArticle['category'],
    pinned: Boolean(rawInput.pinned),
    published: rawInput.published === undefined ? true : Boolean(rawInput.published),
    archived: Boolean(rawInput.archived),
  };

  const errors = validateNews(normalized, new Set());
  if (errors.length > 0) {
    return { ok: false, status: 400, error: errors[0] };
  }

  const existing = await db.prepare('SELECT id FROM news WHERE id = ?').bind(id).first();
  if (existing) {
    await db
      .prepare(
        `UPDATE news SET title = ?, description = ?, category = ?, banner_url = ?, external_url = ?, published_date = ?, pinned = ?, published = ?, archived = ?, updated_at = ? WHERE id = ?`
      )
      .bind(
        normalized.title,
        normalized.description,
        normalized.category,
        normalized.banner,
        normalized.externalUrl,
        normalized.publishedDate,
        normalized.pinned ? 1 : 0,
        normalized.published ? 1 : 0,
        normalized.archived ? 1 : 0,
        now,
        id
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO news (id, title, description, category, banner_url, external_url, published_date, pinned, published, archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        normalized.title,
        normalized.description,
        normalized.category,
        normalized.banner,
        normalized.externalUrl,
        normalized.publishedDate,
        normalized.pinned ? 1 : 0,
        normalized.published ? 1 : 0,
        normalized.archived ? 1 : 0,
        now,
        now
      )
      .run();
  }

  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'news_saved',
    targetType: 'news',
    targetId: id,
    ipMasked: actor.ipMasked,
    summary: `Saved announcement "${normalized.title}".`,
  });
  await syncD1ToPublicKv(db, env, fallback);
  return { ok: true, id };
}

export async function adminUpsertSiteSettingsInD1(
  db: D1Database,
  env: WorkerEnv,
  fallback: LocalSecurityFallback,
  rawConfig: unknown,
  actor: { username: string; role: string; ipMasked?: string }
): Promise<{ ok: true; updatedAt: string } | { ok: false; status: number; error: string }> {
  await ensureD1Schema(db);
  if (!rawConfig || containsSecretMaterial(rawConfig) || containsPrivateSheetReference(rawConfig)) {
    return { ok: false, status: 400, error: 'Invalid or restricted settings payload.' };
  }
  const errors = validateSiteConfigData(rawConfig);
  if (errors.length > 0) {
    return { ok: false, status: 400, error: errors[0] };
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO site_settings (setting_key, value_json, updated_at)
       VALUES ('site_config', ?, ?)
       ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
    )
    .bind(JSON.stringify(rawConfig), now)
    .run();

  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'settings_updated',
    targetType: 'site_settings',
    ipMasked: actor.ipMasked,
    summary: 'Updated public platform settings.',
  });
  await syncD1ToPublicKv(db, env, fallback);
  return { ok: true, updatedAt: now };
}

async function upsertTournamentRecordRawInD1(
  db: D1Database,
  t: TournamentRecord,
  actorUsername: string,
  now: string
): Promise<void> {
  const existing = await db.prepare('SELECT id FROM tournaments WHERE id = ? LIMIT 1').bind(t.id).first();
  const maxSlots = t.format === 'Solo' ? 100 : t.format === 'Duo' ? 50 : 25;
  const published = t.published !== false && t.status !== 'draft' ? 1 : 0;

  if (existing) {
    await db
      .prepare(
        `UPDATE tournaments SET
           slug = ?, title = ?, season = ?, description = ?, game = 'BGMI',
           format = ?, mode = ?, match_format = ?, map = ?, banner_url = ?,
           matches_count = ?, entry_fee = ?, prize_pool = ?,
           first_prize = ?, second_prize = ?, third_prize = ?, rules_json = ?,
           eligibility_json = ?, reg_open_date = ?, reg_close_date = ?, reg_status = ?,
           match_date = ?, reporting_time = ?, start_time = ?, timezone = ?,
           external_form_url = ?, whatsapp_url = ?, status = ?, featured = ?,
           published = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        t.slug,
        t.title,
        t.season ?? '',
        t.description,
        t.format,
        t.mode,
        t.matchFormat ?? '',
        t.map,
        t.banner || (t.format === 'Solo' ? './images/solo-banner.jpg' : './images/squad-banner.jpg'),
        t.matchesCount,
        t.prizes.entryFee,
        t.prizes.totalPrizePool,
        t.prizes.first,
        t.prizes.second,
        t.prizes.third,
        JSON.stringify(t.rules ?? []),
        JSON.stringify(t.eligibility ?? []),
        t.registration.openingDate,
        t.registration.closingDate,
        t.registration.status,
        t.schedule.date,
        t.schedule.reportingTime,
        t.schedule.startTime,
        t.schedule.timezone,
        t.registration.formUrl,
        t.registration.whatsappCommunityUrl,
        t.status,
        t.featured ? 1 : 0,
        published,
        now,
        t.id
      )
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO tournaments (
         id, slug, title, season, description, game, format, mode, match_format, map, banner_url,
         max_slots, matches_count, entry_fee, prize_pool, first_prize, second_prize, third_prize,
         rules_json, eligibility_json, reg_open_date, reg_close_date, reg_status, match_date,
         reporting_time, start_time, timezone, external_form_url, whatsapp_url, status,
         featured, published, created_by, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, 'BGMI', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      t.id,
      t.slug,
      t.title,
      t.season ?? '',
      t.description,
      t.format,
      t.mode,
      t.matchFormat ?? '',
      t.map,
      t.banner || (t.format === 'Solo' ? './images/solo-banner.jpg' : './images/squad-banner.jpg'),
      maxSlots,
      t.matchesCount,
      t.prizes.entryFee,
      t.prizes.totalPrizePool,
      t.prizes.first,
      t.prizes.second,
      t.prizes.third,
      JSON.stringify(t.rules ?? []),
      JSON.stringify(t.eligibility ?? []),
      t.registration.openingDate,
      t.registration.closingDate,
      t.registration.status,
      t.schedule.date,
      t.schedule.reportingTime,
      t.schedule.startTime,
      t.schedule.timezone,
      t.registration.formUrl,
      t.registration.whatsappCommunityUrl,
      t.status,
      t.featured ? 1 : 0,
      published,
      actorUsername,
      now,
      now
    )
    .run();
}

/**
 * Persists published content bundle mutations into authoritative D1 tables and refreshes KV cache cleanly.
 */
export async function syncAdminBundleToD1(
  db: D1Database,
  env: WorkerEnv,
  fallback: LocalSecurityFallback,
  bundle: AdminContentBundle,
  actor: { username: string; role: string; ipMasked?: string }
): Promise<void> {
  await ensureD1Schema(db);
  const now = new Date().toISOString();

  for (const t of bundle.tournaments.tournaments) {
    await upsertTournamentRecordRawInD1(db, t, actor.username, now);
  }

  for (const article of bundle.news.entries) {
    const existing = await db.prepare('SELECT id FROM news WHERE id = ? LIMIT 1').bind(article.id).first();
    if (existing) {
      await db
        .prepare(
          `UPDATE news SET title = ?, description = ?, category = ?, banner_url = ?, external_url = ?, published_date = ?, pinned = ?, published = ?, archived = ?, updated_at = ? WHERE id = ?`
        )
        .bind(
          article.title,
          article.description,
          article.category,
          article.banner,
          article.externalUrl,
          article.publishedDate,
          article.pinned ? 1 : 0,
          article.published === false ? 0 : 1,
          article.archived ? 1 : 0,
          now,
          article.id
        )
        .run();
    } else {
      await db
        .prepare(
          `INSERT INTO news (id, title, description, category, banner_url, external_url, published_date, pinned, published, archived, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          article.id,
          article.title,
          article.description,
          article.category,
          article.banner,
          article.externalUrl,
          article.publishedDate,
          article.pinned ? 1 : 0,
          article.published === false ? 0 : 1,
          article.archived ? 1 : 0,
          now,
          now
        )
        .run();
    }
  }

  if (bundle.siteConfig) {
    await db
      .prepare(
        `INSERT INTO site_settings (setting_key, value_json, updated_at)
         VALUES ('site_config', ?, ?)
         ON CONFLICT(setting_key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`
      )
      .bind(JSON.stringify(bundle.siteConfig), now)
      .run();
  }

  await syncD1ToPublicKv(db, env, fallback, bundle.results);
}

export async function getAdminOverviewFromD1(db: D1Database) {
  await ensureD1Schema(db);

  const [
    totalTourns,
    activeTourns,
    totalPlayers,
    totalTeams,
    pendingRegs,
    upcomingMatches,
    completedMatches,
    recentRegs,
    recentLogs,
    trendRows,
  ] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS cnt FROM tournaments`).first<{ cnt: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM tournaments WHERE status IN ('upcoming', 'registration_open', 'live')`
      )
      .first<{ cnt: number }>(),
    db.prepare(`SELECT COUNT(*) AS cnt FROM players`).first<{ cnt: number }>(),
    db.prepare(`SELECT COUNT(*) AS cnt FROM teams`).first<{ cnt: number }>(),
    db.prepare(`SELECT COUNT(*) AS cnt FROM registrations WHERE status = 'pending'`).first<{ cnt: number }>(),
    db.prepare(`SELECT COUNT(*) AS cnt FROM matches WHERE status IN ('upcoming', 'live')`).first<{ cnt: number }>(),
    db.prepare(`SELECT COUNT(*) AS cnt FROM matches WHERE status = 'completed'`).first<{ cnt: number }>(),
    db
      .prepare(
        `SELECT r.id, r.tournament_id, t.title AS tournament_title, r.division, r.team_name,
                r.leader_ign, r.leader_char_id, r.status, r.created_at
         FROM registrations r
         JOIN tournaments t ON t.id = r.tournament_id
         ORDER BY r.created_at DESC LIMIT 8`
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(`SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 10`)
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT SUBSTR(created_at, 1, 10) AS day, COUNT(*) AS count
         FROM registrations
         GROUP BY SUBSTR(created_at, 1, 10)
         ORDER BY day ASC
         LIMIT 14`
      )
      .all<{ day: string; count: number }>(),
  ]);

  return {
    metrics: {
      totalTournaments: Number(totalTourns?.cnt ?? 0),
      activeTournaments: Number(activeTourns?.cnt ?? 0),
      registeredPlayers: Number(totalPlayers?.cnt ?? 0),
      registeredTeams: Number(totalTeams?.cnt ?? 0),
      pendingRegistrations: Number(pendingRegs?.cnt ?? 0),
      upcomingMatches: Number(upcomingMatches?.cnt ?? 0),
      completedMatches: Number(completedMatches?.cnt ?? 0),
    },
    recentRegistrations: recentRegs.results,
    recentActivities: recentLogs.results,
    registrationTrend: trendRows.results,
  };
}

const VALID_TOURNAMENT_STATUSES = new Set([
  'draft',
  'upcoming',
  'registration_open',
  'registration_closed',
  'live',
  'completed',
  'cancelled',
  'archived',
]);
const VALID_REG_STATUSES = new Set(['open', 'closed', 'full']);

export async function adminUpsertTournamentInD1(
  db: D1Database,
  env: WorkerEnv,
  fallback: LocalSecurityFallback,
  input: Record<string, unknown>,
  actor: { username: string; role: string; ipMasked?: string }
): Promise<{ ok: true; id: string; slug: string } | { ok: false; status: number; error: string }> {
  await ensureD1Schema(db);
  if (containsSecretMaterial(input) || containsPrivateSheetReference(input)) {
    return { ok: false, status: 400, error: 'Restricted secret or spreadsheet URL detected.' };
  }

  const title = String(input.title ?? '').trim();
  const description = String(input.description ?? '').trim();
  const format = String(input.format ?? 'Squad') as TournamentFormat;
  const mode = String(input.mode ?? input.perspective ?? 'TPP') as 'TPP' | 'FPP';
  const map = String(input.map ?? 'Erangel / Miramar').trim();
  const maxSlots = Number(input.maxSlots ?? 64);
  const matchesCount = Number(input.matchesCount ?? 3);

  if (title.length < 3 || title.length > 140) {
    return { ok: false, status: 400, error: 'Tournament title must be 3-140 characters.' };
  }
  if (!description || description.length > 2000) {
    return { ok: false, status: 400, error: 'Description is required (max 2000 characters).' };
  }
  if (format !== 'Solo' && format !== 'Duo' && format !== 'Squad') {
    return { ok: false, status: 400, error: 'Format must be Solo, Duo, or Squad.' };
  }
  if (mode !== 'TPP' && mode !== 'FPP') {
    return { ok: false, status: 400, error: 'Mode must be TPP or FPP.' };
  }
  if (!Number.isInteger(maxSlots) || maxSlots < 1 || maxSlots > 2048) {
    return { ok: false, status: 400, error: 'Max slots must be between 1 and 2048.' };
  }

  const status = String(input.status ?? 'upcoming').trim();
  const regStatus = String(input.regStatus ?? input.registrationStatus ?? 'open').trim();
  if (!VALID_TOURNAMENT_STATUSES.has(status)) {
    return { ok: false, status: 400, error: `Unsupported tournament status "${status}".` };
  }
  if (!VALID_REG_STATUSES.has(regStatus)) {
    return { ok: false, status: 400, error: `Unsupported registration status "${regStatus}".` };
  }

  const rawId = String(input.id ?? '').trim();
  const id = rawId || `NX-BGMI-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const rawSlug = String(input.slug ?? '').trim() || slugifyText(title);
  const slug = slugifyText(rawSlug) || slugifyText(id);
  const now = new Date().toISOString();

  const existingById = await db
    .prepare('SELECT id FROM tournaments WHERE id = ? LIMIT 1')
    .bind(id)
    .first();

  const bannerUrl = String(
    input.bannerUrl ?? input.banner ?? (format === 'Solo' ? './images/solo-banner.jpg' : './images/squad-banner.jpg')
  ).trim();
  const clampedMatchesCount = Math.max(
    1,
    Math.min(50, Number.isFinite(matchesCount) ? Math.floor(matchesCount) : 1)
  );
  const rulesJson = JSON.stringify(Array.isArray(input.rules) ? input.rules : []);
  const eligJson = JSON.stringify(Array.isArray(input.eligibility) ? input.eligibility : []);
  const regOpenDate = String(input.regOpenDate ?? input.registrationOpenDate ?? 'TBA');
  const regCloseDate = String(input.regCloseDate ?? input.registrationCloseDate ?? 'TBA');
  const matchDate = String(input.matchDate ?? 'TBA');
  const reportingTime = String(input.reportingTime ?? '19:30');
  const startTime = String(input.startTime ?? '20:00');
  const timezone = String(input.timezone ?? 'Asia/Kolkata');
  const externalFormUrl = String(input.externalFormUrl ?? '');
  const whatsappUrl = String(input.whatsappUrl ?? '');
  const featured = input.featured ? 1 : 0;
  const published = input.published === false || status === 'draft' ? 0 : 1;

  if (existingById) {
    await db
      .prepare(
        `UPDATE tournaments SET
           slug = ?, title = ?, season = ?, description = ?, game = 'BGMI',
           format = ?, mode = ?, match_format = ?, map = ?, banner_url = ?,
           max_slots = ?, matches_count = ?, entry_fee = ?, prize_pool = ?,
           first_prize = ?, second_prize = ?, third_prize = ?, rules_json = ?,
           eligibility_json = ?, reg_open_date = ?, reg_close_date = ?, reg_status = ?,
           match_date = ?, reporting_time = ?, start_time = ?, timezone = ?,
           external_form_url = ?, whatsapp_url = ?, status = ?, featured = ?,
           published = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(
        slug,
        title,
        String(input.season ?? ''),
        description,
        format,
        mode,
        String(input.matchFormat ?? ''),
        map,
        bannerUrl,
        maxSlots,
        clampedMatchesCount,
        String(input.entryFee ?? 'Free Entry'),
        String(input.prizePool ?? 'TBA'),
        String(input.firstPrize ?? ''),
        String(input.secondPrize ?? ''),
        String(input.thirdPrize ?? ''),
        rulesJson,
        eligJson,
        regOpenDate,
        regCloseDate,
        regStatus,
        matchDate,
        reportingTime,
        startTime,
        timezone,
        externalFormUrl,
        whatsappUrl,
        status,
        featured,
        published,
        now,
        id
      )
      .run();
  } else {
    const slugConflict = await db
      .prepare('SELECT id FROM tournaments WHERE slug = ? LIMIT 1')
      .bind(slug)
      .first();
    const finalSlug = slugConflict ? `${slug}-${id.slice(-4).toLowerCase()}` : slug;

    await db
      .prepare(
        `INSERT INTO tournaments (
           id, slug, title, season, description, game, format, mode, match_format, map, banner_url,
           max_slots, matches_count, entry_fee, prize_pool, first_prize, second_prize, third_prize,
           rules_json, eligibility_json, reg_open_date, reg_close_date, reg_status, match_date,
           reporting_time, start_time, timezone, external_form_url, whatsapp_url, status,
           featured, published, created_by, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, 'BGMI', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        finalSlug,
        title,
        String(input.season ?? ''),
        description,
        format,
        mode,
        String(input.matchFormat ?? ''),
        map,
        bannerUrl,
        maxSlots,
        clampedMatchesCount,
        String(input.entryFee ?? 'Free Entry'),
        String(input.prizePool ?? 'TBA'),
        String(input.firstPrize ?? ''),
        String(input.secondPrize ?? ''),
        String(input.thirdPrize ?? ''),
        rulesJson,
        eligJson,
        regOpenDate,
        regCloseDate,
        regStatus,
        matchDate,
        reportingTime,
        startTime,
        timezone,
        externalFormUrl,
        whatsappUrl,
        status,
        featured,
        published,
        actor.username,
        now,
        now
      )
      .run();
  }

  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: existingById ? 'tournament_updated' : 'tournament_created',
    targetType: 'tournament',
    targetId: id,
    ipMasked: actor.ipMasked,
    summary: `${existingById ? 'Updated' : 'Created'} BGMI tournament "${title}" (${format}).`,
  });
  await syncD1ToPublicKv(db, env, fallback);
  return { ok: true, id, slug };
}

export async function adminUpdateRegistrationStatusInD1(
  db: D1Database,
  regId: string,
  status: 'pending' | 'approved' | 'rejected' | 'waitlisted',
  reviewNotes: string,
  actor: { username: string; role: string; ipMasked?: string }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  await ensureD1Schema(db);
  const reg = await db
    .prepare('SELECT id, tournament_id, leader_ign, status FROM registrations WHERE id = ? LIMIT 1')
    .bind(regId)
    .first<{ id: string; tournament_id: string; leader_ign: string; status: string }>();

  if (!reg) return { ok: false, status: 404, error: 'Registration not found.' };

  if (status === 'approved' && reg.status !== 'approved') {
    const tRow = await db
      .prepare('SELECT max_slots FROM tournaments WHERE id = ? LIMIT 1')
      .bind(reg.tournament_id)
      .first<{ max_slots: number }>();
    const approvedCnt = await db
      .prepare(`SELECT COUNT(*) AS cnt FROM registrations WHERE tournament_id = ? AND status = 'approved'`)
      .bind(reg.tournament_id)
      .first<{ cnt: number }>();
    if (tRow && Number(approvedCnt?.cnt ?? 0) >= tRow.max_slots) {
      return { ok: false, status: 409, error: 'Tournament approved slot capacity is already full.' };
    }
  }

  const now = new Date().toISOString();
  await db
    .prepare(
      `UPDATE registrations SET status = ?, reviewed_by = ?, review_notes = ?, updated_at = ? WHERE id = ?`
    )
    .bind(status, actor.username, reviewNotes.trim().slice(0, 400), now, regId)
    .run();

  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'registration_reviewed',
    targetType: 'registration',
    targetId: regId,
    ipMasked: actor.ipMasked,
    summary: `Set registration for "${reg.leader_ign}" to ${status}.`,
  });

  return { ok: true };
}

export async function adminSubmitMatchResultInD1(
  db: D1Database,
  input: {
    matchId: string;
    tournamentId: string;
    teamId?: string;
    playerId?: string;
    participantName: string;
    placement: number;
    kills: number;
    placementPoints?: number;
    killPoints?: number;
  },
  actor: { username: string; role: string; ipMasked?: string },
  syncContext?: { env: WorkerEnv; fallback: LocalSecurityFallback }
): Promise<{ ok: true; id: string; totalPoints: number } | { ok: false; status: number; error: string }> {
  await ensureD1Schema(db);
  const participantName = input.participantName.trim();
  const placement = Number(input.placement);
  const kills = Number(input.kills);

  if (!participantName) {
    return { ok: false, status: 400, error: 'Participant / Team name is required.' };
  }
  if (!Number.isInteger(placement) || placement < 1 || placement > 100) {
    return { ok: false, status: 400, error: 'Placement must be an integer between 1 and 100.' };
  }
  if (!Number.isInteger(kills) || kills < 0 || kills > 99) {
    return { ok: false, status: 400, error: 'Kills/finishes must be between 0 and 99.' };
  }

  const matchRow = await db
    .prepare('SELECT id, tournament_id FROM matches WHERE id = ? LIMIT 1')
    .bind(input.matchId)
    .first<{ id: string; tournament_id: string }>();
  if (!matchRow) {
    return { ok: false, status: 404, error: 'Scheduled match not found.' };
  }
  const resolvedTournamentId = input.tournamentId.trim() || matchRow.tournament_id;
  if (matchRow.tournament_id !== resolvedTournamentId) {
    return { ok: false, status: 400, error: 'Match does not belong to specified tournament.' };
  }

  // Standard official BGMI placement points table if organizer didn't pass explicit points
  const defaultPlacementTable: Record<number, number> = {
    1: 10,
    2: 6,
    3: 5,
    4: 4,
    5: 3,
    6: 2,
    7: 1,
    8: 1,
  };
  const placementPoints = Number.isFinite(Number(input.placementPoints))
    ? Math.max(0, Math.floor(Number(input.placementPoints)))
    : (defaultPlacementTable[placement] ?? 0);
  const killPoints = Number.isFinite(Number(input.killPoints))
    ? Math.max(0, Math.floor(Number(input.killPoints)))
    : kills;
  const totalPoints = placementPoints + killPoints;

  const id = `res_${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO match_results (
         id, match_id, tournament_id, team_id, player_id, participant_name,
         placement, kills, placement_points, kill_points, total_points,
         verified, recorded_by, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`
    )
    .bind(
      id,
      matchRow.id,
      resolvedTournamentId,
      input.teamId ?? null,
      input.playerId ?? null,
      participantName,
      placement,
      kills,
      placementPoints,
      killPoints,
      totalPoints,
      actor.username,
      now
    )
    .run();

  await recalculateAllPlayerStats(db);
  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'match_result_submitted',
    targetType: 'match_result',
    targetId: id,
    ipMasked: actor.ipMasked,
    summary: `Recorded #${placement} (${kills} kills, ${totalPoints} pts) for "${participantName}".`,
  });
  if (syncContext) {
    await syncD1ToPublicKv(db, syncContext.env, syncContext.fallback);
  }

  return { ok: true, id, totalPoints };
}

export async function adminCreateMatchInD1(
  db: D1Database,
  input: Record<string, unknown>,
  actor: { username: string; role: string; ipMasked?: string }
): Promise<{ ok: true; id: string } | { ok: false; status?: number; error: string }> {
  await ensureD1Schema(db);
  const tournamentId = String(input.tournamentId ?? '').trim();
  const title = String(input.title ?? '').trim();
  const scheduledAt = String(input.scheduledAt ?? '').trim();
  if (!tournamentId || !title || !scheduledAt) {
    return { ok: false, status: 400, error: 'Tournament, match title, and scheduled time are required.' };
  }
  const tournExists = await db
    .prepare('SELECT id FROM tournaments WHERE id = ? LIMIT 1')
    .bind(tournamentId)
    .first();
  if (!tournExists) {
    return { ok: false, status: 404, error: 'Selected tournament does not exist in D1.' };
  }
  const id = `m_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO matches (id, tournament_id, match_number, title, group_label, map, perspective, scheduled_at, status, stream_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      tournamentId,
      Math.max(1, Number(input.matchNumber ?? 1)),
      title.slice(0, 120),
      String(input.groupLabel ?? 'Lobby A').slice(0, 60),
      String(input.map ?? 'Erangel').slice(0, 60),
      String(input.perspective ?? 'TPP') === 'FPP' ? 'FPP' : 'TPP',
      scheduledAt.slice(0, 64),
      ['upcoming', 'live', 'completed', 'cancelled'].includes(String(input.status))
        ? String(input.status)
        : 'upcoming',
      String(input.streamUrl ?? '').slice(0, 300),
      now,
      now
    )
    .run();

  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'match_created',
    targetType: 'match',
    targetId: id,
    ipMasked: actor.ipMasked,
    summary: `Scheduled match "${title}" (${String(input.map ?? 'Erangel')}).`,
  });
  return { ok: true, id };
}

export async function adminGetReportsFromD1(db: D1Database) {
  await ensureD1Schema(db);
  const [byDivision, regStatusFunnel, matchStatusSummary, topTeams] = await Promise.all([
    db
      .prepare(`SELECT format AS division, COUNT(*) AS count FROM tournaments GROUP BY format`)
      .all<{ division: string; count: number }>(),
    db
      .prepare(`SELECT status, COUNT(*) AS count FROM registrations GROUP BY status`)
      .all<{ status: string; count: number }>(),
    db
      .prepare(`SELECT status, COUNT(*) AS count FROM matches GROUP BY status`)
      .all<{ status: string; count: number }>(),
    db
      .prepare(
        `SELECT t.name, t.tag, t.division, COUNT(mr.id) AS matches, SUM(mr.total_points) AS points
         FROM teams t
         JOIN match_results mr ON mr.team_id = t.id AND mr.verified = 1
         GROUP BY t.id ORDER BY points DESC LIMIT 5`
      )
      .all<Record<string, unknown>>(),
  ]);

  return {
    tournamentsByDivision: byDivision.results,
    registrationsByStatus: regStatusFunnel.results,
    matchesByStatus: matchStatusSummary.results,
    topPerformingTeams: topTeams.results,
  };
}

export async function adminUpdateUserRoleOrStatusInD1(
  db: D1Database,
  targetUserId: string,
  patch: { roleId?: RoleName; accountStatus?: 'active' | 'suspended' | 'banned' },
  actor: { username: string; role: string; ipMasked?: string }
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  await ensureD1Schema(db);
  const user = await db
    .prepare('SELECT id, username, role_id, account_status FROM users WHERE id = ? LIMIT 1')
    .bind(targetUserId)
    .first<{ id: string; username: string; role_id: RoleName; account_status: string }>();
  if (!user) return { ok: false, status: 404, error: 'User not found.' };

  const nextRole = patch.roleId ?? user.role_id;
  if (nextRole !== 'player' && !(STAFF_ROLES as readonly string[]).includes(nextRole)) {
    return { ok: false, status: 400, error: 'Unsupported role.' };
  }
  const nextStatus = patch.accountStatus ?? (user.account_status as 'active' | 'suspended' | 'banned');
  if (!['active', 'suspended', 'banned'].includes(nextStatus)) {
    return { ok: false, status: 400, error: 'Unsupported account status.' };
  }

  await db
    .prepare(`UPDATE users SET role_id = ?, account_status = ?, updated_at = ? WHERE id = ?`)
    .bind(nextRole, nextStatus, new Date().toISOString(), targetUserId)
    .run();

  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'user_updated',
    targetType: 'user',
    targetId: targetUserId,
    ipMasked: actor.ipMasked,
    summary: `Updated user "${user.username}": role=${nextRole}, status=${nextStatus}.`,
  });

  return { ok: true };
}

export async function adminCreateStaffOrUserInD1(
  db: D1Database,
  input: { username: string; email: string; password: string; roleId: RoleName },
  actor: { username: string; role: string; ipMasked?: string }
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  await ensureD1Schema(db);
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    return { ok: false, status: 400, error: 'Username must be 3-32 safe characters.' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, status: 400, error: 'Valid email is required.' };
  }
  if (input.password.length < 14) {
    return { ok: false, status: 400, error: 'Staff password must be at least 14 characters.' };
  }

  const exists = await db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1')
    .bind(username, email)
    .first();
  if (exists) return { ok: false, status: 409, error: 'Username or email already exists.' };

  const userId = `usr_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  const passwordHash = await hashPasswordPBKDF2(input.password);
  await db
    .prepare(
      `INSERT INTO users (id, username, email, password_hash, role_id, account_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`
    )
    .bind(userId, username, email, passwordHash, input.roleId, now, now)
    .run();

  await recordActivityLog(db, {
    actorUsername: actor.username,
    actorRole: actor.role,
    action: 'staff_user_created',
    targetType: 'user',
    targetId: userId,
    ipMasked: actor.ipMasked,
    summary: `Provisioned user "${username}" with role "${input.roleId}".`,
  });
  return { ok: true, userId };
}
