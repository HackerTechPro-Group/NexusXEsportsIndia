import {
  DEFAULT_TTL_SECONDS,
  maskClientIp,
  summarizeUserAgent,
} from './auth.ts';
import type {
  AdminContentBundle,
  CmsSnapshotPayload,
  PrivateSheetsConfig,
  SecurityAuditEntry,
  SecurityAuditEventType,
  SecurityKvBinding,
  StoredOwnerAccount,
  StoredSessionRecord,
  WorkerEnv,
} from './types.ts';
import { resolveSecurityKv } from './types.ts';

const OWNER_KEY = 'auth:owner';
const SESSIONS_INDEX_KEY = 'sessions:index';
const AUDIT_LOG_KEY = 'audit:log';
const PRIVATE_SHEETS_KEY = 'private:sheets';
const SANDBOX_CONTENT_KEY = 'dev:sandbox_content_v1';
const PUBLIC_CONTENT_KEY = 'public:live_content_v1';
const PUBLIC_CMS_KEY = 'public:live_cms_v1';
const MAX_AUDIT_ENTRIES = 100;
const MAX_INDEXED_SESSIONS = 50;

export function parseAllowedOrigins(raw: string | undefined): Set<string> {
  const out = new Set<string>();
  if (!raw) return out;
  for (const item of raw.split(',')) {
    const trimmed = item.trim().replace(/\/+$/g, '');
    if (!trimmed || trimmed.includes('YOUR_')) continue;
    out.add(trimmed);
  }
  return out;
}

export function isProductionEnv(env: WorkerEnv): boolean {
  const mode = env.ENVIRONMENT?.trim().toLowerCase();
  if (mode === 'production') return true;
  if (mode === 'development' || mode === 'test') return false;
  for (const origin of parseAllowedOrigins(env.ALLOWED_ORIGINS)) {
    try {
      const parsed = new URL(origin);
      if (parsed.protocol === 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        return true;
      }
    } catch {
      // Ignore unparseable entries
    }
  }
  return false;
}

export interface ActiveOwnerResolution {
  configured: boolean;
  source: 'kv' | 'env' | 'none';
  owner?: StoredOwnerAccount;
}

export interface LivePublicContentRecord {
  updatedAt: string;
  source: 'local-sandbox' | 'github-publish' | 'd1-live';
  bundle: AdminContentBundle;
}

export interface CachedPublicCmsRecord {
  version: number;
  etag: string;
  updatedAt: string;
  snapshot: CmsSnapshotPayload;
}

export interface LocalSecurityFallback {
  owner: StoredOwnerAccount | null;
  sessions: Map<string, StoredSessionRecord>;
  revoked: Map<string, number>;
  auditLog: SecurityAuditEntry[];
  privateSheets: PrivateSheetsConfig;
  sandboxContent?: AdminContentBundle;
  livePublicContent?: LivePublicContentRecord;
  livePublicCms?: CachedPublicCmsRecord | null;
}

export function createDefaultSandboxContent(
  dateStamp = new Date().toISOString().slice(0, 10)
): AdminContentBundle {
  return {
    tournaments: {
      schemaVersion: 1,
      lastUpdated: dateStamp,
      tournaments: [],
    },
    results: {
      schemaVersion: 1,
      lastUpdated: dateStamp,
      entries: [],
    },
    news: {
      schemaVersion: 1,
      lastUpdated: dateStamp,
      entries: [],
    },
  };
}

export function createLocalSecurityFallback(): LocalSecurityFallback {
  return {
    owner: null,
    sessions: new Map(),
    revoked: new Map(),
    auditLog: [],
    privateSheets: {
      schemaVersion: 1,
      updatedAt: '',
      sheetsByTournamentId: {},
    },
  };
}

function pruneLocalFallback(fallback: LocalSecurityFallback, nowSeconds: number): void {
  for (const [jti, exp] of fallback.revoked.entries()) {
    if (exp <= nowSeconds) fallback.revoked.delete(jti);
  }
  for (const [jti, rec] of fallback.sessions.entries()) {
    if (rec.expiresAt <= nowSeconds) fallback.sessions.delete(jti);
  }
}

export async function resolveActiveOwner(
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<ActiveOwnerResolution> {
  const kv = resolveSecurityKv(env);
  if (kv) {
    const raw = await kv.get(OWNER_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as StoredOwnerAccount;
        if (parsed && typeof parsed.username === 'string' && typeof parsed.passwordHash === 'string') {
          return { configured: true, source: 'kv', owner: parsed };
        }
      } catch {
        // Ignore malformed KV record cleanly
      }
    }
  } else if (fallback.owner) {
    return { configured: true, source: 'kv', owner: fallback.owner };
  }

  const envUser = env.ADMIN_USERNAME?.trim();
  const envHash = env.ADMIN_PASSWORD_HASH?.trim();
  if (envUser && envHash) {
    return {
      configured: true,
      source: 'env',
      owner: {
        version: 1,
        username: envUser,
        passwordHash: envHash,
        setupCompletedAt: '',
        credentialUpdatedAt: '',
        tokenInvalidBefore: 0,
      },
    };
  }

  return { configured: false, source: 'none' };
}

export async function saveOwnerAccount(
  owner: StoredOwnerAccount,
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<void> {
  const kv = resolveSecurityKv(env);
  if (kv) {
    await kv.put(OWNER_KEY, JSON.stringify(owner));
    return;
  }
  fallback.owner = owner;
}

interface SessionIndexEntry {
  jti: string;
  expiresAt: number;
}

async function readSessionIndex(kv: SecurityKvBinding, nowSeconds: number): Promise<SessionIndexEntry[]> {
  const raw = await kv.get(SESSIONS_INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SessionIndexEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.jti === 'string' &&
        typeof item.expiresAt === 'number' &&
        item.expiresAt > nowSeconds
    );
  } catch {
    return [];
  }
}

export async function registerSessionRecord(
  jti: string,
  username: string,
  issuedAt: number,
  expiresAt: number,
  request: Request,
  clientIp: string,
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  pruneLocalFallback(fallback, nowSeconds);

  const record: StoredSessionRecord = {
    jti,
    username,
    issuedAt,
    expiresAt,
    userAgentSummary: summarizeUserAgent(request.headers.get('User-Agent')),
    ipMasked: maskClientIp(clientIp),
  };

  fallback.sessions.set(jti, record);

  const kv = resolveSecurityKv(env);
  if (kv) {
    const ttl = Math.max(60, expiresAt - nowSeconds);
    await kv.put(`session:${jti}`, JSON.stringify(record), { expirationTtl: ttl });
    const existing = await readSessionIndex(kv, nowSeconds);
    const nextIndex = [
      { jti, expiresAt },
      ...existing.filter((item) => item.jti !== jti),
    ].slice(0, MAX_INDEXED_SESSIONS);
    await kv.put(SESSIONS_INDEX_KEY, JSON.stringify(nextIndex), {
      expirationTtl: DEFAULT_TTL_SECONDS * 2,
    });
  }
}

export async function revokeSessionByJti(
  jti: string,
  expiresAt: number,
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<void> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  pruneLocalFallback(fallback, nowSeconds);
  fallback.sessions.delete(jti);
  fallback.revoked.set(jti, expiresAt);

  const kv = resolveSecurityKv(env);
  if (kv) {
    const ttl = Math.max(60, expiresAt - nowSeconds);
    const existing = await readSessionIndex(kv, nowSeconds);
    const nextIndex = existing.filter((item) => item.jti !== jti);
    await Promise.all([
      kv.put(`revoked:${jti}`, '1', { expirationTtl: ttl }),
      kv.delete ? kv.delete(`session:${jti}`) : kv.put(`session:${jti}`, '', { expirationTtl: 60 }),
      kv.put(SESSIONS_INDEX_KEY, JSON.stringify(nextIndex), {
        expirationTtl: DEFAULT_TTL_SECONDS * 2,
      }),
    ]);
  }
}

export async function revokeAllSessions(
  exceptJti: string | null,
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<number> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  pruneLocalFallback(fallback, nowSeconds);
  let revokedCount = 0;

  for (const [jti, rec] of [...fallback.sessions.entries()]) {
    if (exceptJti && jti === exceptJti) continue;
    fallback.sessions.delete(jti);
    fallback.revoked.set(jti, rec.expiresAt);
    revokedCount += 1;
  }

  const kv = resolveSecurityKv(env);
  if (kv) {
    const existing = await readSessionIndex(kv, nowSeconds);
    const toRevoke = existing.filter((entry) => !exceptJti || entry.jti !== exceptJti);
    const remaining = exceptJti ? existing.filter((entry) => entry.jti === exceptJti) : [];

    await Promise.all([
      ...toRevoke.flatMap((entry) => {
        const ttl = Math.max(60, entry.expiresAt - nowSeconds);
        return [
          kv.put(`revoked:${entry.jti}`, '1', { expirationTtl: ttl }),
          kv.delete
            ? kv.delete(`session:${entry.jti}`)
            : kv.put(`session:${entry.jti}`, '', { expirationTtl: 60 }),
        ];
      }),
      kv.put(SESSIONS_INDEX_KEY, JSON.stringify(remaining), {
        expirationTtl: DEFAULT_TTL_SECONDS * 2,
      }),
    ]);
    revokedCount = Math.max(revokedCount, toRevoke.length);
  }

  return revokedCount;
}

export async function isSessionActive(
  jti: string,
  iat: number,
  iatMs: number | undefined,
  tokenInvalidBefore: number,
  tokenInvalidBeforeMs: number | undefined,
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<boolean> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  pruneLocalFallback(fallback, nowSeconds);

  if (tokenInvalidBeforeMs && tokenInvalidBeforeMs > 0) {
    const tokenIssuedMs = iatMs ?? iat * 1000;
    if (tokenIssuedMs <= tokenInvalidBeforeMs) {
      return false;
    }
  }

  if (tokenInvalidBefore > 0 && iat < tokenInvalidBefore) {
    return false;
  }

  const localRevoked = fallback.revoked.get(jti);
  if (localRevoked && localRevoked > nowSeconds) {
    return false;
  }

  const kv = resolveSecurityKv(env);
  if (kv) {
    const [revokedHit, activeRaw] = await Promise.all([
      kv.get(`revoked:${jti}`),
      kv.get(`session:${jti}`),
    ]);
    if (revokedHit !== null || !activeRaw) return false;
    if (activeRaw === '1') return true;
    try {
      const parsed = JSON.parse(activeRaw) as StoredSessionRecord;
      return parsed.jti === jti && parsed.expiresAt > nowSeconds;
    } catch {
      return false;
    }
  }

  return fallback.sessions.has(jti);
}

export async function listActiveSessionRecords(
  currentJti: string,
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<Array<StoredSessionRecord & { isCurrent: boolean }>> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  pruneLocalFallback(fallback, nowSeconds);
  const kv = resolveSecurityKv(env);

  if (!kv) {
    return [...fallback.sessions.values()]
      .sort((a, b) => b.issuedAt - a.issuedAt)
      .map((rec) => ({ ...rec, isCurrent: rec.jti === currentJti }));
  }

  const indexed = await readSessionIndex(kv, nowSeconds);
  const rawRecords = await Promise.all(
    indexed.map(async (entry) => {
      const [revokedHit, raw] = await Promise.all([
        kv.get(`revoked:${entry.jti}`),
        kv.get(`session:${entry.jti}`),
      ]);
      if (revokedHit !== null || !raw) return null;
      try {
        const parsed = JSON.parse(raw) as StoredSessionRecord;
        if (parsed.expiresAt <= nowSeconds) return null;
        return { ...parsed, isCurrent: parsed.jti === currentJti };
      } catch {
        return null;
      }
    })
  );

  return rawRecords
    .filter((rec): rec is StoredSessionRecord & { isCurrent: boolean } => Boolean(rec))
    .sort((a, b) => b.issuedAt - a.issuedAt);
}

export async function appendSecurityAuditEvent(
  input: {
    event: SecurityAuditEventType;
    actor: string;
    ip: string;
    summary: string;
  },
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<void> {
  const safeActor = input.actor.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 64) || 'unknown';
  const safeSummary = input.summary.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 180);
  const entry: SecurityAuditEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    event: input.event,
    actor: safeActor,
    ipMasked: maskClientIp(input.ip),
    summary: safeSummary,
  };

  const kv = resolveSecurityKv(env);
  if (kv) {
    const existing = await readSecurityAuditLog(env, fallback);
    const next = [entry, ...existing].slice(0, MAX_AUDIT_ENTRIES);
    await kv.put(AUDIT_LOG_KEY, JSON.stringify(next));
    return;
  }

  fallback.auditLog = [entry, ...fallback.auditLog].slice(0, MAX_AUDIT_ENTRIES);
}

export async function readSecurityAuditLog(
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<SecurityAuditEntry[]> {
  const kv = resolveSecurityKv(env);
  if (!kv) {
    return fallback.auditLog;
  }
  const raw = await kv.get(AUDIT_LOG_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as SecurityAuditEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function readPrivateSheetsConfig(
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<PrivateSheetsConfig> {
  const kv = resolveSecurityKv(env);
  if (!kv) {
    return fallback.privateSheets;
  }
  const raw = await kv.get(PRIVATE_SHEETS_KEY);
  if (!raw) {
    return {
      schemaVersion: 1,
      updatedAt: '',
      sheetsByTournamentId: {},
    };
  }
  try {
    const parsed = JSON.parse(raw) as PrivateSheetsConfig;
    if (parsed && typeof parsed.sheetsByTournamentId === 'object' && parsed.sheetsByTournamentId) {
      return parsed;
    }
  } catch {
    // Fallback to empty config
  }
  return {
    schemaVersion: 1,
    updatedAt: '',
    sheetsByTournamentId: {},
  };
}

export async function writePrivateSheetsConfig(
  config: PrivateSheetsConfig,
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<void> {
  const kv = resolveSecurityKv(env);
  if (kv) {
    await kv.put(PRIVATE_SHEETS_KEY, JSON.stringify(config));
    return;
  }
  fallback.privateSheets = config;
}

/**
 * Strips hidden drafts, archived items, and unpublished entries before public delivery.
 */
export function sanitizeBundleForPublic(bundle: AdminContentBundle): AdminContentBundle {
  return {
    tournaments: {
      ...bundle.tournaments,
      tournaments: bundle.tournaments.tournaments.filter(
        (t) => t.status !== 'draft' && t.status !== 'archived' && t.published !== false
      ),
    },
    results: {
      ...bundle.results,
      entries: bundle.results.entries.filter((r) => r.published !== false),
    },
    news: {
      ...bundle.news,
      entries: bundle.news.entries.filter((n) => !n.archived && n.published !== false),
    },
    ...(bundle.siteConfig ? { siteConfig: bundle.siteConfig } : {}),
  };
}

export async function readSandboxContent(
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<AdminContentBundle> {
  const kv = resolveSecurityKv(env);
  if (kv) {
    const raw = await kv.get(SANDBOX_CONTENT_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as AdminContentBundle;
        if (parsed && parsed.tournaments && parsed.results && parsed.news) {
          fallback.sandboxContent = parsed;
          return parsed;
        }
      } catch {
        // Fall through to default sandbox scaffold
      }
    }
  }
  if (!fallback.sandboxContent) {
    fallback.sandboxContent = createDefaultSandboxContent();
  }
  return fallback.sandboxContent;
}

export async function writeSandboxContent(
  bundle: AdminContentBundle,
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<void> {
  fallback.sandboxContent = bundle;
  const kv = resolveSecurityKv(env);
  if (kv) {
    await kv.put(SANDBOX_CONTENT_KEY, JSON.stringify(bundle));
  }
}

export async function readLivePublicContent(
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<LivePublicContentRecord | null> {
  const kv = resolveSecurityKv(env);
  let record: LivePublicContentRecord | null = null;
  if (kv) {
    const raw = await kv.get(PUBLIC_CONTENT_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as LivePublicContentRecord;
        if (
          parsed &&
          parsed.bundle &&
          parsed.bundle.tournaments &&
          parsed.bundle.results &&
          parsed.bundle.news
        ) {
          record = parsed;
        }
      } catch {
        record = null;
      }
    }
  } else if (fallback.livePublicContent) {
    record = fallback.livePublicContent;
  }

  if (!record) return null;
  return {
    ...record,
    bundle: sanitizeBundleForPublic(record.bundle),
  };
}

export async function writeLivePublicContent(
  record: LivePublicContentRecord,
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<void> {
  const sanitized: LivePublicContentRecord = {
    ...record,
    bundle: sanitizeBundleForPublic(record.bundle),
  };
  fallback.livePublicContent = sanitized;
  const kv = resolveSecurityKv(env);
  if (kv) {
    await kv.put(PUBLIC_CONTENT_KEY, JSON.stringify(sanitized));
  }
}

export async function readLivePublicCms(
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<CachedPublicCmsRecord | null> {
  const kv = resolveSecurityKv(env);
  if (kv) {
    const raw = await kv.get(PUBLIC_CMS_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as CachedPublicCmsRecord;
      if (parsed && parsed.snapshot && typeof parsed.version === 'number') {
        return parsed;
      }
    } catch {
      return null;
    }
    return null;
  }
  return fallback.livePublicCms ?? null;
}

export async function writeLivePublicCms(
  record: CachedPublicCmsRecord,
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<void> {
  fallback.livePublicCms = record;
  const kv = resolveSecurityKv(env);
  if (kv) {
    await kv.put(PUBLIC_CMS_KEY, JSON.stringify(record));
  }
}

export async function invalidateLivePublicCms(
  env: WorkerEnv,
  fallback: LocalSecurityFallback
): Promise<void> {
  fallback.livePublicCms = null;
  const kv = resolveSecurityKv(env);
  if (kv && typeof kv.delete === 'function') {
    await kv.delete(PUBLIC_CMS_KEY);
  } else if (kv) {
    await kv.put(PUBLIC_CMS_KEY, '', { expirationTtl: 1 });
  }
}
