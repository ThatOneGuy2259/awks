package audio

import (
	"encoding/binary"
	"fmt"
	"io"
)

// OggPage represents a single page from an OGG bitstream.
type OggPage struct {
	// GranulePosition is the codec-specific timestamp.
	// For Opus, this is the sample count at 48kHz.
	GranulePosition int64
	Data            []byte // the complete page including header
}

// OggReader reads pages from an OGG bitstream.
type OggReader struct {
	r io.Reader
}

func NewOggReader(r io.Reader) *OggReader {
	return &OggReader{r: r}
}

// ReadPage reads the next OGG page from the stream.
// Returns io.EOF when the stream is exhausted.
func (o *OggReader) ReadPage() (*OggPage, error) {
	// OGG page header is 27 bytes minimum
	header := make([]byte, 27)
	if _, err := io.ReadFull(o.r, header); err != nil {
		return nil, err
	}

	// Verify capture pattern "OggS"
	if string(header[0:4]) != "OggS" {
		return nil, fmt.Errorf("invalid OGG capture pattern: %q", header[0:4])
	}

	granulePos := int64(binary.LittleEndian.Uint64(header[6:14]))
	numSegments := int(header[26])

	// Read segment table
	segmentTable := make([]byte, numSegments)
	if _, err := io.ReadFull(o.r, segmentTable); err != nil {
		return nil, fmt.Errorf("failed to read segment table: %w", err)
	}

	// Calculate total data size from segment table
	dataSize := 0
	for _, s := range segmentTable {
		dataSize += int(s)
	}

	// Read page data
	pageData := make([]byte, dataSize)
	if _, err := io.ReadFull(o.r, pageData); err != nil {
		return nil, fmt.Errorf("failed to read page data: %w", err)
	}

	// Assemble complete page
	complete := make([]byte, 0, 27+numSegments+dataSize)
	complete = append(complete, header...)
	complete = append(complete, segmentTable...)
	complete = append(complete, pageData...)

	return &OggPage{
		GranulePosition: granulePos,
		Data:            complete,
	}, nil
}

// GranuleToSeconds converts an Opus granule position to seconds.
// Opus always uses 48kHz sample rate.
func GranuleToSeconds(granule int64) float64 {
	if granule < 0 {
		return 0
	}
	return float64(granule) / 48000.0
}
