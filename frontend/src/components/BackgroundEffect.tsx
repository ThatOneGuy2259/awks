import { useEffect, useRef, useState, useCallback, type RefObject } from 'react';
import { useVisualizerStore, type BackgroundEffect as BgEffect, type VisualizerOrientation } from '../stores/visualizerStore';
import { BeatDetector } from '../lib/beatDetector';

interface BackgroundEffectProps {
  analyserRef: RefObject<AnalyserNode | null>;
}

function getThemeColors(): { primary: string; secondary: string; tertiary: string; background: string } {
  const style = getComputedStyle(document.documentElement);
  return {
    primary: style.getPropertyValue('--color-primary').trim() || '#cf96ff',
    secondary: style.getPropertyValue('--color-secondary').trim() || '#00f4fe',
    tertiary: style.getPropertyValue('--color-tertiary').trim() || '#ff6b9b',
    background: style.getPropertyValue('--color-background').trim() || '#0e0e13',
  };
}

function getFrequencyData(analyser: AnalyserNode | null): { bass: number; mid: number; high: number; overall: number } {
  if (!analyser) return { bass: 0, mid: 0, high: 0, overall: 0 };
  const data = new Uint8Array(analyser.frequencyBinCount);
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

function drawParticles(ctx: CanvasRenderingContext2D, w: number, h: number, _freq: ReturnType<typeof getFrequencyData>, particles: Particle[], colors: ReturnType<typeof getThemeColors>, gain: number, _beat: BeatDetector, analyserRef: AnalyserNode | null, mirrored: boolean, orientation: VisualizerOrientation) {
  ctx.clearRect(0, 0, w, h);

  // Get raw frequency data for per-bin particle spawning
  if (analyserRef) {
    const rawData = new Uint8Array(analyserRef.frequencyBinCount);
    analyserRef.getByteFrequencyData(rawData);
    const bins = rawData.length;
    const usableBins = Math.floor(bins * 0.6);
    const centerX = w / 2;

    for (let i = 0; i < usableBins; i++) {
      const energy = rawData[i] / 255;
      if (energy < 0.3) continue;

      const spawnChance = (energy - 0.3) * 2.5 * gain;
      if (Math.random() > spawnChance) continue;

      // t = 0 is low freq, t = 1 is high freq
      const t = i / usableBins;

      // Color based on frequency band
      let color: string;
      if (t < 0.33) color = colors.primary;
      else if (t < 0.66) color = colors.secondary;
      else color = colors.tertiary;

      const speed = (1 + energy * 4) * gain;
      const size = (0.8 + energy * 2) * Math.min(gain, 1.5);

      // Calculate positions based on visualizer layout
      // Account for sidebar (256px / 16rem on lg screens)
      const contentLeft = w > 1024 ? 256 : 0;
      const contentW = w - contentLeft;
      const contentCenter = contentLeft + contentW / 2;

      const positions: number[] = [];
      if (mirrored) {
        const pos = orientation === 'flipped' ? (1 - t) : t;
        const halfW = contentW / 2;
        positions.push(contentCenter - pos * halfW);
        positions.push(contentCenter + pos * halfW);
      } else {
        const x = orientation === 'flipped' ? contentLeft + (1 - t) * contentW : contentLeft + t * contentW;
        positions.push(x);
      }

      for (const px of positions) {
        particles.push({
          x: px + (Math.random() - 0.5) * 20,
          y: h + 5,
          vx: (Math.random() - 0.5) * 1.5,
          vy: -speed,
          size,
          color,
          life: 0.6 + energy * 0.4,
        });
      }
    }
  }

  // Update and draw
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.005;
    if (p.life <= 0 || p.y < -10) {
      particles.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = p.life * 0.85;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Cap particle count — high enough that particles can live their full life
  const maxParticles = Math.floor(2000 * Math.max(gain, 1));
  if (particles.length > maxParticles) {
    particles.splice(0, particles.length - maxParticles);
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

    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
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
            useVisualizerStore.getState().mirrored, useVisualizerStore.getState().orientation);
          break;
      }
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
