import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PageMeta } from '../components/common/PageMeta';
import { useSiteData } from '../context/SiteDataContext';
import { AdminDashboard } from './AdminDashboard';
import {
  AdminApiError,
  checkAdminSession,
  fetchAdminContent,
  getDefaultAdminApiUrl,
  loginAdmin,
  logoutAdmin,
  publishAdminContent,
  validateWorkerApiUrl,
} from './api/adminClient';
import { AdminLogin } from './components/AdminLogin';
import type { AdminContentPayload, AdminPublishResponse } from './types';

type AuthState =
  | { phase: 'checking' }
  | { phase: 'unauthenticated'; notice: string | null }
  | {
      phase: 'loading_content';
      apiUrl: string;
      username: string;
    }
  | {
      phase: 'ready';
      apiUrl: string;
      username: string;
      repository: string;
      branch: string;
      snapshot: AdminContentPayload;
    };

const AdminAppPage: React.FC = () => {
  const { bundle: publicSiteBundle, reloadData } = useSiteData();
  const publicSiteBundleRef = useRef(publicSiteBundle);
  publicSiteBundleRef.current = publicSiteBundle;

  const initialUrl = getDefaultAdminApiUrl();
  const [state, setState] = useState<AuthState>(() =>
    validateWorkerApiUrl(initialUrl).valid
      ? { phase: 'checking' }
      : { phase: 'unauthenticated', notice: null }
  );

  const loadContent = useCallback(
    async (apiUrl: string, username: string) => {
      setState({ phase: 'loading_content', apiUrl, username });
      try {
        const data = await fetchAdminContent(apiUrl);
        const latestPublicBundle = publicSiteBundleRef.current;
        const isSandboxEmpty =
          data.branch === 'local-sandbox' &&
          data.bundle.tournaments.tournaments.length === 0 &&
          data.bundle.results.entries.length === 0 &&
          data.bundle.news.entries.length === 0 &&
          latestPublicBundle.tournaments.tournaments.length > 0;

        const baseBundle: AdminContentPayload = isSandboxEmpty
          ? {
              tournaments: structuredClone(latestPublicBundle.tournaments),
              results: structuredClone(latestPublicBundle.results),
              news: structuredClone(latestPublicBundle.news),
              siteConfig: structuredClone(latestPublicBundle.siteConfig),
            }
          : {
              ...data.bundle,
              ...(data.bundle.siteConfig
                ? { siteConfig: data.bundle.siteConfig }
                : latestPublicBundle.siteConfig.brandName
                  ? { siteConfig: structuredClone(latestPublicBundle.siteConfig) }
                  : {}),
            };

        setState({
          phase: 'ready',
          apiUrl,
          username,
          repository: data.repository,
          branch: data.branch,
          snapshot: baseBundle,
        });
      } catch (err) {
        if (err instanceof AdminApiError && err.status === 401) {
          setState({
            phase: 'unauthenticated',
            notice: 'Session expired. Please sign in again.',
          });
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load repository data from Worker.';
        setState({ phase: 'unauthenticated', notice: message });
      }
    },
    []
  );

  useEffect(() => {
    const base = getDefaultAdminApiUrl();
    if (!validateWorkerApiUrl(base).valid) return;

    let cancelled = false;
    checkAdminSession(base)
      .then((session) => {
        if (cancelled) return;
        if (session.authenticated && session.username) {
          void loadContent(base, session.username);
        } else {
          setState({ phase: 'unauthenticated', notice: null });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState({ phase: 'unauthenticated', notice: null });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadContent]);

  const handlePublish = async (
    payload: AdminContentPayload,
    commitMessage: string
  ): Promise<AdminPublishResponse> => {
    if (state.phase !== 'ready') {
      throw new Error('Admin session is not active.');
    }
    try {
      const response = await publishAdminContent(state.apiUrl, payload, commitMessage);
      // Re-sync local snapshot cleanly with published payload timestamps
      const refreshed = await fetchAdminContent(state.apiUrl).catch(() => null);
      setState((prev) =>
        prev.phase === 'ready'
          ? {
              ...prev,
              snapshot: refreshed ? refreshed.bundle : structuredClone(payload),
            }
          : prev
      );
      await reloadData(true);
      return response;
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 401) {
        setState({
          phase: 'unauthenticated',
          notice: 'Your session expired while publishing. Please sign in again.',
        });
      }
      throw err;
    }
  };

  const handleLogout = async () => {
    const apiUrl =
      state.phase === 'ready' || state.phase === 'loading_content'
        ? state.apiUrl
        : getDefaultAdminApiUrl();
    await logoutAdmin(apiUrl);
    setState({ phase: 'unauthenticated', notice: null });
  };

  if (state.phase === 'checking' || state.phase === 'loading_content') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#060709] text-slate-300 font-mono text-xs uppercase tracking-wider">
        <PageMeta
          title="Restricted Console | NexusX Esports India"
          description="Restricted management session verification."
          noIndex
        />
        {state.phase === 'checking'
          ? 'Verifying admin session...'
          : 'Loading GitHub content bundle...'}
      </div>
    );
  }

  if (state.phase === 'unauthenticated') {
    return (
      <>
        <PageMeta
          title="Admin Login | NexusX Esports India"
          description="Authorized administrator sign-in for NexusX Esports India."
          noIndex
        />
        <AdminLogin
          initialApiUrl={getDefaultAdminApiUrl()}
          initialNotice={state.notice}
          onAttemptLogin={(apiUrl, user, pass) => loginAdmin(apiUrl, user, pass)}
          onLoginSuccess={(apiUrl, username) => {
            void loadContent(apiUrl, username);
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageMeta
        title="Admin Dashboard | NexusX Esports India"
        description="Manage BGMI tournaments, Google Form registrations, results, and announcements."
        noIndex
      />
      <AdminDashboard
        apiUrl={state.apiUrl}
        username={state.username}
        repository={state.repository}
        branch={state.branch}
        publishedSnapshot={state.snapshot}
        onReload={() => loadContent(state.apiUrl, state.username)}
        onPublish={handlePublish}
        onLogout={handleLogout}
        onRequireReauth={(notice) => setState({ phase: 'unauthenticated', notice })}
      />
    </>
  );
};

export default AdminAppPage;
