import {
  DEFAULT_TTL_SECONDS,
  deriveCsrfToken,
  isHttpsRequest,
  isValidSessionSecret,
  issueSession,
  verifyCsrfToken,
  verifySessionToken,
} from './auth.ts';
import {
  isSessionActive,
  type LocalSecurityFallback,
} from './securityStore.ts';
import type { RoleName, StaffRoleName, WorkerEnv } from './types.ts';

export const PLAYER_COOKIE_NAME = 'nexusx_player_session';
export const HOST_PLAYER_COOKIE_NAME = '__Host-nexusx_player_session';
export const PLAYER_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export type AdminPermission =
  | 'overview:read'
  | 'tournaments:read'
  | 'tournaments:write'
  | 'registrations:read'
  | 'registrations:write'
  | 'teams:read'
  | 'teams:write'
  | 'players:read'
  | 'players:write'
  | 'matches:read'
  | 'matches:write'
  | 'results:read'
  | 'results:write'
  | 'leaderboard:read'
  | 'leaderboard:write'
  | 'news:read'
  | 'news:write'
  | 'reports:read'
  | 'users:read'
  | 'users:write'
  | 'roles:write'
  | 'settings:write'
  | 'cms:read'
  | 'cms:write'
  | 'cms:publish'
  | 'media:write'
  | 'seo:write'
  | 'logs:read'
  | 'security:write';

export const STAFF_ROLES: readonly StaffRoleName[] = [
  'owner',
  'tournament_manager',
  'moderator',
  'result_manager',
];

export const ROLE_PERMISSION_MATRIX: Record<RoleName, readonly string[]> = {
  owner: ['*'],
  tournament_manager: [
    'overview:read',
    'tournaments:read',
    'tournaments:write',
    'registrations:read',
    'registrations:write',
    'teams:read',
    'teams:write',
    'players:read',
    'matches:read',
    'matches:write',
    'results:read',
    'leaderboard:read',
    'news:read',
    'news:write',
    'cms:read',
    'cms:write',
    'media:write',
    'reports:read',
    'logs:read',
  ],
  moderator: [
    'overview:read',
    'tournaments:read',
    'registrations:read',
    'registrations:write',
    'teams:read',
    'teams:write',
    'players:read',
    'players:write',
    'matches:read',
    'news:read',
    'news:write',
    'cms:read',
    'cms:write',
    'media:write',
    'logs:read',
  ],
  result_manager: [
    'overview:read',
    'tournaments:read',
    'matches:read',
    'matches:write',
    'results:read',
    'results:write',
    'leaderboard:read',
    'leaderboard:write',
    'reports:read',
  ],
  player: ['player:self'],
};

export function hasRolePermission(role: RoleName, permission: AdminPermission): boolean {
  const perms = ROLE_PERMISSION_MATRIX[role] ?? [];
  if (perms.includes('*')) return true;
  if (perms.includes(permission)) return true;
  // `:write` grants matching `:read` visibility
  if (permission.endsWith(':read')) {
    const writePerm = `${permission.slice(0, -5)}:write`;
    return perms.includes(writePerm);
  }
  return false;
}

export function isStaffRole(role: string): role is StaffRoleName {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export interface PlayerSessionIdentity {
  userId: string;
  username: string;
  email: string;
  role: RoleName;
  jti: string;
  csrfToken: string;
}

export function extractNamedCookie(
  request: Request,
  httpsName: string,
  httpName: string
): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;
  const expectedName = isHttpsRequest(request) ? httpsName : httpName;

  for (const rawCookie of cookieHeader.split(';')) {
    const eqIndex = rawCookie.indexOf('=');
    if (eqIndex <= 0) continue;
    const name = rawCookie.slice(0, eqIndex).trim();
    if (name === expectedName) {
      const value = rawCookie.slice(eqIndex + 1).trim();
      return value || null;
    }
  }
  return null;
}

export function buildNamedSessionCookieHeader(
  token: string,
  httpsName: string,
  httpName: string,
  options: { secure?: boolean; sameSite?: 'Strict' | 'Lax' | 'None'; maxAgeSeconds?: number } = {}
): string {
  const secure = options.secure ?? true;
  const maxAge = options.maxAgeSeconds ?? DEFAULT_TTL_SECONDS;
  if (!secure) {
    return `${httpName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  }
  const sameSite = options.sameSite ?? 'None';
  const partitioned = sameSite === 'None';
  return `${httpsName}=${token}; Path=/; HttpOnly; Secure; SameSite=${sameSite}${
    partitioned ? '; Partitioned' : ''
  }; Max-Age=${maxAge}`;
}

export function buildClearNamedCookieHeader(
  httpsName: string,
  httpName: string,
  options: { secure?: boolean; sameSite?: 'Strict' | 'Lax' | 'None' } = {}
): string {
  const secure = options.secure ?? true;
  if (!secure) {
    return `${httpName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }
  const sameSite = options.sameSite ?? 'None';
  const partitioned = sameSite === 'None';
  return `${httpsName}=${''}; Path=/; HttpOnly; Secure; SameSite=${sameSite}${
    partitioned ? '; Partitioned' : ''
  }; Max-Age=0`;
}

export async function issuePlayerSessionToken(
  userId: string,
  secret: string
): Promise<{ token: string; jti: string; csrfToken: string }> {
  const { token, claims } = await issueSession(
    `player:${userId}`,
    secret,
    24 * 60 * 60
  );
  const csrfToken = await deriveCsrfToken(claims.jti, claims.sub, secret);
  return { token, jti: claims.jti, csrfToken };
}

export async function authenticatePlayerSession(
  request: Request,
  env: WorkerEnv,
  fallback: LocalSecurityFallback,
  requireCsrf = false
): Promise<{ ok: true; identity: PlayerSessionIdentity } | { ok: false; error: string }> {
  if (!isValidSessionSecret(env.SESSION_SECRET)) {
    return { ok: false, error: 'Authentication service is unavailable.' };
  }

  const token = extractNamedCookie(request, HOST_PLAYER_COOKIE_NAME, PLAYER_COOKIE_NAME);
  if (!token) {
    return { ok: false, error: 'Player login required.' };
  }

  const claims = await verifySessionToken(token, env.SESSION_SECRET);
  if (!claims || !claims.sub.startsWith('player:')) {
    return { ok: false, error: 'Invalid or expired player session.' };
  }

  const active = await isSessionActive(
    claims.jti,
    claims.iat,
    claims.iatMs,
    0,
    0,
    env,
    fallback
  );
  if (!active) {
    return { ok: false, error: 'Player session revoked or expired.' };
  }

  if (requireCsrf) {
    const csrfHeader = request.headers.get('X-CSRF-Token') ?? '';
    const validCsrf = await verifyCsrfToken(csrfHeader, claims.jti, claims.sub, env.SESSION_SECRET);
    if (!validCsrf) {
      return { ok: false, error: 'Missing or invalid CSRF token.' };
    }
  }

  const userId = claims.sub.slice('player:'.length);
  if (!env.DB) {
    return { ok: false, error: 'Player database not configured.' };
  }

  const userRow = await env.DB.prepare(
    'SELECT id, username, email, role_id, account_status FROM users WHERE id = ? LIMIT 1'
  )
    .bind(userId)
    .first<{
      id: string;
      username: string;
      email: string;
      role_id: RoleName;
      account_status: string;
    }>();

  if (!userRow || userRow.account_status !== 'active') {
    return { ok: false, error: 'Player account is inactive or suspended.' };
  }

  const csrfToken = await deriveCsrfToken(claims.jti, claims.sub, env.SESSION_SECRET);
  return {
    ok: true,
    identity: {
      userId: userRow.id,
      username: userRow.username,
      email: userRow.email,
      role: userRow.role_id,
      jti: claims.jti,
      csrfToken,
    },
  };
}
