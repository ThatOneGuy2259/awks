import { useEffect, useState, useRef, useCallback, type RefObject } from 'react';
import { useNavigate } from 'react-router-dom';
import { useThemeStore, applyTheme } from '../../stores/themeStore';
import { getAllThemes } from '../../stores/customThemeStore';
import { useDesktopGate } from './hooks/useDesktopGate';
import { DesktopGate } from './DesktopGate';
import { WmpShell } from './WmpShell';
import { LibraryView } from './LibraryView';
import { NowPlayingView } from './NowPlayingView';
import { useWmpSearch } from './hooks/useWmpSearch';
import { EnhancementsPanel } from './EnhancementsPanel';

export type WmpTab = 'nowPlaying' | 'library';

export interface VisualizerHandle {
  nextPreset: () => void;
  previousPreset: () => void;
}

interface WmpPageProps {
  analyserRef: RefObject<AnalyserNode | null>;
  audioContextRef: RefObject<AudioContext | null>;
  volume: number;
  setVolume: (v: number) => void;
}

export function WmpPage({ analyserRef, audioContextRef, volume, setVolume }: WmpPageProps) {
  const { gated } = useDesktopGate();
  const [stylesLoaded, setStylesLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<WmpTab>('nowPlaying');
  const [enhancementsOpen, setEnhancementsOpen] = useState(false);
  const visualizerRef = useRef<VisualizerHandle | null>(null);
  const search = useWmpSearch();
  const navigate = useNavigate();
  const handleExit = useCallback(() => {
    // Restore the previous CSS theme (built-in or custom) and navigate home.
    // We look up across all themes — themeStore's setTheme only knows built-ins,
    // so for custom themes we apply directly.
    const previous = useThemeStore.getState().previousCssTheme;
    const previousDef = getAllThemes().find((t) => t.id === previous);
    if (previousDef) {
      useThemeStore.getState().setTheme(previous);
      applyTheme(previousDef);
    }
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    if (gated) return;
    // Dynamic imports: Vite lazy-loads these only on first mount.
    Promise.all([
      import('7.css/dist/7.css'),
      import('./styles/wmp.css'),
    ]).then(() => setStylesLoaded(true));
  }, [gated]);

  if (gated) return <DesktopGate />;
  if (!stylesLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="wmp-app">
      <WmpShell
        activeTab={activeTab}
        onTabChange={setActiveTab}
        enhancementsOpen={enhancementsOpen}
        onToggleEnhancements={() => setEnhancementsOpen((v) => !v)}
        visualizerRef={visualizerRef}
        search={search}
        onExit={handleExit}
      >
        {activeTab === 'nowPlaying' ? (
          <NowPlayingView
            volume={volume}
            setVolume={setVolume}
            analyserRef={analyserRef}
            audioContextRef={audioContextRef}
            visualizerRef={visualizerRef}
          />
        ) : (
          <LibraryView search={search} />
        )}
      </WmpShell>
      <EnhancementsPanel
        open={enhancementsOpen}
        onClose={() => setEnhancementsOpen(false)}
      />
    </div>
  );
}
