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
  R2Bucket,
  R2ObjectBody,
  SecurityKvBinding,
  WorkerEnv,
} from '../src/types.ts';

const TRUSTED_ORIGIN = 'https://nexusxesports.github.io';

function createMemoryKv(): SecurityKvBinding & { dump: () => Map<string, string> } {
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
    dump() {
      return store;
    },
  };
}

function createMemoryR2(): R2Bucket & { keys: () => string[] } {
  const objects = new Map<string, { data: Uint8Array; contentType?: string; cacheControl?: string; etag: string }>();
  return {
    async get(key: string): Promise<R2ObjectBody | null> {
      const entry = objects.get(key);
      if (!entry) return null;
      return {
        key,
        size: entry.data.byteLength,
        etag: entry.etag,
        httpMetadata: {
          contentType: entry.contentType,
          cacheControl: entry.cacheControl,
        },
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(entry.data);
            controller.close();
          },
        }),
        async arrayBuffer() {
          return entry.data.buffer.slice(entry.data.byteOffset, entry.data.byteOffset + entry.data.byteLength) as ArrayBuffer;
        },
      };
    },
    async put(key, value, options) {
      let bytes: Uint8Array;
      if (value instanceof Uint8Array) {
        bytes = value;
      } else if (value instanceof ArrayBuffer) {
        bytes = new Uint8Array(value);
      } else if (typeof value === 'string') {
        bytes = new TextEncoder().encode(value);
      } else {
        bytes = new Uint8Array(await value.arrayBuffer());
      }
      const etag = `etag-${crypto.createHash('md5').update(bytes).digest('hex').slice(0, 10)}`;
      objects.set(key, {
        data: bytes,
        contentType: options?.httpMetadata?.contentType,
        cacheControl: options?.httpMetadata?.cacheControl,
        etag,
      });
      return { key, size: bytes.byteLength, etag };
    },
    async delete(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) objects.delete(k);
    },
    keys() {
      return Array.from(objects.keys());
    },
  };
}

function createSqliteD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');

  const wrapStatement = (sql: string, boundValues: unknown[] = []): D1PreparedStatement => ({
    bind(...values: unknown[]) {
      return wrapStatement(sql, values.map((v) => (v === undefined ? null : v)));
    },
    async first<T = Record<string, unknown>>() {
      const stmt = sqlite.prepare(sql);
      return (stmt.get(...(boundValues as SQLInputValue[])) as T | undefined) ?? null;
    },
    async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      const stmt = sqlite.prepare(sql);
      return { results: stmt.all(...(boundValues as SQLInputValue[])) as T[], success: true, meta: { changes: 0 } };
    },
    async run(): Promise<D1Result> {
      const stmt = sqlite.prepare(sql);
      const info = stmt.run(...(boundValues as SQLInputValue[]));
      return {
        results: [],
        success: true,
        meta: { changes: Number(info.changes ?? 0), last_row_id: Number(info.lastInsertRowid ?? 0) },
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
        const res: D1Result<T>[] = [];
        for (const s of statements) res.push((await s.run()) as D1Result<T>);
        sqlite.exec('COMMIT');
        return res;
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

async function createCmsEnv() {
  const db = createSqliteD1();
  const kv = createMemoryKv();
  const r2 = createMemoryR2();
  const passwordHash = await hashPasswordPBKDF2('NexusX!TestAdmin#2026');
  const env: WorkerEnv = {
    ENVIRONMENT: 'production',
    ADMIN_USERNAME: 'nexusx-owner',
    ADMIN_PASSWORD_HASH: passwordHash,
    SESSION_SECRET: '0123456789abcdef0123456789abcdef_strong_secret_key',
    GITHUB_APP_ID: '12345',
    GITHUB_APP_INSTALLATION_ID: '67890',
    GITHUB_APP_PRIVATE_KEY: 'unused-in-cms-tests',
    GITHUB_OWNER: 'HackerTechPro-Group',
    GITHUB_REPO: 'NexusXEsportsIndia',
    GITHUB_BRANCH: 'main',
    ALLOWED_ORIGINS: TRUSTED_ORIGIN,
    SECURITY_KV: kv,
    DB: db,
    MEDIA_BUCKET: r2,
  };
  return { env, db, kv, r2, worker: createWorkerHandler() };
}

async function loginAs(
  worker: ReturnType<typeof createWorkerHandler>,
  env: WorkerEnv,
  username: string,
  password: string
) {
  const res = await worker.fetch(
    new Request('https://worker.example/api/auth/login', {
      method: 'POST',
      headers: {
        Origin: TRUSTED_ORIGIN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username, password }),
    }),
    env
  );
  const body = (await res.json()) as { csrfToken?: string };
  const setCookie = res.headers.get('Set-Cookie') ?? '';
  const cookie = setCookie.split(';')[0] ?? '';
  return { status: res.status, cookie, csrf: body.csrfToken ?? '' };
}

function makeFakePngBytes(size = 128): Uint8Array {
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic signature
  return bytes;
}

describe('Website CMS, R2 Media Storage, Rollback, Concurrency & RBAC', () => {
  it('enforces draft/preview isolation, publishes live SEO/Nav/Social/Footer/Hero, refreshes KV cache, and supports rollback', async () => {
    const { env, kv, worker } = await createCmsEnv();
    const owner = await loginAs(worker, env, 'nexusx-owner', 'NexusX!TestAdmin#2026');
    expect(owner.status).toBe(200);

    // 1. Read workspace + default published state
    const wsRes = await worker.fetch(
      new Request('https://worker.example/api/admin/cms/workspace', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: owner.cookie },
      }),
      env
    );
    expect(wsRes.status).toBe(200);
    const ws = (await wsRes.json()) as {
      draft: Record<string, unknown>;
      publication: { draftVersion: number; publishedVersion: number };
    };
    expect(ws.publication.publishedVersion).toBe(1);

    // 2. Edit Hero, Nav, Social, Footer, About/Contact & SEO in DRAFT ONLY
    const modifiedDraft = structuredClone(ws.draft) as {
      hero: { slides: Array<Record<string, unknown>> };
      navigation: Array<Record<string, unknown>>;
      socialLinks: Array<Record<string, unknown>>;
      footer: Record<string, unknown>;
      aboutContact: Record<string, unknown>;
      seo: Record<string, unknown>;
    };
    modifiedDraft.hero.slides[0].heading = 'BGMI MONSOON INVITATIONAL';
    modifiedDraft.footer.copyrightText = '© 2026 NexusX Custom CMS Verified.';
    modifiedDraft.aboutContact.aboutVisible = true;
    modifiedDraft.aboutContact.contactVisible = true;
    modifiedDraft.seo.siteTitle = 'NexusX Custom SEO Title';
    modifiedDraft.navigation.push({
      id: 'nav-about',
      label: 'About Us',
      href: '#about',
      itemType: 'anchor',
      visible: true,
      showMobile: true,
      openInNewTab: false,
      displayOrder: 3,
    });
    modifiedDraft.socialLinks.push({
      id: 'social-discord',
      platform: 'discord',
      label: 'Official Discord',
      subtitle: 'Room voice lobby',
      url: 'https://discord.gg/nexusx-bgmi',
      iconName: 'discord',
      visible: true,
      displayOrder: 5,
    });

    const saveDraftRes = await worker.fetch(
      new Request('https://worker.example/api/admin/cms/draft', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: owner.cookie,
          'X-CSRF-Token': owner.csrf,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snapshot: modifiedDraft,
          expectedDraftVersion: ws.publication.draftVersion,
        }),
      }),
      env
    );
    expect(saveDraftRes.status).toBe(200);

    // 3. Stale expectedDraftVersion must fail cleanly with HTTP 409 Conflict
    const conflictRes = await worker.fetch(
      new Request('https://worker.example/api/admin/cms/draft', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: owner.cookie,
          'X-CSRF-Token': owner.csrf,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          snapshot: modifiedDraft,
          expectedDraftVersion: ws.publication.draftVersion, // now stale!
        }),
      }),
      env
    );
    expect(conflictRes.status).toBe(409);

    // 4. Draft Preview returns new headline while Public API MUST still show v1 baseline
    const previewRes = await worker.fetch(
      new Request('https://worker.example/api/admin/cms/preview', {
        headers: { Origin: TRUSTED_ORIGIN, Cookie: owner.cookie },
      }),
      env
    );
    const previewJson = (await previewRes.json()) as { draft: typeof modifiedDraft };
    expect(previewJson.draft.hero.slides[0].heading).toBe('BGMI MONSOON INVITATIONAL');

    const publicBeforeRes = await worker.fetch(
      new Request('https://worker.example/api/public/cms'),
      env
    );
    const publicBefore = (await publicBeforeRes.json()) as {
      version: number;
      cms: typeof modifiedDraft;
    };
    expect(publicBefore.version).toBe(1);
    expect(publicBefore.cms.hero.slides[0].heading).toBe('COMPETE. CONNECT. CONQUER.');
    expect(publicBefore.cms.aboutContact.aboutVisible).toBe(false);

    // 5. Publish Draft -> Live Website reflects changes & KV cache is refreshed immediately
    const pubRes = await worker.fetch(
      new Request('https://worker.example/api/admin/cms/publish', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: owner.cookie,
          'X-CSRF-Token': owner.csrf,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ summary: 'Launch Monsoon Invitational homepage copy' }),
      }),
      env
    );
    expect(pubRes.status).toBe(200);
    const pubData = (await pubRes.json()) as { version: number };
    expect(pubData.version).toBe(2);

    const kvCachedRaw = await kv.get('public:live_cms_v1');
    expect(kvCachedRaw).toContain('BGMI MONSOON INVITATIONAL');

    const publicAfterRes = await worker.fetch(
      new Request('https://worker.example/api/public/cms'),
      env
    );
    const publicAfter = (await publicAfterRes.json()) as {
      version: number;
      cms: typeof modifiedDraft;
    };
    expect(publicAfter.version).toBe(2);
    expect(publicAfter.cms.hero.slides[0].heading).toBe('BGMI MONSOON INVITATIONAL');
    expect(publicAfter.cms.footer.copyrightText).toBe('© 2026 NexusX Custom CMS Verified.');
    expect(publicAfter.cms.navigation.some((n) => n.label === 'About Us')).toBe(true);
    expect(publicAfter.cms.socialLinks.some((s) => s.label === 'Official Discord')).toBe(true);
    expect(publicAfter.cms.seo.siteTitle).toBe('NexusX Custom SEO Title');

    // 6. Rollback to v1 -> restores baseline & invalidates/updates KV cache immediately
    const rbRes = await worker.fetch(
      new Request('https://worker.example/api/admin/cms/rollback', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: owner.cookie,
          'X-CSRF-Token': owner.csrf,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ revisionId: 'rev-init-1' }),
      }),
      env
    );
    expect(rbRes.status).toBe(200);

    const publicAfterRb = (await (
      await worker.fetch(new Request('https://worker.example/api/public/cms'), env)
    ).json()) as { version: number; cms: typeof modifiedDraft };
    expect(publicAfterRb.version).toBe(3);
    expect(publicAfterRb.cms.hero.slides[0].heading).toBe('COMPETE. CONNECT. CONQUER.');
    expect(publicAfterRb.cms.aboutContact.aboutVisible).toBe(false);
  });

  it('handles Cloudflare R2 image upload, mime/magic validation, replace, reference-protected deletion & public streaming', async () => {
    const { env, r2, worker } = await createCmsEnv();
    const owner = await loginAs(worker, env, 'nexusx-owner', 'NexusX!TestAdmin#2026');

    // Reject spoofed HTML disguised as PNG
    const badForm = new FormData();
    badForm.append('file', new File(['<html><script>alert(1)</script></html>'], 'evil.png', { type: 'image/png' }));
    const badRes = await worker.fetch(
      new Request('https://worker.example/api/admin/media/upload', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
        body: badForm,
      }),
      env
    );
    expect(badRes.status).toBe(400);

    // Upload valid PNG image into R2
    const goodForm = new FormData();
    goodForm.append('file', new File([new Uint8Array(makeFakePngBytes(256))], 'hero-season5.png', { type: 'image/png' }));
    goodForm.append('folder', 'hero');
    const upRes = await worker.fetch(
      new Request('https://worker.example/api/admin/media/upload', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
        body: goodForm,
      }),
      env
    );
    expect(upRes.status).toBe(201);
    const upJson = (await upRes.json()) as { asset: { id: string; r2Key: string; publicUrl: string } };
    expect(upJson.asset.publicUrl.startsWith('/api/media/cms/hero/')).toBe(true);
    expect(r2.keys()).toContain(upJson.asset.r2Key);

    // Public asset stream works cleanly with nosniff header
    const serveRes = await worker.fetch(
      new Request(`https://worker.example${upJson.asset.publicUrl}`),
      env
    );
    expect(serveRes.status).toBe(200);
    expect(serveRes.headers.get('Content-Type')).toBe('image/png');
    expect(serveRes.headers.get('X-Content-Type-Options')).toBe('nosniff');

    // Link R2 image to Hero slide draft -> Delete MUST be blocked with 409 Conflict!
    const ws = (await (
      await worker.fetch(
        new Request('https://worker.example/api/admin/cms/workspace', {
          headers: { Origin: TRUSTED_ORIGIN, Cookie: owner.cookie },
        }),
        env
      )
    ).json()) as { draft: { hero: { slides: Array<Record<string, unknown>> } }; publication: { draftVersion: number } };
    ws.draft.hero.slides[0].desktopImage = upJson.asset.publicUrl;
    await worker.fetch(
      new Request('https://worker.example/api/admin/cms/draft', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: owner.cookie,
          'X-CSRF-Token': owner.csrf,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ snapshot: ws.draft, expectedDraftVersion: ws.publication.draftVersion }),
      }),
      env
    );

    const blockedDelete = await worker.fetch(
      new Request(`https://worker.example/api/admin/media/${upJson.asset.id}`, {
        method: 'DELETE',
        headers: { Origin: TRUSTED_ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
      }),
      env
    );
    expect(blockedDelete.status).toBe(409);

    // Replace image in R2 cleanly swaps key
    const replaceForm = new FormData();
    replaceForm.append('file', new File([new Uint8Array(makeFakePngBytes(300))], 'hero-v2.png', { type: 'image/png' }));
    const repRes = await worker.fetch(
      new Request(`https://worker.example/api/admin/media/${upJson.asset.id}/replace`, {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
        body: replaceForm,
      }),
      env
    );
    expect(repRes.status).toBe(200);
    const repJson = (await repRes.json()) as { asset: { id: string; r2Key: string; publicUrl: string } };
    expect(repJson.asset.r2Key).not.toBe(upJson.asset.r2Key);
    expect(r2.keys()).not.toContain(upJson.asset.r2Key);
    expect(r2.keys()).toContain(repJson.asset.r2Key);

    // Since new URL is not referenced yet, delete succeeds (200)
    const okDelete = await worker.fetch(
      new Request(`https://worker.example/api/admin/media/${upJson.asset.id}`, {
        method: 'DELETE',
        headers: { Origin: TRUSTED_ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
      }),
      env
    );
    expect(okDelete.status).toBe(200);
    expect(r2.keys()).not.toContain(repJson.asset.r2Key);
  });

  it('supports free no-card Cloudflare KV media upload, streaming, replacement, and deletion when MEDIA_BUCKET is omitted', async () => {
    const { env: baseEnv, worker } = await createCmsEnv();
    const freeEnv: WorkerEnv = { ...baseEnv, MEDIA_BUCKET: undefined };
    const owner = await loginAs(worker, freeEnv, 'nexusx-owner', 'NexusX!TestAdmin#2026');

    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    const form = new FormData();
    form.append('file', new File([pngBytes], 'free-banner.png', { type: 'image/png' }));
    form.append('folder', 'hero');

    const upRes = await worker.fetch(
      new Request('https://worker.example/api/admin/media/upload', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
        body: form,
      }),
      freeEnv
    );
    expect(upRes.status).toBe(201);
    const upJson = (await upRes.json()) as { asset: { id: string; r2Key: string; publicUrl: string } };
    expect(upJson.asset.publicUrl.startsWith('/api/media/')).toBe(true);

    const streamRes = await worker.fetch(
      new Request(`https://worker.example${upJson.asset.publicUrl}`),
      freeEnv
    );
    expect(streamRes.status).toBe(200);
    expect(streamRes.headers.get('Content-Type')).toBe('image/png');
    expect(streamRes.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await streamRes.arrayBuffer())).toEqual(pngBytes);

    const delRes = await worker.fetch(
      new Request(`https://worker.example/api/admin/media/${upJson.asset.id}`, {
        method: 'DELETE',
        headers: { Origin: TRUSTED_ORIGIN, Cookie: owner.cookie, 'X-CSRF-Token': owner.csrf },
      }),
      freeEnv
    );
    expect(delRes.status).toBe(200);

    const afterDel = await worker.fetch(
      new Request(`https://worker.example${upJson.asset.publicUrl}`),
      freeEnv
    );
    expect(afterDel.status).toBe(404);
  });

  it('binds featured tournaments to real D1 tournament records and enforces owner-only publish RBAC', async () => {
    const { env, worker } = await createCmsEnv();
    const owner = await loginAs(worker, env, 'nexusx-owner', 'NexusX!TestAdmin#2026');

    // Create 2 real tournaments in D1
    for (const [id, title] of [
      ['NX-TEST-01', 'Alpha BGMI Open'],
      ['NX-TEST-02', 'Beta Squad Cup'],
    ]) {
      const tRes = await worker.fetch(
        new Request('https://worker.example/api/admin/d1/tournaments', {
          method: 'POST',
          headers: {
            Origin: TRUSTED_ORIGIN,
            Cookie: owner.cookie,
            'X-CSRF-Token': owner.csrf,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            id,
            slug: id.toLowerCase(),
            title,
            description: 'Official verified BGMI room.',
            format: 'Squad',
            mode: 'TPP',
            map: 'Erangel',
            prizePool: '₹20,000',
            maxSlots: 25,
            regStatus: 'open',
            regCloseDate: '2026-12-01',
            matchDate: '2026-12-05',
            status: 'registration_open',
            published: true,
            featured: true,
          }),
        }),
        env
      );
      expect(tRes.status).toBe(200);
    }

    // Create a tournament_manager staff user
    const createStaffRes = await worker.fetch(
      new Request('https://worker.example/api/admin/d1/users', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: owner.cookie,
          'X-CSRF-Token': owner.csrf,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: 'manager_one',
          email: 'manager1@nexusxesports.in',
          password: 'Manager#Password2026!',
          roleId: 'tournament_manager',
        }),
      }),
      env
    );
    expect(createStaffRes.status).toBe(201);

    const manager = await loginAs(worker, env, 'manager_one', 'Manager#Password2026!');
    expect(manager.status).toBe(200);

    // Anonymous publish blocked
    const anonPub = await worker.fetch(
      new Request('https://worker.example/api/admin/cms/publish', {
        method: 'POST',
        headers: { Origin: TRUSTED_ORIGIN, 'Content-Type': 'application/json' },
        body: '{}',
      }),
      env
    );
    expect(anonPub.status).toBe(401);

    // Manager CAN edit draft featured order...
    const ws = (await (
      await worker.fetch(
        new Request('https://worker.example/api/admin/cms/workspace', {
          headers: { Origin: TRUSTED_ORIGIN, Cookie: manager.cookie },
        }),
        env
      )
    ).json()) as { draft: { featured: { tournamentIds: string[] } }; publication: { draftVersion: number } };
    ws.draft.featured.tournamentIds = ['NX-TEST-02', 'NX-TEST-01'];

    const mgrDraftSave = await worker.fetch(
      new Request('https://worker.example/api/admin/cms/draft', {
        method: 'PUT',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: manager.cookie,
          'X-CSRF-Token': manager.csrf,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ snapshot: ws.draft, expectedDraftVersion: ws.publication.draftVersion }),
      }),
      env
    );
    expect(mgrDraftSave.status).toBe(200);

    // ...but Manager CANNOT publish live (Owner-only `cms:publish`)
    const mgrPub = await worker.fetch(
      new Request('https://worker.example/api/admin/cms/publish', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: manager.cookie,
          'X-CSRF-Token': manager.csrf,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      env
    );
    expect(mgrPub.status).toBe(403);

    // Owner publishes -> Public CMS returns featuredTournaments resolved from real D1 records in exact CMS order
    const ownerPub = await worker.fetch(
      new Request('https://worker.example/api/admin/cms/publish', {
        method: 'POST',
        headers: {
          Origin: TRUSTED_ORIGIN,
          Cookie: owner.cookie,
          'X-CSRF-Token': owner.csrf,
          'Content-Type': 'application/json',
        },
        body: '{}',
      }),
      env
    );
    expect(ownerPub.status).toBe(200);

    const publicCms = (await (
      await worker.fetch(new Request('https://worker.example/api/public/cms'), env)
    ).json()) as { featuredTournaments: Array<{ id: string; title: string }> };
    expect(publicCms.featuredTournaments.map((t) => t.id)).toEqual(['NX-TEST-02', 'NX-TEST-01']);

    // Verify migration SQL files execute cleanly together
    const m1 = fs.readFileSync(path.join(process.cwd(), 'worker', 'migrations', '0001_initial.sql'), 'utf8');
    const m2 = fs.readFileSync(path.join(process.cwd(), 'worker', 'migrations', '0002_cms_and_r2.sql'), 'utf8');
    const freshDb = createSqliteD1();
    await freshDb.exec(m1);
    await freshDb.exec(m2);
    const tables = await freshDb
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
      .all<{ name: string }>();
    const names = tables.results.map((r) => r.name);
    expect(names).toContain('site_sections');
    expect(names).toContain('navigation_items');
    expect(names).toContain('media_assets');
    expect(names).toContain('content_revisions');
  });
});
