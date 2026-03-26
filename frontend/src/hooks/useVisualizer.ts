import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';

export function useVisualizer(
  analyserRef: RefObject<AnalyserNode | null>,
) {
  const animFrameRef = useRef<number>(0);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);

  const canvasRef = useCallback((node: HTMLCanvasElement | null) => {
    setCanvas(node);
  }, []);

  useEffect(() => {
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    let dataArray: Uint8Array | null = null;

    const barCount = 128;
    const binMappings: Array<{ start: number; end: number }> = [];

    // Pre-compute gradient colors (top and bottom for each bar)
    const colorsTop: string[] = [];
    const colorsMid: string[] = [];
    const colorsDim: string[] = [];
    for (let i = 0; i < barCount; i++) {
      const hue = 280 - (i / barCount) * 110;
      colorsTop.push(`hsl(${hue}, 90%, 75%)`);   // bright peak
      colorsMid.push(`hsl(${hue}, 85%, 55%)`);    // mid bar
      colorsDim.push(`hsla(${hue}, 85%, 55%, 0.4)`); // reflection start
    }

    // Separate array for reflection end color
    const colorsFade: string[] = [];
    for (let i = 0; i < barCount; i++) {
      const hue = 280 - (i / barCount) * 110;
      colorsFade.push(`hsla(${hue}, 85%, 55%, 0)`); // fully transparent same hue
    }

    const smoothed = new Float32Array(barCount);
    const peaks = new Float32Array(barCount);      // peak indicator positions
    const peakDecay = new Float32Array(barCount);   // peak fall velocity
    let recentPeak = 80;

    const initBinMappings = (totalBins: number) => {
      binMappings.length = 0;
      for (let i = 0; i < barCount; i++) {
        const t0 = i / barCount;
        const t1 = (i + 1) / barCount;
        const start = Math.floor(Math.pow(t0, 1.5) * totalBins);
        const end = Math.min(Math.floor(Math.pow(t1, 1.5) * totalBins), totalBins - 1);
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

      // Auto-normalization
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
      const totalBars = barCount * 2;
      const barWidth = (w - gap * (totalBars - 1)) / totalBars;
      const centerX = w / 2;

      // Baseline at 180px — bars go up from here, reflections go down into the player bar
      const baseline = 180;
      const maxBarHeight = baseline - 24; // headroom at top
      const maxReflectionHeight = h - baseline; // ~100px reflection area

      for (let i = 0; i < barCount; i++) {
        const mapping = binMappings[i];
        let sum = 0;
        let count = 0;
        for (let b = mapping.start; b <= mapping.end; b++) {
          sum += dataArray[b];
          count++;
        }
        const avg = count > 0 ? sum / count : 0;
        const normalized = Math.min(avg / normPeak, 1.0);

        // Per-band smoothing
        const bandPosition = i / barCount;
        const smoothing = 0.2 + bandPosition * 0.5;
        smoothed[i] = smoothed[i] * smoothing + normalized * (1 - smoothing);

        const value = smoothed[i];
        const barHeight = Math.max(value * maxBarHeight, 2);

        // Peak indicator: track and decay
        if (value > peaks[i]) {
          peaks[i] = value;
          peakDecay[i] = 0;
        } else {
          peakDecay[i] += 0.0008; // gravity acceleration
          peaks[i] = Math.max(peaks[i] - peakDecay[i], 0);
        }

        const drawBarSet = (x: number) => {
          // --- Main bar with vertical gradient ---
          const grad = ctx.createLinearGradient(0, baseline - barHeight, 0, baseline);
          grad.addColorStop(0, colorsTop[i]);   // bright at top
          grad.addColorStop(1, colorsMid[i]);    // deeper at bottom
          ctx.fillStyle = grad;
          ctx.fillRect(x, baseline - barHeight, barWidth, barHeight);

          // --- Reflection below baseline ---
          const reflectionHeight = Math.min(barHeight * 0.5, maxReflectionHeight);
          const reflGrad = ctx.createLinearGradient(0, baseline, 0, baseline + reflectionHeight);
          reflGrad.addColorStop(0, colorsDim[i]);
          reflGrad.addColorStop(1, colorsFade[i]);
          ctx.fillStyle = reflGrad;
          ctx.fillRect(x, baseline, barWidth, reflectionHeight);

          // --- Peak indicator dot ---
          const peakY = baseline - peaks[i] * maxBarHeight;
          if (peaks[i] > 0.05) {
            ctx.fillStyle = colorsTop[i];
            ctx.fillRect(x, peakY - 2, barWidth, 2);
          }
        };

        // Right side
        drawBarSet(centerX + i * (barWidth + gap));
        // Left side (mirror)
        drawBarSet(centerX - (i + 1) * (barWidth + gap));
      }
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [canvas, analyserRef]);

  return canvasRef;
}
