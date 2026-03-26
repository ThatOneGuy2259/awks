CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL,
    avatar_url    TEXT,
    role          TEXT NOT NULL DEFAULT 'listener',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE queue (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_url   TEXT NOT NULL,
    video_id      TEXT NOT NULL,
    title         TEXT NOT NULL,
    artist        TEXT,
    duration_sec  INT NOT NULL,
    thumbnail_url TEXT,
    requested_by  TEXT NOT NULL REFERENCES users(id),
    position      INT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'pending',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_queue_status_position ON queue(status, position);

CREATE TABLE skip_votes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_id      UUID NOT NULL REFERENCES queue(id) ON DELETE CASCADE,
    user_id       TEXT NOT NULL REFERENCES users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(queue_id, user_id)
);

CREATE TABLE play_history (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    video_id      TEXT NOT NULL,
    title         TEXT NOT NULL,
    artist        TEXT,
    duration_sec  INT NOT NULL,
    requested_by  TEXT NOT NULL REFERENCES users(id),
    played_at     TIMESTAMPTZ NOT NULL,
    skipped       BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE user_timeouts (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       TEXT NOT NULL REFERENCES users(id),
    issued_by     TEXT NOT NULL REFERENCES users(id),
    reason        TEXT,
    expires_at    TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_user_timeouts_active ON user_timeouts(user_id, expires_at);

CREATE TABLE admin_settings (
    key           TEXT PRIMARY KEY,
    value         TEXT NOT NULL,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO admin_settings (key, value) VALUES
    ('skip_votes_required', '5'),
    ('max_tracks_per_user', '3');
