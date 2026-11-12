import { adminRequest } from './adminClient';
import type { PlatformTournament } from '../../api/platformClient';
import type { SiteConfigData } from '../../types/data';

export interface AdminOverviewData {
  databaseConnected: boolean;
  actorRole?: string;
  metrics: {
    totalTournaments: number;
    activeTournaments: number;
    registeredPlayers: number;
    registeredTeams: number;
    pendingRegistrations: number;
    upcomingMatches: number;
    completedMatches: number;
  };
  recentRegistrations: Array<{
    id: string;
    tournamentId: string;
    tournamentTitle: string;
    teamName: string;
    leaderIgn: string;
    division: string;
    status: string;
    createdAt: string;
  }>;
  recentActivities: Array<{
    id: string;
    timestamp: string;
    actorUsername: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string;
    summary: string;
  }>;
  registrationTrend: Array<{
    day: string;
    count: number;
  }>;
}

export interface AdminD1RegistrationRow {
  id: string;
  tournament_id: string;
  tournament_title: string;
  team_name: string | null;
  leader_ign: string;
  leader_char_id: string;
  contact_email: string;
  contact_discord: string | null;
  roster_json: string;
  division: string;
  status: 'pending' | 'approved' | 'rejected' | 'waitlisted';
  review_notes: string | null;
  reviewed_by?: string | null;
  created_at: string;
}

export interface AdminD1TeamRow {
  id: string;
  name: string;
  slug: string;
  tag: string;
  division: string;
  captain_ign: string | null;
  member_count: number;
  matches_played: number;
  total_wins: number;
  total_kills: number;
  total_points: number;
  verified: number;
  created_at: string;
}

export interface AdminD1PlayerRow {
  id: string;
  bgmi_ign: string;
  bgmi_char_id: string;
  role_tag: string;
  device_type: string;
  matches_played: number;
  total_wins: number;
  total_kills: number;
  total_points: number;
  verified: number;
  username: string | null;
  account_status: string | null;
  created_at: string;
}

export interface AdminD1MatchRow {
  id: string;
  tournament_id: string;
  tournament_title: string;
  division: string;
  match_number: number;
  title: string;
  group_label: string;
  map: string;
  perspective: string;
  scheduled_at: string;
  status: 'upcoming' | 'live' | 'completed' | 'cancelled';
  stream_url: string | null;
}

export interface AdminD1MatchResultRow {
  id: string;
  match_id: string;
  tournament_id: string;
  match_title: string;
  tournament_title: string;
  team_id: string | null;
  player_id: string | null;
  participant_name: string;
  placement: number;
  kills: number;
  placement_points: number;
  kill_points: number;
  total_points: number;
  wwcd: number;
  verified_at: string;
}

export interface AdminD1ReportsData {
  registrationsByStatus: Array<{ status: string; count: number }>;
  registrationsByFormat: Array<{ format: string; count: number }>;
  topTeams: Array<{ id: string; name: string; tag: string; total_points: number; total_kills: number }>;
  topPlayers: Array<{ id: string; bgmi_ign: string; total_points: number; total_kills: number }>;
}

export interface AdminD1RoleInfo {
  id: string;
  displayName: string;
  description: string;
  permissions: string[];
}

export interface AdminD1UserRow {
  id: string;
  username: string;
  email: string;
  role_id: string;
  account_status: 'active' | 'suspended' | 'banned';
  created_at: string;
  last_login_at: string | null;
}

export interface AdminD1ActivityLogRow {
  id: string;
  timestamp: string;
  actor_username: string;
  actor_role: string;
  action: string;
  target_type: string;
  target_id: string;
  ip_masked: string;
  summary: string;
}

export function fetchAdminOverview(apiBaseUrl: string): Promise<AdminOverviewData> {
  return adminRequest<AdminOverviewData>(apiBaseUrl, '/api/admin/overview', { method: 'GET' });
}

export function fetchAdminD1Tournaments(
  apiBaseUrl: string
): Promise<{ tournaments: PlatformTournament[] }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/tournaments', { method: 'GET' });
}

export function upsertAdminD1Tournament(
  apiBaseUrl: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; tournament?: PlatformTournament }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/tournaments', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteAdminD1Tournament(
  apiBaseUrl: string,
  tournamentId: string
): Promise<{ deleted: boolean }> {
  return adminRequest(
    apiBaseUrl,
    `/api/admin/d1/tournaments/${encodeURIComponent(tournamentId)}`,
    { method: 'DELETE' }
  );
}

export function fetchAdminD1Registrations(
  apiBaseUrl: string,
  status = 'All',
  tournamentId = ''
): Promise<{ registrations: AdminD1RegistrationRow[] }> {
  const qs = new URLSearchParams();
  if (status && status !== 'All') qs.set('status', status);
  if (tournamentId) qs.set('tournamentId', tournamentId);
  const query = qs.toString();
  return adminRequest(
    apiBaseUrl,
    `/api/admin/d1/registrations${query ? `?${query}` : ''}`,
    { method: 'GET' }
  );
}

export function updateAdminD1RegistrationStatus(
  apiBaseUrl: string,
  regId: string,
  status: 'pending' | 'approved' | 'rejected' | 'waitlisted',
  reviewNotes = ''
): Promise<{ ok: boolean }> {
  return adminRequest(apiBaseUrl, `/api/admin/d1/registrations/${encodeURIComponent(regId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status, reviewNotes }),
  });
}

export function fetchAdminD1Teams(apiBaseUrl: string): Promise<{ teams: AdminD1TeamRow[] }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/teams', { method: 'GET' });
}

export function setAdminD1TeamVerified(
  apiBaseUrl: string,
  teamId: string,
  verified: boolean
): Promise<{ ok: boolean }> {
  return adminRequest(apiBaseUrl, `/api/admin/d1/teams/${encodeURIComponent(teamId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ verified }),
  });
}

export function deleteAdminD1Team(apiBaseUrl: string, teamId: string): Promise<{ deleted: boolean }> {
  return adminRequest(apiBaseUrl, `/api/admin/d1/teams/${encodeURIComponent(teamId)}`, {
    method: 'DELETE',
  });
}

export function fetchAdminD1Players(apiBaseUrl: string): Promise<{ players: AdminD1PlayerRow[] }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/players', { method: 'GET' });
}

export function setAdminD1PlayerVerified(
  apiBaseUrl: string,
  playerId: string,
  verified: boolean
): Promise<{ ok: boolean }> {
  return adminRequest(apiBaseUrl, `/api/admin/d1/players/${encodeURIComponent(playerId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ verified }),
  });
}

export function deleteAdminD1Player(
  apiBaseUrl: string,
  playerId: string
): Promise<{ deleted: boolean }> {
  return adminRequest(apiBaseUrl, `/api/admin/d1/players/${encodeURIComponent(playerId)}`, {
    method: 'DELETE',
  });
}

export function fetchAdminD1Matches(apiBaseUrl: string): Promise<{ matches: AdminD1MatchRow[] }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/matches', { method: 'GET' });
}

export function createAdminD1Match(
  apiBaseUrl: string,
  payload: {
    tournamentId: string;
    matchNumber: number;
    title: string;
    groupLabel?: string;
    map: string;
    perspective: string;
    scheduledAt: string;
    streamUrl?: string;
  }
): Promise<{ ok: boolean; id?: string }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/matches', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAdminD1MatchStatus(
  apiBaseUrl: string,
  matchId: string,
  status: 'upcoming' | 'live' | 'completed' | 'cancelled'
): Promise<{ ok: boolean }> {
  return adminRequest(apiBaseUrl, `/api/admin/d1/matches/${encodeURIComponent(matchId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export function deleteAdminD1Match(
  apiBaseUrl: string,
  matchId: string
): Promise<{ deleted: boolean }> {
  return adminRequest(apiBaseUrl, `/api/admin/d1/matches/${encodeURIComponent(matchId)}`, {
    method: 'DELETE',
  });
}

export function fetchAdminD1Results(
  apiBaseUrl: string
): Promise<{ results: AdminD1MatchResultRow[] }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/results', { method: 'GET' });
}

export function submitAdminD1MatchResult(
  apiBaseUrl: string,
  payload: {
    matchId: string;
    tournamentId: string;
    teamId?: string;
    playerId?: string;
    participantName: string;
    placement: number;
    kills: number;
    placementPoints?: number;
    killPoints?: number;
  }
): Promise<{ ok: boolean; id?: string }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/results', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteAdminD1Result(
  apiBaseUrl: string,
  resultId: string
): Promise<{ deleted: boolean }> {
  return adminRequest(apiBaseUrl, `/api/admin/d1/results/${encodeURIComponent(resultId)}`, {
    method: 'DELETE',
  });
}

export function recalculateAdminD1Leaderboard(apiBaseUrl: string): Promise<{ ok: boolean }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/leaderboard/recalculate', {
    method: 'POST',
  });
}

export function fetchAdminD1Reports(apiBaseUrl: string): Promise<AdminD1ReportsData> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/reports', { method: 'GET' });
}

export function fetchAdminD1Roles(apiBaseUrl: string): Promise<{ roles: AdminD1RoleInfo[] }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/roles', { method: 'GET' });
}

export function fetchAdminD1Users(apiBaseUrl: string): Promise<{ users: AdminD1UserRow[] }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/users', { method: 'GET' });
}

export function createAdminD1User(
  apiBaseUrl: string,
  payload: { username: string; email: string; password: string; roleId: string }
): Promise<{ ok: boolean; user?: AdminD1UserRow }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/users', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateAdminD1User(
  apiBaseUrl: string,
  userId: string,
  payload: { roleId?: string; accountStatus?: 'active' | 'suspended' | 'banned' }
): Promise<{ ok: boolean }> {
  return adminRequest(apiBaseUrl, `/api/admin/d1/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function fetchAdminD1ActivityLogs(
  apiBaseUrl: string
): Promise<{ logs: AdminD1ActivityLogRow[] }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/activity-logs', { method: 'GET' });
}

export interface AdminD1NewsRow {
  id: string;
  title: string;
  description: string;
  category: string;
  banner_url: string;
  external_url: string | null;
  published_date: string;
  pinned: number;
  published: number;
  archived: number;
  created_at: string;
  updated_at: string;
}

export function fetchAdminD1News(
  apiBaseUrl: string
): Promise<{ entries: AdminD1NewsRow[] }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/news', { method: 'GET' });
}

export function upsertAdminD1News(
  apiBaseUrl: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; id: string }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/news', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function deleteAdminD1News(
  apiBaseUrl: string,
  newsId: string
): Promise<{ deleted: boolean }> {
  return adminRequest(apiBaseUrl, `/api/admin/d1/news/${encodeURIComponent(newsId)}`, {
    method: 'DELETE',
  });
}

export function fetchAdminD1Settings(
  apiBaseUrl: string
): Promise<{ siteConfig: SiteConfigData | null; updatedAt: string | null }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/settings', { method: 'GET' });
}

export function saveAdminD1Settings(
  apiBaseUrl: string,
  siteConfig: SiteConfigData
): Promise<{ ok: boolean; updatedAt: string }> {
  return adminRequest(apiBaseUrl, '/api/admin/d1/settings', {
    method: 'PUT',
    body: JSON.stringify({ siteConfig }),
  });
}
