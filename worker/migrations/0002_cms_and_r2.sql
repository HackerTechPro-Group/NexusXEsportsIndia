-- Migration 0002: Website Content Management System (CMS) & R2 Media Asset Registry
-- Normalized draft/preview/publish isolation with revision history & optimistic locking

CREATE TABLE IF NOT EXISTS site_sections (
  section_key TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 1,
  draft_json TEXT NOT NULL DEFAULT '{}',
  published_json TEXT NOT NULL DEFAULT '{}',
  draft_version INTEGER NOT NULL DEFAULT 1,
  published_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS site_content (
  content_key TEXT PRIMARY KEY,
  section_key TEXT NOT NULL,
  field_type TEXT NOT NULL DEFAULT 'text',
  draft_value TEXT NOT NULL DEFAULT '',
  published_value TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS navigation_items (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  href TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'anchor' CHECK (item_type IN ('anchor', 'route', 'external')),
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  show_mobile INTEGER NOT NULL DEFAULT 1 CHECK (show_mobile IN (0, 1)),
  open_in_new_tab INTEGER NOT NULL DEFAULT 0 CHECK (open_in_new_tab IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 1,
  stage TEXT NOT NULL CHECK (stage IN ('draft', 'published')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS footer_content (
  id TEXT PRIMARY KEY,
  draft_json TEXT NOT NULL,
  published_json TEXT NOT NULL,
  draft_version INTEGER NOT NULL DEFAULT 1,
  published_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS social_links (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  label TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  icon_name TEXT NOT NULL DEFAULT 'globe',
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  display_order INTEGER NOT NULL DEFAULT 1,
  stage TEXT NOT NULL CHECK (stage IN ('draft', 'published')),
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS media_assets (
  id TEXT PRIMARY KEY,
  r2_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  public_url TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT 'uploads',
  alt_text TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS content_revisions (
  id TEXT PRIMARY KEY,
  version_number INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'rollback'))
);

CREATE TABLE IF NOT EXISTS content_publication (
  id TEXT PRIMARY KEY,
  published_version INTEGER NOT NULL DEFAULT 1,
  draft_version INTEGER NOT NULL DEFAULT 1,
  etag TEXT NOT NULL,
  last_published_at TEXT,
  last_published_by TEXT,
  last_rollback_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS seo_settings (
  id TEXT PRIMARY KEY,
  draft_json TEXT NOT NULL,
  published_json TEXT NOT NULL,
  draft_version INTEGER NOT NULL DEFAULT 1,
  published_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_nav_stage_order ON navigation_items(stage, display_order ASC);
CREATE INDEX IF NOT EXISTS idx_social_stage_order ON social_links(stage, display_order ASC);
CREATE INDEX IF NOT EXISTS idx_media_created ON media_assets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_revisions_ver ON content_revisions(version_number DESC);
