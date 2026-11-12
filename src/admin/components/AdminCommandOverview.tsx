import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Calendar,
  ClipboardList,
  Plus,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  UserCheck,
  Users,
} from 'lucide-react';
import type { TournamentFormat } from '../../types/data';
import type { AdminContentPayload, AdminModuleTab, PrivateSheetEntry } from '../types';
import type { SiteSettingsSection } from '../modules/SiteSettingsModule';
import type { TournamentListFilter } from '../modules/TournamentModule';
import type { SecurityTab } from './SecuritySettingsPanel';
import { fetchAdminOverview, type AdminOverviewData } from '../api/adminD1Client';

interface AdminCommandOverviewProps {
  apiUrl: string;
  username: string;
  isLocalSandbox: boolean;
  bundle: AdminContentPayload;
  privateSheets: Record<string, PrivateSheetEntry>;
  onNavigateTab: (tab: AdminModuleTab) => void;
  onJumpTournaments: (filter: TournamentListFilter, format: TournamentFormat | 'all') => void;
  onJumpSiteSettings: (section: SiteSettingsSection) => void;
  onJumpSecurity: (secTab: SecurityTab) => void;
}

export const AdminCommandOverview: React.FC<AdminCommandOverviewProps> = ({
  apiUrl,
  username,
  isLocalSandbox,
  bundle,
  onNavigateTab,
  onJumpTournaments,
  onJumpSecurity,
}) => {
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);

  useEffect(() => {
    if (!apiUrl) return;
    let active = true;
    void fetchAdminOverview(apiUrl)
      .then((res) => {
        if (active) setOverview(res);
      })
      .catch(() => {
        // Worker DB optional in pure GitHub/sandbox test mode
      });
    return () => {
      active = false;
    };
  }, [apiUrl]);

  const tournaments = bundle.tournaments.tournaments;
  const activeCount = tournaments.filter(
    (t) => t.status !== 'draft' && t.status !== 'archived'
  ).length;

  const dbConnected = Boolean(overview?.databaseConnected);
  const totalTournaments = dbConnected
    ? overview!.metrics.totalTournaments
    : tournaments.length;
  const activeTournaments = dbConnected ? overview!.metrics.activeTournaments : activeCount;
  const registeredPlayers = dbConnected ? overview!.metrics.registeredPlayers : 0;
  const registeredTeams = dbConnected ? overview!.metrics.registeredTeams : 0;
  const pendingRegistrations = dbConnected ? overview!.metrics.pendingRegistrations : 0;
  const upcomingMatches = dbConnected ? overview!.metrics.upcomingMatches : 0;
  const completedMatches = dbConnected ? overview!.metrics.completedMatches : 0;

  const stats = [
    {
      label: 'Total Tournaments',
      value: totalTournaments,
      sub: `${activeTournaments} Active`,
      icon: Swords,
      accent: 'text-[#16FF6E]',
      iconBg: 'bg-[#22C55E]/15 border-[#22C55E]/30',
      onClick: () => onJumpTournaments('all', 'all'),
    },
    {
      label: 'Registered Players',
      value: registeredPlayers,
      sub: dbConnected ? 'Verified D1 Accounts' : 'D1 Sync Standby',
      icon: UserCheck,
      accent: 'text-sky-300',
      iconBg: 'bg-sky-500/15 border-sky-500/30',
      onClick: () => onNavigateTab('players'),
    },
    {
      label: 'Verified Teams',
      value: registeredTeams,
      sub: `${pendingRegistrations} Pending Review`,
      icon: Users,
      accent: 'text-purple-300',
      iconBg: 'bg-purple-500/15 border-purple-500/30',
      onClick: () => onNavigateTab('teams'),
    },
    {
      label: 'Scheduled Matches',
      value: upcomingMatches + completedMatches,
      sub: `${upcomingMatches} Upcoming • ${completedMatches} Done`,
      icon: Calendar,
      accent: 'text-amber-300',
      iconBg: 'bg-amber-500/15 border-amber-500/30',
      onClick: () => onNavigateTab('matches'),
    },
  ];

  // Build real SVG chart points from registrationTrend (no fake synthetic series)
  const trend = overview?.registrationTrend ?? [];
  const maxTrend = Math.max(1, ...trend.map((t) => t.count));
  const chartPoints =
    trend.length >= 2
      ? trend
          .map((pt, idx) => {
            const x = (idx / (trend.length - 1)) * 560 + 20;
            const y = 135 - (pt.count / maxTrend) * 105;
            return `${x},${y}`;
          })
          .join(' ')
      : '';

  const quickActions = [
    {
      title: 'Add BGMI Tournament',
      desc: 'Create or edit Solo, Duo, or Squad events and sync live.',
      cta: 'Open Tournaments',
      icon: Plus,
      onClick: () => onJumpTournaments('all', 'all'),
    },
    {
      title: 'Review Registrations',
      desc: 'Approve, waitlist, or reject competitor slot entries.',
      cta: 'Manage Registrations',
      icon: ClipboardList,
      onClick: () => onNavigateTab('registration'),
    },
    {
      title: 'Manage Teams & Players',
      desc: 'Verify BGMI Character IDs and squad rosters.',
      cta: 'Open Teams',
      icon: Users,
      onClick: () => onNavigateTab('teams'),
    },
    {
      title: 'Score Matches & Rankings',
      desc: 'Record BGMI placement + kills & recalculate leaderboard.',
      cta: 'Manage Results',
      icon: Trophy,
      onClick: () => onNavigateTab('results'),
    },
    {
      title: 'View Analytics & Logs',
      desc: 'Inspect conversion reports and audit trails.',
      cta: 'Open Reports',
      icon: Activity,
      onClick: () => onNavigateTab('reports'),
    },
    {
      title: 'Owner Security Vault',
      desc: 'Rotate passwords, review active sessions & staff roles.',
      cta: 'Open Security',
      icon: Shield,
      onClick: () => onJumpSecurity('account'),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Studio Header Banner */}
      <div className="nx-glass rounded-2xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-[#22C55E]/[0.12] blur-3xl"
        />

        <div className="space-y-1.5 relative">
          <div className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-[#22C55E]">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            NexusX Command Center • {dbConnected ? 'D1 Live Database Connected' : isLocalSandbox ? 'Local Dev Sandbox' : 'GitHub Connected'}
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white uppercase tracking-tight">
            Command Overview
          </h2>
          <p className="text-sm text-slate-400">
            Welcome back, <span className="text-slate-100 font-semibold">{username}</span>
            {overview?.actorRole ? ` (${overview.actorRole})` : ''}. Real BGMI tournament telemetry from your backend.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 relative">
          {(['Solo', 'Duo', 'Squad'] as const).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => onJumpTournaments('all', fmt)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-white/10 hover:border-[#22C55E]/70 bg-[#050709] text-xs font-medium text-slate-200 hover:text-white transition-all cursor-pointer"
            >
              <span>{fmt}</span>
              <span className="px-1.5 py-0.5 rounded-md bg-white/10 font-mono text-[10px] text-[#16FF6E]">
                {tournaments.filter((t) => t.format === fmt).length}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Real Database KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              className="group nx-glass nx-glass-hover text-left rounded-2xl p-5 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400 group-hover:text-slate-200 transition-colors">
                  {item.label}
                </span>
                <span className={`p-2 rounded-xl border ${item.iconBg}`}>
                  <Icon className={`h-4 w-4 ${item.accent}`} aria-hidden="true" />
                </span>
              </div>
              <div className="mt-3 font-display text-3xl font-bold text-white">{item.value}</div>
              <div className="mt-1 font-mono text-[11px] text-slate-400">{item.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Real-Time Overview Chart + Recent Activity & Registrations */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 nx-glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-[#22C55E]">
                Real-Time Registration Trend
              </div>
              <h3 className="font-display text-lg font-bold text-white uppercase">
                Database Activity Chart
              </h3>
            </div>
            <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#16FF6E]">
              <span className="h-2 w-2 rounded-full bg-[#22C55E]" />
              {dbConnected ? 'D1 Live' : 'Offline'}
            </span>
          </div>

          {trend.length >= 2 ? (
            <div className="rounded-xl bg-[#050709] border border-white/10 p-4">
              <svg viewBox="0 0 600 160" className="w-full h-40 overflow-visible">
                <defs>
                  <linearGradient id="nxTrendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22C55E" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#22C55E" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <line x1="20" y1="135" x2="580" y2="135" stroke="rgba(255,255,255,0.08)" />
                <line x1="20" y1="80" x2="580" y2="80" stroke="rgba(255,255,255,0.05)" />
                <line x1="20" y1="30" x2="580" y2="30" stroke="rgba(255,255,255,0.05)" />
                <polyline
                  fill="none"
                  stroke="#22C55E"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={chartPoints}
                />
                {trend.map((pt, idx) => {
                  const x = (idx / (trend.length - 1)) * 560 + 20;
                  const y = 135 - (pt.count / maxTrend) * 105;
                  return (
                    <g key={pt.day}>
                      <circle cx={x} cy={y} r="4.5" fill="#16FF6E" stroke="#050709" strokeWidth="2" />
                      <text
                        x={x}
                        y="153"
                        textAnchor="middle"
                        className="fill-slate-500 text-[9px] font-mono"
                      >
                        {pt.day.slice(5)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="rounded-xl bg-[#050709] border border-white/10 p-8 text-center text-xs text-slate-400">
              {dbConnected
                ? 'Not enough dated D1 registration rows yet to plot a multi-day trend. Chart updates automatically as players register.'
                : 'Connect Cloudflare D1 binding in production/dev to stream daily tournament registration charts.'}
            </div>
          )}
        </div>

        <div className="lg:col-span-5 nx-glass rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-white uppercase">
              Recent Registrations
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('registration')}
              className="font-mono text-[11px] text-[#22C55E] hover:underline cursor-pointer"
            >
              View All →
            </button>
          </div>

          {overview?.recentRegistrations && overview.recentRegistrations.length > 0 ? (
            <div className="space-y-2.5">
              {overview.recentRegistrations.slice(0, 4).map((reg) => (
                <div
                  key={reg.id}
                  className="rounded-xl bg-[#050709] border border-white/10 p-3 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-white truncate">
                      {reg.teamName || reg.leaderIgn}
                    </div>
                    <div className="text-[11px] font-mono text-slate-400 truncate">
                      {reg.tournamentTitle} • {reg.division}
                    </div>
                  </div>
                  <span className="rounded px-2 py-0.5 font-mono text-[10px] uppercase bg-[#22C55E]/15 text-[#16FF6E] shrink-0">
                    {reg.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-[#050709] border border-white/10 p-6 text-center text-xs text-slate-400">
              No online player/team registrations saved in D1 yet.
            </div>
          )}
        </div>
      </div>

      {/* Recent Admin Activity + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-5 nx-glass rounded-2xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-bold text-white uppercase">
              Recent Activity
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('logs')}
              className="font-mono text-[11px] text-[#22C55E] hover:underline cursor-pointer"
            >
              Logs →
            </button>
          </div>
          {overview?.recentActivities && overview.recentActivities.length > 0 ? (
            <div className="divide-y divide-white/5 text-xs">
              {overview.recentActivities.slice(0, 5).map((act) => (
                <div key={act.id} className="py-2.5 space-y-0.5">
                  <div className="text-white font-medium">{act.summary}</div>
                  <div className="font-mono text-[10px] text-slate-500">
                    {act.actorUsername} ({act.actorRole}) • {act.timestamp.slice(0, 16)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-[#050709] border border-white/10 p-6 text-center text-xs text-slate-400">
              No recent database actions logged yet.
            </div>
          )}
        </div>

        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {quickActions.map((qa) => {
            const Icon = qa.icon;
            return (
              <button
                key={qa.title}
                type="button"
                onClick={qa.onClick}
                className="group nx-glass nx-glass-hover text-left rounded-2xl p-4 flex flex-col justify-between transition-all cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <span className="p-2 rounded-xl bg-[#050709] border border-white/10 group-hover:border-[#22C55E]/50 text-[#22C55E] shrink-0">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="font-display text-sm font-bold text-white uppercase">
                      {qa.title}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{qa.desc}</p>
                  </div>
                </div>
                <div className="mt-3 inline-flex items-center gap-1 font-mono text-[11px] text-[#22C55E]">
                  <span>{qa.cta}</span>
                  <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-1" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
