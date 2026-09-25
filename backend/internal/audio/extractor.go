package audio

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"

	"github.com/mccann/awks3/backend/internal/store"
)

// extractTimeout caps a whole extraction (download + repack). User requests
// are at most 10 minutes of audio, so a healthy run is well under this.
const extractTimeout = 10 * time.Minute

// Extractor handles yt-dlp audio extraction for queued tracks.
type Extractor struct {
	ytdlpPath      string
	cacheDir       string
	queries        store.Querier
	onReady        func() // called when a track finishes extracting
	onStatusChange func() // called whenever audio_status changes (for WS broadcast)
	onFailed       func(queueID string) // called after a track is marked failed
	mu             sync.Mutex
	inProgress     map[string]bool // queue ID -> extracting
}

func NewExtractor(ytdlpPath, cacheDir string, queries store.Querier, onReady func(), onStatusChange func(), onFailed func(queueID string)) *Extractor {
	return &Extractor{
		ytdlpPath:      ytdlpPath,
		cacheDir:       cacheDir,
		queries:        queries,
		onReady:        onReady,
		onStatusChange: onStatusChange,
		onFailed:       onFailed,
		inProgress:     make(map[string]bool),
	}
}

// command builds an exec.Cmd that dies with ctx. It runs in its own process
// group so a timeout also kills children (yt-dlp spawns ffmpeg).
func command(ctx context.Context, name string, args ...string) *exec.Cmd {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	cmd.Cancel = func() error {
		return syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
	}
	cmd.WaitDelay = 5 * time.Second
	return cmd
}

// Extract starts an async extraction for the given queue item.
// It updates audio_status in the database as it progresses.
func (e *Extractor) Extract(queueID string, youtubeURL string) {
	e.mu.Lock()
	if e.inProgress[queueID] {
		e.mu.Unlock()
		return
	}
	e.inProgress[queueID] = true
	e.mu.Unlock()

	go func() {
		defer func() {
			e.mu.Lock()
			delete(e.inProgress, queueID)
			e.mu.Unlock()
		}()

		ctx, cancel := context.WithTimeout(context.Background(), extractTimeout)
		defer cancel()

		outputPath := filepath.Join(e.cacheDir, queueID+".opus")

		// fail marks the track failed and takes it out of the queue, so it
		// stops counting toward the requester's limit and can be re-added.
		fail := func() {
			e.queries.UpdateAudioStatus(context.Background(), store.UpdateAudioStatusParams{
				ID:          queueID,
				AudioStatus: "failed",
				AudioPath:   sql.NullString{},
			})
			e.queries.UpdateQueueStatus(context.Background(), store.UpdateQueueStatusParams{
				ID:     queueID,
				Status: "failed",
			})
			if e.onStatusChange != nil {
				e.onStatusChange()
			}
			if e.onFailed != nil {
				e.onFailed(queueID)
			}
		}

		// Mark as extracting
		e.queries.UpdateAudioStatus(context.Background(), store.UpdateAudioStatusParams{
			ID:          queueID,
			AudioStatus: "extracting",
			AudioPath:   sql.NullString{},
		})
		if e.onStatusChange != nil {
			e.onStatusChange()
		}

		// Run yt-dlp to download best available audio. Fall back to a combined
		// stream (e.g. format 18) when YouTube's anti-bot challenge hides the
		// audio-only formats — the ffmpeg repack below re-encodes to opus and
		// strips video either way.
		tmpBase := filepath.Join(e.cacheDir, queueID+"-tmp")
		cmd := command(ctx, e.ytdlpPath,
			"-f", "bestaudio/best",
			"--no-playlist",
			"--no-warnings",
			"-o", tmpBase+".%(ext)s",
			youtubeURL,
		)

		output, err := cmd.CombinedOutput()
		if err != nil {
			log.Printf("[extractor] yt-dlp failed for %s: %v\n%s", queueID, err, string(output))
			// Remove any partial download left by a timeout.
			partials, _ := filepath.Glob(tmpBase + ".*")
			for _, p := range partials {
				os.Remove(p)
			}
			fail()
			return
		}

		// Find the downloaded file (extension varies by source)
		matches, _ := filepath.Glob(tmpBase + ".*")
		if len(matches) == 0 {
			log.Printf("[extractor] no downloaded file found for %s", queueID)
			fail()
			return
		}
		tmpPath := matches[0]

		// Convert to Opus with loudness normalization and 20ms page duration (required for WebRTC)
		repackCmd := command(ctx, "ffmpeg", "-y", "-i", tmpPath,
			"-af", "loudnorm=I=-14:TP=-1:LRA=11",
			"-c:a", "libopus", "-b:a", "96k",
			"-page_duration", "20000",
			outputPath,
		)
		repackOut, repackErr := repackCmd.CombinedOutput()
		os.Remove(tmpPath)
		if repackErr != nil {
			log.Printf("[extractor] ffmpeg conversion failed for %s: %v\n%s", queueID, repackErr, string(repackOut))
			os.Remove(outputPath)
			fail()
			return
		}

		log.Printf("[extractor] extracted audio for %s -> %s", queueID, outputPath)

		// Estimate tempo (best-effort) before marking ready so the now-playing
		// payload carries an accurate BPM. ~1s; negligible vs the download above.
		if bpm, ok := DetectBPM(outputPath); ok {
			e.queries.SetBpm(context.Background(), store.SetBpmParams{
				ID:  queueID,
				Bpm: sql.NullFloat64{Float64: bpm, Valid: true},
			})
			log.Printf("[extractor] detected %.1f bpm for %s", bpm, queueID)
		}

		e.queries.UpdateAudioStatus(context.Background(), store.UpdateAudioStatusParams{
			ID:          queueID,
			AudioStatus: "ready",
			AudioPath:   sql.NullString{String: outputPath, Valid: true},
		})
		if e.onStatusChange != nil {
			e.onStatusChange()
		}

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
		log.Printf("[extractor] re-queuing extraction for %s", row.ID)
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
		activeSet[id] = true
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
