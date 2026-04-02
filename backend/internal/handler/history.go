package handler

import (
	"log"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
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
		Limit:  int64(limit),
		Offset: int64(offset),
	})
	if err != nil {
		log.Printf("[history] error: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}

	if rows == nil {
		rows = []store.GetHistoryRow{}
	}
	writeJSON(w, rows)
}

func (h *HistoryHandler) DeleteEntry(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := parseUUID(idStr)
	if err != nil {
		http.Error(w, "invalid id", http.StatusBadRequest)
		return
	}
	if err := h.queries.DeleteHistoryEntry(r.Context(), id); err != nil {
		log.Printf("[history] error: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *HistoryHandler) ClearAll(w http.ResponseWriter, r *http.Request) {
	if err := h.queries.ClearHistory(r.Context()); err != nil {
		log.Printf("[history] error: %v", err)
		http.Error(w, "internal server error", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
