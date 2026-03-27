import { useEffect, useRef } from 'react';

interface SearchSuggestionsProps {
  suggestions: string[];
  highlightIndex: number;
  onSelect: (suggestion: string) => void;
  onClose: () => void;
}

export function SearchSuggestions({ suggestions, highlightIndex, onSelect, onClose }: SearchSuggestionsProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  if (suggestions.length === 0) return null;

  return (
    <div
      ref={ref}
      className="absolute left-0 right-0 top-full mt-2 bg-surface-container-high rounded-2xl border border-outline-variant/10 shadow-2xl shadow-black/30 overflow-hidden z-50"
    >
      {suggestions.map((s, i) => (
        <button
          key={s}
          onMouseDown={(e) => { e.preventDefault(); onSelect(s); }}
          className={`w-full text-left px-6 py-3 flex items-center gap-3 text-sm transition-colors ${
            i === highlightIndex
              ? 'bg-primary/10 text-on-surface'
              : 'text-on-surface-variant hover:bg-white/5'
          }`}
        >
          <span className="material-symbols-outlined text-base opacity-50">search</span>
          <span className="truncate">{s}</span>
        </button>
      ))}
    </div>
  );
}
