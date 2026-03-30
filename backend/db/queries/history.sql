-- name: InsertHistory :exec
INSERT INTO play_history (id, video_id, title, artist, duration_sec, requested_by, played_at, skipped)
VALUES (?, ?, ?, ?, ?, ?, ?, ?);

-- name: GetHistory :many
SELECT h.*, u.username as requester_name
FROM play_history h
JOIN users u ON h.requested_by = u.id
ORDER BY h.played_at DESC
LIMIT ? OFFSET ?;

-- name: DeleteHistoryEntry :exec
DELETE FROM play_history WHERE id = ?;

-- name: ClearHistory :exec
DELETE FROM play_history;
