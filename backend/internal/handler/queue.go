package handler

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/mccann/awks3/backend/internal/audio"
	"github.com/mccann/awks3/backend/internal/auth"
	"github.com/mccann/awks3/backend/internal/model"
	"github.com/mccann/awks3/backend/internal/service"
	"github.com/mccann/awks3/backend/internal/store"
	"github.com/mccann/awks3/backend/internal/ws"
)

type QueueHandler struct {
	queries   store.Querier
	playback  *service.PlaybackService
	hub       *ws.Hub
	apiKey    string
	ytdlpPath string
	extractor *audio.Extractor
}

func NewQueueHandler(q store.Querier, p *service.PlaybackService, h *ws.Hub, apiKey, ytdlpPath string, ext *audio.Extractor) *QueueHandler {
	return &QueueHandler{queries: q, playback: p, hub: h, apiKey: apiKey, ytdlpPath: ytdlpPath, extractor: ext}
}

func (h *QueueHandler) GetQueue(w http.ResponseWriter, r *http.Request) {
	rows, err := h.queries.GetQueue(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	tracks := make([]model.QueueTrack, 0, len(rows))
	for _, row := range rows {
		var createdAt time.Time
		if t, err := time.Parse(time.RFC3339, row.CreatedAt); err == nil {
			createdAt = t
		}
		tracks = append(tracks, model.QueueTrack{
			ID:              row.ID,
			YouTubeURL:      row.YoutubeUrl,
			VideoID:         row.VideoID,
			Title:           row.Title,
			Artist:          nullStr(row.Artist),
			DurationSec:     int(row.DurationSec),
			ThumbnailURL:    nullStr(row.ThumbnailUrl),
			RequestedBy:     row.RequestedBy,
			RequesterName:   row.RequesterName,
			RequesterAvatar: nullStr(row.RequesterAvatar),
			Position:        int(row.Position),
			Status:          row.Status,
			AudioStatus:     row.AudioStatus,
			CreatedAt:       createdAt,
		})
	}
	writeJSON(w, tracks)
}

func (h *QueueHandler) AddToQueue(w http.ResponseWriter, r *http.Request) {
	userID := auth.GetUserID(r.Context())
	username := auth.GetUsername(r.Context())
	avatarURL := auth.GetAvatarURL(r.Context())
	role := auth.GetRole(r.Context())
	ctx := r.Context()

	// Ensure user exists in shadow table before inserting queue item (FK constraint)
	h.queries.UpsertUser(ctx, store.UpsertUserParams{
		ID:        userID,
		Username:  username,
		AvatarUrl: sql.NullString{String: avatarURL, Valid: avatarURL != ""},
		Role:      role,
	})

	var body struct {
		YouTubeURL string `json:"youtube_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}

	// Check timeout
	timeout, err := h.queries.GetActiveTimeout(ctx, userID)
	if err == nil && timeout.ID != "" {
		http.Error(w, "you are timed out from requesting songs", http.StatusForbidden)
		return
	}

	// Check request limit
	maxStr, _ := h.queries.GetSetting(ctx, "max_tracks_per_user")
	maxTracks, _ := strconv.Atoi(maxStr)
	if maxTracks > 0 {
		count, _ := h.queries.CountUserPendingTracks(ctx, userID)
		if count >= int64(maxTracks) {
			http.Error(w, "request limit reached", http.StatusTooManyRequests)
			return
		}
	}

	videoID, err := service.ExtractVideoID(body.YouTubeURL)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	exists, _ := h.queries.IsVideoInQueue(ctx, videoID)
	if exists != 0 {
		http.Error(w, "song is already in the queue", http.StatusConflict)
		return
	}

	meta, err := service.ResolveVideoMeta(videoID, h.apiKey, h.ytdlpPath)
	if err != nil {
		http.Error(w, "could not resolve video: "+err.Error(), http.StatusBadRequest)
		return
	}

	maxDur := getMaxDuration(h.queries, r)
	if meta.DurationSec > maxDur {
		http.Error(w, fmt.Sprintf("video exceeds maximum duration of %d seconds", maxDur), http.StatusBadRequest)
		return
	}

	item, err := h.queries.InsertQueueItem(ctx, store.InsertQueueItemParams{
		ID:           uuid.New().String(),
		YoutubeUrl:   body.YouTubeURL,
		VideoID:      meta.VideoID,
		Title:        meta.Title,
		Artist:       sql.NullString{String: meta.Artist, Valid: meta.Artist != ""},
		DurationSec:  int64(meta.DurationSec),
		ThumbnailUrl: sql.NullString{String: meta.ThumbnailURL, Valid: meta.ThumbnailURL != ""},
		RequestedBy:  userID,
		AudioStatus:  "pending",
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Remove any pending auto-DJ tracks so user's track takes priority
	h.queries.DeletePendingAutoDJ(ctx)

	// Start audio extraction
	h.extractor.Extract(item.ID, body.YouTubeURL)

	h.broadcastQueueUpdate(ctx)

	state, _ := h.playback.GetCurrentState(ctx)
	if state == nil {
		go h.playback.AdvanceQueue(context.Background())
	}

	writeJSON(w, item)
}

func (h *QueueHandler) DeleteFromQueue(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := parseUUID(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	item, err := h.queries.GetQueueItem(r.Context(), id)
	if err != nil {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	if item.Status == "playing" {
		h.playback.SkipCurrent(r.Context(), "admin")
	} else {
		h.queries.DeleteQueueItem(r.Context(), id)
		h.broadcastQueueUpdate(r.Context())
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *QueueHandler) CastSkipVote(w http.ResponseWriter, r *http.Request) {
	userID := auth.GetUserID(r.Context())
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	id, err := parseUUID(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	h.queries.CastSkipVote(ctx, store.CastSkipVoteParams{ID: uuid.New().String(), QueueID: id, UserID: userID})
	h.broadcastSkipVoteUpdate(ctx, id)

	count, _ := h.queries.CountSkipVotes(ctx, id)
	required := h.getSkipVotesRequired(ctx)
	if required > 0 && int(count) >= required {
		h.playback.SkipCurrent(ctx, "vote")
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *QueueHandler) RetractSkipVote(w http.ResponseWriter, r *http.Request) {
	userID := auth.GetUserID(r.Context())
	ctx := r.Context()
	idStr := chi.URLParam(r, "id")
	id, err := parseUUID(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}

	h.queries.RetractSkipVote(ctx, store.RetractSkipVoteParams{QueueID: id, UserID: userID})
	h.broadcastSkipVoteUpdate(ctx, id)
	w.WriteHeader(http.StatusNoContent)
}

func (h *QueueHandler) broadcastQueueUpdate(ctx context.Context) {
	h.hub.Broadcast(model.WSMessage{Type: "QUEUE_UPDATE", Data: nil})
}

func (h *QueueHandler) broadcastSkipVoteUpdate(ctx context.Context, queueID string) {
	count, _ := h.queries.CountSkipVotes(ctx, queueID)
	required := h.getSkipVotesRequired(ctx)

	h.hub.Broadcast(model.WSMessage{
		Type: "SKIP_VOTE_UPDATE",
		Data: model.SkipVoteUpdateData{
			QueueID:       queueID,
			Votes:         int(count),
			VotesRequired: required,
		},
	})
}

// getSkipVotesRequired calculates the number of votes needed to skip.
// In "fixed" mode, returns the configured number directly.
// In "percent" mode, calculates ceil(listeners * percent / 100), minimum 1.
func (h *QueueHandler) getSkipVotesRequired(ctx context.Context) int {
	mode, _ := h.queries.GetSetting(ctx, "skip_mode")
	if mode == "percent" {
		pctStr, _ := h.queries.GetSetting(ctx, "skip_percent")
		pct, _ := strconv.Atoi(pctStr)
		if pct <= 0 {
			pct = 50
		}
		listeners := h.hub.ListenerCount()
		if listeners <= 0 {
			return 1
		}
		required := (listeners*pct + 99) / 100 // ceil division
		if required < 1 {
			required = 1
		}
		return required
	}
	// fixed mode
	reqStr, _ := h.queries.GetSetting(ctx, "skip_votes_required")
	required, _ := strconv.Atoi(reqStr)
	if required < 1 {
		required = 1
	}
	return required
}

func nullStr(t sql.NullString) string {
	if t.Valid {
		return t.String
	}
	return ""
}

func parseUUID(s string) (string, error) {
	if s == "" {
		return "", fmt.Errorf("empty id")
	}
	return s, nil
}

func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(data)
}
