import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { Footer } from '../components/layout/Footer';
import { Navbar } from '../components/layout/Navbar';
import { SiteDataProvider } from '../context/SiteDataContext';
import { HomePage } from '../pages/HomePage';
import { DEFAULT_CMS_SNAPSHOT } from '../types/cms';
import type { PublicSiteBundle } from '../types/data';
import { WebsiteCmsModule } from '../admin/modules/WebsiteCmsModule';
import * as cmsClient from '../admin/api/cmsClient';

function makeDynamicBundle(): PublicSiteBundle {
  const customCms = structuredClone(DEFAULT_CMS_SNAPSHOT);
  customCms.hero.slides[0].heading = 'WINTER BGMI MASTERS';
  customCms.navigation.push({
    id: 'nav-custom-news',
    label: 'Updates',
    href: '#news',
    itemType: 'anchor',
    visible: true,
    showMobile: true,
    openInNewTab: false,
    displayOrder: 3,
  });
  customCms.footer.copyrightText = '© 2026 Custom CMS Footer Active';
  customCms.aboutContact.aboutVisible = true;
  customCms.aboutContact.aboutHeading = 'About NexusX Dynamic';

  return {
    siteConfig: {
      schemaVersion: 2,
      lastUpdated: '2026-11-12',
      brandName: 'NexusX Esports India',
      tagline: 'BGMI Tournament Platform',
      heroDescription: 'Compete dynamically.',
      tickerAnnouncement: '',
      whyJoin: [],
      about: { heading: '', paragraphs: [], pillars: [], vision: '' },
      community: {
        whatsappCommunityUrl: '',
        whatsappChannelUrl: '',
        whatsappContactUrl: '',
        instagramUrl: '',
        youtubeUrl: '',
        discordUrl: '',
        contactEmail: 'contact@nexusxesports.in',
      },
      termsSections: [],
    },
    tournaments: { schemaVersion: 2, lastUpdated: '2026-11-12', tournaments: [] },
    leaderboard: { schemaVersion: 2, lastUpdated: '2026-11-12', isDemoData: false, entries: [] },
    schedule: { schemaVersion: 2, lastUpdated: '2026-11-12', entries: [] },
    results: { schemaVersion: 2, lastUpdated: '2026-11-12', entries: [] },
    news: { schemaVersion: 2, lastUpdated: '2026-11-12', entries: [] },
    cms: customCms,
  };
}

describe('Dynamic Website CMS Rendering & Admin Website Content Manager', () => {
  it('renders custom CMS Hero heading, Navigation links, About section, and Footer dynamically on public website', () => {
    const bundle = makeDynamicBundle();
    render(
      <MemoryRouter>
        <SiteDataProvider initialBundle={bundle}>
          <Navbar />
          <HomePage />
          <Footer />
        </SiteDataProvider>
      </MemoryRouter>
    );

    expect(screen.getByText('WINTER BGMI MASTERS')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Updates' })).toBeInTheDocument();
    expect(screen.getByText('About NexusX Dynamic')).toBeInTheDocument();
    expect(screen.getByText('© 2026 Custom CMS Footer Active')).toBeInTheDocument();
  });

  it('loads Website Content Manager draft workspace and triggers Save Draft, Preview & Publish Live workflows', async () => {
    const fetchWsSpy = vi.spyOn(cmsClient, 'fetchAdminCmsWorkspace').mockResolvedValue({
      draft: structuredClone(DEFAULT_CMS_SNAPSHOT),
      published: structuredClone(DEFAULT_CMS_SNAPSHOT),
      publication: {
        publishedVersion: 1,
        draftVersion: 2,
        etag: 'cms-v1',
        lastPublishedAt: '2026-11-12T10:00:00Z',
        lastPublishedBy: 'nexusx-owner',
        lastRollbackAt: null,
        hasUnpublishedChanges: true,
      },
      revisions: [
        {
          id: 'rev-1',
          versionNumber: 1,
          summary: 'Baseline',
          createdBy: 'nexusx-owner',
          createdAt: '2026-11-12T10:00:00Z',
          status: 'published',
        },
      ],
      mediaAssets: [],
      availableTournaments: [],
    });

    const saveDraftSpy = vi.spyOn(cmsClient, 'saveAdminCmsDraft').mockResolvedValue({
      ok: true,
      draftVersion: 3,
      publication: {
        publishedVersion: 1,
        draftVersion: 3,
        etag: 'cms-v1',
        lastPublishedAt: '2026-11-12T10:00:00Z',
        lastPublishedBy: 'nexusx-owner',
        lastRollbackAt: null,
        hasUnpublishedChanges: true,
      },
    });

    const publishSpy = vi.spyOn(cmsClient, 'publishAdminCmsLive').mockResolvedValue({
      ok: true,
      version: 2,
      etag: 'cms-v2',
      publication: {
        publishedVersion: 2,
        draftVersion: 3,
        etag: 'cms-v2',
        lastPublishedAt: '2026-11-12T10:05:00Z',
        lastPublishedBy: 'nexusx-owner',
        lastRollbackAt: null,
        hasUnpublishedChanges: false,
      },
    });

    render(<WebsiteCmsModule apiUrl="https://worker.example" />);

    await waitFor(() => expect(fetchWsSpy).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/Website Content Manager/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Save Draft/i }));
    await waitFor(() => expect(saveDraftSpy).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /Publish Live Website/i }));
    await waitFor(() => expect(publishSpy).toHaveBeenCalledTimes(1));
  });
});
