package handler

import (
	"net/http"
	"strconv"

	"github.com/mccann/awks3/backend/internal/store"
)

type HistoryHandler struct {
	queries store.Querier
}

func NewHistoryHandler(q store.Querier) *HistoryHandler {
	return &HistoryHandler{queries: q}
}

func (h *HistoryHandler) GetHistory(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
	if limit <= 0 || limit > 50 {
		limit = 20
	}

	rows, err := h.queries.GetHistory(r.Context(), store.GetHistoryParams{
		Limit:  int32(limit),
		Offset: int32(offset),
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	writeJSON(w, rows)
}
