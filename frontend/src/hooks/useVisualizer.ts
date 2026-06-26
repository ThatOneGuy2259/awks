import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { getAllThemes } from '../stores/customThemeStore';
import { hexToHSL } from '../lib/colorUtils';
import { useVisualizerStore, BAND_COUNT } from '../stores/visualizerStore';
import { audioMetrics, updateAudioMetrics } from '../lib/audioMetrics';

// Shared bar data for other systems (particles, mini-viz) to read each frame.
// Updated every frame regardless of render mode so consumers always follow live audio.
export const barHeights = new Float32Array(128); // 0..1 normalized height
export const barColors: string[] = new Array(128).fill(''); // HSL color per bar
export const waveform = new Float32Array(128); // -1..1 downsampled time-domain (scope mode)

const TRAIL_TAU = 90;       // ms — trail persistence time constant
const COLOR_REBUILD_MS = 40; // throttle for hue-drift color table rebuilds

export function useVisualizer(
  analyserRef: RefObject<AnalyserNode | null>,
) {
  const animFrameRef = useRef<number>(0);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const currentTheme = useThemeStore((s) => s.currentTheme);

  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvas(node);
  }, []);

  // Only theme changes rebuild the loop (it recomputes the base color tables).
  // Everything else (mode, gains, mirror, reactivity, …) is read live each frame.
  useEffect(() => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const theme = getAllThemes().find((t) => t.id === currentTheme);
    const primaryHSL = hexToHSL(theme?.preview.primary ?? '#cf96ff');
    const secondaryHSL = hexToHSL(theme?.preview.secondary ?? '#00f4fe');
    let hueDelta = secondaryHSL.h - primaryHSL.h;
    if (hueDelta > 180) hueDelta -= 360;
    if (hueDelta < -180) hueDelta += 360;
    const satDelta = secondaryHSL.s - primaryHSL.s;
    const baseMidHue = primaryHSL.h + 0.5 * hueDelta;

    const barCount = 128;
    const binMappings: Array<{ start: number; end: number }> = [];

    // Base per-bar hue/sat (numbers); color strings are derived from these so a
    // hue-drift offset is a cheap recompute rather than a per-frame canvas filter.
    const baseHue = new Float32Array(barCount);
    const baseSatTop = new Float32Array(barCount);
    const baseSatMid = new Float32Array(barCount);
    for (let i = 0; i < barCount; i++) {
      const t = i / barCount;
      baseHue[i] = primaryHSL.h + t * hueDelta;
      const sat = primaryHSL.s + t * satDelta;
      baseSatTop[i] = Math.min(sat * 1.1, 100);
      baseSatMid[i] = Math.min(sat * 1.05, 100);
    }

    const colorsTop: string[] = new Array(barCount);
    const colorsMid: string[] = new Array(barCount);
    const colorsDim: string[] = new Array(barCount);
    const colorsFade: string[] = new Array(barCount);

    const rebuildColors = (drift: number) => {
      for (let i = 0; i < barCount; i++) {
        const h = baseHue[i] + drift;
        const st = baseSatTop[i];
        const sm = baseSatMid[i];
        colorsTop[i] = `hsl(${h}, ${st}%, 75%)`;
        barColors[i] = colorsTop[i];
        colorsMid[i] = `hsl(${h}, ${sm}%, 55%)`;
        colorsDim[i] = `hsla(${h}, ${sm}%, 55%, 0.4)`;
        colorsFade[i] = `hsla(${h}, ${sm}%, 55%, 0)`;
      }
    };
    rebuildColors(0);
    let currentDrift = 0;
    let lastColorTime = 0;

    let dataArray: Uint8Array<ArrayBuffer> | null = null; // frequency
    let timeArray: Uint8Array<ArrayBuffer> | null = null; // time-domain (waveform)

    const smoothed = new Float32Array(barCount);
    const peaks = new Float32Array(barCount);
    const peakDecay = new Float32Array(barCount);
    let recentPeak = 80;
    let normPeak = 30;

    const baseline = 180;
    const maxBarHeight = baseline - 24;

    const initBinMappings = (totalBins: number) => {
      binMappings.length = 0;
      const usableBins = Math.floor(totalBins * 0.6);
      for (let i = 0; i < barCount; i++) {
        const t0 = i / barCount;
        const t1 = (i + 1) / barCount;
        const start = Math.floor(Math.pow(t0, 1.5) * usableBins);
        const end = Math.min(Math.floor(Math.pow(t1, 1.5) * usableBins), usableBins - 1);
        binMappings.push({ start, end: Math.max(end, start) });
      }
    };

    // Compute smoothed band levels + export barHeights — runs every frame in
    // EVERY mode so particles/mini-viz always track live audio (not stale bars).
    const computeBars = (vizGains: number[]) => {
      for (let i = 0; i < barCount; i++) {
        const mapping = binMappings[i];
        let sum = 0;
        let count = 0;
        for (let b = mapping.start; b <= mapping.end; b++) {
          sum += dataArray![b];
          count++;
        }
        const avg = count > 0 ? sum / count : 0;

        const bandPos = (i / barCount) * (BAND_COUNT - 1);
        const bandLow = Math.floor(bandPos);
        const bandHigh = Math.min(bandLow + 1, BAND_COUNT - 1);
        const bandFrac = bandPos - bandLow;
        const bandGain = vizGains[bandLow] * (1 - bandFrac) + vizGains[bandHigh] * bandFrac;
        const normalized = Math.min((avg / normPeak) * bandGain, 1.0);

        const bandPosition = i / barCount;
        const smoothing = 0.2 + bandPosition * 0.5;
        smoothed[i] = smoothed[i] * smoothing + normalized * (1 - smoothing);
        barHeights[i] = smoothed[i];
      }
    };

    // ── Bars renderer ─────────────────────────────────────────────────────────
    const drawBars = (mirrored: boolean, orientation: string, pulse: number) => {
      const w = canvas.width;
      const h = canvas.height;
      const gap = 2;
      const totalBars = mirrored ? barCount * 2 : barCount;
      const barWidth = (w - gap * (totalBars - 1)) / totalBars;
      const centerX = w / 2;
      const maxReflectionHeight = h - baseline;
      const pulseBoost = 1 + pulse * 0.06;

      for (let i = 0; i < barCount; i++) {
        const value = smoothed[i];
        const barHeight = Math.max(value * maxBarHeight * pulseBoost, 2);

        if (value > peaks[i]) {
          peaks[i] = value;
          peakDecay[i] = 0;
        } else {
          peakDecay[i] += 0.0008;
          peaks[i] = Math.max(peaks[i] - peakDecay[i], 0);
        }

        const grad = ctx.createLinearGradient(0, baseline - barHeight, 0, baseline);
        grad.addColorStop(0, colorsTop[i]);
        grad.addColorStop(1, colorsMid[i]);

        const reflectionHeight = Math.min(barHeight * 0.5, maxReflectionHeight);
        const reflGrad = ctx.createLinearGradient(0, baseline, 0, baseline + reflectionHeight);
        reflGrad.addColorStop(0, colorsDim[i]);
        reflGrad.addColorStop(1, colorsFade[i]);

        const peakY = baseline - peaks[i] * maxBarHeight;
        const showPeak = peaks[i] > 0.05;

        const drawBarSet = (x: number) => {
          ctx.fillStyle = grad;
          ctx.fillRect(x, baseline - barHeight, barWidth, barHeight);
          ctx.fillStyle = reflGrad;
          ctx.fillRect(x, baseline, barWidth, reflectionHeight);
          if (showPeak) {
            ctx.fillStyle = colorsTop[i];
            ctx.fillRect(x, peakY - 2, barWidth, 2);
          }
        };

        if (mirrored) {
          const pos = orientation === 'flipped' ? barCount - 1 - i : i;
          drawBarSet(centerX + pos * (barWidth + gap));
          drawBarSet(centerX - (pos + 1) * (barWidth + gap));
        } else {
          const pos = orientation === 'flipped' ? barCount - 1 - i : i;
          drawBarSet(pos * (barWidth + gap));
        }
      }

      if (pulse > 0.01) {
        const fh = baseMidHue + currentDrift;
        const flash = ctx.createLinearGradient(0, baseline, 0, baseline - maxBarHeight);
        flash.addColorStop(0, `hsla(${fh}, 90%, 70%, ${pulse * 0.14})`);
        flash.addColorStop(1, `hsla(${fh}, 90%, 70%, 0)`);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = flash;
        ctx.fillRect(0, baseline - maxBarHeight, w, maxBarHeight);
        ctx.restore();
      }
    };

    // ── Oscilloscope renderer (#31) ───────────────────────────────────────────
    const drawScope = (pulse: number, reduce: boolean) => {
      if (!timeArray) return;
      const w = canvas.width;
      const samples = timeArray.length;
      const amp = 95;
      const step = Math.max(1, Math.floor(samples / 720));

      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, colorsMid[0]);
      grad.addColorStop(0.5, colorsTop[barCount >> 1]);
      grad.addColorStop(1, colorsMid[barCount - 1]);

      ctx.save();
      ctx.beginPath();
      let first = true;
      for (let i = 0; i < samples; i += step) {
        const x = (i / (samples - 1)) * w;
        const y = baseline + ((timeArray[i] - 128) / 128) * amp;
        if (first) { ctx.moveTo(x, y); first = false; }
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2 + pulse * 4;
      ctx.lineJoin = 'round';
      if (!reduce) {
        ctx.shadowColor = colorsTop[barCount >> 1];
        ctx.shadowBlur = 6 + pulse * 14;
      }
      ctx.stroke();
      ctx.restore();
    };

    let lastDraw = 0;

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      if (document.hidden) return;

      const analyser = analyserRef.current;
      if (!analyser) return;

      if (!dataArray) {
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        timeArray = new Uint8Array(analyser.fftSize);
        initBinMappings(analyser.frequencyBinCount);
      }

      const now = performance.now();
      const dt = lastDraw ? Math.min(now - lastDraw, 100) : 16;
      lastDraw = now;

      analyser.getByteFrequencyData(dataArray);
      updateAudioMetrics(dataArray);

      let framePeak = 0;
      for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] > framePeak) framePeak = dataArray[i];
      }
      if (framePeak > recentPeak) recentPeak = recentPeak * 0.3 + framePeak * 0.7;
      else recentPeak = recentPeak * 0.97 + framePeak * 0.03;
      normPeak = Math.max(recentPeak, 30);

      const st = useVisualizerStore.getState();
      const reduce = st.reduceVisuals;
      const mode = st.visualizerMode;
      const pulse = reduce ? 0 : audioMetrics.pulse * st.beatReactivity;

      // Hue drift (#10): rotate the color tables (cheap, throttled) — no canvas filter.
      const wantDrift = (st.hueDrift && !reduce) ? (now * 0.015) % 360 : 0;
      if ((st.hueDrift && !reduce && now - lastColorTime > COLOR_REBUILD_MS) || (wantDrift === 0 && currentDrift !== 0)) {
        rebuildColors(wantDrift);
        currentDrift = wantDrift;
        lastColorTime = now;
      }

      // Always refresh the shared bar data so particles/mini-viz track live audio.
      computeBars(st.vizGains);

      const w = canvas.width;
      const h = canvas.height;
      if (st.trails && !reduce) {
        const fade = 1 - Math.exp(-dt / TRAIL_TAU);
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = `rgba(0,0,0,${fade})`;
        ctx.fillRect(0, 0, w, h);
        ctx.restore();
      } else {
        ctx.clearRect(0, 0, w, h);
      }

      if (mode === 'oscilloscope') {
        if (timeArray) {
          analyser.getByteTimeDomainData(timeArray);
          const len = timeArray.length;
          for (let i = 0; i < 128; i++) {
            waveform[i] = (timeArray[Math.floor((i * len) / 128)] - 128) / 128;
          }
        }
        drawScope(pulse, reduce);
      } else {
        drawBars(st.mirrored, st.orientation, pulse);
      }
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [canvas, analyserRef, currentTheme]);

  return canvasRef;
}
