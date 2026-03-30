-- name: CreateTimeout :one
INSERT INTO user_timeouts (id, user_id, issued_by, reason, expires_at)
VALUES (?, ?, ?, ?, ?)
RETURNING *;

-- name: GetActiveTimeout :one
SELECT * FROM user_timeouts
WHERE user_id = ? AND expires_at > datetime('now')
ORDER BY expires_at DESC
LIMIT 1;

-- name: DeleteTimeout :exec
DELETE FROM user_timeouts WHERE user_id = ? AND expires_at > datetime('now');
