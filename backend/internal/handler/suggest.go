package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type suggestCacheEntry struct {
	suggestions []string
	expiresAt   time.Time
}

type SuggestHandler struct {
	mu    sync.RWMutex
	cache map[string]suggestCacheEntry
}

func NewSuggestHandler() *SuggestHandler {
	return &SuggestHandler{
		cache: make(map[string]suggestCacheEntry),
	}
}

func (h *SuggestHandler) Suggest(w http.ResponseWriter, r *http.Request) {
	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) < 2 || len(query) > 100 {
		writeJSON(w, []string{})
		return
	}

	key := strings.ToLower(query)

	h.mu.RLock()
	entry, ok := h.cache[key]
	h.mu.RUnlock()
	if ok && time.Now().Before(entry.expiresAt) {
		writeJSON(w, entry.suggestions)
		return
	}

	suggestions := fetchYouTubeSuggestions(query)

	h.mu.Lock()
	h.cache[key] = suggestCacheEntry{
		suggestions: suggestions,
		expiresAt:   time.Now().Add(5 * time.Minute),
	}
	h.mu.Unlock()

	writeJSON(w, suggestions)
}

func fetchYouTubeSuggestions(query string) []string {
	ytURL := fmt.Sprintf(
		"https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=%s&xhr=t",
		url.QueryEscape(query),
	)

	client := &http.Client{Timeout: 2 * time.Second}
	req, err := http.NewRequest("GET", ytURL, nil)
	if err != nil {
		return []string{}
	}
	req.Header.Set("Origin", "https://www.youtube.com")
	req.Header.Set("Referer", "https://www.youtube.com")

	resp, err := client.Do(req)
	if err != nil {
		return []string{}
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return []string{}
	}

	var raw []json.RawMessage
	if err := json.Unmarshal(body, &raw); err != nil {
		return []string{}
	}
	if len(raw) < 2 {
		return []string{}
	}

	var entries [][]json.RawMessage
	if err := json.Unmarshal(raw[1], &entries); err != nil {
		return []string{}
	}

	suggestions := make([]string, 0, len(entries))
	for _, entry := range entries {
		if len(entry) == 0 {
			continue
		}
		var text string
		if err := json.Unmarshal(entry[0], &text); err != nil {
			continue
		}
		suggestions = append(suggestions, text)
		if len(suggestions) >= 10 {
			break
		}
	}
	return suggestions
}
