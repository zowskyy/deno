-- Webroom database schema. Every table that stores anything a user wrote
-- or Webroom itself generated is versioned at the application layer via
-- the page document's own "version" field (see pageDocument.ts) — this
-- schema only defines storage shape, not content validation.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL UNIQUE,
  handle_lower TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  is_blocked_platform INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- One row per user: their current published (or draft) page document, plus
-- version history for restore. `document_json` always validates against
-- the Zod schema in pageDocument.ts before it's written here — never an
-- unvalidated write.
CREATE TABLE IF NOT EXISTS page_documents (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  document_json TEXT NOT NULL,
  is_published INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'unlisted', 'public')),
  hidden_from_discovery INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS page_document_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_versions_user ON page_document_versions(user_id, created_at);

-- Friend links are mutual-accept: a row starts as 'pending' (requester ->
-- addressee), becomes 'accepted' when the addressee accepts, and is
-- deleted (not soft-deleted) on decline/unfriend so it can be re-requested
-- later. A block is a separate table checked before any request can be
-- created, and survives independently of friend-row deletion.
CREATE TABLE IF NOT EXISTS friend_links (
  id TEXT PRIMARY KEY,
  requester_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at TEXT NOT NULL,
  responded_at TEXT,
  UNIQUE (requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friend_links_addressee ON friend_links(addressee_id, status);
CREATE INDEX IF NOT EXISTS idx_friend_links_requester ON friend_links(requester_id, status);

CREATE TABLE IF NOT EXISTS blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);

-- Full moderator review tooling (queue UI, appeals, logs) is Phase 3
-- scope — but the Report control in the top bar is present from Phase 1
-- per the plan ("a theme cannot hide these controls"), so reports must
-- genuinely land somewhere real, not 404 or vanish, even before that
-- tooling exists.
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  reported_handle TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed'))
);
