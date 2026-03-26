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

    // Pre-compute logarithmic bin mapping
    // Maps each visual bar to a range of FFT bins, weighted toward lower frequencies
    // so bass gets more visual space (matching human hearing)
    const binMappings: Array<{ start: number; end: number }> = [];

    // Pre-compute colors with brightness boost for bass
    const colors: string[] = [];
    for (let i = 0; i < barCount; i++) {
      const hue = 280 - (i / barCount) * 110;
      colors.push(`hsl(${hue}, 85%, 60%)`);
    }

    // Per-bar smoothed values for smooth animation
    const smoothed = new Float32Array(barCount);

    // Rolling peak for auto-normalization
    let recentPeak = 80;

    const initBinMappings = (totalBins: number) => {
      binMappings.length = 0;
      // Square-root distribution: gentler than full log, spreads bass across
      // more bars so center doesn't look blocky, while still giving bass
      // more space than linear
      for (let i = 0; i < barCount; i++) {
        const t0 = i / barCount;
        const t1 = (i + 1) / barCount;
        // sqrt gives a middle ground between linear and logarithmic
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

      // Find peak for normalization
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
      const padding = 24;
      const maxBarHeight = h - padding;

      for (let i = 0; i < barCount; i++) {
        const mapping = binMappings[i];

        // Average the bins in this logarithmic group
        let sum = 0;
        let count = 0;
        for (let b = mapping.start; b <= mapping.end; b++) {
          sum += dataArray[b];
          count++;
        }
        const avg = count > 0 ? sum / count : 0;

        // Normalize against recent peak
        const normalized = avg / normPeak;

        // Per-band weighting curve: attenuate sub-bass (always loud/pegged),
        // boost mid-bass (where kicks live), even out mids/highs
        const bandPosition = i / barCount; // 0 = sub-bass, 1 = treble
        let weight: number;
        if (bandPosition < 0.05) {
          weight = 1.0;
        } else if (bandPosition < 0.2) {
          weight = 1.0;
        } else if (bandPosition < 0.5) {
          weight = 1.0;
        } else {
          weight = 1.0;
        }
        const weighted = Math.min(normalized * weight, 1.0);

        // Smooth: bass snappy, treble smoother
        const smoothing = 0.2 + bandPosition * 0.5; // 0.2 for bass, 0.7 for treble
        smoothed[i] = smoothed[i] * smoothing + weighted * (1 - smoothing);

        const barHeight = Math.max(smoothed[i] * maxBarHeight, 2);

        ctx.fillStyle = colors[i];

        const y = h - barHeight;
        const rx = centerX + i * (barWidth + gap);
        ctx.fillRect(rx, y, barWidth, barHeight);

        const lx = centerX - (i + 1) * (barWidth + gap);
        ctx.fillRect(lx, y, barWidth, barHeight);
      }
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [canvas, analyserRef]);

  return canvasRef;
}
