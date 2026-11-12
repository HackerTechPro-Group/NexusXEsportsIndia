export const SESSION_COOKIE_NAME = 'nexusx_admin_session';
export const HOST_SESSION_COOKIE_NAME = '__Host-nexusx_admin_session';
export const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour sliding-free fixed lifetime
export const MIN_SESSION_SECRET_LENGTH = 32;
export const MIN_ADMIN_PASSWORD_LENGTH = 14;
export const MAX_ADMIN_PASSWORD_LENGTH = 256;
// Cloudflare Workers WebCrypto enforces <= 100,000 PBKDF2 iterations in Edge isolates.
const MIN_PBKDF2_ITERATIONS = 10_000;
const MAX_PBKDF2_ITERATIONS = 100_000;

const WEAK_PASSWORD_FRAGMENTS = [
  'password',
  '123456',
  'qwerty',
  'nexusx123',
  'admin123',
  'changeme',
];

export function validateAdminUsername(raw: string): { valid: boolean; normalized: string; error?: string } {
  const normalized = raw.trim();
  if (normalized.length < 4 || normalized.length > 64) {
    return {
      valid: false,
      normalized,
      error: 'Admin ID must be between 4 and 64 characters.',
    };
  }
  if (!/^[A-Za-z0-9._-]+$/.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Admin ID may contain only letters, numbers, dots, underscores, and hyphens.',
    };
  }
  return { valid: true, normalized };
}

export function validatePasswordPolicy(
  password: string,
  username?: string
): { valid: boolean; error?: string } {
  if (typeof password !== 'string' || password.length < MIN_ADMIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${MIN_ADMIN_PASSWORD_LENGTH} characters long.`,
    };
  }
  if (password.length > MAX_ADMIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      error: `Password must not exceed ${MAX_ADMIN_PASSWORD_LENGTH} characters.`,
    };
  }
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  if (!hasLower || !hasUpper || !hasDigit || !hasSymbol) {
    return {
      valid: false,
      error: 'Password must include uppercase, lowercase, numeric, and symbol characters.',
    };
  }
  const lower = password.toLowerCase();
  if (WEAK_PASSWORD_FRAGMENTS.some((frag) => lower.includes(frag))) {
    return {
      valid: false,
      error: 'Password contains a common predictable pattern. Choose a stronger passphrase.',
    };
  }
  if (/(.)\1{3,}/.test(password)) {
    return {
      valid: false,
      error: 'Password must not repeat the same character 4 or more times consecutively.',
    };
  }
  if (username && username.trim().length >= 4 && lower.includes(username.trim().toLowerCase())) {
    return {
      valid: false,
      error: 'Password must not contain your Admin ID.',
    };
  }
  return { valid: true };
}

export function maskClientIp(rawIp: string): string {
  const cleaned = rawIp.trim();
  if (!cleaned || cleaned === 'unknown') return 'unknown';
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
    }
  }
  if (cleaned.includes(':')) {
    const segs = cleaned.split(':').filter(Boolean);
    return `${segs.slice(0, 3).join(':')}::*`;
  }
  return 'masked';
}

export function summarizeUserAgent(rawUa: string | null): string {
  if (!rawUa) return 'Unknown client';
  const safe = rawUa.replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!safe) return 'Unknown client';
  return safe.slice(0, 80);
}

export function base64UrlEncode(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(encoded: string): Uint8Array {
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Constant-time byte array comparison to prevent timing side channels.
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  const maxLen = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < maxLen; i += 1) {
    const ba = i < a.length ? a[i] : 0;
    const bb = i < b.length ? b[i] : 0;
    diff |= ba ^ bb;
  }
  return diff === 0;
}

/**
 * SHA-256 digests both strings prior to constant-time comparison so length differences leak nothing.
 */
export async function hashAndCompareConstantTime(submitted: string, expected: string): Promise<boolean> {
  if (!submitted || !expected) return false;
  const enc = new TextEncoder();
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(submitted)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  return constantTimeEqual(new Uint8Array(hashA), new Uint8Array(hashB));
}

export function isValidSessionSecret(secret: string | undefined): boolean {
  if (typeof secret !== 'string') return false;
  const trimmed = secret.trim();
  if (trimmed.length < MIN_SESSION_SECRET_LENGTH) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('your_') ||
    lower.includes('placeholder') ||
    lower.includes('changeme') ||
    lower.includes('change-me')
  ) {
    return false;
  }
  return true;
}

/**
 * Generates a PBKDF2-SHA256 hash string compatible with Cloudflare Worker WebCrypto limits (<=100k iterations).
 */
export async function hashPasswordPBKDF2(
  password: string,
  saltInput?: Uint8Array,
  iterations = MAX_PBKDF2_ITERATIONS
): Promise<string> {
  if (iterations < MIN_PBKDF2_ITERATIONS || iterations > MAX_PBKDF2_ITERATIONS) {
    throw new Error(`Iterations must be between ${MIN_PBKDF2_ITERATIONS} and ${MAX_PBKDF2_ITERATIONS}`);
  }
  const salt = saltInput ?? crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return `pbkdf2_sha256$${iterations}$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(derived))}`;
}

/**
 * Verifies a plaintext password against a stored `pbkdf2_sha256$<iter>$<salt>$<hash>` secret.
 */
export async function verifyPasswordPBKDF2(
  password: string,
  storedHash: string
): Promise<boolean> {
  if (!password || !storedHash) return false;
  const parts = storedHash.trim().split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha256') {
    return false;
  }

  const iterations = Number.parseInt(parts[1], 10);
  if (
    !Number.isFinite(iterations) ||
    iterations < MIN_PBKDF2_ITERATIONS ||
    iterations > MAX_PBKDF2_ITERATIONS
  ) {
    return false;
  }

  try {
    const salt = base64ToBytes(parts[2]);
    const expected = base64ToBytes(parts[3]);
    if (salt.length < 8 || expected.length !== 32) return false;

    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derived = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: 'PBKDF2',
          salt: salt as BufferSource,
          iterations,
          hash: 'SHA-256',
        },
        keyMaterial,
        256
      )
    );
    return constantTimeEqual(derived, expected);
  } catch {
    return false;
  }
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  if (!isValidSessionSecret(secret)) {
    throw new Error(`SESSION_SECRET must be at least ${MIN_SESSION_SECRET_LENGTH} non-placeholder characters.`);
  }
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret.trim()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export interface SessionClaims {
  sub: string;
  jti: string;
  iat: number;
  iatMs?: number;
  exp: number;
}

export async function issueSession(
  username: string,
  secret: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000),
  nowMs = nowSeconds * 1000
): Promise<{ token: string; claims: SessionClaims }> {
  const safeTtl = Math.max(60, Math.min(ttlSeconds, 24 * 60 * 60));
  const claims: SessionClaims = {
    sub: username,
    jti: crypto.randomUUID(),
    iat: nowSeconds,
    iatMs: nowMs,
    exp: nowSeconds + safeTtl,
  };
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${header}.${payload}`;
  const key = await importHmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  );
  return {
    token: `${signingInput}.${base64UrlEncode(sig)}`,
    claims,
  };
}

export async function signSessionToken(
  username: string,
  secret: string,
  ttlSeconds = DEFAULT_TTL_SECONDS,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> {
  const { token } = await issueSession(username, secret, ttlSeconds, nowSeconds);
  return token;
}

export async function verifySessionToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<SessionClaims | null> {
  if (!token || !isValidSessionSecret(secret)) return null;
  const segments = token.trim().split('.');
  if (segments.length !== 3) return null;

  const [headerB64, payloadB64, sigB64] = segments;
  if (!headerB64 || !payloadB64 || !sigB64) return null;

  try {
    const header = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(headerB64))
    ) as { alg?: unknown; typ?: unknown };
    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return null;
    }

    const key = await importHmacKey(secret);
    const sigBytes = base64UrlDecode(sigB64);
    const validSig = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as BufferSource,
      new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    );
    if (!validSig) return null;

    const claims = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64))
    ) as Partial<SessionClaims>;

    if (
      typeof claims.sub !== 'string' ||
      !claims.sub ||
      typeof claims.jti !== 'string' ||
      !claims.jti ||
      typeof claims.exp !== 'number' ||
      !Number.isFinite(claims.exp) ||
      typeof claims.iat !== 'number' ||
      !Number.isFinite(claims.iat) ||
      (claims.iatMs !== undefined &&
        (typeof claims.iatMs !== 'number' || !Number.isFinite(claims.iatMs) || claims.iatMs < 0))
    ) {
      return null;
    }

    if (
      claims.iat > nowSeconds + 60 ||
      claims.exp <= nowSeconds ||
      claims.exp - claims.iat > 24 * 60 * 60
    ) {
      return null;
    }

    return claims as SessionClaims;
  } catch {
    return null;
  }
}

/**
 * Derives an HMAC-SHA256 CSRF token bound to the specific session jti + username + SESSION_SECRET.
 */
export async function deriveCsrfToken(
  jti: string,
  username: string,
  secret: string
): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`csrf:v1:${jti}:${username}`)
    )
  );
  return base64UrlEncode(sig);
}

export async function verifyCsrfToken(
  candidate: string | null | undefined,
  jti: string,
  username: string,
  secret: string
): Promise<boolean> {
  if (!candidate || typeof candidate !== 'string') return false;
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  try {
    const expected = await deriveCsrfToken(jti, username, secret);
    return constantTimeEqual(base64UrlDecode(trimmed), base64UrlDecode(expected));
  } catch {
    return false;
  }
}

export function isHttpsRequest(request: Request): boolean {
  try {
    const url = new URL(request.url);
    if (url.protocol === 'https:') return true;
  } catch {
    // Fallback check below
  }
  return request.headers.get('X-Forwarded-Proto')?.toLowerCase() === 'https';
}

export function extractSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie');
  if (!cookieHeader) return null;

  const expectedName = isHttpsRequest(request)
    ? HOST_SESSION_COOKIE_NAME
    : SESSION_COOKIE_NAME;

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

export interface CookieBuildOptions {
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
  partitioned?: boolean;
  maxAgeSeconds?: number;
}

export function determineCookieSameSite(request: Request): 'Strict' | 'None' {
  const origin = request.headers.get('Origin')?.trim();
  const secFetchSite = request.headers.get('Sec-Fetch-Site')?.trim().toLowerCase();

  try {
    const reqOrigin = new URL(request.url).origin;
    if (origin && origin === reqOrigin) {
      return 'Strict';
    }
  } catch {
    // Fall through
  }

  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') {
    return 'Strict';
  }

  return 'None';
}

export function buildSessionCookieHeader(
  token: string,
  options: CookieBuildOptions = {}
): string {
  const secure = options.secure ?? true;
  const maxAge = options.maxAgeSeconds ?? DEFAULT_TTL_SECONDS;
  if (!secure) {
    // Local HTTP development cannot set __Host- or Secure cookies
    return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
  }
  const sameSite = options.sameSite ?? 'None';
  const partitioned = sameSite === 'None' && (options.partitioned ?? true);
  return `${HOST_SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=${sameSite}${
    partitioned ? '; Partitioned' : ''
  }; Max-Age=${maxAge}`;
}

export function buildClearSessionCookieHeader(
  options: Omit<CookieBuildOptions, 'maxAgeSeconds'> = {}
): string {
  const secure = options.secure ?? true;
  if (!secure) {
    return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }
  const sameSite = options.sameSite ?? 'None';
  const partitioned = sameSite === 'None' && (options.partitioned ?? true);
  return `${HOST_SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=${sameSite}${
    partitioned ? '; Partitioned' : ''
  }; Max-Age=0`;
}

export function hasExactJsonMediaType(request: Request): boolean {
  const raw = request.headers.get('Content-Type') ?? '';
  const essence = raw.split(';', 1)[0].trim().toLowerCase();
  return essence === 'application/json';
}

export function hasValidStateChangeOrigin(
  request: Request,
  originPresent: boolean,
  originVerified: boolean
): boolean {
  if (!originPresent || !originVerified) {
    return false;
  }
  const secFetchSite = request.headers.get('Sec-Fetch-Site')?.trim().toLowerCase();
  if (secFetchSite === 'cross-site' && !originVerified) {
    return false;
  }
  return true;
}
