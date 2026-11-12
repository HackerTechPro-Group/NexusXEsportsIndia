import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

function readPublicJson(file: string) {
  return JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'public/data', file), 'utf-8')
  );
}

const defaultPayloads: Record<string, unknown> = {
  'site-config.json': readPublicJson('site-config.json'),
  'tournaments.json': readPublicJson('tournaments.json'),
  'leaderboard.json': readPublicJson('leaderboard.json'),
  'schedule.json': readPublicJson('schedule.json'),
  'results.json': readPublicJson('results.json'),
  'news.json': readPublicJson('news.json'),
};

Object.defineProperty(window, 'scrollTo', {
  value: vi.fn(),
  writable: true,
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

export function mockPublicJsonFetches(overrides: Partial<Record<string, unknown>> = {}) {
  const payloads = { ...defaultPayloads, ...overrides };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const urlStr = typeof input === 'string' ? input : input.toString();
      const matched = Object.keys(payloads).find((key) => urlStr.includes(key));
      if (!matched) {
        return {
          ok: false,
          status: 404,
          json: async () => ({}),
        } as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () => payloads[matched],
      } as Response;
    })
  );
}
