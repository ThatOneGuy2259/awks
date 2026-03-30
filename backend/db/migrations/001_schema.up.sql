CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    username   TEXT NOT NULL,
    avatar_url TEXT,
    role       TEXT NOT NULL DEFAULT 'listener',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS queue (
    id            TEXT PRIMARY KEY,
    youtube_url   TEXT NOT NULL,
    video_id      TEXT NOT NULL,
    title         TEXT NOT NULL,
    artist        TEXT,
    duration_sec  INTEGER NOT NULL,
    thumbnail_url TEXT,
    requested_by  TEXT NOT NULL REFERENCES users(id),
    position      INTEGER NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    audio_status  TEXT NOT NULL DEFAULT 'pending',
    audio_path    TEXT
);
CREATE INDEX IF NOT EXISTS idx_queue_status_position ON queue(status, position);

CREATE TABLE IF NOT EXISTS skip_votes (
    id         TEXT PRIMARY KEY,
    queue_id   TEXT NOT NULL REFERENCES queue(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(queue_id, user_id)
);

CREATE TABLE IF NOT EXISTS play_history (
    id            TEXT PRIMARY KEY,
    video_id      TEXT NOT NULL,
    title         TEXT NOT NULL,
    artist        TEXT,
    duration_sec  INTEGER NOT NULL,
    requested_by  TEXT NOT NULL REFERENCES users(id),
    played_at     TEXT NOT NULL,
    skipped       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_history_artist ON play_history(artist) WHERE artist IS NOT NULL AND artist != '';

CREATE TABLE IF NOT EXISTS user_timeouts (
    id         TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    issued_by  TEXT NOT NULL REFERENCES users(id),
    reason     TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_user_timeouts_active ON user_timeouts(user_id, expires_at);

CREATE TABLE IF NOT EXISTS admin_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO admin_settings (key, value) VALUES
    ('skip_votes_required', '5'),
    ('max_tracks_per_user', '3'),
    ('skip_mode', 'fixed'),
    ('skip_percent', '50');
