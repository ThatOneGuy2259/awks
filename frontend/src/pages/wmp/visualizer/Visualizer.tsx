import { useEffect, useRef, useImperativeHandle, forwardRef, type RefObject } from 'react';
import type { VisualizerHandle } from '../WmpPage';
import { pickCuratedPresets, CYCLE_INTERVAL_MS, BLEND_DURATION_SEC } from './presets';

// Butterchurn doesn't ship types — declare minimal shapes we use.
interface ButterchurnVisualizer {
  connectAudio: (node: AudioNode) => void;
  disconnectAudio: (node: AudioNode) => void;
  loadPreset: (preset: unknown, blendTime: number) => void;
  setRendererSize: (width: number, height: number) => void;
  render: () => void;
}

interface VisualizerProps {
  analyserRef: RefObject<AnalyserNode | null>;
  audioContextRef: RefObject<AudioContext | null>;
}

export const Visualizer = forwardRef<VisualizerHandle, VisualizerProps>(
  ({ analyserRef, audioContextRef }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const visualizerRef = useRef<ButterchurnVisualizer | null>(null);
    const presetsRef = useRef<Array<[string, unknown]>>([]);
    const presetIndexRef = useRef(0);
    const rafRef = useRef<number | null>(null);
    const cycleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mountedRef = useRef(true);

    const loadPresetAtIndex = (index: number) => {
      const visualizer = visualizerRef.current;
      const presets = presetsRef.current;
      if (!visualizer || presets.length === 0) return;
      const normalized = ((index % presets.length) + presets.length) % presets.length;
      presetIndexRef.current = normalized;
      const [, preset] = presets[normalized];
      try {
        visualizer.loadPreset(preset, BLEND_DURATION_SEC);
      } catch (err) {
        console.warn('[wmp visualizer] loadPreset failed:', err);
      }
    };

    useImperativeHandle(ref, () => ({
      nextPreset: () => loadPresetAtIndex(presetIndexRef.current + 1),
      previousPreset: () => loadPresetAtIndex(presetIndexRef.current - 1),
    }));

    useEffect(() => {
      mountedRef.current = true;
      let cancelled = false;

      const init = async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Wait for analyser and context to be ready
        const waitForAudio = () =>
          new Promise<{ analyser: AnalyserNode; context: AudioContext } | null>((resolve) => {
            const attempt = (tries: number) => {
              const analyser = analyserRef.current;
              const context = audioContextRef.current;
              if (analyser && context) {
                resolve({ analyser, context });
              } else if (tries > 30) {
                resolve(null);
              } else {
                setTimeout(() => attempt(tries + 1), 200);
              }
            };
            attempt(0);
          });

        const audio = await waitForAudio();
        if (cancelled || !audio) return;

        try {
          const butterchurnModule = await import('butterchurn');
          const butterchurnPresetsModule = await import('butterchurn-presets');

          // Walk the default-export chain. Webpack UMD + Vite CJS interop can
          // produce { default: { default: Class, __esModule: true } } — keep
          // unwrapping until we find an object/class with the method we need.
          // Note: classes have typeof === 'function', not 'object', so we must
          // accept both. Static methods on a class show up as own properties
          // via the `in` operator on the constructor.
          const unwrap = <T,>(mod: unknown, methodName: string): T => {
            let cur: unknown = mod;
            for (let i = 0; i < 5; i++) {
              if (cur && (typeof cur === 'object' || typeof cur === 'function') && methodName in (cur as object)) {
                return cur as T;
              }
              if (cur && (typeof cur === 'object' || typeof cur === 'function') && 'default' in (cur as object)) {
                cur = (cur as { default: unknown }).default;
                continue;
              }
              break;
            }
            throw new Error(`Could not unwrap ${methodName} from module`);
          };

          const butterchurn = unwrap<{ createVisualizer: (ctx: AudioContext, canvas: HTMLCanvasElement, opts: object) => ButterchurnVisualizer }>(butterchurnModule, 'createVisualizer');
          const butterchurnPresets = unwrap<{ getPresets: () => Record<string, unknown> }>(butterchurnPresetsModule, 'getPresets');

          // Wait for the canvas to actually be laid out at non-zero size before
          // we initialize butterchurn — the visualizer's viewport can't be
          // resized correctly after creation if it starts at the wrong aspect.
          const waitForCanvasSize = () =>
            new Promise<{ width: number; height: number }>((resolve) => {
              const attempt = (tries: number) => {
                const r = canvas.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) {
                  resolve({ width: r.width, height: r.height });
                } else if (tries > 60) {
                  // Fallback: use window dimensions if the canvas never sized.
                  resolve({ width: window.innerWidth, height: window.innerHeight });
                } else {
                  requestAnimationFrame(() => attempt(tries + 1));
                }
              };
              attempt(0);
            });

          const dims = await waitForCanvasSize();
          if (cancelled) return;

          const pixelRatio = window.devicePixelRatio || 1;
          const cssWidth = Math.floor(dims.width);
          const cssHeight = Math.floor(dims.height);
          // Butterchurn expects the canvas backing buffer to equal its CSS
          // dimensions (it does its own high-DPI handling via texsize internally,
          // and its final output viewport is set to (this.width, this.height)).
          // If we multiply by pixelRatio here, the visualizer renders into the
          // bottom-left quadrant of an oversized canvas.
          canvas.width = cssWidth;
          canvas.height = cssHeight;

          const visualizer: ButterchurnVisualizer = butterchurn.createVisualizer(audio.context, canvas, {
            width: cssWidth,
            height: cssHeight,
            pixelRatio,
            textureRatio: 1,
          });

          visualizer.connectAudio(audio.analyser);

          const allPresets = butterchurnPresets.getPresets();
          const curated = pickCuratedPresets(allPresets);
          presetsRef.current = curated;

          if (cancelled) return;
          visualizerRef.current = visualizer;
          loadPresetAtIndex(0);

          // Render loop
          const renderLoop = () => {
            if (!mountedRef.current) return;
            try {
              visualizer.render();
            } catch (err) {
              console.warn('[wmp visualizer] render failed:', err);
            }
            rafRef.current = requestAnimationFrame(renderLoop);
          };
          rafRef.current = requestAnimationFrame(renderLoop);

          // Cycle presets
          cycleTimerRef.current = setInterval(() => {
            loadPresetAtIndex(presetIndexRef.current + 1);
          }, CYCLE_INTERVAL_MS);

          // Resize handling — keep canvas backing buffer and Butterchurn's
          // viewport in sync with the canvas's CSS size. (Butterchurn expects
          // canvas.width === css width; pixelRatio is handled via texsize.)
          const handleResize = () => {
            const r = canvas.getBoundingClientRect();
            const w = Math.max(1, Math.floor(r.width));
            const h = Math.max(1, Math.floor(r.height));
            canvas.width = w;
            canvas.height = h;
            visualizer.setRendererSize(w, h);
          };
          const resizeObserver = new ResizeObserver(handleResize);
          resizeObserver.observe(canvas);

          // Stash cleanup on the visualizer ref so the unmount effect can reach it
          (visualizer as { __cleanup?: () => void }).__cleanup = () => {
            resizeObserver.disconnect();
          };
        } catch (err) {
          console.warn('[wmp visualizer] init failed:', err);
        }
      };

      init();

      return () => {
        cancelled = true;
        mountedRef.current = false;
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        if (cycleTimerRef.current) clearInterval(cycleTimerRef.current);
        const v = visualizerRef.current;
        if (v) {
          try {
            if (analyserRef.current) v.disconnectAudio(analyserRef.current);
            (v as { __cleanup?: () => void }).__cleanup?.();
          } catch (err) {
            console.warn('[wmp visualizer] cleanup failed:', err);
          }
        }
        visualizerRef.current = null;
      };
    }, [analyserRef, audioContextRef]);

    return <canvas ref={canvasRef} className="wmp-visualizer-canvas" />;
  },
);
Visualizer.displayName = 'Visualizer';
