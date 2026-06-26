package audio

import (
	"context"
	"os/exec"
	"strconv"
	"strings"
	"time"
)

// DetectBPM estimates the tempo of an audio file using the `aubio` CLI
// (aubio-tools). aubio reads opus directly (built with avcodec) and prints a
// single line like "105.21 bpm" to stdout. Returns the BPM and true on success;
// returns 0, false if aubio is missing, times out, or the output can't be parsed
// — callers treat BPM as a best-effort enrichment, never a hard requirement.
func DetectBPM(filePath string) (float64, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// `aubio tempo <file>` → "<float> bpm" on stdout (avcodec warnings go to stderr).
	out, err := exec.CommandContext(ctx, "aubio", "tempo", filePath).Output()
	if err != nil {
		return 0, false
	}

	fields := strings.Fields(string(out)) // e.g. ["105.21", "bpm"]
	if len(fields) == 0 {
		return 0, false
	}
	bpm, err := strconv.ParseFloat(fields[0], 64)
	if err != nil || bpm <= 0 || bpm > 400 {
		return 0, false
	}
	return bpm, true
}
