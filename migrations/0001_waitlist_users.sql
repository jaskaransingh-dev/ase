-- D1 migration: waitlist users + confirmation tracking
CREATE TABLE IF NOT EXISTS waitlist_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip TEXT,
  user_agent TEXT,
  confirmation_sent_at DATETIME,
  confirmation_error TEXT,
  checked_in INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_waitlist_users_email ON waitlist_users(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_users_created_at ON waitlist_users(created_at DESC);
