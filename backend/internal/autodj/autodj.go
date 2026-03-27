package autodj

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/mccann/awks3/backend/internal/store"
)

const (
	playlistURL    = "https://www.youtube.com/watch?v=GgVcgbtHY9k&list=PLBTanuC8SLeZUH4mYXFvRbDfxTMKvNLHJ"
	minTracksReady = 60
	SystemUserID   = "auto-dj"
)

var chicagoTZ *time.Location

func init() {
	var err error
	chicagoTZ, err = time.LoadLocation("America/Chicago")
	if err != nil {
		chicagoTZ = time.UTC
		log.Printf("[auto-dj] failed to load America/Chicago timezone: %v, falling back to UTC", err)
	}
}

// EnsureSystemUser creates the auto-dj system user if it doesn't exist.
func EnsureSystemUser(ctx context.Context, queries *store.Queries) {
	_, _ = queries.UpsertUser(ctx, store.UpsertUserParams{
		ID:       SystemUserID,
		Username: "Auto-DJ",
		Role:     "listener",
	})
}

// IsAutoDJTime checks the time window. If timeOverride is "true", always returns true.
func IsAutoDJTime(timeOverride string) bool {
	if timeOverride == "true" {
		return true
	}
	now := time.Now().In(chicagoTZ)
	day := now.Weekday()
	if day == time.Saturday || day == time.Sunday {
		return false
	}
	hour, min, _ := now.Clock()
	minuteOfDay := hour*60 + min
	return minuteOfDay >= 7*60+30 && minuteOfDay < 16*60
}

// TrackMeta is the metadata stored alongside each cached track.
type TrackMeta struct {
	Title    string `json:"title"`
	Artist   string `json:"artist"`
	Duration int    `json:"duration,omitempty"`
}

// PickRandomTrack returns a random track from the cache directory.
func PickRandomTrack(cacheDir string) (videoID, filePath, title, artist string, duration int, ok bool) {
	matches, _ := filepath.Glob(filepath.Join(cacheDir, "*.opus"))
	if len(matches) == 0 {
		return "", "", "", "", 0, false
	}
	pick := matches[time.Now().UnixNano()%int64(len(matches))]
	base := filepath.Base(pick)
	vid := strings.TrimSuffix(base, ".opus")

	// Try to read metadata sidecar
	title = vid
	metaPath := filepath.Join(cacheDir, vid+".json")
	if data, err := os.ReadFile(metaPath); err == nil {
		var meta TrackMeta
		if json.Unmarshal(data, &meta) == nil {
			if meta.Title != "" {
				title = meta.Title
			}
			artist = meta.Artist
			duration = meta.Duration
		}
	}

	// If duration is missing, get it from ffprobe
	if duration == 0 {
		duration = probeDuration(pick)
	}

	return vid, pick, title, artist, duration, true
}

// probeDuration gets the duration in seconds from an audio file using ffprobe.
func probeDuration(filePath string) int {
	cmd := exec.Command("ffprobe",
		"-v", "quiet",
		"-show_entries", "format=duration",
		"-of", "default=noprint_wrappers=1:nokey=1",
		filePath,
	)
	out, err := cmd.Output()
	if err != nil {
		return 0
	}
	if secs, err := strconv.ParseFloat(strings.TrimSpace(string(out)), 64); err == nil {
		return int(secs + 0.5)
	}
	return 0
}

// countCachedFiles returns the number of .opus files in the cache directory.
func countCachedFiles(cacheDir string) int {
	matches, _ := filepath.Glob(filepath.Join(cacheDir, "*.opus"))
	return len(matches)
}

// BackfillMetadata generates JSON sidecar files for any .opus files that don't have one.
func BackfillMetadata(ctx context.Context, ytdlpPath, cacheDir string) {
	matches, _ := filepath.Glob(filepath.Join(cacheDir, "*.opus"))
	for _, opusPath := range matches {
		base := filepath.Base(opusPath)
		vid := strings.TrimSuffix(base, ".opus")
		jsonPath := filepath.Join(cacheDir, vid+".json")

		// Skip if sidecar already exists
		if _, err := os.Stat(jsonPath); err == nil {
			continue
		}

		if ctx.Err() != nil {
			return
		}

		// Fetch title, uploader, and duration from yt-dlp
		cmd := exec.CommandContext(ctx, ytdlpPath,
			"--print", "%(title)s\n%(uploader)s\n%(duration)s",
			"--no-warnings",
			"--no-download",
			fmt.Sprintf("https://www.youtube.com/watch?v=%s", vid),
		)
		out, err := cmd.Output()
		if err != nil {
			log.Printf("[auto-dj] backfill metadata failed for %s: %v", vid, err)
			continue
		}

		lines := strings.SplitN(strings.TrimSpace(string(out)), "\n", 3)
		title := vid
		artist := ""
		dur := 0
		if len(lines) >= 1 && lines[0] != "" {
			title = lines[0]
		}
		if len(lines) >= 2 && lines[1] != "" {
			artist = lines[1]
		}
		if len(lines) >= 3 {
			if d, err := strconv.Atoi(strings.TrimSpace(lines[2])); err == nil {
				dur = d
			}
		}

		meta := TrackMeta{Title: title, Artist: artist, Duration: dur}
		if metaJSON, err := json.Marshal(meta); err == nil {
			os.WriteFile(jsonPath, metaJSON, 0644)
			log.Printf("[auto-dj] backfilled metadata: %s -> %s - %s", vid, title, artist)
		}
	}
}

// SyncPlaylist downloads tracks from the configured playlist that aren't already cached.
// Runs in the background at startup. Stops once minTracksReady files exist on disk.
func SyncPlaylist(ctx context.Context, ytdlpPath, cacheDir string) {
	if err := os.MkdirAll(cacheDir, 0755); err != nil {
		log.Printf("[auto-dj] failed to create cache dir: %v", err)
		return
	}

	// Clean up any leftover temp files from previous failed syncs
	tmpFiles, _ := filepath.Glob(filepath.Join(cacheDir, "*-tmp.*"))
	for _, f := range tmpFiles {
		os.Remove(f)
	}

	// Check how many files are already on disk
	fileCount := countCachedFiles(cacheDir)
	if fileCount >= minTracksReady {
		log.Printf("[auto-dj] already have %d files on disk (>= %d), skipping sync", fileCount, minTracksReady)
		return
	}

	log.Printf("[auto-dj] have %d files on disk, syncing playlist...", fileCount)

	// Fetch playlist metadata via yt-dlp
	cmd := exec.CommandContext(ctx, ytdlpPath,
		"--flat-playlist",
		"--dump-json",
		"--no-warnings",
		playlistURL,
	)
	output, err := cmd.Output()
	if err != nil {
		log.Printf("[auto-dj] failed to fetch playlist: %v", err)
		return
	}

	type playlistEntry struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Uploader string `json:"uploader"`
		Channel  string `json:"channel"`
	}

	var entries []playlistEntry
	for _, line := range strings.Split(strings.TrimSpace(string(output)), "\n") {
		if line == "" {
			continue
		}
		var e playlistEntry
		if err := json.Unmarshal([]byte(line), &e); err != nil {
			continue
		}
		entries = append(entries, e)
	}

	log.Printf("[auto-dj] playlist has %d entries", len(entries))

	for _, entry := range entries {
		if ctx.Err() != nil {
			return
		}
		if countCachedFiles(cacheDir) >= minTracksReady {
			log.Printf("[auto-dj] reached %d+ files, stopping", minTracksReady)
			return
		}

		// Skip if file already exists on disk
		outputPath := filepath.Join(cacheDir, entry.ID+".opus")
		if _, err := os.Stat(outputPath); err == nil {
			continue
		}

		// Clean up any leftover temp files for this entry
		leftover, _ := filepath.Glob(filepath.Join(cacheDir, entry.ID+"-tmp.*"))
		for _, f := range leftover {
			os.Remove(f)
		}

		// Download and convert
		if err := downloadTrack(ctx, ytdlpPath, entry.ID, outputPath); err != nil {
			log.Printf("[auto-dj] failed to download %s (%s): %v", entry.ID, entry.Title, err)
			continue
		}

		// Save metadata sidecar
		artist := entry.Uploader
		if artist == "" {
			artist = entry.Channel
		}
		meta := TrackMeta{Title: entry.Title, Artist: artist}
		if metaJSON, err := json.Marshal(meta); err == nil {
			os.WriteFile(filepath.Join(cacheDir, entry.ID+".json"), metaJSON, 0644)
		}

		log.Printf("[auto-dj] downloaded %d/%d: %s", countCachedFiles(cacheDir), minTracksReady, entry.Title)
	}

	log.Printf("[auto-dj] sync complete, %d tracks available", countCachedFiles(cacheDir))
}

func downloadTrack(ctx context.Context, ytdlpPath, videoID, outputPath string) error {
	tmpBase := outputPath + "-tmp"
	cmd := exec.CommandContext(ctx, ytdlpPath,
		"-f", "bestaudio",
		"--no-playlist",
		"--no-warnings",
		"-o", tmpBase+".%(ext)s",
		fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID),
	)

	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("yt-dlp: %w\n%s", err, string(output))
	}

	matches, _ := filepath.Glob(tmpBase + ".*")
	if len(matches) == 0 {
		return fmt.Errorf("no downloaded file found")
	}
	tmpPath := matches[0]

	repackCmd := exec.CommandContext(ctx, "ffmpeg", "-y", "-i", tmpPath,
		"-c:a", "libopus", "-b:a", "128k",
		"-page_duration", "20000",
		outputPath,
	)
	repackOut, repackErr := repackCmd.CombinedOutput()
	os.Remove(tmpPath)
	if repackErr != nil {
		return fmt.Errorf("ffmpeg: %w\n%s", repackErr, string(repackOut))
	}

	return nil
}
