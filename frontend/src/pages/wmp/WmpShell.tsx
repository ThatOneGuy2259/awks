import type { ReactNode, RefObject } from 'react';
import { WmpTitleBar } from './components/WmpTitleBar';
import { WmpTab } from './components/WmpTab';
import { WmpStatusBar } from './components/WmpStatusBar';
import { WmpSearchInput } from './components/WmpSearchInput';
import { WmpOptionsButton } from './components/WmpOptionsButton';
import type { WmpTab as WmpTabId, VisualizerHandle } from './WmpPage';
import type { UseWmpSearchReturn } from './hooks/useWmpSearch';

interface WmpShellProps {
  activeTab: WmpTabId;
  onTabChange: (tab: WmpTabId) => void;
  enhancementsOpen: boolean;
  onToggleEnhancements: () => void;
  visualizerRef: RefObject<VisualizerHandle | null>;
  search: UseWmpSearchReturn;
  onExit: () => void;
  children: ReactNode;
}

export function WmpShell({
  activeTab,
  onTabChange,
  enhancementsOpen,
  onToggleEnhancements,
  visualizerRef,
  search,
  onExit,
  children,
}: WmpShellProps) {
  return (
    <div className="wmp-shell">
      <WmpTitleBar onExit={onExit} />

      <div className="wmp-tab-row">
        <div className="wmp-tab-row__nav">
          <button type="button" className="wmp-nav-arrow" aria-label="Back" disabled>‹</button>
          <button type="button" className="wmp-nav-arrow" aria-label="Forward" disabled>›</button>
        </div>
        <div className="wmp-tab-row__tabs">
          <WmpTab id="nowPlaying" label="Now Playing" activeTab={activeTab} onSelect={onTabChange} />
          <WmpTab id="library" label="Library" activeTab={activeTab} onSelect={onTabChange} />
        </div>
        <div className="wmp-tab-row__right">
          <WmpSearchInput
            query={search.query}
            onQueryChange={search.setQuery}
            onSubmit={() => search.submit()}
            onClear={search.clear}
            activeTab={activeTab}
            onTabChange={onTabChange}
          />
          <WmpOptionsButton
            activeTab={activeTab}
            enhancementsOpen={enhancementsOpen}
            onToggleEnhancements={onToggleEnhancements}
            visualizerRef={visualizerRef}
            onExit={onExit}
          />
        </div>
      </div>

      <div className="wmp-shell__content">
        {children}
      </div>

      <WmpStatusBar />
    </div>
  );
}
