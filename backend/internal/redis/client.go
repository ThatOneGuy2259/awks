package redis

import (
	"context"
	"encoding/json"
	"time"

	"github.com/mccann/awks3/backend/internal/model"
	goredis "github.com/redis/go-redis/v9"
)

type Client struct {
	rdb *goredis.Client
}

func New(url string) (*Client, error) {
	opts, err := goredis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	rdb := goredis.NewClient(opts)
	if err := rdb.Ping(context.Background()).Err(); err != nil {
		return nil, err
	}
	return &Client{rdb: rdb}, nil
}

const playbackKey = "playback:current"

func (c *Client) SetPlaybackState(ctx context.Context, state *model.PlaybackState) error {
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return c.rdb.Set(ctx, playbackKey, data, 0).Err()
}

func (c *Client) GetPlaybackState(ctx context.Context) (*model.PlaybackState, error) {
	data, err := c.rdb.Get(ctx, playbackKey).Bytes()
	if err == goredis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var state model.PlaybackState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, err
	}
	return &state, nil
}

func (c *Client) ClearPlaybackState(ctx context.Context) error {
	return c.rdb.Del(ctx, playbackKey).Err()
}

func (c *Client) SetTrackTimer(ctx context.Context, queueID string, duration time.Duration) error {
	return c.rdb.Set(ctx, "track:timer:"+queueID, "1", duration).Err()
}

func (c *Client) Close() error {
	return c.rdb.Close()
}
