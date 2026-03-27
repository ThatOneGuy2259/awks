package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
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
	"github.com/mccann/awks3/backend/internal/config"
	"github.com/mccann/awks3/backend/internal/handler"
	"github.com/mccann/awks3/backend/internal/model"
	redisclient "github.com/mccann/awks3/backend/internal/redis"
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

	// Clean up expired timeouts
	if _, err := pool.Exec(context.Background(), "DELETE FROM user_timeouts WHERE expires_at < now()"); err != nil {
		log.Printf("timeout cleanup warning: %v", err)
	}

	// Redis
	rdb, err := redisclient.New(cfg.RedisURL)
	if err != nil {
		log.Fatalf("failed to connect to redis: %v", err)
	}
	defer rdb.Close()

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
	playbackSvc := service.NewPlaybackService(queries, rdb, func(msg model.WSMessage) {
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

	// Startup: clean orphan audio files and re-extract pending tracks
	extractor.CleanupOrphans(context.Background())
	extractor.ExtractPending(context.Background())

	// Start sync ticker
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	playbackSvc.StartSyncTicker(ctx, hub.ListenerCount)

	// Start broadcaster goroutine
	go broadcaster.Run(ctx, func() (string, float64, error) {
		path, err := playbackSvc.GetCurrentAudioPath(context.Background())
		if err != nil || path == "" {
			return "", 0, nil
		}
		state, _ := playbackSvc.GetCurrentState(context.Background())
		var offset float64
		if state != nil {
			elapsed := time.Since(state.StartedAt).Seconds()
			// Don't seek past the track duration — if the track already ended,
			// return empty so the broadcaster advances instead of seeking into EOF
			if elapsed >= float64(state.DurationSec) {
				return "", 0, nil
			}
			if elapsed > 1 {
				offset = elapsed
			}
		}
		return path, offset, nil
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
	queueH := handler.NewQueueHandler(queries, playbackSvc, hub, cfg.YouTubeAPIKey, extractor)
	playbackH := handler.NewPlaybackHandler(playbackSvc)
	adminH := handler.NewAdminHandler(queries, playbackSvc, hub)
	wsH := handler.NewWSHandler(hub, peerManager)
	historyH := handler.NewHistoryHandler(queries)
	searchH := handler.NewSearchHandler(cfg.YouTubeAPIKey, cfg.YtdlpPath)
	suggestH := handler.NewSuggestHandler()
	trendingH := handler.NewTrendingHandler(pool)
	listenerH := handler.NewListenerHandler(hub)
	meH := handler.NewMeHandler(queries)

	// Router
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
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
		r.Use(httprate.LimitByIP(60, time.Minute)) // 60 requests per minute per IP

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
				http.FileServer(staticDir).ServeHTTP(w, r)
				return
			}
			// SPA fallback: serve index.html for client-side routes
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
