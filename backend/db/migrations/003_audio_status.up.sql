ALTER TABLE queue ADD COLUMN audio_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE queue ADD COLUMN audio_path TEXT;
