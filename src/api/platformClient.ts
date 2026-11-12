import { validateHttpsUrl } from '../utils/validation';

export interface PlatformMetrics {
  totalTournaments: number;
  ongoingTournaments: number;
  registeredPlayers: number;
  verifiedTeams: number;
  completedMatches: number;
}

export interface PlatformTournament {
  id: string;
  slug: string;
  title: string;
  season: string;
  description: string;
  game: 'BGMI';
  format: 'Solo' | 'Duo' | 'Squad';
  mode: 'TPP' | 'FPP';
  matchFormat: string;
  map: string;
  bannerUrl: string;
  maxSlots: number;
  registeredSlots: number;
  matchesCount: number;
  entryFee: string;
  prizePool: string;
  firstPrize: string;
  secondPrize: string;
  thirdPrize: string;
  rules: string[];
  eligibility: string[];
  regOpenDate: string;
  regCloseDate: string;
  regStatus: 'open' | 'closed' | 'full';
  matchDate: string;
  reportingTime: string;
  startTime: string;
  timezone: string;
  externalFormUrl: string;
  whatsappUrl: string;
  status: string;
  featured: boolean;
  published: boolean;
  updatedAt: string;
}

export interface PlatformTeamSummary {
  id: string;
  slug: string;
  name: string;
  tag: string;
  division: 'Solo' | 'Duo' | 'Squad';
  logoUrl: string;
  description: string;
  verified: boolean;
  captainIgn: string;
  memberCount: number;
  createdAt: string;
}

export interface PlatformPlayerSummary {
  id: string;
  bgmiIgn: string;
  displayName: string;
  roleTag: string;
  region: string;
  verified: boolean;
  matchesPlayed: number;
  totalKills: number;
  totalWins: number;
  totalPoints: number;
  teamName: string | null;
  teamTag: string | null;
  teamSlug: string | null;
}

export interface PlatformMatchItem {
  id: string;
  tournament_id: string;
  tournament_title?: string;
  tournament_slug?: string;
  division?: string;
  match_number: number;
  title: string;
  group_label: string;
  map: string;
  perspective: 'TPP' | 'FPP';
  scheduled_at: string;
  status: 'upcoming' | 'live' | 'completed' | 'cancelled';
  stream_url: string;
}

export interface PlatformBootstrapResponse {
  databaseConnected: boolean;
  metrics: PlatformMetrics;
  tournaments: PlatformTournament[];
  news: Array<{
    id: string;
    title: string;
    description: string;
    category: string;
    banner: string;
    externalUrl: string;
    publishedDate: string;
    pinned: boolean;
  }>;
  topPlayers: Array<{
    rank: number;
    id: string;
    bgmiIgn: string;
    displayName: string;
    roleTag: string;
    region: string;
    verified: boolean;
    matchesPlayed: number;
    totalKills: number;
    totalWins: number;
    totalPoints: number;
  }>;
  matches: Array<{
    id: string;
    tournamentId: string;
    tournamentTitle: string;
    division: string;
    matchNumber: number;
    title: string;
    groupLabel: string;
    map: string;
    perspective: string;
    scheduledAt: string;
    status: string;
    streamUrl: string;
  }>;
}

export function getPlatformApiBaseUrl(): string {
  const raw = String(import.meta.env.VITE_ADMIN_API_URL ?? '').trim();
  if (!raw) return '';
  if (validateHttpsUrl(raw, 'API URL').valid) {
    return raw.replace(/\/+$/, '');
  }
  try {
    const parsed = new URL(raw);
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      !parsed.username &&
      !parsed.password
    ) {
      return `${parsed.origin}${parsed.pathname}`.replace(/\/+$/, '');
    }
  } catch {
    return '';
  }
  return '';
}

async function platformFetch<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    csrfToken?: string | null;
    signal?: AbortSignal;
  } = {}
): Promise<T> {
  const base = getPlatformApiBaseUrl();
  if (!base) {
    throw new Error('Platform Worker API URL is not configured.');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.csrfToken) {
    headers['X-CSRF-Token'] = options.csrfToken;
  }

  const response = await fetch(`${base}${path}`, {
    method: options.method ?? 'GET',
    credentials: 'include',
    cache: 'no-store',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    signal: options.signal,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(String(payload.error ?? `Request failed (${response.status})`));
  }
  return payload as T;
}

export async function fetchPlatformBootstrap(): Promise<PlatformBootstrapResponse | null> {
  if (!getPlatformApiBaseUrl()) return null;
  try {
    return await platformFetch<PlatformBootstrapResponse>('/api/platform/bootstrap');
  } catch {
    return null;
  }
}

export async function fetchPlatformTournaments(filters?: {
  format?: string;
  status?: string;
  search?: string;
}): Promise<PlatformTournament[]> {
  const params = new URLSearchParams();
  if (filters?.format && filters.format !== 'All') params.set('format', filters.format);
  if (filters?.status && filters.status !== 'All') params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const data = await platformFetch<{ tournaments: PlatformTournament[] }>(`/api/platform/tournaments${qs}`);
  return data.tournaments ?? [];
}

export async function fetchPlatformTournamentDetail(slug: string) {
  return platformFetch<{
    tournament: PlatformTournament;
    matches: PlatformMatchItem[];
    results: Array<{
      id: string;
      match_id: string;
      participant_name: string;
      placement: number;
      kills: number;
      placement_points: number;
      kill_points: number;
      total_points: number;
    }>;
  }>(`/api/platform/tournaments/${encodeURIComponent(slug)}`);
}

export async function fetchPlatformTeams(search = ''): Promise<PlatformTeamSummary[]> {
  const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  const data = await platformFetch<{ teams: PlatformTeamSummary[] }>(`/api/platform/teams${qs}`);
  return data.teams ?? [];
}

export async function fetchPlatformTeamDetail(slug: string) {
  return platformFetch<{
    team: PlatformTeamSummary;
    members: Array<{
      playerId: string;
      bgmiIgn: string;
      displayName: string;
      memberRole: string;
      roleTag: string;
      verified: boolean;
      matchesPlayed: number;
      totalKills: number;
      totalWins: number;
      totalPoints: number;
    }>;
    recentResults: Array<{
      id: string;
      placement: number;
      kills: number;
      total_points: number;
      match_title: string;
      map: string;
      tournament_title: string;
      created_at: string;
    }>;
  }>(`/api/platform/teams/${encodeURIComponent(slug)}`);
}

export async function fetchPlatformPlayers(search = ''): Promise<PlatformPlayerSummary[]> {
  const qs = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
  const data = await platformFetch<{ players: PlatformPlayerSummary[] }>(`/api/platform/players${qs}`);
  return data.players ?? [];
}

export async function fetchPlatformPlayerProfile(id: string) {
  return platformFetch<{
    player: {
      id: string;
      bgmiIgn: string;
      displayName: string;
      deviceType: string;
      roleTag: string;
      region: string;
      bio: string;
      verified: boolean;
      matchesPlayed: number;
      totalKills: number;
      totalWins: number;
      totalPoints: number;
      createdAt: string;
      team: { id: string; name: string; tag: string; slug: string } | null;
    };
    matchHistory: Array<{
      id: string;
      placement: number;
      kills: number;
      total_points: number;
      match_title: string;
      map: string;
      tournament_title: string;
      tournament_slug: string;
      created_at: string;
    }>;
  }>(`/api/platform/players/${encodeURIComponent(id)}`);
}

export async function fetchPlatformLeaderboard(format = 'All') {
  const qs = format && format !== 'All' ? `?format=${encodeURIComponent(format)}` : '';
  return platformFetch<{
    players: Array<{
      rank: number;
      id: string;
      name: string;
      tag: string;
      division: string;
      matchesPlayed: number;
      totalKills: number;
      totalWins: number;
      totalPoints: number;
    }>;
    teams: Array<{
      rank: number;
      id: string;
      name: string;
      tag: string;
      slug: string;
      division: string;
      matchesPlayed: number;
      positionPoints: number;
      eliminationPoints: number;
      totalKills: number;
      totalWins: number;
      totalPoints: number;
    }>;
  }>(`/api/platform/leaderboard${qs}`);
}

export async function fetchPlatformMatches(): Promise<PlatformMatchItem[]> {
  const data = await platformFetch<{ matches: PlatformMatchItem[] }>('/api/platform/matches');
  return data.matches ?? [];
}

export async function fetchPlatformResults() {
  return platformFetch<{
    results: Array<{
      id: string;
      match_id: string;
      tournament_id: string;
      participant_name: string;
      placement: number;
      kills: number;
      placement_points: number;
      kill_points: number;
      total_points: number;
      match_title: string;
      map: string;
      match_number: number;
      tournament_title: string;
      tournament_slug: string;
      division: string;
      prize_pool: string;
      created_at: string;
    }>;
  }>('/api/platform/results');
}

export async function submitPlatformTournamentRegistration(
  tournamentId: string,
  payload: {
    teamId?: string;
    teamName?: string;
    leaderIgn: string;
    leaderCharId: string;
    contactEmail: string;
    contactDiscord?: string;
    roster: Array<{ ign: string; charId: string; role?: string }>;
  },
  csrfToken?: string | null
) {
  return platformFetch<{ ok: true; registrationId: string; status: 'pending' | 'waitlisted' }>(
    `/api/platform/tournaments/${encodeURIComponent(tournamentId)}/register`,
    { method: 'POST', body: payload, csrfToken }
  );
}

export async function fetchPlayerSession() {
  return platformFetch<{
    authenticated: boolean;
    user?: { id: string; username: string; email: string; role: string };
    csrfToken?: string;
  }>('/api/auth/player/session');
}

export async function registerPlayerAccount(payload: {
  username: string;
  email: string;
  password: string;
  bgmiIgn: string;
  bgmiCharId: string;
  roleTag?: string;
}) {
  return platformFetch<{
    authenticated: boolean;
    user: { id: string; username: string; email: string; role: string };
    playerId: string;
    csrfToken: string;
  }>('/api/auth/player/register', { method: 'POST', body: payload });
}

export async function loginPlayerAccount(identifier: string, password: string) {
  return platformFetch<{
    authenticated: boolean;
    user: { id: string; username: string; email: string; role: string };
    csrfToken: string;
  }>('/api/auth/player/login', { method: 'POST', body: { identifier, password } });
}

export async function logoutPlayerAccount(csrfToken: string | null) {
  return platformFetch<{ authenticated: boolean }>('/api/auth/player/logout', {
    method: 'POST',
    body: {},
    csrfToken,
  });
}

export async function fetchMyPlayerDashboard() {
  return platformFetch<{
    player: {
      id: string;
      userId: string;
      username: string;
      email: string;
      bgmiIgn: string;
      bgmiCharId: string;
      displayName: string;
      deviceType: string;
      roleTag: string;
      region: string;
      bio: string;
      verified: boolean;
      matchesPlayed: number;
      totalKills: number;
      totalWins: number;
      totalPoints: number;
    };
    teams: Array<{
      id: string;
      slug: string;
      name: string;
      tag: string;
      division: string;
      member_role: string;
      verified: number;
    }>;
    registrations: Array<{
      id: string;
      tournament_id: string;
      tournament_title: string;
      tournament_slug: string;
      match_date: string;
      start_time: string;
      division: string;
      team_name: string;
      leader_ign: string;
      leader_char_id: string;
      status: 'pending' | 'approved' | 'rejected' | 'waitlisted';
      review_notes: string;
      created_at: string;
    }>;
  }>('/api/player/me');
}

export async function updateMyPlayerProfile(
  patch: {
    bgmiIgn?: string;
    bgmiCharId?: string;
    displayName?: string;
    roleTag?: string;
    region?: string;
    bio?: string;
  },
  csrfToken: string | null
) {
  return platformFetch<{ ok: true }>('/api/player/profile', {
    method: 'PUT',
    body: patch,
    csrfToken,
  });
}

export async function createMyPlayerTeam(
  payload: { name: string; tag: string; division: 'Solo' | 'Duo' | 'Squad'; description?: string },
  csrfToken: string | null
) {
  return platformFetch<{ ok: true; teamId: string; slug: string }>('/api/player/teams', {
    method: 'POST',
    body: payload,
    csrfToken,
  });
}
