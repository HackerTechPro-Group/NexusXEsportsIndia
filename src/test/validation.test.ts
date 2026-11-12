import { describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  computeAdminRouteHash,
  isPredictableAdminPath,
  isSecretAdminPathname,
  setTestAdminRoutePath,
} from '../utils/adminRoute';
import {
  containsPrivateSheetReference,
  containsSecretMaterial,
  isValidNewsData,
  isValidSiteConfigData,
  isValidTournamentsData,
  validateGoogleFormUrl,
  validateGoogleSheetUrl,
  validateHttpsUrl,
  validateImageAssetUrl,
  validateNewsArticle,
  validateResultEntry,
  validateTournamentRecord,
} from '../utils/validation';
import { getRegistrationButtonState } from '../utils/registration';
import { formatDisplayDate } from '../utils/dateFormat';
import type { TournamentRecord } from '../types/data';

const baseTournaments = JSON.parse(
  fs.readFileSync(path.resolve(process.cwd(), 'public/data/tournaments.json'), 'utf-8')
).tournaments as TournamentRecord[];

describe('Public validation, registration & security invariants', () => {
  it('accepts official HTTPS Google Forms & Sheets URLs and rejects invalid URLs', () => {
    expect(
      validateGoogleFormUrl('https://docs.google.com/forms/d/e/1FAIpQLScDemo/viewform').valid
    ).toBe(true);
    expect(validateGoogleFormUrl('https://forms.gle/NexusSoloForm1').valid).toBe(true);
    expect(
      validateGoogleSheetUrl('https://docs.google.com/spreadsheets/d/1AbCdEfGhI/edit').valid
    ).toBe(true);
    expect(validateGoogleSheetUrl('http://docs.google.com/spreadsheets/d/1AbCdEf').valid).toBe(
      false
    );
    expect(validateGoogleSheetUrl('https://forms.gle/NotASheet').valid).toBe(false);
    expect(validateGoogleSheetUrl('https://example.com/spreadsheets/1').valid).toBe(false);
    expect(
      containsPrivateSheetReference({
        note: 'https://docs.google.com/spreadsheets/d/1PrivateSheet',
      })
    ).toBe(true);
    expect(containsPrivateSheetReference({ note: 'https://forms.gle/PublicForm' })).toBe(false);
  });

  it('rejects javascript:, data:, http:, and non-Google domains', () => {
    expect(validateGoogleFormUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateGoogleFormUrl('data:text/html,<h1>x</h1>').valid).toBe(false);
    expect(validateGoogleFormUrl('http://forms.gle/abc').valid).toBe(false);
    expect(validateGoogleFormUrl('https://example.com/forms/123').valid).toBe(false);
    expect(validateGoogleFormUrl('https://user:pass@forms.gle/abc').valid).toBe(false);
    expect(validateHttpsUrl('javascript:void(0)', 'Link').valid).toBe(false);
    expect(validateImageAssetUrl('javascript:alert(1)', 'Banner').valid).toBe(false);
    expect(validateImageAssetUrl('./../secret.jpg', 'Banner').valid).toBe(false);
  });

  it('rejects impossible calendar dates and validates deep JSON schemas strictly', () => {
    const errArticle = validateNewsArticle({
      id: 'news-bad-date',
      title: 'Test',
      description: 'Details',
      publishedDate: '2026-02-31',
      banner: './images/hero-arena.jpg',
      externalUrl: '',
      category: 'Tournament',
      pinned: false,
    });
    expect(errArticle.some((m) => m.includes('valid calendar date'))).toBe(true);

    expect(isValidTournamentsData({ schemaVersion: 2, lastUpdated: '2026-11-11', tournaments: [] })).toBe(true);
    expect(isValidTournamentsData({ schemaVersion: 2, lastUpdated: '2026-11-11', tournaments: [{ bad: true }] })).toBe(false);
    expect(isValidNewsData({ schemaVersion: 2, lastUpdated: '2026-11-11', entries: [] })).toBe(true);
    expect(isValidSiteConfigData({ schemaVersion: 2 })).toBe(false);
  });

  it('resolves registration button states accurately (open+valid, closed, missing, invalid)', () => {
    const sample = baseTournaments[0];

    expect(
      getRegistrationButtonState({
        ...sample,
        registration: { ...sample.registration, status: 'open', formUrl: '' },
      })
    ).toMatchObject({ isEnabled: false, label: 'Registration Opening Soon' });

    expect(
      getRegistrationButtonState({
        ...sample,
        registration: {
          ...sample.registration,
          status: 'open',
          formUrl: 'https://invalid.example.com',
        },
      })
    ).toMatchObject({ isEnabled: false, label: 'Registration Opening Soon' });

    expect(formatDisplayDate('2026-11-28')).toBe('28 November 2026');
    expect(formatDisplayDate('')).toBe('TBA');

    expect(
      getRegistrationButtonState({
        ...sample,
        registration: {
          ...sample.registration,
          status: 'closed',
          formUrl: 'https://forms.gle/Valid123',
        },
      })
    ).toMatchObject({ isEnabled: false, label: 'Registration Closed' });

    expect(
      getRegistrationButtonState({
        ...sample,
        registration: {
          ...sample.registration,
          status: 'open',
          formUrl: 'https://forms.gle/Valid123',
        },
      })
    ).toMatchObject({
      isEnabled: true,
      label: 'Register Now',
      href: 'https://forms.gle/Valid123',
    });
    expect(
      getRegistrationButtonState({
        ...sample,
        status: 'archived',
        registration: {
          ...sample.registration,
          status: 'open',
          formUrl: 'https://forms.gle/Valid123',
        },
      })
    ).toMatchObject({ isEnabled: false, label: 'Registration Closed' });

    expect(
      getRegistrationButtonState({
        ...sample,
        status: 'upcoming',
        registration: {
          ...sample.registration,
          status: 'full',
          closingMessage: 'All 100 Solo slots are full.',
          formUrl: 'https://forms.gle/Valid123',
        },
      })
    ).toMatchObject({
      isEnabled: false,
      label: 'Registration Full',
      helperText: 'All 100 Solo slots are full.',
      reason: 'full',
    });
  });

  it('validates Solo/Duo/Squad formats, Draft vs Published requirements, and rejects Google Sheets in public data', () => {
    const errors = validateTournamentRecord(baseTournaments[0], ['NX-SOLO-001']);
    expect(errors.some((e) => e.includes('Duplicate Tournament ID'))).toBe(true);

    // Draft allows minimal metadata
    const minimalDraft: TournamentRecord = {
      ...baseTournaments[0],
      id: 'NX-DUO-001',
      slug: 'duo-draft',
      format: 'Duo',
      description: '',
      map: '',
      teamSize: '',
      eligibleDevices: '',
      status: 'draft',
      published: false,
    };
    expect(validateTournamentRecord(minimalDraft)).toEqual([]);

    // Publishing empty fields fails cleanly
    const incompletePublish: TournamentRecord = {
      ...minimalDraft,
      status: 'upcoming',
      published: true,
    };
    const pubErrors = validateTournamentRecord(incompletePublish);
    expect(pubErrors.some((e) => e.includes('Description is required to publish'))).toBe(true);

    // Google Sheet URL leaked inside public tournament description fails validation
    const leakedSheetRecord: TournamentRecord = {
      ...baseTournaments[0],
      id: 'NX-LEAK-001',
      description: 'Roster sheet: https://docs.google.com/spreadsheets/d/1AbCdEf',
    };
    expect(
      validateTournamentRecord(leakedSheetRecord).some((e) => e.includes('Google Sheet URLs'))
    ).toBe(true);

    expect(
      validateResultEntry({
        id: 'res-1',
        tournamentId: 'NX-SOLO-001',
        tournamentName: 'Solo Cup',
        division: 'Solo',
        date: '2026-11-12',
        winner: 'PlayerOne',
        finalRankings: [{ rank: 1, teamOrPlayer: 'PlayerOne', totalPoints: 42, prize: '₹1,000' }],
        prizeDistribution: '₹1,000 winner',
        summary: 'Clean lobby win.',
        published: true,
      })
    ).toEqual([]);

    expect(
      validateNewsArticle({
        id: 'news-1',
        title: 'Qualifier Update',
        description: 'Details updated.',
        publishedDate: '2026-11-12',
        banner: './images/hero-arena.jpg',
        externalUrl: 'https://nexusxesports.in/updates',
        category: 'Tournament',
        pinned: false,
        published: true,
        archived: false,
      })
    ).toEqual([]);

    expect(containsSecretMaterial({ note: 'ghp_1234567890abcdefghij' })).toBe(true);
    expect(containsSecretMaterial({ note: 'Safe tournament note' })).toBe(false);
  });

  it('ensures public JSON files contain zero hardcoded Google Form links, tokens, placeholder emails, or promo demo entries', () => {
    const dataDir = path.resolve(process.cwd(), 'public/data');
    const files = fs.readdirSync(dataDir);
    for (const file of files) {
      const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
      expect(content).not.toContain('docs.google.com/forms');
      expect(content).not.toContain('docs.google.com/spreadsheets');
      expect(content).not.toContain('forms.gle');
      expect(content).not.toMatch(/ghp_|github_pat_|pbkdf2_sha256\$/);
    }

    const toursData = JSON.parse(fs.readFileSync(path.join(dataDir, 'tournaments.json'), 'utf-8'));
    expect(isValidTournamentsData(toursData)).toBe(true);
    expect(
      toursData.tournaments.every(
        (t: TournamentRecord) => t.status === 'draft' && t.published === false && t.featured === false
      )
    ).toBe(true);

    const siteConfig = JSON.parse(fs.readFileSync(path.join(dataDir, 'site-config.json'), 'utf-8'));
    expect(isValidSiteConfigData(siteConfig)).toBe(true);
    expect(siteConfig.community.contactEmail).toBe('');
    expect(siteConfig.tickerAnnouncement).toBe('');

    const newsData = JSON.parse(fs.readFileSync(path.join(dataDir, 'news.json'), 'utf-8'));
    expect(newsData.entries).toEqual([]);
  });

  it('ensures src/ contains zero Electron APIs, direct GitHub API calls, tokens, or hardcoded credentials', () => {
    const walk = (dir: string): string[] =>
      fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          return entry.name === 'test' ? [] : walk(full);
        }
        return [full];
      });

    const srcFiles = walk(path.resolve(process.cwd(), 'src'));
    for (const file of srcFiles) {
      const text = fs.readFileSync(file, 'utf-8');
      expect(text).not.toContain('ipcRenderer');
      expect(text).not.toContain('contextBridge');
      expect(text).not.toContain('api.github.com');
      expect(text).not.toContain('pbkdf2_sha256$');
      expect(text).not.toMatch(
        /(ghp_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|ghs_[A-Za-z0-9]{10,}|-----BEGIN (?:RSA )?PRIVATE KEY-----)/
      );
    }

    const sitemapPath = path.resolve(process.cwd(), 'public/sitemap.xml');
    const sitemap = fs.readFileSync(sitemapPath, 'utf-8');
    expect(sitemap).not.toMatch(/\/(admin|dashboard|administrator|login|gamingclub)/i);

    const exampleVars = fs.readFileSync(
      path.resolve(process.cwd(), 'worker/.dev.vars.example'),
      'utf-8'
    );
    expect(exampleVars).not.toContain('/#/admin');
    expect(exampleVars).not.toMatch(/HTP-Gaming-Club|MK@007|nexusx-admin/i);
  });

  it('validates SHA-256 secret admin route matching and blocks predictable or retired paths', () => {
    const testSecret = '/nx-vault-test-89';
    const expectedDigest = crypto
      .createHash('sha256')
      .update('nexusx:admin-route:v1:nx-vault-test-89', 'utf8')
      .digest('hex');

    expect(computeAdminRouteHash(testSecret)).toBe(expectedDigest);
    expect(computeAdminRouteHash('/gamingclub')).toBe('');
    expect(isPredictableAdminPath('/admin')).toBe(true);
    expect(isPredictableAdminPath('/dashboard')).toBe(true);
    expect(isPredictableAdminPath('/administrator')).toBe(true);
    expect(isPredictableAdminPath('/login')).toBe(true);
    expect(isPredictableAdminPath('/gamingclub')).toBe(true);

    setTestAdminRoutePath(testSecret);
    try {
      expect(isSecretAdminPathname('/nx-vault-test-89')).toBe(true);
      expect(isSecretAdminPathname('/NX-Vault-Test-89/')).toBe(true);
      expect(isSecretAdminPathname('/admin')).toBe(false);
      expect(isSecretAdminPathname('/dashboard')).toBe(false);
      expect(isSecretAdminPathname('/login')).toBe(false);
      expect(isSecretAdminPathname('/gamingclub')).toBe(false);
      expect(isSecretAdminPathname('/tournaments')).toBe(false);
    } finally {
      setTestAdminRoutePath(null);
    }
  });
});
