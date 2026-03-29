import { useState, useRef, useEffect, useCallback } from 'react';
import { api, type SearchResult } from '../../lib/api';
import { formatTime } from '../../lib/formatTime';
import { toast } from '../../stores/toastStore';

export function QuickSearch() {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [queuingIndex, setQueuingIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = useCallback(() => {
    setExpanded(false);
    setShowDropdown(false);
    setResults([]);
    setQuery('');
    setHighlightIndex(-1);
  }, []);

  // Click-outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [close]);

  // Focus input when expanded
  useEffect(() => {
    if (expanded && inputRef.current) {
      inputRef.current.focus();
    }
  }, [expanded]);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setShowDropdown(true);
    setHighlightIndex(-1);
    try {
      const data = await api.search(query);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleQueue = async (result: SearchResult, index: number) => {
    setQueuingIndex(index);
    try {
      await api.addToQueue(`https://www.youtube.com/watch?v=${result.video_id}`);
      toast('Queued!', 'success');
      close();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to queue', 'error');
    } finally {
      setQueuingIndex(-1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      return;
    }

    if (e.key === 'Enter' && !showDropdown) {
      handleSearch();
      return;
    }

    if (!showDropdown || results.length === 0) {
      if (e.key === 'Enter') handleSearch();
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % results.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => (i - 1 + results.length) % results.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < results.length) {
          handleQueue(results[highlightIndex], highlightIndex);
        }
        break;
    }
  };

  // Collapsed: just a search icon
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="text-on-surface-variant hover:text-primary transition-colors"
      >
        <span className="material-symbols-outlined">search</span>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Input */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Quick search..."
            className="w-48 sm:w-64 bg-surface-container-low border border-outline-variant/20 rounded-full py-1.5 pl-9 pr-3 text-sm text-on-surface placeholder:text-on-surface-variant focus:ring-2 focus:ring-secondary/50 focus:border-transparent outline-none transition-all"
          />
          <span className="material-symbols-outlined text-on-surface-variant text-base absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            search
          </span>
          {loading && (
            <span className="material-symbols-outlined text-primary text-base absolute right-3 top-1/2 -translate-y-1/2 animate-spin pointer-events-none">
              progress_activity
            </span>
          )}
        </div>
        <button
          onClick={close}
          className="text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-xl">close</span>
        </button>
      </div>

      {/* Results dropdown */}
      {showDropdown && (
        <div className="absolute top-full right-0 mt-2 w-[360px] max-h-[400px] overflow-y-auto bg-surface-container-high/95 backdrop-blur-lg border border-outline-variant/20 rounded-xl shadow-2xl shadow-black/30 z-50">
          {loading && results.length === 0 && (
            <div className="flex items-center justify-center py-8">
              <span className="material-symbols-outlined text-2xl text-primary animate-spin">progress_activity</span>
            </div>
          )}

          {!loading && results.length === 0 && (
            <div className="py-6 text-center text-sm text-on-surface-variant">
              No results
            </div>
          )}

          {results.map((result, i) => (
            <button
              key={result.video_id}
              onMouseDown={(e) => { e.preventDefault(); handleQueue(result, i); }}
              onMouseEnter={() => setHighlightIndex(i)}
              disabled={queuingIndex === i}
              className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors border-b border-outline-variant/10 last:border-b-0 ${
                i === highlightIndex
                  ? 'bg-primary/10'
                  : 'hover:bg-white/5'
              } ${queuingIndex === i ? 'opacity-50' : ''}`}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-on-surface truncate">{result.title}</p>
                <p className="text-xs text-on-surface-variant truncate">{result.artist}</p>
              </div>
              {result.duration_sec > 0 && (
                <span className="text-xs text-on-surface-variant flex-shrink-0 tabular-nums">
                  {formatTime(result.duration_sec)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
