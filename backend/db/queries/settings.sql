-- name: GetSetting :one
SELECT value FROM admin_settings WHERE key = $1;

-- name: GetAllSettings :many
SELECT * FROM admin_settings;

-- name: UpsertSetting :exec
INSERT INTO admin_settings (key, value, updated_at) VALUES ($1, $2, now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
