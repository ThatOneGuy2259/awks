package service

import (
	"context"
	"log"
	"time"

	"github.com/mccann/awks3/backend/internal/model"
	"github.com/mccann/awks3/backend/internal/store"
)

// LoadQueue returns the pending and playing tracks in play order.
func LoadQueue(ctx context.Context, q store.Querier) ([]model.QueueTrack, error) {
	rows, err := q.GetQueue(ctx)
	if err != nil {
		return nil, err
	}

	tracks := make([]model.QueueTrack, 0, len(rows))
	for _, row := range rows {
		var createdAt time.Time
		if t, err := time.Parse(time.RFC3339, row.CreatedAt); err == nil {
			createdAt = t
		}
		tracks = append(tracks, model.QueueTrack{
			ID:              row.ID,
			YouTubeURL:      row.YoutubeUrl,
			VideoID:         row.VideoID,
			Title:           row.Title,
			Artist:          nullStringToString(row.Artist),
			DurationSec:     int(row.DurationSec),
			ThumbnailURL:    nullStringToString(row.ThumbnailUrl),
			RequestedBy:     row.RequestedBy,
			RequesterName:   row.RequesterName,
			RequesterAvatar: nullStringToString(row.RequesterAvatar),
			Position:        int(row.Position),
			Status:          row.Status,
			AudioStatus:     row.AudioStatus,
			CreatedAt:       createdAt,
			Bpm:             nullFloatToFloat(row.Bpm),
		})
	}
	return tracks, nil
}

// QueueUpdateMessage builds a QUEUE_UPDATE carrying the full queue, so clients
// apply it directly instead of each refetching GET /api/queue. On a load error
// Data is nil and clients fall back to refetching.
func QueueUpdateMessage(ctx context.Context, q store.Querier) model.WSMessage {
	msg := model.WSMessage{Type: "QUEUE_UPDATE"}
	tracks, err := LoadQueue(ctx, q)
	if err != nil {
		log.Printf("[queue] load for QUEUE_UPDATE failed: %v", err)
		return msg
	}
	msg.Data = tracks
	return msg
}
