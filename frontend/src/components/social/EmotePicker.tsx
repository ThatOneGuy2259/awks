import { useState, useEffect } from 'react';
import { useEmoteStore } from '../../stores/emoteStore';
import './emotes.css';

interface EmotePickerProps {
  onEmoteSelect: (emoteCode: string) => void;
  onClose: () => void;
}

export function EmotePicker({ onEmoteSelect, onClose }: EmotePickerProps) {
  const emotes = useEmoteStore((s) => s.emotes);
  const loading = useEmoteStore((s) => s.loading);
  const initialize = useEmoteStore((s) => s.initialize);
  const [search, setSearch] = useState('');

  useEffect(() => {
    initialize();
  }, [initialize]);

  const filteredEmotes = emotes.filter(emote =>
    emote.code.toLowerCase().includes(search.toLowerCase())
  );

  const handleEmoteClick = (code: string) => {
    onEmoteSelect(code);
    onClose();
  };

  return (
    <div className="fixed bottom-20 right-4 z-50 bg-surface-container-high rounded-lg shadow-2xl border border-outline-variant/20 w-80 max-h-[80vh] flex flex-col">
      {/* Header */}
      <div className="p-3 border-b border-outline-variant/10 shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-on-surface">
            Emotes
            {!loading && <span className="text-xs text-on-surface-variant ml-2">({emotes.length})</span>}
          </h3>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-full hover:bg-surface-container-highest transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b border-outline-variant/10 shrink-0">
        <input
          type="text"
          placeholder="Search emotes..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 text-sm bg-surface-container rounded-md border border-outline-variant/20 focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface placeholder:text-on-surface-variant"
        />
      </div>

      {/* Emotes Grid */}
      <div className="flex-1 overflow-y-auto p-3 min-h-0">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-3"></div>
            <p className="text-sm text-on-surface-variant">Loading emotes from popular streams...</p>
          </div>
        ) : filteredEmotes.length === 0 ? (
          <p className="text-center text-on-surface-variant text-sm py-4">
            {search ? 'No emotes found' : 'No emotes available'}
          </p>
        ) : (
          <div className="grid grid-cols-6 gap-2">
            {filteredEmotes.map((emote) => (
              <button
                key={`${emote.provider}-${emote.id}-${emote.code}`}
                onClick={() => handleEmoteClick(emote.code)}
                className="aspect-square bg-surface-container rounded hover:bg-surface-container-highest transition-colors p-1 flex items-center justify-center group relative"
                title={emote.code}
              >
                <img
                  src={emote.link}
                  alt={emote.code}
                  className={`max-w-full max-h-full object-contain ${emote.animated ? 'animate-pulse' : ''}`}
                />
                <div className="absolute inset-x-0 -bottom-6 opacity-0 group-hover:opacity-100 transition-opacity bg-surface-container-high rounded px-1 py-0.5 pointer-events-none">
                  <p className="text-xs text-on-surface truncate">{emote.code}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
