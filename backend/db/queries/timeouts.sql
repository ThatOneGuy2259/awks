-- name: CreateTimeout :one
INSERT INTO user_timeouts (user_id, issued_by, reason, expires_at)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetActiveTimeout :one
SELECT * FROM user_timeouts
WHERE user_id = $1 AND expires_at > now()
ORDER BY expires_at DESC
LIMIT 1;

-- name: DeleteTimeout :exec
DELETE FROM user_timeouts WHERE user_id = $1 AND expires_at > now();
