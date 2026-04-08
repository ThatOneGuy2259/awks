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
	"sync"
	"time"

	"github.com/mccann/awks3/backend/internal/store"
)

var playlistURLs = []string{
	"https://music.youtube.com/watch?v=LJNiMJvnxT0&list=OLAK5uy_l9tVtOqp3cp8P_ajvkbPEpNdBbkSHzIP8",
	"https://music.youtube.com/playlist?list=OLAK5uy_nqZhqerW6fOvpJVbVB9yWMbnpDcJ6wz80",
}

// blacklistedVideoIDs are tracks that should never be picked by the auto-DJ,
// even if they're cached on disk.
var blacklistedVideoIDs = map[string]bool{
	"y0tHBFsenr8": true, // LoFi Concentration Glow
}

const SystemUserID = "auto-dj"

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

// ShuffleBag holds a shuffled list of tracks that gets refilled when exhausted.
type ShuffleBag struct {
	mu       sync.Mutex
	cacheDir string
	remaining []string // video IDs not yet played
}

func NewShuffleBag(cacheDir string) *ShuffleBag {
	return &ShuffleBag{cacheDir: cacheDir}
}

// refill reloads all .opus files from disk and shuffles them.
func (b *ShuffleBag) refill() {
	matches, _ := filepath.Glob(filepath.Join(b.cacheDir, "*.opus"))
	b.remaining = make([]string, 0, len(matches))
	for _, m := range matches {
		vid := strings.TrimSuffix(filepath.Base(m), ".opus")
		if blacklistedVideoIDs[vid] {
			continue
		}
		b.remaining = append(b.remaining, vid)
	}
	// Fisher-Yates shuffle
	for i := len(b.remaining) - 1; i > 0; i-- {
		j := int(time.Now().UnixNano() % int64(i+1))
		b.remaining[i], b.remaining[j] = b.remaining[j], b.remaining[i]
	}
	log.Printf("[auto-dj] shuffle bag refilled with %d tracks", len(b.remaining))
}

// Pick returns the next track from the bag, refilling if empty.
func (b *ShuffleBag) Pick() (videoID, filePath, title, artist string, duration int, ok bool) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if len(b.remaining) == 0 {
		b.refill()
	}
	if len(b.remaining) == 0 {
		return "", "", "", "", 0, false
	}

	// Pop the last element
	vid := b.remaining[len(b.remaining)-1]
	b.remaining = b.remaining[:len(b.remaining)-1]

	filePath = filepath.Join(b.cacheDir, vid+".opus")
	title = vid
	artist = ""

	// Read metadata sidecar
	metaPath := filepath.Join(b.cacheDir, vid+".json")
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
		duration = probeDuration(filePath)
	}

	return vid, filePath, title, artist, duration, true
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
	missing := 0
	for _, opusPath := range matches {
		vid := strings.TrimSuffix(filepath.Base(opusPath), ".opus")
		jsonPath := filepath.Join(cacheDir, vid+".json")
		if _, err := os.Stat(jsonPath); err == nil {
			continue
		}
		missing++
	}
	if missing == 0 {
		return
	}
	log.Printf("[auto-dj] backfilling metadata for %d tracks...", missing)
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

// SyncPlaylist downloads tracks from the configured playlists that aren't already cached.
// Runs in the background at startup.
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

	log.Printf("[auto-dj] syncing playlists...")

	type playlistEntry struct {
		ID       string `json:"id"`
		Title    string `json:"title"`
		Uploader string `json:"uploader"`
		Channel  string `json:"channel"`
	}

	// Fetch playlist metadata from all playlists via yt-dlp
	var entries []playlistEntry
	for _, plURL := range playlistURLs {
		cmd := exec.CommandContext(ctx, ytdlpPath,
			"--flat-playlist",
			"--dump-json",
			"--no-warnings",
			plURL,
		)
		output, err := cmd.Output()
		if err != nil {
			log.Printf("[auto-dj] failed to fetch playlist %s: %v", plURL, err)
			continue
		}
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
	}
	if len(entries) == 0 {
		log.Printf("[auto-dj] no entries found from any playlist")
		return
	}

	log.Printf("[auto-dj] playlist has %d entries", len(entries))

	for _, entry := range entries {
		if ctx.Err() != nil {
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

		log.Printf("[auto-dj] downloaded: %s", entry.Title)
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
		"-af", "loudnorm=I=-14:TP=-1:LRA=11",
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
