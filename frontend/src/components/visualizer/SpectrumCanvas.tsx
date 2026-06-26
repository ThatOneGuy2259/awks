import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { useVisualizer } from '../../hooks/useVisualizer';
import { useVisualizerStore, type VisualizerMode } from '../../stores/visualizerStore';
import { useUIStore } from '../../stores/uiStore';

// Modes that want a big, centered, full-viewport canvas (square-friendly) rather
// than the wide/short bottom strip. The strip suits bars/scope (hi-fi reflection
// over the player bar); centered modes render behind the page content (z-1).
const CENTERED_MODES = new Set<VisualizerMode>(['radial']);

export function SpectrumCanvas({ analyserRef }: { analyserRef: RefObject<AnalyserNode | null> }) {
  const mode = useVisualizerStore((s) => s.visualizerMode);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const hookRef = useVisualizer(analyserRef);
  const localRef = useRef<HTMLCanvasElement | null>(null);
  const centered = CENTERED_MODES.has(mode);

  // Merge the visualizer hook's callback ref with a local ref so we can also
  // size the buffer imperatively for full-screen modes.
  const setRef = useCallback((node: HTMLCanvasElement | null) => {
    localRef.current = node;
    hookRef(node);
  }, [hookRef]);

  // Centered modes size the backing buffer to the viewport (DPR-correct) so the
  // pixel aspect matches the CSS box — radial renders a true circle, not an
  // ellipse — and gets the full screen to work with.
  useEffect(() => {
    if (!centered) return;
    const c = localRef.current;
    if (!c) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      c.width = Math.round(window.innerWidth * dpr);
      c.height = Math.round(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [centered]);

  if (centered) {
    // Full-viewport backdrop, behind the page content (z-1).
    return (
      <canvas
        ref={setRef}
        className="hidden lg:block fixed inset-0 w-screen h-screen pointer-events-none z-[1]"
      />
    );
  }

  // Bottom strip — reflections overlap the player bar (sits above the bar
  // backdrop at z-49, below the bar content at z-52).
  return (
    <canvas
      ref={setRef}
      width={1920}
      height={280}
      className={`hidden lg:block fixed right-0 pointer-events-none z-[51] h-[220px] -bottom-[22px] xl:h-[280px] xl:-bottom-[4px] transition-[left,width] duration-300 ease-in-out ${sidebarCollapsed ? 'left-0 w-full' : 'left-64 w-[calc(100%-16rem)]'}`}
    />
  );
}
