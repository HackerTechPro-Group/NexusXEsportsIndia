import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';
import { SiteDataProvider } from '../context/SiteDataContext';
import { AppRoutes } from '../App';
import { setTestAdminRoutePath } from '../utils/adminRoute';
import { mockPublicJsonFetches } from './setup';
import type { TournamentsData } from '../types/data';

const TEST_PRIVATE_ADMIN_ROUTE = '/nx-test-private-gate';

function renderAtRoute(initialRoute = '/') {
  return render(
    <SiteDataProvider>
      <MemoryRouter initialEntries={[initialRoute]}>
        <AppRoutes />
      </MemoryRouter>
    </SiteDataProvider>
  );
}

function makeLiveTournamentsFixture(): TournamentsData {
  const rawTours = JSON.parse(
    fs.readFileSync(path.resolve(process.cwd(), 'public/data/tournaments.json'), 'utf-8')
  ) as TournamentsData;

  const promoted = rawTours.tournaments.map((t) => ({
    ...t,
    status: 'upcoming' as const,
    published: true,
    featured: true,
    season: 'Season 1',
    matchFormat: 'Classic 4-Match Lobby',
    registration: {
      ...t.registration,
      additionalInstructions: 'Keep match screenshots ready for post-game audit.',
    },
  }));

  const duoFixture = {
    ...promoted[0],
    id: 'NX-DUO-001',
    slug: 'duo-showdown',
    title: 'NexusX BGMI Duo Showdown',
    format: 'Duo' as const,
    teamSize: '2 Players (Duo)',
    banner: './images/duo-banner.jpg',
    thumbnail: './images/duo-banner.jpg',
    registration: {
      ...promoted[0].registration,
      status: 'full' as const,
      formUrl: 'https://forms.gle/DuoFullLink99',
      closingMessage: 'All 50 Duo slots are currently filled.',
    },
  };

  return {
    ...rawTours,
    tournaments: [...promoted, duoFixture],
  };
}

describe('NexusX Esports India Single-Page Website Flows', () => {
  beforeEach(() => {
    mockPublicJsonFetches();
  });

  it('renders single-page hero slider, ONLY Tournaments & Results menus, zero Login/Player UI, and social icon links', async () => {
    renderAtRoute('/');

    expect(
      await screen.findByRole('heading', { level: 1, name: /COMPETE\. CONNECT\. CONQUER\./i })
    ).toBeInTheDocument();

    // Navbar has ONLY Tournaments and Results menu items (no Login / Register / Teams / Schedule / Contact)
    const primaryNav = screen.getByRole('navigation', { name: /Primary Navigation/i });
    expect(primaryNav).toHaveTextContent(/Tournaments/i);
    expect(primaryNav).toHaveTextContent(/Results/i);
    expect(primaryNav).not.toHaveTextContent(/Login|Register|Teams|Rankings|Schedule|About|Contact/i);
    expect(screen.queryByRole('link', { name: /Login \/ Register/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Create Player Account/i)).not.toBeInTheDocument();

    // Core single-page sections present
    expect(screen.getByRole('heading', { level: 2, name: /^BGMI Tournaments$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /^Tournament Results$/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: /Official Social Channels/i })).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/\bERP\b|Free Fire|Valorant/i);

    // Hero slider next/prev buttons advance slides cleanly
    fireEvent.click(screen.getByRole('button', { name: /Next slide/i }));
    expect(
      await screen.findByRole('heading', { level: 1, name: /BGMI SQUAD CHAMPIONSHIP/i })
    ).toBeInTheDocument();

    // Social links with icons and verified external URLs
    const expectedSocialLinks: [RegExp, string][] = [
      [/WhatsApp Group.*Join Group/is, 'https://chat.whatsapp.com/Bb5wB0uhUjL7M1Zvcze0bT?s=cl&p=a&iam=2'],
      [/WhatsApp Channel.*Follow Channel/is, 'https://whatsapp.com/channel/0029VbBpaitADTOINkNfLn28'],
      [/Instagram.*Follow Us/is, 'https://www.instagram.com/nexusxesportsindia/'],
      [/YouTube.*Subscribe/is, 'https://www.youtube.com/@NexusXEsportsIndia'],
    ];
    for (const [labelRegex, href] of expectedSocialLinks) {
      const link = screen.getByRole('link', { name: labelRegex });
      expect(link).toHaveAttribute('href', href);
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    }
  });

  it('shows clean empty states when public JSON only contains drafts or zero results', async () => {
    renderAtRoute('/');
    expect(await screen.findByText(/No Tournaments Published Yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No Official Tournament Results Published Yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/NexusX Solo Vanguard Cup/i)).not.toBeInTheDocument();
  });

  it('shows registration states accurately and opens single-page Details modal without leaving Home', async () => {
    const liveTours = makeLiveTournamentsFixture();
    const updated: TournamentsData = {
      ...liveTours,
      tournaments: liveTours.tournaments.map((t) =>
        t.format === 'Solo'
          ? {
              ...t,
              status: 'registration_open',
              registration: {
                ...t.registration,
                status: 'open',
                formUrl: 'https://forms.gle/SoloLiveLink99',
              },
            }
          : t.format === 'Squad'
            ? {
                ...t,
                registration: {
                  ...t.registration,
                  status: 'closed',
                  formUrl: 'https://forms.gle/SquadClosed99',
                },
              }
            : t
      ),
    };
    mockPublicJsonFetches({ 'tournaments.json': updated });

    renderAtRoute('/');

    await screen.findByRole('heading', { level: 2, name: /^BGMI Tournaments$/i });
    const tournamentsSection = document.getElementById('tournaments')!;
    const regLink = within(tournamentsSection).getByRole('link', { name: /Register Now/i });
    expect(regLink).toHaveAttribute('href', 'https://forms.gle/SoloLiveLink99');
    expect(regLink).toHaveAttribute('target', '_blank');
    expect(regLink).toHaveAttribute('rel', 'noopener noreferrer');

    const closedButtons = within(tournamentsSection).getAllByRole('button', {
      name: /^Registration Closed$/i,
    });
    expect(closedButtons.some((b) => (b as HTMLButtonElement).disabled)).toBe(true);
    const fullButtons = within(tournamentsSection).getAllByRole('button', {
      name: /^Registration Full$/i,
    });
    expect(fullButtons.some((b) => (b as HTMLButtonElement).disabled)).toBe(true);

    // Click View Details -> opens single-page modal cleanly
    const detailButtons = within(tournamentsSection).getAllByRole('button', { name: /View Details/i });
    fireEvent.click(detailButtons[0]);
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/Official Tournament Rules/i);
    fireEvent.click(screen.getByRole('button', { name: /Close tournament details/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('filters Solo, Duo, Squad dynamically and hides draft, archived, or unpublished content', async () => {
    const liveTours = makeLiveTournamentsFixture();
    mockPublicJsonFetches({
      'tournaments.json': {
        ...liveTours,
        tournaments: [
          ...liveTours.tournaments,
          {
            ...liveTours.tournaments[0],
            id: 'NX-DRAFT-999',
            slug: 'secret-draft',
            title: 'Secret Unpublished Draft Cup',
            status: 'draft',
            published: false,
          },
          {
            ...liveTours.tournaments[0],
            id: 'NX-ARCHIVED-888',
            slug: 'old-archived-cup',
            title: 'Old Archived Legacy Cup',
            status: 'archived',
            published: true,
          },
        ],
      },
      'results.json': {
        schemaVersion: 2,
        lastUpdated: '2026-11-11',
        entries: [
          {
            id: 'res-pub',
            tournamentId: 'NX-SOLO-001',
            tournamentName: 'Published Solo Finale',
            division: 'Solo',
            date: '2026-11-11',
            winner: 'WinnerAlpha',
            finalRankings: [],
            prizeDistribution: 'INR 1,000',
            summary: 'Published win.',
            published: true,
          },
          {
            id: 'res-hidden',
            tournamentName: 'Secret Draft Finale',
            division: 'Squad',
            date: '2026-11-11',
            winner: 'HiddenTeam',
            finalRankings: [],
            prizeDistribution: '',
            summary: '',
            published: false,
          },
        ],
      },
      'news.json': {
        schemaVersion: 2,
        lastUpdated: '2026-11-11',
        entries: [
          {
            id: 'news-live',
            title: 'Public Tournament Announcement',
            description: 'Live announcement.',
            publishedDate: '2026-11-11',
            banner: '',
            externalUrl: '',
            category: 'Tournament',
            pinned: false,
            published: true,
            archived: false,
          },
          {
            id: 'news-unpub',
            title: 'Draft Unpublished Bulletin',
            description: 'Hidden draft.',
            publishedDate: '2026-11-11',
            banner: '',
            externalUrl: '',
            category: 'Updates',
            pinned: false,
            published: false,
            archived: false,
          },
          {
            id: 'news-arch',
            title: 'Archived Old Bulletin',
            description: 'Hidden archive.',
            publishedDate: '2026-11-11',
            banner: '',
            externalUrl: '',
            category: 'Updates',
            pinned: false,
            published: true,
            archived: true,
          },
        ],
      },
    });

    renderAtRoute('/');

    await screen.findByRole('heading', { level: 2, name: /^BGMI Tournaments$/i });
    const tournamentsSection = document.getElementById('tournaments')!;
    expect(within(tournamentsSection).getByText(/NexusX Solo Vanguard Cup/i)).toBeInTheDocument();
    expect(screen.queryByText(/Secret Unpublished Draft Cup/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Old Archived Legacy Cup/i)).not.toBeInTheDocument();

    expect(screen.getByText(/Published Solo Finale/i)).toBeInTheDocument();
    expect(screen.queryByText(/Secret Draft Finale/i)).not.toBeInTheDocument();

    expect(screen.getByText(/Public Tournament Announcement/i)).toBeInTheDocument();
    expect(screen.queryByText(/Draft Unpublished Bulletin/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Archived Old Bulletin/i)).not.toBeInTheDocument();

    // Filter tournaments to Duo
    const filterGroup = within(tournamentsSection).getByRole('group', { name: /Tournament filters/i });
    const duoBtn = Array.from(filterGroup.querySelectorAll('button')).find(
      (btn) => btn.textContent?.trim() === 'Duo'
    );
    expect(duoBtn).toBeDefined();
    fireEvent.click(duoBtn!);
    expect(within(tournamentsSection).getByText(/NexusX BGMI Duo Showdown/i)).toBeInTheDocument();
    expect(
      within(tournamentsSection).queryByText(/NexusX India Squad Championship/i)
    ).not.toBeInTheDocument();
  });

  it('rejects multipage and admin routes as 404, keeps zero Admin links publicly, and opens Admin only at secret URL', async () => {
    setTestAdminRoutePath(TEST_PRIVATE_ADMIN_ROUTE);
    try {
      const routes: [string, RegExp][] = [
        ['/', /COMPETE\. CONNECT\. CONQUER\./i],
        ['/tournaments', /Drop Zone Not Found/i],
        ['/player/login', /Drop Zone Not Found/i],
        ['/admin', /Drop Zone Not Found/i],
        ['/dashboard', /Drop Zone Not Found/i],
        ['/login', /Drop Zone Not Found/i],
        [TEST_PRIVATE_ADMIN_ROUTE, /Admin Dashboard Login/i],
        ['/invalid-route', /Drop Zone Not Found/i],
      ];

      for (const [route, headingRegex] of routes) {
        const { unmount } = renderAtRoute(route);
        await waitFor(() => {
          expect(screen.getByRole('heading', { level: 1, name: headingRegex })).toBeInTheDocument();
        });
        if (route === '/') {
          expect(screen.queryByText(/Admin Portal/i)).not.toBeInTheDocument();
          const allLinks = screen.getAllByRole('link');
          expect(
            allLinks.some((el) => (el.getAttribute('href') ?? '').includes('nx-test-private-gate'))
          ).toBe(false);
        }
        if (route === TEST_PRIVATE_ADMIN_ROUTE) {
          expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe(
            'noindex, nofollow'
          );
        }
        unmount();
      }
    } finally {
      setTestAdminRoutePath(null);
    }
  });

  it('renders retryable DataErrorCard instead of dummy data when JSON loads fail', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.includes('tournaments.json')) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: 'Server error' }),
          } as Response;
        }
        const filename = url.split('/data/')[1].split('?')[0];
        const parsed = JSON.parse(
          fs.readFileSync(path.resolve(process.cwd(), 'public/data', filename), 'utf-8')
        );
        return {
          ok: true,
          status: 200,
          json: async () => parsed,
        } as Response;
      })
    );

    renderAtRoute('/');
    expect(
      await screen.findByRole('heading', { name: /Unable to Load Tournaments/i })
    ).toBeInTheDocument();

    mockPublicJsonFetches({ 'tournaments.json': makeLiveTournamentsFixture() });
    fireEvent.click(screen.getAllByRole('button', { name: /Retry Loading/i })[0]);
    await waitFor(() => {
      const tournamentsSection = document.getElementById('tournaments');
      expect(tournamentsSection).not.toBeNull();
      expect(within(tournamentsSection!).getByText(/NexusX Solo Vanguard Cup/i)).toBeInTheDocument();
    });
  });

  it('overlays live Worker /api/public/content Admin updates immediately onto the single page', async () => {
    vi.stubEnv('VITE_ADMIN_API_URL', 'https://nexusx-worker.example.workers.dev');

    try {
      const staticTournaments = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), 'public/data/tournaments.json'), 'utf-8')
      ) as Record<string, unknown>;
      const staticSiteConfig = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), 'public/data/site-config.json'), 'utf-8')
      ) as Record<string, unknown> & { community: Record<string, string> };
      const staticNews = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), 'public/data/news.json'), 'utf-8')
      ) as Record<string, unknown>;

      const liveTournaments = makeLiveTournamentsFixture();
      liveTournaments.tournaments[0].title = 'NexusX Worker Live Championship';

      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = typeof input === 'string' ? input : input.toString();
          if (url.includes('/api/public/content')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                available: true,
                updatedAt: '2026-11-12T10:00:00.000Z',
                source: 'github-publish',
                tournaments: liveTournaments,
                news: {
                  ...staticNews,
                  entries: [
                    {
                      id: 'live-news-1',
                      title: 'Live Worker Announcement Published',
                      description: 'Instant update synced directly from the Admin Dashboard.',
                      publishedDate: '2026-11-12',
                      banner: './images/news-season.jpg',
                      externalUrl: '',
                      category: 'Updates',
                      pinned: true,
                      published: true,
                      archived: false,
                    },
                  ],
                },
                siteConfig: {
                  ...staticSiteConfig,
                  community: {
                    ...staticSiteConfig.community,
                    discordUrl: 'https://discord.gg/nexusx-live-updated',
                  },
                },
              }),
            } as Response;
          }

          const filename = url.split('/data/')[1].split('?')[0];
          const dataMap: Record<string, unknown> = {
            'tournaments.json': staticTournaments,
            'site-config.json': staticSiteConfig,
            'news.json': staticNews,
          };
          const parsed =
            dataMap[filename] ??
            JSON.parse(
              fs.readFileSync(path.resolve(process.cwd(), 'public/data', filename), 'utf-8')
            );
          return {
            ok: true,
            status: 200,
            json: async () => parsed,
          } as Response;
        })
      );

      renderAtRoute('/');
      await screen.findByRole('heading', { level: 2, name: /^BGMI Tournaments$/i });
      const tournamentsSection = document.getElementById('tournaments')!;
      expect(
        within(tournamentsSection).getByText(/NexusX Worker Live Championship/i)
      ).toBeInTheDocument();
      expect(screen.getByText(/Live Worker Announcement Published/i)).toBeInTheDocument();
      const discordLinks = screen.getAllByRole('link', { name: /Discord/i });
      expect(
        discordLinks.some((el) => el.getAttribute('href') === 'https://discord.gg/nexusx-live-updated')
      ).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
