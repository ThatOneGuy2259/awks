-- name: UpsertUser :one
INSERT INTO users (id, username, avatar_url, role)
VALUES ($1, $2, $3, $4)
ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    avatar_url = EXCLUDED.avatar_url,
    role = EXCLUDED.role,
    updated_at = now()
RETURNING *;

-- name: GetUser :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserRole :one
SELECT role FROM users WHERE id = $1;
