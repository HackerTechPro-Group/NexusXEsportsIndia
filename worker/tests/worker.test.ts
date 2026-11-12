import { describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hashPasswordPBKDF2, issueSession } from '../src/auth.ts';
import { createGitHubAppJwt, pemToPkcs8Der } from '../src/githubApp.ts';
import { createWorkerHandler } from '../src/index.ts';
import { assertPermittedRepoPath, validateAdminContentPayload } from '../src/validators.ts';
import type { AdminContentBundle, SecurityKvBinding, WorkerEnv } from '../src/types.ts';

function readRepoJson<T>(relative: string): T {
  const filePath = path.resolve(process.cwd(), 'public/data', relative);
  return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
}

function makeSampleBundle(): AdminContentBundle {
  return {
    tournaments: readRepoJson('tournaments.json'),
    results: readRepoJson('results.json'),
    news: {
      schemaVersion: 2,
      lastUpdated: '2026-11-11',
      entries: [
        {
          id: 'news-sample-1',
          title: 'Registration Desk Ready',
          description: 'Official updates will appear here.',
          publishedDate: '2026-11-11',
          banner: './images/hero-arena.jpg',
          externalUrl: '',
          category: 'Tournament',
          pinned: false,
          published: true,
          archived: false,
        },
      ],
    },
  };
}

function createMemoryKv(): SecurityKvBinding & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
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

function extractHostCookieValue(res: Response): string {
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  const match = /__Host-nexusx_admin_session=([^;]+)/.exec(setCookie);
  if (!match) {
    throw new Error(`Expected __Host-nexusx_admin_session in Set-Cookie header, got: "${setCookie}"`);
  }
  return `__Host-nexusx_admin_session=${match[1]}`;
}

async function createTestEnv(kv = createMemoryKv()): Promise<WorkerEnv> {
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
    GITHUB_OWNER: 'nexusx-esports',
    GITHUB_REPO: 'nexusx-india-site',
    GITHUB_BRANCH: 'main',
    ALLOWED_GITHUB_OWNER: 'nexusx-esports',
    ALLOWED_GITHUB_REPO: 'nexusx-india-site',
    ALLOWED_ORIGINS: 'https://nexusxesports.github.io,http://localhost:5173',
    SECURITY_KV: kv,
  };
}

const TRUSTED_ORIGIN = 'https://nexusxesports.github.io';

describe('Cloudflare Worker Hardened Security & GitHub App Publishing', () => {
  it('enforces security response headers and strict CORS origin allowlisting', async () => {
    const env = await createTestEnv();
    const worker = createWorkerHandler();

    const blocked = await worker.fetch(
      new Request('https://worker.example.com/api/health', {
        headers: { Origin: 'https://evil-attacker.example.com' },
      }),
      env
    );
    expect(blocked.status).toBe(403);
    expect(blocked.headers.get('X-Frame-Options')).toBe('DENY');
    expect(blocked.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(blocked.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");

    const allowed = await worker.fetch(
      new Request('https://worker.example.com/api/health', {
        headers: { Origin: TRUSTED_ORIGIN },
      }),
      env
    );
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(TRUSTED_ORIGIN);
    expect(allowed.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(allowed.headers.get('Referrer-Policy')).toBe('no-referrer');

    const preflight = await worker.fetch(
      new Request('https://worker.example.com/api/admin/content', {
        method: 'OPTIONS',
        headers: { Origin: TRUSTED_ORIGIN },
      }),
      env
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type, X-CSRF-Token');
  });

  it('fails closed in production with HTTP 503 if SECURITY_KV is not bound', async () => {
    const env = await createTestEnv();
    delete env.SECURITY_KV;
    delete env.REVOKED_SESSIONS_KV;
    const worker = createWorkerHandler();

    const res = await worker.fetch(
      new Request('https://worker.example.com/api/auth/session', {
        headers: { Origin: TRUSTED_ORIGIN },
      }),
      env
    );
    expect(res.status).toBe(503);
  });

  it('uses HttpOnly __Host- cookie-only sessions + in-memory CSRF tokens and never leaks Bearer JWTs in JSON', async () => {
    const kv = createMemoryKv();
    const env = await createTestEnv(kv);
    const worker = createWorkerHandler();

    const unauth = await worker.fetch(
      new Request('https://worker.example.com/api/admin/content'),
      env
    );
    expect(unauth.status).toBe(401);

    const badLogin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'Wrong!Password#2026' }),
      }),
      env
    );
    expect(badLogin.status).toBe(401);

    const goodLogin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      env
    );
    expect(goodLogin.status).toBe(200);

    const setCookie = goodLogin.headers.get('Set-Cookie') ?? '';
    expect(setCookie).toContain('__Host-nexusx_admin_session=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=None');
    expect(setCookie).toContain('Partitioned');
    expect(setCookie).toContain('Max-Age=3600');

    const loginJson = (await goodLogin.json()) as Record<string, unknown>;
    expect(loginJson.authenticated).toBe(true);
    expect(loginJson.username).toBe('nexusx-owner');
    expect(loginJson.authMode).toBe('cookie-csrf');
    expect(typeof loginJson.csrfToken).toBe('string');
    expect(loginJson.token).toBeUndefined();

    const cookieHeader = extractHostCookieValue(goodLogin);
    const rawJwt = cookieHeader.split('=')[1];

    // Bearer header alone without cookie MUST be rejected
    const bearerAttempt = await worker.fetch(
      new Request('https://worker.example.com/api/auth/session', {
        headers: {
          Origin: TRUSTED_ORIGIN,
          Authorization: `Bearer ${rawJwt}`,
        },
      }),
      env
    );
    expect(bearerAttempt.status).toBe(401);

    // Non-__Host cookie name MUST be rejected on HTTPS
    const downgradeCookieAttempt = await worker.fetch(
      new Request('https://worker.example.com/api/auth/session', {
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: `nexusx_admin_session=${rawJwt}`,
        },
      }),
      env
    );
    expect(downgradeCookieAttempt.status).toBe(401);

    // Valid __Host cookie succeeds and returns CSRF token
    const sessionRes = await worker.fetch(
      new Request('https://worker.example.com/api/auth/session', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: cookieHeader },
      }),
      env
    );
    expect(sessionRes.status).toBe(200);
    const sessionJson = (await sessionRes.json()) as {
      authenticated: boolean;
      csrfToken: string;
    };
    expect(sessionJson.authenticated).toBe(true);
    expect(sessionJson.csrfToken).toBe(loginJson.csrfToken);
  });

  it('persists session revocation and brute-force lockouts across Worker isolates via KV', async () => {
    const kv = createMemoryKv();
    const env = await createTestEnv(kv);
    env.ALLOWED_ORIGINS = `https://YOUR_GITHUB_USERNAME.github.io,${TRUSTED_ORIGIN}`;

    const workerA = createWorkerHandler({
      rateLimitOptions: { maxFailuresPerIpUser: 3, maxFailuresPerIp: 10, windowSeconds: 300 },
    });
    const workerB = createWorkerHandler({
      rateLimitOptions: { maxFailuresPerIpUser: 3, maxFailuresPerIp: 10, windowSeconds: 300 },
    });

    // Placeholder YOUR_ origins must never be trusted
    const placeholderOrigin = await workerA.fetch(
      new Request('https://worker.example.com/api/health', {
        headers: { Origin: 'https://YOUR_GITHUB_USERNAME.github.io' },
      }),
      env
    );
    expect(placeholderOrigin.status).toBe(403);

    // 3 failed logins across workerA -> workerB sees persistent KV account lockout
    for (let i = 0; i < 3; i += 1) {
      const failRes = await workerA.fetch(
        new Request('https://worker.example.com/api/auth/login', {
          method: 'POST',
          headers: {
            Origin: TRUSTED_ORIGIN,
            'Content-Type': 'application/json',
            'CF-Connecting-IP': '203.0.113.42',
          },
          body: JSON.stringify({ username: 'nexusx-owner', password: 'wrong-password' }),
        }),
        env
      );
      expect(failRes.status).toBe(401);
    }

    // Even if attacker switches IP to hit workerB, KV account throttle blocks!
    const lockedOnWorkerB = await workerB.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.77',
        },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      env
    );
    expect(lockedOnWorkerB.status).toBe(429);
    expect(Number(lockedOnWorkerB.headers.get('Retry-After'))).toBeGreaterThan(0);

    // Reset via fresh env/account cleanly to test logout revocation across isolates
    const kv2 = createMemoryKv();
    const env2 = await createTestEnv(kv2);
    const iso1 = createWorkerHandler();
    const iso2 = createWorkerHandler();

    const loginRes = await iso1.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.99',
        },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      env2
    );
    expect(loginRes.status).toBe(200);
    const cookie = extractHostCookieValue(loginRes);
    const { csrfToken } = (await loginRes.json()) as { csrfToken: string };

    // Active cookie logout without X-CSRF-Token must be blocked (prevents logout CSRF)
    const noCsrfLogout = await iso1.fetch(
      new Request('https://worker.example.com/api/auth/logout', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, Cookie: cookie },
      }),
      env2
    );
    expect(noCsrfLogout.status).toBe(403);

    // Logout with valid CSRF revokes in KV immediately across all isolates
    const logoutRes = await iso1.fetch(
      new Request('https://worker.example.com/api/auth/logout', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: cookie,
          'X-CSRF-Token': csrfToken,
        },
      }),
      env2
    );
    expect(logoutRes.status).toBe(200);

    const postLogoutOnIso2 = await iso2.fetch(
      new Request('https://worker.example.com/api/auth/session', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: cookie },
      }),
      env2
    );
    expect(postLogoutOnIso2.status).toBe(401);
  });

  it('rejects missing Origin, cross-site Sec-Fetch-Site, missing CSRF, media-type bypass, and oversized payloads (413)', async () => {
    const kv = createMemoryKv();
    const env = await createTestEnv(kv);
    const worker = createWorkerHandler();
    const bundle = makeSampleBundle();

    const loginRes = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      env
    );
    const cookie = extractHostCookieValue(loginRes);
    const { csrfToken } = (await loginRes.json()) as { csrfToken: string };

    // Missing Origin on state-changing PUT -> 403
    const missingOriginPut = await worker.fetch(
      new Request('https://worker.example.com/api/admin/content', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ ...bundle, commitMessage: 'Missing origin test' }),
      }),
      env
    );
    expect(missingOriginPut.status).toBe(403);

    // Wrong X-CSRF-Token -> 403
    const badCsrfPut = await worker.fetch(
      new Request('https://worker.example.com/api/admin/content', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: cookie,
          'X-CSRF-Token': 'forged-csrf-value',
        },
        body: JSON.stringify({ ...bundle, commitMessage: 'Bad CSRF test' }),
      }),
      env
    );
    expect(badCsrfPut.status).toBe(403);

    // Media type bypass attempt (`text/plain; application/json`) -> 415
    const bypassTypePut = await worker.fetch(
      new Request('https://worker.example.com/api/admin/content', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'text/plain; application/json',
          Cookie: cookie,
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({ ...bundle, commitMessage: 'Media bypass' }),
      }),
      env
    );
    expect(bypassTypePut.status).toBe(415);

    // Oversized login body (>4096 bytes) -> 413 Payload Too Large
    const hugeLogin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: 'a'.repeat(5000), password: 'x' }),
      }),
      env
    );
    expect(hugeLogin.status).toBe(413);

    // Weak SESSION_SECRET fails closed with 503
    const weakEnv = await createTestEnv(kv);
    weakEnv.SESSION_SECRET = 'short-secret';
    const weakRes = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      weakEnv
    );
    expect(weakRes.status).toBe(503);

    // Expired JWT token rejected with 401
    const expiredJwt = await issueSession('nexusx-owner', env.SESSION_SECRET, 60, 1000);
    await kv.put(`session:${expiredJwt.claims.jti}`, '1');
    const expiredRes = await worker.fetch(
      new Request('https://worker.example.com/api/auth/session', {
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: `__Host-nexusx_admin_session=${expiredJwt.token}`,
        },
      }),
      env
    );
    expect(expiredRes.status).toBe(401);
  });

  it('signs valid GitHub App RS256 JWTs for both PKCS#1 and PKCS#8 PEMs', async () => {
    const pkcs1Pair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });
    const pkcs8Pair = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    expect(pemToPkcs8Der(pkcs1Pair.privateKey).byteLength).toBeGreaterThan(200);
    expect(pemToPkcs8Der(pkcs8Pair.privateKey).byteLength).toBeGreaterThan(200);

    const jwt1 = await createGitHubAppJwt('111', pkcs1Pair.privateKey);
    const jwt2 = await createGitHubAppJwt('222', pkcs8Pair.privateKey);

    for (const [jwt, pubKey, expectedIss] of [
      [jwt1, pkcs1Pair.publicKey, '111'],
      [jwt2, pkcs8Pair.publicKey, '222'],
    ] as const) {
      const [h, p, s] = jwt.split('.');
      const verifier = crypto.createVerify('RSA-SHA256');
      verifier.update(`${h}.${p}`);
      expect(verifier.verify(pubKey, Buffer.from(s, 'base64url'))).toBe(true);
      const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as { iss: string };
      expect(claims.iss).toBe(expectedIss);
    }
  });

  it('blocks disallowed repo targets, prototype keys, nested extra fields, invalid URLs/dates, and secrets', () => {
    expect(() => assertPermittedRepoPath('public/data/tournaments.json')).not.toThrow();
    expect(() => assertPermittedRepoPath('public/data/results.json')).not.toThrow();
    expect(() => assertPermittedRepoPath('public/data/news.json')).not.toThrow();
    expect(() => assertPermittedRepoPath('public/data/leaderboard.json')).toThrow();
    expect(() => assertPermittedRepoPath('public/data/schedule.json')).toThrow();
    expect(() => assertPermittedRepoPath('../.github/workflows/deploy.yml')).toThrow();

    const bundle = makeSampleBundle();
    expect(validateAdminContentPayload(bundle).valid).toBe(true);

    for (const badKey of ['leaderboard', 'schedule', 'players', 'teams', 'matchRooms', 'emails']) {
      const res = validateAdminContentPayload({ ...bundle, [badKey]: {} });
      expect(res.valid).toBe(false);
    }

    // Reject prototype pollution / nested unknown keys
    const protoRaw = JSON.parse(`{"tournaments":${JSON.stringify(bundle.tournaments)},"results":${JSON.stringify(bundle.results)},"news":${JSON.stringify(bundle.news)},"__proto__":{"polluted":true}}`);
    expect(validateAdminContentPayload(protoRaw).valid).toBe(false);

    const nestedExtra = structuredClone(bundle);
    (nestedExtra.tournaments.tournaments[0] as unknown as Record<string, unknown>).evilScript = '<script>';
    expect(validateAdminContentPayload(nestedExtra).valid).toBe(false);

    // Reject invalid Google Form link & embedded credentials
    const invalidFormBundle = structuredClone(bundle);
    invalidFormBundle.tournaments.tournaments[0].registration.formUrl = 'https://evil.example/form';
    expect(validateAdminContentPayload(invalidFormBundle).valid).toBe(false);

    const credUrlBundle = structuredClone(bundle);
    credUrlBundle.tournaments.tournaments[0].registration.formUrl = 'https://user:pass@forms.gle/Valid99';
    expect(validateAdminContentPayload(credUrlBundle).valid).toBe(false);

    // Reject impossible calendar date
    const badDateBundle = structuredClone(bundle);
    badDateBundle.news.entries[0].publishedDate = '2026-02-31';
    expect(validateAdminContentPayload(badDateBundle).valid).toBe(false);

    // Reject image path traversal
    const badImgBundle = structuredClone(bundle);
    badImgBundle.news.entries[0].banner = './../secret.jpg';
    expect(validateAdminContentPayload(badImgBundle).valid).toBe(false);

    // Reject embedded secret tokens
    const leakBundle = structuredClone(bundle);
    leakBundle.news.entries[0].description = 'Oops ghp_1234567890abcdef123456';
    expect(validateAdminContentPayload(leakBundle).valid).toBe(false);
  });

  it('reads validated GitHub JSON files, commits atomically via GitHub App, and masks upstream error details', async () => {
    const kv = createMemoryKv();
    const env = await createTestEnv(kv);
    const bundle = makeSampleBundle();
    bundle.tournaments.tournaments[0].registration.formUrl = 'https://forms.gle/TestForm99';
    bundle.tournaments.tournaments[0].registration.status = 'open';

    const recordedCalls: { url: string; method: string; body?: unknown }[] = [];

    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const method = (init?.method || 'GET').toUpperCase();
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      recordedCalls.push({ url, method, body });

      if (url.endsWith('/app/installations/55443322/access_tokens')) {
        return new Response(JSON.stringify({ token: 'ghs_installation_mock_token' }), { status: 201 });
      }
      if (url.includes('/contents/public/data/tournaments.json')) {
        return new Response(
          JSON.stringify({
            encoding: 'base64',
            content: Buffer.from(JSON.stringify(bundle.tournaments), 'utf8').toString('base64'),
          }),
          { status: 200 }
        );
      }
      if (url.includes('/contents/public/data/results.json')) {
        return new Response(
          JSON.stringify({
            encoding: 'base64',
            content: Buffer.from(JSON.stringify(bundle.results), 'utf8').toString('base64'),
          }),
          { status: 200 }
        );
      }
      if (url.includes('/contents/public/data/news.json')) {
        return new Response(
          JSON.stringify({
            encoding: 'base64',
            content: Buffer.from(JSON.stringify(bundle.news), 'utf8').toString('base64'),
          }),
          { status: 200 }
        );
      }
      if (url.endsWith('/git/ref/heads/main') && method === 'GET') {
        return new Response(JSON.stringify({ object: { sha: 'head-sha-001' } }), { status: 200 });
      }
      if (url.endsWith('/git/commits/head-sha-001')) {
        return new Response(JSON.stringify({ tree: { sha: 'base-tree-001' } }), { status: 200 });
      }
      if (url.endsWith('/git/blobs')) {
        return new Response(JSON.stringify({ sha: `blob-${recordedCalls.length}` }), { status: 201 });
      }
      if (url.endsWith('/git/trees')) {
        return new Response(JSON.stringify({ sha: 'new-tree-002' }), { status: 201 });
      }
      if (url.endsWith('/git/commits') && method === 'POST') {
        return new Response(
          JSON.stringify({
            sha: 'new-commit-999',
            html_url: 'https://github.com/nexusx-esports/nexusx-india-site/commit/new-commit-999',
          }),
          { status: 201 }
        );
      }
      if (url.endsWith('/git/refs/heads/main') && method === 'PATCH') {
        return new Response(
          JSON.stringify({ ref: 'refs/heads/main', object: { sha: 'new-commit-999' } }),
          { status: 200 }
        );
      }

      return new Response('Not Found', { status: 404 });
    });

    const worker = createWorkerHandler({ fetchFn: mockFetch as typeof fetch });
    const loginRes = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      env
    );
    const cookie = extractHostCookieValue(loginRes);
    const { csrfToken } = (await loginRes.json()) as { csrfToken: string };

    // 1. Authenticated GET /api/admin/content
    const getRes = await worker.fetch(
      new Request('https://worker.example.com/api/admin/content', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: cookie },
      }),
      env
    );
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as {
      bundle: AdminContentBundle;
      repository: string;
      branch: string;
    };
    expect(getData.repository).toBe('nexusx-esports/nexusx-india-site');
    expect(getData.bundle.tournaments.tournaments[0].registration.formUrl).toBe(
      'https://forms.gle/TestForm99'
    );

    // 2. Authenticated PUT /api/admin/content with Cookie + Origin + X-CSRF-Token
    const putRes = await worker.fetch(
      new Request('https://worker.example.com/api/admin/content', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: cookie,
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          ...bundle,
          commitMessage: 'Publish verified registration links',
        }),
      }),
      env
    );
    expect(putRes.status).toBe(200);
    const putData = (await putRes.json()) as {
      ok: boolean;
      commitSha: string;
      updatedFiles: string[];
    };
    expect(putData.ok).toBe(true);
    expect(putData.commitSha).toBe('new-commit-999');
    expect(putData.updatedFiles).toEqual([
      'public/data/tournaments.json',
      'public/data/results.json',
      'public/data/news.json',
    ]);

    const treeCall = recordedCalls.find((c) => c.url.endsWith('/git/trees'));
    const treeBody = treeCall?.body as { tree: Array<{ path: string }> };
    expect(treeBody.tree.map((t) => t.path)).toEqual([
      'public/data/tournaments.json',
      'public/data/results.json',
      'public/data/news.json',
    ]);

    // 3. Upstream GitHub API failure is masked cleanly without leaking internal URLs or bodies
    const failingWorker = createWorkerHandler({
      fetchFn: (async () =>
        new Response('Internal GitHub Secret Stack Trace /app/installations/55443322', {
          status: 500,
        })) as typeof fetch,
    });
    const maskedErrRes = await failingWorker.fetch(
      new Request('https://worker.example.com/api/admin/content', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: cookie },
      }),
      env
    );
    expect(maskedErrRes.status).toBe(502);
    const errText = await maskedErrRes.text();
    expect(errText).not.toContain('installations');
    expect(errText).not.toContain('api.github.com');
  });

  it('supports one-time owner setup, blocks repeat setup with 409, and enforces setup token validation', async () => {
    const kv = createMemoryKv();
    const env = await createTestEnv(kv);
    delete env.ADMIN_USERNAME;
    delete env.ADMIN_PASSWORD_HASH;
    env.ADMIN_SETUP_TOKEN = 'SetupSecretToken!987654321';

    const worker = createWorkerHandler();

    // Setup MUST be blocked cleanly when ADMIN_SETUP_TOKEN is absent (even with Cloudflare Access email)
    const noTokenEnv = {
      ...env,
      ADMIN_SETUP_TOKEN: undefined,
      CLOUDFLARE_ACCESS_OWNER_EMAIL: 'owner@nexusxesports.in',
    };
    const disabledSetup = await worker.fetch(
      new Request('https://worker.example.com/api/auth/setup', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          'Cf-Access-Authenticated-User-Email': 'owner@nexusxesports.in',
        },
        body: JSON.stringify({
          setupToken: 'anything',
          username: 'nexusx-chief',
          password: 'OwnerPass!VeryStrong#2026',
        }),
      }),
      noTokenEnv
    );
    expect(disabledSetup.status).toBe(503);

    const statusBefore = await worker.fetch(
      new Request('https://worker.example.com/api/auth/setup/status', {
        headers: { Origin: TRUSTED_ORIGIN },
      }),
      env
    );
    expect(statusBefore.status).toBe(200);
    expect(await statusBefore.json()).toMatchObject({ setupRequired: true });

    // Bad token rejected
    const badSetup = await worker.fetch(
      new Request('https://worker.example.com/api/auth/setup', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken: 'wrong-token',
          username: 'nexusx-chief',
          password: 'OwnerPass!VeryStrong#2026',
        }),
      }),
      env
    );
    expect([401, 403]).toContain(badSetup.status);

    // Weak password rejected
    const weakPwSetup = await worker.fetch(
      new Request('https://worker.example.com/api/auth/setup', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken: 'SetupSecretToken!987654321',
          username: 'nexusx-chief',
          password: 'short',
        }),
      }),
      env
    );
    expect(weakPwSetup.status).toBe(400);

    // Valid one-time owner setup succeeds
    const okSetup = await worker.fetch(
      new Request('https://worker.example.com/api/auth/setup', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken: 'SetupSecretToken!987654321',
          username: 'nexusx-chief',
          password: 'OwnerPass!VeryStrong#2026',
        }),
      }),
      env
    );
    expect(okSetup.status).toBe(201);

    // Repeat setup attempt returns 409 Conflict
    const repeatSetup = await worker.fetch(
      new Request('https://worker.example.com/api/auth/setup', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setupToken: 'SetupSecretToken!987654321',
          username: 'attacker',
          password: 'AttackerPass!Strong#2026',
        }),
      }),
      env
    );
    expect(repeatSetup.status).toBe(409);

    // Provisioned owner can log in cleanly
    const loginRes = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'nexusx-chief',
          password: 'OwnerPass!VeryStrong#2026',
        }),
      }),
      env
    );
    expect(loginRes.status).toBe(200);
  });

  it('rotates Admin ID and password, invalidates prior sessions immediately, tracks sessions/audit logs, generates IDs, and keeps Google Sheets strictly in KV', async () => {
    const kv = createMemoryKv();
    const env = await createTestEnv(kv);
    const worker = createWorkerHandler({
      fetchFn: (async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/app/installations/55443322/access_tokens')) {
          return new Response(JSON.stringify({ token: 'ghs_mock_token' }), { status: 201 });
        }
        if (url.includes('/contents/public/data/tournaments.json')) {
          return new Response(
            JSON.stringify({
              encoding: 'base64',
              content: Buffer.from(
                JSON.stringify(makeSampleBundle().tournaments),
                'utf8'
              ).toString('base64'),
            }),
            { status: 200 }
          );
        }
        if (url.includes('/contents/public/data/results.json')) {
          return new Response(
            JSON.stringify({
              encoding: 'base64',
              content: Buffer.from(
                JSON.stringify(makeSampleBundle().results),
                'utf8'
              ).toString('base64'),
            }),
            { status: 200 }
          );
        }
        if (url.includes('/contents/public/data/news.json')) {
          return new Response(
            JSON.stringify({
              encoding: 'base64',
              content: Buffer.from(
                JSON.stringify(makeSampleBundle().news),
                'utf8'
              ).toString('base64'),
            }),
            { status: 200 }
          );
        }
        return new Response('Not Found', { status: 404 });
      }) as typeof fetch,
    });

    // Sign in two separate sessions
    const login1 = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '203.0.113.45',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0)',
        },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      env
    );
    const cookie1 = extractHostCookieValue(login1);
    const { csrfToken: csrf1 } = (await login1.json()) as { csrfToken: string };

    const login2 = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          'CF-Connecting-IP': '198.51.100.88',
        },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      env
    );
    const cookie2 = extractHostCookieValue(login2);

    // Server-side sequential tournament ID generation for Solo/Duo/Squad
    const idGenRes = await worker.fetch(
      new Request('https://worker.example.com/api/admin/tournaments/generate-id', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: cookie1,
          'X-CSRF-Token': csrf1,
        },
        body: JSON.stringify({ format: 'Duo', existingIds: ['NX-DUO-001'] }),
      }),
      env
    );
    expect(idGenRes.status).toBe(200);
    expect(await idGenRes.json()).toMatchObject({ id: 'NX-DUO-002' });

    // Private Organizer Google Sheet CRUD stays in KV only
    const badSheetPut = await worker.fetch(
      new Request('https://worker.example.com/api/admin/private-config', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: cookie1,
          'X-CSRF-Token': csrf1,
        },
        body: JSON.stringify({
          sheetsByTournamentId: {
            'NX-DUO-002': { sheetUrl: 'https://evil.example/sheet', updatedAt: '2026-11-11' },
          },
        }),
      }),
      env
    );
    expect(badSheetPut.status).toBe(400);

    const goodSheetPut = await worker.fetch(
      new Request('https://worker.example.com/api/admin/private-config', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: cookie1,
          'X-CSRF-Token': csrf1,
        },
        body: JSON.stringify({
          sheetsByTournamentId: {
            'NX-DUO-002': {
              sheetUrl: 'https://docs.google.com/spreadsheets/d/1DuoPrivateSheetABC/edit',
              notes: 'Duo check-in sheet',
              updatedAt: '2026-11-11T17:00:00Z',
            },
          },
        }),
      }),
      env
    );
    expect(goodSheetPut.status).toBe(200);

    const sheetGet = await worker.fetch(
      new Request('https://worker.example.com/api/admin/private-config', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: cookie1 },
      }),
      env
    );
    expect(await sheetGet.json()).toMatchObject({
      sheetsByTournamentId: {
        'NX-DUO-002': { sheetUrl: 'https://docs.google.com/spreadsheets/d/1DuoPrivateSheetABC/edit' },
      },
    });

    // Public GitHub PUT rejects any Google Sheet URL leakage
    const leakedBundle = makeSampleBundle();
    leakedBundle.tournaments.tournaments[0].description =
      'See private tracker https://docs.google.com/spreadsheets/d/1LeakedSheet';
    const leakedPut = await worker.fetch(
      new Request('https://worker.example.com/api/admin/content', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: cookie1,
          'X-CSRF-Token': csrf1,
        },
        body: JSON.stringify({ ...leakedBundle, commitMessage: 'Should reject sheet leak' }),
      }),
      env
    );
    expect(leakedPut.status).toBe(400);

    // Inspect active sessions & masked IP + audit log before revocation
    const sessionsRes = await worker.fetch(
      new Request('https://worker.example.com/api/admin/security/sessions', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: cookie1 },
      }),
      env
    );
    const sessionsJson = (await sessionsRes.json()) as {
      sessions: Array<{ jti: string; ipMasked: string; isCurrent: boolean }>;
    };
    expect(sessionsJson.sessions.length).toBeGreaterThanOrEqual(2);
    expect(sessionsJson.sessions.every((s) => s.ipMasked.endsWith('.x'))).toBe(true);
    expect(JSON.stringify(sessionsJson)).not.toContain('203.0.113.45');
    expect(JSON.stringify(sessionsJson)).not.toContain('198.51.100.88');

    // Wrong current password blocked on Change ID
    const badChangeId = await worker.fetch(
      new Request('https://worker.example.com/api/admin/security/change-id', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: cookie1,
          'X-CSRF-Token': csrf1,
        },
        body: JSON.stringify({ currentPassword: 'WrongPass!2026', newUsername: 'nexusx-new' }),
      }),
      env
    );
    expect(badChangeId.status).toBe(401);

    // Valid Change ID revokes all existing sessions
    const okChangeId = await worker.fetch(
      new Request('https://worker.example.com/api/admin/security/change-id', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: cookie1,
          'X-CSRF-Token': csrf1,
        },
        body: JSON.stringify({
          currentPassword: 'NexusX!TestAdmin#2026',
          newUsername: 'nexusx-director',
        }),
      }),
      env
    );
    expect(okChangeId.status).toBe(200);

    // Old sessions 1 and 2 must now return 401
    const stale1 = await worker.fetch(
      new Request('https://worker.example.com/api/auth/session', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: cookie1 },
      }),
      env
    );
    const stale2 = await worker.fetch(
      new Request('https://worker.example.com/api/auth/session', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: cookie2 },
      }),
      env
    );
    expect(stale1.status).toBe(401);
    expect(stale2.status).toBe(401);

    // Sign back in with new ID and test password change + reuse rejection
    const reLogin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nexusx-director', password: 'NexusX!TestAdmin#2026' }),
      }),
      env
    );
    expect(reLogin.status).toBe(200);
    const newCookie = extractHostCookieValue(reLogin);
    const { csrfToken: newCsrf } = (await reLogin.json()) as { csrfToken: string };

    // Reuse same password -> 400
    const reusePw = await worker.fetch(
      new Request('https://worker.example.com/api/admin/security/change-password', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: newCookie,
          'X-CSRF-Token': newCsrf,
        },
        body: JSON.stringify({
          currentPassword: 'NexusX!TestAdmin#2026',
          newPassword: 'NexusX!TestAdmin#2026',
        }),
      }),
      env
    );
    expect(reusePw.status).toBe(400);

    // Rotate password cleanly
    const okPw = await worker.fetch(
      new Request('https://worker.example.com/api/admin/security/change-password', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: newCookie,
          'X-CSRF-Token': newCsrf,
        },
        body: JSON.stringify({
          currentPassword: 'NexusX!TestAdmin#2026',
          newPassword: 'RotatedStrong!Pass#2027',
        }),
      }),
      env
    );
    expect(okPw.status).toBe(200);
    const pwResJson = (await okPw.json()) as { requiresReauth: boolean };
    expect(pwResJson.requiresReauth).toBe(true);

    // Pre-rotation cookie and old password must BOTH be rejected immediately
    const postPwOldSession = await worker.fetch(
      new Request('https://worker.example.com/api/auth/session', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: newCookie },
      }),
      env
    );
    expect(postPwOldSession.status).toBe(401);

    const oldPwLogin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'nexusx-director',
          password: 'NexusX!TestAdmin#2026',
        }),
      }),
      env
    );
    expect(oldPwLogin.status).toBe(401);

    // Log in with rotated password & inspect sanitized audit log
    const finalLogin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'nexusx-director',
          password: 'RotatedStrong!Pass#2027',
        }),
      }),
      env
    );
    expect(finalLogin.status).toBe(200);
    const finalCookie = extractHostCookieValue(finalLogin);

    const auditRes = await worker.fetch(
      new Request('https://worker.example.com/api/admin/security/audit', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: finalCookie },
      }),
      env
    );
    expect(auditRes.status).toBe(200);
    const auditBodyText = await auditRes.text();
    expect(auditBodyText).toContain('password_changed');
    expect(auditBodyText).toContain('admin_id_changed');
    expect(auditBodyText).toContain('private_config_updated');
    expect(auditBodyText).not.toContain('RotatedStrong!Pass#2027');
    expect(auditBodyText).not.toContain('pbkdf2_sha256');
  });

  it('scopes local content sandbox strictly to localhost development mode and fails closed otherwise', async () => {
    const devWorker = createWorkerHandler();
    const baseEnv = await createTestEnv();
    const devEnv: WorkerEnv = {
      ...baseEnv,
      ENVIRONMENT: 'development',
      GITHUB_APP_ID: '',
      GITHUB_APP_INSTALLATION_ID: '',
      GITHUB_APP_PRIVATE_KEY: '',
      SECURITY_KV: undefined,
      ALLOWED_ORIGINS: 'http://localhost:5173',
    };

    // Unauthenticated request on localhost still blocked (401)
    const unauth = await devWorker.fetch(
      new Request('http://localhost:8787/api/admin/content', {
        headers: { Origin: 'http://localhost:5173' },
      }),
      devEnv
    );
    expect(unauth.status).toBe(401);

    // Log in over HTTP localhost
    const loginRes = await devWorker.fetch(
      new Request('http://localhost:8787/api/auth/login', {
        method: 'POST',
        headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      devEnv
    );
    expect(loginRes.status).toBe(200);
    const setCookie = loginRes.headers.get('Set-Cookie') ?? '';
    const cookieMatch = /(?:__Host-)?nexusx_admin_session=([^;]+)/.exec(setCookie);
    expect(cookieMatch).not.toBeNull();
    const devCookie = `${cookieMatch![0].split('=')[0]}=${cookieMatch![1]}`;
    const { csrfToken } = (await loginRes.json()) as { csrfToken: string };

    // Authenticated GET on http://localhost:8787 returns local sandbox bundle
    const getRes = await devWorker.fetch(
      new Request('http://localhost:8787/api/admin/content', {
        headers: { Origin: 'http://localhost:5173', Cookie: devCookie },
      }),
      devEnv
    );
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      branch: string;
      bundle: AdminContentBundle;
    };
    expect(getBody.branch).toBe('local-sandbox');
    expect(Array.isArray(getBody.bundle.tournaments.tournaments)).toBe(true);

    // Authenticated PUT saves validated payload inside local sandbox memory
    const sampleBundle = makeSampleBundle();
    const putRes = await devWorker.fetch(
      new Request('http://localhost:8787/api/admin/content', {
        method: 'PUT',
        headers: {
          Origin: 'http://localhost:5173',
          'Content-Type': 'application/json',
          Cookie: devCookie,
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          ...sampleBundle,
          commitMessage: 'test(local): update sandbox',
        }),
      }),
      devEnv
    );
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { ok: boolean; branch: string; commitUrl: string };
    expect(putBody.ok).toBe(true);
    expect(putBody.branch).toBe('local-sandbox');
    expect(putBody.commitUrl).toBe('');

    const verifyGetRes = await devWorker.fetch(
      new Request('http://localhost:8787/api/admin/content', {
        headers: { Origin: 'http://localhost:5173', Cookie: devCookie },
      }),
      devEnv
    );
    expect(verifyGetRes.status).toBe(200);
    const verifyBody = (await verifyGetRes.json()) as { bundle: AdminContentBundle };
    expect(verifyBody.bundle.news.entries).toHaveLength(1);

    // Non-loopback hostname even in development mode MUST fail closed (503), never sandbox
    const nonLoopbackLogin = await devWorker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: { Origin: 'http://localhost:5173', 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      devEnv
    );
    expect(nonLoopbackLogin.status).toBe(200);
    const nonLoopbackCookie = extractHostCookieValue(nonLoopbackLogin);
    const nonLoopbackGet = await devWorker.fetch(
      new Request('https://worker.example.com/api/admin/content', {
        headers: { Origin: 'http://localhost:5173', Cookie: nonLoopbackCookie },
      }),
      devEnv
    );
    expect(nonLoopbackGet.status).toBe(503);

    // Production mode even on localhost MUST fail closed (503 KV or GitHub check), never sandbox
    const prodWorker = createWorkerHandler();
    const prodEnv: WorkerEnv = {
      ...baseEnv,
      ENVIRONMENT: 'production',
      GITHUB_APP_ID: '',
      GITHUB_APP_INSTALLATION_ID: '',
      GITHUB_APP_PRIVATE_KEY: '',
    };
    const prodLogin = await prodWorker.fetch(
      new Request('https://localhost:8787/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      prodEnv
    );
    expect(prodLogin.status).toBe(200);
    const prodCookie = extractHostCookieValue(prodLogin);
    const prodLocalhostGet = await prodWorker.fetch(
      new Request('https://localhost:8787/api/admin/content', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: prodCookie },
      }),
      prodEnv
    );
    expect(prodLocalhostGet.status).toBe(503);
  });

  it('validates and commits optional siteConfig within the 4 permitted JSON paths while rejecting non-https or secret content', async () => {
    const sampleBundle = makeSampleBundle();
    const siteConfig = readRepoJson<NonNullable<AdminContentBundle['siteConfig']>>('site-config.json');

    const badUrlCheck = validateAdminContentPayload({
      ...sampleBundle,
      siteConfig: {
        ...siteConfig,
        community: {
          ...siteConfig.community,
          discordUrl: 'http://insecure.example.com/invite',
        },
      },
    });
    expect(badUrlCheck.valid).toBe(false);
    expect(badUrlCheck.errors.some((e) => e.includes('https://'))).toBe(true);

    const sheetLeakCheck = validateAdminContentPayload({
      ...sampleBundle,
      siteConfig: {
        ...siteConfig,
        community: {
          ...siteConfig.community,
          whatsappContactUrl: 'https://docs.google.com/spreadsheets/d/1SecretSheet/edit',
        },
      },
    });
    expect(sheetLeakCheck.valid).toBe(false);

    expect(() => assertPermittedRepoPath('public/data/site-config.json')).not.toThrow();
    expect(() => assertPermittedRepoPath('public/data/leaderboard.json')).toThrow();

    const committedPaths: string[] = [];
    const env = await createTestEnv();
    const worker = createWorkerHandler({
      fetchFn: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method || 'GET').toUpperCase();
        if (url.includes('/access_tokens')) {
          return new Response(JSON.stringify({ token: 'ghs_site_config_test' }), { status: 201 });
        }
        if (url.includes('/git/ref/heads/')) {
          return new Response(JSON.stringify({ object: { sha: 'commit_sha_head' } }), { status: 200 });
        }
        if (url.includes('/git/commits/commit_sha_head')) {
          return new Response(JSON.stringify({ tree: { sha: 'tree_sha_base' } }), { status: 200 });
        }
        if (url.endsWith('/git/blobs') && method === 'POST') {
          return new Response(JSON.stringify({ sha: `blob_${committedPaths.length}` }), { status: 201 });
        }
        if (url.endsWith('/git/trees') && method === 'POST') {
          const parsed = JSON.parse(String(init?.body ?? '{}')) as {
            tree: Array<{ path: string }>;
          };
          committedPaths.push(...parsed.tree.map((item) => item.path));
          return new Response(JSON.stringify({ sha: 'tree_new_123' }), { status: 201 });
        }
        if (url.endsWith('/git/commits') && method === 'POST') {
          return new Response(
            JSON.stringify({
              sha: 'commit_new_sitecfg',
              html_url: 'https://github.com/nexusx-esports/nexusx-india-site/commit/commit_new_sitecfg',
            }),
            { status: 201 }
          );
        }
        if (url.includes('/git/refs/heads/') && method === 'PATCH') {
          return new Response(
            JSON.stringify({ ref: 'refs/heads/main', object: { sha: 'commit_new_sitecfg' } }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ message: 'Not Found' }), { status: 404 });
      }),
    });

    const loginRes = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      env
    );
    expect(loginRes.status).toBe(200);
    const cookie = extractHostCookieValue(loginRes);
    const { csrfToken } = (await loginRes.json()) as { csrfToken: string };

    const putRes = await worker.fetch(
      new Request('https://worker.example.com/api/admin/content', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: cookie,
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          ...sampleBundle,
          siteConfig: {
            ...siteConfig,
            tickerAnnouncement: 'REGISTRATIONS OPEN FOR SEASON 2',
          },
          commitMessage: 'chore(admin): update site ticker',
        }),
      }),
      env
    );
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { updatedFiles: string[] };
    expect(putBody.updatedFiles).toEqual([
      'public/data/tournaments.json',
      'public/data/results.json',
      'public/data/news.json',
      'public/data/site-config.json',
    ]);
    expect(committedPaths).toEqual(putBody.updatedFiles);
  });

  it('enforces single-owner Cloudflare Access email lock across login, session check, and admin routes', async () => {
    const baseEnv = await createTestEnv();
    const lockedEnv: WorkerEnv = {
      ...baseEnv,
      CLOUDFLARE_ACCESS_OWNER_EMAIL: 'owner@nexusxesports.in',
    };
    const worker = createWorkerHandler();

    const statusRes = await worker.fetch(
      new Request('https://worker.example.com/api/auth/setup/status', {
        headers: { Origin: TRUSTED_ORIGIN },
      }),
      lockedEnv
    );
    expect(statusRes.status).toBe(200);
    const statusJson = (await statusRes.json()) as {
      ownerLockEnabled: boolean;
      singleOwnerMode: boolean;
    };
    expect(statusJson.ownerLockEnabled).toBe(true);
    expect(statusJson.singleOwnerMode).toBe(true);

    // Wrong Cloudflare Access identity cannot sign in even with valid owner username/password
    const strangerLogin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          'Cf-Access-Authenticated-User-Email': 'someone-else@gmail.com',
        },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      lockedEnv
    );
    expect(strangerLogin.status).toBe(403);

    // Exact owner email succeeds
    const ownerLogin = await worker.fetch(
      new Request('https://worker.example.com/api/auth/login', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          'Cf-Access-Authenticated-User-Email': 'Owner@NexusXEsports.in',
        },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      lockedEnv
    );
    expect(ownerLogin.status).toBe(200);
    const cookie = extractHostCookieValue(ownerLogin);

    // Session cookie alone fails without matching Cloudflare Access owner header
    const sessionDenied = await worker.fetch(
      new Request('https://worker.example.com/api/auth/session', {
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: cookie,
          'Cf-Access-Authenticated-User-Email': 'intruder@example.com',
        },
      }),
      lockedEnv
    );
    expect(sessionDenied.status).toBe(401);

    const adminDenied = await worker.fetch(
      new Request('https://worker.example.com/api/admin/private-config', {
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: cookie,
          'Cf-Access-Authenticated-User-Email': 'intruder@example.com',
        },
      }),
      lockedEnv
    );
    expect(adminDenied.status).toBe(403);
  });

  it('serves sanitized live published content via GET /api/public/content across KV reloads while hiding drafts and archives', async () => {
    const kv = createMemoryKv();
    const baseEnv = await createTestEnv(kv);
    const sandboxEnv: WorkerEnv = {
      ...baseEnv,
      ENVIRONMENT: 'development',
      GITHUB_APP_ID: '',
      GITHUB_APP_INSTALLATION_ID: '',
      GITHUB_APP_PRIVATE_KEY: '',
    };
    const workerA = createWorkerHandler();

    // Unseeded initially
    const initialPublic = await workerA.fetch(
      new Request('https://localhost:8787/api/public/content', {
        headers: { Origin: TRUSTED_ORIGIN },
      }),
      sandboxEnv
    );
    expect(initialPublic.status).toBe(200);
    expect(initialPublic.headers.get('Cache-Control')).toContain('no-store');
    expect((await initialPublic.json()) as { available: boolean }).toEqual({ available: false });

    // Login as owner and save mix of published, draft, archived & unpublished items
    const loginRes = await workerA.fetch(
      new Request('https://localhost:8787/api/auth/login', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'nexusx-owner', password: 'NexusX!TestAdmin#2026' }),
      }),
      sandboxEnv
    );
    expect(loginRes.status).toBe(200);
    const cookie = extractHostCookieValue(loginRes);
    const { csrfToken } = (await loginRes.json()) as { csrfToken: string };

    const sample = makeSampleBundle();
    const publishedEvent = {
      ...sample.tournaments.tournaments[0],
      id: 'NX-SOLO-LIVE',
      title: 'NexusX Live Solo Showdown',
      status: 'upcoming' as const,
      published: true,
    };
    const draftEvent = {
      ...sample.tournaments.tournaments[0],
      id: 'NX-SOLO-DRAFT',
      slug: 'solo-draft-hidden',
      title: 'Secret Unreleased Draft Cup',
      status: 'draft' as const,
      published: false,
    };
    const archivedEvent = {
      ...sample.tournaments.tournaments[0],
      id: 'NX-SOLO-ARCH',
      slug: 'solo-arch-hidden',
      title: 'Old Archived Event',
      status: 'archived' as const,
      published: false,
    };
    const siteConfig = readRepoJson<NonNullable<AdminContentBundle['siteConfig']>>('site-config.json');
    siteConfig.tickerAnnouncement = 'LIVE WORKER TICKER ACTIVE';

    const putRes = await workerA.fetch(
      new Request('https://localhost:8787/api/admin/content', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          'Content-Type': 'application/json',
          Cookie: cookie,
          'X-CSRF-Token': csrfToken,
        },
        body: JSON.stringify({
          tournaments: {
            ...sample.tournaments,
            tournaments: [publishedEvent, draftEvent, archivedEvent],
          },
          results: {
            ...sample.results,
            entries: [
              {
                id: 'res-live',
                tournamentId: 'NX-SOLO-LIVE',
                tournamentName: 'Live Result',
                division: 'Solo',
                date: '2026-11-12',
                winner: 'Team Alpha',
                finalRankings: [{ rank: 1, teamOrPlayer: 'Team Alpha', totalPoints: 50, prize: 'INR 5,000' }],
                prizeDistribution: '1st INR 5,000',
                summary: 'Live result summary.',
                published: true,
              },
              {
                id: 'res-hidden',
                tournamentId: 'NX-SOLO-DRAFT',
                tournamentName: 'Hidden Result',
                division: 'Solo',
                date: '2026-11-12',
                winner: 'Team Beta',
                finalRankings: [{ rank: 1, teamOrPlayer: 'Team Beta', totalPoints: 40, prize: 'INR 3,000' }],
                prizeDistribution: '1st INR 3,000',
                summary: 'Hidden draft result.',
                published: false,
              },
            ],
          },
          news: {
            ...sample.news,
            entries: [
              { ...sample.news.entries[0], id: 'news-live', title: 'Live Update', published: true },
              { ...sample.news.entries[0], id: 'news-hidden', title: 'Hidden Draft News', published: false },
            ],
          },
          siteConfig,
          commitMessage: 'chore(sandbox): publish live content',
        }),
      }),
      sandboxEnv
    );
    expect(putRes.status).toBe(200);

    // Cold-start new Worker handler reading persisted KV state serves live public data without drafts
    const workerB = createWorkerHandler();
    const liveRes = await workerB.fetch(
      new Request('https://localhost:8787/api/public/content', {
        headers: { Origin: TRUSTED_ORIGIN },
      }),
      sandboxEnv
    );
    expect(liveRes.status).toBe(200);
    const liveBody = (await liveRes.json()) as {
      available: boolean;
      source: string;
      tournaments: { tournaments: Array<{ id: string; title: string }> };
      results: { entries: Array<{ id: string }> };
      news: { entries: Array<{ id: string }> };
      siteConfig: { tickerAnnouncement: string };
    };

    expect(liveBody.available).toBe(true);
    expect(liveBody.source).toBe('local-sandbox');
    expect(liveBody.tournaments.tournaments.map((t) => t.id)).toEqual(['NX-SOLO-LIVE']);
    expect(liveBody.results.entries.map((r) => r.id)).toEqual(['res-live']);
    expect(liveBody.news.entries.map((n) => n.id)).toEqual(['news-live']);
    expect(liveBody.siteConfig.tickerAnnouncement).toBe('LIVE WORKER TICKER ACTIVE');
  });
});
