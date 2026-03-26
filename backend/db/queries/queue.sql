-- name: GetQueue :many
SELECT q.id, q.youtube_url, q.video_id, q.title, q.artist, q.duration_sec,
       q.thumbnail_url, q.requested_by, q.position, q.status, q.created_at,
       q.audio_status, q.audio_path,
       u.username as requester_name, u.avatar_url as requester_avatar
FROM queue q
JOIN users u ON q.requested_by = u.id
WHERE q.status IN ('pending', 'playing')
ORDER BY q.position ASC;

-- name: GetQueueItem :one
SELECT id, youtube_url, video_id, title, artist, duration_sec, thumbnail_url,
       requested_by, position, status, created_at, audio_status, audio_path
FROM queue WHERE id = $1;

-- name: GetCurrentlyPlaying :one
SELECT q.id, q.youtube_url, q.video_id, q.title, q.artist, q.duration_sec,
       q.thumbnail_url, q.requested_by, q.position, q.status, q.created_at,
       q.audio_status, q.audio_path,
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
INSERT INTO queue (youtube_url, video_id, title, artist, duration_sec, thumbnail_url, requested_by, position, audio_status)
VALUES ($1, $2, $3, $4, $5, $6, $7, (SELECT COALESCE(MAX(position), 0) + 1 FROM queue WHERE status IN ('pending', 'playing')), $8)
RETURNING *;

-- name: UpdateQueueStatus :exec
UPDATE queue SET status = $2 WHERE queue.id = $1;

-- name: DeleteQueueItem :exec
DELETE FROM queue WHERE queue.id = $1;

-- name: MoveToTop :exec
UPDATE queue SET position = (SELECT MIN(position) - 1 FROM queue WHERE queue.status = 'pending')
WHERE queue.id = $1;

-- name: CountUserPendingTracks :one
SELECT COUNT(*) FROM queue WHERE requested_by = $1 AND status IN ('pending', 'playing');

-- name: IsVideoInQueue :one
SELECT EXISTS(SELECT 1 FROM queue WHERE video_id = $1 AND status IN ('pending', 'playing'));

-- name: UpdateAudioStatus :exec
UPDATE queue SET audio_status = $2, audio_path = $3 WHERE queue.id = $1;

-- name: GetPendingExtractions :many
SELECT id, youtube_url, video_id
FROM queue
WHERE status IN ('pending', 'playing') AND audio_status IN ('pending', 'extracting')
ORDER BY position ASC;

-- name: GetNextReadyPending :one
SELECT id, youtube_url, video_id, title, artist, duration_sec, thumbnail_url,
       requested_by, position, status, created_at, audio_status, audio_path
FROM queue
WHERE status = 'pending' AND audio_status = 'ready'
ORDER BY position ASC
LIMIT 1;

-- name: GetActiveQueueIDs :many
SELECT id FROM queue WHERE status IN ('pending', 'playing');
