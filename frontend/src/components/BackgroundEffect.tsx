import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { useVisualizerStore, type VisualizerOrientation } from '../stores/visualizerStore';
import { useUIStore } from '../stores/uiStore';
import { usePlaybackStore } from '../stores/playbackStore';
import { BeatDetector } from '../lib/beatDetector';
import { barHeights, barColors } from '../hooks/useVisualizer';

interface BackgroundEffectProps {
  analyserRef: RefObject<AnalyserNode | null>;
}

let cachedColors: { primary: string; secondary: string; tertiary: string; background: string } | null = null;
let colorsCacheTime = 0;

function getThemeColors(): { primary: string; secondary: string; tertiary: string; background: string } {
  const now = Date.now();
  if (cachedColors && now - colorsCacheTime < 1000) return cachedColors;
  const style = getComputedStyle(document.documentElement);
  cachedColors = {
    primary: style.getPropertyValue('--color-primary').trim() || '#cf96ff',
    secondary: style.getPropertyValue('--color-secondary').trim() || '#00f4fe',
    tertiary: style.getPropertyValue('--color-tertiary').trim() || '#ff6b9b',
    background: style.getPropertyValue('--color-background').trim() || '#0e0e13',
  };
  colorsCacheTime = now;
  return cachedColors;
}

// Reused across frames — reallocated only if the analyser's bin count changes.
let freqBuf: Uint8Array<ArrayBuffer> | null = null;

function getFrequencyData(analyser: AnalyserNode | null): { bass: number; mid: number; high: number; overall: number } {
  if (!analyser) return { bass: 0, mid: 0, high: 0, overall: 0 };
  const n = analyser.frequencyBinCount;
  if (!freqBuf || freqBuf.length !== n) freqBuf = new Uint8Array(n);
  const data = freqBuf;
  analyser.getByteFrequencyData(data);
  const len = data.length;
  let bassSum = 0, midSum = 0, highSum = 0;
  const bassEnd = Math.floor(len * 0.15);
  const midEnd = Math.floor(len * 0.5);
  for (let i = 0; i < len; i++) {
    if (i < bassEnd) bassSum += data[i];
    else if (i < midEnd) midSum += data[i];
    else highSum += data[i];
  }
  const bass = bassSum / (bassEnd * 255);
  const mid = midSum / ((midEnd - bassEnd) * 255);
  const high = highSum / ((len - midEnd) * 255);
  const overall = (bass + mid + high) / 3;
  return { bass, mid, high, overall };
}

// ── Color Pulse ──
let smoothedOverall = 0;

function smoothAudio(freq: ReturnType<typeof getFrequencyData>) {
  smoothedOverall = smoothedOverall * 0.95 + freq.overall * 0.05;
}

function drawColorPulse(ctx: CanvasRenderingContext2D, w: number, h: number, _freq: ReturnType<typeof getFrequencyData>, colors: ReturnType<typeof getThemeColors>, gain: number, _beat: BeatDetector) {
  const energy = (0.15 + smoothedOverall * 0.85) * gain;
  ctx.clearRect(0, 0, w, h);
  const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.7);
  gradient.addColorStop(0, `${colors.primary}${Math.floor(Math.min(energy * 180, 255)).toString(16).padStart(2, '0')}`);
  gradient.addColorStop(0.5, `${colors.secondary}${Math.floor(Math.min(energy * 90, 255)).toString(16).padStart(2, '0')}`);
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

// ── Gradient Wave ──
function drawGradientWave(ctx: CanvasRenderingContext2D, w: number, h: number, _freq: ReturnType<typeof getFrequencyData>, colors: ReturnType<typeof getThemeColors>, time: number, gain: number, _beat: BeatDetector) {
  ctx.clearRect(0, 0, w, h);
  const radius = (0.3 + smoothedOverall * 0.4 * gain) * Math.max(w, h);
  const x = w / 2 + Math.sin(time * 0.5) * w * 0.15;
  const y = h * 0.6 + Math.cos(time * 0.3) * h * 0.1;
  const a1 = Math.floor(Math.min(0x60 * gain, 255)).toString(16).padStart(2, '0');
  const a2 = Math.floor(Math.min(0x30 * gain, 255)).toString(16).padStart(2, '0');
  const a3 = Math.floor(Math.min(0x15 * gain, 255)).toString(16).padStart(2, '0');
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `${colors.primary}${a1}`);
  gradient.addColorStop(0.3, `${colors.secondary}${a2}`);
  gradient.addColorStop(0.6, `${colors.tertiary}${a3}`);
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
}

// ── Ambient Blobs ──
interface Blob {
  x: number; y: number; vx: number; vy: number; color: string; baseRadius: number;
}

function createBlobs(w: number, h: number, colors: ReturnType<typeof getThemeColors>): Blob[] {
  return [
    { x: w * 0.3, y: h * 0.3, vx: 0.3, vy: 0.2, color: colors.primary, baseRadius: 200 },
    { x: w * 0.7, y: h * 0.5, vx: -0.2, vy: 0.3, color: colors.secondary, baseRadius: 180 },
    { x: w * 0.5, y: h * 0.7, vx: 0.15, vy: -0.25, color: colors.tertiary, baseRadius: 160 },
  ];
}

let smoothedBass = 0, smoothedMid = 0, smoothedHigh = 0;

function drawAmbientBlobs(ctx: CanvasRenderingContext2D, w: number, h: number, freq: ReturnType<typeof getFrequencyData>, blobs: Blob[], gain: number, _beat: BeatDetector) {
  ctx.clearRect(0, 0, w, h);
  smoothedBass = smoothedBass * 0.97 + freq.bass * 0.03;
  smoothedMid = smoothedMid * 0.97 + freq.mid * 0.03;
  smoothedHigh = smoothedHigh * 0.97 + freq.high * 0.03;
  const energies = [smoothedBass, smoothedMid, smoothedHigh];
  for (let i = 0; i < blobs.length; i++) {
    const b = blobs[i];
    b.x += b.vx;
    b.y += b.vy;
    if (b.x < 0 || b.x > w) b.vx *= -1;
    if (b.y < 0 || b.y > h) b.vy *= -1;
    const radius = b.baseRadius * gain + energies[i] * 80;
    const gradient = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, radius);
    gradient.addColorStop(0, b.color + '60');
    gradient.addColorStop(0.5, b.color + '28');
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(b.x - radius, b.y - radius, radius * 2, radius * 2);
  }
}

// ── Particles ──
interface Particle {
  x: number; y: number; vx: number; vy: number; size: number; color: string; life: number;
}

// Cached circle sprite per color — drawImage of a small pre-rendered bitmap is
// far cheaper than beginPath+arc+fill per particle, with effectively identical
// output. Keyed by color string (bounded by the ~128 bar colors).
const SPRITE_RADIUS = 8;
const dotSprites = new Map<string, HTMLCanvasElement>();
function getDotSprite(color: string): HTMLCanvasElement {
  const cached = dotSprites.get(color);
  if (cached) return cached;
  const s = document.createElement('canvas');
  s.width = s.height = SPRITE_RADIUS * 2;
  const sctx = s.getContext('2d');
  if (sctx) {
    sctx.fillStyle = color;
    sctx.beginPath();
    sctx.arc(SPRITE_RADIUS, SPRITE_RADIUS, SPRITE_RADIUS, 0, Math.PI * 2);
    sctx.fill();
  }
  dotSprites.set(color, s);
  return s;
}

// Object pool — recycle dead particles instead of allocating a new object on
// every spawn, which removes the per-frame GC churn behind frame-time spikes.
const particlePool: Particle[] = [];
function acquireParticle(): Particle {
  return particlePool.pop() ?? { x: 0, y: 0, vx: 0, vy: 0, size: 0, color: '', life: 0 };
}

function drawParticles(ctx: CanvasRenderingContext2D, w: number, h: number, _freq: ReturnType<typeof getFrequencyData>, particles: Particle[], colors: ReturnType<typeof getThemeColors>, gain: number, _beat: BeatDetector, _analyserRef: AnalyserNode | null, mirrored: boolean, orientation: VisualizerOrientation, qualityScale: number) {
  ctx.clearRect(0, 0, w, h);

  // Spawn particles from visualizer bar tops using shared barHeights
  const barCount = 128;
  const isXl = w >= 1280;
  const vizHeight = isXl ? 280 : 220;
  const vizBottom = isXl ? -4 : -22;
  const vizBaseline = h + vizBottom - vizHeight + 180;
  const vizMaxBarHeight = 180 - 24;
  const sidebarOpen = w > 1024 && !useUIStore.getState().sidebarCollapsed;
  const contentLeft = sidebarOpen ? 256 : 0;
  const contentW = w - contentLeft;
  const contentCenter = contentLeft + contentW / 2;

  for (let i = 0; i < barCount; i++) {
    const value = barHeights[i]; // 0-1, matches the visualizer's smoothed value
    if (value < 0.2) continue;

    // Only spawn probabilistically — higher bars have higher chance.
    // qualityScale throttles spawn rate when the device is struggling.
    if (Math.random() > value * 0.3 * gain * qualityScale) continue;

    const barHeight = value * vizMaxBarHeight;
    const spawnY = vizBaseline - barHeight;

    // Position matching visualizer layout
    const pos = orientation === 'flipped' ? barCount - 1 - i : i;
    const posNorm = pos / barCount;

    const xPositions: number[] = [];
    if (mirrored) {
      const halfW = contentW / 2;
      xPositions.push(contentCenter + posNorm * halfW);
      xPositions.push(contentCenter - posNorm * halfW);
    } else {
      xPositions.push(contentLeft + posNorm * contentW);
    }

    const color = barColors[i] || colors.primary;

    const speed = (0.5 + value * 3) * gain;
    const size = (0.8 + value * 1.5) * Math.min(gain, 1.5);

    for (const px of xPositions) {
      const p = acquireParticle();
      p.x = px + (Math.random() - 0.5) * 15;
      p.y = spawnY + (Math.random() - 0.5) * 8;
      p.vx = (Math.random() - 0.5) * 1.2;
      p.vy = -speed;
      p.size = size;
      p.color = color;
      p.life = 0.5 + value * 0.5;
      particles.push(p);
    }
  }

  // Update and draw — compact in place (swap-and-pop) to avoid O(n²) splice,
  // recycling dead particles back into the pool.
  let writeIdx = 0;
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.005;
    if (p.life <= 0 || p.y < -10) {
      particlePool.push(p);
      continue;
    }
    ctx.globalAlpha = p.life * 0.85;
    const sprite = getDotSprite(p.color);
    const d = p.size * 2;
    ctx.drawImage(sprite, p.x - p.size, p.y - p.size, d, d);
    particles[writeIdx++] = p;
  }
  particles.length = writeIdx;
  ctx.globalAlpha = 1;

  // Cap particle count (scaled down on struggling devices); recycle the excess.
  const maxParticles = Math.floor(4000 * Math.max(gain, 1) * qualityScale);
  if (particles.length > maxParticles) {
    for (let i = maxParticles; i < particles.length; i++) {
      particlePool.push(particles[i]);
    }
    particles.length = maxParticles;
  }
}

export function BackgroundEffectCanvas({ analyserRef }: BackgroundEffectProps) {
  const effect = useVisualizerStore((s) => s.backgroundEffect);
  const intensity = useVisualizerStore((s) => s.backgroundIntensity);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => { setCanvas(node); }, []);
  const animRef = useRef<number>(0);
  const blobsRef = useRef<Blob[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const qualityRef = useRef(1); // 0.3..1 — particle budget scaler, adapts to frame time
  const startTimeRef = useRef(Date.now());
  const beatRef = useRef<BeatDetector | null>(null);
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;

  useEffect(() => {
    if (!canvas || effect === 'none') {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      return;
    }

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    // Reset state for blobs/particles
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      if (effect === 'ambient-blobs') {
        blobsRef.current = createBlobs(canvas.width, canvas.height, getThemeColors());
      }
    };
    resize();
    window.addEventListener('resize', resize);

    particlesRef.current = [];
    startTimeRef.current = Date.now();
    beatRef.current = new BeatDetector(analyserRef.current?.frequencyBinCount ?? 128);

    let lastFrameTime = 0;
    let idled = false;
    const frameBudget = 1000 / 30; // 30fps target

    const draw = (now: number) => {
      animRef.current = requestAnimationFrame(draw);

      // Battery: idle when hidden or audio is paused. Clear once so no stale
      // frame is left frozen, then stop doing per-frame work.
      if (document.hidden || !usePlaybackStore.getState().isPlaying) {
        if (!idled) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          idled = true;
        }
        return;
      }
      idled = false;

      // Throttle to ~30fps — background effects don't need 60fps
      if (now - lastFrameTime < frameBudget) return;
      lastFrameTime = now;

      const w = canvas.width;
      const h = canvas.height;
      const freq = getFrequencyData(analyserRef.current);
      const time = (Date.now() - startTimeRef.current) / 1000;
      const colors = getThemeColors(); // re-read each frame so theme changes are instant

      // Update beat detector
      const beat = beatRef.current!;
      beat.update(analyserRef.current, performance.now());


      const gain = intensityRef.current;
      smoothAudio(freq);
      const tDraw = performance.now();
      switch (effect) {
        case 'color-pulse':
          drawColorPulse(ctx, w, h, freq, colors, gain, beat);
          break;
        case 'gradient-wave':
          drawGradientWave(ctx, w, h, freq, colors, time, gain, beat);
          break;
        case 'ambient-blobs':
          if (blobsRef.current.length === 0) blobsRef.current = createBlobs(w, h, colors);
          drawAmbientBlobs(ctx, w, h, freq, blobsRef.current, gain, beat);
          break;
        case 'particles':
          drawParticles(ctx, w, h, freq, particlesRef.current, colors, gain, beat, analyserRef.current,
            useVisualizerStore.getState().mirrored, useVisualizerStore.getState().orientation, qualityRef.current);
          break;
      }

      // Adapt particle budget to actual draw cost: back off when a frame's
      // render runs long, recover gradually when there's headroom. Keeps full
      // quality on capable devices, degrades gracefully on weak ones.
      const drawMs = performance.now() - tDraw;
      if (drawMs > 12) qualityRef.current = Math.max(0.3, qualityRef.current - 0.05);
      else if (drawMs < 7) qualityRef.current = Math.min(1, qualityRef.current + 0.02);
    };

    animRef.current = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [canvas, effect, analyserRef]);

  if (effect === 'none') return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[1]"
      style={{ opacity: Math.min(intensity, 1) }}
    />
  );
}
