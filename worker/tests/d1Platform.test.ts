import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashPasswordPBKDF2 } from '../src/auth.ts';
import { createWorkerHandler } from '../src/index.ts';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  SecurityKvBinding,
  WorkerEnv,
} from '../src/types.ts';

const TRUSTED_ORIGIN = 'https://nexusxesports.github.io';

function createMemoryKv(): SecurityKvBinding {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  };
}

/**
 * Wraps Node 24's built-in SQLite engine (`node:sqlite`) in Cloudflare's exact D1Database API
 * so schema constraints, foreign keys, unique partial indexes, transactions, and JOINs run identically.
 */
function createSqliteD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const wrapStatement = (sql: string, boundValues: unknown[] = []): D1PreparedStatement => ({
    bind(...values: unknown[]) {
      return wrapStatement(sql, values.map((v) => (v === undefined ? null : v)));
    },
    async first<T = Record<string, unknown>>() {
      const stmt = sqlite.prepare(sql);
      const row = stmt.get(...(boundValues as SQLInputValue[])) as T | undefined;
      return row ?? null;
    },
    async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      const stmt = sqlite.prepare(sql);
      const rows = stmt.all(...(boundValues as SQLInputValue[])) as T[];
      return { results: rows, success: true, meta: { changes: 0 } };
    },
    async run(): Promise<D1Result> {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...(boundValues as SQLInputValue[]));
      return {
        results: [],
        success: true,
        meta: {
          changes: Number(info.changes ?? 0),
          last_row_id: Number(info.lastInsertRowid ?? 0),
        },
      };
    },
  });

  return {
    prepare(query: string) {
      return wrapStatement(query);
    },
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results: D1Result<T>[] = [];
        for (const s of statements) {
          results.push((await s.run()) as D1Result<T>);
        }
        sqlite.exec('COMMIT');
        return results;
      } catch (err) {
        sqlite.exec('ROLLBACK');
        throw err;
      }
    },
    async exec(query: string) {
      sqlite.exec(query);
      return { count: 1, duration: 1 };
    },
  };
}

async function createD1TestEnv(db = createSqliteD1()): Promise<WorkerEnv> {
  const { privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  const passwordHash = await hashPasswordPBKDF2('NexusX!TestAdmin#2026');
  return {
    ENVIRONMENT: 'production',
    ADMIN_USERNAME: 'nexusx-owner',
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: '0123456789abcdef0123456789abcdef_strong_secret_key',
    GITHUB_APP_ID: '998877',
    GITHUB_APP_INSTALLATION_ID: '55443322',
    GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_OWNER: 'HackerTechPro-Group',
    GITHUB_REPO: 'NexusXEsportsIndia',
    GITHUB_BRANCH: 'main',
    ALLOWED_GITHUB_OWNER: 'HackerTechPro-Group',
    ALLOWED_GITHUB_REPO: 'NexusXEsportsIndia',
    ALLOWED_ORIGINS: `${TRUSTED_ORIGIN},http://localhost:5173`,
    SECURITY_KV: createMemoryKv(),
    DB: db,
  };
}

function extractNamedCookie(res: Response, cookieName: string): string {
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  const regex = new RegExp(`${cookieName}=([^;]+)`);
  const match = regex.exec(setCookie);
  if (!match) {
    throw new Error(`Expected ${cookieName} in Set-Cookie, got "${setCookie}"`);
  }
  return `${cookieName}=${match[1]}`;
}

describe('Cloudflare D1 Relational BGMI Platform, Registration, Scoring & RBAC', () => {
  it('executes canonical 0001_initial.sql migration SQL cleanly on SQLite with foreign keys', () => {
    const db = new DatabaseSync(':memory:');
    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'worker/migrations/0001_initial.sql'),
      'utf-8'
    );
    expect(() => db.exec(migrationSql)).not.toThrow();
    const roles = db.prepare('SELECT id FROM roles ORDER BY id').all() as Array<{ id: string }>;
    expect(roles.map((r) => r.id)).toEqual([
      'moderator',
      'owner',
      'player',
      'result_manager',
      'tournament_manager',
    ]);
  });

  it('runs end-to-end BGMI tournament -> player signup -> slot limit & waitlist -> approval -> match results -> real leaderboard recalculation -> RBAC', async () => {
    const env = await createD1TestEnv();
    const worker = createWorkerHandler();

    // 0. Public bootstrap starts with real zero metrics (no fake stats)
    const emptyBootRes = await worker.fetch(
      new Request('https://worker.example.com/api/platform/bootstrap', {
        headers: { Origin: TRUSTED_ORIGIN },
      }),
      env
    );
    expect(emptyBootRes.status).toBe(200);
    const emptyBoot = (await emptyBootRes.json()) as {
      databaseConnected: boolean;
      metrics: { totalTournaments: number; registeredPlayers: number };
      tournaments: unknown[];
    };
    expect(emptyBoot.databaseConnected).toBe(true);
    expect(emptyBoot.metrics.totalTournaments).toBe(0);
    expect(emptyBoot.metrics.registeredPlayers).toBe(0);
    expect(emptyBoot.tournaments).toEqual([]);

    // 1. Admin logs in & creates 1 published BGMI Solo event (maxSlots = 1) + 1 draft event
    const adminLogin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      env
    );
    expect(adminLogin.status).toBe(200);
    const adminCookie = extractNamedCookie(adminLogin, '__Host-nexusx_admin_session');
    const { csrfToken: adminCsrf } = (await adminLogin.json()) as { csrfToken: string };

    const createOpenTourn = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/tournaments', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-CSRF-Token': adminCsrf,
        },
        body: JSON.stringify({
          id: 'NX-BGMI-SOLO-99',
          title: 'NexusX BGMI Erangel Showdown',
          description: 'Competitive BGMI Solo lobby across Erangel.',
          format: 'Solo',
          mode: 'TPP',
          map: 'Erangel',
          maxSlots: 1,
          matchesCount: 2,
          prizePool: 'INR 10,000',
          status: 'registration_open',
          regStatus: 'open',
          matchDate: '2026-12-05',
          featured: true,
          published: true,
        }),
      }),
      env
    );
    expect(createOpenTourn.status).toBe(200);

    const createDraftTourn = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/tournaments', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-CSRF-Token': adminCsrf,
        },
        body: JSON.stringify({
          id: 'NX-BGMI-DRAFT-1',
          title: 'Secret Draft Internal Cup',
          description: 'Internal test.',
          format: 'Squad',
          mode: 'TPP',
          map: 'Miramar',
          maxSlots: 16,
          status: 'draft',
          published: false,
        }),
      }),
      env
    );
    expect(createDraftTourn.status).toBe(200);

    // Public list excludes draft
    const publicTourns = (await (
      await worker.fetch(
        new Request('https://worker.example.com/api/platform/tournaments', {
          headers: { Origin: TRUSTED_ORIGIN },
        }),
        env
      )
    ).json()) as { tournaments: Array<{ id: string }> };
    expect(publicTourns.tournaments.map((t) => t.id)).toEqual(['NX-BGMI-SOLO-99']);

    // 2. Player 1 registers account (emulator device blocked; valid mobile succeeds)
    const emuReg = await worker.fetch(
      new Request('https://worker.example.com/api/auth/player/register', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'emukid',
          email: 'emu@example.com',
          password: 'PlayerPass!2026',
          bgmiIgn: 'EmuUser',
          bgmiCharId: '5123456789',
          deviceType: 'BlueStacks Emulator PC',
        }),
      }),
      env
    );
    expect(emuReg.status).toBe(400);

    const p1Reg = await worker.fetch(
      new Request('https://worker.example.com/api/auth/player/register', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'vanguard_ign',
          email: 'vanguard@example.com',
          password: 'PlayerPass!2026',
          bgmiIgn: 'NXxVanguard',
          bgmiCharId: '5511223344',
          roleTag: 'IGL',
        }),
      }),
      env
    );
    expect(p1Reg.status).toBe(201);
    const p1Cookie = extractNamedCookie(p1Reg, '__Host-nexusx_player_session');
    const p1Json = (await p1Reg.json()) as { playerId: string; csrfToken: string };

    // Player session MUST be denied on /api/admin/*
    const p1AdminAttempt = await worker.fetch(
      new Request('https://worker.example.com/api/admin/overview', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: p1Cookie },
      }),
      env
    );
    expect(p1AdminAttempt.status).toBe(401);

    // Player 1 creates Squad Team
    const teamCreate = await worker.fetch(
      new Request('https://worker.example.com/api/player/teams', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: p1Cookie,
          'X-CSRF-Token': p1Json.csrfToken,
        },
        body: JSON.stringify({
          name: 'NexusX Vanguards',
          tag: 'NXV',
          division: 'Squad',
          description: 'Competitive Indian mobile BGMI roster.',
        }),
      }),
      env
    );
    expect(teamCreate.status).toBe(201);

    // 3. Player 1 registers for Solo tournament (maxSlots=1 -> status 'pending')
    const slot1Res = await worker.fetch(
      new Request('https://worker.example.com/api/platform/tournaments/NX-BGMI-SOLO-99/register', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: p1Cookie,
          'X-CSRF-Token': p1Json.csrfToken,
        },
        body: JSON.stringify({
          leaderIgn: 'NXxVanguard',
          leaderCharId: '5511223344',
          contactEmail: 'vanguard@example.com',
          roster: [{ ign: 'NXxVanguard', charId: '5511223344', role: 'Captain' }],
        }),
      }),
      env
    );
    expect(slot1Res.status).toBe(201);
    const slot1Body = (await slot1Res.json()) as { registrationId: string; status: string };
    expect(slot1Body.status).toBe('pending');

    // Duplicate BGMI Character ID blocked (409)
    const dupReg = await worker.fetch(
      new Request('https://worker.example.com/api/platform/tournaments/NX-BGMI-SOLO-99/register', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: p1Cookie,
          'X-CSRF-Token': p1Json.csrfToken,
        },
        body: JSON.stringify({
          leaderIgn: 'NXxVanguard',
          leaderCharId: '5511223344',
          contactEmail: 'vanguard@example.com',
          roster: [{ ign: 'NXxVanguard', charId: '5511223344' }],
        }),
      }),
      env
    );
    expect(dupReg.status).toBe(409);

    // Second player hits maxSlots=1 -> automatically waitlisted!
    const waitReg = await worker.fetch(
      new Request('https://worker.example.com/api/platform/tournaments/NX-BGMI-SOLO-99/register', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaderIgn: 'ReserveFragger',
          leaderCharId: '5998877665',
          contactEmail: 'reserve@example.com',
          roster: [{ ign: 'ReserveFragger', charId: '5998877665' }],
        }),
      }),
      env
    );
    expect(waitReg.status).toBe(201);
    expect(((await waitReg.json()) as { status: string }).status).toBe('waitlisted');

    // 4. Admin approves first registration, schedules match, creates Result Manager staff role
    const approveRes = await worker.fetch(
      new Request(`https://worker.example.com/api/admin/d1/registrations/${slot1Body.registrationId}`, {
        method: 'PATCH',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-CSRF-Token': adminCsrf,
        },
        body: JSON.stringify({ status: 'approved', reviewNotes: 'Verified mobile IGN' }),
      }),
      env
    );
    expect(approveRes.status).toBe(200);

    const matchRes = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/matches', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-CSRF-Token': adminCsrf,
        },
        body: JSON.stringify({
          tournamentId: 'NX-BGMI-SOLO-99',
          matchNumber: 1,
          title: 'Match 1 — Erangel Final',
          map: 'Erangel',
          perspective: 'TPP',
          scheduledAt: '2026-12-05T20:00:00+05:30',
          status: 'completed',
        }),
      }),
      env
    );
    expect(matchRes.status).toBe(201);
    const { id: matchId } = (await matchRes.json()) as { id: string };

    // Provision Result Manager RBAC staff user
    const staffCreate = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/users', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-CSRF-Token': adminCsrf,
        },
        body: JSON.stringify({
          username: 'scorer_one',
          email: 'scorer@nexusxesports.in',
          password: 'ScorerStrong!2026Pass',
          roleId: 'result_manager',
        }),
      }),
      env
    );
    expect(staffCreate.status).toBe(201);

    // Result Manager logs into Admin API
    const staffLogin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'scorer_one', password: 'ScorerStrong!2026Pass' }),
      }),
      env
    );
    expect(staffLogin.status).toBe(200);
    const staffCookie = extractNamedCookie(staffLogin, '__Host-nexusx_admin_session');
    const staffBody = (await staffLogin.json()) as { csrfToken: string; role: string };
    expect(staffBody.role).toBe('result_manager');

    // Result Manager CANNOT access security settings or user management (403 RBAC enforced)
    const staffSecBlocked = await worker.fetch(
      new Request('https://worker.example.com/api/admin/security/audit', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: staffCookie },
      }),
      env
    );
    expect(staffSecBlocked.status).toBe(403);

    const staffUsersBlocked = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/users', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: staffCookie },
      }),
      env
    );
    expect(staffUsersBlocked.status).toBe(403);

    // Result Manager CAN submit match result -> automatically updates Player stats & Leaderboard!
    const submitResult = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/results', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: staffCookie,
          'X-CSRF-Token': staffBody.csrfToken,
        },
        body: JSON.stringify({
          matchId,
          tournamentId: 'NX-BGMI-SOLO-99',
          playerId: p1Json.playerId,
          participantName: 'NXxVanguard',
          placement: 1,
          kills: 7,
        }),
      }),
      env
    );
    expect(submitResult.status).toBe(201);
    const resultJson = (await submitResult.json()) as { totalPoints: number };
    expect(resultJson.totalPoints).toBe(17); // 10 placement (#1) + 7 kills

    // Public leaderboard reflects real calculated 17 pts + 1 win!
    const leaderboardRes = (await (
      await worker.fetch(
        new Request('https://worker.example.com/api/platform/leaderboard', {
          headers: { Origin: TRUSTED_ORIGIN },
        }),
        env
      )
    ).json()) as { players: Array<{ name: string; totalPoints: number; totalWins: number }> };
    expect(leaderboardRes.players[0].name).toBe('NXxVanguard');
    expect(leaderboardRes.players[0].totalPoints).toBe(17);
    expect(leaderboardRes.players[0].totalWins).toBe(1);

    // Admin overview reflects 100% real database counts
    const overview = (await (
      await worker.fetch(
        new Request('https://worker.example.com/api/admin/overview', {
          headers: { Origin: TRUSTED_ORIGIN, Cookie: adminCookie },
        }),
        env
      )
    ).json()) as {
      metrics: {
        totalTournaments: number;
        registeredPlayers: number;
        registeredTeams: number;
        completedMatches: number;
      };
    };
    expect(overview.metrics.totalTournaments).toBe(2);
    expect(overview.metrics.registeredPlayers).toBe(1);
    expect(overview.metrics.registeredTeams).toBe(1);
    expect(overview.metrics.completedMatches).toBe(1);
  });

  it('supports allowlisted cross-site player auth with CSRF, rejects untrusted origins/content-types, and enforces CSRF on logout', async () => {
    const env = await createD1TestEnv();
    const worker = createWorkerHandler();

    // Non-JSON media type rejected with 415 on JSON routes
    const badMime = await worker.fetch(
      new Request('https://worker.example.com/api/auth/player/register', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Sec-Fetch-Site': 'cross-site',
          'Content-Type': 'text/plain',
        },
        body: 'not json',
      }),
      env
    );
    expect(badMime.status).toBe(415);

    // Untrusted origin rejected with 403 even with valid JSON
    const evilOrigin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/player/register', {
        method: 'POST',
        headers: {
          Origin: 'https://evil-phishing.example',
          'Sec-Fetch-Site': 'cross-site',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'eviluser',
          email: 'evil@example.com',
          password: 'Player!Password#2026',
          bgmiIgn: 'EvilIGN',
          bgmiCharId: '5999888777',
        }),
      }),
      env
    );
    expect(evilOrigin.status).toBe(403);

    // Allowlisted cross-site Origin + Sec-Fetch-Site: cross-site succeeds for registration + login + profile + logout
    const regRes = await worker.fetch(
      new Request('https://worker.example.com/api/auth/player/register', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Sec-Fetch-Site': 'cross-site',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'nx_crosssite',
          email: 'cross@nexusx.in',
          password: 'Player!Password#2026',
          bgmiIgn: 'NXCrossSite',
          bgmiCharId: '5123456789',
        }),
      }),
      env
    );
    expect(regRes.status).toBe(201);
    const cookie1 = extractNamedCookie(regRes, '__Host-nexusx_player_session');
    const regJson = (await regRes.json()) as { csrfToken: string };
    expect(regJson.csrfToken.length).toBeGreaterThan(10);

    // Missing CSRF token rejected on authenticated PUT /api/player/profile
    const missingCsrfProfile = await worker.fetch(
      new Request('https://worker.example.com/api/player/profile', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Sec-Fetch-Site': 'cross-site',
          'Content-Type': 'application/json',
          Cookie: cookie1,
        },
        body: JSON.stringify({ roleTag: 'IGL' }),
      }),
      env
    );
    expect(missingCsrfProfile.status).toBe(403);

    // Valid CSRF token succeeds across cross-site fetch
    const okProfile = await worker.fetch(
      new Request('https://worker.example.com/api/player/profile', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Sec-Fetch-Site': 'cross-site',
          'Content-Type': 'application/json',
          Cookie: cookie1,
          'X-CSRF-Token': regJson.csrfToken,
        },
        body: JSON.stringify({ roleTag: 'IGL', deviceType: 'iPad' }),
      }),
      env
    );
    expect(okProfile.status).toBe(200);

    // Logout without CSRF token when active cookie is sent MUST return 403
    const logoutNoCsrf = await worker.fetch(
      new Request('https://worker.example.com/api/auth/player/logout', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Sec-Fetch-Site': 'cross-site',
          Cookie: cookie1,
        },
      }),
      env
    );
    expect(logoutNoCsrf.status).toBe(403);

    // Logout with valid CSRF token revokes session in SECURITY_KV & invalidates cookie
    const logoutOk = await worker.fetch(
      new Request('https://worker.example.com/api/auth/player/logout', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Sec-Fetch-Site': 'cross-site',
          Cookie: cookie1,
          'X-CSRF-Token': regJson.csrfToken,
        },
      }),
      env
    );
    expect(logoutOk.status).toBe(200);

    const sessionAfterLogout = await worker.fetch(
      new Request('https://worker.example.com/api/auth/player/session', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: cookie1 },
      }),
      env
    );
    expect(sessionAfterLogout.status).toBe(200);
    const sessBody = (await sessionAfterLogout.json()) as { authenticated: boolean };
    expect(sessBody.authenticated).toBe(false);

    const profileAfterLogout = await worker.fetch(
      new Request('https://worker.example.com/api/player/profile', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: cookie1 },
      }),
      env
    );
    expect(profileAfterLogout.status).toBe(401);
  });

  it('keeps D1 authoritative while syncing news, settings, computed team stats, and preserving manual results in KV', async () => {
    const env = await createD1TestEnv();
    const worker = createWorkerHandler();

    const adminLogin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      env
    );
    expect(adminLogin.status).toBe(200);
    const adminCookie = extractNamedCookie(adminLogin, '__Host-nexusx_admin_session');
    const adminBody = (await adminLogin.json()) as { csrfToken: string };

    // Seed KV public content with a manual result entry before D1 match results exist
    await env.SECURITY_KV!.put(
      'public:live_content_v1',
      JSON.stringify({
        updatedAt: '2026-11-12T00:00:00Z',
        source: 'github',
        bundle: {
          tournaments: { schemaVersion: 2, lastUpdated: '2026-11-12', tournaments: [] },
          results: {
            schemaVersion: 2,
            lastUpdated: '2026-11-12',
            entries: [
              {
                id: 'manual-res-001',
                tournamentId: 'LEGACY-CUP',
                tournamentTitle: 'Legacy Cup Finale',
                format: 'Squad',
                date: '2026-11-01',
                map: 'Erangel',
                banner: './images/hero-arena.jpg',
                winner: { teamOrPlayerName: 'ManualWinners', kills: 12, points: 22 },
                standings: [
                  { rank: 1, name: 'ManualWinners', matchesPlayed: 1, finishes: 12, totalPoints: 22 },
                ],
                published: true,
              },
            ],
          },
          news: { schemaVersion: 2, lastUpdated: '2026-11-12', entries: [] },
        },
      })
    );

    // Create a player + squad team
    const pRes = await worker.fetch(
      new Request('https://worker.example.com/api/auth/player/register', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'kv_sync_cap',
          email: 'cap@nexusx.in',
          password: 'Player!Password#2026',
          bgmiIgn: 'NX_SyncCap',
          bgmiCharId: '5334455667',
        }),
      }),
      env
    );
    expect(pRes.status).toBe(201);
    const pCookie = extractNamedCookie(pRes, '__Host-nexusx_player_session');
    const pJson = (await pRes.json()) as { csrfToken: string; playerId: string };

    const teamRes = await worker.fetch(
      new Request('https://worker.example.com/api/player/teams', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: pCookie,
          'X-CSRF-Token': pJson.csrfToken,
        },
        body: JSON.stringify({ name: 'NX Alpha Squad', tag: 'NXA', division: 'Squad' }),
      }),
      env
    );
    expect(teamRes.status).toBe(201);
    const teamJson = (await teamRes.json()) as { teamId: string };

    // Create D1 tournament + match + verified match result for that team
    const tSave = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/tournaments', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-CSRF-Token': adminBody.csrfToken,
        },
        body: JSON.stringify({
          id: 'NX-KV-SYNC-01',
          slug: 'kv-sync-squad-01',
          title: 'NexusX Sync Championship',
          description: 'End to end D1 to KV verification event.',
          format: 'Squad',
          mode: 'TPP',
          map: 'Erangel / Miramar',
          prizePool: 'INR 25,000',
          entryFee: 'Free',
          maxSlots: 25,
          regStatus: 'open',
          matchDate: '2026-12-10',
          status: 'registration_open',
          published: true,
        }),
      }),
      env
    );
    expect(tSave.status).toBe(200);

    const matchSave = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/matches', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-CSRF-Token': adminBody.csrfToken,
        },
        body: JSON.stringify({
          tournamentId: 'NX-KV-SYNC-01',
          title: 'Grand Finals Match 1',
          map: 'Erangel',
          scheduledAt: '2026-12-10T18:00:00Z',
          status: 'completed',
        }),
      }),
      env
    );
    expect(matchSave.status).toBe(201);
    const matchJson = (await matchSave.json()) as { id: string };

    const resultSave = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/results', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-CSRF-Token': adminBody.csrfToken,
        },
        body: JSON.stringify({
          matchId: matchJson.id,
          tournamentId: 'NX-KV-SYNC-01',
          teamId: teamJson.teamId,
          playerId: pJson.playerId,
          participantName: 'NX Alpha Squad',
          placement: 1,
          kills: 11,
        }),
      }),
      env
    );
    expect(resultSave.status).toBe(201);

    // Save news & site settings via D1 endpoints
    const newsSave = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/news', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-CSRF-Token': adminBody.csrfToken,
        },
        body: JSON.stringify({
          id: 'news-d1-sync-1',
          title: 'D1 Live News Synced',
          description: 'Published through D1 and automatically synced to KV cache.',
          category: 'Updates',
          banner: './images/hero-arena.jpg',
          publishedDate: '2026-12-01',
          published: true,
        }),
      }),
      env
    );
    expect(newsSave.status).toBe(200);

    const baseSiteConfig = JSON.parse(
      fs.readFileSync(path.resolve(process.cwd(), 'public/data/site-config.json'), 'utf-8')
    ) as Record<string, unknown> & { community: Record<string, unknown> };
    baseSiteConfig.tagline = 'India Premier BGMI Circuit';
    baseSiteConfig.community.contactEmail = 'ops@nexusxesports.in';

    const settingsSave = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/settings', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: adminCookie,
          'X-CSRF-Token': adminBody.csrfToken,
        },
        body: JSON.stringify({
          siteConfig: baseSiteConfig,
        }),
      }),
      env
    );
    expect(settingsSave.status).toBe(200);

    // Verify computed team stats (`total_wins`, `matches_played`, `total_kills`, `total_points`)
    const teamsRes = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/teams', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: adminCookie },
      }),
      env
    );
    expect(teamsRes.status).toBe(200);
    const teamsBody = (await teamsRes.json()) as {
      teams: Array<{ name: string; matches_played: number; total_wins: number; total_kills: number; total_points: number }>;
    };
    const alpha = teamsBody.teams.find((t) => t.name === 'NX Alpha Squad');
    expect(alpha).toBeTruthy();
    expect(alpha?.matches_played).toBe(1);
    expect(alpha?.total_wins).toBe(1);
    expect(alpha?.total_kills).toBe(11);
    expect(alpha?.total_points).toBe(21);

    // Public KV cache has BOTH manual legacy result AND D1-generated result + D1 news + D1 siteConfig
    const publicRes = await worker.fetch(
      new Request('https://worker.example.com/api/public/content', {
        headers: { Origin: TRUSTED_ORIGIN },
      }),
      env
    );
    expect(publicRes.status).toBe(200);
    const publicJson = (await publicRes.json()) as {
      available: boolean;
      results: { entries: Array<{ id: string }> };
      news: { entries: Array<{ id: string; title: string }> };
      siteConfig?: { tagline?: string };
    };
    expect(publicJson.available).toBe(true);
    expect(publicJson.results.entries.some((r) => r.id === 'manual-res-001')).toBe(true);
    expect(publicJson.results.entries.some((r) => r.id === `d1-NX-KV-SYNC-01::${matchJson.id}`)).toBe(true);
    expect(publicJson.news.entries.some((n) => n.id === 'news-d1-sync-1')).toBe(true);
    expect(publicJson.siteConfig?.tagline).toBe('India Premier BGMI Circuit');

    // Deleting the last D1 news row clears KV public news list cleanly
    const delNews = await worker.fetch(
      new Request('https://worker.example.com/api/admin/d1/news/news-d1-sync-1', {
        method: 'DELETE',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: adminCookie,
          'X-CSRF-Token': adminBody.csrfToken,
        },
      }),
      env
    );
    expect(delNews.status).toBe(200);

    const publicAfterDelete = (await (
      await worker.fetch(
        new Request('https://worker.example.com/api/public/content', {
          headers: { Origin: TRUSTED_ORIGIN },
        }),
        env
      )
    ).json()) as { news: { entries: Array<{ id: string }> } };
    expect(publicAfterDelete.news.entries).toHaveLength(0);
  });
});
