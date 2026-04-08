import { useState, useEffect, useRef, type RefObject } from 'react';
import type { VisualizerHandle, WmpTab } from '../WmpPage';

interface WmpOptionsButtonProps {
  activeTab: WmpTab;
  enhancementsOpen: boolean;
  onToggleEnhancements: () => void;
  visualizerRef: RefObject<VisualizerHandle | null>;
  onExit: () => void;
}

export function WmpOptionsButton({
  activeTab,
  enhancementsOpen,
  onToggleEnhancements,
  visualizerRef,
  onExit,
}: WmpOptionsButtonProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const visualizerAvailable = activeTab === 'nowPlaying' && visualizerRef.current !== null;

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        type="button"
        className="wmp-options-button"
        aria-label="Options"
        onClick={() => setOpen((v) => !v)}
      >
        »
      </button>
      {open && (
        <div className="wmp-options-popover">
          <button
            type="button"
            className="wmp-options-popover__item"
            onClick={() => {
              onToggleEnhancements();
              setOpen(false);
            }}
          >
            {enhancementsOpen ? '✓ ' : ''}Live Chat
          </button>
          <button
            type="button"
            className="wmp-options-popover__item"
            disabled={!visualizerAvailable}
            onClick={() => {
              visualizerRef.current?.nextPreset();
              setOpen(false);
            }}
          >
            Next Visualization
          </button>
          <div className="wmp-options-popover__separator" />
          <button
            type="button"
            className="wmp-options-popover__item"
            onClick={() => {
              setOpen(false);
              onExit();
            }}
          >
            Exit to modern view
          </button>
        </div>
      )}
    </div>
  );
}
