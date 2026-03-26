package handler

import (
	"net/http"

	"github.com/mccann/awks3/backend/internal/service"
)

type SearchHandler struct {
	apiKey    string
	ytdlpPath string
}

func NewSearchHandler(apiKey, ytdlpPath string) *SearchHandler {
	return &SearchHandler{apiKey: apiKey, ytdlpPath: ytdlpPath}
}

func (h *SearchHandler) Search(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query().Get("q")
	if query == "" {
		http.Error(w, "query parameter 'q' is required", http.StatusBadRequest)
		return
	}

	// Check if it's a YouTube URL
	videoID, err := service.ExtractVideoID(query)
	if err == nil {
		meta, err := service.ResolveVideoMeta(videoID, h.apiKey)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		writeJSON(w, []service.SearchResult{{
			VideoID:      meta.VideoID,
			Title:        meta.Title,
			Artist:       meta.Artist,
			DurationSec:  meta.DurationSec,
			ThumbnailURL: meta.ThumbnailURL,
		}})
		return
	}

	// Text search via yt-dlp (best fuzzy results), fall back to InnerTube/API
	results, err := service.SearchYouTubeYtdlp(query, h.ytdlpPath)
	if err != nil || len(results) == 0 {
		results, err = service.SearchYouTube(query, h.apiKey)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}
	writeJSON(w, results)
}
