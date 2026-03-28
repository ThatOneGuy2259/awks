import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { getAllThemes } from '../stores/customThemeStore';
import { hexToHSL } from '../lib/colorUtils';
import { useVisualizerStore, BAND_COUNT } from '../stores/visualizerStore';

// Shared bar data for other systems (e.g., particle effects) to read each frame.
export const barHeights = new Float32Array(128); // 0..1 normalized height
export const barColors: string[] = new Array(128).fill(''); // HSL color per bar

export function useVisualizer(
  analyserRef: RefObject<AnalyserNode | null>,
) {
  const animFrameRef = useRef<number>(0);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const vizGains = useVisualizerStore((s) => s.vizGains);
  const mirrored = useVisualizerStore((s) => s.mirrored);
  const orientation = useVisualizerStore((s) => s.orientation);

  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvas(node);
  }, []);

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

    let dataArray: Uint8Array<ArrayBuffer> | null = null;

    const barCount = 128;
    const binMappings: Array<{ start: number; end: number }> = [];

    const satDelta = secondaryHSL.s - primaryHSL.s;

    const colorsTop: string[] = [];
    const colorsMid: string[] = [];
    const colorsDim: string[] = [];
    for (let i = 0; i < barCount; i++) {
      const t = i / barCount;
      const hue = primaryHSL.h + t * hueDelta;
      const sat = primaryHSL.s + t * satDelta;
      const satTop = Math.min(sat * 1.1, 100);
      const satMid = Math.min(sat * 1.05, 100);
      colorsTop.push(`hsl(${hue}, ${satTop}%, 75%)`);
      barColors[i] = `hsl(${hue}, ${satTop}%, 75%)`; // export for particles
      colorsMid.push(`hsl(${hue}, ${satMid}%, 55%)`);
      colorsDim.push(`hsla(${hue}, ${satMid}%, 55%, 0.4)`);
    }

    const colorsFade: string[] = [];
    for (let i = 0; i < barCount; i++) {
      const t = i / barCount;
      const hue = primaryHSL.h + t * hueDelta;
      const sat = Math.min((primaryHSL.s + t * satDelta) * 1.05, 100);
      colorsFade.push(`hsla(${hue}, ${sat}%, 55%, 0)`);
    }

    const smoothed = new Float32Array(barCount);
    const peaks = new Float32Array(barCount);
    const peakDecay = new Float32Array(barCount);
    let recentPeak = 80;

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

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);

      const analyser = analyserRef.current;
      if (!analyser) return;

      if (!dataArray) {
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        initBinMappings(analyser.frequencyBinCount);
      }

      analyser.getByteFrequencyData(dataArray);

      let framePeak = 0;
      for (let i = 0; i < dataArray.length; i++) {
        if (dataArray[i] > framePeak) framePeak = dataArray[i];
      }
      if (framePeak > recentPeak) {
        recentPeak = recentPeak * 0.3 + framePeak * 0.7;
      } else {
        recentPeak = recentPeak * 0.97 + framePeak * 0.03;
      }
      const normPeak = Math.max(recentPeak, 30);

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const gap = 2;
      const totalBars = mirrored ? barCount * 2 : barCount;
      const barWidth = (w - gap * (totalBars - 1)) / totalBars;
      const centerX = w / 2;

      const baseline = 180;
      const maxBarHeight = baseline - 24;
      const maxReflectionHeight = h - baseline;

      // Read current band gains from store (read once per frame for consistency)
      const gains = vizGains;

      for (let i = 0; i < barCount; i++) {
        const mapping = binMappings[i];
        let sum = 0;
        let count = 0;
        for (let b = mapping.start; b <= mapping.end; b++) {
          sum += dataArray[b];
          count++;
        }
        const avg = count > 0 ? sum / count : 0;

        // Apply per-band EQ gain with smooth interpolation between bands
        const bandPos = (i / barCount) * (BAND_COUNT - 1); // continuous position across bands
        const bandLow = Math.floor(bandPos);
        const bandHigh = Math.min(bandLow + 1, BAND_COUNT - 1);
        const bandFrac = bandPos - bandLow;
        const bandGain = gains[bandLow] * (1 - bandFrac) + gains[bandHigh] * bandFrac;
        const normalized = Math.min((avg / normPeak) * bandGain, 1.0);

        const bandPosition = i / barCount;
        const smoothing = 0.2 + bandPosition * 0.5;
        smoothed[i] = smoothed[i] * smoothing + normalized * (1 - smoothing);

        const value = smoothed[i];
        barHeights[i] = value; // export for particle system
        const barHeight = Math.max(value * maxBarHeight, 2);

        if (value > peaks[i]) {
          peaks[i] = value;
          peakDecay[i] = 0;
        } else {
          peakDecay[i] += 0.0008;
          peaks[i] = Math.max(peaks[i] - peakDecay[i], 0);
        }

        const drawBarSet = (x: number) => {
          const grad = ctx.createLinearGradient(0, baseline - barHeight, 0, baseline);
          grad.addColorStop(0, colorsTop[i]);
          grad.addColorStop(1, colorsMid[i]);
          ctx.fillStyle = grad;
          ctx.fillRect(x, baseline - barHeight, barWidth, barHeight);

          const reflectionHeight = Math.min(barHeight * 0.5, maxReflectionHeight);
          const reflGrad = ctx.createLinearGradient(0, baseline, 0, baseline + reflectionHeight);
          reflGrad.addColorStop(0, colorsDim[i]);
          reflGrad.addColorStop(1, colorsFade[i]);
          ctx.fillStyle = reflGrad;
          ctx.fillRect(x, baseline, barWidth, reflectionHeight);

          const peakY = baseline - peaks[i] * maxBarHeight;
          if (peaks[i] > 0.05) {
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
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [canvas, analyserRef, currentTheme, vizGains, mirrored, orientation]);

  return canvasRef;
}
