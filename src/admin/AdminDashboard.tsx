import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Shield,
  Sun,
  UploadCloud,
  X,
} from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { ConfirmModal } from '../components/common/ConfirmModal';
import type { TournamentFormat } from '../types/data';
import {
  containsPrivateSheetReference,
  containsSecretMaterial,
  validateNewsArticle,
  validateResultEntry,
  validateSiteConfigForAdmin,
  validateTournamentRecord,
} from '../utils/validation';
import {
  AdminApiError,
  fetchPrivateSheetsConfig,
  generateServerTournamentId,
  savePrivateSheetsConfig,
} from './api/adminClient';
import { AdminCommandOverview } from './components/AdminCommandOverview';
import { AdminSidebarNav } from './components/AdminSidebarNav';
import { SecuritySettingsPanel, type SecurityTab } from './components/SecuritySettingsPanel';
import { NewsModule } from './modules/NewsModule';
import { RegistrationModule } from './modules/RegistrationModule';
import { ResultsModule } from './modules/ResultsModule';
import { SiteSettingsModule, type SiteSettingsSection } from './modules/SiteSettingsModule';
import { TournamentModule, type TournamentListFilter } from './modules/TournamentModule';
import { WebsiteCmsModule } from './modules/WebsiteCmsModule';
import {
  AdminD1MatchScoringBox,
  AdminD1RegistrationsQueue,
  AdminLeaderboardModule,
  AdminMatchesModule,
  AdminPlayersModule,
  AdminTeamsModule,
} from './modules/D1OperationsModules';
import {
  AdminActivityLogsModule,
  AdminReportsModule,
  AdminRolesModule,
  AdminUsersModule,
} from './modules/D1GovernanceModules';
import {
  saveAdminD1Settings,
  upsertAdminD1News,
  upsertAdminD1Tournament,
} from './api/adminD1Client';
import type {
  AdminContentPayload,
  AdminModuleTab,
  AdminPublishResponse,
  PrivateSheetEntry,
  PrivateSheetsConfig,
} from './types';

const ADMIN_THEME_STORAGE_KEY = 'nexusx_admin_theme';

function readStoredAdminTheme(): 'dark' | 'light' {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const value = window.localStorage.getItem(ADMIN_THEME_STORAGE_KEY);
      if (value === 'light' || value === 'dark') {
        return value;
      }
    }
  } catch {
    // Ignore storage access errors in restricted browsers
  }
  return 'dark';
}

function buildFallbackTournamentId(format: TournamentFormat, existingIds: string[]): string {
  const prefix =
    format === 'Solo' ? 'NX-SOLO-' : format === 'Duo' ? 'NX-DUO-' : 'NX-SQUAD-';
  const taken = new Set(existingIds.map((id) => id.trim().toUpperCase()));
  let seq = 1;
  while (taken.has(`${prefix}${String(seq).padStart(3, '0')}`)) {
    seq += 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
}

interface AdminDashboardProps {
  apiUrl?: string;
  username: string;
  repository: string;
  branch: string;
  publishedSnapshot: AdminContentPayload;
  onReload: () => Promise<void>;
  onPublish: (payload: AdminContentPayload, commitMessage: string) => Promise<AdminPublishResponse>;
  onLogout: () => Promise<void>;
  onRequireReauth?: (notice: string) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  apiUrl,
  username,
  repository,
  branch,
  publishedSnapshot,
  onReload,
  onPublish,
  onLogout,
  onRequireReauth,
}) => {
  const [activeTab, setActiveTab] = useState<AdminModuleTab>('overview');
  const [tournamentFilter, setTournamentFilter] = useState<TournamentListFilter>('all');
  const [tournamentFormat, setTournamentFormat] = useState<TournamentFormat | 'all'>('all');
  const [siteSection, setSiteSection] = useState<SiteSettingsSection>('hero');
  const [securityTab, setSecurityTab] = useState<SecurityTab>('account');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [adminTheme, setAdminTheme] = useState<'dark' | 'light'>(() => readStoredAdminTheme());
  const [draftBundle, setDraftBundle] = useState<AdminContentPayload>(() =>
    structuredClone(publishedSnapshot)
  );
  const [reloadBusy, setReloadBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [showReloadConfirm, setShowReloadConfirm] = useState(false);
  const [commitMessage, setCommitMessage] = useState(
    'chore(admin): update NexusX tournament and content data'
  );
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishDetails, setPublishDetails] = useState<string[]>([]);
  const [lastPublishResult, setLastPublishResult] = useState<AdminPublishResponse | null>(null);
  const [privateSheetsConfig, setPrivateSheetsConfig] = useState<PrivateSheetsConfig>({
    schemaVersion: 1,
    updatedAt: '',
    sheetsByTournamentId: {},
  });
  const [privateSheetsError, setPrivateSheetsError] = useState<string | null>(null);
  const [d1SyncMsg, setD1SyncMsg] = useState<string | null>(null);
  const [d1SyncError, setD1SyncError] = useState<string | null>(null);
  const [d1SyncBusy, setD1SyncBusy] = useState(false);

  const handleSyncTournamentsToD1 = async () => {
    if (!apiUrl) return;
    setD1SyncBusy(true);
    setD1SyncMsg(null);
    setD1SyncError(null);
    try {
      let synced = 0;
      for (const t of draftBundle.tournaments.tournaments) {
        await upsertAdminD1Tournament(apiUrl, {
          id: t.id,
          slug: t.slug,
          title: t.title,
          description: t.description,
          format: t.format,
          mode: t.mode,
          map: t.map,
          season: t.season,
          matchFormat: t.matchFormat,
          eligibility: t.eligibility,
          prizePool: t.prizes.totalPrizePool,
          firstPrize: t.prizes.first,
          secondPrize: t.prizes.second,
          thirdPrize: t.prizes.third,
          entryFee: t.prizes.entryFee,
          maxSlots: t.format === 'Solo' ? 100 : t.format === 'Duo' ? 50 : 25,
          regStatus: t.registration.status,
          regOpenDate: t.registration.openingDate ?? '',
          regCloseDate: t.registration.closingDate,
          whatsappUrl: t.registration.whatsappCommunityUrl ?? '',
          matchDate: t.schedule.date,
          reportingTime: t.schedule.reportingTime,
          startTime: t.schedule.startTime,
          timezone: t.schedule.timezone,
          rules: t.rules,
          status: t.status,
          published: t.status !== 'draft',
          featured: t.featured,
          bannerUrl: t.banner,
          externalFormUrl: t.registration.formUrl,
        });
        synced += 1;
      }
      setD1SyncMsg(`Synced ${synced} tournament(s) into live Cloudflare D1 database.`);
    } catch (err) {
      setD1SyncError(err instanceof Error ? err.message : 'Unable to sync tournaments to D1.');
    } finally {
      setD1SyncBusy(false);
    }
  };

  const handleSyncNewsToD1 = async () => {
    if (!apiUrl) return;
    setD1SyncBusy(true);
    setD1SyncMsg(null);
    setD1SyncError(null);
    try {
      for (const item of draftBundle.news.entries) {
        const errors = validateNewsArticle(item);
        if (errors.length > 0) {
          throw new Error(`News "${item.title || item.id}": ${errors[0]}`);
        }
      }
      let synced = 0;
      for (const item of draftBundle.news.entries) {
        await upsertAdminD1News(apiUrl, {
          id: item.id,
          title: item.title,
          description: item.description,
          category: item.category,
          banner: item.banner,
          externalUrl: item.externalUrl ?? '',
          publishedDate: item.publishedDate,
          pinned: item.pinned,
          published: item.published,
          archived: item.archived,
        });
        synced += 1;
      }
      setD1SyncMsg(`Synced ${synced} news article(s) to live Cloudflare D1 & public KV cache.`);
    } catch (err) {
      setD1SyncError(err instanceof Error ? err.message : 'Unable to sync news to D1.');
    } finally {
      setD1SyncBusy(false);
    }
  };

  const handleSyncSettingsToD1 = async () => {
    if (!apiUrl || !draftBundle.siteConfig) return;
    setD1SyncBusy(true);
    setD1SyncMsg(null);
    setD1SyncError(null);
    try {
      const errors = validateSiteConfigForAdmin(draftBundle.siteConfig);
      if (errors.length > 0) {
        throw new Error(errors[0] ?? 'Site settings validation failed.');
      }
      await saveAdminD1Settings(apiUrl, draftBundle.siteConfig);
      setD1SyncMsg('Saved Website Settings to live Cloudflare D1 & public KV cache.');
    } catch (err) {
      setD1SyncError(err instanceof Error ? err.message : 'Unable to sync website settings to D1.');
    } finally {
      setD1SyncBusy(false);
    }
  };

  // Sync draft snapshot cleanly if parent reloaded without local pending edits
  useEffect(() => {
    setDraftBundle(structuredClone(publishedSnapshot));
  }, [publishedSnapshot]);

  const toggleAdminTheme = () => {
    setAdminTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(ADMIN_THEME_STORAGE_KEY, next);
        }
      } catch {
        // Ignore storage access errors in restricted browsers
      }
      return next;
    });
  };

  // Load organizer-private Google Sheet links stored strictly in Worker SECURITY_KV
  useEffect(() => {
    if (!apiUrl) {
      return;
    }
    let active = true;
    setPrivateSheetsError(null);
    fetchPrivateSheetsConfig(apiUrl)
      .then((cfg) => {
        if (active && cfg && cfg.sheetsByTournamentId) {
          setPrivateSheetsConfig(cfg);
        }
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof AdminApiError && err.status === 401) {
          onRequireReauth?.('Your Admin session expired or was revoked. Please sign in again.');
          return;
        }
        setPrivateSheetsError(
          err instanceof Error ? err.message : 'Unable to load private sheet configuration.'
        );
      });
    return () => {
      active = false;
    };
  }, [apiUrl, onRequireReauth]);

  const isLocalSandbox = branch === 'local-sandbox';

  const hasUnsavedChanges = useMemo(
    () => JSON.stringify(draftBundle) !== JSON.stringify(publishedSnapshot),
    [draftBundle, publishedSnapshot]
  );

  const handleGenerateTournamentId = useCallback(
    async (format: TournamentFormat, existingIds: string[]): Promise<string> => {
      if (apiUrl) {
        try {
          const generated = await generateServerTournamentId(apiUrl, format, existingIds);
          if (generated?.id) {
            return generated.id;
          }
        } catch (err) {
          if (err instanceof AdminApiError && err.status === 401) {
            onRequireReauth?.('Your Admin session expired or was revoked. Please sign in again.');
          }
          // Fall back gracefully if offline / Worker unavailable
        }
      }
      return buildFallbackTournamentId(format, existingIds);
    },
    [apiUrl, onRequireReauth]
  );

  const handleSavePrivateSheets = useCallback(
    async (nextMap: Record<string, PrivateSheetEntry>): Promise<PrivateSheetsConfig> => {
      if (!apiUrl) {
        const localConfig: PrivateSheetsConfig = {
          schemaVersion: 1,
          updatedAt: new Date().toISOString(),
          sheetsByTournamentId: nextMap,
        };
        setPrivateSheetsConfig(localConfig);
        return localConfig;
      }
      setPrivateSheetsError(null);
      try {
        const saved = await savePrivateSheetsConfig(apiUrl, nextMap);
        const normalized: PrivateSheetsConfig = {
          schemaVersion: saved.schemaVersion,
          updatedAt: saved.updatedAt,
          sheetsByTournamentId: saved.sheetsByTournamentId,
        };
        setPrivateSheetsConfig(normalized);
        return normalized;
      } catch (err) {
        if (err instanceof AdminApiError && err.status === 401) {
          onRequireReauth?.('Your Admin session expired or was revoked. Please sign in again.');
        }
        throw err;
      }
    },
    [apiUrl, onRequireReauth]
  );

  const validateFullBundle = (): string[] => {
    const errors: string[] = [];
    if (containsSecretMaterial(draftBundle)) {
      errors.push('Content contains forbidden secret token or private key text.');
      return errors;
    }
    if (containsPrivateSheetReference(draftBundle)) {
      errors.push(
        'Public content must not contain Google Sheet URLs or private spreadsheet references. Store organizer Google Sheets only in Registration Management -> Private Organizer Sheet.'
      );
      return errors;
    }

    const ids = draftBundle.tournaments.tournaments.map((t) => t.id.trim());
    const slugs = draftBundle.tournaments.tournaments.map((t) => t.slug.trim());

    draftBundle.tournaments.tournaments.forEach((t, idx) => {
      const otherIds = ids.filter((_, i) => i !== idx);
      const itemErrors = validateTournamentRecord(t, otherIds);
      errors.push(...itemErrors.map((e) => `[${t.id || 'Tournament'}] ${e}`));
      if (slugs.filter((_, i) => i !== idx).includes(t.slug.trim())) {
        errors.push(`[${t.id}] Duplicate tournament slug "${t.slug}".`);
      }
    });

    const resultIds = draftBundle.results.entries.map((r) => r.id.trim());
    draftBundle.results.entries.forEach((r, idx) => {
      errors.push(...validateResultEntry(r).map((e) => `[Result ${r.id}] ${e}`));
      if (resultIds.filter((_, i) => i !== idx).includes(r.id.trim())) {
        errors.push(`[Result ${r.id}] Duplicate result ID.`);
      }
    });

    const newsIds = draftBundle.news.entries.map((n) => n.id.trim());
    draftBundle.news.entries.forEach((n, idx) => {
      errors.push(...validateNewsArticle(n).map((e) => `[News ${n.id}] ${e}`));
      if (newsIds.filter((_, i) => i !== idx).includes(n.id.trim())) {
        errors.push(`[News ${n.id}] Duplicate announcement ID.`);
      }
    });

    if (draftBundle.siteConfig) {
      errors.push(
        ...validateSiteConfigForAdmin(draftBundle.siteConfig).map((e) => `[Site Settings] ${e}`)
      );
    }

    return errors;
  };

  const openPublishFlow = () => {
    setPublishError(null);
    setPublishDetails([]);
    const clientErrors = validateFullBundle();
    if (clientErrors.length > 0) {
      setPublishError('Resolve validation issues before publishing to GitHub:');
      setPublishDetails(clientErrors);
      return;
    }
    setShowPublishModal(true);
  };

  const handleConfirmPublish = async () => {
    setPublishBusy(true);
    setPublishError(null);
    setPublishDetails([]);
    try {
      const result = await onPublish(draftBundle, commitMessage);
      setLastPublishResult(result);
      setShowPublishModal(false);
    } catch (err) {
      setShowPublishModal(false);
      setPublishError(err instanceof Error ? err.message : 'Publishing to GitHub failed.');
      const details = (err as { details?: string[] })?.details;
      if (Array.isArray(details) && details.length > 0) {
        setPublishDetails(details);
      }
    } finally {
      setPublishBusy(false);
    }
  };

  const handleReload = async () => {
    setShowReloadConfirm(false);
    setReloadBusy(true);
    setPublishError(null);
    setPublishDetails([]);
    try {
      await onReload();
    } finally {
      setReloadBusy(false);
    }
  };

  return (
    <div
      data-admin-theme={adminTheme}
      className={`min-h-screen flex flex-col bg-[#060709] text-slate-100 ${
        adminTheme === 'light' ? 'admin-theme-light' : ''
      }`}
    >
      {/* Clean Single-Row Studio Command Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#080A0E]/95 backdrop-blur-md">
        <div className="mx-auto max-w-[1440px] px-4 lg:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0 overflow-hidden">
            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-label={mobileNavOpen ? 'Close Navigation Menu' : 'Open Navigation Menu'}
              aria-expanded={mobileNavOpen}
              className="lg:hidden p-2 rounded-lg border border-white/10 hover:border-[#22C55E] bg-[#0B0E15] text-slate-200 transition-colors cursor-pointer shrink-0"
            >
              {mobileNavOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
            <div className="shrink-0">
              <BrandLogo />
            </div>
            <div
              title={`${repository} (${branch})`}
              className="hidden xl:flex items-center gap-2 border-l border-white/10 pl-3 min-w-0"
            >
              <span className="px-2 py-0.5 rounded-md bg-[#22C55E]/15 border border-[#22C55E]/40 font-mono text-[10px] uppercase tracking-widest text-[#16FF6E] whitespace-nowrap shrink-0">
                Admin Studio
              </span>
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 truncate">
                <GitBranch className="h-3.5 w-3.5 text-[#22C55E] shrink-0" aria-hidden="true" />
                {isLocalSandbox ? 'local-sandbox' : branch}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border font-mono text-[11px] whitespace-nowrap shrink-0 ${
                hasUnsavedChanges
                  ? 'border-amber-500/50 bg-amber-950/40 text-amber-200'
                  : isLocalSandbox
                    ? 'border-amber-500/35 bg-amber-950/30 text-amber-200'
                    : 'border-emerald-500/35 bg-emerald-950/30 text-emerald-300'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  hasUnsavedChanges
                    ? 'bg-amber-400'
                    : isLocalSandbox
                      ? 'bg-amber-300'
                      : 'bg-emerald-400'
                }`}
              />
              {hasUnsavedChanges
                ? 'Pending Changes'
                : isLocalSandbox
                  ? 'Local Sandbox Only'
                  : 'Synced with GitHub'}
            </span>

            <div className="inline-flex items-center rounded-xl border border-slate-800 bg-[#0B0E15] p-1 gap-1 shrink-0">
              <button
                type="button"
                onClick={toggleAdminTheme}
                aria-label={
                  adminTheme === 'dark' ? 'Switch Admin to Light Mode' : 'Switch Admin to Dark Mode'
                }
                title={
                  adminTheme === 'dark' ? 'Switch Admin to Light Mode' : 'Switch Admin to Dark Mode'
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
              >
                {adminTheme === 'dark' ? (
                  <Sun className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
                ) : (
                  <Moon className="h-3.5 w-3.5 text-slate-700" aria-hidden="true" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab((prev) => (prev === 'security' ? 'overview' : 'security'))}
                aria-pressed={activeTab === 'security'}
                aria-label="Security"
                title="Owner Security Vault"
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  activeTab === 'security'
                    ? 'bg-[#22C55E] text-[#050709] font-bold'
                    : 'text-slate-200 hover:bg-white/[0.06]'
                }`}
              >
                <Shield className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden lg:inline">Security</span>
              </button>

              <button
                type="button"
                disabled={reloadBusy}
                aria-label="Reload data"
                title="Reload latest data"
                onClick={() =>
                  hasUnsavedChanges ? setShowReloadConfirm(true) : void handleReload()
                }
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] text-xs font-medium text-slate-200 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${reloadBusy ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </button>

              <Link
                to="/"
                title="View Public Website"
                className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-white/[0.06] text-xs font-medium text-slate-300 hover:text-white transition-colors whitespace-nowrap"
              >
                <span>Site</span>
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>

            <button
              type="button"
              onClick={openPublishFlow}
              className="nx-btn-neon inline-flex items-center gap-1.5 px-4 py-2 text-xs cursor-pointer whitespace-nowrap shrink-0"
            >
              <UploadCloud className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{isLocalSandbox ? 'Save Local Sandbox' : 'Publish Updates'}</span>
            </button>

            <button
              type="button"
              onClick={() => void onLogout()}
              title={`Sign Out (${username})`}
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 hover:border-red-500/70 bg-[#0B0E15] text-xs font-medium text-slate-300 hover:text-white transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      {/* Pro Two-Column Studio Workspace */}
      <div className="mx-auto w-full max-w-[1440px] px-4 lg:px-6 py-6 flex-1 flex flex-col lg:flex-row gap-6 items-start">
        <aside
          className={`${
            mobileNavOpen ? 'block' : 'hidden'
          } lg:block w-full lg:w-[272px] shrink-0 lg:sticky lg:top-22`}
        >
          <AdminSidebarNav
            username={username}
            activeTab={activeTab}
            tournamentFilter={tournamentFilter}
            tournamentFormat={tournamentFormat}
            siteSection={siteSection}
            securityTab={securityTab}
            hasSiteConfig={Boolean(draftBundle.siteConfig)}
            counts={{
              tournaments: draftBundle.tournaments.tournaments.length,
              drafts: draftBundle.tournaments.tournaments.filter((t) => t.status === 'draft').length,
              openReg: draftBundle.tournaments.tournaments.filter(
                (t) => t.status !== 'draft' && t.status !== 'archived' && t.registration.status === 'open'
              ).length,
              results: draftBundle.results.entries.length,
              news: draftBundle.news.entries.length,
            }}
            onSelectTab={(tab) => {
              setActiveTab(tab);
              setMobileNavOpen(false);
            }}
            onSelectOverview={() => {
              setActiveTab('overview');
              setMobileNavOpen(false);
            }}
            onSelectTournaments={(filter, format) => {
              setTournamentFilter(filter);
              setTournamentFormat(format);
              setActiveTab('tournaments');
              setMobileNavOpen(false);
            }}
            onSelectRegistration={() => {
              setActiveTab('registration');
              setMobileNavOpen(false);
            }}
            onSelectResults={() => {
              setActiveTab('results');
              setMobileNavOpen(false);
            }}
            onSelectNews={() => {
              setActiveTab('news');
              setMobileNavOpen(false);
            }}
            onSelectSiteSettings={(section) => {
              setSiteSection(section);
              setActiveTab('site-settings');
              setMobileNavOpen(false);
            }}
            onSelectSecurity={(secTab) => {
              setSecurityTab(secTab);
              setActiveTab('security');
              setMobileNavOpen(false);
            }}
            onLogout={onLogout}
          />
        </aside>

        {/* Active Module Content Area */}
        <section className="flex-1 min-w-0 w-full space-y-5">
          {isLocalSandbox && (
            <div
              role="note"
              className="rounded-xl border border-amber-500/35 bg-amber-950/25 px-4 py-3 text-xs text-amber-200 leading-relaxed"
            >
              <strong className="font-mono uppercase text-amber-200 mr-2">
                Development Sandbox Active:
              </strong>
              Changes saved here remain temporarily in local Worker memory only and are{' '}
              <strong>never committed or pushed to GitHub</strong>. Configure production GitHub App
              secrets to enable permanent GitHub publishing.
            </div>
          )}

          {publishError && (
            <div
              role="alert"
              className="rounded-xl border border-red-500/60 bg-red-950/40 p-4 space-y-2 text-xs text-red-200"
            >
              <div className="flex items-center gap-2 font-mono uppercase font-bold">
                <AlertCircle className="h-4 w-4 text-[#E11D2E]" aria-hidden="true" />
                <span>{publishError}</span>
              </div>
              {publishDetails.length > 0 && (
                <ul className="list-disc pl-5 space-y-0.5">
                  {publishDetails.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {lastPublishResult && !hasUnsavedChanges && (
            <div
              role="status"
              className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-emerald-200"
            >
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
                <div>
                  <strong className="font-mono uppercase text-white block">
                    {lastPublishResult.branch === 'local-sandbox'
                      ? 'Saved to Local Worker Sandbox (dev only)'
                      : `Published to GitHub (${lastPublishResult.branch})`}
                  </strong>
                  <span>
                    {lastPublishResult.branch === 'local-sandbox' ? (
                      <>
                        Updated {lastPublishResult.updatedFiles.length} JSON payloads in local
                        Worker memory. Configure GitHub App secrets in production to commit to GitHub.
                      </>
                    ) : (
                      <>
                        Commit <code>{lastPublishResult.commitSha.slice(0, 7)}</code> updated{' '}
                        {lastPublishResult.updatedFiles.length} JSON files and triggered GitHub
                        Pages redeployment.
                      </>
                    )}
                  </span>
                </div>
              </div>
              {lastPublishResult.commitUrl && (
                <a
                  href={lastPublishResult.commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-emerald-500/50 hover:border-white font-mono uppercase text-white shrink-0"
                >
                  View Commit
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>
          )}

          {activeTab === 'overview' && (
            <AdminCommandOverview
              apiUrl={apiUrl ?? ''}
              username={username}
              isLocalSandbox={isLocalSandbox}
              bundle={draftBundle}
              privateSheets={privateSheetsConfig.sheetsByTournamentId}
              onNavigateTab={(tab) => setActiveTab(tab)}
              onJumpTournaments={(filter, format) => {
                setTournamentFilter(filter);
                setTournamentFormat(format);
                setActiveTab('tournaments');
              }}
              onJumpSiteSettings={(section) => {
                setSiteSection(section);
                setActiveTab('site-settings');
              }}
              onJumpSecurity={(secTab) => {
                setSecurityTab(secTab);
                setActiveTab('security');
              }}
            />
          )}

          {activeTab === 'cms' && (
            <WebsiteCmsModule
              apiUrl={apiUrl ?? ''}
              onJumpModule={(tab) => setActiveTab(tab)}
              onSitePublished={onReload}
            />
          )}

          {activeTab === 'security' && (
            <SecuritySettingsPanel
              apiUrl={apiUrl ?? ''}
              currentUsername={username}
              activeTab={securityTab}
              onTabChange={setSecurityTab}
              onRequireReauth={onRequireReauth ?? (() => void onLogout())}
              onClose={() => setActiveTab('overview')}
            />
          )}

          {activeTab === 'tournaments' && (
            <div className="space-y-4">
              {apiUrl && (
                <div className="nx-glass rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-300">
                    <strong className="font-mono uppercase text-[#22C55E] mr-2">Live D1 Sync:</strong>
                    Push tournament events directly into Cloudflare D1 for instant public registration slots.
                    {d1SyncMsg && <span className="ml-2 text-[#16FF6E]">{d1SyncMsg}</span>}
                    {d1SyncError && <span className="ml-2 text-red-400">{d1SyncError}</span>}
                  </div>
                  <button
                    type="button"
                    disabled={d1SyncBusy}
                    onClick={() => void handleSyncTournamentsToD1()}
                    className="rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/15 hover:bg-[#22C55E] hover:text-[#050709] px-3 py-1.5 font-mono text-[11px] font-bold uppercase text-[#16FF6E] transition-colors cursor-pointer"
                  >
                    {d1SyncBusy ? 'Syncing D1...' : 'Sync All to Live D1'}
                  </button>
                </div>
              )}
              <TournamentModule
                tournaments={draftBundle.tournaments}
                onChange={(tournaments) => setDraftBundle((prev) => ({ ...prev, tournaments }))}
                onGenerateId={handleGenerateTournamentId}
                activeFilter={tournamentFilter}
                activeFormat={tournamentFormat}
                onFilterChange={setTournamentFilter}
                onFormatChange={setTournamentFormat}
              />
            </div>
          )}

          {activeTab === 'registration' && (
            <div className="space-y-6">
              <RegistrationModule
                tournaments={draftBundle.tournaments}
                onChange={(tournaments) => setDraftBundle((prev) => ({ ...prev, tournaments }))}
                privateSheets={privateSheetsConfig.sheetsByTournamentId}
                privateSheetsUpdatedAt={privateSheetsConfig.updatedAt}
                privateSheetsError={privateSheetsError}
                onSavePrivateSheets={handleSavePrivateSheets}
              />
              {apiUrl && <AdminD1RegistrationsQueue apiUrl={apiUrl} />}
            </div>
          )}

          {activeTab === 'teams' && <AdminTeamsModule apiUrl={apiUrl ?? ''} />}
          {activeTab === 'players' && <AdminPlayersModule apiUrl={apiUrl ?? ''} />}
          {activeTab === 'matches' && <AdminMatchesModule apiUrl={apiUrl ?? ''} />}

          {activeTab === 'results' && (
            <div className="space-y-6">
              <ResultsModule
                results={draftBundle.results}
                tournaments={draftBundle.tournaments}
                onChange={(results) => setDraftBundle((prev) => ({ ...prev, results }))}
              />
              {apiUrl && <AdminD1MatchScoringBox apiUrl={apiUrl} />}
            </div>
          )}

          {activeTab === 'leaderboard' && <AdminLeaderboardModule apiUrl={apiUrl ?? ''} />}

          {activeTab === 'news' && (
            <div className="space-y-4">
              {apiUrl && (
                <div className="nx-glass rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-300">
                    <strong className="font-mono uppercase text-[#22C55E] mr-2">Live D1 Sync:</strong>
                    Publish validated news & announcements directly to Cloudflare D1 and KV cache.
                    {d1SyncMsg && <span className="ml-2 text-[#16FF6E]">{d1SyncMsg}</span>}
                    {d1SyncError && <span className="ml-2 text-red-400">{d1SyncError}</span>}
                  </div>
                  <button
                    type="button"
                    disabled={d1SyncBusy}
                    onClick={() => void handleSyncNewsToD1()}
                    className="rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/15 hover:bg-[#22C55E] hover:text-[#050709] px-3 py-1.5 font-mono text-[11px] font-bold uppercase text-[#16FF6E] transition-colors cursor-pointer"
                  >
                    {d1SyncBusy ? 'Syncing News...' : 'Sync News to Live D1'}
                  </button>
                </div>
              )}
              <NewsModule
                news={draftBundle.news}
                onChange={(news) => setDraftBundle((prev) => ({ ...prev, news }))}
              />
            </div>
          )}

          {activeTab === 'reports' && <AdminReportsModule apiUrl={apiUrl ?? ''} />}
          {activeTab === 'users' && <AdminUsersModule apiUrl={apiUrl ?? ''} />}
          {activeTab === 'roles' && <AdminRolesModule apiUrl={apiUrl ?? ''} />}
          {activeTab === 'logs' && <AdminActivityLogsModule apiUrl={apiUrl ?? ''} />}

          {activeTab === 'site-settings' && draftBundle.siteConfig && (
            <div className="space-y-4">
              {apiUrl && (
                <div className="nx-glass rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-xs text-slate-300">
                    <strong className="font-mono uppercase text-[#22C55E] mr-2">Live D1 Sync:</strong>
                    Save branding, social links, and contact settings directly into Cloudflare D1 & KV cache.
                    {d1SyncMsg && <span className="ml-2 text-[#16FF6E]">{d1SyncMsg}</span>}
                    {d1SyncError && <span className="ml-2 text-red-400">{d1SyncError}</span>}
                  </div>
                  <button
                    type="button"
                    disabled={d1SyncBusy}
                    onClick={() => void handleSyncSettingsToD1()}
                    className="rounded-lg border border-[#22C55E]/40 bg-[#22C55E]/15 hover:bg-[#22C55E] hover:text-[#050709] px-3 py-1.5 font-mono text-[11px] font-bold uppercase text-[#16FF6E] transition-colors cursor-pointer"
                  >
                    {d1SyncBusy ? 'Saving Settings...' : 'Save Settings to Live D1'}
                  </button>
                </div>
              )}
              <SiteSettingsModule
                siteConfig={draftBundle.siteConfig}
                activeSection={siteSection}
                onSectionChange={setSiteSection}
                onChange={(siteConfig) => setDraftBundle((prev) => ({ ...prev, siteConfig }))}
              />
            </div>
          )}
        </section>
      </div>

      {/* Confirm GitHub Publish / Local Sandbox Modal */}
      <ConfirmModal
        open={showPublishModal}
        busy={publishBusy}
        title={isLocalSandbox ? 'Save Updates to Local Sandbox' : 'Publish Updates to GitHub'}
        description={
          isLocalSandbox
            ? 'This saves validated JSON payloads into temporary local Worker memory only. Nothing is committed or pushed to GitHub.'
            : `This creates a single verified commit on "${repository}" (${branch}) updating only permitted content files, then GitHub Actions redeploys the static public site.`
        }
        confirmLabel={
          isLocalSandbox ? 'Confirm Temporary Local Save' : 'Confirm & Commit to GitHub'
        }
        onCancel={() => setShowPublishModal(false)}
        onConfirm={() => void handleConfirmPublish()}
      >
        <div className="space-y-3">
          <div className="border border-slate-800 bg-[#080A0E] p-3 font-mono text-[11px] text-slate-300 space-y-1">
            <div className="text-slate-400 uppercase text-[10px]">Permitted Write Scope</div>
            <div>• public/data/tournaments.json</div>
            <div>• public/data/results.json</div>
            <div>• public/data/news.json</div>
            {draftBundle.siteConfig && <div>• public/data/site-config.json</div>}
          </div>

          <div>
            <label
              htmlFor="publish-commit-msg"
              className="block font-mono text-[11px] uppercase tracking-wider text-slate-300 mb-1"
            >
              Commit Message
            </label>
            <input
              id="publish-commit-msg"
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              className="w-full bg-[#060709] border border-slate-700 focus:border-[#E11D2E] focus:outline-none px-3 py-2 text-xs font-mono text-white"
            />
          </div>
        </div>
      </ConfirmModal>

      {/* Confirm Discard Local Edits on Reload */}
      <ConfirmModal
        open={showReloadConfirm}
        busy={reloadBusy}
        variant="danger"
        title="Discard Pending Changes?"
        description="Reloading from GitHub will overwrite your unpublished local changes across tournaments, registrations, results, and news."
        confirmLabel="Discard & Reload"
        onCancel={() => setShowReloadConfirm(false)}
        onConfirm={() => void handleReload()}
      />
    </div>
  );
};
