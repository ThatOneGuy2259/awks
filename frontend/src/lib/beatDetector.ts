/**
 * Beat detector using MilkDrop-style per-band envelope following.
 *
 * Instead of comparing energy to a rolling average (which fails in bass-heavy music),
 * this tracks per-band auto-normalized envelopes with fast attack and slow decay.
 * A "beat" is when the attack envelope exceeds the long-term average by a threshold.
 *
 * Also uses sub-band spectral flux and kick confirmation (low + high band co-occurrence)
 * to distinguish real kicks from sustained bass.
 */

class BandEnvelope {
  avg = 0;    // long-term average (slow)
  att = 0;    // attack envelope (fast rise, slow fall)
  peak = 0.001; // recent peak for auto-gain

  update(raw: number) {
    // Auto-gain: normalize against recent peak
    this.peak = Math.max(this.peak * 0.998, raw, 0.001);
    const norm = raw / this.peak;

    // Long-term average
    this.avg = this.avg * 0.993 + norm * 0.007;

    // Attack envelope: fast rise, slow fall
    if (norm > this.att) {
      this.att = this.att * 0.3 + norm * 0.7;  // fast attack
    } else {
      this.att = this.att * 0.96 + norm * 0.04; // slow decay
    }
  }

  // How much this band is spiking above its baseline (0 = normal, >0.5 = impactful)
  get impact(): number {
    if (this.avg < 0.01) return 0;
    return Math.max(0, this.att / this.avg - 1.0);
  }
}

const MIN_KICK_INTERVAL = 150; // ms

export class BeatDetector {
  private bass = new BandEnvelope();   // bins 0-1: 0-350Hz (sub + kick)
  private mid = new BandEnvelope();    // bins 2-8: 350-1550Hz (snare, punch)
  private high = new BandEnvelope();   // bins 9-40: 1550-7000Hz (hats, clicks, transients)

  private prevSpectrum: Float32Array;
  private data: Uint8Array<ArrayBuffer>; // reused each frame to avoid per-frame allocation
  private lastKickTime = 0;

  // Output values for visuals
  kickIntensity = 0;
  bassEnergy = 0;
  onsetIntensity = 0;

  constructor(binCount: number) {
    this.prevSpectrum = new Float32Array(binCount);
    this.data = new Uint8Array(binCount);
  }

  update(analyser: AnalyserNode | null, now: number) {
    if (!analyser) {
      this.kickIntensity *= 0.92;
      this.onsetIntensity *= 0.93;
      return;
    }

    let data = this.data;
    if (data.length !== analyser.frequencyBinCount) {
      data = this.data = new Uint8Array(analyser.frequencyBinCount);
    }
    analyser.getByteFrequencyData(data);
    const bins = data.length;

    // ── Compute band energies (RMS) ──
    const bandRMS = (start: number, end: number) => {
      let sum = 0;
      const count = Math.min(end, bins) - start;
      if (count <= 0) return 0;
      for (let i = start; i < Math.min(end, bins); i++) {
        sum += (data[i] / 255) ** 2;
      }
      return Math.sqrt(sum / count);
    };

    const bassRaw = bandRMS(0, 2);
    const midRaw = bandRMS(2, 9);
    const highRaw = bandRMS(9, 40);

    this.bass.update(bassRaw);
    this.mid.update(midRaw);
    this.high.update(highRaw);

    // ── Sub-band spectral flux (half-wave rectified) for bass and high ──
    let bassFlux = 0, highFlux = 0;
    for (let i = 0; i < Math.min(2, bins); i++) {
      const diff = data[i] / 255 - this.prevSpectrum[i];
      if (diff > 0) bassFlux += diff;
    }
    for (let i = 9; i < Math.min(40, bins); i++) {
      const diff = data[i] / 255 - this.prevSpectrum[i];
      if (diff > 0) highFlux += diff;
    }
    for (let i = 0; i < bins; i++) {
      this.prevSpectrum[i] = data[i] / 255;
    }

    // ── Kick detection: any significant bass activity ──
    const bassImpact = this.bass.impact;
    const midImpact = this.mid.impact;
    const highImpact = this.high.impact;

    // Multiple ways to trigger a kick — any one is enough
    const isKick = bassImpact > 0.15       // bass band spiking above its own average
      || bassFlux > 0.02                    // any positive change in bass bins
      || (midImpact > 0.2 && bassFlux > 0.01); // mid spike with some bass movement

    if (isKick && (now - this.lastKickTime) > MIN_KICK_INTERVAL) {
      this.lastKickTime = now;
      // Scale intensity by how strong the trigger was
      const strength = Math.max(bassImpact, bassFlux * 10, midImpact * 0.5);
      this.kickIntensity = Math.min(1.0, 0.3 + strength * 0.7);
    }

    // ── Onset: any band spiking ──
    const totalImpact = bassImpact + midImpact + highImpact;
    if (totalImpact > 0.3) {
      this.onsetIntensity = Math.min(1.0, totalImpact * 0.6);
    }

    // ── Decay ──
    this.kickIntensity *= 0.92;
    this.onsetIntensity *= 0.93;
    this.bassEnergy = this.bassEnergy * 0.7 + bassRaw * 0.3;
  }
}
