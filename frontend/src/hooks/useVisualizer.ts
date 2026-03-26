import { useEffect, useRef, type RefObject } from 'react';

export function useVisualizer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  analyserRef: RefObject<AnalyserNode | null>,
) {
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const barCount = bufferLength;
      const gap = 2;
      const barWidth = (width - gap * (barCount - 1)) / barCount;

      for (let i = 0; i < barCount; i++) {
        const value = dataArray[i] / 255;
        const barHeight = value * height;

        const hue = 270 + (i / barCount) * 90;
        ctx.fillStyle = `hsla(${hue}, 80%, 60%, ${0.6 + value * 0.4})`;

        const x = i * (barWidth + gap);
        const y = height - barHeight;

        const radius = Math.min(barWidth / 2, 3);
        ctx.beginPath();
        ctx.moveTo(x, height);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.lineTo(x + barWidth - radius, y);
        ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
        ctx.lineTo(x + barWidth, height);
        ctx.fill();
      }
    };

    draw();
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [canvasRef, analyserRef, analyserRef.current]);
}
