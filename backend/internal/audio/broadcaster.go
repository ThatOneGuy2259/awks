package audio

import (
	"context"
	"io"
	"log"
	"os"
	"sync"
	"time"
)

// StreamClient represents a connected listener's channel.
type StreamClient struct {
	Ch chan []byte
}

// Broadcaster reads the current track's audio file at real-time pace
// and pushes OGG page data to all connected stream clients.
type Broadcaster struct {
	mu      sync.RWMutex
	clients map[*StreamClient]bool
	skipCh  chan struct{} // signal to stop current track
	wakeCh  chan struct{} // signal that a new track is available
	playing bool
}

func NewBroadcaster() *Broadcaster {
	return &Broadcaster{
		clients: make(map[*StreamClient]bool),
		skipCh:  make(chan struct{}, 1),
		wakeCh:  make(chan struct{}, 1),
	}
}

// Register adds a new stream client. Returns the client for later removal.
func (b *Broadcaster) Register() *StreamClient {
	c := &StreamClient{
		Ch: make(chan []byte, 64), // buffer ~64 OGG pages
	}
	b.mu.Lock()
	b.clients[c] = true
	b.mu.Unlock()
	return c
}

// Unregister removes a stream client.
func (b *Broadcaster) Unregister(c *StreamClient) {
	b.mu.Lock()
	if _, ok := b.clients[c]; ok {
		delete(b.clients, c)
		close(c.Ch)
	}
	b.mu.Unlock()
}

// broadcast sends data to all connected clients.
// Drops slow consumers whose buffers are full.
func (b *Broadcaster) broadcast(data []byte) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for c := range b.clients {
		select {
		case c.Ch <- data:
		default:
			// Slow consumer — drop them
			log.Println("[broadcaster] dropping slow consumer")
			go b.Unregister(c)
		}
	}
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

// Run is the main broadcaster loop. It calls getNextTrack to get the audio
// file path and start offset for the next track, and onTrackDone when a
// track finishes (either naturally or via skip). It blocks forever.
//
// getNextTrack returns (audioPath, startOffsetSec, error).
//   - audioPath "": no track available, broadcaster waits for Wake().
//   - startOffsetSec > 0: seek to that position (used for server restart mid-track).
//
// onTrackDone is called after each track finishes so the caller can advance the queue.
func (b *Broadcaster) Run(ctx context.Context, getNextTrack func() (string, float64, error), onTrackDone func(skipped bool)) {
	for {
		audioPath, startOffset, err := getNextTrack()
		if err != nil {
			log.Printf("[broadcaster] error getting next track: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		if audioPath == "" {
			// No track available — wait for wake signal
			select {
			case <-ctx.Done():
				return
			case <-b.wakeCh:
				continue
			}
		}

		skipped := b.streamFile(ctx, audioPath, startOffset)
		onTrackDone(skipped)
	}
}

// streamFile reads and broadcasts an OGG file at real-time pace.
// If startOffsetSec > 0, skips OGG pages until reaching that position
// (used when resuming after a server restart).
// Returns true if the track was skipped, false if it played to completion.
func (b *Broadcaster) streamFile(ctx context.Context, path string, startOffsetSec float64) bool {
	f, err := os.Open(path)
	if err != nil {
		log.Printf("[broadcaster] failed to open %s: %v", path, err)
		return false
	}
	defer f.Close()

	reader := NewOggReader(f)
	var lastGranule int64

	// If resuming mid-track, skip pages until we reach the target position
	if startOffsetSec > 0 {
		for {
			page, err := reader.ReadPage()
			if err != nil {
				log.Printf("[broadcaster] seek failed: %v", err)
				return false
			}
			if page.GranulePosition > 0 && GranuleToSeconds(page.GranulePosition) >= startOffsetSec {
				// Broadcast this page (first page at/past the target) and continue from here
				b.broadcast(page.Data)
				lastGranule = page.GranulePosition
				break
			}
		}
		log.Printf("[broadcaster] seeked to %.1fs in %s", startOffsetSec, path)
	}

	// startTime is when we started reading; granuleOffset accounts for seeking
	startTime := time.Now()
	granuleOffset := GranuleToSeconds(lastGranule)

	for {
		select {
		case <-ctx.Done():
			return false
		case <-b.skipCh:
			return true
		default:
		}

		page, err := reader.ReadPage()
		if err == io.EOF {
			return false // track finished naturally
		}
		if err != nil {
			log.Printf("[broadcaster] OGG read error: %v", err)
			return false
		}

		// Broadcast the page to all clients
		b.broadcast(page.Data)

		// Pace: sleep until the page's timestamp relative to our start
		if page.GranulePosition > 0 {
			pageTime := GranuleToSeconds(page.GranulePosition) - granuleOffset

			// How far ahead of real-time are we?
			elapsed := time.Since(startTime).Seconds()
			ahead := pageTime - elapsed
			if ahead > 0.005 { // only sleep if meaningfully ahead
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
			lastGranule = page.GranulePosition
		}
	}
}
