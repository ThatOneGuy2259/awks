import { useState, useEffect, useRef, useCallback } from 'react';
import { api, type SearchResult } from '../../../lib/api';
import { useRequestTrack } from '../../../hooks/useRequestTrack';

export interface UseWmpSearchReturn {
  query: string;
  setQuery: (q: string) => void;
  suggestions: string[];
  results: SearchResult[];
  loading: boolean;
  error: string | null;
  submit: (q?: string) => Promise<void>;
  request: (result: SearchResult) => Promise<void>;
  clear: () => void;
}

const SUGGEST_DEBOUNCE_MS = 250;
const MIN_SUGGEST_LENGTH = 2;

export function useWmpSearch(): UseWmpSearchReturn {
  const [query, setQueryState] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { request: requestTrack } = useRequestTrack();

  const setQuery = useCallback((q: string) => {
    setQueryState(q);
    setError(null);
    // Typing invalidates any previous results — go back to suggest mode.
    setResults([]);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (q.trim().length < MIN_SUGGEST_LENGTH) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const data = await api.suggest(q, controller.signal);
        setSuggestions(data);
      } catch {
        // Aborted or failed — leave suggestions alone.
      }
    }, SUGGEST_DEBOUNCE_MS);
  }, []);

  const submit = useCallback(async (q?: string) => {
    const searchQuery = (q ?? query).trim();
    if (!searchQuery) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (q !== undefined) setQueryState(q);
    setSuggestions([]);
    setLoading(true);
    setError(null);
    try {
      const data = await api.search(searchQuery);
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const clear = useCallback(() => {
    setQueryState('');
    setSuggestions([]);
    setResults([]);
    setError(null);
    setLoading(false);
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const request = useCallback(async (result: SearchResult) => {
    await requestTrack(result.video_id);
    clear();
  }, [requestTrack, clear]);

  return { query, setQuery, suggestions, results, loading, error, submit, request, clear };
}
