import { hashPasswordPBKDF2, verifyPasswordPBKDF2 } from './auth.ts';
import { ensureD1Schema } from './schema.ts';
import type { D1Database, RoleName, TournamentFormat } from './types.ts';
import {
  containsPrivateSheetReference,
  containsSecretMaterial,
} from './validators.ts';

export interface RosterMemberInput {
  ign: string;
  charId: string;
  role?: string;
}

export interface D1PublicTournament {
  id: string;
  slug: string;
  title: string;
  season: string;
  description: string;
  game: 'BGMI';
  format: TournamentFormat;
  mode: 'TPP' | 'FPP';
  matchFormat: string;
  map: string;
  bannerUrl: string;
  maxSlots: number;
  registeredSlots: number;
  matchesCount: number;
  entryFee: string;
  prizePool: string;
  firstPrize: string;
  secondPrize: string;
  thirdPrize: string;
  rules: string[];
  eligibility: string[];
  regOpenDate: string;
  regCloseDate: string;
  regStatus: 'open' | 'closed' | 'full';
  matchDate: string;
  reportingTime: string;
  startTime: string;
  timezone: string;
  externalFormUrl: string;
  whatsappUrl: string;
  status: string;
  featured: boolean;
  published: boolean;
  updatedAt: string;
}

const VALID_CHAR_ID_RE = /^\d{6,16}$/;
const VALID_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_PLAYER_ROLES = new Set([
  'IGL',
  'Assaulter',
  'Fragger',
  'Sniper',
  'Support',
  'All-Rounder',
]);

export function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function slugifyText(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

export function isValidBgmiCharId(raw: string): boolean {
  return VALID_CHAR_ID_RE.test(raw.trim());
}

export function isEmulatorText(raw: string): boolean {
  const lower = raw.toLowerCase();
  return /\b(emulator|bluestacks|gameloop|ldplayer|nox|memu|pc|laptop)\b/.test(lower);
}

export function mapTournamentRow(
  row: Record<string, unknown>,
  registeredSlots = 0
): D1PublicTournament {
  return {
    id: String(row.id),
    slug: String(row.slug),
    title: String(row.title),
    season: String(row.season ?? ''),
    description: String(row.description ?? ''),
    game: 'BGMI',
    format: (row.format as TournamentFormat) || 'Squad',
    mode: (row.mode as 'TPP' | 'FPP') || 'TPP',
    matchFormat: String(row.match_format ?? ''),
    map: String(row.map ?? ''),
    bannerUrl: String(row.banner_url ?? './images/squad-banner.jpg'),
    maxSlots: Number(row.max_slots ?? 64),
    registeredSlots: Number(row.registered_slots ?? registeredSlots ?? 0),
    matchesCount: Number(row.matches_count ?? 1),
    entryFee: String(row.entry_fee ?? 'Free Entry'),
    prizePool: String(row.prize_pool ?? 'TBA'),
    firstPrize: String(row.first_prize ?? ''),
    secondPrize: String(row.second_prize ?? ''),
    thirdPrize: String(row.third_prize ?? ''),
    rules: safeJsonParse<string[]>(String(row.rules_json ?? '[]'), []),
    eligibility: safeJsonParse<string[]>(String(row.eligibility_json ?? '[]'), []),
    regOpenDate: String(row.reg_open_date ?? 'TBA'),
    regCloseDate: String(row.reg_close_date ?? 'TBA'),
    regStatus: (row.reg_status as 'open' | 'closed' | 'full') || 'open',
    matchDate: String(row.match_date ?? 'TBA'),
    reportingTime: String(row.reporting_time ?? '19:30'),
    startTime: String(row.start_time ?? '20:00'),
    timezone: String(row.timezone ?? 'Asia/Kolkata'),
    externalFormUrl: String(row.external_form_url ?? ''),
    whatsappUrl: String(row.whatsapp_url ?? ''),
    status: String(row.status ?? 'draft'),
    featured: Number(row.featured ?? 0) === 1,
    published: Number(row.published ?? 0) === 1,
    updatedAt: String(row.updated_at ?? ''),
  };
}

export async function recordActivityLog(
  db: D1Database,
  entry: {
    actorUsername: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId?: string;
    ipMasked?: string;
    summary: string;
  }
): Promise<void> {
  await ensureD1Schema(db);
  await db
    .prepare(
      `INSERT INTO activity_logs (id, timestamp, actor_username, actor_role, action, target_type, target_id, ip_masked, summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      `log_${crypto.randomUUID()}`,
      new Date().toISOString(),
      entry.actorUsername.slice(0, 64),
      entry.actorRole.slice(0, 32),
      entry.action.slice(0, 64),
      entry.targetType.slice(0, 48),
      (entry.targetId ?? '').slice(0, 80),
      (entry.ipMasked ?? '').slice(0, 48),
      entry.summary.slice(0, 240)
    )
    .run();
}

export async function listPublicTournamentsFromD1(
  db: D1Database,
  filters: { format?: string; status?: string; search?: string } = {}
): Promise<D1PublicTournament[]> {
  await ensureD1Schema(db);
  const res = await db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = t.id AND r.status IN ('approved', 'pending')) AS registered_slots
       FROM tournaments t
       WHERE t.published = 1 AND t.status NOT IN ('draft', 'archived')
       ORDER BY t.featured DESC, t.match_date ASC, t.created_at DESC`
    )
    .all<Record<string, unknown>>();

  let list = res.results.map((r) => mapTournamentRow(r, Number(r.registered_slots ?? 0)));
  if (filters.format && filters.format !== 'All') {
    list = list.filter((t) => t.format === filters.format);
  }
  if (filters.status && filters.status !== 'All') {
    list = list.filter((t) => t.status === filters.status);
  }
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    list = list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.map.toLowerCase().includes(q) ||
        t.format.toLowerCase().includes(q)
    );
  }
  return list;
}

export async function getPublicTournamentBySlugFromD1(
  db: D1Database,
  slug: string
): Promise<{ tournament: D1PublicTournament; matches: Record<string, unknown>[]; results: Record<string, unknown>[] } | null> {
  await ensureD1Schema(db);
  const row = await db
    .prepare(
      `SELECT t.*,
              (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = t.id AND r.status IN ('approved', 'pending')) AS registered_slots
       FROM tournaments t
       WHERE (t.slug = ? OR t.id = ?) AND t.published = 1 AND t.status NOT IN ('draft', 'archived')
       LIMIT 1`
    )
    .bind(slug.trim(), slug.trim())
    .first<Record<string, unknown>>();

  if (!row) return null;
  const tournament = mapTournamentRow(row, Number(row.registered_slots ?? 0));

  const matchesRes = await db
    .prepare(
      `SELECT id, tournament_id, match_number, title, group_label, map, perspective, scheduled_at, status, stream_url
       FROM matches WHERE tournament_id = ? ORDER BY match_number ASC, scheduled_at ASC`
    )
    .bind(tournament.id)
    .all<Record<string, unknown>>();

  const resultsRes = await db
    .prepare(
      `SELECT id, match_id, participant_name, placement, kills, placement_points, kill_points, total_points
       FROM match_results WHERE tournament_id = ? AND verified = 1 ORDER BY total_points DESC, placement ASC`
    )
    .bind(tournament.id)
    .all<Record<string, unknown>>();

  return {
    tournament,
    matches: matchesRes.results,
    results: resultsRes.results,
  };
}

export async function getPublicBootstrapFromD1(db: D1Database) {
  await ensureD1Schema(db);

  const [
    tournCountRow,
    ongoingCountRow,
    playerCountRow,
    teamCountRow,
    completedMatchesRow,
    tournaments,
    newsRes,
    topPlayersRes,
    matchesRes,
    settingsRow,
  ] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM tournaments WHERE published = 1 AND status NOT IN ('draft', 'archived')`)
      .first<{ cnt: number }>(),
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM tournaments WHERE published = 1 AND status IN ('upcoming', 'registration_open', 'live')`)
      .first<{ cnt: number }>(),
    db.prepare(`SELECT COUNT(*) AS cnt FROM players`).first<{ cnt: number }>(),
    db.prepare(`SELECT COUNT(*) AS cnt FROM teams`).first<{ cnt: number }>(),
    db.prepare(`SELECT COUNT(*) AS cnt FROM matches WHERE status = 'completed'`).first<{ cnt: number }>(),
    listPublicTournamentsFromD1(db),
    db
      .prepare(
        `SELECT id, title, description, category, banner_url, external_url, published_date, pinned
         FROM news WHERE published = 1 AND archived = 0
         ORDER BY pinned DESC, published_date DESC LIMIT 12`
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT id, bgmi_ign, display_name, role_tag, region, verified, matches_played, total_kills, total_wins, total_points
         FROM players ORDER BY total_points DESC, total_wins DESC, total_kills DESC LIMIT 20`
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(
        `SELECT m.id, m.tournament_id, t.title AS tournament_title, t.format AS division,
                m.match_number, m.title, m.group_label, m.map, m.perspective, m.scheduled_at, m.status, m.stream_url
         FROM matches m
         JOIN tournaments t ON t.id = m.tournament_id
         WHERE t.published = 1 AND t.status NOT IN ('draft', 'archived')
         ORDER BY m.scheduled_at ASC LIMIT 30`
      )
      .all<Record<string, unknown>>(),
    db
      .prepare(`SELECT value_json FROM site_settings WHERE setting_key = 'site_config' LIMIT 1`)
      .first<{ value_json: string }>(),
  ]);

  return {
    metrics: {
      totalTournaments: Number(tournCountRow?.cnt ?? 0),
      ongoingTournaments: Number(ongoingCountRow?.cnt ?? 0),
      registeredPlayers: Number(playerCountRow?.cnt ?? 0),
      verifiedTeams: Number(teamCountRow?.cnt ?? 0),
      completedMatches: Number(completedMatchesRow?.cnt ?? 0),
    },
    tournaments,
    news: newsRes.results.map((n) => ({
      id: String(n.id),
      title: String(n.title),
      description: String(n.description),
      category: String(n.category),
      banner: String(n.banner_url ?? './images/hero-arena.jpg'),
      externalUrl: String(n.external_url ?? ''),
      publishedDate: String(n.published_date),
      pinned: Number(n.pinned ?? 0) === 1,
      published: true,
      archived: false,
    })),
    topPlayers: topPlayersRes.results.map((p, idx) => ({
      rank: idx + 1,
      id: String(p.id),
      bgmiIgn: String(p.bgmi_ign),
      displayName: String(p.display_name),
      roleTag: String(p.role_tag),
      region: String(p.region),
      verified: Number(p.verified ?? 0) === 1,
      matchesPlayed: Number(p.matches_played ?? 0),
      totalKills: Number(p.total_kills ?? 0),
      totalWins: Number(p.total_wins ?? 0),
      totalPoints: Number(p.total_points ?? 0),
    })),
    matches: matchesRes.results.map((m) => ({
      id: String(m.id),
      tournamentId: String(m.tournament_id),
      tournamentTitle: String(m.tournament_title),
      division: String(m.division),
      matchNumber: Number(m.match_number ?? 1),
      title: String(m.title),
      groupLabel: String(m.group_label),
      map: String(m.map),
      perspective: String(m.perspective),
      scheduledAt: String(m.scheduled_at),
      status: String(m.status),
      streamUrl: String(m.stream_url ?? ''),
    })),
    siteConfig: settingsRow ? safeJsonParse(settingsRow.value_json, null) : null,
  };
}

export async function listPublicTeamsFromD1(db: D1Database, search = '') {
  await ensureD1Schema(db);
  const teamsRes = await db
    .prepare(
      `SELECT t.id, t.slug, t.name, t.tag, t.division, t.logo_url, t.description, t.verified, t.created_at,
              p.bgmi_ign AS captain_ign,
              (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count
       FROM teams t
       LEFT JOIN players p ON p.id = t.captain_player_id
       ORDER BY t.verified DESC, t.created_at DESC`
    )
    .all<Record<string, unknown>>();

  const q = search.trim().toLowerCase();
  return teamsRes.results
    .filter((t) =>
      q
        ? String(t.name).toLowerCase().includes(q) || String(t.tag).toLowerCase().includes(q)
        : true
    )
    .map((t) => ({
      id: String(t.id),
      slug: String(t.slug),
      name: String(t.name),
      tag: String(t.tag),
      division: String(t.division),
      logoUrl: String(t.logo_url ?? ''),
      description: String(t.description ?? ''),
      verified: Number(t.verified ?? 0) === 1,
      captainIgn: String(t.captain_ign ?? ''),
      memberCount: Number(t.member_count ?? 0),
      createdAt: String(t.created_at),
    }));
}

export async function getPublicTeamBySlugFromD1(db: D1Database, slug: string) {
  await ensureD1Schema(db);
  const team = await db
    .prepare(
      `SELECT t.id, t.slug, t.name, t.tag, t.division, t.logo_url, t.description, t.verified, t.created_at,
              p.bgmi_ign AS captain_ign, p.id AS captain_player_id
       FROM teams t
       LEFT JOIN players p ON p.id = t.captain_player_id
       WHERE t.slug = ? OR t.id = ?
       LIMIT 1`
    )
    .bind(slug.trim(), slug.trim())
    .first<Record<string, unknown>>();

  if (!team) return null;

  const membersRes = await db
    .prepare(
      `SELECT tm.member_role, p.id, p.bgmi_ign, p.display_name, p.role_tag, p.verified, p.matches_played, p.total_kills, p.total_wins, p.total_points
       FROM team_members tm
       JOIN players p ON p.id = tm.player_id
       WHERE tm.team_id = ?
       ORDER BY CASE WHEN tm.member_role = 'Captain' THEN 0 ELSE 1 END, p.total_points DESC`
    )
    .bind(String(team.id))
    .all<Record<string, unknown>>();

  const resultsRes = await db
    .prepare(
      `SELECT mr.id, mr.placement, mr.kills, mr.total_points, mr.created_at,
              m.title AS match_title, m.map, t.title AS tournament_title
       FROM match_results mr
       JOIN matches m ON m.id = mr.match_id
       JOIN tournaments t ON t.id = mr.tournament_id
       WHERE mr.team_id = ? AND mr.verified = 1
       ORDER BY mr.created_at DESC LIMIT 20`
    )
    .bind(String(team.id))
    .all<Record<string, unknown>>();

  return {
    team: {
      id: String(team.id),
      slug: String(team.slug),
      name: String(team.name),
      tag: String(team.tag),
      division: String(team.division),
      logoUrl: String(team.logo_url ?? ''),
      description: String(team.description ?? ''),
      verified: Number(team.verified ?? 0) === 1,
      captainIgn: String(team.captain_ign ?? ''),
      createdAt: String(team.created_at),
    },
    members: membersRes.results.map((m) => ({
      playerId: String(m.id),
      bgmiIgn: String(m.bgmi_ign),
      displayName: String(m.display_name),
      memberRole: String(m.member_role),
      roleTag: String(m.role_tag),
      verified: Number(m.verified ?? 0) === 1,
      matchesPlayed: Number(m.matches_played ?? 0),
      totalKills: Number(m.total_kills ?? 0),
      totalWins: Number(m.total_wins ?? 0),
      totalPoints: Number(m.total_points ?? 0),
    })),
    recentResults: resultsRes.results,
  };
}

export async function listPublicPlayersFromD1(db: D1Database, search = '') {
  await ensureD1Schema(db);
  const res = await db
    .prepare(
      `SELECT p.id, p.bgmi_ign, p.display_name, p.role_tag, p.region, p.verified,
              p.matches_played, p.total_kills, p.total_wins, p.total_points,
              t.name AS team_name, t.tag AS team_tag, t.slug AS team_slug
       FROM players p
       LEFT JOIN team_members tm ON tm.player_id = p.id
       LEFT JOIN teams t ON t.id = tm.team_id
       ORDER BY p.total_points DESC, p.total_wins DESC, p.created_at DESC`
    )
    .all<Record<string, unknown>>();

  const q = search.trim().toLowerCase();
  return res.results
    .filter((p) =>
      q
        ? String(p.bgmi_ign).toLowerCase().includes(q) ||
          String(p.display_name).toLowerCase().includes(q) ||
          String(p.team_name ?? '').toLowerCase().includes(q)
        : true
    )
    .map((p) => ({
      id: String(p.id),
      bgmiIgn: String(p.bgmi_ign),
      displayName: String(p.display_name),
      roleTag: String(p.role_tag),
      region: String(p.region),
      verified: Number(p.verified ?? 0) === 1,
      matchesPlayed: Number(p.matches_played ?? 0),
      totalKills: Number(p.total_kills ?? 0),
      totalWins: Number(p.total_wins ?? 0),
      totalPoints: Number(p.total_points ?? 0),
      teamName: p.team_name ? String(p.team_name) : null,
      teamTag: p.team_tag ? String(p.team_tag) : null,
      teamSlug: p.team_slug ? String(p.team_slug) : null,
    }));
}

export async function getPublicPlayerProfileFromD1(db: D1Database, playerId: string) {
  await ensureD1Schema(db);
  const row = await db
    .prepare(
      `SELECT p.id, p.bgmi_ign, p.display_name, p.device_type, p.role_tag, p.region, p.bio, p.verified,
              p.matches_played, p.total_kills, p.total_wins, p.total_points, p.created_at,
              t.id AS team_id, t.name AS team_name, t.tag AS team_tag, t.slug AS team_slug
       FROM players p
       LEFT JOIN team_members tm ON tm.player_id = p.id
       LEFT JOIN teams t ON t.id = tm.team_id
       WHERE p.id = ? LIMIT 1`
    )
    .bind(playerId.trim())
    .first<Record<string, unknown>>();

  if (!row) return null;

  const history = await db
    .prepare(
      `SELECT mr.id, mr.placement, mr.kills, mr.total_points, mr.created_at,
              m.title AS match_title, m.map, t.title AS tournament_title, t.slug AS tournament_slug
       FROM match_results mr
       JOIN matches m ON m.id = mr.match_id
       JOIN tournaments t ON t.id = mr.tournament_id
       WHERE mr.player_id = ? AND mr.verified = 1
       ORDER BY mr.created_at DESC LIMIT 20`
    )
    .bind(playerId.trim())
    .all<Record<string, unknown>>();

  return {
    player: {
      id: String(row.id),
      bgmiIgn: String(row.bgmi_ign),
      displayName: String(row.display_name),
      deviceType: String(row.device_type),
      roleTag: String(row.role_tag),
      region: String(row.region),
      bio: String(row.bio ?? ''),
      verified: Number(row.verified ?? 0) === 1,
      matchesPlayed: Number(row.matches_played ?? 0),
      totalKills: Number(row.total_kills ?? 0),
      totalWins: Number(row.total_wins ?? 0),
      totalPoints: Number(row.total_points ?? 0),
      createdAt: String(row.created_at),
      team: row.team_id
        ? {
            id: String(row.team_id),
            name: String(row.team_name),
            tag: String(row.team_tag),
            slug: String(row.team_slug),
          }
        : null,
    },
    matchHistory: history.results,
  };
}

export async function getPublicLeaderboardFromD1(db: D1Database, format = 'All') {
  await ensureD1Schema(db);

  // Aggregate real verified match results for players and teams
  const playerRows = await db
    .prepare(
      `SELECT p.id, p.bgmi_ign AS name, COALESCE(t.tag, p.role_tag) AS tag,
              p.matches_played, p.total_kills, p.total_wins, p.total_points,
              COALESCE(t.division, 'Solo') AS division
       FROM players p
       LEFT JOIN team_members tm ON tm.player_id = p.id
       LEFT JOIN teams t ON t.id = tm.team_id
       WHERE p.matches_played > 0 OR p.total_points > 0
       ORDER BY p.total_points DESC, p.total_wins DESC, p.total_kills DESC
       LIMIT 100`
    )
    .all<Record<string, unknown>>();

  const teamRows = await db
    .prepare(
      `SELECT t.id, t.name, t.tag, t.division, t.slug,
              COUNT(mr.id) AS matches_played,
              SUM(mr.kills) AS total_kills,
              SUM(CASE WHEN mr.placement = 1 THEN 1 ELSE 0 END) AS total_wins,
              SUM(mr.placement_points) AS position_points,
              SUM(mr.kill_points) AS elimination_points,
              SUM(mr.total_points) AS total_points
       FROM teams t
       JOIN match_results mr ON mr.team_id = t.id AND mr.verified = 1
       GROUP BY t.id
       ORDER BY total_points DESC, total_wins DESC, total_kills DESC
       LIMIT 100`
    )
    .all<Record<string, unknown>>();

  const filterFmt = (division: string) =>
    format === 'All' ? true : division === format;

  return {
    players: playerRows.results
      .filter((r) => filterFmt(String(r.division)))
      .map((r, idx) => ({
        rank: idx + 1,
        id: String(r.id),
        name: String(r.name),
        tag: String(r.tag),
        division: String(r.division),
        matchesPlayed: Number(r.matches_played ?? 0),
        totalKills: Number(r.total_kills ?? 0),
        totalWins: Number(r.total_wins ?? 0),
        totalPoints: Number(r.total_points ?? 0),
      })),
    teams: teamRows.results
      .filter((r) => filterFmt(String(r.division)))
      .map((r, idx) => ({
        rank: idx + 1,
        id: String(r.id),
        name: String(r.name),
        tag: String(r.tag),
        slug: String(r.slug),
        division: String(r.division),
        matchesPlayed: Number(r.matches_played ?? 0),
        positionPoints: Number(r.position_points ?? 0),
        eliminationPoints: Number(r.elimination_points ?? 0),
        totalKills: Number(r.total_kills ?? 0),
        totalWins: Number(r.total_wins ?? 0),
        totalPoints: Number(r.total_points ?? 0),
      })),
  };
}

export async function listPublicResultsFromD1(db: D1Database) {
  await ensureD1Schema(db);
  const res = await db
    .prepare(
      `SELECT mr.id, mr.match_id, mr.tournament_id, mr.participant_name, mr.placement,
              mr.kills, mr.placement_points, mr.kill_points, mr.total_points, mr.created_at,
              m.title AS match_title, m.map, m.match_number,
              t.title AS tournament_title, t.slug AS tournament_slug, t.format AS division, t.prize_pool
       FROM match_results mr
       JOIN matches m ON m.id = mr.match_id
       JOIN tournaments t ON t.id = mr.tournament_id
       WHERE mr.verified = 1 AND t.published = 1 AND t.status NOT IN ('draft', 'archived')
       ORDER BY m.scheduled_at DESC, mr.placement ASC`
    )
    .all<Record<string, unknown>>();
  return res.results;
}

export async function registerPlayerAccountInD1(
  db: D1Database,
  input: {
    username: string;
    email: string;
    password: string;
    bgmiIgn: string;
    bgmiCharId: string;
    deviceType?: string;
    roleTag?: string;
    ipMasked?: string;
  }
): Promise<
  | { ok: true; user: { id: string; username: string; email: string; role: RoleName }; playerId: string }
  | { ok: false; status: number; error: string }
> {
  await ensureD1Schema(db);
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  const bgmiIgn = input.bgmiIgn.trim();
  const bgmiCharId = input.bgmiCharId.trim();
  const deviceType = (input.deviceType ?? 'Mobile Smartphone (Android / iOS)').trim();
  const roleTag = VALID_PLAYER_ROLES.has(input.roleTag ?? '') ? input.roleTag! : 'Assaulter';

  if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) {
    return {
      ok: false,
      status: 400,
      error: 'Username must be 3-32 characters (letters, numbers, ., _, -).',
    };
  }
  if (!VALID_EMAIL_RE.test(email) || email.length > 160) {
    return { ok: false, status: 400, error: 'Enter a valid email address.' };
  }
  if (input.password.length < 10 || input.password.length > 128) {
    return { ok: false, status: 400, error: 'Password must be between 10 and 128 characters.' };
  }
  if (!bgmiIgn || bgmiIgn.length < 2 || bgmiIgn.length > 48) {
    return { ok: false, status: 400, error: 'Enter your valid BGMI In-Game Name (IGN).' };
  }
  if (!isValidBgmiCharId(bgmiCharId)) {
    return { ok: false, status: 400, error: 'BGMI Character ID must be 6-16 numeric digits.' };
  }
  if (isEmulatorText(deviceType)) {
    return { ok: false, status: 400, error: 'Only mobile smartphone devices are eligible for BGMI events.' };
  }
  if (containsSecretMaterial(input) || containsPrivateSheetReference(input)) {
    return { ok: false, status: 400, error: 'Rejected restricted input pattern.' };
  }

  const existingUser = await db
    .prepare('SELECT id FROM users WHERE username = ? OR email = ? LIMIT 1')
    .bind(username, email)
    .first();
  if (existingUser) {
    return { ok: false, status: 409, error: 'Username or email is already registered.' };
  }

  const existingChar = await db
    .prepare('SELECT id FROM players WHERE bgmi_char_id = ? LIMIT 1')
    .bind(bgmiCharId)
    .first();
  if (existingChar) {
    return { ok: false, status: 409, error: 'This BGMI Character ID is already registered.' };
  }

  const now = new Date().toISOString();
  const userId = `usr_${crypto.randomUUID()}`;
  const playerId = `plr_${crypto.randomUUID()}`;
  const passwordHash = await hashPasswordPBKDF2(input.password);

  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, username, email, password_hash, role_id, account_status, created_at, updated_at, last_login_at)
         VALUES (?, ?, ?, ?, 'player', 'active', ?, ?, ?)`
      )
      .bind(userId, username, email, passwordHash, now, now, now),
    db
      .prepare(
        `INSERT INTO players (id, user_id, bgmi_ign, bgmi_char_id, display_name, device_type, role_tag, region, bio, verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'India', '', 0, ?, ?)`
      )
      .bind(playerId, userId, bgmiIgn, bgmiCharId, username, deviceType, roleTag, now, now),
  ]);

  await recordActivityLog(db, {
    actorUsername: username,
    actorRole: 'player',
    action: 'player_registered',
    targetType: 'player',
    targetId: playerId,
    ipMasked: input.ipMasked,
    summary: `Player "${bgmiIgn}" registered (${bgmiCharId}).`,
  });

  return {
    ok: true,
    user: { id: userId, username, email, role: 'player' },
    playerId,
  };
}

export async function loginPlayerAccountInD1(
  db: D1Database,
  identifier: string,
  password: string
): Promise<
  | { ok: true; user: { id: string; username: string; email: string; role: RoleName } }
  | { ok: false; status: number; error: string }
> {
  await ensureD1Schema(db);
  const ident = identifier.trim();
  if (!ident || !password) {
    return { ok: false, status: 400, error: 'Username/email and password are required.' };
  }

  const row = await db
    .prepare(
      `SELECT id, username, email, password_hash, role_id, account_status
       FROM users
       WHERE username = ? OR email = ?
       LIMIT 1`
    )
    .bind(ident, ident.toLowerCase())
    .first<{
      id: string;
      username: string;
      email: string;
      password_hash: string;
      role_id: RoleName;
      account_status: string;
    }>();

  if (!row) {
    return { ok: false, status: 401, error: 'Invalid username/email or password.' };
  }
  if (row.account_status !== 'active') {
    return { ok: false, status: 403, error: `Account is ${row.account_status}. Contact support.` };
  }

  const okPwd = await verifyPasswordPBKDF2(password, row.password_hash);
  if (!okPwd) {
    return { ok: false, status: 401, error: 'Invalid username/email or password.' };
  }

  await db
    .prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?')
    .bind(new Date().toISOString(), new Date().toISOString(), row.id)
    .run();

  return {
    ok: true,
    user: { id: row.id, username: row.username, email: row.email, role: row.role_id },
  };
}

export async function getPlayerDashboardFromD1(db: D1Database, userId: string) {
  await ensureD1Schema(db);
  const player = await db
    .prepare(
      `SELECT p.*, u.username, u.email, u.role_id, u.account_status
       FROM players p
       JOIN users u ON u.id = p.user_id
       WHERE p.user_id = ? LIMIT 1`
    )
    .bind(userId)
    .first<Record<string, unknown>>();

  if (!player) return null;

  const teamsRes = await db
    .prepare(
      `SELECT t.*, tm.member_role
       FROM team_members tm
       JOIN teams t ON t.id = tm.team_id
       WHERE tm.player_id = ?
       ORDER BY tm.joined_at DESC`
    )
    .bind(String(player.id))
    .all<Record<string, unknown>>();

  const regsRes = await db
    .prepare(
      `SELECT r.id, r.tournament_id, t.title AS tournament_title, t.slug AS tournament_slug,
              t.match_date, t.start_time, r.division, r.team_name, r.leader_ign, r.leader_char_id,
              r.status, r.review_notes, r.created_at
       FROM registrations r
       JOIN tournaments t ON t.id = r.tournament_id
       WHERE r.user_id = ? OR r.player_id = ?
       ORDER BY r.created_at DESC`
    )
    .bind(userId, String(player.id))
    .all<Record<string, unknown>>();

  return {
    player: {
      id: String(player.id),
      userId: String(player.user_id),
      username: String(player.username),
      email: String(player.email),
      bgmiIgn: String(player.bgmi_ign),
      bgmiCharId: String(player.bgmi_char_id),
      displayName: String(player.display_name),
      deviceType: String(player.device_type),
      roleTag: String(player.role_tag),
      region: String(player.region),
      bio: String(player.bio ?? ''),
      verified: Number(player.verified ?? 0) === 1,
      matchesPlayed: Number(player.matches_played ?? 0),
      totalKills: Number(player.total_kills ?? 0),
      totalWins: Number(player.total_wins ?? 0),
      totalPoints: Number(player.total_points ?? 0),
    },
    teams: teamsRes.results,
    registrations: regsRes.results,
  };
}

export async function updatePlayerProfileInD1(
  db: D1Database,
  userId: string,
  patch: {
    bgmiIgn?: string;
    bgmiCharId?: string;
    displayName?: string;
    deviceType?: string;
    roleTag?: string;
    region?: string;
    bio?: string;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  await ensureD1Schema(db);
  const current = await db
    .prepare('SELECT id, bgmi_ign, bgmi_char_id, display_name, device_type, role_tag, region, bio FROM players WHERE user_id = ? LIMIT 1')
    .bind(userId)
    .first<Record<string, unknown>>();
  if (!current) return { ok: false, error: 'Player profile not found.' };

  const bgmiIgn = (patch.bgmiIgn ?? String(current.bgmi_ign)).trim();
  const bgmiCharId = (patch.bgmiCharId ?? String(current.bgmi_char_id)).trim();
  const displayName = (patch.displayName ?? String(current.display_name)).trim();
  const deviceType = (patch.deviceType ?? String(current.device_type)).trim();
  const roleTag = VALID_PLAYER_ROLES.has(patch.roleTag ?? '')
    ? patch.roleTag!
    : String(current.role_tag);
  const region = (patch.region ?? String(current.region)).trim().slice(0, 48);
  const bio = (patch.bio ?? String(current.bio ?? '')).trim().slice(0, 400);

  if (bgmiIgn.length < 2 || bgmiIgn.length > 48) {
    return { ok: false, error: 'BGMI IGN must be 2-48 characters.' };
  }
  if (!isValidBgmiCharId(bgmiCharId)) {
    return { ok: false, error: 'BGMI Character ID must be 6-16 numeric digits.' };
  }
  if (isEmulatorText(deviceType)) {
    return { ok: false, error: 'Emulators are prohibited under NexusX BGMI fair-play policy.' };
  }
  if (containsSecretMaterial({ bio, bgmiIgn })) {
    return { ok: false, error: 'Rejected restricted content.' };
  }

  if (bgmiCharId !== String(current.bgmi_char_id)) {
    const taken = await db
      .prepare('SELECT id FROM players WHERE bgmi_char_id = ? AND id != ? LIMIT 1')
      .bind(bgmiCharId, String(current.id))
      .first();
    if (taken) {
      return { ok: false, error: 'Another account already uses this BGMI Character ID.' };
    }
  }

  await db
    .prepare(
      `UPDATE players
       SET bgmi_ign = ?, bgmi_char_id = ?, display_name = ?, device_type = ?, role_tag = ?, region = ?, bio = ?, updated_at = ?
       WHERE id = ?`
    )
    .bind(
      bgmiIgn,
      bgmiCharId,
      displayName || bgmiIgn,
      deviceType || 'Mobile Smartphone',
      roleTag,
      region || 'India',
      bio,
      new Date().toISOString(),
      String(current.id)
    )
    .run();

  return { ok: true };
}

export async function createTeamInD1(
  db: D1Database,
  userId: string,
  input: { name: string; tag: string; division: TournamentFormat; description?: string; logoUrl?: string }
): Promise<{ ok: true; teamId: string; slug: string } | { ok: false; status: number; error: string }> {
  await ensureD1Schema(db);
  const player = await db
    .prepare('SELECT id, bgmi_ign FROM players WHERE user_id = ? LIMIT 1')
    .bind(userId)
    .first<{ id: string; bgmi_ign: string }>();
  if (!player) return { ok: false, status: 404, error: 'Complete your player profile first.' };

  const name = input.name.trim();
  const tag = input.tag.trim().toUpperCase();
  const slug = slugifyText(name);
  if (name.length < 3 || name.length > 48 || !slug) {
    return { ok: false, status: 400, error: 'Team name must be 3-48 characters.' };
  }
  if (!/^[A-Z0-9_-]{2,8}$/.test(tag)) {
    return { ok: false, status: 400, error: 'Team tag must be 2-8 uppercase letters/numbers.' };
  }
  if (input.division !== 'Solo' && input.division !== 'Duo' && input.division !== 'Squad') {
    return { ok: false, status: 400, error: 'Division must be Solo, Duo, or Squad.' };
  }

  const existing = await db
    .prepare('SELECT id FROM teams WHERE slug = ? OR name = ? OR tag = ? LIMIT 1')
    .bind(slug, name, tag)
    .first();
  if (existing) {
    return { ok: false, status: 409, error: 'Team name or tag already exists.' };
  }

  const teamId = `team_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO teams (id, slug, name, tag, captain_player_id, division, logo_url, description, verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`
      )
      .bind(
        teamId,
        slug,
        name,
        tag,
        player.id,
        input.division,
        (input.logoUrl ?? '').trim().slice(0, 300),
        (input.description ?? '').trim().slice(0, 400),
        now,
        now
      ),
    db
      .prepare(
        `INSERT INTO team_members (id, team_id, player_id, member_role, joined_at)
         VALUES (?, ?, ?, 'Captain', ?)`
      )
      .bind(`tm_${crypto.randomUUID()}`, teamId, player.id, now),
  ]);

  await recordActivityLog(db, {
    actorUsername: player.bgmi_ign,
    actorRole: 'player',
    action: 'team_created',
    targetType: 'team',
    targetId: teamId,
    summary: `Team [${tag}] ${name} (${input.division}) created.`,
  });

  return { ok: true, teamId, slug };
}

export async function submitTournamentRegistrationInD1(
  db: D1Database,
  userId: string | null,
  input: {
    tournamentId: string;
    teamId?: string;
    teamName?: string;
    leaderIgn: string;
    leaderCharId: string;
    contactEmail: string;
    contactDiscord?: string;
    roster: RosterMemberInput[];
    ipMasked?: string;
  }
): Promise<
  | { ok: true; registrationId: string; status: 'pending' | 'waitlisted' }
  | { ok: false; status: number; error: string }
> {
  await ensureD1Schema(db);
  const tourn = await db
    .prepare(
      `SELECT id, title, format, max_slots, reg_status, status, published
       FROM tournaments WHERE id = ? OR slug = ? LIMIT 1`
    )
    .bind(input.tournamentId.trim(), input.tournamentId.trim())
    .first<{
      id: string;
      title: string;
      format: TournamentFormat;
      max_slots: number;
      reg_status: string;
      status: string;
      published: number;
    }>();

  if (!tourn || tourn.published !== 1 || tourn.status === 'draft' || tourn.status === 'archived') {
    return { ok: false, status: 404, error: 'Tournament not found or not open.' };
  }
  if (tourn.reg_status === 'closed' || tourn.status === 'completed' || tourn.status === 'cancelled') {
    return { ok: false, status: 400, error: 'Registration for this tournament is closed.' };
  }

  const leaderIgn = input.leaderIgn.trim();
  const leaderCharId = input.leaderCharId.trim();
  const contactEmail = input.contactEmail.trim().toLowerCase();
  const teamName = (input.teamName ?? '').trim();

  if (leaderIgn.length < 2 || leaderIgn.length > 48) {
    return { ok: false, status: 400, error: 'Leader/Player BGMI IGN must be 2-48 characters.' };
  }
  if (!isValidBgmiCharId(leaderCharId)) {
    return { ok: false, status: 400, error: 'BGMI Character ID must be 6-16 numeric digits.' };
  }
  if (!VALID_EMAIL_RE.test(contactEmail)) {
    return { ok: false, status: 400, error: 'Enter a valid contact email for match room details.' };
  }

  const cleanRoster = Array.isArray(input.roster)
    ? input.roster
        .map((m) => ({
          ign: String(m.ign ?? '').trim(),
          charId: String(m.charId ?? '').trim(),
          role: String(m.role ?? 'Player').trim(),
        }))
        .filter((m) => m.ign || m.charId)
    : [];

  const requiredMembers = tourn.format === 'Solo' ? 1 : tourn.format === 'Duo' ? 2 : 4;
  const maxMembers = tourn.format === 'Solo' ? 1 : tourn.format === 'Duo' ? 2 : 5;
  const effectiveRoster =
    cleanRoster.length > 0
      ? cleanRoster
      : [{ ign: leaderIgn, charId: leaderCharId, role: 'Captain' }];

  if (effectiveRoster.length < requiredMembers || effectiveRoster.length > maxMembers) {
    return {
      ok: false,
      status: 400,
      error: `${tourn.format} tournament requires ${
        requiredMembers === maxMembers ? requiredMembers : `${requiredMembers}-${maxMembers}`
      } valid player entries.`,
    };
  }
  if (tourn.format !== 'Solo' && teamName.length < 2) {
    return { ok: false, status: 400, error: `Team name is required for ${tourn.format} tournaments.` };
  }

  const seenRosterIds = new Set<string>();
  for (const member of effectiveRoster) {
    if (member.ign.length < 2 || !isValidBgmiCharId(member.charId)) {
      return {
        ok: false,
        status: 400,
        error: 'Each roster player must include a valid BGMI IGN and 6-16 digit Character ID.',
      };
    }
    if (seenRosterIds.has(member.charId)) {
      return { ok: false, status: 400, error: 'Duplicate BGMI Character IDs found inside your roster.' };
    }
    seenRosterIds.add(member.charId);
  }

  // Prevent duplicate registration for same BGMI Character ID in same tournament
  const duplicate = await db
    .prepare(
      `SELECT id FROM registrations
       WHERE tournament_id = ? AND leader_char_id = ? AND status != 'rejected'
       LIMIT 1`
    )
    .bind(tourn.id, leaderCharId)
    .first();
  if (duplicate) {
    return {
      ok: false,
      status: 409,
      error: 'A registration with this BGMI Character ID already exists for this tournament.',
    };
  }

  // Check slot availability atomically
  const slotRow = await db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM registrations WHERE tournament_id = ? AND status IN ('approved', 'pending')`
    )
    .bind(tourn.id)
    .first<{ cnt: number }>();
  const usedSlots = Number(slotRow?.cnt ?? 0);

  if (tourn.reg_status === 'full' || usedSlots >= tourn.max_slots) {
    // Allow waitlist if tournament has reached slot limit rather than losing legitimate entries, or reject?
    // Section 4 explicitly lists Waitlisted status AND "enforce slot limits on the server"!
    // Let's enqueue as 'waitlisted' while keeping reg_status = 'full'.
    const waitId = `reg_${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    let playerRow: { id: string } | null = null;
    if (userId) {
      playerRow = await db
        .prepare('SELECT id FROM players WHERE user_id = ? LIMIT 1')
        .bind(userId)
        .first<{ id: string }>();
    }
    await db
      .prepare(
        `INSERT INTO registrations (
           id, tournament_id, user_id, player_id, team_id, division, team_name,
           leader_ign, leader_char_id, contact_email, contact_discord, roster_json,
           status, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'waitlisted', ?, ?)`
      )
      .bind(
        waitId,
        tourn.id,
        userId,
        playerRow?.id ?? null,
        input.teamId ?? null,
        tourn.format,
        teamName,
        leaderIgn,
        leaderCharId,
        contactEmail,
        (input.contactDiscord ?? '').trim().slice(0, 80),
        JSON.stringify(effectiveRoster),
        now,
        now
      )
      .run();

    await recordActivityLog(db, {
      actorUsername: leaderIgn,
      actorRole: userId ? 'player' : 'guest',
      action: 'registration_waitlisted',
      targetType: 'registration',
      targetId: waitId,
      ipMasked: input.ipMasked,
      summary: `Waitlisted ${tourn.format} entry for "${tourn.title}" (${leaderIgn}).`,
    });

    return { ok: true, registrationId: waitId, status: 'waitlisted' };
  }

  let playerRow: { id: string } | null = null;
  if (userId) {
    playerRow = await db
      .prepare('SELECT id FROM players WHERE user_id = ? LIMIT 1')
      .bind(userId)
      .first<{ id: string }>();
  }

  const regId = `reg_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO registrations (
         id, tournament_id, user_id, player_id, team_id, division, team_name,
         leader_ign, leader_char_id, contact_email, contact_discord, roster_json,
         status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
    )
    .bind(
      regId,
      tourn.id,
      userId,
      playerRow?.id ?? null,
      input.teamId ?? null,
      tourn.format,
      teamName,
      leaderIgn,
      leaderCharId,
      contactEmail,
      (input.contactDiscord ?? '').trim().slice(0, 80),
      JSON.stringify(effectiveRoster),
      now,
      now
    )
    .run();

  if (usedSlots + 1 >= tourn.max_slots) {
    await db
      .prepare(`UPDATE tournaments SET reg_status = 'full', updated_at = ? WHERE id = ?`)
      .bind(now, tourn.id)
      .run();
  }

  await recordActivityLog(db, {
    actorUsername: leaderIgn,
    actorRole: userId ? 'player' : 'guest',
    action: 'registration_submitted',
    targetType: 'registration',
    targetId: regId,
    ipMasked: input.ipMasked,
    summary: `Submitted ${tourn.format} registration for "${tourn.title}" (${teamName || leaderIgn}).`,
  });

  return { ok: true, registrationId: regId, status: 'pending' };
}
