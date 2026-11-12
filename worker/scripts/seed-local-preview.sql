-- Local Development Preview Sample Data for NexusX Esports India (BGMI Only)
-- Apply locally with:
--   npx wrangler d1 execute nexusx-esports-db --local --file=scripts/seed-local-preview.sql
-- Kept strictly outside worker/migrations/ so production migrations remain clean.

PRAGMA foreign_keys = ON;

-- 1. Sample Users & BGMI Player Profiles
INSERT OR IGNORE INTO users (id, username, email, password_hash, role_id, account_status, created_at, updated_at, last_login_at) VALUES
  ('usr-seed-1', 'nxxaarav', 'aarav.seed@nexusx.local', 'pbkdf2$100000$seed$seedonly', 'player', 'active', '2026-11-10T10:00:00.000Z', '2026-11-12T10:00:00.000Z', '2026-11-12T09:00:00.000Z'),
  ('usr-seed-2', 'viperclutch', 'viper.seed@nexusx.local', 'pbkdf2$100000$seed$seedonly', 'player', 'active', '2026-11-10T10:05:00.000Z', '2026-11-12T10:05:00.000Z', '2026-11-12T09:10:00.000Z'),
  ('usr-seed-3', 'rohanigl', 'rohan.seed@nexusx.local', 'pbkdf2$100000$seed$seedonly', 'player', 'active', '2026-11-10T10:10:00.000Z', '2026-11-12T10:10:00.000Z', '2026-11-12T09:15:00.000Z'),
  ('usr-seed-4', 'shadowsniper', 'shadow.seed@nexusx.local', 'pbkdf2$100000$seed$seedonly', 'player', 'active', '2026-11-10T10:15:00.000Z', '2026-11-12T10:15:00.000Z', '2026-11-12T09:20:00.000Z'),
  ('usr-seed-5', 'karanfragger', 'karan.seed@nexusx.local', 'pbkdf2$100000$seed$seedonly', 'player', 'active', '2026-11-10T10:20:00.000Z', '2026-11-12T10:20:00.000Z', '2026-11-12T09:25:00.000Z'),
  ('usr-seed-6', 'blazesupport', 'blaze.seed@nexusx.local', 'pbkdf2$100000$seed$seedonly', 'player', 'active', '2026-11-10T10:25:00.000Z', '2026-11-12T10:25:00.000Z', '2026-11-12T09:30:00.000Z');

INSERT OR IGNORE INTO players (
  id, user_id, bgmi_ign, bgmi_char_id, display_name, device_type, role_tag, region, bio,
  verified, matches_played, total_kills, total_wins, total_points, created_at, updated_at
) VALUES
  ('plr-seed-1', 'usr-seed-1', 'NXxAaravOP', '5148293011', 'Aarav Sharma', 'iQOO 12 Pro (Mobile)', 'IGL', 'Delhi NCR', 'Aggressive Erangel zone-caller & Team Nexus Vanguard captain.', 1, 14, 48, 4, 182, '2026-11-10T10:00:00.000Z', '2026-11-12T10:00:00.000Z'),
  ('plr-seed-2', 'usr-seed-2', 'ViperClutch99', '5294018234', 'Vikram Verma', 'OnePlus 12 (Mobile)', 'Assaulter', 'Maharashtra', 'Close-range compound entry fragger for Viper Syndicate.', 1, 12, 41, 3, 159, '2026-11-10T10:05:00.000Z', '2026-11-12T10:05:00.000Z'),
  ('plr-seed-3', 'usr-seed-3', 'RohanIGL', '5371920456', 'Rohan Nair', 'ROG Phone 8 (Mobile)', 'IGL', 'Karnataka', 'Strategic edge-rotation captain leading Garuda Esports India.', 1, 11, 34, 2, 144, '2026-11-10T10:10:00.000Z', '2026-11-12T10:10:00.000Z'),
  ('plr-seed-4', 'usr-seed-4', 'ShadowSniperIN', '5482019388', 'Kabir Mehta', 'iPhone 15 Pro (Mobile)', 'Sniper', 'Gujarat', 'Long-range AWM/M24 overwatch specialist.', 1, 10, 29, 2, 126, '2026-11-10T10:15:00.000Z', '2026-11-12T10:15:00.000Z'),
  ('plr-seed-5', 'usr-seed-5', 'KaranFragger', '5591028377', 'Karan Singh', 'Poco F6 Pro (Mobile)', 'Fragger', 'Punjab', 'Frontline Squad entry & Solo showdown contender.', 1, 9, 27, 1, 114, '2026-11-10T10:20:00.000Z', '2026-11-12T10:20:00.000Z'),
  ('plr-seed-6', 'usr-seed-6', 'BlazeSupport', '5674920183', 'Siddharth Rao', 'Realme GT 6 (Mobile)', 'Support', 'Telangana', 'Utility master, anchor, and late-zone revive clutch player.', 1, 8, 19, 1, 96, '2026-11-10T10:25:00.000Z', '2026-11-12T10:25:00.000Z');

-- 2. Sample Verified BGMI Teams & Memberships
INSERT OR IGNORE INTO teams (id, slug, name, tag, captain_player_id, division, logo_url, description, verified, created_at, updated_at) VALUES
  ('team-seed-1', 'team-nexus-vanguard', 'Team Nexus Vanguard', 'NXV', 'plr-seed-1', 'Squad', './images/nexusx-logo.png', 'Premier competitive BGMI Squad focused on disciplined late-circle finishes across Erangel and Miramar.', 1, '2026-11-10T10:30:00.000Z', '2026-11-12T10:30:00.000Z'),
  ('team-seed-2', 'garuda-esports-india', 'Garuda Esports India', 'GRD', 'plr-seed-3', 'Squad', './images/squad-banner.jpg', 'High-aggression BGMI roster known for early Pochinki and Bootcamp drop clashes.', 1, '2026-11-10T10:35:00.000Z', '2026-11-12T10:35:00.000Z'),
  ('team-seed-3', 'viper-syndicate', 'Viper Syndicate', 'VPR', 'plr-seed-2', 'Duo', './images/duo-banner.jpg', 'Fast-paced Duo & Squad finishers competing in weekly NexusX BGMI scrims.', 1, '2026-11-10T10:40:00.000Z', '2026-11-12T10:40:00.000Z'),
  ('team-seed-4', 'indus-storm-squad', 'Indus Storm Squad', 'ISS', 'plr-seed-4', 'Squad', './images/map-erangel.jpg', 'Tactical sniping and vehicle rotation specialists dominating weekend cups.', 1, '2026-11-10T10:45:00.000Z', '2026-11-12T10:45:00.000Z');

INSERT OR IGNORE INTO team_members (id, team_id, player_id, member_role, joined_at) VALUES
  ('tm-seed-1', 'team-seed-1', 'plr-seed-1', 'Captain', '2026-11-10T10:30:00.000Z'),
  ('tm-seed-2', 'team-seed-1', 'plr-seed-5', 'Player', '2026-11-10T10:31:00.000Z'),
  ('tm-seed-3', 'team-seed-2', 'plr-seed-3', 'Captain', '2026-11-10T10:35:00.000Z'),
  ('tm-seed-4', 'team-seed-2', 'plr-seed-6', 'Player', '2026-11-10T10:36:00.000Z'),
  ('tm-seed-5', 'team-seed-3', 'plr-seed-2', 'Captain', '2026-11-10T10:40:00.000Z'),
  ('tm-seed-6', 'team-seed-4', 'plr-seed-4', 'Captain', '2026-11-10T10:45:00.000Z');

-- 3. Sample Published BGMI Tournaments (Solo, Duo, Squad + Completed Showcase)
INSERT OR IGNORE INTO tournaments (
  id, slug, title, season, description, game, format, mode, match_format, map, banner_url,
  max_slots, matches_count, entry_fee, prize_pool, first_prize, second_prize, third_prize,
  rules_json, eligibility_json, reg_open_date, reg_close_date, reg_status,
  match_date, reporting_time, start_time, timezone, external_form_url, whatsapp_url,
  status, featured, published, created_by, created_at, updated_at
) VALUES
  (
    'NX-SOLO-101',
    'solo-showdown-s1',
    'NexusX BGMI Solo Showdown — S1',
    'Season 1',
    'High-stakes 100-player BGMI Solo bracket built to showcase individual gunskill, compound clutches, and final-circle positioning across India.',
    'BGMI',
    'Solo',
    'TPP',
    'Classic 3-Match Lobby',
    'Erangel / Miramar',
    './images/solo-banner.jpg',
    100,
    3,
    'Free Entry',
    'INR 10,000',
    'INR 5,000',
    'INR 3,000',
    'INR 2,000',
    '["Mobile smartphones only — emulators, iPads, tablets, and physical triggers are strictly banned.","Players must check in 30 minutes prior to room start time.","Teaming or stream sniping results in instant disqualification and account ban.","Screen recording (POV) mandatory for top 3 podium finishers."]',
    '["Valid Indian BGMI Character ID (Level 30+).","Exact IGN submitted during registration must enter the custom room."]',
    '2026-11-12',
    '2026-11-22',
    'open',
    '2026-11-24',
    '19:30',
    '20:00',
    'Asia/Kolkata',
    'https://forms.gle/NexusXSoloS1',
    'https://chat.whatsapp.com/Bb5wB0uhUjL7M1Zvcze0bT',
    'registration_open',
    1,
    1,
    'admin',
    '2026-11-10T09:00:00.000Z',
    '2026-11-12T09:00:00.000Z'
  ),
  (
    'NX-DUO-102',
    'duo-tactical-clash-s1',
    'NexusX BGMI Duo Tactical Clash — S1',
    'Season 1',
    'Two-player coordinated BGMI Duo series emphasizing twin pushes, utility sync, and sharp split holds across classic competitive maps.',
    'BGMI',
    'Duo',
    'TPP',
    'Classic 4-Match Series',
    'Erangel / Miramar',
    './images/duo-banner.jpg',
    50,
    4,
    'Free Entry',
    'INR 15,000',
    'INR 8,000',
    'INR 4,500',
    'INR 2,500',
    '["Strict mobile-only rule applies to both teammates.","Room ID and password are dispatched 15 minutes before drop to approved captains.","Both duo teammates must share matching team tag in lobby.","Disconnections after spawn island are not rehosted."]',
    '["2-player Indian BGMI duo roster with valid Character IDs.","Both teammates registered on mobile smartphones only."]',
    '2026-11-12',
    '2026-11-25',
    'open',
    '2026-11-27',
    '19:00',
    '19:30',
    'Asia/Kolkata',
    'https://forms.gle/NexusXDuoS1',
    'https://chat.whatsapp.com/Bb5wB0uhUjL7M1Zvcze0bT',
    'registration_open',
    1,
    1,
    'admin',
    '2026-11-10T09:10:00.000Z',
    '2026-11-12T09:10:00.000Z'
  ),
  (
    'NX-SQUAD-103',
    'india-squad-championship-s1',
    'NexusX India BGMI Squad Championship — S1',
    'Season 1',
    'Flagship 64-team BGMI Squad Championship with multi-lobby qualifiers, structured official scoring points, and grand finals.',
    'BGMI',
    'Squad',
    'TPP',
    'Qualifiers + Grand Finals (6 Matches)',
    'Erangel / Miramar / Sanhok',
    './images/squad-banner.jpg',
    64,
    6,
    'Free Entry',
    'INR 50,000',
    'INR 25,000',
    'INR 15,000',
    'INR 10,000',
    '["4 Main Players + Optional 1 Registered Substitute per squad.","No emergency substitutes outside submitted roster.","Bug exploitation, glitch use, or third-party GFX overlays are banned.","Captains must upload post-match screenshot upon admin verification request."]',
    '["4-5 member Indian BGMI squad with verified captain contact.","Mobile handsets strictly required across all matches."]',
    '2026-11-12',
    '2026-11-28',
    'open',
    '2026-11-30',
    '18:30',
    '19:00',
    'Asia/Kolkata',
    'https://forms.gle/NexusXSquadS1',
    'https://chat.whatsapp.com/Bb5wB0uhUjL7M1Zvcze0bT',
    'upcoming',
    1,
    1,
    'admin',
    '2026-11-10T09:20:00.000Z',
    '2026-11-12T09:20:00.000Z'
  ),
  (
    'NX-SQUAD-104',
    'erangel-night-invitational',
    'NexusX Erangel Night Cup — Showcase',
    'Pre-Season',
    'Completed weekend custom-room showcase featuring verified Indian BGMI squads competing across Erangel night drops.',
    'BGMI',
    'Squad',
    'TPP',
    '2-Match Night Lobby',
    'Erangel',
    './images/map-erangel.jpg',
    32,
    2,
    'Free Entry',
    'INR 25,000',
    'INR 15,000',
    'INR 7,000',
    'INR 3,000',
    '["Official NexusX 10-6-5-4 BGMI placement scoring + 1 pt per elimination.","All replays audited for mobile fair play."]',
    '["Invited & registered Indian BGMI Squads."]',
    '2026-11-01',
    '2026-11-08',
    'closed',
    '2026-11-10',
    '20:00',
    '20:30',
    'Asia/Kolkata',
    '',
    'https://chat.whatsapp.com/Bb5wB0uhUjL7M1Zvcze0bT',
    'completed',
    0,
    1,
    'admin',
    '2026-11-01T09:00:00.000Z',
    '2026-11-10T22:00:00.000Z'
  );

-- 4. Sample Approved Tournament Registrations (Populates Slot Counters)
INSERT OR IGNORE INTO registrations (
  id, tournament_id, user_id, player_id, team_id, division, team_name,
  leader_ign, leader_char_id, contact_email, contact_discord, roster_json,
  status, reviewed_by, review_notes, created_at, updated_at
) VALUES
  ('reg-seed-1', 'NX-SQUAD-103', 'usr-seed-1', 'plr-seed-1', 'team-seed-1', 'Squad', 'Team Nexus Vanguard', 'NXxAaravOP', '5148293011', 'aarav.seed@nexusx.local', 'aarav#0001', '[{"ign":"NXxAaravOP","charId":"5148293011","role":"IGL"},{"ign":"KaranFragger","charId":"5591028377","role":"Fragger"}]', 'approved', 'admin', 'Verified roster', '2026-11-11T10:00:00.000Z', '2026-11-11T10:15:00.000Z'),
  ('reg-seed-2', 'NX-SQUAD-103', 'usr-seed-3', 'plr-seed-3', 'team-seed-2', 'Squad', 'Garuda Esports India', 'RohanIGL', '5371920456', 'rohan.seed@nexusx.local', 'rohan#7722', '[{"ign":"RohanIGL","charId":"5371920456","role":"IGL"},{"ign":"BlazeSupport","charId":"5674920183","role":"Support"}]', 'approved', 'admin', 'Verified roster', '2026-11-11T10:20:00.000Z', '2026-11-11T10:30:00.000Z'),
  ('reg-seed-3', 'NX-DUO-102', 'usr-seed-2', 'plr-seed-2', 'team-seed-3', 'Duo', 'Viper Syndicate', 'ViperClutch99', '5294018234', 'viper.seed@nexusx.local', 'viper#9900', '[{"ign":"ViperClutch99","charId":"5294018234","role":"Assaulter"}]', 'approved', 'admin', 'Confirmed Duo slot', '2026-11-11T11:00:00.000Z', '2026-11-11T11:05:00.000Z'),
  ('reg-seed-4', 'NX-SOLO-101', 'usr-seed-5', 'plr-seed-5', NULL, 'Solo', '', 'KaranFragger', '5591028377', 'karan.seed@nexusx.local', 'karan#4411', '[]', 'pending', '', '', '2026-11-12T08:30:00.000Z', '2026-11-12T08:30:00.000Z');

-- 5. Sample Scheduled & Completed Matches
INSERT OR IGNORE INTO matches (
  id, tournament_id, match_number, title, group_label, map, perspective, scheduled_at, status, stream_url, created_at, updated_at
) VALUES
  ('match-seed-1', 'NX-SQUAD-104', 1, 'Erangel Night Grand Finale — Match 1', 'Grand Lobby A', 'Erangel', 'TPP', '2026-11-10T20:30:00+05:30', 'completed', 'https://www.youtube.com/@NexusXEsportsIndia', '2026-11-08T12:00:00.000Z', '2026-11-10T21:45:00.000Z'),
  ('match-seed-2', 'NX-SOLO-101', 1, 'Solo Qualifier Drop — Round 1', 'Lobby A (Players 1-100)', 'Erangel', 'TPP', '2026-11-24T20:00:00+05:30', 'upcoming', 'https://www.youtube.com/@NexusXEsportsIndia', '2026-11-11T12:00:00.000Z', '2026-11-11T12:00:00.000Z'),
  ('match-seed-3', 'NX-DUO-102', 1, 'Duo Tactical Clash — Match 1', 'Group Alpha', 'Miramar', 'TPP', '2026-11-27T19:30:00+05:30', 'upcoming', 'https://www.youtube.com/@NexusXEsportsIndia', '2026-11-11T12:15:00.000Z', '2026-11-11T12:15:00.000Z'),
  ('match-seed-4', 'NX-SQUAD-103', 1, 'Squad Championship — Qualifier Day 1', 'Group A (16 Squads)', 'Erangel', 'TPP', '2026-11-30T19:00:00+05:30', 'upcoming', 'https://www.youtube.com/@NexusXEsportsIndia', '2026-11-11T12:30:00.000Z', '2026-11-11T12:30:00.000Z');

-- 6. Sample Verified Match Results (Powers Results & Leaderboard)
INSERT OR IGNORE INTO match_results (
  id, match_id, tournament_id, team_id, player_id, participant_name, placement, kills,
  placement_points, kill_points, total_points, verified, recorded_by, created_at
) VALUES
  ('res-seed-1', 'match-seed-1', 'NX-SQUAD-104', 'team-seed-1', 'plr-seed-1', 'Team Nexus Vanguard [NXV]', 1, 14, 15, 14, 29, 1, 'admin', '2026-11-10T22:00:00.000Z'),
  ('res-seed-2', 'match-seed-1', 'NX-SQUAD-104', 'team-seed-2', 'plr-seed-3', 'Garuda Esports India [GRD]', 2, 11, 12, 11, 23, 1, 'admin', '2026-11-10T22:01:00.000Z'),
  ('res-seed-3', 'match-seed-1', 'NX-SQUAD-104', 'team-seed-3', 'plr-seed-2', 'Viper Syndicate [VPR]', 3, 9, 10, 9, 19, 1, 'admin', '2026-11-10T22:02:00.000Z'),
  ('res-seed-4', 'match-seed-1', 'NX-SQUAD-104', 'team-seed-4', 'plr-seed-4', 'Indus Storm Squad [ISS]', 4, 7, 8, 7, 15, 1, 'admin', '2026-11-10T22:03:00.000Z');

-- 7. Sample News & Announcements (Populates /news & Home Latest News)
INSERT OR IGNORE INTO news (
  id, title, description, category, banner_url, external_url, published_date, pinned, published, archived, created_at, updated_at
) VALUES
  (
    'news-seed-1',
    'Season 1 BGMI Circuit Open — INR 75,000+ Combined Prize Pool',
    'Registrations are now officially live for the NexusX Season 1 Solo Showdown, Duo Tactical Clash, and India Squad Championship. Free entry for verified mobile rosters across India with official custom room scheduling and transparent WWCD standings.',
    'Tournament',
    './images/news-season.jpg',
    'https://www.youtube.com/@NexusXEsportsIndia',
    '2026-11-12',
    1,
    1,
    0,
    '2026-11-12T08:00:00.000Z',
    '2026-11-12T08:00:00.000Z'
  ),
  (
    'news-seed-2',
    'Mandatory Mobile-Only & Anti-Cheat Fair Play Rules',
    'To keep every NexusX BGMI lobby competitive and fair, emulators, iPads, external triggers, and unauthorized graphic config files remain strictly banned. Podium finishers may be required to submit handcam or POV recordings within 30 minutes of lobby completion.',
    'Rules',
    './images/gallery-clutch.jpg',
    '',
    '2026-11-11',
    0,
    1,
    0,
    '2026-11-11T14:00:00.000Z',
    '2026-11-11T14:00:00.000Z'
  ),
  (
    'news-seed-3',
    'Erangel & Miramar Night Lobby Rotation Schedule Announced',
    'Evening qualifier and finals lobbies start promptly at 19:00 IST. Room IDs and passcodes are emailed to approved captains and posted in official WhatsApp community announcement channels 15 minutes before jump.',
    'Updates',
    './images/map-erangel.jpg',
    'https://whatsapp.com/channel/0029VbBpaitADTOINkNfLn28',
    '2026-11-10',
    0,
    1,
    0,
    '2026-11-10T18:00:00.000Z',
    '2026-11-10T18:00:00.000Z'
  ),
  (
    'news-seed-4',
    'Create Your Squad Roster Inside the New Player Portal',
    'Captains can now register their BGMI Character ID, assemble Duo or Squad teammates inside the Player Dashboard, and submit tournament entries in one click with live slot tracking.',
    'Community',
    './images/duo-banner.jpg',
    'https://www.instagram.com/nexusxesportsindia/',
    '2026-11-09',
    0,
    1,
    0,
    '2026-11-09T16:00:00.000Z',
    '2026-11-09T16:00:00.000Z'
  );

-- 8. Sample Activity Logs for Admin Overview
INSERT OR IGNORE INTO activity_logs (id, timestamp, actor_username, actor_role, action, target_type, target_id, ip_masked, summary) VALUES
  ('log-seed-1', '2026-11-12T08:05:00.000Z', 'Owner', 'owner', 'TOURNAMENT_PUBLISHED', 'tournament', 'NX-SQUAD-103', '127.0.0.1', 'Published NexusX India BGMI Squad Championship — S1 (64 slots).'),
  ('log-seed-2', '2026-11-11T22:05:00.000Z', 'Owner', 'owner', 'RESULTS_VERIFIED', 'match', 'match-seed-1', '127.0.0.1', 'Verified 4 final placements for Erangel Night Grand Finale Match 1.'),
  ('log-seed-3', '2026-11-11T10:30:00.000Z', 'Owner', 'owner', 'REGISTRATION_APPROVED', 'registration', 'reg-seed-2', '127.0.0.1', 'Approved Garuda Esports India [GRD] for Squad Championship S1.');
