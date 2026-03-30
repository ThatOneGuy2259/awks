package handler

import (
	"database/sql"
	"encoding/json"
	"log"
	"net/http"

	"github.com/mccann/awks3/backend/internal/auth"
	"github.com/mccann/awks3/backend/internal/store"
)

type MeHandler struct {
	queries *store.Queries
}

func NewMeHandler(queries *store.Queries) *MeHandler {
	return &MeHandler{queries: queries}
}

// SyncMe upserts the authenticated Clerk user into the local shadow table.
func (h *MeHandler) SyncMe(w http.ResponseWriter, r *http.Request) {
	userID := auth.GetUserID(r.Context())
	username := auth.GetUsername(r.Context())
	avatarURL := auth.GetAvatarURL(r.Context())
	role := auth.GetRole(r.Context())

	user, err := h.queries.UpsertUser(r.Context(), store.UpsertUserParams{
		ID:        userID,
		Username:  username,
		AvatarUrl: sql.NullString{String: avatarURL, Valid: avatarURL != ""},
		Role:      role,
	})
	if err != nil {
		log.Printf("failed to sync user %s: %v", userID, err)
		http.Error(w, `{"error":"failed to sync user"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         user.ID,
		"username":   user.Username,
		"avatar_url": user.AvatarUrl.String,
		"role":       user.Role,
	})
}
