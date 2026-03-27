package audio

import (
	"context"
	"fmt"
	"log"
	"math"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/mccann/awks3/backend/internal/store"
)

// Extractor handles yt-dlp audio extraction for queued tracks.
type Extractor struct {
	ytdlpPath  string
	cacheDir   string
	queries    store.Querier
	onReady    func() // called when a track finishes extracting
	mu         sync.Mutex
	inProgress map[string]bool // queue ID -> extracting
}

func NewExtractor(ytdlpPath, cacheDir string, queries store.Querier, onReady func()) *Extractor {
	return &Extractor{
		ytdlpPath:  ytdlpPath,
		cacheDir:   cacheDir,
		queries:    queries,
		onReady:    onReady,
		inProgress: make(map[string]bool),
	}
}

// Extract starts an async extraction for the given queue item.
// It updates audio_status in the database as it progresses.
func (e *Extractor) Extract(queueID pgtype.UUID, youtubeURL string) {
	idStr := queueID.String()

	e.mu.Lock()
	if e.inProgress[idStr] {
		e.mu.Unlock()
		return
	}
	e.inProgress[idStr] = true
	e.mu.Unlock()

	go func() {
		defer func() {
			e.mu.Lock()
			delete(e.inProgress, idStr)
			e.mu.Unlock()
		}()

		outputPath := filepath.Join(e.cacheDir, idStr+".opus")

		// Mark as extracting
		e.queries.UpdateAudioStatus(context.Background(), store.UpdateAudioStatusParams{
			ID:          queueID,
			AudioStatus: "extracting",
			AudioPath:   pgtype.Text{},
		})

		// Run yt-dlp to download best available audio
		tmpBase := filepath.Join(e.cacheDir, idStr+"-tmp")
		cmd := exec.Command(e.ytdlpPath,
			"-f", "bestaudio",
			"--no-playlist",
			"--no-warnings",
			"-o", tmpBase+".%(ext)s",
			youtubeURL,
		)

		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("[extractor] yt-dlp failed for %s: %v\n%s", idStr, err, string(output))
			e.queries.UpdateAudioStatus(context.Background(), store.UpdateAudioStatusParams{
				ID:          queueID,
				AudioStatus: "failed",
				AudioPath:   pgtype.Text{},
			})
			return
		}

		// Find the downloaded file (extension varies by source)
		matches, _ := filepath.Glob(tmpBase + ".*")
		if len(matches) == 0 {
			log.Printf("[extractor] no downloaded file found for %s", idStr)
			e.queries.UpdateAudioStatus(context.Background(), store.UpdateAudioStatusParams{
				ID:          queueID,
				AudioStatus: "failed",
				AudioPath:   pgtype.Text{},
			})
			return
		}
		tmpPath := matches[0]

		// Convert to Opus with 20ms page duration (required for WebRTC)
		repackCmd := exec.Command("ffmpeg", "-y", "-i", tmpPath,
			"-c:a", "libopus", "-b:a", "128k",
			"-page_duration", "20000",
			outputPath,
		)
		repackOut, repackErr := repackCmd.CombinedOutput()
		os.Remove(tmpPath)
		if repackErr != nil {
			log.Printf("[extractor] ffmpeg conversion failed for %s: %v\n%s", idStr, repackErr, string(repackOut))
			e.queries.UpdateAudioStatus(context.Background(), store.UpdateAudioStatusParams{
				ID:          queueID,
				AudioStatus: "failed",
				AudioPath:   pgtype.Text{},
			})
			return
		}

		log.Printf("[extractor] extracted audio for %s -> %s", idStr, outputPath)

		// Get real duration from yt-dlp
		durCmd := exec.Command(e.ytdlpPath, "--print", "duration", "--no-warnings", youtubeURL)
		if durOut, durErr := durCmd.Output(); durErr == nil {
			if secs, parseErr := strconv.ParseFloat(strings.TrimSpace(string(durOut)), 64); parseErr == nil && secs > 0 {
				e.queries.UpdateDuration(context.Background(), store.UpdateDurationParams{
					ID:          queueID,
					DurationSec: int32(math.Round(secs)),
				})
				log.Printf("[extractor] updated duration for %s: %.0fs", idStr, secs)
			}
		}

		e.queries.UpdateAudioStatus(context.Background(), store.UpdateAudioStatusParams{
			ID:          queueID,
			AudioStatus: "ready",
			AudioPath:   pgtype.Text{String: outputPath, Valid: true},
		})

		if e.onReady != nil {
			e.onReady()
		}
	}()
}

// ExtractPending re-queues extraction for any tracks that need it.
// Called at server startup.
func (e *Extractor) ExtractPending(ctx context.Context) {
	rows, err := e.queries.GetPendingExtractions(ctx)
	if err != nil {
		log.Printf("[extractor] failed to get pending extractions: %v", err)
		return
	}
	for _, row := range rows {
		log.Printf("[extractor] re-queuing extraction for %s", row.ID.String())
		e.Extract(row.ID, row.YoutubeUrl)
	}
}

// CleanupOrphans removes audio files that don't belong to active queue items.
func (e *Extractor) CleanupOrphans(ctx context.Context) error {
	activeIDs, err := e.queries.GetActiveQueueIDs(ctx)
	if err != nil {
		return fmt.Errorf("failed to get active queue IDs: %w", err)
	}

	activeSet := make(map[string]bool)
	for _, id := range activeIDs {
		activeSet[id.String()] = true
	}

	matches, err := filepath.Glob(filepath.Join(e.cacheDir, "*.opus"))
	if err != nil {
		return err
	}

	for _, path := range matches {
		base := filepath.Base(path)
		id := base[:len(base)-len(".opus")]
		if !activeSet[id] {
			log.Printf("[extractor] cleaning up orphan: %s", path)
			os.Remove(path)
		}
	}
	return nil
}
