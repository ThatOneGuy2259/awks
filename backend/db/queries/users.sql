-- name: UpsertUser :one
INSERT INTO users (id, username, avatar_url, role)
VALUES (?, ?, ?, ?)
ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    avatar_url = EXCLUDED.avatar_url,
    role = EXCLUDED.role,
    updated_at = datetime('now')
RETURNING *;

-- name: GetUser :one
SELECT * FROM users WHERE id = ?;

-- name: GetUserRole :one
SELECT role FROM users WHERE id = ?;
