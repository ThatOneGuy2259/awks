package service

import (
	"context"
	"database/sql"
	"log"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/mccann/awks3/backend/internal/audio"
	"github.com/mccann/awks3/backend/internal/model"
	"github.com/mccann/awks3/backend/internal/store"
)

type PlaybackService struct {
	queries      store.Querier
	state        *model.PlaybackState // in-memory playback state (replaces Redis)
	wsbroadcast  func(msg model.WSMessage)
	broadcaster  *audio.Broadcaster
	preloadNext  func(ctx context.Context)
	autoDJQueue  func(ctx context.Context) bool // returns true if an auto-DJ track was queued
	cleanupCh    chan string // audio file paths to delete after a delay
	mu           sync.Mutex
}

func NewPlaybackService(q store.Querier, wsbroadcast func(model.WSMessage), broadcaster *audio.Broadcaster) *PlaybackService {
	s := &PlaybackService{
		queries:     q,
		wsbroadcast: wsbroadcast,
		broadcaster: broadcaster,
		cleanupCh:   make(chan string, 64),
	}
	// Single goroutine handles all deferred audio file cleanup
	go func() {
		for path := range s.cleanupCh {
			time.Sleep(30 * time.Second)
			os.Remove(path)
			log.Printf("[playback] cleaned up audio file: %s", path)
		}
	}()
	return s
}

// SetPreloadNext sets the callback to preload the next track after advancing.
func (s *PlaybackService) SetPreloadNext(fn func(ctx context.Context)) {
	s.preloadNext = fn
}

// SetAutoDJQueue sets the callback to queue an auto-DJ track when the queue is empty.
func (s *PlaybackService) SetAutoDJQueue(fn func(ctx context.Context) bool) {
	s.autoDJQueue = fn
}

func (s *PlaybackService) GetCurrentState(ctx context.Context) (*model.PlaybackState, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.state, nil
}

// AdvanceQueue marks the current track as played and starts the next ready track.
// The broadcaster calls this — it no longer uses time.AfterFunc.
func (s *PlaybackService) AdvanceQueue(ctx context.Context) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Mark current track as played
	current, err := s.queries.GetCurrentlyPlaying(ctx)
	if err == nil {
		s.queries.UpdateQueueStatus(ctx, store.UpdateQueueStatusParams{
			ID:     current.ID,
			Status: "played",
		})
		s.queries.InsertHistory(ctx, store.InsertHistoryParams{
			ID:          uuid.New().String(),
			VideoID:     current.VideoID,
			Title:       current.Title,
			Artist:      current.Artist,
			DurationSec: current.DurationSec,
			RequestedBy: current.RequestedBy,
			PlayedAt:    time.Now().UTC().Format(time.RFC3339),
			Skipped:     0,
		})
		s.queries.DeleteSkipVotesForTrack(ctx, current.ID)

		// Schedule audio file cleanup (skip auto-DJ tracks — they're permanent)
		if current.AudioPath.Valid && !strings.Contains(current.AudioPath.String, "auto-dj-cache") {
			select {
			case s.cleanupCh <- current.AudioPath.String:
			default:
			}
		}
	}

	// Get next pending track with audio ready
	next, err := s.queries.GetNextReadyPending(ctx)
	if err != nil {
		// No tracks ready — try auto-DJ
		if s.autoDJQueue != nil && s.autoDJQueue(ctx) {
			// Auto-DJ queued a track, retry
			next, err = s.queries.GetNextReadyPending(ctx)
		}
		if err != nil {
			log.Println("No more tracks in queue, entering idle state")
			s.state = nil
			s.wsbroadcast(model.WSMessage{
				Type: "TRACK_CHANGE",
				Data: model.TrackChangeData{VideoID: ""},
			})
			return
		}
	}

	// Mark as playing
	s.queries.UpdateQueueStatus(ctx, store.UpdateQueueStatusParams{
		ID:     next.ID,
		Status: "playing",
	})

	now := time.Now().UTC()

	requesterName := next.RequesterName
	if next.RequestedBy == "auto-dj" {
		requesterName = "Auto-DJ"
	}

	state := &model.PlaybackState{
		QueueID:        next.ID,
		VideoID:        next.VideoID,
		Title:          next.Title,
		Artist:         nullStringToString(next.Artist),
		Thumbnail:      nullStringToString(next.ThumbnailUrl),
		StartedAt:      now,
		DurationSec:    int(next.DurationSec),
		RequestedBy:    next.RequestedBy,
		RequesterName:  requesterName,
		RequesterAvatar: nullStringToString(next.RequesterAvatar),
	}
	s.state = state

	s.wsbroadcast(model.WSMessage{
		Type: "TRACK_CHANGE",
		Data: model.TrackChangeData{
			QueueID:        state.QueueID,
			VideoID:        state.VideoID,
			Title:          state.Title,
			Artist:         state.Artist,
			StartedAt:      now.Format(time.RFC3339),
			DurationSec:    state.DurationSec,
			RequestedBy:    state.RequestedBy,
			RequesterName:  state.RequesterName,
			RequesterAvatar: state.RequesterAvatar,
		},
	})

	// Wake the broadcaster — it will pick up the new track
	s.broadcaster.Wake()

	// Preload the next track in queue so it's ready when this one finishes
	if s.preloadNext != nil {
		go s.preloadNext(ctx)
	}
}

func (s *PlaybackService) SkipCurrent(ctx context.Context, reason string) {
	s.mu.Lock()

	current, err := s.queries.GetCurrentlyPlaying(ctx)
	if err != nil {
		s.mu.Unlock()
		return
	}

	s.queries.UpdateQueueStatus(ctx, store.UpdateQueueStatusParams{
		ID:     current.ID,
		Status: "played",
	})
	s.queries.InsertHistory(ctx, store.InsertHistoryParams{
		ID:          uuid.New().String(),
		VideoID:     current.VideoID,
		Title:       current.Title,
		Artist:      current.Artist,
		DurationSec: current.DurationSec,
		RequestedBy: current.RequestedBy,
		PlayedAt:    time.Now().UTC().Format(time.RFC3339),
		Skipped:     1,
	})
	s.queries.DeleteSkipVotesForTrack(ctx, current.ID)

	// Schedule audio file cleanup (skip auto-DJ tracks — they're permanent)
	if current.AudioPath.Valid && !strings.Contains(current.AudioPath.String, "auto-dj-cache") {
		select {
		case s.cleanupCh <- current.AudioPath.String:
		default:
		}
	}

	s.mu.Unlock()

	s.wsbroadcast(model.WSMessage{
		Type: "TRACK_SKIPPED",
		Data: map[string]string{"queue_id": current.ID, "reason": reason},
	})

	// Tell broadcaster to stop current track
	s.broadcaster.Skip()
}

// GetCurrentAudioPath returns the audio file path for the currently playing track.
func (s *PlaybackService) GetCurrentAudioPath(ctx context.Context) (string, error) {
	current, err := s.queries.GetCurrentlyPlaying(ctx)
	if err != nil {
		return "", err
	}
	if !current.AudioPath.Valid {
		log.Printf("[playback] audio_path is NULL for track %s (%s)", current.VideoID, current.Title)
		return "", nil
	}
	return current.AudioPath.String, nil
}

func (s *PlaybackService) StartSyncTicker(ctx context.Context, getListenerCount func() int) {
	ticker := time.NewTicker(10 * time.Second)
	go func() {
		for {
			select {
			case <-ctx.Done():
				ticker.Stop()
				return
			case <-ticker.C:
				s.mu.Lock()
				state := s.state
				s.mu.Unlock()
				if state == nil {
					continue
				}
				elapsed := time.Since(state.StartedAt).Seconds()
				s.wsbroadcast(model.WSMessage{
					Type: "SYNC",
					Data: model.SyncData{
						VideoID:             state.VideoID,
						ExpectedPositionSec: elapsed,
						ListenersCount:      getListenerCount(),
					},
				})
			}
		}
	}()
}

func nullStringToString(t sql.NullString) string {
	if t.Valid {
		return t.String
	}
	return ""
}
