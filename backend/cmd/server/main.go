package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"
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

	// Redis
	rdb, err := redisclient.New(cfg.RedisURL)
	if err != nil {
		log.Fatalf("failed to connect to redis: %v", err)
	}
	defer rdb.Close()

	queries := store.New(pool)

	// WebSocket Hub
	hub := ws.NewHub(nil) // onChange set below
	go hub.Run()

	// Playback Service
	playbackSvc := service.NewPlaybackService(queries, rdb, func(msg model.WSMessage) {
		hub.Broadcast(msg)
	})

	// Set hub onChange to broadcast listener updates
	hub = ws.NewHub(func() {
		listeners := hub.GetListeners()
		hub.Broadcast(model.WSMessage{
			Type: "LISTENER_UPDATE",
			Data: model.ListenerUpdateData{
				Count:     len(listeners),
				Listeners: listeners,
			},
		})
	})
	go hub.Run()

	// Rebuild playback service with the new hub
	playbackSvc = service.NewPlaybackService(queries, rdb, func(msg model.WSMessage) {
		hub.Broadcast(msg)
	})

	// Start sync ticker
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	playbackSvc.StartSyncTicker(ctx, hub.ListenerCount)

	// Resume playback if server restarts mid-track
	go func() {
		state, _ := playbackSvc.GetCurrentState(context.Background())
		if state != nil {
			elapsed := time.Since(state.StartedAt)
			remaining := time.Duration(state.DurationSec)*time.Second - elapsed
			if remaining > 0 {
				time.AfterFunc(remaining+5*time.Second, func() {
					playbackSvc.AdvanceQueue(context.Background())
				})
			} else {
				playbackSvc.AdvanceQueue(context.Background())
			}
		}
	}()

	// Handlers
	queueH := handler.NewQueueHandler(queries, playbackSvc, hub, cfg.YouTubeAPIKey)
	playbackH := handler.NewPlaybackHandler(playbackSvc)
	adminH := handler.NewAdminHandler(queries, playbackSvc, hub)
	wsH := handler.NewWSHandler(hub)
	historyH := handler.NewHistoryHandler(queries)
	searchH := handler.NewSearchHandler(cfg.YouTubeAPIKey)
	listenerH := handler.NewListenerHandler(hub)
	meH := handler.NewMeHandler(queries)

	// Router
	r := chi.NewRouter()
	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.CORSOrigin},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
	}))

	// WebSocket (no auth middleware for dev)
	r.Get("/ws", wsH.HandleWS)

	// API routes with auth
	r.Route("/api", func(r chi.Router) {
		r.Use(auth.ClerkMiddleware(cfg.ClerkSecretKey))

		r.Get("/queue", queueH.GetQueue)
		r.Post("/queue", queueH.AddToQueue)
		r.Delete("/queue/{id}", queueH.DeleteFromQueue)
		r.Post("/queue/{id}/skip-vote", queueH.CastSkipVote)
		r.Delete("/queue/{id}/skip-vote", queueH.RetractSkipVote)
		r.Get("/playback", playbackH.GetPlayback)
		r.Get("/history", historyH.GetHistory)
		r.Get("/listeners", listenerH.GetListeners)
		r.Get("/search", searchH.Search)
		r.Post("/me", meH.SyncMe)
		r.Get("/settings", adminH.GetSettings) // readable by all authenticated users

		// Admin routes
		r.Route("/admin", func(r chi.Router) {
			r.Use(auth.AdminOnly)
			r.Put("/settings", adminH.UpdateSettings)
			r.Post("/queue/{id}/move-to-top", adminH.MoveToTop)
			r.Post("/users/{id}/timeout", adminH.TimeoutUser)
			r.Delete("/users/{id}/timeout", adminH.RemoveTimeout)
			r.Get("/users/{id}/timeout", adminH.GetTimeout)
		})
	})

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
