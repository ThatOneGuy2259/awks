package handler

import (
	"net/http"

	"github.com/mccann/awks3/backend/internal/service"
)

const maxTrackDuration = 600 // seconds (10 minutes)

type SearchHandler struct {
	apiKey    string
	ytdlpPath string
}

func NewSearchHandler(apiKey, ytdlpPath string) *SearchHandler {
	return &SearchHandler{apiKey: apiKey, ytdlpPath: ytdlpPath}
}

func filterByDuration(results []service.SearchResult) []service.SearchResult {
	filtered := make([]service.SearchResult, 0, len(results))
	for _, r := range results {
		if r.DurationSec == 0 || r.DurationSec <= maxTrackDuration {
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
		}}))
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
	writeJSON(w, filterByDuration(results))
}
