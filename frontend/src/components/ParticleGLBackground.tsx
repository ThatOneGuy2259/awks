import { useEffect, useRef, type RefObject } from 'react';
import { useVisualizerStore } from '../stores/visualizerStore';
import { useUIStore } from '../stores/uiStore';
import { usePerfStore } from '../stores/perfStore';
import { barHeights, barColors, waveform } from '../hooks/useVisualizer';

interface ParticleGLBackgroundProps {
  // Particles drive off the shared barHeights/barColors, not the analyser, but we
  // keep the same prop shape as BackgroundEffectCanvas so the two are swappable.
  analyserRef: RefObject<AnalyserNode | null>;
}

const BAR_COUNT = 128;

// Parse an `hsl(h, s%, l%)` string (the format produced in useVisualizer) into
// RGB floats in 0..1. Falls back to a soft purple if parsing fails / empty.
function hslStringToRgb(hsl: string, out: Float32Array, offset: number): void {
  const m = /hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/.exec(hsl);
  let h = 270, s = 60, l = 75;
  if (m) {
    h = parseFloat(m[1]);
    s = parseFloat(m[2]);
    l = parseFloat(m[3]);
  }
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) { r = c; g = x; }
  else if (hp < 2) { r = x; g = c; }
  else if (hp < 3) { g = c; b = x; }
  else if (hp < 4) { g = x; b = c; }
  else if (hp < 5) { r = x; b = c; }
  else { r = c; b = x; }
  const mAdd = lN - c / 2;
  out[offset] = r + mAdd;
  out[offset + 1] = g + mAdd;
  out[offset + 2] = b + mAdd;
}

function currentDpr(): number {
  return Math.min(window.devicePixelRatio || 1, 1.5);
}

export function ParticleGLBackground({ analyserRef: _analyserRef }: ParticleGLBackgroundProps) {
  const intensity = useVisualizerStore((s) => s.backgroundIntensity);
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // A canvas can only be transferred once; this effect runs on a freshly
    // mounted canvas element, so a single transfer here is safe.
    let offscreen: OffscreenCanvas;
    try {
      offscreen = canvas.transferControlToOffscreen();
    } catch {
      return;
    }

    const worker = new Worker(new URL('../workers/particleWorker.ts', import.meta.url), { type: 'module' });
    worker.postMessage(
      { type: 'init', canvas: offscreen, width: window.innerWidth, height: window.innerHeight, dpr: currentDpr() },
      [offscreen],
    );

    // Live perf metrics from the worker feed the Performance HUD.
    worker.onmessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; fps?: number; frameMs?: number; count?: number; quality?: number };
      if (d && d.type === 'stats') {
        usePerfStore.getState().setWorkerStats({ fps: d.fps ?? 0, frameMs: d.frameMs ?? 0, count: d.count ?? 0, quality: d.quality ?? 1 });
      }
    };

    // Post a fresh transferable RGB buffer; colours rarely change (only on theme
    // switch), detected via barColors[0].
    const postColors = () => {
      const rgb = new Float32Array(BAR_COUNT * 3);
      for (let i = 0; i < BAR_COUNT; i++) {
        hslStringToRgb(barColors[i], rgb, i * 3);
      }
      worker.postMessage({ type: 'colors', rgb }, [rgb.buffer]);
    };

    let lastColorKey = '';
    let rafId = 0;
    let lastFrameTime = 0;
    const frameBudget = 1000 / 30; // light main-thread cadence; worker renders at full rate

    const loop = (now: number) => {
      rafId = requestAnimationFrame(loop);
      if (document.hidden) return;
      if (now - lastFrameTime < frameBudget) return;
      lastFrameTime = now;

      const colorKey = barColors[0];
      if (colorKey && colorKey !== lastColorKey) {
        lastColorKey = colorKey;
        postColors();
      }

      const bars = new Float32Array(BAR_COUNT);
      bars.set(barHeights);
      const { mirrored, orientation, visualizerMode, constellations, reduceVisuals } = useVisualizerStore.getState();
      const sidebarOpen = window.innerWidth > 1024 && !useUIStore.getState().sidebarCollapsed;
      const transfer: Transferable[] = [bars.buffer];
      let wave: Float32Array | undefined;
      if (visualizerMode === 'oscilloscope') {
        wave = new Float32Array(BAR_COUNT);
        wave.set(waveform);
        transfer.push(wave.buffer);
      }
      worker.postMessage(
        {
          type: 'frame',
          bars,
          wave,
          mode: visualizerMode,
          gain: intensityRef.current,
          mirrored,
          orientation,
          sidebarOpen,
          constellations: constellations && !reduceVisuals,
          width: window.innerWidth,
          height: window.innerHeight,
        },
        transfer,
      );
    };
    rafId = requestAnimationFrame(loop);

    const onResize = () => {
      worker.postMessage({ type: 'resize', width: window.innerWidth, height: window.innerHeight, dpr: currentDpr() });
    };
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      worker.postMessage({ type: 'stop' });
      worker.terminate();
      usePerfStore.getState().clearWorker();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[1] w-screen h-screen"
      style={{ opacity: Math.min(intensity, 1) }}
    />
  );
}
