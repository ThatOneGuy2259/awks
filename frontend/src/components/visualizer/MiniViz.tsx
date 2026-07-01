import { useEffect, useRef } from 'react';
import { barHeights, barColors } from '../../hooks/useVisualizer';
import { usePlaybackStore } from '../../stores/playbackStore';

interface MiniVizProps {
  className?: string;
  bars?: number;
}

// Tiny live spectrum that rides the shared barHeights/barColors globals the main
// visualizer already exports (#80). Throttled to ~30fps, pauses when hidden.
export function MiniViz({ className, bars = 20 }: MiniVizProps) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const step = Math.max(1, Math.floor(128 / bars));
    const bw = W / bars;
    let raf = 0;
    let last = 0;
    let idled = false;

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      // Battery: idle when hidden or audio is paused; clear once on entering idle.
      if (document.hidden || !usePlaybackStore.getState().isPlaying) {
        if (!idled) {
          ctx.clearRect(0, 0, W, H);
          idled = true;
        }
        return;
      }
      idled = false;
      if (now - last < 1000 / 30) return;
      last = now;

      ctx.clearRect(0, 0, W, H);
      for (let i = 0; i < bars; i++) {
        const v = barHeights[i * step] || 0;
        const h = Math.max(v * H, 1);
        ctx.fillStyle = barColors[i * step] || 'rgba(255,255,255,0.4)';
        ctx.fillRect(i * bw, H - h, bw - 1, h);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [bars]);

  return <canvas ref={ref} width={96} height={28} className={className} aria-hidden="true" />;
}
