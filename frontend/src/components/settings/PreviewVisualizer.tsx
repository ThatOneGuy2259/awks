import { useEffect, useRef, useCallback, useState } from 'react';
import { hexToHSL } from '../../lib/colorUtils';

interface PreviewVisualizerProps {
  primary: string;
  secondary: string;
  background: string;
}

export function PreviewVisualizer({ primary, secondary, background }: PreviewVisualizerProps) {
  const animRef = useRef<number>(0);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const canvasRef = useCallback((node: HTMLCanvasElement | null) => { setCanvas(node); }, []);

  useEffect(() => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const barCount = 16;
    const primaryHSL = hexToHSL(primary);
    const secondaryHSL = hexToHSL(secondary);
    let hueDelta = secondaryHSL.h - primaryHSL.h;
    if (hueDelta > 180) hueDelta -= 360;
    if (hueDelta < -180) hueDelta += 360;

    const satDelta = secondaryHSL.s - primaryHSL.s;

    const colorsTop: string[] = [];
    const colorsMid: string[] = [];
    const colorsDim: string[] = [];
    const colorsFade: string[] = [];
    for (let i = 0; i < barCount; i++) {
      const t = i / barCount;
      const hue = primaryHSL.h + t * hueDelta;
      const sat = primaryHSL.s + t * satDelta;
      const satTop = Math.min(sat * 1.1, 100);
      const satMid = Math.min(sat * 1.05, 100);
      colorsTop.push(`hsl(${hue}, ${satTop}%, 75%)`);
      colorsMid.push(`hsl(${hue}, ${satMid}%, 55%)`);
      colorsDim.push(`hsla(${hue}, ${satMid}%, 55%, 0.4)`);
      colorsFade.push(`hsla(${hue}, ${satMid}%, 55%, 0)`);
    }

    const freqs = Array.from({ length: barCount }, (_, i) => 0.8 + Math.sin(i * 0.7) * 0.4);
    const phases = Array.from({ length: barCount }, (_, i) => i * 0.4);

    const draw = (time: number) => {
      animRef.current = requestAnimationFrame(draw);
      const t = time / 1000;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const gap = 2;
      const barWidth = (w - gap * (barCount - 1)) / barCount;
      const baseline = h * 0.7;
      const maxBarHeight = baseline - 4;
      const maxReflection = h - baseline;

      for (let i = 0; i < barCount; i++) {
        const v1 = Math.sin(t * freqs[i] * 2 + phases[i]) * 0.5 + 0.5;
        const v2 = Math.sin(t * freqs[i] * 3.3 + phases[i] * 1.7) * 0.3 + 0.3;
        const value = Math.min(v1 * 0.6 + v2 * 0.4, 1.0);
        const barHeight = Math.max(value * maxBarHeight, 2);

        const x = i * (barWidth + gap);

        const grad = ctx.createLinearGradient(0, baseline - barHeight, 0, baseline);
        grad.addColorStop(0, colorsTop[i]);
        grad.addColorStop(1, colorsMid[i]);
        ctx.fillStyle = grad;
        ctx.fillRect(x, baseline - barHeight, barWidth, barHeight);

        const reflHeight = Math.min(barHeight * 0.5, maxReflection);
        const reflGrad = ctx.createLinearGradient(0, baseline, 0, baseline + reflHeight);
        reflGrad.addColorStop(0, colorsDim[i]);
        reflGrad.addColorStop(1, colorsFade[i]);
        ctx.fillStyle = reflGrad;
        ctx.fillRect(x, baseline, barWidth, reflHeight);
      }
    };

    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [canvas, primary, secondary]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={120}
      className="w-full h-[120px] rounded-lg"
      style={{ backgroundColor: background }}
    />
  );
}
