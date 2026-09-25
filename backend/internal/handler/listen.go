package handler

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"log"
	"math/big"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/mccann/awks3/backend/internal/auth"
	"github.com/mccann/awks3/backend/internal/ws"
)

// Pairing codes skip look-alike characters (0/O, 1/I/L) so they can be read
// off one screen and typed on a TV remote.
const (
	listenCodeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
	listenCodeLength   = 6
)

type ListenHandler struct {
	db  *sql.DB
	hub *ws.Hub
}

func NewListenHandler(db *sql.DB, hub *ws.Hub) *ListenHandler {
	return &ListenHandler{db: db, hub: hub}
}

func hashListenToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func newListenCode() (string, error) {
	b := make([]byte, listenCodeLength)
	for i := range b {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(listenCodeAlphabet))))
		if err != nil {
			return "", err
		}
		b[i] = listenCodeAlphabet[n.Int64()]
	}
	return string(b), nil
}

// CreateCode makes a one-time pairing code that expires in 10 minutes.
func (h *ListenHandler) CreateCode(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := auth.GetUserID(ctx)

	h.db.ExecContext(ctx, `DELETE FROM listen_codes WHERE expires_at <= datetime('now')`)

	// Retry on the rare collision with a live code.
	for attempt := 0; attempt < 5; attempt++ {
		code, err := newListenCode()
		if err != nil {
			break
		}
		var expiresAt string
		err = h.db.QueryRowContext(ctx,
			`INSERT INTO listen_codes (code, created_by, expires_at)
			 VALUES (?, ?, datetime('now', '+10 minutes'))
			 RETURNING expires_at`,
			code, userID,
		).Scan(&expiresAt)
		if err == nil {
			writeJSON(w, map[string]string{
				"code":       code,
				"expires_at": strings.Replace(expiresAt, " ", "T", 1) + "Z",
			})
			return
		}
	}
	log.Printf("[listen] could not create a pairing code for %s", userID)
	http.Error(w, "could not create a code", http.StatusInternalServerError)
}

// Pair redeems a code for a device key. Public: the screen isn't signed in.
func (h *ListenHandler) Pair(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var body struct {
		Code string `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	code := strings.ToUpper(strings.NewReplacer(" ", "", "-", "").Replace(body.Code))

	// Delete-and-return makes the code single-use even if two screens race.
	var createdBy string
	err := h.db.QueryRowContext(ctx,
		`DELETE FROM listen_codes WHERE code = ? AND expires_at > datetime('now') RETURNING created_by`,
		code,
	).Scan(&createdBy)
	if err != nil {
		http.Error(w, "that code is wrong or has expired", http.StatusUnauthorized)
		return
	}

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	token := base64.RawURLEncoding.EncodeToString(raw)

	id := uuid.New().String()
	_, err = h.db.ExecContext(ctx,
		`INSERT INTO listen_devices (id, token_hash, name, created_by) VALUES (?, ?, ?, ?)`,
		id, hashListenToken(token), deviceName(r.UserAgent()), createdBy,
	)
	if err != nil {
		log.Printf("[listen] insert device: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	writeJSON(w, map[string]string{"token": token})
}

// DeviceForToken returns the paired device a key belongs to and marks it
// seen. Used by the /ws/listen handshake.
func (h *ListenHandler) DeviceForToken(ctx context.Context, token string) (string, bool) {
	if token == "" {
		return "", false
	}
	var id string
	err := h.db.QueryRowContext(ctx,
		`UPDATE listen_devices SET last_seen_at = datetime('now') WHERE token_hash = ? RETURNING id`,
		hashListenToken(token),
	).Scan(&id)
	return id, err == nil
}

type listenDevice struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	CreatedByName string `json:"created_by_name"`
	CreatedAt     string `json:"created_at"`
	LastSeenAt    string `json:"last_seen_at"`
	Connected     bool   `json:"connected"`
}

// ListDevices returns the caller's paired screens, or every screen for admins.
func (h *ListenHandler) ListDevices(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := auth.GetUserID(ctx)
	isAdmin := auth.GetRole(ctx) == "admin"

	rows, err := h.db.QueryContext(ctx,
		`SELECT d.id, d.name, COALESCE(u.username, ''), d.created_at, COALESCE(d.last_seen_at, '')
		 FROM listen_devices d
		 LEFT JOIN users u ON u.id = d.created_by
		 WHERE ? OR d.created_by = ?
		 ORDER BY d.created_at DESC`,
		isAdmin, userID,
	)
	if err != nil {
		log.Printf("[listen] list devices: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	devices := make([]listenDevice, 0)
	for rows.Next() {
		var d listenDevice
		if err := rows.Scan(&d.ID, &d.Name, &d.CreatedByName, &d.CreatedAt, &d.LastSeenAt); err != nil {
			continue
		}
		d.Connected = h.hub.DeviceConnected(d.ID)
		devices = append(devices, d)
	}
	writeJSON(w, devices)
}

// RemoveDevice unpairs a screen and drops its connection. Owner or admin.
func (h *ListenHandler) RemoveDevice(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := auth.GetUserID(ctx)
	isAdmin := auth.GetRole(ctx) == "admin"
	id := chi.URLParam(r, "id")

	res, err := h.db.ExecContext(ctx,
		`DELETE FROM listen_devices WHERE id = ? AND (? OR created_by = ?)`,
		id, isAdmin, userID,
	)
	if err != nil {
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}
	h.hub.DisconnectDevice(id)
	w.WriteHeader(http.StatusNoContent)
}

// deviceName makes a readable label from the User-Agent, e.g. "Android TV".
func deviceName(ua string) string {
	checks := []struct{ needle, name string }{
		{"Web0S", "LG TV"},
		{"webOS", "LG TV"},
		{"Tizen", "Samsung TV"},
		{"CrKey", "Chromecast"},
		{"AFT", "Fire TV"},
		{"Android TV", "Android TV"},
		{"Android", "Android"},
		{"iPad", "iPad"},
		{"iPhone", "iPhone"},
		{"CrOS", "Chromebook"},
		{"Macintosh", "Mac"},
		{"Windows", "Windows PC"},
		{"Linux", "Linux"},
	}
	for _, c := range checks {
		if strings.Contains(ua, c.needle) {
			return c.name
		}
	}
	return "Screen"
}
