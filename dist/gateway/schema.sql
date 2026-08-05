PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS chat_sessions (
  id TEXT PRIMARY KEY,
  visitor_id TEXT NOT NULL,
  site_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'automation' CHECK (mode IN ('automation','takeover_requested','human','closed')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  page_url TEXT,
  referrer TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_visitor ON chat_sessions(visitor_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_expiry ON chat_sessions(expires_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('visitor','assistant','operator','system')),
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','accepted','delivered','failed')),
  provider_message_id TEXT,
  error_code TEXT,
  FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_provider_id ON chat_messages(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_rate ON chat_messages(session_id, role, created_at DESC);
