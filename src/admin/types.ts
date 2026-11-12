import type { NewsData, ResultsData, SiteConfigData, TournamentsData } from '../types/data';

export type AdminModuleTab =
  | 'overview'
  | 'cms'
  | 'tournaments'
  | 'registration'
  | 'teams'
  | 'players'
  | 'matches'
  | 'results'
  | 'leaderboard'
  | 'news'
  | 'reports'
  | 'users'
  | 'roles'
  | 'site-settings'
  | 'logs'
  | 'security';

export interface AdminContentPayload {
  tournaments: TournamentsData;
  results: ResultsData;
  news: NewsData;
  siteConfig?: SiteConfigData;
}

export interface AdminContentResponse {
  bundle: AdminContentPayload;
  repository: string;
  branch: string;
}

export interface AdminPublishResponse {
  ok: boolean;
  commitSha: string;
  commitUrl: string;
  repository: string;
  branch: string;
  updatedFiles: string[];
  committedAt: string;
}

export interface AdminSessionStatus {
  authenticated: boolean;
  username?: string;
  csrfToken?: string;
  authMode?: string;
}

export interface AdminSetupStatus {
  setupRequired: boolean;
  setupTokenConfigured: boolean;
  sessionSecretConfigured?: boolean;
  cloudflareAccessSetupConfigured: boolean;
  ownerLockEnabled?: boolean;
  singleOwnerMode?: boolean;
}

export interface PrivateSheetEntry {
  sheetUrl: string;
  notes?: string;
  updatedAt: string;
}

export interface PrivateSheetsConfig {
  schemaVersion: number;
  updatedAt: string;
  sheetsByTournamentId: Record<string, PrivateSheetEntry>;
}

export interface AdminSessionInfo {
  jti: string;
  username: string;
  issuedAt: number;
  expiresAt: number;
  userAgentSummary: string;
  ipMasked: string;
  isCurrent: boolean;
}

export interface AdminSecurityAuditEntry {
  id: string;
  timestamp: string;
  event: string;
  actor: string;
  ipMasked: string;
  summary: string;
}
