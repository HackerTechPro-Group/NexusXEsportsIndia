import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { PublicSiteBundle, TournamentRecord } from '../types/data';
import {
  EMPTY_SITE_BUNDLE,
  fetchPublicSiteBundle,
  type DatasetErrors,
} from '../utils/dataLoader';

export type DataLoadStatus = 'loading' | 'success' | 'partial_error' | 'error';

const BACKGROUND_REVALIDATE_INTERVAL_MS = 15_000;

interface ReloadOptions {
  silent?: boolean;
}

interface SiteDataContextValue {
  bundle: PublicSiteBundle;
  /** Published tournaments only (drafts and archived events are never exposed publicly). */
  publishedTournaments: TournamentRecord[];
  isLoading: boolean;
  status: DataLoadStatus;
  loadErrors: string[];
  datasetErrors: DatasetErrors;
  lastFetchedAt: string | null;
  reloadData: (forceRefresh?: boolean, options?: ReloadOptions) => Promise<void>;
}

const SiteDataContext = createContext<SiteDataContextValue | null>(null);

export const SiteDataProvider: React.FC<{
  children: React.ReactNode;
  initialBundle?: PublicSiteBundle;
}> = ({ children, initialBundle }) => {
  const [bundle, setBundle] = useState<PublicSiteBundle>(initialBundle ?? EMPTY_SITE_BUNDLE);
  const [isLoading, setIsLoading] = useState<boolean>(!initialBundle);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [datasetErrors, setDatasetErrors] = useState<DatasetErrors>({});
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(
    initialBundle ? new Date().toISOString() : null
  );
  const lastRefreshMsRef = useRef<number>(initialBundle ? Date.now() : 0);

  const reloadData = useCallback(async (forceRefresh = false, options?: ReloadOptions) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setIsLoading(true);
    }
    try {
      const result = await fetchPublicSiteBundle(forceRefresh);
      lastRefreshMsRef.current = Date.now();
      setBundle(result.bundle);
      setLoadErrors(result.errors);
      setDatasetErrors(result.datasetErrors);
      setLastFetchedAt(result.fetchedAt);
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!initialBundle) {
      void reloadData(false);
    }
  }, [initialBundle, reloadData]);

  useEffect(() => {
    if (initialBundle || typeof document === 'undefined' || typeof window === 'undefined') {
      return undefined;
    }

    const handleResumeRefresh = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }
      if (Date.now() - lastRefreshMsRef.current < BACKGROUND_REVALIDATE_INTERVAL_MS) {
        return;
      }
      void reloadData(true, { silent: true });
    };

    document.addEventListener('visibilitychange', handleResumeRefresh);
    window.addEventListener('focus', handleResumeRefresh);
    return () => {
      document.removeEventListener('visibilitychange', handleResumeRefresh);
      window.removeEventListener('focus', handleResumeRefresh);
    };
  }, [initialBundle, reloadData]);

  const status: DataLoadStatus = useMemo(() => {
    if (isLoading) return 'loading';
    if (loadErrors.length === 0) return 'success';
    return loadErrors.length >= 6 ? 'error' : 'partial_error';
  }, [isLoading, loadErrors.length]);

  const publishedTournaments = useMemo(
    () =>
      bundle.tournaments.tournaments.filter(
        (t) => t.status !== 'draft' && t.status !== 'archived' && t.published !== false
      ),
    [bundle.tournaments.tournaments]
  );

  return (
    <SiteDataContext.Provider
      value={{
        bundle,
        publishedTournaments,
        isLoading,
        status,
        loadErrors,
        datasetErrors,
        lastFetchedAt,
        reloadData,
      }}
    >
      {children}
    </SiteDataContext.Provider>
  );
};

export function useSiteData(): SiteDataContextValue {
  const ctx = useContext(SiteDataContext);
  if (!ctx) {
    throw new Error('useSiteData must be used within SiteDataProvider');
  }
  return ctx;
}
