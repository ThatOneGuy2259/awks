package main

import (
	"context"
	"fmt"
	"log"
	"sync"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/go-chi/httprate"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/mccann/awks3/backend/internal/audio"
	"github.com/mccann/awks3/backend/internal/auth"
	"github.com/mccann/awks3/backend/internal/autodj"
	"github.com/mccann/awks3/backend/internal/config"
	"github.com/mccann/awks3/backend/internal/handler"
	"github.com/mccann/awks3/backend/internal/model"
	"github.com/mccann/awks3/backend/internal/service"
	"github.com/mccann/awks3/backend/internal/store"
	"github.com/mccann/awks3/backend/internal/ws"
)

func main() {
	cfg := config.Load()

	// Verify yt-dlp is available
	if _, err := exec.LookPath(cfg.YtdlpPath); err != nil {
		log.Fatalf("yt-dlp not found at %q: %v\nInstall it: https://github.com/yt-dlp/yt-dlp#installation", cfg.YtdlpPath, err)
	}

	// Ensure audio cache directory exists
	if err := os.MkdirAll(cfg.AudioCacheDir, 0755); err != nil {
		log.Fatalf("failed to create audio cache dir %q: %v", cfg.AudioCacheDir, err)
	}

	// Database
	pool, err := pgxpool.New(context.Background(), cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer pool.Close()

	// Run migrations
	if _, err := pool.Exec(context.Background(), readMigration("001_init.up.sql")); err != nil {
		log.Printf("migration 001 warning (may already exist): %v", err)
	}
	if _, err := pool.Exec(context.Background(), readMigration("002_drop_username_unique.up.sql")); err != nil {
		log.Printf("migration 002 warning: %v", err)
	}
	if _, err := pool.Exec(context.Background(), readMigration("003_audio_status.up.sql")); err != nil {
		log.Printf("migration 003 warning: %v", err)
	}
	if _, err := pool.Exec(context.Background(), readMigration("004_skip_mode.up.sql")); err != nil {
		log.Printf("migration 004 warning: %v", err)
	}
	if _, err := pool.Exec(context.Background(), readMigration("005_queue_position_seq.up.sql")); err != nil {
		log.Printf("migration 005 warning: %v", err)
	}
	if _, err := pool.Exec(context.Background(), readMigration("006_history_index.up.sql")); err != nil {
		log.Printf("migration 006 warning: %v", err)
	}
	if _, err := pool.Exec(context.Background(), readMigration("007_auto_dj.up.sql")); err != nil {
		log.Printf("migration 007 warning: %v", err)
	}

	// Clean up expired timeouts
	if _, err := pool.Exec(context.Background(), "DELETE FROM user_timeouts WHERE expires_at < now()"); err != nil {
		log.Printf("timeout cleanup warning: %v", err)
	}

	queries := store.New(pool)

	// Audio Broadcaster (WebRTC)
	broadcaster, err := audio.NewBroadcaster()
	if err != nil {
		log.Fatalf("failed to create broadcaster: %v", err)
	}

	// WebRTC Peer Manager
	peerManager := audio.NewPeerManager(broadcaster.Track(), cfg.ICEServers)

	// WebSocket Hub
	hub := ws.NewHub(nil)
	go hub.Run()

	// Set onChange after creation to avoid circular reference
	hub.SetOnChange(func() {
		listeners := hub.GetListeners()
		hub.Broadcast(model.WSMessage{
			Type: "LISTENER_UPDATE",
			Data: model.ListenerUpdateData{
				Count:     len(listeners),
				Listeners: listeners,
			},
		})
	})

	// Playback Service
	playbackSvc := service.NewPlaybackService(queries, func(msg model.WSMessage) {
		hub.Broadcast(msg)
	}, broadcaster)

	// Audio Extractor — onReady triggers AdvanceQueue if idle
	extractor := audio.NewExtractor(cfg.YtdlpPath, cfg.AudioCacheDir, queries, func() {
		state, _ := playbackSvc.GetCurrentState(context.Background())
		if state == nil {
			go playbackSvc.AdvanceQueue(context.Background())
		}
	}, func() {
		hub.Broadcast(model.WSMessage{Type: "QUEUE_UPDATE", Data: nil})
	})

	// Wire up next-track preloading
	playbackSvc.SetPreloadNext(func(ctx context.Context) {
		next, err := queries.GetNextPendingExtraction(ctx)
		if err != nil {
			return // no pending tracks to preload
		}
		log.Printf("[preload] starting extraction for next track: %s", next.VideoID)
		extractor.Extract(next.ID, next.YoutubeUrl)
	})

	// Wire up auto-DJ
	autodj.EnsureSystemUser(context.Background(), queries)
	autoDJCacheDir := filepath.Join(filepath.Dir(cfg.AudioCacheDir), "auto-dj-cache")
	autoDJBag := autodj.NewShuffleBag(autoDJCacheDir)
	var autoDJMu sync.Mutex
	playbackSvc.SetAutoDJQueue(func(ctx context.Context) bool {
		// Prevent concurrent auto-DJ inserts
		if !autoDJMu.TryLock() {
			return false
		}
		defer autoDJMu.Unlock()
		// Check admin toggle
		enabled, _ := queries.GetSetting(ctx, "auto_dj_enabled")
		if enabled != "true" {
			return false
		}
		// Check time window (with override option)
		timeOverride, _ := queries.GetSetting(ctx, "auto_dj_time_override")
		if !autodj.IsAutoDJTime(timeOverride) {
			return false
		}
		// Don't queue if there's already a pending/playing auto-DJ track
		djCount, _ := queries.CountPendingAutoDJ(ctx)
		if djCount > 0 {
			return false
		}
		// Pick next track from shuffle bag
		// Read max duration setting
		maxDurStr, _ := queries.GetSetting(ctx, "max_track_duration")
		maxDur := 600
		if n, err := strconv.Atoi(maxDurStr); err == nil && n > 0 {
			maxDur = n
		}

		// Try up to 5 times to find a track within the duration limit
		var videoID, filePath, title, artist string
		var duration int
		found := false
		for attempt := 0; attempt < 5; attempt++ {
			vid, fp, t, a, d, ok := autoDJBag.Pick()
			if !ok {
				log.Printf("[auto-dj] no tracks available on disk")
				return false
			}
			if d > 0 && d > maxDur {
				log.Printf("[auto-dj] skipping %s (%ds > %ds max)", t, d, maxDur)
				continue
			}
			videoID, filePath, title, artist, duration = vid, fp, t, a, d
			found = true
			break
		}
		if !found {
			log.Printf("[auto-dj] could not find a track within duration limit after 5 attempts")
			return false
		}

		log.Printf("[auto-dj] picked: videoID=%s file=%s title=%s", videoID, filePath, title)
		// Verify file exists
		if _, statErr := os.Stat(filePath); statErr != nil {
			log.Printf("[auto-dj] file not found: %s", filePath)
			return false
		}
		// Insert into queue with audio_status=ready and audio_path in one query
		_, err := pool.Exec(ctx,
			`INSERT INTO queue (youtube_url, video_id, title, artist, duration_sec, thumbnail_url, requested_by, position, audio_status, audio_path)
			 VALUES ($1, $2, $3, $4, $5, $6, $7, nextval('queue_position_seq'), 'ready', $8)`,
			fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID),
			videoID, title, artist, duration,
			fmt.Sprintf("https://img.youtube.com/vi/%s/hqdefault.jpg", videoID),
			"auto-dj", filePath,
		)
		if err != nil {
			log.Printf("[auto-dj] failed to insert queue item: %v", err)
			return false
		}
		log.Printf("[auto-dj] queued: %s - %s", title, artist)
		hub.Broadcast(model.WSMessage{Type: "QUEUE_UPDATE", Data: nil})
		return true
	})

	// Sync auto-DJ playlist and backfill metadata in background
	go func() {
		autodj.SyncPlaylist(context.Background(), cfg.YtdlpPath, autoDJCacheDir)
		autodj.BackfillMetadata(context.Background(), cfg.YtdlpPath, autoDJCacheDir)
	}()

	// Startup: clean orphan audio files and re-extract pending tracks
	extractor.CleanupOrphans(context.Background())
	extractor.ExtractPending(context.Background())

	// Start sync ticker
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	playbackSvc.StartSyncTicker(ctx, hub.ListenerCount)

	// Wire up crossfade hint
	broadcaster.OnCrossfadeHint = func() {
		hub.Broadcast(model.WSMessage{
			Type: "CROSSFADE_HINT",
			Data: map[string]float64{"fade_duration": 3.0},
		})
		log.Printf("[broadcaster] sent crossfade hint")
	}

	// Start broadcaster goroutine
	go broadcaster.Run(ctx, func() (string, float64, int, error) {
		path, err := playbackSvc.GetCurrentAudioPath(context.Background())
		if err != nil || path == "" {
			return "", 0, 0, nil
		}
		state, _ := playbackSvc.GetCurrentState(context.Background())
		var offset float64
		var dur int
		if state != nil {
			dur = state.DurationSec
			elapsed := time.Since(state.StartedAt).Seconds()
			if state.DurationSec > 0 && elapsed >= float64(state.DurationSec) {
				go playbackSvc.AdvanceQueue(context.Background())
				return "", 0, 0, nil
			}
			if elapsed > 1 {
				offset = elapsed
			}
		}
		return path, offset, dur, nil
	}, func(skipped bool) {
		playbackSvc.AdvanceQueue(context.Background())
	})

	// Resume playback on startup
	go func() {
		state, _ := playbackSvc.GetCurrentState(context.Background())
		if state != nil {
			broadcaster.Wake()
		} else {
			playbackSvc.AdvanceQueue(context.Background())
		}
	}()

	// Handlers
	queueH := handler.NewQueueHandler(queries, playbackSvc, hub, cfg.YouTubeAPIKey, cfg.YtdlpPath, extractor)
	playbackH := handler.NewPlaybackHandler(playbackSvc)
	adminH := handler.NewAdminHandler(queries, playbackSvc, hub)
	wsH := handler.NewWSHandler(hub, peerManager)
	historyH := handler.NewHistoryHandler(queries)
	searchH := handler.NewSearchHandler(cfg.YouTubeAPIKey, cfg.YtdlpPath, queries)
	suggestH := handler.NewSuggestHandler()
	trendingH := handler.NewTrendingHandler(pool)
	listenerH := handler.NewListenerHandler(hub)
	meH := handler.NewMeHandler(queries)

	// Router
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.Compress(5))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:  strings.Split(cfg.CORSOrigin, ","),
		AllowedMethods:  []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:  []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// WebSocket (no auth middleware)
	r.Get("/ws", wsH.HandleWS)

	// API routes with auth
	r.Route("/api", func(r chi.Router) {
		r.Use(auth.ClerkMiddleware(cfg.ClerkSecretKey))
		r.Use(httprate.LimitByIP(120, time.Minute)) // 120 requests per minute per IP

		r.Get("/queue", queueH.GetQueue)
		r.Post("/queue", queueH.AddToQueue)
		r.Delete("/queue/{id}", queueH.DeleteFromQueue)
		r.Post("/queue/{id}/skip-vote", queueH.CastSkipVote)
		r.Delete("/queue/{id}/skip-vote", queueH.RetractSkipVote)
		r.Get("/playback", playbackH.GetPlayback)
		r.Get("/history", historyH.GetHistory)
		r.Get("/listeners", listenerH.GetListeners)
		r.Get("/search", searchH.Search)
		r.Get("/suggest", suggestH.Suggest)
		r.Get("/trending-tags", trendingH.GetTrendingTags)
		r.Post("/me", meH.SyncMe)
		r.Get("/settings", adminH.GetSettings)

		// Admin routes
		r.Route("/admin", func(r chi.Router) {
			r.Use(auth.AdminOnly)
			r.Put("/settings", adminH.UpdateSettings)
			r.Post("/queue/{id}/move-to-top", adminH.MoveToTop)
			r.Post("/users/{id}/timeout", adminH.TimeoutUser)
			r.Delete("/users/{id}/timeout", adminH.RemoveTimeout)
			r.Get("/users/{id}/timeout", adminH.GetTimeout)
			r.Delete("/history/{id}", historyH.DeleteEntry)
			r.Delete("/history", historyH.ClearAll)
		})
	})

	// Serve frontend static files (SPA catch-all)
	if cfg.StaticDir != "" {
		staticDir := http.Dir(cfg.StaticDir)
		r.Get("/*", func(w http.ResponseWriter, r *http.Request) {
			// Try serving the exact file first
			path := strings.TrimPrefix(r.URL.Path, "/")
			if path == "" {
				path = "index.html"
			}
			fullPath := filepath.Join(cfg.StaticDir, path)
			if _, err := os.Stat(fullPath); err == nil {
				// Fingerprinted assets (assets/) are immutable — cache forever
				if strings.HasPrefix(path, "assets/") {
					w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
				}
				http.FileServer(staticDir).ServeHTTP(w, r)
				return
			}
			// SPA fallback: serve index.html for client-side routes (short cache)
			w.Header().Set("Cache-Control", "no-cache")
			http.ServeFile(w, r, filepath.Join(cfg.StaticDir, "index.html"))
		})
		log.Printf("Serving frontend from %s", cfg.StaticDir)
	}

	// Serve
	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: r,
	}

	go func() {
		log.Printf("AWKS server listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	srv.Shutdown(shutdownCtx)
	log.Println("server shut down gracefully")
}

func readMigration(filename string) string {
	data, err := os.ReadFile("db/migrations/" + filename)
	if err != nil {
		data, err = os.ReadFile("../../db/migrations/" + filename)
		if err != nil {
			log.Printf("could not read migration file %s: %v", filename, err)
			return ""
		}
	}
	return string(data)
}
