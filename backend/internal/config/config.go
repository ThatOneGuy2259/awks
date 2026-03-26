package config

import (
	"os"

	"github.com/joho/godotenv"
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
}

func Load() *Config {
	godotenv.Load()

	return &Config{
		Port:           getEnv("PORT", "8080"),
		DatabaseURL:    getEnv("DATABASE_URL", "postgres://awks:awks@localhost:5432/awks?sslmode=disable"),
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		ClerkSecretKey: getEnv("CLERK_SECRET_KEY", ""),
		YouTubeAPIKey:  getEnv("YOUTUBE_API_KEY", ""),
		CORSOrigin:     getEnv("CORS_ORIGIN", "http://localhost:5173"),
		AudioCacheDir:  getEnv("AUDIO_CACHE_DIR", "./audio-cache"),
		YtdlpPath:      getEnv("YTDLP_PATH", "yt-dlp"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
