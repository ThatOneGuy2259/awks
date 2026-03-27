package service

import (
	"context"
	"log"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mccann/awks3/backend/internal/audio"
	"github.com/mccann/awks3/backend/internal/model"
	redisclient "github.com/mccann/awks3/backend/internal/redis"
	"github.com/mccann/awks3/backend/internal/store"
)

type PlaybackService struct {
	queries     store.Querier
	redis       *redisclient.Client
	wsbroadcast func(msg model.WSMessage)
	broadcaster *audio.Broadcaster
	preloadNext func(ctx context.Context) // called after advancing to preload the next track
	mu          sync.Mutex
}

func NewPlaybackService(q store.Querier, r *redisclient.Client, wsbroadcast func(model.WSMessage), broadcaster *audio.Broadcaster) *PlaybackService {
	return &PlaybackService{
		queries:     q,
		redis:       r,
		wsbroadcast: wsbroadcast,
		broadcaster: broadcaster,
	}
}

// SetPreloadNext sets the callback to preload the next track after advancing.
func (s *PlaybackService) SetPreloadNext(fn func(ctx context.Context)) {
	s.preloadNext = fn
}

func (s *PlaybackService) GetCurrentState(ctx context.Context) (*model.PlaybackState, error) {
	return s.redis.GetPlaybackState(ctx)
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
			VideoID:     current.VideoID,
			Title:       current.Title,
			Artist:      current.Artist,
			DurationSec: current.DurationSec,
			RequestedBy: current.RequestedBy,
			PlayedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
			Skipped:     false,
		})
		s.queries.DeleteSkipVotesForTrack(ctx, current.ID)

		// Schedule audio file cleanup
		if current.AudioPath.Valid {
			go func(path string) {
				time.Sleep(30 * time.Second)
				os.Remove(path)
				log.Printf("[playback] cleaned up audio file: %s", path)
			}(current.AudioPath.String)
		}
	}

	// Get next pending track with audio ready
	next, err := s.queries.GetNextReadyPending(ctx)
	if err != nil {
		log.Println("No more tracks in queue, entering idle state")
		s.redis.ClearPlaybackState(ctx)
		s.wsbroadcast(model.WSMessage{
			Type: "TRACK_CHANGE",
			Data: model.TrackChangeData{VideoID: ""},
		})
		return
	}

	// Mark as playing
	s.queries.UpdateQueueStatus(ctx, store.UpdateQueueStatusParams{
		ID:     next.ID,
		Status: "playing",
	})

	now := time.Now().UTC()

	// Look up requester name and avatar
	var requesterName, requesterAvatar string
	if user, err := s.queries.GetUser(ctx, next.RequestedBy); err == nil {
		requesterName = user.Username
		if user.AvatarUrl.Valid {
			requesterAvatar = user.AvatarUrl.String
		}
	}

	state := &model.PlaybackState{
		QueueID:        next.ID.String(),
		VideoID:        next.VideoID,
		Title:          next.Title,
		Artist:         pgTextToString(next.Artist),
		Thumbnail:      pgTextToString(next.ThumbnailUrl),
		StartedAt:      now,
		DurationSec:    int(next.DurationSec),
		RequestedBy:    next.RequestedBy,
		RequesterName:  requesterName,
		RequesterAvatar: requesterAvatar,
	}
	s.redis.SetPlaybackState(ctx, state)

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
		VideoID:     current.VideoID,
		Title:       current.Title,
		Artist:      current.Artist,
		DurationSec: current.DurationSec,
		RequestedBy: current.RequestedBy,
		PlayedAt:    pgtype.Timestamptz{Time: time.Now(), Valid: true},
		Skipped:     true,
	})
	s.queries.DeleteSkipVotesForTrack(ctx, current.ID)

	// Schedule audio file cleanup
	if current.AudioPath.Valid {
		go func(path string) {
			time.Sleep(30 * time.Second)
			os.Remove(path)
			log.Printf("[playback] cleaned up audio file: %s", path)
		}(current.AudioPath.String)
	}

	s.mu.Unlock()

	s.wsbroadcast(model.WSMessage{
		Type: "TRACK_SKIPPED",
		Data: map[string]string{"queue_id": current.ID.String(), "reason": reason},
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
				state, err := s.redis.GetPlaybackState(ctx)
				if err != nil || state == nil {
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

func pgTextToString(t pgtype.Text) string {
	if t.Valid {
		return t.String
	}
	return ""
}
