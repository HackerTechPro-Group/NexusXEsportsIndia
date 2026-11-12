import type { D1Database } from './types.ts';

const SCHEMA_STATEMENTS: readonly string[] = [
  'PRAGMA foreign_keys = ON',
  `CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    description TEXT NOT NULL,
    permissions_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `INSERT OR IGNORE INTO roles (id, display_name, description, permissions_json, created_at) VALUES
    ('owner', 'Owner', 'Full platform ownership, security administration, role assignment, and all modules.', '["*"]', '2026-11-12T00:00:00.000Z'),
    ('tournament_manager', 'Tournament Manager', 'Manage BGMI tournaments, registrations, teams, matches, schedules, and analytics.', '["overview:read","tournaments:write","registrations:write","teams:write","players:read","matches:write","news:write","reports:read","leaderboard:read","results:read"]', '2026-11-12T00:00:00.000Z'),
    ('moderator', 'Moderator', 'Review registrations, verify rosters/players, moderate teams, and publish news.', '["overview:read","registrations:write","teams:write","players:write","news:write","tournaments:read"]', '2026-11-12T00:00:00.000Z'),
    ('result_manager', 'Result Manager', 'Manage match completion states, verified match results, and leaderboard recalculations.', '["overview:read","matches:write","results:write","leaderboard:write","tournaments:read"]', '2026-11-12T00:00:00.000Z'),
    ('player', 'Player', 'Standard authenticated BGMI competitor account for profile, team creation, and event entry.', '["player:self"]', '2026-11-12T00:00:00.000Z')`,
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role_id TEXT NOT NULL DEFAULT 'player' REFERENCES roles(id),
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'banned')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_login_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS players (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    bgmi_ign TEXT NOT NULL,
    bgmi_char_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    device_type TEXT NOT NULL DEFAULT 'Mobile Smartphone (Android / iOS)',
    role_tag TEXT NOT NULL DEFAULT 'Assaulter' CHECK (role_tag IN ('IGL', 'Assaulter', 'Fragger', 'Sniper', 'Support', 'All-Rounder')),
    region TEXT NOT NULL DEFAULT 'India',
    bio TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
    matches_played INTEGER NOT NULL DEFAULT 0,
    total_kills INTEGER NOT NULL DEFAULT 0,
    total_wins INTEGER NOT NULL DEFAULT 0,
    total_points INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS teams (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    tag TEXT NOT NULL UNIQUE COLLATE NOCASE,
    captain_player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
    division TEXT NOT NULL DEFAULT 'Squad' CHECK (division IN ('Solo', 'Duo', 'Squad')),
    logo_url TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    verified INTEGER NOT NULL DEFAULT 0 CHECK (verified IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS team_members (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    player_id TEXT NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    member_role TEXT NOT NULL DEFAULT 'Player' CHECK (member_role IN ('Captain', 'Player', 'Substitute')),
    joined_at TEXT NOT NULL,
    UNIQUE (team_id, player_id)
  )`,
  `CREATE TABLE IF NOT EXISTS tournaments (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
    title TEXT NOT NULL,
    season TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL,
    game TEXT NOT NULL DEFAULT 'BGMI' CHECK (game = 'BGMI'),
    format TEXT NOT NULL CHECK (format IN ('Solo', 'Duo', 'Squad')),
    mode TEXT NOT NULL DEFAULT 'TPP' CHECK (mode IN ('TPP', 'FPP')),
    match_format TEXT NOT NULL DEFAULT '',
    map TEXT NOT NULL,
    banner_url TEXT NOT NULL DEFAULT './images/squad-banner.jpg',
    max_slots INTEGER NOT NULL DEFAULT 64 CHECK (max_slots >= 1 AND max_slots <= 2048),
    matches_count INTEGER NOT NULL DEFAULT 1 CHECK (matches_count >= 1 AND matches_count <= 50),
    entry_fee TEXT NOT NULL DEFAULT 'Free Entry',
    prize_pool TEXT NOT NULL DEFAULT 'TBA',
    first_prize TEXT NOT NULL DEFAULT '',
    second_prize TEXT NOT NULL DEFAULT '',
    third_prize TEXT NOT NULL DEFAULT '',
    rules_json TEXT NOT NULL DEFAULT '[]',
    eligibility_json TEXT NOT NULL DEFAULT '[]',
    reg_open_date TEXT NOT NULL DEFAULT 'TBA',
    reg_close_date TEXT NOT NULL DEFAULT 'TBA',
    reg_status TEXT NOT NULL DEFAULT 'open' CHECK (reg_status IN ('open', 'closed', 'full')),
    match_date TEXT NOT NULL DEFAULT 'TBA',
    reporting_time TEXT NOT NULL DEFAULT '19:30',
    start_time TEXT NOT NULL DEFAULT '20:00',
    timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    external_form_url TEXT NOT NULL DEFAULT '',
    whatsapp_url TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'upcoming', 'registration_open', 'registration_closed', 'live', 'completed', 'cancelled', 'archived')),
    featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
    published INTEGER NOT NULL DEFAULT 0 CHECK (published IN (0, 1)),
    created_by TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS registrations (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
    team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    division TEXT NOT NULL CHECK (division IN ('Solo', 'Duo', 'Squad')),
    team_name TEXT NOT NULL DEFAULT '',
    leader_ign TEXT NOT NULL,
    leader_char_id TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_discord TEXT NOT NULL DEFAULT '',
    roster_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'waitlisted')),
    reviewed_by TEXT NOT NULL DEFAULT '',
    review_notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_unique_char_per_tournament
    ON registrations(tournament_id, leader_char_id)
    WHERE status != 'rejected'`,
  `CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    match_number INTEGER NOT NULL DEFAULT 1,
    title TEXT NOT NULL,
    group_label TEXT NOT NULL DEFAULT 'Lobby A',
    map TEXT NOT NULL DEFAULT 'Erangel',
    perspective TEXT NOT NULL DEFAULT 'TPP' CHECK (perspective IN ('TPP', 'FPP')),
    scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'live', 'completed', 'cancelled')),
    stream_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS match_results (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
    tournament_id TEXT NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
    player_id TEXT REFERENCES players(id) ON DELETE SET NULL,
    participant_name TEXT NOT NULL,
    placement INTEGER NOT NULL CHECK (placement >= 1 AND placement <= 100),
    kills INTEGER NOT NULL DEFAULT 0 CHECK (kills >= 0 AND kills <= 99),
    placement_points INTEGER NOT NULL DEFAULT 0 CHECK (placement_points >= 0),
    kill_points INTEGER NOT NULL DEFAULT 0 CHECK (kill_points >= 0),
    total_points INTEGER NOT NULL DEFAULT 0 CHECK (total_points >= 0),
    verified INTEGER NOT NULL DEFAULT 1 CHECK (verified IN (0, 1)),
    recorded_by TEXT NOT NULL DEFAULT 'system',
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS news (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'Updates' CHECK (category IN ('Tournament', 'Rules', 'Community', 'Updates')),
    banner_url TEXT NOT NULL DEFAULT './images/hero-arena.jpg',
    external_url TEXT NOT NULL DEFAULT '',
    published_date TEXT NOT NULL,
    pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
    published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1)),
    archived INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS site_settings (
    setting_key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS activity_logs (
    id TEXT PRIMARY KEY,
    timestamp TEXT NOT NULL,
    actor_username TEXT NOT NULL,
    actor_role TEXT NOT NULL,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL DEFAULT '',
    ip_masked TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS site_sections (
    section_key TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
    display_order INTEGER NOT NULL DEFAULT 1,
    draft_json TEXT NOT NULL DEFAULT '{}',
    published_json TEXT NOT NULL DEFAULT '{}',
    draft_version INTEGER NOT NULL DEFAULT 1,
    published_version INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`,
  `CREATE TABLE IF NOT EXISTS site_content (
    content_key TEXT PRIMARY KEY,
    section_key TEXT NOT NULL,
    field_type TEXT NOT NULL DEFAULT 'text',
    draft_value TEXT NOT NULL DEFAULT '',
    published_value TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`,
  `CREATE TABLE IF NOT EXISTS navigation_items (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    href TEXT NOT NULL,
    item_type TEXT NOT NULL DEFAULT 'anchor' CHECK (item_type IN ('anchor', 'route', 'external')),
    visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
    show_mobile INTEGER NOT NULL DEFAULT 1 CHECK (show_mobile IN (0, 1)),
    open_in_new_tab INTEGER NOT NULL DEFAULT 0 CHECK (open_in_new_tab IN (0, 1)),
    display_order INTEGER NOT NULL DEFAULT 1,
    stage TEXT NOT NULL CHECK (stage IN ('draft', 'published')),
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS footer_content (
    id TEXT PRIMARY KEY,
    draft_json TEXT NOT NULL,
    published_json TEXT NOT NULL,
    draft_version INTEGER NOT NULL DEFAULT 1,
    published_version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`,
  `CREATE TABLE IF NOT EXISTS social_links (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    label TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL,
    icon_name TEXT NOT NULL DEFAULT 'globe',
    visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
    display_order INTEGER NOT NULL DEFAULT 1,
    stage TEXT NOT NULL CHECK (stage IN ('draft', 'published')),
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS media_assets (
    id TEXT PRIMARY KEY,
    r2_key TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    public_url TEXT NOT NULL,
    folder TEXT NOT NULL DEFAULT 'uploads',
    alt_text TEXT NOT NULL DEFAULT '',
    uploaded_by TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS content_revisions (
    id TEXT PRIMARY KEY,
    version_number INTEGER NOT NULL,
    snapshot_json TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    created_by TEXT NOT NULL DEFAULT 'owner',
    created_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'rollback'))
  )`,
  `CREATE TABLE IF NOT EXISTS content_publication (
    id TEXT PRIMARY KEY,
    published_version INTEGER NOT NULL DEFAULT 1,
    draft_version INTEGER NOT NULL DEFAULT 1,
    etag TEXT NOT NULL,
    last_published_at TEXT,
    last_published_by TEXT,
    last_rollback_at TEXT,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS seo_settings (
    id TEXT PRIMARY KEY,
    draft_json TEXT NOT NULL,
    published_json TEXT NOT NULL,
    draft_version INTEGER NOT NULL DEFAULT 1,
    published_version INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL DEFAULT 'system'
  )`,
  'CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id, account_status)',
  'CREATE INDEX IF NOT EXISTS idx_players_points ON players(total_points DESC, total_wins DESC)',
  'CREATE INDEX IF NOT EXISTS idx_tournaments_pub ON tournaments(published, status, match_date)',
  'CREATE INDEX IF NOT EXISTS idx_registrations_tourn ON registrations(tournament_id, status, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_registrations_user ON registrations(user_id, created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_matches_tourn ON matches(tournament_id, status, scheduled_at)',
  'CREATE INDEX IF NOT EXISTS idx_results_tourn_match ON match_results(tournament_id, match_id, total_points DESC)',
  'CREATE INDEX IF NOT EXISTS idx_activity_ts ON activity_logs(timestamp DESC)',
  'CREATE INDEX IF NOT EXISTS idx_nav_stage_order ON navigation_items(stage, display_order ASC)',
  'CREATE INDEX IF NOT EXISTS idx_social_stage_order ON social_links(stage, display_order ASC)',
  'CREATE INDEX IF NOT EXISTS idx_media_created ON media_assets(created_at DESC)',
  'CREATE INDEX IF NOT EXISTS idx_revisions_ver ON content_revisions(version_number DESC)',
];

const initializedDatabases = new WeakSet<D1Database>();

/**
 * Ensures all NexusX D1 tables, constraints, and seed RBAC roles exist idempotently.
 */
export async function ensureD1Schema(db: D1Database): Promise<void> {
  if (initializedDatabases.has(db)) {
    return;
  }
  for (const sql of SCHEMA_STATEMENTS) {
    await db.prepare(sql).run();
  }
  initializedDatabases.add(db);
}
