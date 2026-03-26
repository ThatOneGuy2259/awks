package audio

import (
	"bufio"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"log"
	"net"
	"net/url"
	"os"
	"strings"
	"time"
)

// Broadcaster reads audio files at real-time pace and pipes OGG pages
// into an Icecast server as a source client via raw HTTP PUT.
type Broadcaster struct {
	icecastURL string
	mount      string
	password   string
	conn       net.Conn     // raw TCP connection to Icecast
	writer     *bufio.Writer // buffered writer on top of conn
	skipCh     chan struct{}
	wakeCh     chan struct{}
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

// connect opens a raw TCP connection to Icecast and sends the HTTP PUT
// source request headers. Returns an error if the connection fails or
// Icecast rejects the source.
func (b *Broadcaster) connect() error {
	parsed, err := url.Parse(b.icecastURL)
	if err != nil {
		return fmt.Errorf("invalid icecast URL: %w", err)
	}

	host := parsed.Host
	if !strings.Contains(host, ":") {
		host += ":8000"
	}

	conn, err := net.DialTimeout("tcp", host, 5*time.Second)
	if err != nil {
		return fmt.Errorf("failed to connect to icecast at %s: %w", host, err)
	}

	// Send HTTP PUT request headers manually
	auth := base64.StdEncoding.EncodeToString([]byte("source:" + b.password))
	reqHeaders := fmt.Sprintf(
		"PUT %s HTTP/1.0\r\n"+
			"Authorization: Basic %s\r\n"+
			"Content-Type: application/ogg\r\n"+
			"Ice-Name: AWKS Radio\r\n"+
			"Ice-Description: Fill the Awkward Silence\r\n"+
			"Ice-Genre: Various\r\n"+
			"Ice-Public: 0\r\n"+
			"\r\n",
		b.mount, auth,
	)

	conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
	if _, err := conn.Write([]byte(reqHeaders)); err != nil {
		conn.Close()
		return fmt.Errorf("failed to send headers to icecast: %w", err)
	}

	// Read the response status line
	conn.SetReadDeadline(time.Now().Add(5 * time.Second))
	reader := bufio.NewReader(conn)
	statusLine, err := reader.ReadString('\n')
	if err != nil {
		conn.Close()
		return fmt.Errorf("failed to read icecast response: %w", err)
	}

	if !strings.Contains(statusLine, "200") {
		conn.Close()
		return fmt.Errorf("icecast rejected source: %s", strings.TrimSpace(statusLine))
	}

	// Drain remaining response headers
	for {
		line, err := reader.ReadString('\n')
		if err != nil || strings.TrimSpace(line) == "" {
			break
		}
	}

	// Clear deadlines for streaming
	conn.SetWriteDeadline(time.Time{})
	conn.SetReadDeadline(time.Time{})

	b.conn = conn
	b.writer = bufio.NewWriterSize(conn, 16384)

	return nil
}

func (b *Broadcaster) disconnect() {
	if b.writer != nil {
		b.writer.Flush()
		b.writer = nil
	}
	if b.conn != nil {
		b.conn.Close()
		b.conn = nil
	}
}

// write writes data to the Icecast connection. Returns false if the write failed.
func (b *Broadcaster) write(data []byte) bool {
	if b.writer == nil {
		return false
	}
	_, err := b.writer.Write(data)
	if err != nil {
		log.Printf("[broadcaster] icecast write error: %v", err)
		b.disconnect()
		return false
	}
	// Flush periodically to ensure data gets to Icecast
	if err := b.writer.Flush(); err != nil {
		log.Printf("[broadcaster] icecast flush error: %v", err)
		b.disconnect()
		return false
	}
	return true
}

// Run is the main broadcaster loop.
func (b *Broadcaster) Run(ctx context.Context, getNextTrack func() (string, float64, error), onTrackDone func(skipped bool)) {
	for {
		audioPath, startOffset, err := getNextTrack()
		if err != nil {
			log.Printf("[broadcaster] error getting next track: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}

		if audioPath == "" {
			// No track — disconnect from Icecast (avoid idle timeout) and wait
			b.disconnect()
			select {
			case <-ctx.Done():
				return
			case <-b.wakeCh:
				continue
			}
		}

		// Connect to Icecast right before streaming (fresh connection per track)
		if b.conn == nil {
			if err := b.connect(); err != nil {
				log.Printf("[broadcaster] %v, retrying in 2s...", err)
				time.Sleep(2 * time.Second)
				continue
			}
			log.Println("[broadcaster] connected to icecast")
		}

		skipped := b.streamFile(ctx, audioPath, startOffset)
		onTrackDone(skipped)
	}
}

// streamFile reads an OGG file and writes it to Icecast at real-time pace.
func (b *Broadcaster) streamFile(ctx context.Context, path string, startOffsetSec float64) bool {
	log.Printf("[broadcaster] streaming %s (offset=%.1fs)", path, startOffsetSec)

	f, err := os.Open(path)
	if err != nil {
		log.Printf("[broadcaster] failed to open %s: %v", path, err)
		return false
	}
	defer f.Close()

	reader := NewOggReader(f)

	// Read and send the Opus header pages (ID header + comment header).
	for i := 0; i < 2; i++ {
		page, err := reader.ReadPage()
		if err != nil {
			log.Printf("[broadcaster] failed to read header page %d: %v", i, err)
			return false
		}
		if !b.write(page.Data) {
			log.Printf("[broadcaster] failed to write header page %d to icecast", i)
			return false
		}
	}
	log.Printf("[broadcaster] sent OGG headers to icecast")

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
