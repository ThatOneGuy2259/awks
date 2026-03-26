package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mccann/awks3/backend/internal/auth"
	"github.com/mccann/awks3/backend/internal/model"
	"github.com/mccann/awks3/backend/internal/service"
	"github.com/mccann/awks3/backend/internal/store"
	"github.com/mccann/awks3/backend/internal/ws"
)

type AdminHandler struct {
	queries  store.Querier
	playback *service.PlaybackService
	hub      *ws.Hub
}

func NewAdminHandler(q store.Querier, p *service.PlaybackService, h *ws.Hub) *AdminHandler {
	return &AdminHandler{queries: q, playback: p, hub: h}
}

func (h *AdminHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	settings, err := h.queries.GetAllSettings(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	result := make(map[string]string)
	for _, s := range settings {
		result[s.Key] = s.Value
	}
	writeJSON(w, result)
}

func (h *AdminHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var body map[string]string
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	for key, value := range body {
		h.queries.UpsertSetting(ctx, store.UpsertSettingParams{Key: key, Value: value})
	}

	skipReq, _ := h.queries.GetSetting(ctx, "skip_votes_required")
	maxTracks, _ := h.queries.GetSetting(ctx, "max_tracks_per_user")
	skipN, _ := strconv.Atoi(skipReq)
	maxN, _ := strconv.Atoi(maxTracks)

	h.hub.Broadcast(model.WSMessage{
		Type: "SETTINGS_UPDATE",
		Data: model.SettingsUpdateData{
			SkipVotesRequired: skipN,
			MaxTracksPerUser:  maxN,
		},
	})

	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminHandler) MoveToTop(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := parseUUID(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	h.queries.MoveToTop(r.Context(), id)
	h.hub.Broadcast(model.WSMessage{Type: "QUEUE_UPDATE", Data: nil})
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminHandler) TimeoutUser(w http.ResponseWriter, r *http.Request) {
	adminID := auth.GetUserID(r.Context())
	userID := chi.URLParam(r, "id")

	var body struct {
		Minutes int    `json:"minutes"`
		Reason  string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	expiresAt := time.Now().Add(time.Duration(body.Minutes) * time.Minute)
	timeout, err := h.queries.CreateTimeout(r.Context(), store.CreateTimeoutParams{
		UserID:   userID,
		IssuedBy: adminID,
		Reason:   pgtype.Text{String: body.Reason, Valid: body.Reason != ""},
		ExpiresAt: pgtype.Timestamptz{Time: expiresAt, Valid: true},
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	h.hub.Broadcast(model.WSMessage{
		Type: "USER_TIMEOUT",
		Data: map[string]interface{}{
			"user_id":    userID,
			"expires_at": expiresAt.Format(time.RFC3339),
			"reason":     body.Reason,
		},
	})

	writeJSON(w, timeout)
}

func (h *AdminHandler) RemoveTimeout(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	h.queries.DeleteTimeout(r.Context(), userID)
	w.WriteHeader(http.StatusNoContent)
}

func (h *AdminHandler) GetTimeout(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "id")
	timeout, err := h.queries.GetActiveTimeout(r.Context(), userID)
	if err != nil || !timeout.ID.Valid {
		writeJSON(w, map[string]bool{"timed_out": false})
		return
	}
	writeJSON(w, map[string]interface{}{
		"timed_out":  true,
		"expires_at": timeout.ExpiresAt.Time.Format(time.RFC3339),
		"reason":     pgTextStr(timeout.Reason),
	})
}
