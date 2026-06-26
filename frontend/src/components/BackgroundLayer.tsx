import { type RefObject } from 'react';
import { useVisualizerStore } from '../stores/visualizerStore';
import { BackgroundEffectCanvas } from './BackgroundEffect';
import { ParticleGLBackground } from './ParticleGLBackground';

interface BackgroundLayerProps {
  analyserRef: RefObject<AnalyserNode | null>;
}

// Memoised capability probe: OffscreenCanvas + transferControlToOffscreen +
// Worker + an actually-obtainable WebGL context. Runs at most once.
let cachedSupport: boolean | null = null;
function supportsParticleWorker(): boolean {
  if (cachedSupport !== null) return cachedSupport;
  try {
    const apisOk =
      typeof OffscreenCanvas !== 'undefined' &&
      typeof HTMLCanvasElement !== 'undefined' &&
      'transferControlToOffscreen' in HTMLCanvasElement.prototype &&
      typeof Worker !== 'undefined';
    if (!apisOk) {
      cachedSupport = false;
      return false;
    }
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl');
    cachedSupport = !!gl;
  } catch {
    cachedSupport = false;
  }
  return cachedSupport;
}

/**
 * Background renderer selector. For the 'particles' effect on capable browsers
 * it mounts the WebGL/OffscreenCanvas worker renderer; for every other case it
 * falls back to the main-thread 2D BackgroundEffectCanvas (which still handles
 * the other effects and a 2D particles implementation). The two renderers own
 * separate <canvas> elements and are mounted exclusively, so a canvas is never
 * transferred to a worker more than once.
 */
export function BackgroundLayer({ analyserRef }: BackgroundLayerProps) {
  const effect = useVisualizerStore((s) => s.backgroundEffect);
  const reduceVisuals = useVisualizerStore((s) => s.reduceVisuals);

  // Low-power mode: skip the background effect layer entirely.
  if (reduceVisuals || effect === 'none') return null;

  if (effect === 'particles' && supportsParticleWorker()) {
    return <ParticleGLBackground analyserRef={analyserRef} />;
  }

  return <BackgroundEffectCanvas analyserRef={analyserRef} />;
}
