export type TournamentFormat = 'Solo' | 'Duo' | 'Squad';
export type PerspectiveMode = 'TPP' | 'FPP';
export type RegistrationStatus = 'open' | 'closed' | 'full';

export type TournamentLifecycleStatus =
  | 'draft'
  | 'upcoming'
  | 'registration_open'
  | 'registration_closed'
  | 'live'
  | 'completed'
  | 'cancelled'
  | 'archived';

export interface SquadRequirements {
  teamRequirements: string;
  captainRequirements: string;
  playerRequirements: string;
}

export interface TournamentRecord {
  id: string;
  slug: string;
  title: string;
  season?: string;
  description: string;
  game: string;
  format: TournamentFormat;
  mode: PerspectiveMode;
  matchFormat?: string;
  map: string;
  banner: string;
  thumbnail: string;
  matchesCount: number;
  teamSize: string;
  eligibleDevices: string;
  eligibility: string[];
  squadDetails?: SquadRequirements;
  registration: {
    status: RegistrationStatus;
    formUrl: string;
    buttonText: string;
    openingDate: string;
    closingDate: string;
    closingMessage?: string;
    whatsappCommunityUrl: string;
    instructions: string;
    additionalInstructions?: string;
  };
  schedule: {
    date: string;
    reportingTime: string;
    startTime: string;
    timezone: string;
  };
  prizes: {
    entryFee: string;
    totalPrizePool: string;
    first: string;
    second: string;
    third: string;
    other: string;
  };
  rules: string[];
  status: TournamentLifecycleStatus;
  published?: boolean;
  featured: boolean;
}

export interface TournamentsData {
  schemaVersion: number;
  lastUpdated: string;
  tournaments: TournamentRecord[];
}

export interface TermsSection {
  id: string;
  title: string;
  content: string;
}

export interface CommunityConfig {
  whatsappCommunityUrl: string;
  whatsappChannelUrl?: string;
  whatsappContactUrl: string;
  instagramUrl: string;
  youtubeUrl: string;
  discordUrl: string;
  contactEmail: string;
}

export interface SiteConfigData {
  schemaVersion: number;
  lastUpdated: string;
  brandName: string;
  tagline: string;
  heroDescription: string;
  tickerAnnouncement: string;
  whyJoin: { title: string; description: string }[];
  about: {
    heading: string;
    paragraphs: string[];
    pillars: { title: string; description: string }[];
    vision: string;
  };
  community: CommunityConfig;
  termsSections: TermsSection[];
}

export interface LeaderboardEntry {
  id: string;
  division: TournamentFormat;
  tournamentId?: string;
  rank: number;
  name: string;
  tag: string;
  matchesPlayed: number;
  positionPoints: number;
  eliminationPoints: number;
  totalPoints: number;
}

export interface LeaderboardData {
  schemaVersion: number;
  lastUpdated: string;
  isDemoData: boolean;
  entries: LeaderboardEntry[];
}

export interface ScheduleEntry {
  id: string;
  tournamentName: string;
  date: string;
  reportingTime: string;
  startTime: string;
  timezone: string;
  map: string;
  format: TournamentFormat | 'All';
  status:
    | 'Upcoming'
    | 'Registration Open'
    | 'Registration Closed'
    | 'Live'
    | 'Completed'
    | 'Cancelled';
  notes: string;
}

export interface ScheduleData {
  schemaVersion: number;
  lastUpdated: string;
  entries: ScheduleEntry[];
}

export interface ResultRankingRow {
  rank: number;
  teamOrPlayer: string;
  totalPoints: number;
  prize: string;
}

export interface TournamentResultEntry {
  id: string;
  tournamentId?: string;
  tournamentName: string;
  division: TournamentFormat;
  date: string;
  winner: string;
  finalRankings: ResultRankingRow[];
  prizeDistribution: string;
  summary: string;
  published?: boolean;
}

export interface ResultsData {
  schemaVersion: number;
  lastUpdated: string;
  entries: TournamentResultEntry[];
}

export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  publishedDate: string;
  banner: string;
  externalUrl: string;
  category: 'Tournament' | 'Rules' | 'Community' | 'Updates';
  pinned: boolean;
  published?: boolean;
  archived?: boolean;
}

export interface NewsData {
  schemaVersion: number;
  lastUpdated: string;
  entries: NewsArticle[];
}

import type { CmsSnapshotPayload } from './cms';

export interface PublicSiteBundle {
  siteConfig: SiteConfigData;
  tournaments: TournamentsData;
  leaderboard: LeaderboardData;
  schedule: ScheduleData;
  results: ResultsData;
  news: NewsData;
  cms?: CmsSnapshotPayload;
  cmsVersion?: number;
  featuredTournamentIds?: string[];
}

export interface ValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

export interface RegistrationButtonState {
  isEnabled: boolean;
  label: string;
  helperText: string;
  href: string | null;
  reason: 'ready' | 'closed' | 'full' | 'missing_url' | 'invalid_url' | 'cancelled';
}
