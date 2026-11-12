import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import { AppRoutes } from '../App';
import { SiteDataProvider } from '../context/SiteDataContext';
import { setTestAdminRoutePath } from '../utils/adminRoute';
import { clearInMemoryAuthState } from '../admin/api/adminClient';
import type { NewsData, ResultsData, SiteConfigData, TournamentsData } from '../types/data';

const TEST_PRIVATE_ADMIN_PATH = '/nx-test-private-gate';

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'public/data', name), 'utf-8')) as T;
}

describe('Web Admin Dashboard (Cookie+CSRF Auth + 4 Allowed Modules + GitHub Publishing)', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    clearInMemoryAuthState();
    setTestAdminRoutePath(TEST_PRIVATE_ADMIN_PATH);
  });

  afterEach(() => {
    setTestAdminRoutePath(null);
  });

  function setupMockWorker() {
    let remoteState = {
      tournaments: readJson<TournamentsData>('tournaments.json'),
      results: readJson<ResultsData>('results.json'),
      news: readJson<NewsData>('news.json'),
    };
    let privateSheetsState: Record<string, { sheetUrl: string; notes?: string; updatedAt: string }> =
      {};
    let currentOwnerId = 'admin-owner';
    let currentOwnerPassword = 'StrongPass!2026';
    const committedPayloads: unknown[] = [];
    const seenRequestHeaders: { url: string; method: string; auth: string | null; csrf: string | null }[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method || 'GET').toUpperCase();
        const headers = new Headers(init?.headers);
        seenRequestHeaders.push({
          url,
          method,
          auth: headers.get('Authorization'),
          csrf: headers.get('X-CSRF-Token'),
        });

        // Public JSON fetches fallback if triggered
        if (url.includes('/data/')) {
          const filename = url.split('/data/')[1].split('?')[0];
          return new Response(
            fs.readFileSync(path.resolve(process.cwd(), 'public/data', filename), 'utf-8'),
            { status: 200 }
          );
        }

        if (url.endsWith('/api/auth/setup/status') && method === 'GET') {
          return new Response(
            JSON.stringify({
              setupRequired: false,
              configuredSource: 'kv',
              cloudflareAccessSetupConfigured: false,
            }),
            { status: 200 }
          );
        }

        if (url.endsWith('/api/auth/login') && method === 'POST') {
          const body = JSON.parse(String(init?.body || '{}')) as {
            username?: string;
            password?: string;
          };
          if (body.username !== currentOwnerId || body.password !== currentOwnerPassword) {
            return new Response(JSON.stringify({ error: 'Invalid admin username or password.' }), {
              status: 401,
            });
          }
          return new Response(
            JSON.stringify({
              authenticated: true,
              username: currentOwnerId,
              csrfToken: 'mock.csrf.token.123',
              authMode: 'cookie-csrf',
            }),
            { status: 200 }
          );
        }

        if (url.endsWith('/api/admin/private-config') && method === 'GET') {
          return new Response(
            JSON.stringify({
              schemaVersion: 1,
              updatedAt: '2026-11-11T17:00:00Z',
              sheetsByTournamentId: privateSheetsState,
            }),
            { status: 200 }
          );
        }

        if (url.endsWith('/api/admin/private-config') && method === 'PUT') {
          if (headers.get('X-CSRF-Token') !== 'mock.csrf.token.123') {
            return new Response(JSON.stringify({ error: 'Invalid or missing CSRF token.' }), {
              status: 403,
            });
          }
          const body = JSON.parse(String(init?.body || '{}')) as {
            sheetsByTournamentId?: Record<
              string,
              { sheetUrl: string; notes?: string; updatedAt: string }
            >;
          };
          privateSheetsState = body.sheetsByTournamentId ?? {};
          return new Response(
            JSON.stringify({
              ok: true,
              schemaVersion: 1,
              updatedAt: '2026-11-11T17:05:00Z',
              sheetsByTournamentId: privateSheetsState,
            }),
            { status: 200 }
          );
        }

        if (url.endsWith('/api/admin/tournaments/generate-id') && method === 'POST') {
          if (headers.get('X-CSRF-Token') !== 'mock.csrf.token.123') {
            return new Response(JSON.stringify({ error: 'Invalid or missing CSRF token.' }), {
              status: 403,
            });
          }
          const body = JSON.parse(String(init?.body || '{}')) as {
            format?: 'Solo' | 'Duo' | 'Squad';
            existingIds?: string[];
          };
          const prefix =
            body.format === 'Solo'
              ? 'NX-SOLO-'
              : body.format === 'Duo'
                ? 'NX-DUO-'
                : 'NX-SQUAD-';
          let seq = 1;
          const taken = new Set(body.existingIds ?? []);
          while (taken.has(`${prefix}${String(seq).padStart(3, '0')}`)) {
            seq += 1;
          }
          const id = `${prefix}${String(seq).padStart(3, '0')}`;
          return new Response(
            JSON.stringify({ id, slugSuggestion: `${(body.format ?? 'solo').toLowerCase()}-${seq}` }),
            { status: 200 }
          );
        }

        if (url.endsWith('/api/admin/security/sessions') && method === 'GET') {
          return new Response(
            JSON.stringify({
              sessions: [
                {
                  jti: 'sess-current-1',
                  username: currentOwnerId,
                  issuedAt: 1794400000,
                  expiresAt: 1794414400,
                  userAgentSummary: 'Chromium / Windows',
                  ipMasked: '203.0.113.***',
                  isCurrent: true,
                },
                {
                  jti: 'sess-other-2',
                  username: currentOwnerId,
                  issuedAt: 1794390000,
                  expiresAt: 1794404400,
                  userAgentSummary: 'Mobile Safari',
                  ipMasked: '198.51.100.***',
                  isCurrent: false,
                },
              ],
            }),
            { status: 200 }
          );
        }

        if (url.includes('/api/admin/security/sessions/') && method === 'DELETE') {
          return new Response(JSON.stringify({ ok: true, currentRevoked: false }), { status: 200 });
        }

        if (url.endsWith('/api/admin/security/sessions/revoke-all') && method === 'POST') {
          return new Response(JSON.stringify({ ok: true, revokedCount: 1, requiresReauth: false }), {
            status: 200,
          });
        }

        if (url.endsWith('/api/admin/security/audit') && method === 'GET') {
          return new Response(
            JSON.stringify({
              entries: [
                {
                  id: 'aud-1',
                  timestamp: '2026-11-11T17:00:00Z',
                  event: 'LOGIN_SUCCESS',
                  actor: currentOwnerId,
                  ipMasked: '203.0.113.***',
                  summary: 'Signed in cleanly via Worker auth.',
                },
              ],
            }),
            { status: 200 }
          );
        }

        if (url.endsWith('/api/admin/security/change-id') && method === 'POST') {
          const body = JSON.parse(String(init?.body || '{}')) as {
            currentPassword?: string;
            newUsername?: string;
          };
          if (body.currentPassword !== currentOwnerPassword) {
            return new Response(JSON.stringify({ error: 'Current password is incorrect.' }), {
              status: 401,
            });
          }
          currentOwnerId = body.newUsername || currentOwnerId;
          return new Response(
            JSON.stringify({ ok: true, username: currentOwnerId, requiresReauth: true }),
            { status: 200 }
          );
        }

        if (url.endsWith('/api/admin/security/change-password') && method === 'POST') {
          const body = JSON.parse(String(init?.body || '{}')) as {
            currentPassword?: string;
            newPassword?: string;
          };
          if (body.currentPassword !== currentOwnerPassword) {
            return new Response(JSON.stringify({ error: 'Current password is incorrect.' }), {
              status: 401,
            });
          }
          currentOwnerPassword = body.newPassword || currentOwnerPassword;
          return new Response(JSON.stringify({ ok: true, requiresReauth: true }), { status: 200 });
        }

        if (url.endsWith('/api/admin/content') && method === 'GET') {
          return new Response(
            JSON.stringify({
              bundle: remoteState,
              repository: 'nexusx-esports/nexusx-india',
              branch: 'main',
            }),
            { status: 200 }
          );
        }

        if (url.endsWith('/api/admin/content') && method === 'PUT') {
          if (headers.get('X-CSRF-Token') !== 'mock.csrf.token.123') {
            return new Response(JSON.stringify({ error: 'Invalid or missing CSRF token.' }), {
              status: 403,
            });
          }
          const body = JSON.parse(String(init?.body || '{}'));
          committedPayloads.push(body);
          remoteState = {
            tournaments: body.tournaments,
            results: body.results,
            news: body.news,
            ...(body.siteConfig ? { siteConfig: body.siteConfig } : {}),
          };
          const updatedFiles = [
            'public/data/tournaments.json',
            'public/data/results.json',
            'public/data/news.json',
          ];
          if (body.siteConfig) {
            updatedFiles.push('public/data/site-config.json');
          }
          return new Response(
            JSON.stringify({
              ok: true,
              commitSha: 'abcdef1234567890abcdef1234567890abcdef12',
              commitUrl: 'https://github.com/nexusx-esports/nexusx-india/commit/abcdef1',
              repository: 'nexusx-esports/nexusx-india',
              branch: 'main',
              updatedFiles,
              committedAt: '2026-11-11T17:00:00Z',
            }),
            { status: 200 }
          );
        }

        return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
      })
    );

    return {
      committedPayloads,
      seenRequestHeaders,
      getPrivateSheets: () => privateSheetsState,
    };
  }

  function setWorkerApiUrl(url: string) {
    if (!screen.queryByLabelText(/Cloudflare Worker API URL/i)) {
      fireEvent.click(screen.getByRole('button', { name: /Configure Worker API Endpoint/i }));
    }
    fireEvent.change(screen.getByLabelText(/Cloudflare Worker API URL/i), {
      target: { value: url },
    });
  }

  async function signInToAdmin() {
    render(
      <SiteDataProvider>
        <MemoryRouter initialEntries={[TEST_PRIVATE_ADMIN_PATH]}>
          <AppRoutes />
        </MemoryRouter>
      </SiteDataProvider>
    );

    await screen.findByRole('heading', { level: 1, name: /Admin Dashboard Login/i }, { timeout: 5000 });
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
      'noindex, nofollow'
    );

    setWorkerApiUrl('https://nexusx-worker.example.workers.dev');
    await screen.findByText(/Single-Owner Locked Access/i);
    expect(screen.queryByRole('button', { name: /Initial Setup/i })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Admin Username/i), {
      target: { value: 'admin-owner' },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: 'StrongPass!2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In to Admin Dashboard/i }));

    await screen.findByRole('heading', { level: 2, name: /Command Overview/i });
  }

  it('rejects bad admin credentials on login screen before showing dashboard', async () => {
    setupMockWorker();

    render(
      <SiteDataProvider>
        <MemoryRouter initialEntries={[TEST_PRIVATE_ADMIN_PATH]}>
          <AppRoutes />
        </MemoryRouter>
      </SiteDataProvider>
    );

    await screen.findByRole('heading', { level: 1, name: /Admin Dashboard Login/i }, { timeout: 5000 });
    setWorkerApiUrl('https://nexusx-worker.example.workers.dev');
    fireEvent.change(screen.getByLabelText(/Admin Username/i), {
      target: { value: 'admin-owner' },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: 'wrong-pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In to Admin Dashboard/i }));

    expect(
      await screen.findByText(/Invalid admin username or password\./i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Command Overview/i)).not.toBeInTheDocument();
  });

  it('exposes all 16 BGMI Admin Dashboard workspace, D1 operations, governance, and security modules without forbidden ERP branding', async () => {
    setupMockWorker();
    await signInToAdmin();

    const sidebarNav = screen.getByRole('navigation', { name: /Admin Management Modules/i });
    const navLabels = within(sidebarNav)
      .getAllByRole('button')
      .map((b) => b.textContent?.trim() ?? '');

    expect(navLabels.some((t) => /^Overview$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Tournaments\d*$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Solo Mode$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Duo Mode$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Squad Mode$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Registrations\d*\s*Open$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Teams$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Players$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Matches$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Results\d*$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Leaderboard$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^News & Updates\d*$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Reports & Analytics$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^User Management$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Roles & Permissions$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Activity Logs$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Site Settings$/i.test(t))).toBe(true);
    expect(navLabels.some((t) => /^Security Vault$/i.test(t))).toBe(true);

    expect(document.body.textContent ?? '').not.toMatch(/\bERP\b|Free Fire|Valorant/i);
  });

  it('completes end-to-end Tournament, Registration, Results, News, Site Settings workflows and commits to GitHub without storing tokens in browser storage', async () => {
    const { committedPayloads, seenRequestHeaders } = setupMockWorker();
    await signInToAdmin();

    // Wait for CSRF / in-memory check and confirm storage stays clean
    expect(window.sessionStorage.getItem('nexusx_admin_session_token')).toBeNull();
    expect(window.localStorage.length).toBe(0);
    for (let i = 0; i < window.sessionStorage.length; i += 1) {
      const k = window.sessionStorage.key(i) ?? '';
      expect(k).toBe('nexusx_admin_api_url');
    }

    // 1. Tournaments (navigate via sidebar): Create with ONLY essential fields + Duplicate + Archive
    const sidebarNav = screen.getByRole('navigation', { name: /Admin Management Modules/i });
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Tournaments\b/i }));
    await screen.findByRole('heading', { level: 2, name: /^Tournaments$/i });
    fireEvent.click(screen.getByRole('button', { name: /New Solo Tournament/i }));
    fireEvent.change(screen.getByLabelText(/Tournament Name/i), {
      target: { value: 'NexusX Diwali Solo Cup' },
    });
    // Verify slug auto-generated cleanly without opening optional drawer
    expect((screen.getByLabelText(/URL Slug/i) as HTMLInputElement).value).toBe(
      'nexusx-diwali-solo-cup'
    );
    fireEvent.click(screen.getByRole('button', { name: /Save Tournament Changes/i }));

    await screen.findByText(/Saved tournament "NexusX Diwali Solo Cup"/i);

    // Switch to Drafts filter, duplicate draft, then archive the duplicated copy
    fireEvent.click(screen.getByRole('button', { name: /^Drafts \(/i }));
    const dupButtons = screen.getAllByRole('button', { name: /^Duplicate$/i });
    fireEvent.click(dupButtons[dupButtons.length - 1]);
    await screen.findByText(/Duplicated "NexusX Diwali Solo Cup"/i);
    fireEvent.click(screen.getByRole('button', { name: /Cancel Edit/i }));
    const archiveButtons = screen.getAllByRole('button', { name: /^Archive$/i });
    fireEvent.click(archiveButtons[archiveButtons.length - 1]);
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /Confirm Archive/i }));
    await screen.findByText(/Archived "NexusX Diwali Solo Cup \(Copy\)"/i);

    // 2. Registrations: Configure Google Form URL & Open Registration
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Registrations\b/i }));
    await screen.findByRole('heading', { level: 2, name: /^Registrations$/i });

    const soloUrlInput = screen.getByLabelText(/Google Form HTTPS URL/i, {
      selector: '#reg-url-NX-SOLO-001',
    });
    fireEvent.change(soloUrlInput, {
      target: { value: 'https://forms.gle/NexusSoloLive2026' },
    });
    const soloGroup = screen.getByRole('group', {
      name: /Registration status for NexusX Solo Vanguard Cup/i,
    });
    fireEvent.click(within(soloGroup).getByRole('button', { name: /^Open$/i }));

    expect(
      screen.getByRole('link', { name: /Register Now/i })
    ).toHaveAttribute('href', 'https://forms.gle/NexusSoloLive2026');

    // 3. Results: Add result associated with tournament & toggle Publish/Unpublish
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Results\b/i }));
    fireEvent.click(screen.getByRole('button', { name: /Add Tournament Result/i }));
    fireEvent.change(screen.getByLabelText(/Associate with Tournament/i), {
      target: { value: 'NX-SOLO-001' },
    });
    fireEvent.change(screen.getByLabelText(/Winner \/ Champion Name/i), {
      target: { value: 'NX_ArjunBGMI' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save Result$/i }));

    await screen.findByText(/Saved tournament result/i);
    expect(screen.getByText(/NX_ArjunBGMI/i)).toBeInTheDocument();
    // Toggle publish state via list action (starts Unpublished -> Publish -> Unpublish -> Publish)
    fireEvent.click(screen.getByRole('button', { name: /^Publish$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Unpublish$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Publish$/i }));

    // 4. News & Updates: Create announcement
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^News & Updates\b/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create Announcement/i }));
    fireEvent.change(screen.getByLabelText(/Headline \/ Title/i), {
      target: { value: 'Registrations Now Live for Season Finale' },
    });
    fireEvent.change(screen.getByLabelText(/^Description$/i), {
      target: { value: 'Register before slots fill via Google Forms.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^Save Announcement$/i }));

    await screen.findByRole('heading', {
      level: 3,
      name: /Registrations Now Live for Season Finale/i,
    });

    // 5. Site Settings: Edit Hero Live Ticker & Community Links via submenu
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Site Settings\b/i }));
    await screen.findByRole('heading', { level: 2, name: /^Site Settings & Social Links$/i });
    fireEvent.change(screen.getByLabelText(/Live Top Announcement Ticker/i), {
      target: { value: 'NEXUSX SEASON 2 LIVE NOW' },
    });
    fireEvent.click(screen.getByRole('button', { name: /WhatsApp & Socials/i }));
    fireEvent.change(screen.getByLabelText(/Discord Invite URL/i), {
      target: { value: 'https://discord.gg/nexusxesports' },
    });

    // Publish all updates via GitHub Worker API
    fireEvent.click(screen.getByRole('button', { name: /Publish Updates/i }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Commit to GitHub/i }));

    await waitFor(() => {
      expect(screen.getByText(/Published to GitHub \(main\)/i)).toBeInTheDocument();
    });

    expect(committedPayloads).toHaveLength(1);
    const published = committedPayloads[0] as {
      tournaments: TournamentsData;
      results: ResultsData;
      news: NewsData;
      siteConfig?: SiteConfigData;
    };
    expect(published.tournaments.tournaments.some((t) => t.title === 'NexusX Diwali Solo Cup')).toBe(true);
    expect(published.siteConfig?.tickerAnnouncement).toBe('NEXUSX SEASON 2 LIVE NOW');
    expect(published.siteConfig?.community.discordUrl).toBe('https://discord.gg/nexusxesports');
    expect(
      published.tournaments.tournaments.some(
        (t) => t.title === 'NexusX Diwali Solo Cup (Copy)' && t.status === 'archived'
      )
    ).toBe(true);
    expect(published.tournaments.tournaments[0].registration.formUrl).toBe(
      'https://forms.gle/NexusSoloLive2026'
    );
    expect(published.results.entries[0].winner).toBe('NX_ArjunBGMI');
    expect(published.results.entries[0].tournamentId).toBe('NX-SOLO-001');
    expect(published.results.entries[0].published).toBe(true);
    expect(
      published.news.entries.some((n) => n.title === 'Registrations Now Live for Season Finale')
    ).toBe(true);

    const putCall = seenRequestHeaders.find((r) => r.url.endsWith('/api/admin/content') && r.method === 'PUT');
    expect(putCall?.csrf).toBe('mock.csrf.token.123');
    expect(seenRequestHeaders.every((r) => r.auth === null)).toBe(true);
  }, 15_000);

  it('supports Duo creation with blank template fields, Registration Full, Private Google Sheets in KV, Admin Light/Dark theme, and Security Settings', async () => {
    const { committedPayloads, getPrivateSheets } = setupMockWorker();
    await signInToAdmin();

    // Theme toggle scopes .admin-theme-light only on Admin Dashboard
    const themeToggle = screen.getByRole('button', { name: /Switch Admin to Light Mode/i });
    fireEvent.click(themeToggle);
    expect(document.querySelector('[data-admin-theme="light"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Switch Admin to Dark Mode/i }));
    expect(document.querySelector('[data-admin-theme="dark"]')).not.toBeNull();

    // New Duo Tournament starts with blank description & zero hardcoded sample rules
    const sidebarNav = screen.getByRole('navigation', { name: /Admin Management Modules/i });
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Tournaments\b/i }));
    fireEvent.click(screen.getByRole('button', { name: /New Duo Tournament/i }));
    await waitFor(() => {
      expect((screen.getByLabelText(/Tournament ID/i) as HTMLInputElement).value).toBe('NX-DUO-001');
    });
    expect((screen.getByLabelText(/Tournament Name/i) as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText(/Tournament Description/i) as HTMLTextAreaElement).value).toBe('');

    fireEvent.change(screen.getByLabelText(/Tournament Name/i), {
      target: { value: 'NexusX Duo Invitational' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Tournament Changes/i }));
    await screen.findByText(/Saved tournament "NexusX Duo Invitational"/i);

    // Registration Full + Private Organizer Google Sheet saved ONLY to Worker KV
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Registrations\b/i }));
    const duoGroup = await screen.findByRole('group', {
      name: /Registration status for NexusX Duo Invitational/i,
    });
    fireEvent.click(within(duoGroup).getByRole('button', { name: /^Full$/i }));

    const sheetInput = screen.getByLabelText(
      /Private Organizer Google Sheet URL for NexusX Duo Invitational/i
    );
    fireEvent.change(sheetInput, {
      target: { value: 'https://docs.google.com/spreadsheets/d/1DuoPrivateSheetXYZ/edit' },
    });
    const saveSheetBtns = screen.getAllByRole('button', { name: /Save Sheet/i });
    fireEvent.click(saveSheetBtns[saveSheetBtns.length - 1]);
    await screen.findByText(/Saved private Google Sheet link securely in Worker KV\./i);

    expect(getPrivateSheets()['NX-DUO-001']?.sheetUrl).toBe(
      'https://docs.google.com/spreadsheets/d/1DuoPrivateSheetXYZ/edit'
    );

    // Publish updates to GitHub and verify private Google Sheet NEVER leaks into GitHub payload
    fireEvent.click(screen.getByRole('button', { name: /Publish Updates/i }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Commit to GitHub/i }));
    await waitFor(() => {
      expect(screen.getByText(/Published to GitHub \(main\)/i)).toBeInTheDocument();
    });
    expect(JSON.stringify(committedPayloads[0])).not.toContain('spreadsheets/d/');

    // Open Security Settings -> Active Sessions & Security Activity -> Change Admin ID
    fireEvent.click(screen.getByRole('button', { name: /^Security$/i }));
    await screen.findByRole('heading', { name: /Security & Owner Account Controls/i });

    fireEvent.click(screen.getByRole('tab', { name: /Active Sessions/i }));
    await screen.findByText(/203\.0\.113\.\*\*\*/i);

    fireEvent.click(screen.getByRole('tab', { name: /Security Activity/i }));
    await screen.findByText(/LOGIN SUCCESS/i);

    fireEvent.click(screen.getByRole('tab', { name: /Account Security/i }));
    const currentPassInputs = screen.getAllByLabelText(/^Current Password$/i);
    fireEvent.change(currentPassInputs[0], { target: { value: 'StrongPass!2026' } });
    fireEvent.change(screen.getByLabelText(/New Admin ID/i), {
      target: { value: 'nexusx-founder' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Update Admin ID/i }));

    await screen.findByRole('heading', { level: 1, name: /Admin Dashboard Login/i });
    expect(screen.getByText(/re-sign in|Admin ID updated|updated/i)).toBeInTheDocument();
  }, 15_000);

  it('clearly distinguishes local sandbox saves from GitHub publishing and forces re-auth on 401 session revocation', async () => {
    let revokeSessionsNow = false;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        const method = (init?.method || 'GET').toUpperCase();

        if (url.includes('/data/')) {
          const filename = url.split('/data/')[1].split('?')[0];
          return new Response(
            fs.readFileSync(path.resolve(process.cwd(), 'public/data', filename), 'utf-8'),
            { status: 200 }
          );
        }
        if (url.endsWith('/api/auth/setup/status')) {
          return new Response(
            JSON.stringify({
              setupRequired: false,
              setupTokenConfigured: true,
              sessionSecretConfigured: true,
              cloudflareAccessSetupConfigured: false,
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/api/auth/login') && method === 'POST') {
          return new Response(
            JSON.stringify({
              authenticated: true,
              username: 'sandbox-owner',
              csrfToken: 'sandbox.csrf.token',
              authMode: 'cookie-csrf',
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/api/admin/content') && method === 'GET') {
          return new Response(
            JSON.stringify({
              bundle: {
                tournaments: readJson<TournamentsData>('tournaments.json'),
                results: readJson<ResultsData>('results.json'),
                news: readJson<NewsData>('news.json'),
              },
              repository: 'local-sandbox (GitHub App secrets not configured)',
              branch: 'local-sandbox',
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/api/admin/private-config') && method === 'GET') {
          return new Response(
            JSON.stringify({
              schemaVersion: 1,
              updatedAt: '',
              sheetsByTournamentId: {},
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/api/admin/private-config') && method === 'PUT') {
          if (revokeSessionsNow) {
            return new Response(JSON.stringify({ error: 'Authentication required.' }), {
              status: 401,
            });
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404 });
      })
    );

    render(
      <SiteDataProvider>
        <MemoryRouter initialEntries={[TEST_PRIVATE_ADMIN_PATH]}>
          <AppRoutes />
        </MemoryRouter>
      </SiteDataProvider>
    );

    await screen.findByRole('heading', { level: 1, name: /Admin Dashboard Login/i }, { timeout: 5000 });
    setWorkerApiUrl('http://localhost:8787');
    fireEvent.change(screen.getByLabelText(/Admin Username/i), {
      target: { value: 'sandbox-owner' },
    });
    fireEvent.change(screen.getByLabelText(/^Password$/i), {
      target: { value: 'SandboxStrong!Pass2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sign In to Admin Dashboard/i }));

    await screen.findByRole('heading', { level: 2, name: /Command Overview/i });
    expect(screen.getByText(/Local Sandbox Only/i)).toBeInTheDocument();
    expect(screen.queryByText(/Synced with GitHub/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Development Sandbox Active:/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save Local Sandbox/i }));
    const modal = await screen.findByRole('dialog');
    expect(within(modal).getByText(/Save Updates to Local Sandbox/i)).toBeInTheDocument();
    expect(within(modal).getByText(/Confirm Temporary Local Save/i)).toBeInTheDocument();
    fireEvent.click(within(modal).getByRole('button', { name: /Cancel/i }));

    // Simulate remote session revocation (401) -> immediately locks back to login screen
    revokeSessionsNow = true;
    const sidebarNav = screen.getByRole('navigation', { name: /Admin Management Modules/i });
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Registrations\b/i }));
    const sheetInputs = await screen.findAllByLabelText(/Private Organizer Google Sheet URL/i);
    fireEvent.change(sheetInputs[0], {
      target: { value: 'https://docs.google.com/spreadsheets/d/1RevokedCheckXYZ/edit' },
    });
    const saveBtns = screen.getAllByRole('button', { name: /Save Sheet/i });
    fireEvent.click(saveBtns[saveBtns.length - 1]);

    await screen.findByRole('heading', { level: 1, name: /Admin Dashboard Login/i });
    expect(screen.getByText(/session expired or was revoked/i)).toBeInTheDocument();
  }, 15_000);

  it('blocks publishing if Site Settings contains an insecure http:// social link or sheet reference', async () => {
    const { committedPayloads } = setupMockWorker();
    await signInToAdmin();

    const sidebarNav = screen.getByRole('navigation', { name: /Admin Management Modules/i });
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Site Settings\b/i }));
    fireEvent.click(screen.getByRole('button', { name: /WhatsApp & Socials/i }));
    fireEvent.change(screen.getByLabelText(/Instagram Page URL/i), {
      target: { value: 'http://instagram.com/insecure' },
    });

    await screen.findByText(/Please fix before publishing Site Settings:/i);
    fireEvent.click(screen.getByRole('button', { name: /Publish Updates/i }));
    await screen.findByText(/Resolve validation issues before publishing to GitHub:/i);
    expect(committedPayloads).toHaveLength(0);
  }, 15_000);

  it('loads real D1 overview metrics and exercises D1 Governance modules (Teams, Users, Roles, Activity Logs)', async () => {
    const baseFetch = globalThis.fetch;
    setupMockWorker();
    const origFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/admin/overview')) {
          return new Response(
            JSON.stringify({
              databaseConnected: true,
              actorRole: 'owner',
              metrics: {
                totalTournaments: 3,
                activeTournaments: 2,
                registeredPlayers: 24,
                registeredTeams: 6,
                pendingRegistrations: 4,
                upcomingMatches: 2,
                completedMatches: 1,
              },
              recentRegistrations: [],
              recentActivities: [],
              registrationTrend: [
                { day: '2026-11-11', count: 5 },
                { day: '2026-11-12', count: 9 },
              ],
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/api/admin/d1/teams')) {
          return new Response(
            JSON.stringify({
              teams: [
                {
                  id: 't-1',
                  name: 'Team GodLike D1',
                  slug: 'godlike',
                  tag: 'GODL',
                  division: 'Squad',
                  captain_ign: 'GODL_Jonathan',
                  member_count: 4,
                  matches_played: 5,
                  total_wins: 2,
                  total_kills: 41,
                  total_points: 92,
                  verified: 1,
                  created_at: '2026-11-12',
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/api/admin/d1/roles')) {
          return new Response(
            JSON.stringify({
              roles: [
                {
                  id: 'owner',
                  displayName: 'Owner',
                  description: 'Full platform ownership',
                  permissions: ['overview:read', 'tournaments:write', 'roles:write'],
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/api/admin/d1/users')) {
          return new Response(
            JSON.stringify({
              users: [
                {
                  id: 'u-1',
                  username: 'admin-owner',
                  email: 'owner@nexusxesports.in',
                  role_id: 'owner',
                  account_status: 'active',
                  created_at: '2026-11-10T00:00:00Z',
                  last_login_at: null,
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/api/admin/d1/activity-logs')) {
          return new Response(
            JSON.stringify({
              logs: [
                {
                  id: 'log-1',
                  timestamp: '2026-11-12T10:00:00Z',
                  actor_username: 'admin-owner',
                  actor_role: 'owner',
                  action: 'tournament_saved',
                  target_type: 'tournament',
                  target_id: 'NX-SQUAD-001',
                  ip_masked: '127.0.0.x',
                  summary: 'Published BGMI Squad Championship',
                },
              ],
            }),
            { status: 200 }
          );
        }
        return origFetch(input, init);
      })
    );
    void baseFetch;

    await signInToAdmin();
    expect(await screen.findByText(/D1 Live Database Connected/i)).toBeInTheDocument();
    expect(screen.getByText('24')).toBeInTheDocument();

    const sidebarNav = screen.getByRole('navigation', { name: /Admin Management Modules/i });
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Teams$/i }));
    expect(await screen.findByText(/Team GodLike D1/i)).toBeInTheDocument();

    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Roles & Permissions$/i }));
    expect(await screen.findByText(/Full platform ownership/i)).toBeInTheDocument();

    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^User Management$/i }));
    expect(await screen.findByText(/owner@nexusxesports\.in/i)).toBeInTheDocument();

    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Activity Logs$/i }));
    expect(await screen.findByText(/Published BGMI Squad Championship/i)).toBeInTheDocument();
  }, 15_000);

  it('syncs News and Site Settings directly to D1 endpoints and renders team total_wins', async () => {
    const d1NewsPosts: Array<Record<string, unknown>> = [];
    const d1SettingsPuts: Array<Record<string, unknown>> = [];
    setupMockWorker();
    const origFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/admin/content') && (!init?.method || init.method === 'GET')) {
          const baseRes = await origFetch(input, init);
          const payload = (await baseRes.json()) as {
            bundle: Record<string, unknown> & { news: { lastUpdated: string; entries: unknown[] } };
            repository: string;
            branch: string;
          };
          payload.bundle.news = {
            lastUpdated: '2026-11-12',
            entries: [
              {
                id: 'news-d1-test-1',
                title: 'BGMI Winter Qualifier Registrations Open',
                description: 'All verified squads can register cleanly through the live portal.',
                publishedDate: '2026-11-12',
                banner: './images/hero-arena.jpg',
                externalUrl: '',
                category: 'Tournament',
                pinned: true,
                published: true,
                archived: false,
              },
            ],
          };
          return new Response(JSON.stringify(payload), { status: 200 });
        }
        if (url.endsWith('/api/admin/d1/teams')) {
          return new Response(
            JSON.stringify({
              teams: [
                {
                  id: 't-wins',
                  name: 'Team Wins Verify',
                  slug: 'team-wins',
                  tag: 'TWV',
                  division: 'Squad',
                  captain_ign: 'TWV_Cap',
                  member_count: 4,
                  matches_played: 8,
                  total_wins: 3,
                  total_kills: 55,
                  total_points: 112,
                  verified: 1,
                  created_at: '2026-11-12',
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (url.endsWith('/api/admin/d1/news') && init?.method === 'POST') {
          d1NewsPosts.push(JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>);
          return new Response(JSON.stringify({ ok: true, id: 'news-sync' }), { status: 200 });
        }
        if (url.endsWith('/api/admin/d1/settings') && init?.method === 'PUT') {
          d1SettingsPuts.push(JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>);
          return new Response(
            JSON.stringify({ ok: true, updatedAt: '2026-11-12T12:00:00Z' }),
            { status: 200 }
          );
        }
        return origFetch(input, init);
      })
    );

    await signInToAdmin();
    const sidebarNav = screen.getByRole('navigation', { name: /Admin Management Modules/i });

    // Verify Teams renders computed `total_wins` stat cleanly
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Teams$/i }));
    expect(await screen.findByText(/Team Wins Verify/i)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    // Sync News directly to D1
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /News & Updates/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Sync News to Live D1/i }));
    await screen.findByText(/Synced \d+ news article\(s\) to live Cloudflare D1/i);
    expect(d1NewsPosts.length).toBeGreaterThanOrEqual(1);

    // Sync Site Settings directly to D1
    fireEvent.click(within(sidebarNav).getByRole('button', { name: /^Site Settings\b/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Save Settings to Live D1/i }));
    await screen.findByText(/Saved Website Settings to live Cloudflare D1/i);
    expect(d1SettingsPuts.length).toBe(1);
  }, 15_000);
});
