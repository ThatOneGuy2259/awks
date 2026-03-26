-- name: InsertHistory :exec
INSERT INTO play_history (video_id, title, artist, duration_sec, requested_by, played_at, skipped)
VALUES ($1, $2, $3, $4, $5, $6, $7);

-- name: GetHistory :many
SELECT h.*, u.username as requester_name
FROM play_history h
JOIN users u ON h.requested_by = u.id
ORDER BY h.played_at DESC
LIMIT $1 OFFSET $2;

-- name: DeleteHistoryEntry :exec
DELETE FROM play_history WHERE id = $1;

-- name: ClearHistory :exec
DELETE FROM play_history;
