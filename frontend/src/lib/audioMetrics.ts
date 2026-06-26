// Derived audio metrics — a tiny analysis layer on top of the existing
// AnalyserNode frequency data. Computed once per frame by the main visualizer
// loop (useVisualizer) so nothing else has to re-read the analyser, and exposed
// as a shared mutable object (like `barHeights`) that any system can read.
//
// This is the foundation for beat-/energy-reactive effects: beat-pulse bars,
// onset flashes, drop/build detection, loudness→brightness, hue-by-timbre, etc.
// Add new derived fields here rather than re-deriving them in each consumer.

export interface AudioMetrics {
  rms: number;      // 0..1 overall loudness (smoothed)
  bass: number;     // 0..1 low-frequency energy (instantaneous)
  treble: number;   // 0..1 high-frequency energy (smoothed)
  centroid: number; // 0..1 spectral centroid — timbral "brightness" (smoothed)
  beat: boolean;    // true only on the frame a beat onset is detected
  pulse: number;    // 0..1 — snaps up on a beat then decays; drive visuals with this
  bpm: number;      // tempo from the server (aubio, per-track); 0 = unknown
  bpmConfidence: number; // 1 when the server tempo is known, else 0
  beatPhase: number; // 0..1 sawtooth locked to the tempo grid (0 at each beat) — drive on-beat anims
}

export const audioMetrics: AudioMetrics = {
  rms: 0,
  bass: 0,
  treble: 0,
  centroid: 0,
  beat: false,
  pulse: 0,
  bpm: 0,
  bpmConfidence: 0,
  beatPhase: 0,
};

let emaBass = 0;       // running average of bass energy (beat baseline)
let lastTime = 0;      // ms timestamp of previous update (for dt)
let lastBeatTime = 0;  // ms timestamp of last accepted beat (refractory)

const REFRACTORY_MS = 120;  // min gap between beats (~500 bpm ceiling)
const BEAT_FLOOR = 0.18;    // ignore beats when bass is near silent
const BEAT_RATIO = 1.35;    // bass must exceed this × its running average

// ── Tempo (#54) ─────────────────────────────────────────────────────────────
// Tempo is computed server-side at ingest (aubio, per track) and pushed in via
// setServerBpm — accurate and instant, no browser estimation. We keep the value
// only to drive `beatPhase`, the tempo-locked 0→1 ramp on-beat effects sync to.
let beatPeriodMs = 0; // 60000/bpm — phase advance rate; 0 when tempo unknown
let serverBpm = 0;    // authoritative tempo from the backend (0 = unknown)

/**
 * Supply the server's per-track BPM (computed at ingest by aubio). The single
 * source of tempo. Pass 0 to clear it (track still extracting / unknown), which
 * also zeroes the tempo-locked phase period so beatPhase falls back to pulse.
 */
export function setServerBpm(bpm: number): void {
  serverBpm = bpm > 0 ? bpm : 0;
  audioMetrics.bpm = serverBpm > 0 ? Math.round(serverBpm) : 0;
  audioMetrics.bpmConfidence = serverBpm > 0 ? 1 : 0;
  beatPeriodMs = serverBpm > 0 ? 60000 / serverBpm : 0;
}

/**
 * Update the shared `audioMetrics` from a frame of byte frequency data.
 * Pass the same Uint8Array the caller already filled via getByteFrequencyData
 * so we don't double-read the analyser.
 */
export function updateAudioMetrics(freq: Uint8Array): void {
  const n = freq.length;
  if (n === 0) return;

  const now = performance.now();
  const dt = lastTime ? now - lastTime : 16;
  lastTime = now;

  const bassEnd = Math.max(1, Math.floor(n * 0.08));
  const trebleStart = Math.floor(n * 0.5);

  let sum = 0, bassSum = 0, trebleSum = 0, weighted = 0;
  for (let i = 0; i < n; i++) {
    const v = freq[i];
    sum += v;
    weighted += v * i;
    if (i < bassEnd) bassSum += v;
    else if (i >= trebleStart) trebleSum += v;
  }

  const rms = sum / n / 255;
  const bass = bassSum / bassEnd / 255;
  const treble = trebleSum / Math.max(1, n - trebleStart) / 255;
  const centroid = sum > 0 ? weighted / sum / n : 0;

  // Frame-rate-independent smoothing for the slow-moving metrics.
  const sm = Math.exp(-dt / 120); // ~120ms time constant
  audioMetrics.rms = audioMetrics.rms * sm + rms * (1 - sm);
  audioMetrics.treble = audioMetrics.treble * sm + treble * (1 - sm);
  audioMetrics.centroid = audioMetrics.centroid * sm + centroid * (1 - sm);
  audioMetrics.bass = bass;

  // Beat = bass energy spiking above its own running average.
  const baselineTau = Math.exp(-dt / 220);
  emaBass = emaBass * baselineTau + bass * (1 - baselineTau);

  let beat = false;
  if (bass > BEAT_FLOOR && bass > emaBass * BEAT_RATIO && now - lastBeatTime > REFRACTORY_MS) {
    beat = true;
    lastBeatTime = now;
  }
  audioMetrics.beat = beat;

  if (beat) {
    const intensity = Math.min(1, Math.max(0.4, (bass - emaBass) * 3));
    if (intensity > audioMetrics.pulse) audioMetrics.pulse = intensity;
  } else {
    audioMetrics.pulse *= Math.exp(-dt / 140); // decay over ~140ms
    if (audioMetrics.pulse < 0.001) audioMetrics.pulse = 0;
  }

  // ── Tempo-locked phase: ramps 0→1 over one beat period, snaps to 0 on beats ─
  if (beatPeriodMs > 0) {
    audioMetrics.beatPhase += dt / beatPeriodMs;
    if (beat) audioMetrics.beatPhase = 0; // hard re-sync to detected onsets
    audioMetrics.beatPhase -= Math.floor(audioMetrics.beatPhase); // wrap to [0,1)
  } else {
    audioMetrics.beatPhase = audioMetrics.pulse; // fallback when tempo unknown
  }
}
