import { useState, useRef, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { SearchSuggestions } from './SearchSuggestions';

interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (q?: string) => void;
}

export function SearchInput({ value, onChange, onSubmit }: SearchInputProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (q.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const results = await api.suggest(q, controller.signal);
        setSuggestions(results);
        setHighlightIndex(-1);
        setShowSuggestions(results.length > 0);
      } catch {
        // Aborted or failed — ignore
      }
    }, 250);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const handleChange = (v: string) => {
    onChange(v);
    fetchSuggestions(v);
  };

  const selectSuggestion = (s: string) => {
    onChange(s);
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightIndex(-1);
    onSubmit(s);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      if (e.key === 'Enter') onSubmit();
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((i) => (i + 1) % suggestions.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
          selectSuggestion(suggestions[highlightIndex]);
        } else {
          setShowSuggestions(false);
          onSubmit();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setHighlightIndex(-1);
        break;
    }
  };

  return (
    <div className="relative group">
      <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
        <span className="material-symbols-outlined text-primary text-3xl">search</span>
      </div>
      <input
        autoFocus
        className="w-full bg-surface-container-low border-none rounded-full py-8 pl-20 pr-8 text-2xl font-headline font-bold text-on-surface placeholder:text-on-surface-variant focus:ring-2 focus:ring-secondary/50 transition-all shadow-2xl shadow-primary/10 outline-none"
        placeholder="Search tracks, artists, or paste a YouTube URL..."
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
      />
      {showSuggestions && (
        <SearchSuggestions
          suggestions={suggestions}
          highlightIndex={highlightIndex}
          onSelect={selectSuggestion}
          onClose={() => setShowSuggestions(false)}
        />
      )}
    </div>
  );
}
