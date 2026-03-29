package handler

import (
	"net/http"
	"strconv"

	"github.com/mccann/awks3/backend/internal/service"
	"github.com/mccann/awks3/backend/internal/store"
)

const defaultMaxTrackDuration = 600 // seconds (10 minutes)

// getMaxDuration reads the admin-configured max_track_duration setting, falling back to default.
func getMaxDuration(queries store.Querier, r *http.Request) int {
	if val, err := queries.GetSetting(r.Context(), "max_track_duration"); err == nil {
		if n, err := strconv.Atoi(val); err == nil && n > 0 {
			return n
		}
	}
	return defaultMaxTrackDuration
}

type SearchHandler struct {
	apiKey    string
	ytdlpPath string
	queries   store.Querier
}

func NewSearchHandler(apiKey, ytdlpPath string, queries store.Querier) *SearchHandler {
	return &SearchHandler{apiKey: apiKey, ytdlpPath: ytdlpPath, queries: queries}
}

func filterByDuration(results []service.SearchResult, maxDuration int) []service.SearchResult {
	filtered := make([]service.SearchResult, 0, len(results))
	for _, r := range results {
		if r.DurationSec > 0 && r.DurationSec <= maxDuration {
			filtered = append(filtered, r)
		}
	}
	return filtered
}

func (h *SearchHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "query parameter 'q' is required", http.StatusBadRequest)
		return
	}

	maxDur := getMaxDuration(h.queries, r)

	videoID, err := service.ExtractVideoID(query)
	if err == nil {
		meta, err := service.ResolveVideoMeta(videoID, h.apiKey)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, filterByDuration([]service.SearchResult{{
			VideoID:      meta.VideoID,
			Title:        meta.Title,
			Artist:       meta.Artist,
			DurationSec:  meta.DurationSec,
			ThumbnailURL: meta.ThumbnailURL,
		}}, maxDur))
		return
	}

	results, err := service.SearchYouTubeYtdlp(query, h.ytdlpPath)
	if err != nil || len(results) == 0 {
		results, err = service.SearchYouTube(query, h.apiKey)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	writeJSON(w, filterByDuration(results, maxDur))
}
