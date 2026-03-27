CREATE INDEX IF NOT EXISTS idx_play_history_played_at ON play_history(played_at DESC);
CREATE INDEX IF NOT EXISTS idx_play_history_artist ON play_history(artist) WHERE artist IS NOT NULL AND artist != '';
