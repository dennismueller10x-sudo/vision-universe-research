CREATE TABLE IF NOT EXISTS waitlist_requests (
  email_key TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  withdrawn_at INTEGER,
  consent_version TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS waitlist_limits (
  key TEXT PRIMARY KEY,
  window INTEGER NOT NULL,
  count INTEGER NOT NULL
);
