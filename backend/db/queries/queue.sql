-- name: GetQueue :many
SELECT q.id, q.youtube_url, q.video_id, q.title, q.artist, q.duration_sec,
       q.thumbnail_url, q.requested_by, q.position, q.status, q.created_at,
       q.audio_status, q.audio_path, q.bpm,
       u.username as requester_name, u.avatar_url as requester_avatar
FROM queue q
JOIN users u ON q.requested_by = u.id
WHERE q.status IN ('pending', 'playing')
ORDER BY q.position ASC;

-- name: GetQueueItem :one
SELECT id, youtube_url, video_id, title, artist, duration_sec, thumbnail_url,
       requested_by, position, status, created_at, audio_status, audio_path, bpm
FROM queue WHERE id = ?;

-- name: GetCurrentlyPlaying :one
SELECT q.id, q.youtube_url, q.video_id, q.title, q.artist, q.duration_sec,
       q.thumbnail_url, q.requested_by, q.position, q.status, q.created_at,
       q.audio_status, q.audio_path, q.bpm,
       u.username as requester_name, u.avatar_url as requester_avatar
FROM queue q
JOIN users u ON q.requested_by = u.id
WHERE q.status = 'playing'
LIMIT 1;

-- name: GetNextPending :one
SELECT id, youtube_url, video_id, title, artist, duration_sec, thumbnail_url,
       requested_by, position, status, created_at
FROM queue
WHERE status = 'pending'
ORDER BY position ASC
LIMIT 1;

-- name: InsertQueueItem :one
INSERT INTO queue (id, youtube_url, video_id, title, artist, duration_sec, thumbnail_url, requested_by, position, audio_status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM queue), ?)
RETURNING *;

-- name: UpdateQueueStatus :exec
UPDATE queue SET status = ? WHERE queue.id = ?;

-- name: DeleteQueueItem :exec
DELETE FROM queue WHERE queue.id = ?;

-- name: MoveToTop :exec
UPDATE queue SET position = (SELECT MIN(position) - 1 FROM queue WHERE status = 'pending')
WHERE queue.id = ?;

-- name: CountUserPendingTracks :one
SELECT COUNT(*) FROM queue WHERE requested_by = ? AND status IN ('pending', 'playing');

-- name: IsVideoInQueue :one
SELECT EXISTS(SELECT 1 FROM queue WHERE video_id = ? AND status IN ('pending', 'playing'));

-- name: UpdateAudioStatus :exec
UPDATE queue SET audio_status = ?, audio_path = ? WHERE id = ?;

-- name: GetPendingExtractions :many
SELECT id, youtube_url, video_id
FROM queue
WHERE status IN ('pending', 'playing') AND audio_status IN ('pending', 'extracting')
ORDER BY position ASC;

-- name: GetNextReadyPending :one
SELECT q.id, q.youtube_url, q.video_id, q.title, q.artist, q.duration_sec, q.thumbnail_url,
       q.requested_by, q.position, q.status, q.created_at, q.audio_status, q.audio_path, q.bpm,
       COALESCE(u.username, q.requested_by) AS requester_name,
       u.avatar_url AS requester_avatar
FROM queue q
LEFT JOIN users u ON u.id = q.requested_by
WHERE q.status = 'pending' AND q.audio_status = 'ready'
ORDER BY q.position ASC
LIMIT 1;

-- name: GetNextPendingExtraction :one
SELECT id, youtube_url, video_id
FROM queue
WHERE status = 'pending' AND audio_status = 'pending'
ORDER BY position ASC
LIMIT 1;

-- name: GetActiveQueueIDs :many
SELECT id FROM queue WHERE status IN ('pending', 'playing');

-- name: DeletePendingAutoDJ :exec
DELETE FROM queue WHERE requested_by = 'auto-dj' AND status = 'pending';

-- name: CountPendingAutoDJ :one
SELECT COUNT(*) FROM queue WHERE requested_by = 'auto-dj' AND status IN ('pending', 'playing');

-- name: UpdateDuration :exec
UPDATE queue SET duration_sec = ? WHERE id = ?;

-- name: SetBpm :exec
UPDATE queue SET bpm = ? WHERE id = ?;
