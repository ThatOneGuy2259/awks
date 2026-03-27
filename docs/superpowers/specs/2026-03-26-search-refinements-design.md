# Search Refinements Design

## Overview

Three improvements to the AWKS search experience: (1) search-as-you-type suggestions via YouTube's autocomplete API, (2) duration display on results with server-side filtering of over-limit tracks, and (3) dynamic trending tags driven by recent and all-time request history.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Suggestions source | YouTube Suggest API (not Data API v3) | No quota limits, designed for real-time typeahead, used by all major open-source YouTube frontends |
| Architecture | Backend-heavy — all YouTube calls proxied server-side | Centralized caching benefits all users, avoids CORS issues, keeps YouTube dependency server-side |
| Suggestion selection | Auto-fill + immediate search (Google-style) | Fastest path to results, matches user expectations |
| Over-limit tracks | Filter out server-side (never shown) | Clean UX, no confusing disabled results |
| Trending tags source | Recent 24h history + all-time backfill | Fresh when active, never empty during quiet periods |

## 1. Suggestions Endpoint & Caching

### Backend

**New endpoint:** `GET /api/suggest?q=...`

- Requires auth (same Clerk middleware as other endpoints)
- Validates: query must be 2-100 characters, otherwise returns empty array
- Proxies to: `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=<query>&xhr=t`
- Request headers: `Origin: https://www.youtube.com`, `Referer: https://www.youtube.com`
- Parses response JSON array, extracts suggestion strings from index 1
- Returns: `string[]` (up to 10 suggestions)
- Timeout: 2 second HTTP timeout to YouTube, return empty array on failure

**In-memory cache:**
- Key: lowercase trimmed query string
- Value: `string[]` of suggestions
- TTL: 5 minutes
- Implementation: Go map with mutex + expiry timestamps. No external dependency.
- Eviction: lazy (check expiry on read). Map grows bounded by query diversity — at 5-min TTL and typical usage, this stays small.

### Frontend

**New component:** `SearchSuggestions` — dropdown rendered below the search input.

**Debounce & cancellation:**
- 250ms debounce on input changes
- `AbortController` cancels in-flight suggestion requests when new input arrives
- Minimum 2 characters before firing a request
- Empty input clears suggestions

**Dropdown behavior:**
- Appears below search input when suggestions are available
- Each suggestion is a clickable row
- Clicking a suggestion: fills search input + triggers full search immediately
- Arrow Up/Down keys navigate through suggestions
- Enter on highlighted suggestion: selects it (fills + searches)
- Enter with no highlight: searches the raw input text (existing behavior)
- Escape or click outside: closes dropdown
- Dropdown closes automatically when full search results appear

**API integration:**
- New `api.suggest(q: string)` method in `frontend/src/lib/api.ts`
- Returns `string[]`

## 2. Duration Display & Filtering

### Backend

**Search handler change:** After collecting results from yt-dlp (or fallback), filter out any result where `duration_sec > 600`. Results with `duration_sec == 0` (missing duration from API/InnerTube fallback) are kept — they'll be validated at queue-add time.

This uses the same 600-second limit already enforced in `AddToQueue`. Single source of truth: extract the limit to a constant if not already.

### Frontend

**TrackCard change:** Display duration as a `M:SS` badge in the bottom-right corner of the thumbnail.

- Style: small pill with `bg-black/70 text-white text-xs px-1.5 py-0.5 rounded` — matches YouTube's duration badge pattern
- Position: absolute, bottom-right of thumbnail container
- Only shown when `duration_sec > 0`
- Format: `M:SS` (e.g., "3:42", "10:00")

**Shared utility:** Extract the existing `formatTime` function from `usePlaybackSync.ts` into a shared utility (e.g., `frontend/src/lib/formatTime.ts`) so both the player bar and track cards can use it.

## 3. Dynamic Trending Tags

### Backend

**New endpoint:** `GET /api/trending-tags`

- Requires auth
- Query: select `artist` from `play_history` table, grouped and counted
  - Primary: `SELECT artist, COUNT(*) as cnt FROM play_history WHERE played_at > NOW() - INTERVAL '24 hours' AND artist IS NOT NULL AND artist != '' GROUP BY artist ORDER BY cnt DESC LIMIT 8`
  - Backfill: if fewer than 6 results from recent, fill remaining slots from: `SELECT artist, COUNT(*) as cnt FROM play_history WHERE artist IS NOT NULL AND artist != '' GROUP BY artist ORDER BY cnt DESC LIMIT 8`
  - Deduplicate between recent and all-time sets
- Returns: `{ tags: string[] }` — 6-8 artist/query strings

**In-memory cache:**
- Single cached value (not keyed — one global result)
- TTL: 10 minutes
- Same lazy-expiry pattern as suggestion cache

### Frontend

**SearchRequestView change:**
- On mount, fetch `api.trendingTags()`
- Store in component state, replacing the hardcoded `suggestions` array
- Fallback: if fetch fails or returns empty, use the existing hardcoded tags: `['Phonk', 'Midnight Lo-fi', 'Cyberpunk 2077', 'Hyperpop', 'Synthwave', 'Chillhop']`
- Clicking a tag fills the search input and triggers full search (existing behavior, unchanged)

**API integration:**
- New `api.trendingTags()` method in `frontend/src/lib/api.ts`
- Returns `{ tags: string[] }`

## File Changes Summary

### Backend (new files)
- `backend/internal/handler/suggest.go` — suggestion endpoint handler + cache
- `backend/internal/handler/trending.go` — trending tags endpoint handler + cache

### Backend (modified files)
- `backend/cmd/server/main.go` — register new routes
- `backend/internal/handler/search.go` — add duration filtering to search results

### Frontend (new files)
- `frontend/src/components/search/SearchSuggestions.tsx` — suggestion dropdown component
- `frontend/src/lib/formatTime.ts` — shared time formatting utility

### Frontend (modified files)
- `frontend/src/lib/api.ts` — add `suggest()` and `trendingTags()` methods
- `frontend/src/components/search/SearchInput.tsx` — debounced suggestion fetching, dropdown integration
- `frontend/src/components/search/TrackCard.tsx` — duration badge on thumbnail
- `frontend/src/pages/SearchRequestView.tsx` — fetch trending tags on mount, pass suggestion state
- `frontend/src/hooks/usePlaybackSync.ts` — remove `formatTime` (moved to shared utility)

## Error Handling

- **Suggest endpoint fails:** Return empty array. Frontend shows no dropdown. Search still works on Enter.
- **Trending endpoint fails:** Frontend falls back to hardcoded tags.
- **YouTube suggest API down/slow:** 2-second timeout, return empty. Cache continues serving stale results until TTL expires.
- **Duration missing from results:** Keep the result, don't show duration badge. Queue-add-time validation is the safety net.
