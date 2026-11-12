import {
  containsPrivateSheetReference,
  containsSecretMaterial,
  validateHttpsUrl,
} from '../../utils/validation';
import type { TournamentFormat } from '../../types/data';
import type {
  AdminContentPayload,
  AdminContentResponse,
  AdminPublishResponse,
  AdminSecurityAuditEntry,
  AdminSessionInfo,
  AdminSessionStatus,
  AdminSetupStatus,
  PrivateSheetEntry,
  PrivateSheetsConfig,
} from '../types';

const STORAGE_API_URL_KEY = 'nexusx_admin_api_url';
const ADMIN_REQUEST_TIMEOUT_MS = 15_000;

/**
 * Ephemeral HMAC-bound CSRF token kept strictly in JS heap memory.
 * Session credentials live exclusively in the Worker's HttpOnly cookie
 * and are never written to sessionStorage or localStorage.
 */
let inMemoryCsrfToken: string | null = null;

export function clearInMemoryAuthState(): void {
  inMemoryCsrfToken = null;
}

export class AdminApiError extends Error {
  status: number;
  details: string[];

  constructor(message: string, status = 500, details: string[] = []) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.details = details;
  }
}

export function getDefaultAdminApiUrl(): string {
  const fromEnv = (import.meta.env.VITE_ADMIN_API_URL ?? '').trim().replace(/\/+$/g, '');
  if (fromEnv) return fromEnv;
  try {
    return (window.sessionStorage.getItem(STORAGE_API_URL_KEY) ?? '').trim().replace(/\/+$/g, '');
  } catch {
    return '';
  }
}

export function setConfiguredAdminApiUrl(rawUrl: string): string {
  const normalized = rawUrl.trim().replace(/\/+$/g, '');
  try {
    if (normalized) {
      window.sessionStorage.setItem(STORAGE_API_URL_KEY, normalized);
    } else {
      window.sessionStorage.removeItem(STORAGE_API_URL_KEY);
    }
  } catch {
    // Ignore restricted storage contexts
  }
  return normalized;
}

export function validateWorkerApiUrl(raw: string): { valid: boolean; normalized: string; error?: string } {
  const trimmed = raw.trim().replace(/\/+$/g, '');
  if (!trimmed) {
    return {
      valid: false,
      normalized: '',
      error: 'Cloudflare Worker API URL is required (e.g. https://nexusx-admin.yourname.workers.dev).',
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, normalized: trimmed, error: 'Worker API URL is not valid.' };
  }

  if (parsed.username || parsed.password) {
    return {
      valid: false,
      normalized: trimmed,
      error: 'Worker API URL must not include embedded credentials.',
    };
  }

  const isLocalHttp =
    parsed.protocol === 'http:' &&
    (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');

  if (parsed.protocol === 'https:' || isLocalHttp) {
    return { valid: true, normalized: trimmed };
  }

  const httpsCheck = validateHttpsUrl(trimmed, 'Worker API URL');
  return {
    valid: false,
    normalized: trimmed,
    error: httpsCheck.error || 'Worker API URL must use https:// (or http://localhost for local dev).',
  };
}

export function isCrossOriginWorkerUrl(apiBaseUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  const check = validateWorkerApiUrl(apiBaseUrl);
  if (!check.valid) return false;
  try {
    const workerOrigin = new URL(check.normalized).origin;
    return workerOrigin !== window.location.origin;
  } catch {
    return false;
  }
}

export async function adminRequest<T>(
  apiBaseUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  return workerRequest<T>(apiBaseUrl, path, init);
}

async function workerRequest<T>(
  apiBaseUrl: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const baseCheck = validateWorkerApiUrl(apiBaseUrl);
  if (!baseCheck.valid) {
    throw new AdminApiError(baseCheck.error || 'Invalid Worker API URL.', 400);
  }

  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const isStateChanging =
    method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
  if (
    isStateChanging &&
    path !== '/api/auth/login' &&
    path !== '/api/auth/setup' &&
    inMemoryCsrfToken &&
    !headers.has('X-CSRF-Token')
  ) {
    headers.set('X-CSRF-Token', inMemoryCsrfToken);
  }

  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => controller.abort(), ADMIN_REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseCheck.normalized}${path}`, {
      ...init,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new AdminApiError(
        'Request to the Cloudflare Worker API timed out. Please verify Worker availability and try again.',
        408
      );
    }
    throw new AdminApiError(
      'Unable to reach the Cloudflare Worker API. Check the Worker URL, HTTPS connectivity, and ALLOWED_ORIGINS.',
      0
    );
  } finally {
    globalThis.clearTimeout(timerId);
  }

  const text = await response.text();
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text) as Record<string, unknown>;
    } catch {
      parsed = { error: text };
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      clearInMemoryAuthState();
    }
    const details = Array.isArray(parsed.details)
      ? parsed.details.filter((d): d is string => typeof d === 'string')
      : [];
    const message =
      typeof parsed.error === 'string' && parsed.error
        ? parsed.error
        : `Worker API error (HTTP ${response.status})`;
    throw new AdminApiError(message, response.status, details);
  }

  return parsed as unknown as T;
}

export async function checkAdminSession(apiBaseUrl: string): Promise<AdminSessionStatus> {
  const res = await workerRequest<AdminSessionStatus>(apiBaseUrl, '/api/auth/session', {
    method: 'GET',
  });
  if (res.authenticated && typeof res.csrfToken === 'string' && res.csrfToken) {
    inMemoryCsrfToken = res.csrfToken;
  } else {
    clearInMemoryAuthState();
  }
  return res;
}

export async function loginAdmin(
  apiBaseUrl: string,
  username: string,
  password: string
): Promise<{ username: string }> {
  setConfiguredAdminApiUrl(apiBaseUrl);
  const res = await workerRequest<{
    authenticated: boolean;
    username: string;
    csrfToken?: string;
    authMode?: string;
  }>(apiBaseUrl, '/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username: username.trim(), password }),
  });

  inMemoryCsrfToken =
    typeof res.csrfToken === 'string' && res.csrfToken.trim() ? res.csrfToken.trim() : null;
  return { username: res.username };
}

export async function logoutAdmin(apiBaseUrl: string): Promise<void> {
  try {
    if (validateWorkerApiUrl(apiBaseUrl).valid) {
      await workerRequest(apiBaseUrl, '/api/auth/logout', { method: 'POST' });
    }
  } finally {
    clearInMemoryAuthState();
  }
}

export async function fetchAdminContent(apiBaseUrl: string): Promise<AdminContentResponse> {
  return workerRequest<AdminContentResponse>(apiBaseUrl, '/api/admin/content', {
    method: 'GET',
  });
}

export async function publishAdminContent(
  apiBaseUrl: string,
  payload: AdminContentPayload,
  commitMessage: string
): Promise<AdminPublishResponse> {
  if (containsSecretMaterial(payload)) {
    throw new AdminApiError(
      'Publish blocked: potential token or private key string detected inside content.',
      400
    );
  }
  if (containsPrivateSheetReference(payload)) {
    throw new AdminApiError(
      'Publish blocked: Google Sheets URLs cannot be committed to public repository JSON files. Save them under Private Organizer Settings instead.',
      400
    );
  }
  return workerRequest<AdminPublishResponse>(apiBaseUrl, '/api/admin/content', {
    method: 'PUT',
    body: JSON.stringify({
      tournaments: payload.tournaments,
      results: payload.results,
      news: payload.news,
      ...(payload.siteConfig ? { siteConfig: payload.siteConfig } : {}),
      commitMessage,
    }),
  });
}

export async function checkAdminSetupStatus(apiBaseUrl: string): Promise<AdminSetupStatus> {
  return workerRequest<AdminSetupStatus>(apiBaseUrl, '/api/auth/setup/status', {
    method: 'GET',
  });
}

export async function completeAdminInitialSetup(
  apiBaseUrl: string,
  payload: { setupToken: string; username: string; password: string }
): Promise<{ ok: boolean; setupCompleted: boolean; username: string }> {
  setConfiguredAdminApiUrl(apiBaseUrl);
  return workerRequest(apiBaseUrl, '/api/auth/setup', {
    method: 'POST',
    body: JSON.stringify({
      setupToken: payload.setupToken.trim(),
      username: payload.username.trim(),
      password: payload.password,
    }),
  });
}

export async function generateServerTournamentId(
  apiBaseUrl: string,
  format: TournamentFormat,
  existingIds: string[]
): Promise<{ id: string; slugSuggestion: string }> {
  return workerRequest(apiBaseUrl, '/api/admin/tournaments/generate-id', {
    method: 'POST',
    body: JSON.stringify({ format, existingIds }),
  });
}

export async function fetchPrivateSheetsConfig(apiBaseUrl: string): Promise<PrivateSheetsConfig> {
  return workerRequest<PrivateSheetsConfig>(apiBaseUrl, '/api/admin/private-config', {
    method: 'GET',
  });
}

export async function savePrivateSheetsConfig(
  apiBaseUrl: string,
  sheetsByTournamentId: Record<string, PrivateSheetEntry>
): Promise<{ ok: boolean } & PrivateSheetsConfig> {
  return workerRequest(apiBaseUrl, '/api/admin/private-config', {
    method: 'PUT',
    body: JSON.stringify({ sheetsByTournamentId }),
  });
}

export async function changeAdminId(
  apiBaseUrl: string,
  currentPassword: string,
  newUsername: string
): Promise<{ ok: boolean; requiresReauth: boolean; username: string }> {
  const res = await workerRequest<{ ok: boolean; requiresReauth: boolean; username: string }>(
    apiBaseUrl,
    '/api/admin/security/change-id',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newUsername: newUsername.trim() }),
    }
  );
  if (res.requiresReauth) {
    clearInMemoryAuthState();
  }
  return res;
}

export async function changeAdminPassword(
  apiBaseUrl: string,
  currentPassword: string,
  newPassword: string
): Promise<{ ok: boolean; requiresReauth: boolean }> {
  const res = await workerRequest<{ ok: boolean; requiresReauth: boolean }>(
    apiBaseUrl,
    '/api/admin/security/change-password',
    {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }
  );
  if (res.requiresReauth) {
    clearInMemoryAuthState();
  }
  return res;
}

export async function fetchActiveAdminSessions(
  apiBaseUrl: string
): Promise<{ sessions: AdminSessionInfo[] }> {
  return workerRequest(apiBaseUrl, '/api/admin/security/sessions', { method: 'GET' });
}

export async function revokeAdminSession(
  apiBaseUrl: string,
  jti: string
): Promise<{ ok: boolean; currentRevoked: boolean }> {
  const res = await workerRequest<{ ok: boolean; currentRevoked: boolean }>(
    apiBaseUrl,
    `/api/admin/security/sessions/${encodeURIComponent(jti)}`,
    { method: 'DELETE' }
  );
  if (res.currentRevoked) {
    clearInMemoryAuthState();
  }
  return res;
}

export async function revokeAllAdminSessions(
  apiBaseUrl: string,
  includeCurrent = false
): Promise<{ ok: boolean; revokedCount: number; requiresReauth: boolean }> {
  const res = await workerRequest<{
    ok: boolean;
    revokedCount: number;
    requiresReauth: boolean;
  }>(apiBaseUrl, '/api/admin/security/sessions/revoke-all', {
    method: 'POST',
    body: JSON.stringify({ includeCurrent }),
  });
  if (res.requiresReauth) {
    clearInMemoryAuthState();
  }
  return res;
}

export async function fetchSecurityAuditLog(
  apiBaseUrl: string
): Promise<{ entries: AdminSecurityAuditEntry[] }> {
  return workerRequest(apiBaseUrl, '/api/admin/security/audit', { method: 'GET' });
}
