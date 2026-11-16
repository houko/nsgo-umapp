CREATE TABLE website (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- One row per pageview (type 1) or custom event (type 2). Sessions and visits are hashes, never the visitor's address.
CREATE TABLE event (
  website_id TEXT NOT NULL REFERENCES website (id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  visit_id TEXT NOT NULL,
  type INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  path TEXT NOT NULL,
  referrer TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  tag TEXT NOT NULL DEFAULT ''
);

CREATE INDEX event_website_time ON event (website_id, created_at);
