import {
  determineCookieSameSite,
  hasExactJsonMediaType,
  hasValidStateChangeOrigin,
  isHttpsRequest,
  isValidSessionSecret,
  maskClientIp,
  verifyCsrfToken,
  verifySessionToken,
} from './auth.ts';
import {
  deleteMediaAssetFromR2,
  getAdminCmsWorkspace,
  listMediaAssets,
  publishCmsDraftToLive,
  readSnapshotStage,
  rollbackCmsToRevision,
  saveCmsDraftStage,
  syncCmsIntoSiteSettings,
  uploadImageAssetToR2,
} from './cmsService.ts';
import {
  adminCreateMatchInD1,
  adminCreateStaffOrUserInD1,
  adminGetReportsFromD1,
  adminSubmitMatchResultInD1,
  adminUpdateRegistrationStatusInD1,
  adminUpdateUserRoleOrStatusInD1,
  adminUpsertNewsInD1,
  adminUpsertSiteSettingsInD1,
  adminUpsertTournamentInD1,
  getAdminOverviewFromD1,
  recalculateAllPlayerStats,
  syncD1ToPublicKv,
} from './d1Admin.ts';
import {
  createTeamInD1,
  getPlayerDashboardFromD1,
  getPublicBootstrapFromD1,
  getPublicLeaderboardFromD1,
  getPublicPlayerProfileFromD1,
  getPublicTeamBySlugFromD1,
  getPublicTournamentBySlugFromD1,
  listPublicPlayersFromD1,
  listPublicResultsFromD1,
  listPublicTeamsFromD1,
  listPublicTournamentsFromD1,
  loginPlayerAccountInD1,
  mapTournamentRow,
  recordActivityLog,
  registerPlayerAccountInD1,
  safeJsonParse,
  submitTournamentRegistrationInD1,
  updatePlayerProfileInD1,
} from './d1PublicAndPlayer.ts';
import {
  HOST_PLAYER_COOKIE_NAME,
  PLAYER_COOKIE_NAME,
  authenticatePlayerSession,
  buildClearNamedCookieHeader,
  buildNamedSessionCookieHeader,
  extractNamedCookie,
  hasRolePermission,
  isStaffRole,
  issuePlayerSessionToken,
  type AdminPermission,
} from './rbac.ts';
import { ensureD1Schema } from './schema.ts';
import {
  registerSessionRecord,
  revokeSessionByJti,
  type LocalSecurityFallback,
} from './securityStore.ts';
import type { RoleName, TournamentFormat, WorkerEnv } from './types.ts';

function resJson(
  data: unknown,
  status: number,
  corsHeaders: Headers,
  extraHeaders?: Record<string, string>
): Response {
  const headers = new Headers(corsHeaders);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      headers.set(k, v);
    }
  }
  return new Response(JSON.stringify(data), { status, headers });
}

async function parseJsonSafe(request: Request, maxBytes = 128_000): Promise<Record<string, unknown> | null> {
  const len = Number(request.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(len) && len > maxBytes) {
    return null;
  }
  try {
    const txt = await request.text();
    if (!txt || txt.length > maxBytes) return null;
    const parsed = JSON.parse(txt) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function handlePublicAndPlayerPlatformRoute(params: {
  request: Request;
  url: URL;
  pathname: string;
  env: WorkerEnv;
  corsHeaders: Headers;
  fallback: LocalSecurityFallback;
  clientIp: string;
  originPresent: boolean;
  originVerified: boolean;
  checkRateLimit: (key: string) => Promise<boolean>;
}): Promise<Response | null> {
  const {
    request,
    url,
    pathname,
    env,
    corsHeaders,
    fallback,
    clientIp,
    originPresent,
    originVerified,
    checkRateLimit,
  } = params;

  const isMutating = request.method !== 'GET' && request.method !== 'HEAD';
  const hasOriginOk = hasValidStateChangeOrigin(request, originPresent, originVerified);

  const db = env.DB;

  // --- PUBLIC D1 READ ROUTES ---
  if (pathname === '/api/platform/bootstrap' && request.method === 'GET') {
    if (!db) {
      return resJson(
        {
          databaseConnected: false,
          metrics: {
            totalTournaments: 0,
            ongoingTournaments: 0,
            registeredPlayers: 0,
            verifiedTeams: 0,
            completedMatches: 0,
          },
          tournaments: [],
          news: [],
          topPlayers: [],
          matches: [],
          siteConfig: null,
        },
        200,
        corsHeaders,
        { 'Cache-Control': 'no-store' }
      );
    }
    const data = await getPublicBootstrapFromD1(db);
    return resJson({ databaseConnected: true, ...data }, 200, corsHeaders, {
      'Cache-Control': 'no-store',
    });
  }

  if (pathname === '/api/platform/tournaments' && request.method === 'GET') {
    if (!db) return resJson({ tournaments: [] }, 200, corsHeaders);
    const format = url.searchParams.get('format') ?? 'All';
    const status = url.searchParams.get('status') ?? 'All';
    const search = url.searchParams.get('search') ?? '';
    const tournaments = await listPublicTournamentsFromD1(db, { format, status, search });
    return resJson({ tournaments }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  }

  if (pathname.startsWith('/api/platform/tournaments/') && request.method === 'GET') {
    const slug = decodeURIComponent(pathname.slice('/api/platform/tournaments/'.length));
    if (!db) return resJson({ error: 'Database not bound.' }, 503, corsHeaders);
    const detail = await getPublicTournamentBySlugFromD1(db, slug);
    if (!detail) return resJson({ error: 'Tournament not found.' }, 404, corsHeaders);
    return resJson(detail, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  }

  if (pathname === '/api/platform/teams' && request.method === 'GET') {
    if (!db) return resJson({ teams: [] }, 200, corsHeaders);
    const teams = await listPublicTeamsFromD1(db, url.searchParams.get('search') ?? '');
    return resJson({ teams }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  }

  if (pathname.startsWith('/api/platform/teams/') && request.method === 'GET') {
    const slug = decodeURIComponent(pathname.slice('/api/platform/teams/'.length));
    if (!db) return resJson({ error: 'Database not bound.' }, 503, corsHeaders);
    const detail = await getPublicTeamBySlugFromD1(db, slug);
    if (!detail) return resJson({ error: 'Team not found.' }, 404, corsHeaders);
    return resJson(detail, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  }

  if (pathname === '/api/platform/players' && request.method === 'GET') {
    if (!db) return resJson({ players: [] }, 200, corsHeaders);
    const players = await listPublicPlayersFromD1(db, url.searchParams.get('search') ?? '');
    return resJson({ players }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  }

  if (pathname.startsWith('/api/platform/players/') && request.method === 'GET') {
    const playerId = decodeURIComponent(pathname.slice('/api/platform/players/'.length));
    if (!db) return resJson({ error: 'Database not bound.' }, 503, corsHeaders);
    const profile = await getPublicPlayerProfileFromD1(db, playerId);
    if (!profile) return resJson({ error: 'Player not found.' }, 404, corsHeaders);
    return resJson(profile, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  }

  if (pathname === '/api/platform/leaderboard' && request.method === 'GET') {
    if (!db) return resJson({ players: [], teams: [] }, 200, corsHeaders);
    const format = url.searchParams.get('format') ?? 'All';
    const board = await getPublicLeaderboardFromD1(db, format);
    return resJson(board, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  }

  if (pathname === '/api/platform/results' && request.method === 'GET') {
    if (!db) return resJson({ results: [] }, 200, corsHeaders);
    const results = await listPublicResultsFromD1(db);
    return resJson({ results }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  }

  if (pathname === '/api/platform/matches' && request.method === 'GET') {
    if (!db) return resJson({ matches: [] }, 200, corsHeaders);
    await ensureD1Schema(db);
    const res = await db
      .prepare(
        `SELECT m.id, m.tournament_id, t.title AS tournament_title, t.slug AS tournament_slug, t.format AS division,
                m.match_number, m.title, m.group_label, m.map, m.perspective, m.scheduled_at, m.status, m.stream_url
         FROM matches m
         JOIN tournaments t ON t.id = m.tournament_id
         WHERE t.published = 1 AND t.status NOT IN ('draft', 'archived')
         ORDER BY m.scheduled_at ASC`
      )
      .all<Record<string, unknown>>();
    return resJson({ matches: res.results }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
  }

  // --- TOURNAMENT REGISTRATION SUBMISSION (Authenticated Player or Verified Direct Entry) ---
  if (
    pathname.startsWith('/api/platform/tournaments/') &&
    pathname.endsWith('/register') &&
    request.method === 'POST'
  ) {
    if (!hasOriginOk) return resJson({ error: 'Valid Origin required.' }, 403, corsHeaders);
    if (!hasExactJsonMediaType(request)) {
      return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
    }
    if (!db) return resJson({ error: 'Registration database is not configured.' }, 503, corsHeaders);

    const allowed = await checkRateLimit(`reg:${clientIp}`);
    if (!allowed) {
      return resJson({ error: 'Too many registration requests. Wait a minute.' }, 429, corsHeaders);
    }

    const playerSession = await authenticatePlayerSession(request, env, fallback, false);
    if (playerSession.ok) {
      // Enforce CSRF if player cookie is active
      const csrfCheck = await authenticatePlayerSession(request, env, fallback, true);
      if (!csrfCheck.ok) {
        return resJson({ error: csrfCheck.error }, 403, corsHeaders);
      }
    }

    const rawId = pathname.slice('/api/platform/tournaments/'.length, -'/register'.length);
    const tournamentId = decodeURIComponent(rawId);
    const body = await parseJsonSafe(request);
    if (!body) return resJson({ error: 'Invalid JSON request body.' }, 400, corsHeaders);

    const outcome = await submitTournamentRegistrationInD1(db, playerSession.ok ? playerSession.identity.userId : null, {
      tournamentId,
      teamId: body.teamId ? String(body.teamId) : undefined,
      teamName: body.teamName ? String(body.teamName) : '',
      leaderIgn: String(body.leaderIgn ?? ''),
      leaderCharId: String(body.leaderCharId ?? ''),
      contactEmail: String(body.contactEmail ?? (playerSession.ok ? playerSession.identity.email : '')),
      contactDiscord: body.contactDiscord ? String(body.contactDiscord) : '',
      roster: Array.isArray(body.roster) ? (body.roster as Array<{ ign: string; charId: string; role?: string }>) : [],
      ipMasked: maskClientIp(clientIp),
    });

    if (!outcome.ok) {
      return resJson({ error: outcome.error }, outcome.status, corsHeaders);
    }
    return resJson(outcome, 201, corsHeaders);
  }

  // --- PLAYER AUTHENTICATION & SELF-SERVICE ---
  if (pathname === '/api/auth/player/session' && request.method === 'GET') {
    const auth = await authenticatePlayerSession(request, env, fallback, false);
    if (!auth.ok) {
      return resJson({ authenticated: false }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
    }
    return resJson(
      {
        authenticated: true,
        user: {
          id: auth.identity.userId,
          username: auth.identity.username,
          email: auth.identity.email,
          role: auth.identity.role,
        },
        csrfToken: auth.identity.csrfToken,
      },
      200,
      corsHeaders,
      { 'Cache-Control': 'no-store' }
    );
  }

  if (pathname === '/api/auth/player/register' && request.method === 'POST') {
    if (!hasOriginOk) return resJson({ error: 'Valid Origin required.' }, 403, corsHeaders);
    if (!hasExactJsonMediaType(request)) {
      return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
    }
    if (!db) return resJson({ error: 'Player registration database not configured.' }, 503, corsHeaders);

    const allowed = await checkRateLimit(`player-reg:${clientIp}`);
    if (!allowed) return resJson({ error: 'Too many signup attempts. Try later.' }, 429, corsHeaders);

    const body = await parseJsonSafe(request);
    if (!body) return resJson({ error: 'Invalid registration payload.' }, 400, corsHeaders);

    const reg = await registerPlayerAccountInD1(db, {
      username: String(body.username ?? ''),
      email: String(body.email ?? ''),
      password: String(body.password ?? ''),
      bgmiIgn: String(body.bgmiIgn ?? ''),
      bgmiCharId: String(body.bgmiCharId ?? ''),
      deviceType: body.deviceType ? String(body.deviceType) : undefined,
      roleTag: body.roleTag ? String(body.roleTag) : undefined,
      ipMasked: maskClientIp(clientIp),
    });

    if (!reg.ok) return resJson({ error: reg.error }, reg.status, corsHeaders);

    const issued = await issuePlayerSessionToken(reg.user.id, env.SESSION_SECRET);
    const nowSec = Math.floor(Date.now() / 1000);
    await registerSessionRecord(
      issued.jti,
      `player:${reg.user.username}`,
      nowSec,
      nowSec + 24 * 60 * 60,
      request,
      clientIp,
      env,
      fallback
    );

    const cookieHeader = buildNamedSessionCookieHeader(
      issued.token,
      HOST_PLAYER_COOKIE_NAME,
      PLAYER_COOKIE_NAME,
      {
        secure: isHttpsRequest(request),
        sameSite: determineCookieSameSite(request),
        maxAgeSeconds: 24 * 60 * 60,
      }
    );

    return resJson(
      { authenticated: true, user: reg.user, playerId: reg.playerId, csrfToken: issued.csrfToken },
      201,
      corsHeaders,
      { 'Set-Cookie': cookieHeader, 'Cache-Control': 'no-store' }
    );
  }

  if (pathname === '/api/auth/player/login' && request.method === 'POST') {
    if (!hasOriginOk) return resJson({ error: 'Valid Origin required.' }, 403, corsHeaders);
    if (!hasExactJsonMediaType(request)) {
      return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
    }
    if (!db) return resJson({ error: 'Database not configured.' }, 503, corsHeaders);

    const allowed = await checkRateLimit(`player-login:${clientIp}`);
    if (!allowed) return resJson({ error: 'Too many login attempts. Wait before retrying.' }, 429, corsHeaders);

    const body = await parseJsonSafe(request);
    if (!body) return resJson({ error: 'Invalid login payload.' }, 400, corsHeaders);

    const login = await loginPlayerAccountInD1(
      db,
      String(body.identifier ?? body.username ?? ''),
      String(body.password ?? '')
    );
    if (!login.ok) return resJson({ error: login.error }, login.status, corsHeaders);

    const issued = await issuePlayerSessionToken(login.user.id, env.SESSION_SECRET);
    const nowSec = Math.floor(Date.now() / 1000);
    await registerSessionRecord(
      issued.jti,
      `player:${login.user.username}`,
      nowSec,
      nowSec + 24 * 60 * 60,
      request,
      clientIp,
      env,
      fallback
    );

    const cookieHeader = buildNamedSessionCookieHeader(
      issued.token,
      HOST_PLAYER_COOKIE_NAME,
      PLAYER_COOKIE_NAME,
      {
        secure: isHttpsRequest(request),
        sameSite: determineCookieSameSite(request),
        maxAgeSeconds: 24 * 60 * 60,
      }
    );

    return resJson(
      { authenticated: true, user: login.user, csrfToken: issued.csrfToken },
      200,
      corsHeaders,
      { 'Set-Cookie': cookieHeader, 'Cache-Control': 'no-store' }
    );
  }

  if (pathname === '/api/auth/player/logout' && request.method === 'POST') {
    if (!hasOriginOk) return resJson({ error: 'Valid Origin required.' }, 403, corsHeaders);
    const rawLogoutToken = extractNamedCookie(request, HOST_PLAYER_COOKIE_NAME, PLAYER_COOKIE_NAME);
    if (rawLogoutToken && isValidSessionSecret(env.SESSION_SECRET)) {
      const claims = await verifySessionToken(rawLogoutToken, env.SESSION_SECRET);
      if (claims && claims.sub.startsWith('player:')) {
        const csrfOk = await verifyCsrfToken(
          request.headers.get('X-CSRF-Token'),
          claims.jti,
          claims.sub,
          env.SESSION_SECRET
        );
        if (!csrfOk) {
          return resJson({ error: 'Missing or invalid CSRF token.' }, 403, corsHeaders);
        }
        await revokeSessionByJti(claims.jti, claims.exp, env, fallback);
      }
    }
    const clearHeader = buildClearNamedCookieHeader(
      HOST_PLAYER_COOKIE_NAME,
      PLAYER_COOKIE_NAME,
      {
        secure: isHttpsRequest(request),
        sameSite: determineCookieSameSite(request),
      }
    );
    return resJson({ authenticated: false }, 200, corsHeaders, {
      'Set-Cookie': clearHeader,
      'Cache-Control': 'no-store',
    });
  }

  if (pathname.startsWith('/api/player/')) {
    if (!db) return resJson({ error: 'Database not configured.' }, 503, corsHeaders);
    if (isMutating && !hasOriginOk) {
      return resJson({ error: 'Valid Origin required.' }, 403, corsHeaders);
    }
    if (isMutating && !hasExactJsonMediaType(request)) {
      return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
    }
    const auth = await authenticatePlayerSession(request, env, fallback, isMutating);
    if (!auth.ok) {
      return resJson({ error: auth.error }, isMutating ? 403 : 401, corsHeaders);
    }

    if (pathname === '/api/player/me' && request.method === 'GET') {
      const dashboard = await getPlayerDashboardFromD1(db, auth.identity.userId);
      if (!dashboard) return resJson({ error: 'Player profile not found.' }, 404, corsHeaders);
      return resJson(dashboard, 200, corsHeaders, { 'Cache-Control': 'no-store' });
    }

    if (pathname === '/api/player/profile' && request.method === 'PUT') {
      const body = await parseJsonSafe(request);
      if (!body) return resJson({ error: 'Invalid profile update payload.' }, 400, corsHeaders);
      const updated = await updatePlayerProfileInD1(db, auth.identity.userId, {
        bgmiIgn: body.bgmiIgn !== undefined ? String(body.bgmiIgn) : undefined,
        bgmiCharId: body.bgmiCharId !== undefined ? String(body.bgmiCharId) : undefined,
        displayName: body.displayName !== undefined ? String(body.displayName) : undefined,
        deviceType: body.deviceType !== undefined ? String(body.deviceType) : undefined,
        roleTag: body.roleTag !== undefined ? String(body.roleTag) : undefined,
        region: body.region !== undefined ? String(body.region) : undefined,
        bio: body.bio !== undefined ? String(body.bio) : undefined,
      });
      if (!updated.ok) return resJson({ error: updated.error }, 400, corsHeaders);
      return resJson({ ok: true }, 200, corsHeaders);
    }

    if (pathname === '/api/player/teams' && request.method === 'POST') {
      const body = await parseJsonSafe(request);
      if (!body) return resJson({ error: 'Invalid team payload.' }, 400, corsHeaders);
      const created = await createTeamInD1(db, auth.identity.userId, {
        name: String(body.name ?? ''),
        tag: String(body.tag ?? ''),
        division: String(body.division ?? 'Squad') as TournamentFormat,
        description: body.description ? String(body.description) : '',
        logoUrl: body.logoUrl ? String(body.logoUrl) : '',
      });
      if (!created.ok) return resJson({ error: created.error }, created.status, corsHeaders);
      return resJson(created, 201, corsHeaders);
    }
  }

  return null;
}

export async function handleAdminPlatformRoute(params: {
  request: Request;
  pathname: string;
  url: URL;
  env: WorkerEnv;
  corsHeaders: Headers;
  fallback: LocalSecurityFallback;
  actorUsername: string;
  actorRole: RoleName;
  clientIp: string;
}): Promise<Response | null> {
  const { request, pathname, url, env, corsHeaders, fallback, actorUsername, actorRole, clientIp } = params;
  const db = env.DB;

  const deny = (permission: AdminPermission): Response | null => {
    if (!hasRolePermission(actorRole, permission)) {
      return resJson(
        { error: `Forbidden: role "${actorRole}" lacks "${permission}" permission.` },
        403,
        corsHeaders
      );
    }
    return null;
  };

  if (pathname === '/api/admin/overview' && request.method === 'GET') {
    const blocked = deny('overview:read');
    if (blocked) return blocked;
    if (!db) {
      return resJson(
        {
          databaseConnected: false,
          metrics: {
            totalTournaments: 0,
            activeTournaments: 0,
            registeredPlayers: 0,
            registeredTeams: 0,
            pendingRegistrations: 0,
            upcomingMatches: 0,
            completedMatches: 0,
          },
          recentRegistrations: [],
          recentActivities: [],
          registrationTrend: [],
        },
        200,
        corsHeaders
      );
    }
    const overview = await getAdminOverviewFromD1(db);
    return resJson({ databaseConnected: true, actorRole, ...overview }, 200, corsHeaders, {
      'Cache-Control': 'no-store',
    });
  }

  // --- WEBSITE CMS & CLOUDFLARE R2 MEDIA ENDPOINTS (Session + CSRF + Origin + RBAC) ---
  if (pathname.startsWith('/api/admin/cms/') || pathname.startsWith('/api/admin/media')) {
    if (!db) {
      return resJson({ error: 'Cloudflare D1 database binding (DB) is not configured.' }, 503, corsHeaders);
    }
    await ensureD1Schema(db);
    const ipMasked = maskClientIp(clientIp);
    const actor = { username: actorUsername, role: actorRole, ipMasked };

    if (pathname === '/api/admin/cms/workspace' && request.method === 'GET') {
      const blocked = deny('cms:read');
      if (blocked) return blocked;
      const workspace = await getAdminCmsWorkspace(db);
      return resJson(workspace, 200, corsHeaders, { 'Cache-Control': 'no-store' });
    }

    if (pathname === '/api/admin/cms/preview' && request.method === 'GET') {
      const blocked = deny('cms:read');
      if (blocked) return blocked;
      const draft = await readSnapshotStage(db, 'draft');
      return resJson({ preview: true, draft }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
    }

    if (pathname === '/api/admin/cms/draft' && request.method === 'PUT') {
      const blocked = deny('cms:write');
      if (blocked) return blocked;
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = await parseJsonSafe(request);
      if (!body || !body.snapshot) {
        return resJson({ error: 'CMS draft snapshot payload is required.' }, 400, corsHeaders);
      }
      const expectedDraftVersion =
        body.expectedDraftVersion !== undefined ? Number(body.expectedDraftVersion) : undefined;
      const saved = await saveCmsDraftStage({
        db,
        actor,
        payload: body.snapshot,
        expectedDraftVersion,
      });
      if (!saved.ok) {
        return resJson(
          { error: saved.error, ...(saved.details ? { details: saved.details } : {}) },
          saved.status,
          corsHeaders
        );
      }
      return resJson(saved, 200, corsHeaders);
    }

    if (pathname === '/api/admin/cms/publish' && request.method === 'POST') {
      const blocked = deny('cms:publish');
      if (blocked) return blocked;
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = (await parseJsonSafe(request)) ?? {};
      const published = await publishCmsDraftToLive({
        db,
        env,
        fallback,
        actor,
        summary: typeof body.summary === 'string' ? body.summary : undefined,
        onSyncLegacyCache: async (snap) => {
          await syncCmsIntoSiteSettings(db, snap);
          await syncD1ToPublicKv(db, env, fallback);
        },
      });
      if (!published.ok) {
        return resJson({ error: published.error }, published.status, corsHeaders);
      }
      return resJson(published, 200, corsHeaders);
    }

    if (pathname === '/api/admin/cms/rollback' && request.method === 'POST') {
      const blocked = deny('cms:publish');
      if (blocked) return blocked;
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = await parseJsonSafe(request);
      const revisionId = String(body?.revisionId ?? '').trim();
      if (!revisionId) {
        return resJson({ error: 'revisionId is required for rollback.' }, 400, corsHeaders);
      }
      const rolled = await rollbackCmsToRevision({
        db,
        env,
        fallback,
        actor,
        revisionId,
        onSyncLegacyCache: async (snap) => {
          await syncCmsIntoSiteSettings(db, snap);
          await syncD1ToPublicKv(db, env, fallback);
        },
      });
      if (!rolled.ok) {
        return resJson({ error: rolled.error }, rolled.status, corsHeaders);
      }
      return resJson(rolled, 200, corsHeaders);
    }

    if (pathname === '/api/admin/media' && request.method === 'GET') {
      const blocked = deny('cms:read');
      if (blocked) return blocked;
      const assets = await listMediaAssets(db);
      return resJson({ assets }, 200, corsHeaders, { 'Cache-Control': 'no-store' });
    }

    if (pathname === '/api/admin/media/upload' && request.method === 'POST') {
      const blocked = deny('media:write');
      if (blocked) return blocked;
      const res = await uploadImageAssetToR2({ request, db, env, actor });
      if (!res.ok) return resJson({ error: res.error }, res.status, corsHeaders);
      return resJson({ asset: res.asset }, res.status, corsHeaders);
    }

    if (
      pathname.startsWith('/api/admin/media/') &&
      pathname.endsWith('/replace') &&
      request.method === 'POST'
    ) {
      const blocked = deny('media:write');
      if (blocked) return blocked;
      const assetId = decodeURIComponent(
        pathname.slice('/api/admin/media/'.length, -'/replace'.length)
      );
      const res = await uploadImageAssetToR2({
        request,
        db,
        env,
        actor,
        replaceAssetId: assetId,
      });
      if (!res.ok) return resJson({ error: res.error }, res.status, corsHeaders);
      return resJson({ asset: res.asset }, res.status, corsHeaders);
    }

    if (pathname.startsWith('/api/admin/media/') && request.method === 'DELETE') {
      const blocked = deny('media:write');
      if (blocked) return blocked;
      const assetId = decodeURIComponent(pathname.slice('/api/admin/media/'.length));
      const force = url.searchParams.get('force') === 'true' || url.searchParams.get('force') === '1';
      const deleted = await deleteMediaAssetFromR2({ db, env, assetId, force, actor });
      if (!deleted.ok) {
        return resJson(
          { error: deleted.error, ...(deleted.referencedIn ? { referencedIn: deleted.referencedIn } : {}) },
          deleted.status,
          corsHeaders
        );
      }
      return resJson({ deleted: true }, 200, corsHeaders);
    }

    return resJson({ error: 'Unknown CMS or Media endpoint.' }, 404, corsHeaders);
  }

  // All following /api/admin/d1/* routes require DB bound
  if (!pathname.startsWith('/api/admin/d1/')) {
    return null;
  }
  if (!db) {
    return resJson({ error: 'Cloudflare D1 database binding (DB) is not configured.' }, 503, corsHeaders);
  }
  await ensureD1Schema(db);
  const ipMasked = maskClientIp(clientIp);
  const actor = { username: actorUsername, role: actorRole, ipMasked };

  // --- ADMIN TOURNAMENTS ---
  if (pathname === '/api/admin/d1/tournaments') {
    if (request.method === 'GET') {
      const blocked = deny('tournaments:read');
      if (blocked) return blocked;
      const rows = await db
        .prepare(
          `SELECT t.*,
                  (SELECT COUNT(*) FROM registrations r WHERE r.tournament_id = t.id AND r.status IN ('approved','pending')) AS registered_slots
           FROM tournaments t ORDER BY t.updated_at DESC`
        )
        .all<Record<string, unknown>>();
      return resJson(
        { tournaments: rows.results.map((r) => mapTournamentRow(r, Number(r.registered_slots ?? 0))) },
        200,
        corsHeaders
      );
    }
    if (request.method === 'POST') {
      const blocked = deny('tournaments:write');
      if (blocked) return blocked;
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = await parseJsonSafe(request);
      if (!body) return resJson({ error: 'Invalid tournament JSON.' }, 400, corsHeaders);
      const saved = await adminUpsertTournamentInD1(db, env, fallback, body, actor);
      if (!saved.ok) return resJson({ error: saved.error }, saved.status, corsHeaders);
      return resJson(saved, 200, corsHeaders);
    }
  }

  if (pathname.startsWith('/api/admin/d1/tournaments/') && request.method === 'DELETE') {
    const blocked = deny('tournaments:write');
    if (blocked) return blocked;
    const id = decodeURIComponent(pathname.slice('/api/admin/d1/tournaments/'.length));
    await db.prepare('DELETE FROM tournaments WHERE id = ?').bind(id).run();
    await recordActivityLog(db, {
      actorUsername,
      actorRole,
      action: 'tournament_deleted',
      targetType: 'tournament',
      targetId: id,
      ipMasked,
      summary: `Deleted tournament ${id}.`,
    });
    await syncD1ToPublicKv(db, env, fallback);
    return resJson({ deleted: true }, 200, corsHeaders);
  }

  // --- ADMIN REGISTRATIONS ---
  if (pathname === '/api/admin/d1/registrations' && request.method === 'GET') {
    const blocked = deny('registrations:read');
    if (blocked) return blocked;
    const statusFilter = url.searchParams.get('status') ?? 'All';
    const tournFilter = url.searchParams.get('tournamentId') ?? '';
    const rows = await db
      .prepare(
        `SELECT r.*, t.title AS tournament_title
         FROM registrations r
         JOIN tournaments t ON t.id = r.tournament_id
         ORDER BY r.created_at DESC`
      )
      .all<Record<string, unknown>>();
    const filtered = rows.results.filter(
      (r) =>
        (statusFilter === 'All' || String(r.status) === statusFilter) &&
        (!tournFilter || String(r.tournament_id) === tournFilter)
    );
    return resJson({ registrations: filtered }, 200, corsHeaders);
  }

  if (pathname.startsWith('/api/admin/d1/registrations/') && request.method === 'PATCH') {
    const blocked = deny('registrations:write');
    if (blocked) return blocked;
    if (!hasExactJsonMediaType(request)) {
      return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
    }
    const regId = decodeURIComponent(pathname.slice('/api/admin/d1/registrations/'.length));
    const body = await parseJsonSafe(request);
    if (!body) return resJson({ error: 'Invalid status payload.' }, 400, corsHeaders);
    const nextStatus = String(body.status ?? '');
    if (!['pending', 'approved', 'rejected', 'waitlisted'].includes(nextStatus)) {
      return resJson({ error: 'Invalid registration status.' }, 400, corsHeaders);
    }
    const res = await adminUpdateRegistrationStatusInD1(
      db,
      regId,
      nextStatus as 'pending' | 'approved' | 'rejected' | 'waitlisted',
      String(body.reviewNotes ?? ''),
      actor
    );
    if (!res.ok) return resJson({ error: res.error }, res.status, corsHeaders);
    await syncD1ToPublicKv(db, env, fallback);
    return resJson({ ok: true }, 200, corsHeaders);
  }

  // --- ADMIN TEAMS ---
  if (pathname === '/api/admin/d1/teams' && request.method === 'GET') {
    const blocked = deny('teams:read');
    if (blocked) return blocked;
    const rows = await db
      .prepare(
        `SELECT t.*, p.bgmi_ign AS captain_ign,
                (SELECT COUNT(*) FROM team_members tm WHERE tm.team_id = t.id) AS member_count,
                (SELECT COUNT(*) FROM match_results mr WHERE mr.team_id = t.id AND mr.verified = 1) AS matches_played,
                (SELECT COALESCE(SUM(CASE WHEN mr.placement = 1 THEN 1 ELSE 0 END), 0) FROM match_results mr WHERE mr.team_id = t.id AND mr.verified = 1) AS total_wins,
                (SELECT COALESCE(SUM(mr.kills), 0) FROM match_results mr WHERE mr.team_id = t.id AND mr.verified = 1) AS total_kills,
                (SELECT COALESCE(SUM(mr.total_points), 0) FROM match_results mr WHERE mr.team_id = t.id AND mr.verified = 1) AS total_points
         FROM teams t LEFT JOIN players p ON p.id = t.captain_player_id ORDER BY total_points DESC, t.created_at DESC`
      )
      .all<Record<string, unknown>>();
    return resJson({ teams: rows.results }, 200, corsHeaders);
  }

  if (pathname.startsWith('/api/admin/d1/teams/')) {
    const blocked = deny('teams:write');
    if (blocked) return blocked;
    const teamId = decodeURIComponent(pathname.slice('/api/admin/d1/teams/'.length));
    if (request.method === 'PATCH') {
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = await parseJsonSafe(request);
      if (!body) return resJson({ error: 'Invalid team update.' }, 400, corsHeaders);
      await db
        .prepare('UPDATE teams SET verified = ?, updated_at = ? WHERE id = ?')
        .bind(body.verified ? 1 : 0, new Date().toISOString(), teamId)
        .run();
      await recordActivityLog(db, {
        actorUsername,
        actorRole,
        action: 'team_verified',
        targetType: 'team',
        targetId: teamId,
        ipMasked,
        summary: `${body.verified ? 'Verified' : 'Unverified'} team ${teamId}.`,
      });
      await syncD1ToPublicKv(db, env, fallback);
      return resJson({ ok: true }, 200, corsHeaders);
    }
    if (request.method === 'DELETE') {
      await db.prepare('DELETE FROM teams WHERE id = ?').bind(teamId).run();
      await syncD1ToPublicKv(db, env, fallback);
      return resJson({ deleted: true }, 200, corsHeaders);
    }
  }

  // --- ADMIN PLAYERS ---
  if (pathname === '/api/admin/d1/players' && request.method === 'GET') {
    const blocked = deny('players:read');
    if (blocked) return blocked;
    const rows = await db
      .prepare(
        `SELECT p.*, u.username, u.account_status FROM players p LEFT JOIN users u ON u.id = p.user_id ORDER BY p.total_points DESC, p.created_at DESC`
      )
      .all<Record<string, unknown>>();
    return resJson({ players: rows.results }, 200, corsHeaders);
  }

  if (pathname.startsWith('/api/admin/d1/players/')) {
    const blocked = deny('players:write');
    if (blocked) return blocked;
    const playerId = decodeURIComponent(pathname.slice('/api/admin/d1/players/'.length));
    if (request.method === 'PATCH') {
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = await parseJsonSafe(request);
      if (!body) return resJson({ error: 'Invalid player update.' }, 400, corsHeaders);
      await db
        .prepare('UPDATE players SET verified = ?, updated_at = ? WHERE id = ?')
        .bind(body.verified ? 1 : 0, new Date().toISOString(), playerId)
        .run();
      return resJson({ ok: true }, 200, corsHeaders);
    }
    if (request.method === 'DELETE') {
      await db.prepare('DELETE FROM players WHERE id = ?').bind(playerId).run();
      await recalculateAllPlayerStats(db);
      await syncD1ToPublicKv(db, env, fallback);
      return resJson({ deleted: true }, 200, corsHeaders);
    }
  }

  // --- ADMIN MATCHES ---
  if (pathname === '/api/admin/d1/matches') {
    if (request.method === 'GET') {
      const blocked = deny('matches:read');
      if (blocked) return blocked;
      const rows = await db
        .prepare(
          `SELECT m.*, t.title AS tournament_title, t.format AS division
           FROM matches m JOIN tournaments t ON t.id = m.tournament_id ORDER BY m.scheduled_at DESC`
        )
        .all<Record<string, unknown>>();
      return resJson({ matches: rows.results }, 200, corsHeaders);
    }
    if (request.method === 'POST') {
      const blocked = deny('matches:write');
      if (blocked) return blocked;
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = await parseJsonSafe(request);
      if (!body) return resJson({ error: 'Invalid match JSON.' }, 400, corsHeaders);
      const created = await adminCreateMatchInD1(db, body, actor);
      if (!created.ok) return resJson({ error: created.error }, created.status ?? 400, corsHeaders);
      await syncD1ToPublicKv(db, env, fallback);
      return resJson(created, 201, corsHeaders);
    }
  }

  if (pathname.startsWith('/api/admin/d1/matches/')) {
    const blocked = deny('matches:write');
    if (blocked) return blocked;
    const matchId = decodeURIComponent(pathname.slice('/api/admin/d1/matches/'.length));
    if (request.method === 'PATCH') {
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = await parseJsonSafe(request);
      if (!body) return resJson({ error: 'Invalid match update.' }, 400, corsHeaders);
      const status = String(body.status ?? 'upcoming');
      if (!['upcoming', 'live', 'completed', 'cancelled'].includes(status)) {
        return resJson({ error: 'Invalid match status.' }, 400, corsHeaders);
      }
      await db
        .prepare('UPDATE matches SET status = ?, updated_at = ? WHERE id = ?')
        .bind(status, new Date().toISOString(), matchId)
        .run();
      await syncD1ToPublicKv(db, env, fallback);
      return resJson({ ok: true }, 200, corsHeaders);
    }
    if (request.method === 'DELETE') {
      await db.prepare('DELETE FROM matches WHERE id = ?').bind(matchId).run();
      await recalculateAllPlayerStats(db);
      await syncD1ToPublicKv(db, env, fallback);
      return resJson({ deleted: true }, 200, corsHeaders);
    }
  }

  // --- ADMIN RESULTS & LEADERBOARD RECALCULATION ---
  if (pathname === '/api/admin/d1/results') {
    if (request.method === 'GET') {
      const blocked = deny('results:read');
      if (blocked) return blocked;
      const rows = await db
        .prepare(
          `SELECT mr.*, m.title AS match_title, t.title AS tournament_title
           FROM match_results mr
           JOIN matches m ON m.id = mr.match_id
           JOIN tournaments t ON t.id = mr.tournament_id
           ORDER BY mr.created_at DESC`
        )
        .all<Record<string, unknown>>();
      return resJson({ results: rows.results }, 200, corsHeaders);
    }
    if (request.method === 'POST') {
      const blocked = deny('results:write');
      if (blocked) return blocked;
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = await parseJsonSafe(request);
      if (!body) return resJson({ error: 'Invalid result JSON.' }, 400, corsHeaders);
      const res = await adminSubmitMatchResultInD1(
        db,
        {
          matchId: String(body.matchId ?? ''),
          tournamentId: String(body.tournamentId ?? ''),
          teamId: body.teamId ? String(body.teamId) : undefined,
          playerId: body.playerId ? String(body.playerId) : undefined,
          participantName: String(body.participantName ?? ''),
          placement: Number(body.placement),
          kills: Number(body.kills),
          placementPoints: body.placementPoints !== undefined ? Number(body.placementPoints) : undefined,
          killPoints: body.killPoints !== undefined ? Number(body.killPoints) : undefined,
        },
        actor,
        { env, fallback }
      );
      if (!res.ok) return resJson({ error: res.error }, res.status, corsHeaders);
      return resJson(res, 201, corsHeaders);
    }
  }

  if (pathname.startsWith('/api/admin/d1/results/') && request.method === 'DELETE') {
    const blocked = deny('results:write');
    if (blocked) return blocked;
    const id = decodeURIComponent(pathname.slice('/api/admin/d1/results/'.length));
    await db.prepare('DELETE FROM match_results WHERE id = ?').bind(id).run();
    await recalculateAllPlayerStats(db);
    await syncD1ToPublicKv(db, env, fallback);
    return resJson({ deleted: true }, 200, corsHeaders);
  }

  if (pathname === '/api/admin/d1/leaderboard/recalculate' && request.method === 'POST') {
    const blocked = deny('leaderboard:write');
    if (blocked) return blocked;
    await recalculateAllPlayerStats(db);
    await syncD1ToPublicKv(db, env, fallback);
    await recordActivityLog(db, {
      actorUsername,
      actorRole,
      action: 'leaderboard_recalculated',
      targetType: 'leaderboard',
      ipMasked,
      summary: 'Recalculated all player and team leaderboard standings from verified match results.',
    });
    return resJson({ ok: true }, 200, corsHeaders);
  }

  // --- ADMIN NEWS ---
  if (pathname === '/api/admin/d1/news') {
    if (request.method === 'GET') {
      const blocked = deny('news:read');
      if (blocked) return blocked;
      const rows = await db
        .prepare('SELECT * FROM news ORDER BY pinned DESC, published_date DESC')
        .all<Record<string, unknown>>();
      return resJson({ entries: rows.results }, 200, corsHeaders);
    }
    if (request.method === 'POST') {
      const blocked = deny('news:write');
      if (blocked) return blocked;
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = await parseJsonSafe(request);
      if (!body) {
        return resJson({ error: 'Invalid news JSON.' }, 400, corsHeaders);
      }
      const saved = await adminUpsertNewsInD1(db, env, fallback, body, actor);
      if (!saved.ok) return resJson({ error: saved.error }, saved.status, corsHeaders);
      return resJson({ ok: true, id: saved.id }, 200, corsHeaders);
    }
  }

  if (pathname.startsWith('/api/admin/d1/news/') && request.method === 'DELETE') {
    const blocked = deny('news:write');
    if (blocked) return blocked;
    const id = decodeURIComponent(pathname.slice('/api/admin/d1/news/'.length));
    await db.prepare('DELETE FROM news WHERE id = ?').bind(id).run();
    await recordActivityLog(db, {
      actorUsername,
      actorRole,
      action: 'news_deleted',
      targetType: 'news',
      targetId: id,
      ipMasked,
      summary: `Deleted news announcement ${id}.`,
    });
    await syncD1ToPublicKv(db, env, fallback);
    return resJson({ deleted: true }, 200, corsHeaders);
  }

  // --- ADMIN REPORTS & ANALYTICS ---
  if (pathname === '/api/admin/d1/reports' && request.method === 'GET') {
    const blocked = deny('reports:read');
    if (blocked) return blocked;
    const reports = await adminGetReportsFromD1(db);
    return resJson(reports, 200, corsHeaders);
  }

  // --- ADMIN USERS & RBAC ROLES ---
  if (pathname === '/api/admin/d1/roles' && request.method === 'GET') {
    const blocked = deny('users:read');
    if (blocked) return blocked;
    const rows = await db.prepare('SELECT * FROM roles ORDER BY id ASC').all<Record<string, unknown>>();
    return resJson(
      {
        roles: rows.results.map((r) => ({
          id: String(r.id),
          displayName: String(r.display_name),
          description: String(r.description),
          permissions: safeJsonParse<string[]>(String(r.permissions_json ?? '[]'), []),
        })),
      },
      200,
      corsHeaders
    );
  }

  if (pathname === '/api/admin/d1/users') {
    if (request.method === 'GET') {
      const blocked = deny('users:read');
      if (blocked) return blocked;
      const rows = await db
        .prepare(
          'SELECT id, username, email, role_id, account_status, created_at, last_login_at FROM users ORDER BY created_at DESC'
        )
        .all<Record<string, unknown>>();
      return resJson({ users: rows.results }, 200, corsHeaders);
    }
    if (request.method === 'POST') {
      const blocked = deny('roles:write');
      if (blocked) return blocked;
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = await parseJsonSafe(request);
      if (!body) return resJson({ error: 'Invalid user payload.' }, 400, corsHeaders);
      const roleId = String(body.roleId ?? 'moderator') as RoleName;
      if (roleId !== 'player' && !isStaffRole(roleId)) {
        return resJson({ error: 'Invalid role specified.' }, 400, corsHeaders);
      }
      const created = await adminCreateStaffOrUserInD1(
        db,
        {
          username: String(body.username ?? ''),
          email: String(body.email ?? ''),
          password: String(body.password ?? ''),
          roleId,
        },
        actor
      );
      if (!created.ok) return resJson({ error: created.error }, created.status, corsHeaders);
      return resJson(created, 201, corsHeaders);
    }
  }

  if (pathname.startsWith('/api/admin/d1/users/') && request.method === 'PATCH') {
    const blocked = deny('users:write');
    if (blocked) return blocked;
    if (!hasExactJsonMediaType(request)) {
      return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
    }
    const targetId = decodeURIComponent(pathname.slice('/api/admin/d1/users/'.length));
    const body = await parseJsonSafe(request);
    if (!body) return resJson({ error: 'Invalid user patch.' }, 400, corsHeaders);
    if (body.roleId !== undefined) {
      const roleBlocked = deny('roles:write');
      if (roleBlocked) return roleBlocked;
    }
    const res = await adminUpdateUserRoleOrStatusInD1(
      db,
      targetId,
      {
        roleId: body.roleId ? (String(body.roleId) as RoleName) : undefined,
        accountStatus: body.accountStatus
          ? (String(body.accountStatus) as 'active' | 'suspended' | 'banned')
          : undefined,
      },
      actor
    );
    if (!res.ok) return resJson({ error: res.error }, res.status, corsHeaders);
    return resJson({ ok: true }, 200, corsHeaders);
  }

  // --- ADMIN SITE SETTINGS ---
  if (pathname === '/api/admin/d1/settings') {
    if (request.method === 'GET') {
      const blocked = deny('overview:read');
      if (blocked) return blocked;
      const row = await db
        .prepare(`SELECT value_json, updated_at FROM site_settings WHERE setting_key = 'site_config' LIMIT 1`)
        .first<{ value_json: string; updated_at: string }>();
      return resJson(
        { siteConfig: row ? safeJsonParse(row.value_json, null) : null, updatedAt: row?.updated_at ?? null },
        200,
        corsHeaders
      );
    }
    if (request.method === 'PUT') {
      const blocked = deny('settings:write');
      if (blocked) return blocked;
      if (!hasExactJsonMediaType(request)) {
        return resJson({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
      }
      const body = await parseJsonSafe(request);
      if (!body || !body.siteConfig) {
        return resJson({ error: 'Settings siteConfig payload is required.' }, 400, corsHeaders);
      }
      const saved = await adminUpsertSiteSettingsInD1(db, env, fallback, body.siteConfig, actor);
      if (!saved.ok) return resJson({ error: saved.error }, saved.status, corsHeaders);
      return resJson({ ok: true, updatedAt: saved.updatedAt }, 200, corsHeaders);
    }
  }

  // --- ADMIN ACTIVITY LOGS ---
  if (pathname === '/api/admin/d1/activity-logs' && request.method === 'GET') {
    const blocked = deny('logs:read');
    if (blocked) return blocked;
    const rows = await db
      .prepare('SELECT * FROM activity_logs ORDER BY timestamp DESC LIMIT 150')
      .all<Record<string, unknown>>();
    return resJson({ logs: rows.results }, 200, corsHeaders);
  }

  return null;
}
