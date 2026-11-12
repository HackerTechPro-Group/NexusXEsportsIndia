import type { SecurityKvBinding } from './types.ts';

export interface LoginRateLimitOptions {
  maxFailuresPerIpUser?: number;
  maxFailuresPerIp?: number;
  windowSeconds?: number;
  maxTrackedEntries?: number;
  cooldownScheduleSeconds?: number[];
}

interface FailureRecord {
  count: number;
  windowResetAt: number;
  blockedUntil: number;
}

const DEFAULT_COOLDOWN_SCHEDULE = [60, 300, 900, 1800];

/**
 * Reads the authoritative Cloudflare edge client IP header (never client-spoofable X-Forwarded-For).
 */
export function extractClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP')?.trim();
  if (cfIp && cfIp.length <= 64 && /^[0-9a-fA-F:.]+$/.test(cfIp)) {
    return cfIp;
  }
  return 'local';
}

async function sha256ShortHex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 16; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Creates a distributed KV-backed + local-bounded failed-login throttler with
 * progressive IP and account lockouts across Worker isolates.
 */
export function createLoginRateLimiter(options: LoginRateLimitOptions = {}) {
  const maxFailuresPerAccount = options.maxFailuresPerIpUser ?? 5;
  const maxFailuresPerIp = options.maxFailuresPerIp ?? 15;
  const windowSeconds = options.windowSeconds ?? 15 * 60;
  const maxTrackedEntries = options.maxTrackedEntries ?? 2000;
  const cooldownSchedule = options.cooldownScheduleSeconds ?? DEFAULT_COOLDOWN_SCHEDULE;

  const localBuckets = new Map<string, FailureRecord>();

  function pruneExpired(nowSeconds: number): void {
    for (const [key, record] of localBuckets.entries()) {
      const expiresAt = Math.max(record.windowResetAt, record.blockedUntil);
      if (expiresAt <= nowSeconds) {
        localBuckets.delete(key);
      }
    }
    if (localBuckets.size > maxTrackedEntries) {
      const overflow = localBuckets.size - maxTrackedEntries;
      let removed = 0;
      for (const key of localBuckets.keys()) {
        localBuckets.delete(key);
        removed += 1;
        if (removed >= overflow) break;
      }
    }
  }

  async function readRecord(key: string, kv?: SecurityKvBinding): Promise<FailureRecord | null> {
    if (kv) {
      const raw = await kv.get(key);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as Partial<FailureRecord>;
        if (
          typeof parsed.count === 'number' &&
          typeof parsed.windowResetAt === 'number' &&
          typeof parsed.blockedUntil === 'number'
        ) {
          return parsed as FailureRecord;
        }
      } catch {
        return null;
      }
      return null;
    }
    return localBuckets.get(key) ?? null;
  }

  async function writeRecord(
    key: string,
    record: FailureRecord,
    nowSeconds: number,
    kv?: SecurityKvBinding
  ): Promise<void> {
    localBuckets.set(key, record);
    if (kv) {
      const maxExpiry = Math.max(record.windowResetAt, record.blockedUntil);
      const ttl = Math.max(60, maxExpiry - nowSeconds);
      await kv.put(key, JSON.stringify(record), { expirationTtl: ttl });
    }
  }

  async function incrementKey(
    key: string,
    threshold: number,
    nowSeconds: number,
    kv?: SecurityKvBinding
  ): Promise<void> {
    const existing = await readRecord(key, kv);
    const active = existing && Math.max(existing.windowResetAt, existing.blockedUntil) > nowSeconds;
    const nextCount = active && existing.windowResetAt > nowSeconds ? existing.count + 1 : 1;
    const windowResetAt =
      active && existing.windowResetAt > nowSeconds
        ? existing.windowResetAt
        : nowSeconds + windowSeconds;
    let blockedUntil = active ? existing.blockedUntil : 0;

    if (nextCount >= threshold) {
      const tier = Math.min(
        cooldownSchedule.length - 1,
        Math.floor((nextCount - threshold) / 2)
      );
      const cooldown = cooldownSchedule[tier] ?? windowSeconds;
      blockedUntil = Math.max(blockedUntil, nowSeconds + cooldown);
    }

    await writeRecord(key, { count: nextCount, windowResetAt, blockedUntil }, nowSeconds, kv);
  }

  function remainingBlockSeconds(record: FailureRecord | null, nowSeconds: number): number {
    if (!record || record.blockedUntil <= nowSeconds) return 0;
    return Math.max(1, record.blockedUntil - nowSeconds);
  }

  return {
    async check(
      ip: string,
      username?: string,
      kv?: SecurityKvBinding,
      nowSeconds = Math.floor(Date.now() / 1000)
    ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
      pruneExpired(nowSeconds);

      const ipHash = await sha256ShortHex(`ip:${ip}`);
      const ipRec = await readRecord(`rl:ip:${ipHash}`, kv);
      const ipBlock = remainingBlockSeconds(ipRec, nowSeconds);
      if (ipBlock > 0) {
        return { allowed: false, retryAfterSeconds: ipBlock };
      }

      if (username !== undefined && username.trim()) {
        const acctHash = await sha256ShortHex(`acct:${username.trim().toLowerCase()}`);
        const acctRec = await readRecord(`rl:acct:${acctHash}`, kv);
        const acctBlock = remainingBlockSeconds(acctRec, nowSeconds);
        if (acctBlock > 0) {
          return { allowed: false, retryAfterSeconds: acctBlock };
        }
      }

      return { allowed: true, retryAfterSeconds: 0 };
    },

    async recordFailure(
      ip: string,
      username?: string,
      kv?: SecurityKvBinding,
      nowSeconds = Math.floor(Date.now() / 1000)
    ): Promise<void> {
      pruneExpired(nowSeconds);
      const ipHash = await sha256ShortHex(`ip:${ip}`);
      await incrementKey(`rl:ip:${ipHash}`, maxFailuresPerIp, nowSeconds, kv);

      if (username !== undefined && username.trim()) {
        const acctHash = await sha256ShortHex(`acct:${username.trim().toLowerCase()}`);
        await incrementKey(`rl:acct:${acctHash}`, maxFailuresPerAccount, nowSeconds, kv);
      }
    },

    async resetUser(
      _ip: string,
      username: string,
      kv?: SecurityKvBinding
    ): Promise<void> {
      if (!username.trim()) return;
      const acctHash = await sha256ShortHex(`acct:${username.trim().toLowerCase()}`);
      const key = `rl:acct:${acctHash}`;
      localBuckets.delete(key);
      if (kv) {
        if (kv.delete) {
          await kv.delete(key);
        } else {
          await kv.put(key, JSON.stringify({ count: 0, windowResetAt: 0, blockedUntil: 0 }), {
            expirationTtl: 60,
          });
        }
      }
    },
  };
}
