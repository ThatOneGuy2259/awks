package config

import (
	"os"
	"strings"

	"github.com/joho/godotenv"
	"github.com/pion/webrtc/v4"
)

type Config struct {
	Port           string
	DatabaseURL    string
	RedisURL       string
	ClerkSecretKey string
	YouTubeAPIKey  string
	CORSOrigin     string
	AudioCacheDir  string
	YtdlpPath      string
	ICEServers     []webrtc.ICEServer
	StaticDir      string
}

func Load() *Config {
	godotenv.Load()

	iceServers := parseICEServers(getEnv("WEBRTC_ICE_SERVERS", "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302"))

	return &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://awks:awks@localhost:5432/awks?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		ClerkSecretKey: getEnv("CLERK_SECRET_KEY", ""),
		YouTubeAPIKey:  getEnv("YOUTUBE_API_KEY", ""),
		CORSOrigin:     getEnv("CORS_ORIGIN", "http://localhost:5173"),
		AudioCacheDir:  getEnv("AUDIO_CACHE_DIR", "./audio-cache"),
		YtdlpPath:      getEnv("YTDLP_PATH", "yt-dlp"),
		ICEServers:     iceServers,
		StaticDir:      getEnv("STATIC_DIR", ""),
	}
}

func parseICEServers(raw string) []webrtc.ICEServer {
	if raw == "" {
		return nil
	}
	urls := strings.Split(raw, ",")
	return []webrtc.ICEServer{{URLs: urls}}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
