package model

import "time"

type PlaybackState struct {
	QueueID        string    `json:"queue_id"`
	VideoID        string    `json:"video_id"`
	Title          string    `json:"title"`
	Artist         string    `json:"artist"`
	Thumbnail      string    `json:"thumbnail_url"`
	StartedAt      time.Time `json:"started_at"`
	DurationSec    int       `json:"duration_sec"`
	RequestedBy    string    `json:"requested_by"`
	RequesterName  string    `json:"requester_name"`
	RequesterAvatar string   `json:"requester_avatar"`
	Bpm            float64   `json:"bpm"` // estimated tempo; 0 = unknown
}

type QueueTrack struct {
	ID             string    `json:"id"`
	YouTubeURL     string    `json:"youtube_url"`
	VideoID        string    `json:"video_id"`
	Title          string    `json:"title"`
	Artist         string    `json:"artist"`
	DurationSec    int       `json:"duration_sec"`
	ThumbnailURL   string    `json:"thumbnail_url"`
	RequestedBy    string    `json:"requested_by"`
	RequesterName  string    `json:"requester_name"`
	RequesterAvatar string   `json:"requester_avatar"`
	Position       int       `json:"position"`
	Status         string    `json:"status"`
	AudioStatus    string    `json:"audio_status"`
	CreatedAt      time.Time `json:"created_at"`
	Bpm            float64   `json:"bpm"` // estimated tempo; 0 = unknown
}

type Listener struct {
	ID        string `json:"id"`
	Username  string `json:"username"`
	AvatarURL string `json:"avatar_url"`
}

type ChatMessage struct {
	User      Listener  `json:"user"`
	Text      string    `json:"text"`
	Timestamp time.Time `json:"timestamp"`
}

type WSMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type TrackChangeData struct {
	QueueID        string `json:"queue_id"`
	VideoID        string `json:"video_id"`
	Title          string `json:"title"`
	Artist         string `json:"artist"`
	StartedAt      string `json:"started_at"`
	DurationSec    int    `json:"duration_sec"`
	RequestedBy    string `json:"requested_by"`
	RequesterName  string `json:"requester_name"`
	RequesterAvatar string `json:"requester_avatar"`
	Bpm            float64 `json:"bpm"` // estimated tempo; 0 = unknown
}

type SyncData struct {
	VideoID            string  `json:"video_id"`
	ExpectedPositionSec float64 `json:"expected_position_sec"`
	ListenersCount     int     `json:"listeners_count"`
}

type SkipVoteUpdateData struct {
	QueueID       string `json:"queue_id"`
	Votes         int    `json:"votes"`
	VotesRequired int    `json:"votes_required"`
}

type ListenerUpdateData struct {
	Count     int        `json:"count"`
	Listeners []Listener `json:"listeners"`
}

type SettingsUpdateData struct {
	SkipVotesRequired int    `json:"skip_votes_required"`
	SkipMode          string `json:"skip_mode"`
	SkipPercent       int    `json:"skip_percent"`
	MaxTracksPerUser  int    `json:"max_tracks_per_user"`
}
