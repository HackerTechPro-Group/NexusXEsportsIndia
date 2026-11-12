import {
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  DEFAULT_TTL_SECONDS,
  deriveCsrfToken,
  determineCookieSameSite,
  extractSessionToken,
  hasExactJsonMediaType,
  hasValidStateChangeOrigin,
  hashAndCompareConstantTime,
  hashPasswordPBKDF2,
  isHttpsRequest,
  isValidSessionSecret,
  issueSession,
  verifyCsrfToken,
  verifyPasswordPBKDF2,
  verifySessionToken,
} from './auth.ts';
import { syncAdminBundleToD1, syncD1ToPublicKv } from './d1Admin.ts';
import { handlePublicCmsRequest, handlePublicMediaGet } from './cmsService.ts';
import {
  commitAdminContentToGitHub,
  GitHubIntegrationError,
  readAdminContentFromGitHub,
} from './githubApp.ts';
import { createLoginRateLimiter, extractClientIp, type LoginRateLimitOptions } from './rateLimit.ts';
import {
  appendSecurityAuditEvent,
  createLocalSecurityFallback,
  isProductionEnv,
  isSessionActive,
  listActiveSessionRecords,
  parseAllowedOrigins,
  readLivePublicContent,
  readPrivateSheetsConfig,
  readSandboxContent,
  readSecurityAuditLog,
  registerSessionRecord,
  resolveActiveOwner,
  revokeAllSessions,
  revokeSessionByJti,
  saveOwnerAccount,
  writeLivePublicContent,
  writePrivateSheetsConfig,
  writeSandboxContent,
} from './securityStore.ts';
import {
  resolveSecurityKv,
  type AdminContentBundle,
  type RoleName,
  type TournamentFormat,
  type WorkerEnv,
} from './types.ts';
import {
  handleAdminPlatformRoute,
  handlePublicAndPlayerPlatformRoute,
} from './platformRouter.ts';
import { isStaffRole } from './rbac.ts';
import { ensureD1Schema } from './schema.ts';
import {
  containsPrivateSheetReference,
  containsSecretMaterial,
  validateAdminContentPayload,
  validateChangeIdPayload,
  validateChangePasswordPayload,
  validateGenerateIdPayload,
  validateLoginPayload,
  validatePrivateSheetsPayload,
  validateSetupPayload,
} from './validators.ts';

const MAX_LOGIN_BODY_BYTES = 4096;
const MAX_CONTENT_BODY_BYTES = 262_144;

class BodyTooLargeError extends Error {
  constructor() {
    super('Request body exceeds allowed size limit.');
    this.name = 'BodyTooLargeError';
  }
}

class MalformedJsonError extends Error {
  constructor() {
    super('Malformed JSON body.');
    this.name = 'MalformedJsonError';
  }
}

function buildSecurityAndCorsHeaders(request: Request, env: WorkerEnv): {
  allowed: boolean;
  originPresent: boolean;
  originVerified: boolean;
  headers: Headers;
} {
  const rawOrigin = request.headers.get('Origin')?.trim().replace(/\/+$/g, '');
  const secure = isHttpsRequest(request);
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    Vary: 'Origin',
  });

  if (secure) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  if (!rawOrigin) {
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    return { allowed: true, originPresent: false, originVerified: false, headers };
  }

  const allowlist = parseAllowedOrigins(env.ALLOWED_ORIGINS);
  if (!allowlist.has(rawOrigin)) {
    headers.set('Cross-Origin-Resource-Policy', 'same-origin');
    return { allowed: false, originPresent: true, originVerified: false, headers };
  }

  headers.set('Access-Control-Allow-Origin', rawOrigin);
  headers.set('Access-Control-Allow-Credentials', 'true');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  return { allowed: true, originPresent: true, originVerified: true, headers };
}

/**
 * Strictly scopes the in-memory admin content sandbox to local loopback dev (`wrangler dev`)
 * when GitHub App secrets have not yet been configured.
 * Production environments and non-loopback hostnames always fail closed via GitHub integration.
 */
function isLocalLoopbackContentSandbox(url: URL, env: WorkerEnv): boolean {
  if (isProductionEnv(env)) return false;
  if (env.ENVIRONMENT?.trim().toLowerCase() !== 'development') return false;
  const host = url.hostname.toLowerCase();
  if (host !== 'localhost' && host !== '127.0.0.1') return false;
  return (
    !env.GITHUB_APP_ID?.trim() &&
    !env.GITHUB_APP_INSTALLATION_ID?.trim() &&
    !env.GITHUB_APP_PRIVATE_KEY?.trim()
  );
}

function jsonResponse(
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

async function readBoundedJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const contentLengthHeader = request.headers.get('Content-Length');
  if (contentLengthHeader !== null) {
    const parsedLength = Number.parseInt(contentLengthHeader, 10);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new BodyTooLargeError();
    }
  }

  if (!request.body) {
    return {};
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError();
      }
      chunks.push(value);
    }
  }

  if (totalBytes === 0) return {};
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const rawText = new TextDecoder('utf-8', { fatal: false }).decode(merged);
  if (!rawText.trim()) return {};
  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    throw new MalformedJsonError();
  }
}

/**
 * Enforces optional Cloudflare Zero Trust Access identity matching whenever
 * `CLOUDFLARE_ACCESS_OWNER_EMAIL` is provisioned in the Worker environment.
 */
async function isCloudflareAccessOwnerSatisfied(
  request: Request,
  env: WorkerEnv
): Promise<boolean> {
  const expectedEmail = env.CLOUDFLARE_ACCESS_OWNER_EMAIL?.trim().toLowerCase() ?? '';
  if (!expectedEmail) {
    return true;
  }
  const actualEmail =
    request.headers.get('Cf-Access-Authenticated-User-Email')?.trim().toLowerCase() ?? '';
  if (!actualEmail) {
    return false;
  }
  return hashAndCompareConstantTime(actualEmail, expectedEmail);
}

function generateNextTournamentId(format: TournamentFormat, takenIds: Set<string>): {
  id: string;
  slugSuggestion: string;
} {
  const prefix = `NX-${format.toUpperCase()}-`;
  let maxNum = 0;
  for (const rawId of takenIds) {
    if (rawId.toUpperCase().startsWith(prefix)) {
      const tail = rawId.slice(prefix.length);
      const parsed = Number.parseInt(tail, 10);
      if (Number.isFinite(parsed) && parsed > maxNum) {
        maxNum = parsed;
      }
    }
  }
  let candidateNum = maxNum + 1;
  let id = `${prefix}${String(candidateNum).padStart(3, '0')}`;
  while (takenIds.has(id)) {
    candidateNum += 1;
    id = `${prefix}${String(candidateNum).padStart(3, '0')}`;
  }
  return {
    id,
    slugSuggestion: `${format.toLowerCase()}-tournament-${String(candidateNum).padStart(3, '0')}`,
  };
}

export interface WorkerDependencies {
  fetchFn?: typeof fetch;
  rateLimitOptions?: LoginRateLimitOptions;
}

/**
 * Creates the hardened Cloudflare Worker fetch handler with cookie-only auth,
 * HMAC-bound CSRF tokens, persistent KV owner credentials/sessions/audit logs,
 * private Google Sheet tracking storage, and minimum-permission GitHub App commits.
 */
export function createWorkerHandler(deps: WorkerDependencies = {}) {
  const fetchFn = deps.fetchFn ?? fetch;
  const loginLimiter = createLoginRateLimiter(deps.rateLimitOptions);
  const localFallback = createLocalSecurityFallback();

  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      const { allowed, originPresent, originVerified, headers: corsHeaders } =
        buildSecurityAndCorsHeaders(request, env);

      if (!allowed) {
        return jsonResponse({ error: 'Origin not permitted by CORS policy.' }, 403, corsHeaders);
      }

      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      const url = new URL(request.url);
      const pathname = url.pathname.replace(/\/+$/g, '') || '/';
      const secure = isHttpsRequest(request);
      const sameSite = determineCookieSameSite(request);
      const cookieOpts = { secure, sameSite, partitioned: sameSite === 'None' };
      const clientIp = extractClientIp(request);

      try {
        if (request.method === 'GET' && pathname === '/api/health') {
          return jsonResponse(
            {
              ok: true,
              service: 'nexusx-esports-admin-worker',
              branch: env.GITHUB_BRANCH || 'main',
            },
            200,
            corsHeaders
          );
        }

        // Read-only live public content cache (sanitized: strips drafts, archived items, secrets & sheet URLs)
        if (request.method === 'GET' && pathname === '/api/public/content') {
          let live = await readLivePublicContent(env, localFallback);
          if (!live && env.DB) {
            await ensureD1Schema(env.DB);
            const [tCnt, nCnt] = await Promise.all([
              env.DB
                .prepare(`SELECT COUNT(*) AS cnt FROM tournaments WHERE published = 1 AND status NOT IN ('draft', 'archived')`)
                .first<{ cnt: number }>(),
              env.DB
                .prepare(`SELECT COUNT(*) AS cnt FROM news WHERE published = 1 AND archived = 0`)
                .first<{ cnt: number }>(),
            ]);
            if (Number(tCnt?.cnt ?? 0) > 0 || Number(nCnt?.cnt ?? 0) > 0) {
              await syncD1ToPublicKv(env.DB, env, localFallback);
              live = await readLivePublicContent(env, localFallback);
            }
          }
          if (
            !live ||
            containsSecretMaterial(live.bundle) ||
            containsPrivateSheetReference(live.bundle)
          ) {
            return jsonResponse({ available: false }, 200, corsHeaders);
          }
          return jsonResponse(
            {
              available: true,
              updatedAt: live.updatedAt,
              source: live.source,
              tournaments: live.bundle.tournaments,
              results: live.bundle.results,
              news: live.bundle.news,
              ...(live.bundle.siteConfig ? { siteConfig: live.bundle.siteConfig } : {}),
            },
            200,
            corsHeaders
          );
        }

        // Dynamic Public Website CMS Bundle (published stage only — drafts strictly excluded)
        if (request.method === 'GET' && pathname === '/api/public/cms') {
          const payload = await handlePublicCmsRequest(env.DB, env, localFallback);
          return jsonResponse(payload, 200, corsHeaders, {
            'Cache-Control': 'no-store',
            ETag: payload.etag,
          });
        }

        // Public Cloudflare R2 media delivery proxy when R2_PUBLIC_BASE_URL is not customized
        if (request.method === 'GET' && pathname.startsWith('/api/media/')) {
          const r2Key = decodeURIComponent(pathname.slice('/api/media/'.length));
          return handlePublicMediaGet(r2Key, env, corsHeaders);
        }

        // Fail closed in production when persistent KV security storage is unbound
        const kv = resolveSecurityKv(env);
        if (
          isProductionEnv(env) &&
          !kv &&
          (pathname.startsWith('/api/auth/') || pathname.startsWith('/api/admin/'))
        ) {
          return jsonResponse(
            { error: 'Worker security storage (SECURITY_KV) is not configured for production.' },
            503,
            corsHeaders
          );
        }

        const ownerResolution = await resolveActiveOwner(env, localFallback);

        // Initial Owner Setup discovery (never reveals usernames or secrets)
        if (request.method === 'GET' && pathname === '/api/auth/setup/status') {
          return jsonResponse(
            {
              setupRequired: !ownerResolution.configured,
              setupTokenConfigured: Boolean(env.ADMIN_SETUP_TOKEN?.trim()),
              sessionSecretConfigured: isValidSessionSecret(env.SESSION_SECRET),
              cloudflareAccessSetupConfigured: Boolean(env.CLOUDFLARE_ACCESS_OWNER_EMAIL?.trim()),
              ownerLockEnabled: Boolean(env.CLOUDFLARE_ACCESS_OWNER_EMAIL?.trim()),
              singleOwnerMode: true,
            },
            200,
            corsHeaders
          );
        }

        // One-time Initial Owner Setup via Worker setup token or Cloudflare Access owner identity
        if (request.method === 'POST' && pathname === '/api/auth/setup') {
          if (!hasValidStateChangeOrigin(request, originPresent, originVerified)) {
            return jsonResponse({ error: 'Valid Origin header required.' }, 403, corsHeaders);
          }
          if (ownerResolution.configured) {
            await appendSecurityAuditEvent(
              {
                event: 'unauthorized_access',
                actor: 'anonymous',
                ip: clientIp,
                summary: 'Blocked repeat /api/auth/setup attempt after owner setup completed.',
              },
              env,
              localFallback
            );
            return jsonResponse(
              { error: 'Initial owner setup has already been completed.' },
              409,
              corsHeaders
            );
          }

          if (!isValidSessionSecret(env.SESSION_SECRET)) {
            return jsonResponse(
              { error: 'SESSION_SECRET is missing or insecurely configured on the Worker.' },
              503,
              corsHeaders
            );
          }

          const hasSetupToken = Boolean(env.ADMIN_SETUP_TOKEN?.trim());
          if (!hasSetupToken) {
            return jsonResponse(
              {
                error:
                  'Initial owner setup is disabled until server-side ADMIN_SETUP_TOKEN is provisioned.',
              },
              503,
              corsHeaders
            );
          }

          if (!hasExactJsonMediaType(request)) {
            return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
          }

          const preCheck = await loginLimiter.check(clientIp, '__setup__', kv);
          if (!preCheck.allowed) {
            return jsonResponse(
              {
                error: 'Too many setup attempts. Please wait before trying again.',
                retryAfterSeconds: preCheck.retryAfterSeconds,
              },
              429,
              corsHeaders,
              { 'Retry-After': String(preCheck.retryAfterSeconds) }
            );
          }

          let rawBody: unknown;
          try {
            rawBody = await readBoundedJsonBody(request, MAX_LOGIN_BODY_BYTES);
          } catch (err) {
            if (err instanceof BodyTooLargeError) {
              return jsonResponse({ error: 'Payload Too Large.' }, 413, corsHeaders);
            }
            return jsonResponse({ error: 'Malformed JSON body.' }, 400, corsHeaders);
          }

          const check = validateSetupPayload(rawBody);
          if (!check.valid || !check.username || !check.password) {
            return jsonResponse({ error: check.error || 'Invalid setup payload.' }, 400, corsHeaders);
          }

          const cfEmailSatisfied = await isCloudflareAccessOwnerSatisfied(request, env);

          const setupTokenAuthorized =
            hasSetupToken &&
            Boolean(check.setupToken) &&
            (await hashAndCompareConstantTime(check.setupToken ?? '', env.ADMIN_SETUP_TOKEN!.trim()));

          if (!setupTokenAuthorized || !cfEmailSatisfied) {
            await loginLimiter.recordFailure(clientIp, '__setup__', kv);
            await appendSecurityAuditEvent(
              {
                event: 'unauthorized_access',
                actor: check.username,
                ip: clientIp,
                summary: 'Invalid setup authorization token rejected.',
              },
              env,
              localFallback
            );
            return jsonResponse(
              { error: 'Invalid or missing setup authorization token.' },
              403,
              corsHeaders
            );
          }

          await loginLimiter.resetUser(clientIp, '__setup__', kv);
          const passwordHash = await hashPasswordPBKDF2(check.password);
          const nowIso = new Date().toISOString();
          await saveOwnerAccount(
            {
              version: 1,
              username: check.username,
              passwordHash,
              setupCompletedAt: nowIso,
              credentialUpdatedAt: nowIso,
              tokenInvalidBefore: 0,
            },
            env,
            localFallback
          );
          await appendSecurityAuditEvent(
            {
              event: 'setup_completed',
              actor: check.username,
              ip: clientIp,
              summary: 'Initial Admin owner account provisioned in KV.',
            },
            env,
            localFallback
          );

          return jsonResponse(
            {
              ok: true,
              setupCompleted: true,
              username: check.username,
            },
            201,
            corsHeaders
          );
        }

        if (request.method === 'POST' && pathname === '/api/auth/login') {
          if (!hasValidStateChangeOrigin(request, originPresent, originVerified)) {
            return jsonResponse({ error: 'Valid Origin header required.' }, 403, corsHeaders);
          }

          if (!(await isCloudflareAccessOwnerSatisfied(request, env))) {
            await appendSecurityAuditEvent(
              {
                event: 'unauthorized_access',
                actor: 'anonymous',
                ip: clientIp,
                summary: 'Login blocked by Cloudflare Access owner identity lock.',
              },
              env,
              localFallback
            );
            return jsonResponse(
              { error: 'Restricted to configured Cloudflare Zero Trust owner account.' },
              403,
              corsHeaders
            );
          }

          if (!ownerResolution.configured || !ownerResolution.owner || !isValidSessionSecret(env.SESSION_SECRET)) {
            return jsonResponse(
              {
                error: ownerResolution.configured
                  ? 'Admin session secret is missing or insecurely configured.'
                  : 'Admin owner account is not initialized yet. Complete Initial Setup first.',
              },
              503,
              corsHeaders
            );
          }

          if (!hasExactJsonMediaType(request)) {
            return jsonResponse(
              { error: 'Content-Type must be application/json.' },
              415,
              corsHeaders
            );
          }

          if (env.RATE_LIMITER) {
            const bindingCheck = await env.RATE_LIMITER.limit({ key: `login:${clientIp}` });
            if (!bindingCheck.success) {
              return jsonResponse(
                { error: 'Too many authentication attempts. Please wait before trying again.' },
                429,
                corsHeaders,
                { 'Retry-After': '60' }
              );
            }
          }

          const preCheck = await loginLimiter.check(clientIp, undefined, kv);
          if (!preCheck.allowed) {
            return jsonResponse(
              {
                error: 'Too many authentication attempts. Please wait before trying again.',
                retryAfterSeconds: preCheck.retryAfterSeconds,
              },
              429,
              corsHeaders,
              { 'Retry-After': String(preCheck.retryAfterSeconds) }
            );
          }

          let rawBody: unknown;
          try {
            rawBody = await readBoundedJsonBody(request, MAX_LOGIN_BODY_BYTES);
          } catch (err) {
            if (err instanceof BodyTooLargeError) {
              return jsonResponse({ error: 'Payload Too Large.' }, 413, corsHeaders);
            }
            await loginLimiter.recordFailure(clientIp, undefined, kv);
            return jsonResponse({ error: 'Malformed JSON body.' }, 400, corsHeaders);
          }

          const loginCheck = validateLoginPayload(rawBody);
          if (!loginCheck.valid || !loginCheck.username || !loginCheck.password) {
            await loginLimiter.recordFailure(clientIp, undefined, kv);
            return jsonResponse({ error: loginCheck.error || 'Invalid login payload.' }, 400, corsHeaders);
          }

          const submittedUser = loginCheck.username;
          const submittedPass = loginCheck.password;

          const acctCheck = await loginLimiter.check(clientIp, submittedUser, kv);
          if (!acctCheck.allowed) {
            return jsonResponse(
              {
                error: 'Too many authentication attempts. Please wait before trying again.',
                retryAfterSeconds: acctCheck.retryAfterSeconds,
              },
              429,
              corsHeaders,
              { 'Retry-After': String(acctCheck.retryAfterSeconds) }
            );
          }

          const activeOwner = ownerResolution.owner;
          const userOk = await hashAndCompareConstantTime(submittedUser, activeOwner.username);
          const passOk = await verifyPasswordPBKDF2(submittedPass, activeOwner.passwordHash);

          let loggedInUsername = activeOwner.username;
          let loggedInRole: RoleName = 'owner';

          if (!userOk || !passOk) {
            let staffMatched = false;
            if (env.DB) {
              await ensureD1Schema(env.DB);
              const staffRow = await env.DB.prepare(
                `SELECT username, password_hash, role_id, account_status FROM users WHERE username = ? LIMIT 1`
              )
                .bind(submittedUser)
                .first<{
                  username: string;
                  password_hash: string;
                  role_id: string;
                  account_status: string;
                }>();
              if (
                staffRow &&
                staffRow.account_status === 'active' &&
                isStaffRole(staffRow.role_id) &&
                (await verifyPasswordPBKDF2(submittedPass, staffRow.password_hash))
              ) {
                staffMatched = true;
                loggedInUsername = staffRow.username;
                loggedInRole = staffRow.role_id;
              }
            }

            if (!staffMatched) {
              await loginLimiter.recordFailure(clientIp, submittedUser, kv);
              await appendSecurityAuditEvent(
                {
                  event: 'login_failure',
                  actor: submittedUser,
                  ip: clientIp,
                  summary: 'Failed admin login attempt rejected.',
                },
                env,
                localFallback
              );
              return jsonResponse({ error: 'Invalid admin username or password.' }, 401, corsHeaders);
            }
          }

          await loginLimiter.resetUser(clientIp, submittedUser, kv);
          const issueNowMs = Math.max(Date.now(), (activeOwner.tokenInvalidBeforeMs ?? 0) + 1);
          const issueNowSeconds = Math.floor(issueNowMs / 1000);
          const { token, claims } = await issueSession(
            loggedInUsername,
            env.SESSION_SECRET,
            DEFAULT_TTL_SECONDS,
            issueNowSeconds,
            issueNowMs
          );
          await registerSessionRecord(
            claims.jti,
            claims.sub,
            claims.iat,
            claims.exp,
            request,
            clientIp,
            env,
            localFallback
          );
          await appendSecurityAuditEvent(
            {
              event: 'login_success',
              actor: claims.sub,
              ip: clientIp,
              summary: `Staff (${loggedInRole}) signed in with cookie + CSRF session.`,
            },
            env,
            localFallback
          );
          const csrfToken = await deriveCsrfToken(claims.jti, claims.sub, env.SESSION_SECRET);

          return jsonResponse(
            {
              authenticated: true,
              username: claims.sub,
              role: loggedInRole,
              csrfToken,
              expiresInSeconds: DEFAULT_TTL_SECONDS,
              authMode: 'cookie-csrf',
            },
            200,
            corsHeaders,
            { 'Set-Cookie': buildSessionCookieHeader(token, cookieOpts) }
          );
        }

        if (request.method === 'POST' && pathname === '/api/auth/logout') {
          if (!hasValidStateChangeOrigin(request, originPresent, originVerified)) {
            return jsonResponse({ error: 'Valid Origin header required.' }, 403, corsHeaders);
          }

          const rawLogoutToken = extractSessionToken(request);
          if (rawLogoutToken && isValidSessionSecret(env.SESSION_SECRET)) {
            const claims = await verifySessionToken(rawLogoutToken, env.SESSION_SECRET);
            if (claims) {
              const csrfOk = await verifyCsrfToken(
                request.headers.get('X-CSRF-Token'),
                claims.jti,
                claims.sub,
                env.SESSION_SECRET
              );
              if (!csrfOk) {
                return jsonResponse({ error: 'Invalid or missing CSRF token.' }, 403, corsHeaders);
              }
              await revokeSessionByJti(claims.jti, claims.exp, env, localFallback);
              await appendSecurityAuditEvent(
                {
                  event: 'logout',
                  actor: claims.sub,
                  ip: clientIp,
                  summary: 'Administrator signed out and session was revoked.',
                },
                env,
                localFallback
              );
            }
          }

          return jsonResponse(
            { authenticated: false },
            200,
            corsHeaders,
            { 'Set-Cookie': buildClearSessionCookieHeader(cookieOpts) }
          );
        }

        // All routes below inspect cookie-only HttpOnly session auth & active KV session state
        const cfOwnerSatisfied = await isCloudflareAccessOwnerSatisfied(request, env);
        const rawToken = extractSessionToken(request);
        let session = rawToken
          ? await verifySessionToken(rawToken, env.SESSION_SECRET || '')
          : null;
        let resolvedStaffRole: RoleName = 'owner';
        if (session) {
          const activeOwner = ownerResolution.owner;
          const matchesActiveOwner =
            Boolean(activeOwner) &&
            (await hashAndCompareConstantTime(session.sub, activeOwner!.username));
          let matchesActiveStaff = false;
          if (!matchesActiveOwner && env.DB) {
            await ensureD1Schema(env.DB);
            const staffRow = await env.DB.prepare(
              'SELECT role_id, account_status FROM users WHERE username = ? LIMIT 1'
            )
              .bind(session.sub)
              .first<{ role_id: string; account_status: string }>();
            if (staffRow && staffRow.account_status === 'active' && isStaffRole(staffRow.role_id)) {
              matchesActiveStaff = true;
              resolvedStaffRole = staffRow.role_id;
            }
          }
          const activeInStore =
            cfOwnerSatisfied &&
            (matchesActiveOwner || matchesActiveStaff) &&
            (await isSessionActive(
              session.jti,
              session.iat,
              session.iatMs,
              activeOwner?.tokenInvalidBefore ?? 0,
              activeOwner?.tokenInvalidBeforeMs,
              env,
              localFallback
            ));
          if (!activeInStore) {
            session = null;
          }
        }

        if (request.method === 'GET' && pathname === '/api/auth/session') {
          if (!session || !cfOwnerSatisfied) {
            return jsonResponse({ authenticated: false }, 401, corsHeaders);
          }
          const csrfToken = await deriveCsrfToken(session.jti, session.sub, env.SESSION_SECRET);
          return jsonResponse(
            {
              authenticated: true,
              username: session.sub,
              role: resolvedStaffRole,
              expiresAt: session.exp,
              csrfToken,
              authMode: 'cookie-csrf',
            },
            200,
            corsHeaders
          );
        }

        // Require authenticated session for all /api/admin/* endpoints
        if (pathname.startsWith('/api/admin/')) {
          if (!cfOwnerSatisfied) {
            await appendSecurityAuditEvent(
              {
                event: 'unauthorized_access',
                actor: 'anonymous',
                ip: clientIp,
                summary: `Admin route ${pathname} blocked by Cloudflare Access owner identity lock.`,
              },
              env,
              localFallback
            );
            return jsonResponse(
              { error: 'Restricted to configured Cloudflare Zero Trust owner account.' },
              403,
              corsHeaders
            );
          }
          if (!session) {
            return jsonResponse({ error: 'Authentication required.' }, 401, corsHeaders);
          }

          const isMutating = request.method !== 'GET';
          if (isMutating) {
            if (!hasValidStateChangeOrigin(request, originPresent, originVerified)) {
              return jsonResponse({ error: 'Valid Origin header required.' }, 403, corsHeaders);
            }
            const csrfOk = await verifyCsrfToken(
              request.headers.get('X-CSRF-Token'),
              session.jti,
              session.sub,
              env.SESSION_SECRET
            );
            if (!csrfOk) {
              return jsonResponse({ error: 'Invalid or missing CSRF token.' }, 403, corsHeaders);
            }
          }

          const actorRole = resolvedStaffRole;

          if (pathname.startsWith('/api/admin/security/') && actorRole !== 'owner') {
            return jsonResponse(
              { error: 'Owner privilege required for security settings.' },
              403,
              corsHeaders
            );
          }

          const platformAdminResponse = await handleAdminPlatformRoute({
            request,
            pathname,
            url,
            env,
            corsHeaders,
            fallback: localFallback,
            actorUsername: session.sub,
            actorRole,
            clientIp,
          });
          if (platformAdminResponse) {
            return platformAdminResponse;
          }

          if (pathname === '/api/admin/content') {
            if (request.method === 'GET') {
              if (isLocalLoopbackContentSandbox(url, env)) {
                const bundle = await readSandboxContent(env, localFallback);
                return jsonResponse(
                  {
                    bundle,
                    repository: 'local-sandbox (GitHub App secrets not configured)',
                    branch: 'local-sandbox',
                  },
                  200,
                  corsHeaders
                );
              }
              const loaded = await readAdminContentFromGitHub(env, fetchFn);
              return jsonResponse(loaded, 200, corsHeaders);
            }
            if (request.method === 'PUT') {
              if (!hasExactJsonMediaType(request)) {
                return jsonResponse(
                  { error: 'Content-Type must be application/json.' },
                  415,
                  corsHeaders
                );
              }
              let body: unknown;
              try {
                body = await readBoundedJsonBody(request, MAX_CONTENT_BODY_BYTES);
              } catch (err) {
                if (err instanceof BodyTooLargeError) {
                  return jsonResponse({ error: 'Payload Too Large.' }, 413, corsHeaders);
                }
                return jsonResponse({ error: 'Malformed JSON body.' }, 400, corsHeaders);
              }
              const check = validateAdminContentPayload(body);
              if (!check.valid || !check.data) {
                return jsonResponse(
                  { error: 'Validation failed.', details: check.errors },
                  400,
                  corsHeaders
                );
              }
              if (isLocalLoopbackContentSandbox(url, env)) {
                const committedAt = new Date().toISOString();
                const dateStamp = committedAt.slice(0, 10);
                const nextBundle: AdminContentBundle = {
                  tournaments: { ...check.data.bundle.tournaments, lastUpdated: dateStamp },
                  results: { ...check.data.bundle.results, lastUpdated: dateStamp },
                  news: { ...check.data.bundle.news, lastUpdated: dateStamp },
                  ...(check.data.bundle.siteConfig
                    ? { siteConfig: { ...check.data.bundle.siteConfig, lastUpdated: dateStamp } }
                    : {}),
                };
                await writeSandboxContent(nextBundle, env, localFallback);
                if (env.DB) {
                  await syncAdminBundleToD1(env.DB, env, localFallback, nextBundle, {
                    username: session.sub,
                    role: actorRole,
                    ipMasked: clientIp,
                  });
                } else {
                  await writeLivePublicContent(
                    {
                      updatedAt: committedAt,
                      source: 'local-sandbox',
                      bundle: nextBundle,
                    },
                    env,
                    localFallback
                  );
                }
                const updatedFiles = [
                  'public/data/tournaments.json',
                  'public/data/results.json',
                  'public/data/news.json',
                ];
                if (check.data.bundle.siteConfig) {
                  updatedFiles.push('public/data/site-config.json');
                }
                await appendSecurityAuditEvent(
                  {
                    event: 'content_published',
                    actor: session.sub,
                    ip: clientIp,
                    summary: `Saved ${updatedFiles.length} JSON payloads to local dev sandbox (${check.data.commitMessage.slice(0, 60)})`,
                  },
                  env,
                  localFallback
                );
                return jsonResponse(
                  {
                    ok: true,
                    commitSha: 'local-sandbox',
                    commitUrl: '',
                    repository: 'local-sandbox (GitHub App secrets not configured)',
                    branch: 'local-sandbox',
                    updatedFiles,
                    committedAt,
                  },
                  200,
                  corsHeaders
                );
              }
              const result = await commitAdminContentToGitHub(
                env,
                check.data.bundle,
                check.data.commitMessage,
                fetchFn
              );
              if (env.DB) {
                await syncAdminBundleToD1(env.DB, env, localFallback, check.data.bundle, {
                  username: session.sub,
                  role: actorRole,
                  ipMasked: clientIp,
                });
              } else {
                await writeLivePublicContent(
                  {
                    updatedAt: result.committedAt,
                    source: 'github-publish',
                    bundle: check.data.bundle,
                  },
                  env,
                  localFallback
                );
              }
              await appendSecurityAuditEvent(
                {
                  event: 'content_published',
                  actor: session.sub,
                  ip: clientIp,
                  summary: `Published GitHub commit ${result.commitSha.slice(0, 7)} (${result.updatedFiles.join(', ')})`,
                },
                env,
                localFallback
              );
              return jsonResponse({ ok: true, ...result }, 200, corsHeaders);
            }
          }

          if (pathname === '/api/admin/tournaments/generate-id' && request.method === 'POST') {
            if (!hasExactJsonMediaType(request)) {
              return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
            }
            let rawBody: unknown;
            try {
              rawBody = await readBoundedJsonBody(request, MAX_LOGIN_BODY_BYTES);
            } catch (err) {
              if (err instanceof BodyTooLargeError) {
                return jsonResponse({ error: 'Payload Too Large.' }, 413, corsHeaders);
              }
              return jsonResponse({ error: 'Malformed JSON body.' }, 400, corsHeaders);
            }
            const idCheck = validateGenerateIdPayload(rawBody);
            if (!idCheck.valid || !idCheck.format) {
              return jsonResponse({ error: idCheck.error || 'Invalid generate-id payload.' }, 400, corsHeaders);
            }
            const taken = new Set<string>(idCheck.existingIds ?? []);
            if (isLocalLoopbackContentSandbox(url, env)) {
              for (const t of (await readSandboxContent(env, localFallback)).tournaments.tournaments) {
                taken.add(t.id);
              }
            } else {
              try {
                const liveContent = await readAdminContentFromGitHub(env, fetchFn);
                for (const t of liveContent.bundle.tournaments.tournaments) {
                  taken.add(t.id);
                }
              } catch {
                // Fall back gracefully if repository read is unavailable while staging
              }
            }
            const privateCfg = await readPrivateSheetsConfig(env, localFallback);
            for (const tid of Object.keys(privateCfg.sheetsByTournamentId)) {
              taken.add(tid);
            }
            const generated = generateNextTournamentId(idCheck.format, taken);
            return jsonResponse(generated, 200, corsHeaders);
          }

          if (pathname === '/api/admin/private-config') {
            if (request.method === 'GET') {
              const config = await readPrivateSheetsConfig(env, localFallback);
              return jsonResponse(config, 200, corsHeaders);
            }
            if (request.method === 'PUT') {
              if (!hasExactJsonMediaType(request)) {
                return jsonResponse(
                  { error: 'Content-Type must be application/json.' },
                  415,
                  corsHeaders
                );
              }
              let body: unknown;
              try {
                body = await readBoundedJsonBody(request, MAX_CONTENT_BODY_BYTES);
              } catch (err) {
                if (err instanceof BodyTooLargeError) {
                  return jsonResponse({ error: 'Payload Too Large.' }, 413, corsHeaders);
                }
                return jsonResponse({ error: 'Malformed JSON body.' }, 400, corsHeaders);
              }
              const check = validatePrivateSheetsPayload(body);
              if (!check.valid || !check.sheetsByTournamentId) {
                return jsonResponse(
                  { error: 'Invalid private Google Sheet config.', details: check.errors },
                  400,
                  corsHeaders
                );
              }
              const nextConfig = {
                schemaVersion: 1,
                updatedAt: new Date().toISOString(),
                sheetsByTournamentId: check.sheetsByTournamentId,
              };
              await writePrivateSheetsConfig(nextConfig, env, localFallback);
              await appendSecurityAuditEvent(
                {
                  event: 'private_config_updated',
                  actor: session.sub,
                  ip: clientIp,
                  summary: `Updated organizer-private Google Sheet references (${Object.keys(nextConfig.sheetsByTournamentId).length} entries).`,
                },
                env,
                localFallback
              );
              return jsonResponse({ ok: true, ...nextConfig }, 200, corsHeaders);
            }
          }

          if (pathname === '/api/admin/security/change-id' && request.method === 'POST') {
            if (!hasExactJsonMediaType(request)) {
              return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
            }
            let body: unknown;
            try {
              body = await readBoundedJsonBody(request, MAX_LOGIN_BODY_BYTES);
            } catch (err) {
              if (err instanceof BodyTooLargeError) {
                return jsonResponse({ error: 'Payload Too Large.' }, 413, corsHeaders);
              }
              return jsonResponse({ error: 'Malformed JSON body.' }, 400, corsHeaders);
            }
            const check = validateChangeIdPayload(body);
            if (!check.valid || !check.currentPassword || !check.newUsername) {
              return jsonResponse({ error: check.error || 'Invalid payload.' }, 400, corsHeaders);
            }

            const activeOwner = ownerResolution.owner!;
            if (check.newUsername === activeOwner.username) {
              return jsonResponse(
                { error: 'New Admin ID must differ from your current Admin ID.' },
                400,
                corsHeaders
              );
            }
            const passOk = await verifyPasswordPBKDF2(
              check.currentPassword,
              activeOwner.passwordHash
            );
            if (!passOk) {
              await loginLimiter.recordFailure(clientIp, activeOwner.username, kv);
              await appendSecurityAuditEvent(
                {
                  event: 'login_failure',
                  actor: session.sub,
                  ip: clientIp,
                  summary: 'Current password verification failed during Admin ID update.',
                },
                env,
                localFallback
              );
              return jsonResponse({ error: 'Current password is incorrect.' }, 401, corsHeaders);
            }

            const nowMs = Date.now();
            const nowSeconds = Math.floor(nowMs / 1000);
            const nowIso = new Date(nowMs).toISOString();
            await revokeAllSessions(null, env, localFallback);
            await saveOwnerAccount(
              {
                version: (activeOwner.version ?? 1) + 1,
                username: check.newUsername,
                passwordHash: activeOwner.passwordHash,
                setupCompletedAt: activeOwner.setupCompletedAt || nowIso,
                credentialUpdatedAt: nowIso,
                tokenInvalidBefore: nowSeconds,
                tokenInvalidBeforeMs: nowMs,
              },
              env,
              localFallback
            );
            await appendSecurityAuditEvent(
              {
                event: 'admin_id_changed',
                actor: check.newUsername,
                ip: clientIp,
                summary: 'Admin ID updated cleanly; all active sessions invalidated.',
              },
              env,
              localFallback
            );
            return jsonResponse(
              {
                ok: true,
                requiresReauth: true,
                username: check.newUsername,
              },
              200,
              corsHeaders,
              { 'Set-Cookie': buildClearSessionCookieHeader(cookieOpts) }
            );
          }

          if (pathname === '/api/admin/security/change-password' && request.method === 'POST') {
            if (!hasExactJsonMediaType(request)) {
              return jsonResponse({ error: 'Content-Type must be application/json.' }, 415, corsHeaders);
            }
            let body: unknown;
            try {
              body = await readBoundedJsonBody(request, MAX_LOGIN_BODY_BYTES);
            } catch (err) {
              if (err instanceof BodyTooLargeError) {
                return jsonResponse({ error: 'Payload Too Large.' }, 413, corsHeaders);
              }
              return jsonResponse({ error: 'Malformed JSON body.' }, 400, corsHeaders);
            }
            const activeOwner = ownerResolution.owner!;
            const check = validateChangePasswordPayload(body, activeOwner.username);
            if (!check.valid || !check.currentPassword || !check.newPassword) {
              return jsonResponse({ error: check.error || 'Invalid password payload.' }, 400, corsHeaders);
            }
            const passOk = await verifyPasswordPBKDF2(
              check.currentPassword,
              activeOwner.passwordHash
            );
            if (!passOk) {
              await loginLimiter.recordFailure(clientIp, activeOwner.username, kv);
              await appendSecurityAuditEvent(
                {
                  event: 'login_failure',
                  actor: session.sub,
                  ip: clientIp,
                  summary: 'Current password verification failed during password update.',
                },
                env,
                localFallback
              );
              return jsonResponse({ error: 'Current password is incorrect.' }, 401, corsHeaders);
            }

            if (check.newPassword === check.currentPassword) {
              return jsonResponse(
                { error: 'New password must differ from current password.' },
                400,
                corsHeaders
              );
            }

            const newHash = await hashPasswordPBKDF2(check.newPassword);
            const nowMs = Date.now();
            const nowSeconds = Math.floor(nowMs / 1000);
            const nowIso = new Date(nowMs).toISOString();
            await revokeAllSessions(null, env, localFallback);
            await saveOwnerAccount(
              {
                version: (activeOwner.version ?? 1) + 1,
                username: activeOwner.username,
                passwordHash: newHash,
                setupCompletedAt: activeOwner.setupCompletedAt || nowIso,
                credentialUpdatedAt: nowIso,
                tokenInvalidBefore: nowSeconds,
                tokenInvalidBeforeMs: nowMs,
              },
              env,
              localFallback
            );
            await appendSecurityAuditEvent(
              {
                event: 'password_changed',
                actor: activeOwner.username,
                ip: clientIp,
                summary: 'Admin password rotated; all active sessions invalidated.',
              },
              env,
              localFallback
            );
            return jsonResponse(
              {
                ok: true,
                requiresReauth: true,
              },
              200,
              corsHeaders,
              { 'Set-Cookie': buildClearSessionCookieHeader(cookieOpts) }
            );
          }

          if (pathname === '/api/admin/security/sessions' && request.method === 'GET') {
            const sessions = await listActiveSessionRecords(session.jti, env, localFallback);
            return jsonResponse({ sessions }, 200, corsHeaders);
          }

          if (pathname === '/api/admin/security/sessions/revoke-all' && request.method === 'POST') {
            let includeCurrent = false;
            if (request.body) {
              if (!hasExactJsonMediaType(request)) {
                return jsonResponse(
                  { error: 'Content-Type must be application/json.' },
                  415,
                  corsHeaders
                );
              }
              try {
                const rawBody = (await readBoundedJsonBody(request, MAX_LOGIN_BODY_BYTES)) as Record<
                  string,
                  unknown
                >;
                if (rawBody && typeof rawBody.includeCurrent === 'boolean') {
                  includeCurrent = rawBody.includeCurrent;
                }
              } catch (err) {
                if (err instanceof BodyTooLargeError) {
                  return jsonResponse({ error: 'Payload Too Large.' }, 413, corsHeaders);
                }
                return jsonResponse({ error: 'Malformed JSON body.' }, 400, corsHeaders);
              }
            }
            const revokedCount = await revokeAllSessions(
              includeCurrent ? null : session.jti,
              env,
              localFallback
            );
            await appendSecurityAuditEvent(
              {
                event: 'sessions_revoked_all',
                actor: session.sub,
                ip: clientIp,
                summary: includeCurrent
                  ? `Revoked all ${revokedCount} sessions including current session.`
                  : `Revoked ${revokedCount} other active session(s).`,
              },
              env,
              localFallback
            );
            return jsonResponse(
              {
                ok: true,
                revokedCount,
                requiresReauth: includeCurrent,
              },
              200,
              corsHeaders,
              includeCurrent
                ? { 'Set-Cookie': buildClearSessionCookieHeader(cookieOpts) }
                : undefined
            );
          }

          if (
            pathname.startsWith('/api/admin/security/sessions/') &&
            request.method === 'DELETE'
          ) {
            const targetJti = pathname.slice('/api/admin/security/sessions/'.length).trim();
            if (!targetJti || !/^[A-Za-z0-9-]+$/.test(targetJti)) {
              return jsonResponse({ error: 'Invalid session ID.' }, 400, corsHeaders);
            }
            const activeList = await listActiveSessionRecords(session.jti, env, localFallback);
            const target = activeList.find((s) => s.jti === targetJti);
            if (!target) {
              return jsonResponse({ error: 'Session not found.' }, 404, corsHeaders);
            }
            await revokeSessionByJti(target.jti, target.expiresAt, env, localFallback);
            await appendSecurityAuditEvent(
              {
                event: 'session_revoked',
                actor: session.sub,
                ip: clientIp,
                summary:
                  target.jti === session.jti
                    ? 'Administrator revoked their own active session.'
                    : `Administrator revoked active session (${target.ipMasked}).`,
              },
              env,
              localFallback
            );
            return jsonResponse(
              {
                ok: true,
                currentRevoked: target.jti === session.jti,
              },
              200,
              corsHeaders,
              target.jti === session.jti
                ? { 'Set-Cookie': buildClearSessionCookieHeader(cookieOpts) }
                : undefined
            );
          }

          if (pathname === '/api/admin/security/audit' && request.method === 'GET') {
            const entries = await readSecurityAuditLog(env, localFallback);
            return jsonResponse({ entries }, 200, corsHeaders);
          }
        }

        const platformPublicRes = await handlePublicAndPlayerPlatformRoute({
          request,
          url,
          pathname,
          env,
          corsHeaders,
          fallback: localFallback,
          clientIp,
          originPresent,
          originVerified,
          checkRateLimit: async (key: string) => {
            if (env.RATE_LIMITER) {
              const lim = await env.RATE_LIMITER.limit({ key });
              if (!lim.success) return false;
            }
            const res = await loginLimiter.check(clientIp, key, kv);
            return res.allowed;
          },
        });
        if (platformPublicRes) {
          return platformPublicRes;
        }

        return jsonResponse({ error: 'Endpoint not found.' }, 404, corsHeaders);
      } catch (err) {
        if (err instanceof GitHubIntegrationError) {
          console.error('[Worker GitHub Error]', err.message);
          return jsonResponse({ error: err.message }, err.statusCode, corsHeaders);
        }
        console.error('[Worker Internal Error]', err);
        return jsonResponse(
          { error: 'An internal server error occurred while processing the request.' },
          500,
          corsHeaders
        );
      }
    },
  };
}

export default createWorkerHandler();
