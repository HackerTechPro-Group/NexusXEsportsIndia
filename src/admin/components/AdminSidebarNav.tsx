import React, { useState } from 'react';
import {
  Activity,
  Award,
  BarChart3,
  Calendar,
  ChevronDown,
  ClipboardList,
  Globe2,
  LayoutDashboard,
  Lock,
  LogOut,
  Newspaper,
  Shield,
  ShieldCheck,
  Sparkles,
  Swords,
  Trophy,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';
import type { TournamentFormat } from '../../types/data';
import type { SiteSettingsSection } from '../modules/SiteSettingsModule';
import type { TournamentListFilter } from '../modules/TournamentModule';
import type { AdminModuleTab } from '../types';
import type { SecurityTab } from './SecuritySettingsPanel';

interface AdminSidebarNavProps {
  username: string;
  activeTab: AdminModuleTab;
  tournamentFilter: TournamentListFilter;
  tournamentFormat: TournamentFormat | 'all';
  siteSection: SiteSettingsSection;
  securityTab: SecurityTab;
  hasSiteConfig: boolean;
  counts: {
    tournaments: number;
    drafts: number;
    openReg: number;
    results: number;
    news: number;
  };
  onSelectTab: (tab: AdminModuleTab) => void;
  onSelectOverview: () => void;
  onSelectTournaments: (filter: TournamentListFilter, format: TournamentFormat | 'all') => void;
  onSelectRegistration: () => void;
  onSelectResults: () => void;
  onSelectNews: () => void;
  onSelectSiteSettings: (section: SiteSettingsSection) => void;
  onSelectSecurity: (secTab: SecurityTab) => void;
  onLogout: () => Promise<void>;
}

export const AdminSidebarNav: React.FC<AdminSidebarNavProps> = ({
  username,
  activeTab,
  tournamentFilter,
  tournamentFormat,
  siteSection,
  securityTab,
  hasSiteConfig,
  counts,
  onSelectTab,
  onSelectOverview,
  onSelectTournaments,
  onSelectRegistration,
  onSelectResults,
  onSelectNews,
  onSelectSiteSettings,
  onSelectSecurity,
  onLogout,
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    tournaments: true,
    siteSettings: false,
    security: false,
  });

  const toggleGroup = (key: string) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const mainBtnClass = (isActive: boolean) =>
    `group w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-[13px] font-medium transition-all duration-150 cursor-pointer ${
      isActive
        ? 'bg-[#22C55E] text-[#050709] font-bold shadow-[0_0_18px_rgba(34,197,94,0.3)]'
        : 'text-slate-300 hover:text-white hover:bg-white/[0.06] hover:translate-x-0.5'
    }`;

  const subBtnClass = (isActive: boolean) =>
    `w-full flex items-center justify-between pl-8 pr-3 py-1.5 rounded-lg text-left text-xs transition-all duration-150 cursor-pointer ${
      isActive
        ? 'bg-[#22C55E]/15 text-[#16FF6E] font-semibold border border-[#22C55E]/35'
        : 'text-slate-400 hover:text-white hover:bg-white/[0.05] hover:pl-9 border border-transparent'
    }`;

  const avatarLetter = (username.trim()[0] || 'O').toUpperCase();

  return (
    <nav
      aria-label="Admin Management Modules"
      className="nx-glass rounded-2xl p-3.5 space-y-4 shadow-[0_14px_40px_rgba(0,0,0,0.55)]"
    >
      {/* Core Operations */}
      <div className="space-y-1">
        <div className="px-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
          BGMI Operations
        </div>

        <button
          type="button"
          onClick={onSelectOverview}
          className={mainBtnClass(activeTab === 'overview')}
        >
          <span className="flex items-center gap-2.5">
            <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Overview</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('cms')}
          className={mainBtnClass(activeTab === 'cms')}
        >
          <span className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Website Content Manager</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded-md font-mono text-[9px] font-bold uppercase ${
              activeTab === 'cms'
                ? 'bg-black/25 text-[#050709]'
                : 'bg-[#22C55E]/20 text-[#16FF6E]'
            }`}
          >
            CMS
          </span>
        </button>

        {/* Tournaments + Submenu */}
        <div className="space-y-1">
          <button
            type="button"
            aria-expanded={expanded.tournaments || activeTab === 'tournaments'}
            onClick={() => {
              if (activeTab === 'tournaments') {
                toggleGroup('tournaments');
              } else {
                setExpanded((prev) => ({ ...prev, tournaments: true }));
                onSelectTournaments('all', 'all');
              }
            }}
            className={mainBtnClass(activeTab === 'tournaments')}
          >
            <span className="flex items-center gap-2.5">
              <Swords className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Tournaments</span>
            </span>
            <span className="flex items-center gap-1.5 shrink-0">
              <span
                className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold ${
                  activeTab === 'tournaments'
                    ? 'bg-black/25 text-[#050709]'
                    : 'bg-white/10 text-slate-300'
                }`}
              >
                {counts.tournaments}
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform duration-200 ${
                  expanded.tournaments || activeTab === 'tournaments' ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </span>
          </button>

          {(expanded.tournaments || activeTab === 'tournaments') && (
            <div className="space-y-0.5 pl-1">
              <button
                type="button"
                onClick={() => onSelectTournaments('all', 'all')}
                className={subBtnClass(
                  activeTab === 'tournaments' &&
                    tournamentFilter === 'all' &&
                    tournamentFormat === 'all'
                )}
              >
                <span>All Events</span>
                <span className="font-mono text-[10px] opacity-75">{counts.tournaments}</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectTournaments('all', 'Solo')}
                className={subBtnClass(
                  activeTab === 'tournaments' && tournamentFormat === 'Solo'
                )}
              >
                <span>Solo Mode</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectTournaments('all', 'Duo')}
                className={subBtnClass(
                  activeTab === 'tournaments' && tournamentFormat === 'Duo'
                )}
              >
                <span>Duo Mode</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectTournaments('all', 'Squad')}
                className={subBtnClass(
                  activeTab === 'tournaments' && tournamentFormat === 'Squad'
                )}
              >
                <span>Squad Mode</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectTournaments('draft', 'all')}
                className={subBtnClass(
                  activeTab === 'tournaments' && tournamentFilter === 'draft'
                )}
              >
                <span>Drafts</span>
                <span className="font-mono text-[10px] opacity-75">{counts.drafts}</span>
              </button>
            </div>
          )}
        </div>

        {/* Registrations */}
        <button
          type="button"
          onClick={onSelectRegistration}
          className={mainBtnClass(activeTab === 'registration')}
        >
          <span className="flex items-center gap-2.5">
            <ClipboardList className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Registrations</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold shrink-0 ${
              activeTab === 'registration'
                ? 'bg-black/25 text-[#050709]'
                : 'bg-[#22C55E]/15 text-[#16FF6E] border border-[#22C55E]/30'
            }`}
          >
            {counts.openReg} Open
          </span>
        </button>

        {/* Teams */}
        <button
          type="button"
          onClick={() => onSelectTab('teams')}
          className={mainBtnClass(activeTab === 'teams')}
        >
          <span className="flex items-center gap-2.5">
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Teams</span>
          </span>
        </button>

        {/* Players */}
        <button
          type="button"
          onClick={() => onSelectTab('players')}
          className={mainBtnClass(activeTab === 'players')}
        >
          <span className="flex items-center gap-2.5">
            <UserCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Players</span>
          </span>
        </button>

        {/* Matches */}
        <button
          type="button"
          onClick={() => onSelectTab('matches')}
          className={mainBtnClass(activeTab === 'matches')}
        >
          <span className="flex items-center gap-2.5">
            <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Matches</span>
          </span>
        </button>

        {/* Results */}
        <button
          type="button"
          onClick={onSelectResults}
          className={mainBtnClass(activeTab === 'results')}
        >
          <span className="flex items-center gap-2.5">
            <Trophy className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Results</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold shrink-0 ${
              activeTab === 'results' ? 'bg-black/25 text-[#050709]' : 'bg-white/10 text-slate-300'
            }`}
          >
            {counts.results}
          </span>
        </button>

        {/* Leaderboard */}
        <button
          type="button"
          onClick={() => onSelectTab('leaderboard')}
          className={mainBtnClass(activeTab === 'leaderboard')}
        >
          <span className="flex items-center gap-2.5">
            <Award className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Leaderboard</span>
          </span>
        </button>

        {/* News */}
        <button
          type="button"
          onClick={onSelectNews}
          className={mainBtnClass(activeTab === 'news')}
        >
          <span className="flex items-center gap-2.5">
            <Newspaper className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>News &amp; Updates</span>
          </span>
          <span
            className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold shrink-0 ${
              activeTab === 'news' ? 'bg-black/25 text-[#050709]' : 'bg-white/10 text-slate-300'
            }`}
          >
            {counts.news}
          </span>
        </button>
      </div>

      {/* Analytics, Users, Settings & Governance */}
      <div className="pt-3 border-t border-white/[0.08] space-y-1">
        <div className="px-2.5 pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
          Governance &amp; Analytics
        </div>

        <button
          type="button"
          onClick={() => onSelectTab('reports')}
          className={mainBtnClass(activeTab === 'reports')}
        >
          <span className="flex items-center gap-2.5">
            <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Reports &amp; Analytics</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('users')}
          className={mainBtnClass(activeTab === 'users')}
        >
          <span className="flex items-center gap-2.5">
            <UserCog className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>User Management</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('roles')}
          className={mainBtnClass(activeTab === 'roles')}
        >
          <span className="flex items-center gap-2.5">
            <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Roles &amp; Permissions</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('logs')}
          className={mainBtnClass(activeTab === 'logs')}
        >
          <span className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Activity Logs</span>
          </span>
        </button>

        {hasSiteConfig && (
          <>
            <button
              type="button"
              aria-expanded={expanded.siteSettings || activeTab === 'site-settings'}
              onClick={() => {
                if (activeTab === 'site-settings') {
                  toggleGroup('siteSettings');
                } else {
                  setExpanded((prev) => ({ ...prev, siteSettings: true }));
                  onSelectSiteSettings('hero');
                }
              }}
              className={mainBtnClass(activeTab === 'site-settings')}
            >
              <span className="flex items-center gap-2.5">
                <Globe2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Site Settings</span>
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                  expanded.siteSettings || activeTab === 'site-settings' ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {(expanded.siteSettings || activeTab === 'site-settings') && (
              <div className="space-y-0.5 pl-1">
                {(
                  [
                    ['hero', 'Hero & Ticker'],
                    ['social', 'WhatsApp & Socials'],
                    ['about', 'About & Why Join'],
                    ['terms', 'Terms & Rules'],
                  ] as Array<[SiteSettingsSection, string]>
                ).map(([secKey, label]) => (
                  <button
                    key={secKey}
                    type="button"
                    onClick={() => onSelectSiteSettings(secKey)}
                    className={subBtnClass(
                      activeTab === 'site-settings' && siteSection === secKey
                    )}
                  >
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        {/* Security Vault */}
        <button
          type="button"
          aria-expanded={expanded.security || activeTab === 'security'}
          onClick={() => {
            if (activeTab === 'security') {
              toggleGroup('security');
            } else {
              setExpanded((prev) => ({ ...prev, security: true }));
              onSelectSecurity('account');
            }
          }}
          className={mainBtnClass(activeTab === 'security')}
        >
          <span className="flex items-center gap-2.5">
            <Shield className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Security Vault</span>
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
              expanded.security || activeTab === 'security' ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>

        {(expanded.security || activeTab === 'security') && (
          <div className="space-y-0.5 pl-1">
            {(
              [
                ['account', 'Admin ID & Password'],
                ['sessions', 'Active Sessions'],
                ['activity', 'Security Activity'],
              ] as Array<[SecurityTab, string]>
            ).map(([secKey, label]) => (
              <button
                key={secKey}
                type="button"
                onClick={() => onSelectSecurity(secKey)}
                className={subBtnClass(activeTab === 'security' && securityTab === secKey)}
              >
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Signed-In Staff / Owner Card + Logout */}
      <div className="pt-3 border-t border-white/[0.08]">
        <div className="rounded-xl border border-white/[0.08] bg-[#050709] p-2.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-[#22C55E]/15 border border-[#22C55E]/40 text-[#16FF6E] font-display font-bold text-sm flex items-center justify-center shrink-0">
              {avatarLetter}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white truncate" title={username}>
                {username}
              </div>
              <div className="flex items-center gap-1 font-mono text-[10px] text-[#22C55E]">
                <Lock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                <span>Authenticated</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void onLogout()}
            title="Logout"
            aria-label={`Logout ${username}`}
            className="p-2 rounded-lg border border-white/10 hover:border-red-500/60 hover:bg-red-500/10 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </nav>
  );
};
