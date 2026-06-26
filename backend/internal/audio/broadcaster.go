package audio

import (
	"context"
	"io"
	"log"
	"os"
	"runtime/debug"
	"time"

	"github.com/pion/webrtc/v4"
	"github.com/pion/webrtc/v4/pkg/media"
	"github.com/pion/webrtc/v4/pkg/media/oggreader"
)

// Broadcaster reads OGG/Opus audio files and writes Opus samples to a
// shared WebRTC track at real-time pace. All peer connections that have
// this track added will receive the audio.
type Broadcaster struct {
	track           *webrtc.TrackLocalStaticSample
	skipCh          chan struct{}
	wakeCh          chan struct{}
	OnCrossfadeHint func() // called when track is ~3s from ending
}

func NewBroadcaster() (*Broadcaster, error) {
	track, err := webrtc.NewTrackLocalStaticSample(
		webrtc.RTPCodecCapability{MimeType: webrtc.MimeTypeOpus, ClockRate: 48000, Channels: 2},
		"audio",
		"awks-radio",
	)
	if err != nil {
		return nil, err
	}
	return &Broadcaster{
		track:  track,
		skipCh: make(chan struct{}, 1),
		wakeCh: make(chan struct{}, 1),
	}, nil
}

// Track returns the shared audio track that should be added to each peer connection.
func (b *Broadcaster) Track() *webrtc.TrackLocalStaticSample {
	return b.track
}

// Skip signals the broadcaster to stop the current track immediately.
func (b *Broadcaster) Skip() {
	select {
	case b.skipCh <- struct{}{}:
	default:
	}
}

// Wake signals the broadcaster that a new track may be available.
func (b *Broadcaster) Wake() {
	select {
	case b.wakeCh <- struct{}{}:
	default:
	}
}

// Run is the main broadcaster loop. Each iteration is supervised so that a
// panic while fetching or streaming a track is recovered and logged instead
// of crashing the whole process (an unrecovered panic in any goroutine takes
// down the entire Go program, silencing every listener). Run only returns
// when ctx is cancelled.
// getNextTrack returns (audioPath, startOffset, durationSec, error).
func (b *Broadcaster) Run(ctx context.Context, getNextTrack func() (string, float64, int, error), onTrackDone func(skipped bool)) {
	for {
		if ctx.Err() != nil {
			return
		}
		if stop := b.runOnce(ctx, getNextTrack, onTrackDone); stop {
			return
		}
	}
}

// runOnce processes a single track (or waits for one) with panic recovery.
// It returns true only when ctx is done and the loop should exit. Any panic
// is recovered, logged with a stack trace, and the loop continues with a
// short backoff so a repeatable panic can't become a hot crash loop.
func (b *Broadcaster) runOnce(ctx context.Context, getNextTrack func() (string, float64, int, error), onTrackDone func(skipped bool)) (stop bool) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[broadcaster] PANIC recovered: %v\n%s", r, debug.Stack())
			time.Sleep(time.Second)
			stop = false
		}
	}()

	audioPath, startOffset, durationSec, err := getNextTrack()
	if err != nil {
		log.Printf("[broadcaster] error getting next track: %v", err)
		time.Sleep(2 * time.Second)
		return false
	}

	if audioPath == "" {
		select {
		case <-ctx.Done():
			return true
		case <-b.wakeCh:
			return false
		}
	}

	log.Printf("[broadcaster] streaming %s (offset=%.1fs, duration=%ds)", audioPath, startOffset, durationSec)
	skipped := b.streamFile(ctx, audioPath, startOffset, durationSec)
	onTrackDone(skipped)
	return false
}

// streamFile reads an OGG/Opus file and writes samples to the WebRTC track at real-time pace.
func (b *Broadcaster) streamFile(ctx context.Context, path string, startOffsetSec float64, durationSec int) bool {
	f, err := os.Open(path)
	if err != nil {
		log.Printf("[broadcaster] failed to open %s: %v", path, err)
		return false
	}
	defer f.Close()

	ogg, _, err := oggreader.NewWith(f)
	if err != nil {
		log.Printf("[broadcaster] failed to create ogg reader: %v", err)
		return false
	}

	// Read pages, calculate timing from granule positions
	var lastGranule uint64

	// If resuming mid-track, skip pages until target position
	if startOffsetSec > 0 {
		targetGranule := uint64(startOffsetSec * 48000)
		for {
			pageData, pageHeader, err := ogg.ParseNextPage()
			if err != nil {
				log.Printf("[broadcaster] seek failed: %v", err)
				return false
			}
			_ = pageData
			if pageHeader.GranulePosition >= targetGranule {
				lastGranule = pageHeader.GranulePosition
				break
			}
		}
		log.Printf("[broadcaster] seeked to %.1fs", startOffsetSec)
	}

	startTime := time.Now()
	startGranule := lastGranule
	crossfadeHintSent := false
	// Calculate the granule position where we should send the crossfade hint (3s before end)
	var crossfadeGranule uint64
	if durationSec > 3 {
		crossfadeGranule = uint64((durationSec - 3)) * 48000
	}

	for {
		select {
		case <-ctx.Done():
			return false
		case <-b.skipCh:
			return true
		default:
		}

		pageData, pageHeader, err := ogg.ParseNextPage()
		if err == io.EOF {
			return false
		}
		if err != nil {
			log.Printf("[broadcaster] OGG read error: %v", err)
			return false
		}

		// Calculate sample duration from granule difference
		sampleCount := pageHeader.GranulePosition - lastGranule
		if sampleCount == 0 {
			// Header pages have granule 0, skip timing for them
			continue
		}
		sampleDuration := time.Duration(float64(sampleCount) / 48000.0 * float64(time.Second))

		// Write the Opus sample to the shared track
		if err := b.track.WriteSample(media.Sample{
			Data:     pageData,
			Duration: sampleDuration,
		}); err != nil {
			log.Printf("[broadcaster] WriteSample error: %v", err)
			return false
		}

		if lastGranule == 0 || pageHeader.GranulePosition%480000 == 0 {
			log.Printf("[broadcaster] wrote sample: %d bytes, duration=%v, granule=%d", len(pageData), sampleDuration, pageHeader.GranulePosition)
		}

		lastGranule = pageHeader.GranulePosition

		// Send crossfade hint 3 seconds before track ends
		if !crossfadeHintSent && crossfadeGranule > 0 && pageHeader.GranulePosition >= crossfadeGranule {
			crossfadeHintSent = true
			if b.OnCrossfadeHint != nil {
				b.OnCrossfadeHint()
			}
		}

		// Pace: sleep to maintain real-time playback
		pageTimeSec := float64(pageHeader.GranulePosition-startGranule) / 48000.0
		elapsed := time.Since(startTime).Seconds()
		ahead := pageTimeSec - elapsed
		if ahead > 0.005 {
			sleepTimer := time.NewTimer(time.Duration(ahead * float64(time.Second)))
			select {
			case <-sleepTimer.C:
			case <-b.skipCh:
				sleepTimer.Stop()
				return true
			case <-ctx.Done():
				sleepTimer.Stop()
				return false
			}
		}
	}
}
