PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO schema_meta (key, value)
VALUES ('schema_version', '1');

CREATE TABLE IF NOT EXISTS import_run (
  id TEXT PRIMARY KEY,
  provider_id TEXT,
  start_url TEXT,
  source_file TEXT,
  imported_at TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  entry_count INTEGER NOT NULL DEFAULT 0,
  image_count INTEGER NOT NULL DEFAULT 0,
  issue_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS provider (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  base_url TEXT
);

CREATE TABLE IF NOT EXISTS source (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  kind TEXT,
  languages_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS spelling (
  id TEXT PRIMARY KEY,
  primary_form TEXT NOT NULL,
  language TEXT
);

CREATE TABLE IF NOT EXISTS reading (
  id TEXT PRIMARY KEY,
  spelling_id TEXT NOT NULL REFERENCES spelling(id) ON DELETE CASCADE,
  display_latin TEXT,
  normalized TEXT,
  languages_attested_json TEXT NOT NULL DEFAULT '[]',
  slugs_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS form (
  id TEXT PRIMARY KEY,
  script TEXT,
  language TEXT,
  text TEXT NOT NULL,
  normalized TEXT,
  kind TEXT
);

CREATE TABLE IF NOT EXISTS reading_form (
  reading_id TEXT NOT NULL REFERENCES reading(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL REFERENCES form(id) ON DELETE CASCADE,
  PRIMARY KEY (reading_id, form_id)
);

CREATE TABLE IF NOT EXISTS source_link (
  id TEXT PRIMARY KEY,
  provider_id TEXT REFERENCES provider(id),
  external_type TEXT,
  external_id TEXT,
  url TEXT
);

CREATE TABLE IF NOT EXISTS reading_source_link (
  reading_id TEXT NOT NULL REFERENCES reading(id) ON DELETE CASCADE,
  source_link_id TEXT NOT NULL REFERENCES source_link(id) ON DELETE CASCADE,
  PRIMARY KEY (reading_id, source_link_id)
);

CREATE TABLE IF NOT EXISTS entry (
  id TEXT PRIMARY KEY,
  spelling_id TEXT NOT NULL REFERENCES spelling(id) ON DELETE CASCADE,
  reading_id TEXT NOT NULL REFERENCES reading(id) ON DELETE CASCADE,
  source_id TEXT REFERENCES source(id),
  provider_id TEXT REFERENCES provider(id),
  headword TEXT,
  latin TEXT,
  content_kind TEXT,
  content_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS reading_entry (
  reading_id TEXT NOT NULL REFERENCES reading(id) ON DELETE CASCADE,
  entry_id TEXT NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (reading_id, entry_id)
);

CREATE TABLE IF NOT EXISTS entry_source_link (
  entry_id TEXT NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  source_link_id TEXT NOT NULL REFERENCES source_link(id) ON DELETE CASCADE,
  PRIMARY KEY (entry_id, source_link_id)
);

CREATE TABLE IF NOT EXISTS image (
  id TEXT PRIMARY KEY,
  kind TEXT,
  url TEXT,
  source_id TEXT REFERENCES source(id),
  provider_id TEXT REFERENCES provider(id),
  citation_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS entry_image (
  entry_id TEXT NOT NULL REFERENCES entry(id) ON DELETE CASCADE,
  image_id TEXT NOT NULL REFERENCES image(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entry_id, image_id)
);

CREATE TABLE IF NOT EXISTS import_issue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  import_run_id TEXT REFERENCES import_run(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  kind TEXT NOT NULL,
  subject_id TEXT,
  message TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS cached_page (
  url TEXT PRIMARY KEY,
  cache_path TEXT,
  fetched_at TEXT,
  sha256 TEXT,
  status INTEGER,
  content_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_spelling_primary_form ON spelling(primary_form);
CREATE INDEX IF NOT EXISTS idx_reading_spelling_id ON reading(spelling_id);
CREATE INDEX IF NOT EXISTS idx_reading_normalized ON reading(normalized);
CREATE INDEX IF NOT EXISTS idx_entry_reading_id ON entry(reading_id);
CREATE INDEX IF NOT EXISTS idx_entry_source_id ON entry(source_id);
CREATE INDEX IF NOT EXISTS idx_image_url ON image(url);
CREATE INDEX IF NOT EXISTS idx_source_link_external ON source_link(provider_id, external_type, external_id);
