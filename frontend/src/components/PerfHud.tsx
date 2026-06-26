import { useEffect, useState } from 'react';
import { useVisualizerStore } from '../stores/visualizerStore';
import { usePerfStore } from '../stores/perfStore';

// Compact performance readout shown inline in the top bar (toggle via
// Settings → Performance HUD). Shows main-thread FPS plus, when the WebGL
// particle worker is active, its live particle count / FPS / frame time.
// Available in dev and prod. Hidden on narrow screens to keep the bar tidy.
export function PerfHud() {
  const enabled = useVisualizerStore((s) => s.perfHud);
  const backgroundEffect = useVisualizerStore((s) => s.backgroundEffect);
  const workerActive = usePerfStore((s) => s.workerActive);
  const workerFps = usePerfStore((s) => s.workerFps);
  const workerFrameMs = usePerfStore((s) => s.workerFrameMs);
  const particleCount = usePerfStore((s) => s.particleCount);
  const [fps, setFps] = useState(0);

  // Measure main-thread frame rate (only while the HUD is on).
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    let frames = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      frames++;
      if (now - last >= 500) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  if (!enabled) return null;

  const fpsColor = fps >= 55 ? 'text-green-400' : fps >= 30 ? 'text-amber-400' : 'text-red-400';
  const particlesActive = backgroundEffect === 'particles' && workerActive;

  return (
    <div
      className="hidden sm:flex items-center gap-2 font-mono text-[11px] leading-none text-on-surface-variant select-none"
      title="Main-thread FPS · particle worker (count / fps / frame time)"
    >
      <span className="text-on-surface-variant/60">FPS</span>
      <span className={`font-bold ${fpsColor}`}>{fps}</span>
      {particlesActive && (
        <>
          <span className="text-on-surface-variant/30">·</span>
          <span>{particleCount.toLocaleString()}●</span>
          <span className="text-on-surface-variant/50">
            {workerFps}w {workerFrameMs.toFixed(1)}ms
          </span>
        </>
      )}
    </div>
  );
}
