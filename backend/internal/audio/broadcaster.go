package audio

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"
)

// Broadcaster reads audio files at real-time pace and pipes OGG pages
// into an Icecast server as a source client via HTTP PUT.
type Broadcaster struct {
	icecastURL string
	mount      string
	password   string
	writer     io.Writer    // the PUT request body writer
	skipCh     chan struct{} // signal to stop current track
	wakeCh     chan struct{} // signal that a new track is available
}

func NewBroadcaster(icecastURL, mount, sourcePassword string) *Broadcaster {
	return &Broadcaster{
		icecastURL: icecastURL,
		mount:      mount,
		password:   sourcePassword,
		skipCh:     make(chan struct{}, 1),
		wakeCh:     make(chan struct{}, 1),
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

// connect opens a persistent HTTP PUT connection to Icecast as a source client.
// Returns a pipe writer that the caller writes OGG data into.
func (b *Broadcaster) connect(ctx context.Context) (io.WriteCloser, error) {
	pr, pw := io.Pipe()

	url := fmt.Sprintf("%s%s", b.icecastURL, b.mount)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, pr)
	if err != nil {
		pr.Close()
		pw.Close()
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.SetBasicAuth("source", b.password)
	req.Header.Set("Content-Type", "application/ogg")
	req.Header.Set("Ice-Name", "AWKS Radio")
	req.Header.Set("Ice-Description", "Fill the Awkward Silence")
	req.Header.Set("Ice-Genre", "Various")
	req.Header.Set("Ice-Public", "0")

	// Fire the request in a goroutine — it blocks until the pipe is closed
	go func() {
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			log.Printf("[broadcaster] icecast connection error: %v", err)
			pr.Close()
			return
		}
		defer resp.Body.Close()
		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			log.Printf("[broadcaster] icecast rejected source: %d %s", resp.StatusCode, string(body))
		}
		pr.Close()
	}()

	// Give Icecast a moment to accept the connection
	time.Sleep(200 * time.Millisecond)

	return pw, nil
}

// Run is the main broadcaster loop.
func (b *Broadcaster) Run(ctx context.Context, getNextTrack func() (string, float64, error), onTrackDone func(skipped bool)) {
	for {
		// Ensure we have an Icecast connection
		if b.writer == nil {
			pw, err := b.connect(ctx)
			if err != nil {
				log.Printf("[broadcaster] failed to connect to icecast: %v", err)
				time.Sleep(2 * time.Second)
				continue
			}
			b.writer = pw
			log.Println("[broadcaster] connected to icecast")
		}

		audioPath, startOffset, err := getNextTrack()
		if err != nil {
			log.Printf("[broadcaster] error getting next track: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		if audioPath == "" {
			select {
			case <-ctx.Done():
				if closer, ok := b.writer.(io.Closer); ok {
					closer.Close()
				}
				return
			case <-b.wakeCh:
				continue
			}
		}

		skipped := b.streamFile(ctx, audioPath, startOffset)
		onTrackDone(skipped)
	}
}

// write writes data to the Icecast connection. Returns false if the write failed
// (connection lost), signaling the caller to reconnect.
func (b *Broadcaster) write(data []byte) bool {
	if b.writer == nil {
		return false
	}
	_, err := b.writer.Write(data)
	if err != nil {
		log.Printf("[broadcaster] icecast write error: %v", err)
		if closer, ok := b.writer.(io.Closer); ok {
			closer.Close()
		}
		b.writer = nil
		return false
	}
	return true
}

// streamFile reads an OGG file and writes it to Icecast at real-time pace.
func (b *Broadcaster) streamFile(ctx context.Context, path string, startOffsetSec float64) bool {
	f, err := os.Open(path)
	if err != nil {
		log.Printf("[broadcaster] failed to open %s: %v", path, err)
		return false
	}
	defer f.Close()

	reader := NewOggReader(f)

	// Read and send the Opus header pages (ID header + comment header).
	// These must be sent at the start of each track so decoders can resync.
	for i := 0; i < 2; i++ {
		page, err := reader.ReadPage()
		if err != nil {
			log.Printf("[broadcaster] failed to read header page %d: %v", i, err)
			return false
		}
		if !b.write(page.Data) {
			return false
		}
	}

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
				if !b.write(page.Data) {
					return false
				}
				lastGranule = page.GranulePosition
				break
			}
		}
		log.Printf("[broadcaster] seeked to %.1fs in %s", startOffsetSec, path)
	}

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
			return false
		}
		if err != nil {
			log.Printf("[broadcaster] OGG read error: %v", err)
			return false
		}

		if !b.write(page.Data) {
			return false
		}

		if page.GranulePosition > 0 {
			pageTime := GranuleToSeconds(page.GranulePosition) - granuleOffset
			elapsed := time.Since(startTime).Seconds()
			ahead := pageTime - elapsed
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
			lastGranule = page.GranulePosition
		}
	}
}
