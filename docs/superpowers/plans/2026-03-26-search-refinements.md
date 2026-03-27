# Search Refinements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add search-as-you-type suggestions, duration display with server-side filtering, and dynamic trending tags to the AWKS search experience.

**Architecture:** New backend endpoints `/api/suggest` and `/api/trending-tags` with in-memory caching. Frontend gets a suggestions dropdown component with debounce/abort, duration badges on track cards, and dynamic trending tags fetched on mount. Duration filtering happens server-side in the existing search handler.

**Tech Stack:** Go (chi router, pgx), React 19, TypeScript 5.9, Tailwind CSS 4

**Spec:** `docs/superpowers/specs/2026-03-26-search-refinements-design.md`

---

### Task 1: Shared formatTime utility

**Files:**
- Create: `frontend/src/lib/formatTime.ts`
- Modify: `frontend/src/hooks/usePlaybackSync.ts`
- Modify: `frontend/src/components/layout/PlayerBar.tsx` (if it imports formatTime from usePlaybackSync)

Extract the existing `formatTime` function to a shared utility so both the player bar and track cards can use it.

- [ ] **Step 1: Create the shared utility**

Create `frontend/src/lib/formatTime.ts`:

```typescript
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
```

- [ ] **Step 2: Update usePlaybackSync to re-export from shared utility**

In `frontend/src/hooks/usePlaybackSync.ts`, replace the `formatTime` function definition (lines 28-32) with a re-export:

```typescript
export { formatTime } from '../lib/formatTime';
```

This preserves backward compatibility — existing imports of `formatTime` from `usePlaybackSync` still work.

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/formatTime.ts frontend/src/hooks/usePlaybackSync.ts
git commit -m "refactor: extract formatTime to shared utility"
```

---

### Task 2: Duration badge on TrackCard

**Files:**
- Modify: `frontend/src/components/search/TrackCard.tsx`

Add a duration badge (M:SS) to the bottom-right corner of each track card's thumbnail. Only shown when `duration_sec > 0`.

- [ ] **Step 1: Add duration badge to featured card**

In `frontend/src/components/search/TrackCard.tsx`, add the import at the top:

```typescript
import { formatTime } from '../../lib/formatTime';
```

In the featured card's thumbnail container (the `<div className="relative w-40 h-40 flex-shrink-0">` around line 30), add the duration badge after the hover overlay div:

```typescript
          {track.duration_sec > 0 && (
            <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
              {formatTime(track.duration_sec)}
            </span>
          )}
```

- [ ] **Step 2: Add duration badge to standard card**

In the standard card's thumbnail `<img>` (around line 68), wrap the img in a relative container and add the badge:

Change:
```typescript
      <img
        className="w-full aspect-square object-cover rounded-lg mb-4 grayscale group-hover:grayscale-0 transition-all duration-500"
        src={track.thumbnail_url}
        alt={track.title}
      />
```

to:

```typescript
      <div className="relative mb-4">
        <img
          className="w-full aspect-square object-cover rounded-lg grayscale group-hover:grayscale-0 transition-all duration-500"
          src={track.thumbnail_url}
          alt={track.title}
        />
        {track.duration_sec > 0 && (
          <span className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] font-bold px-1.5 py-0.5 rounded">
            {formatTime(track.duration_sec)}
          </span>
        )}
      </div>
```

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/search/TrackCard.tsx
git commit -m "feat: add duration badge to search result cards"
```

---

### Task 3: Backend duration filtering in search handler

**Files:**
- Modify: `backend/internal/handler/search.go`

Filter out results where `duration_sec > 600` before returning. Keep results with `duration_sec == 0` (missing duration).

- [ ] **Step 1: Add duration constant and filtering**

In `backend/internal/handler/search.go`, add the constant and a filter function, then apply it before `writeJSON`:

```go
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

	// Check if it's a YouTube URL
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

	// Text search via yt-dlp (best fuzzy results), fall back to InnerTube/API
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
```

- [ ] **Step 2: Verify Go build**

Run: `cd backend && go build ./...`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/handler/search.go
git commit -m "feat: filter search results exceeding 10-minute duration limit"
```

---

### Task 4: Backend suggest endpoint with cache

**Files:**
- Create: `backend/internal/handler/suggest.go`
- Modify: `backend/cmd/server/main.go`

New `/api/suggest?q=...` endpoint that proxies to YouTube's suggest API with in-memory caching.

- [ ] **Step 1: Create the suggest handler**

Create `backend/internal/handler/suggest.go`:

```go
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

	// Check cache
	h.mu.RLock()
	entry, ok := h.cache[key]
	h.mu.RUnlock()
	if ok && time.Now().Before(entry.expiresAt) {
		writeJSON(w, entry.suggestions)
		return
	}

	// Fetch from YouTube suggest API
	suggestions := fetchYouTubeSuggestions(query)

	// Cache result
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

	// Response format: ["query", [["suggestion1",0,[512,433]], ...], {"k":1}]
	// We need to strip the JSONP wrapper if present, then parse index 1
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
```

- [ ] **Step 2: Register the route in main.go**

In `backend/cmd/server/main.go`, add the handler initialization after the existing `searchH` line (around line 164):

```go
	suggestH := handler.NewSuggestHandler()
```

Add the route inside the `/api` route group (after `r.Get("/search", searchH.Search)`):

```go
		r.Get("/suggest", suggestH.Suggest)
```

- [ ] **Step 3: Verify Go build**

Run: `cd backend && go build ./...`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handler/suggest.go backend/cmd/server/main.go
git commit -m "feat: add /api/suggest endpoint with YouTube autocomplete proxy"
```

---

### Task 5: Backend trending tags endpoint

**Files:**
- Create: `backend/internal/handler/trending.go`
- Modify: `backend/cmd/server/main.go`

New `/api/trending-tags` endpoint that queries `play_history` for popular artists.

- [ ] **Step 1: Create the trending handler**

Create `backend/internal/handler/trending.go`:

```go
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
	// Check cache
	h.mu.RLock()
	c := h.cache
	h.mu.RUnlock()
	if c != nil && time.Now().Before(c.expiresAt) {
		writeJSON(w, trendingTagsResponse{Tags: c.tags})
		return
	}

	tags := h.queryTrendingTags(r.Context())

	// Cache result
	h.mu.Lock()
	h.cache = &trendingCache{
		tags:      tags,
		expiresAt: time.Now().Add(10 * time.Minute),
	}
	h.mu.Unlock()

	writeJSON(w, trendingTagsResponse{Tags: tags})
}

func (h *TrendingHandler) queryTrendingTags(ctx context.Context) []string {
	// Recent 24h artists
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

	// Backfill from all-time
	allTimeQuery := `
		SELECT artist, COUNT(*) as cnt
		FROM play_history
		WHERE artist IS NOT NULL AND artist != ''
		GROUP BY artist
		ORDER BY cnt DESC
		LIMIT 8`

	allTime := queryArtists(ctx, h.pool, allTimeQuery)

	// Deduplicate: add all-time entries not already in recent
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
```

- [ ] **Step 2: Register the route in main.go**

In `backend/cmd/server/main.go`, add the handler initialization. The `TrendingHandler` needs the database pool directly (not `*store.Queries`) because it runs raw SQL. Add after the `suggestH` line:

```go
	trendingH := handler.NewTrendingHandler(pool)
```

Add the route inside the `/api` route group:

```go
		r.Get("/trending-tags", trendingH.GetTrendingTags)
```

- [ ] **Step 3: Verify Go build**

Run: `cd backend && go build ./...`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add backend/internal/handler/trending.go backend/cmd/server/main.go
git commit -m "feat: add /api/trending-tags endpoint with history-driven tags"
```

---

### Task 6: Frontend API methods for suggest and trending

**Files:**
- Modify: `frontend/src/lib/api.ts`

Add `suggest()` and `trendingTags()` methods.

- [ ] **Step 1: Add the two new API methods**

In `frontend/src/lib/api.ts`, add these two methods to the `api` object (after the `search` method):

```typescript
  suggest: (q: string, signal?: AbortSignal) =>
    request<string[]>(`/api/suggest?q=${encodeURIComponent(q)}`, { signal }),
  trendingTags: () => request<{ tags: string[] }>('/api/trending-tags'),
```

Note: `suggest` accepts an optional `AbortSignal` for cancellation support.

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add suggest and trendingTags API methods"
```

---

### Task 7: SearchSuggestions dropdown component

**Files:**
- Create: `frontend/src/components/search/SearchSuggestions.tsx`

Renders a dropdown list of suggestion strings with keyboard navigation and click selection.

- [ ] **Step 1: Create the component**

Create `frontend/src/components/search/SearchSuggestions.tsx`:

```typescript
import { useEffect, useRef } from 'react';

interface SearchSuggestionsProps {
  suggestions: string[];
  highlightIndex: number;
  onSelect: (suggestion: string) => void;
  onClose: () => void;
}

export function SearchSuggestions({ suggestions, highlightIndex, onSelect, onClose }: SearchSuggestionsProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute left-0 right-0 top-full mt-2 bg-surface-container-high rounded-2xl border border-outline-variant/10 shadow-2xl shadow-black/30 overflow-hidden z-50"
    >
      {suggestions.map((s, i) => (
        <button
          key={s}
          onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
          className={`w-full text-left px-6 py-3 flex items-center gap-3 text-sm transition-colors ${
            i === highlightIndex
              ? 'bg-primary/10 text-on-surface'
              : 'text-on-surface-variant hover:bg-white/5'
          }`}
        >
          <span className="material-symbols-outlined text-base opacity-50">search</span>
          <span className="truncate">{s}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/search/SearchSuggestions.tsx
git commit -m "feat: add SearchSuggestions dropdown component"
```

---

### Task 8: Integrate suggestions into SearchInput

**Files:**
- Modify: `frontend/src/components/search/SearchInput.tsx`

Add debounced suggestion fetching, keyboard navigation, and the dropdown.

- [ ] **Step 1: Rewrite SearchInput with suggestion support**

Replace the entire contents of `frontend/src/components/search/SearchInput.tsx`:

```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { SearchSuggestions } from './SearchSuggestions';

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (q?: string) => void;
}

export function SearchInput({ value, onChange, onSubmit }: SearchInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchSuggestions = useCallback((q: string) => {
    // Clear previous
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (q.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const results = await api.suggest(q, controller.signal);
        setSuggestions(results);
        setHighlightIndex(-1);
        setShowSuggestions(results.length > 0);
      } catch {
        // Aborted or failed — ignore
      }
    }, 250);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleChange = (v: string) => {
    onChange(v);
    fetchSuggestions(v);
  };

  const selectSuggestion = (s: string) => {
    onChange(s);
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightIndex(-1);
    onSubmit(s);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') onSubmit();
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
          selectSuggestion(suggestions[highlightIndex]);
        } else {
          setShowSuggestions(false);
          onSubmit();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightIndex(-1);
        break;
    }
  };

  return (
    <div className="relative group">
      <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
        <span className="material-symbols-outlined text-primary text-3xl">search</span>
      </div>
      <input
        autoFocus
        className="w-full bg-surface-container-low border-none rounded-full py-8 pl-20 pr-8 text-2xl font-headline font-bold text-on-surface placeholder:text-on-surface-variant focus:ring-2 focus:ring-secondary/50 transition-all shadow-2xl shadow-primary/10 outline-none"
        placeholder="Search tracks, artists, or paste a YouTube URL..."
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
      />
      {showSuggestions && (
        <SearchSuggestions
          suggestions={suggestions}
          highlightIndex={highlightIndex}
          onSelect={selectSuggestion}
          onClose={() => setShowSuggestions(false)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update SearchRequestView to pass `onSubmit` with query argument**

In `frontend/src/pages/SearchRequestView.tsx`, the `SearchInput` `onSubmit` prop currently calls `() => handleSearch()`. The new `SearchInput` calls `onSubmit(q?)` where `q` is the suggestion text. The existing `handleSearch` already supports an optional `q` parameter, so change the prop:

```typescript
        <SearchInput value={query} onChange={setQuery} onSubmit={handleSearch} />
```

(Remove the arrow wrapper — pass `handleSearch` directly since its signature `(q?: string) => void` matches the new `onSubmit` prop.)

Also add logic to close suggestions when results appear — add after `setResults(data)` in `handleSearch`:

No change needed — the `SearchInput` internally closes suggestions on submit.

- [ ] **Step 3: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/search/SearchInput.tsx frontend/src/pages/SearchRequestView.tsx
git commit -m "feat: integrate search-as-you-type suggestions into SearchInput"
```

---

### Task 9: Dynamic trending tags

**Files:**
- Modify: `frontend/src/pages/SearchRequestView.tsx`

Fetch trending tags from the backend on mount, replacing the hardcoded array.

- [ ] **Step 1: Add trending tags fetch**

In `frontend/src/pages/SearchRequestView.tsx`, make these changes:

1. Add `useEffect` to the import:
```typescript
import { useState, useEffect } from 'react';
```

2. Change the hardcoded constant to a fallback:
```typescript
const fallbackTags = ['Phonk', 'Midnight Lo-fi', 'Cyberpunk 2077', 'Hyperpop', 'Synthwave', 'Chillhop'];
```

3. Inside the component, after the existing `useState` declarations, add:
```typescript
  const [trendingTags, setTrendingTags] = useState<string[]>(fallbackTags);

  useEffect(() => {
    api.trendingTags()
      .then((data) => {
        if (data.tags && data.tags.length > 0) {
          setTrendingTags(data.tags);
        }
      })
      .catch(() => {
        // Keep fallback tags
      });
  }, []);
```

4. Replace the reference to `trendingSuggestions` in the JSX (around line 70) with `trendingTags`:
```typescript
          {trendingTags.map((tag) => (
```

5. Remove the old `trendingSuggestions` constant (the `const trendingSuggestions = [...]` line).

- [ ] **Step 2: Verify types compile**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/SearchRequestView.tsx
git commit -m "feat: fetch dynamic trending tags from play history"
```

---

### Task 10: Final integration verification

**Files:** None new — verification only.

- [ ] **Step 1: Type check frontend**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 2: Build backend**

Run: `cd backend && go build ./...`
Expected: no errors

- [ ] **Step 3: Commit if any fixups needed**

If any issues were found and fixed:

```bash
git add -A
git commit -m "fix: address build issues in search refinements"
```
