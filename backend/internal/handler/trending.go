package handler

import (
	"context"
	"net/http"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type trendingCache struct {
	tags      []string
	expiresAt time.Time
}

type TrendingHandler struct {
	pool  *pgxpool.Pool
	mu    sync.RWMutex
	cache *trendingCache
}

func NewTrendingHandler(pool *pgxpool.Pool) *TrendingHandler {
	return &TrendingHandler{pool: pool}
}

type trendingTagsResponse struct {
	Tags []string `json:"tags"`
}

func (h *TrendingHandler) GetTrendingTags(w http.ResponseWriter, r *http.Request) {
	h.mu.RLock()
	c := h.cache
	h.mu.RUnlock()
	if c != nil && time.Now().Before(c.expiresAt) {
		writeJSON(w, trendingTagsResponse{Tags: c.tags})
		return
	}

	tags := h.queryTrendingTags(r.Context())

	h.mu.Lock()
	h.cache = &trendingCache{
		tags:      tags,
		expiresAt: time.Now().Add(10 * time.Minute),
	}
	h.mu.Unlock()

	writeJSON(w, trendingTagsResponse{Tags: tags})
}

func (h *TrendingHandler) queryTrendingTags(ctx context.Context) []string {
	recentQuery := `
		SELECT artist, COUNT(*) as cnt
		FROM play_history
		WHERE played_at > NOW() - INTERVAL '24 hours'
		  AND artist IS NOT NULL AND artist != ''
		GROUP BY artist
		ORDER BY cnt DESC
		LIMIT 8`

	tags := queryArtists(ctx, h.pool, recentQuery)

	if len(tags) >= 6 {
		return tags
	}

	allTimeQuery := `
		SELECT artist, COUNT(*) as cnt
		FROM play_history
		WHERE artist IS NOT NULL AND artist != ''
		GROUP BY artist
		ORDER BY cnt DESC
		LIMIT 8`

	allTime := queryArtists(ctx, h.pool, allTimeQuery)

	seen := make(map[string]bool, len(tags))
	for _, t := range tags {
		seen[t] = true
	}
	for _, t := range allTime {
		if len(tags) >= 8 {
			break
		}
		if !seen[t] {
			tags = append(tags, t)
			seen[t] = true
		}
	}

	return tags
}

func queryArtists(ctx context.Context, pool *pgxpool.Pool, query string) []string {
	rows, err := pool.Query(ctx, query)
	if err != nil {
		return []string{}
	}
	defer rows.Close()

	var artists []string
	for rows.Next() {
		var artist string
		var cnt int64
		if err := rows.Scan(&artist, &cnt); err != nil {
			continue
		}
		artists = append(artists, artist)
	}
	return artists
}
