import { useState, useEffect } from 'react';
import { SearchInput } from '../components/search/SearchInput';
import { TrackCard } from '../components/search/TrackCard';
import { EmptyState } from '../components/EmptyState';
import { api, type SearchResult, type HistoryEntry } from '../lib/api';
import { useQueueStore } from '../stores/queueStore';
import { useUserStore } from '../stores/userStore';
import { useSettingsStore } from '../stores/settingsStore';
import { useRequestTrack } from '../hooks/useRequestTrack';
import { formatTime } from '../lib/formatTime';

const fallbackTags = ['Phonk', 'Midnight Lo-fi', 'Cyberpunk 2077', 'Hyperpop', 'Synthwave', 'Chillhop'];

export function SearchRequestView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [trendingTags, setTrendingTags] = useState<string[]>(fallbackTags);
  const [recent, setRecent] = useState<HistoryEntry[]>([]);
  const { request, requesting, lastRequestedId } = useRequestTrack();

  useEffect(() => {
    api.trendingTags()
      .then((data) => {
        if (data.tags && data.tags.length > 0) {
          setTrendingTags(data.tags);
        }
      })
      .catch(() => {
        // Keep fallback tags
      });

    api.getHistory(20, 0)
      .then((data) => {
        const seen = new Set<string>();
        const unique = (data || []).filter((e) => {
          if (seen.has(e.video_id)) return false;
          seen.add(e.video_id);
          return true;
        });
        setRecent(unique.slice(0, 6));
      })
      .catch(() => {});
  }, []);

  const tracks = useQueueStore((s) => s.tracks);
  const userId = useUserStore((s) => s.id);
  const maxTracks = useSettingsStore((s) => s.maxTracksPerUser);

  const myPendingCount = tracks.filter(
    (t) => t.requested_by === userId && (t.status === 'pending' || t.status === 'playing')
  ).length;
  const slotsRemaining = Math.max(0, maxTracks - myPendingCount);
  const atLimit = slotsRemaining === 0;

  const handleSearch = async (q?: string) => {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const data = await api.search(searchQuery);
      setResults(data);
    } catch (err) {
      console.error('search error:', err);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen pt-4 pb-32 px-6 lg:px-24">
      {/* Search Input */}
      <div className="max-w-4xl mx-auto mb-16">
        <SearchInput value={query} onChange={setQuery} onSubmit={handleSearch} />

        {/* Queue Slot Counter */}
        <div className="mt-4 flex items-center gap-2">
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${
            atLimit
              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
              : slotsRemaining === 1
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-surface-container-high text-on-surface-variant border border-outline-variant/15'
          }`}>
            {myPendingCount}/{maxTracks} queue slots used
          </span>
          {atLimit && (
            <span className="text-xs text-red-400">Wait for a track to finish before adding more</span>
          )}
        </div>

        {/* Trending Suggestions */}
        <div className="mt-8 flex flex-wrap gap-3 items-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-on-surface-variant mr-2 font-label">
            Trending
          </span>
          {trendingTags.map((tag) => (
            <button
              key={tag}
              onClick={() => {
                setQuery(tag);
                handleSearch(tag);
              }}
              className="bg-surface-container-high px-6 py-2 rounded-full text-sm font-medium hover:bg-white/10 transition-all border border-outline-variant/15"
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Pre-search: jump back into recently played */}
      {!loading && !searched && recent.length > 0 && (
        <div className="max-w-4xl mx-auto">
          <h2 className="text-sm font-bold uppercase tracking-widest text-on-surface-variant mb-4 font-label">
            Jump back in
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recent.map((entry) => {
              const requested = lastRequestedId === entry.video_id;
              return (
                <button
                  key={entry.id}
                  onClick={() => request(entry.video_id)}
                  disabled={requesting || requested || atLimit}
                  title={requested ? 'Added to queue' : 'Play again'}
                  className="group flex items-center gap-3 p-2.5 rounded-xl bg-surface-container-high/60 border border-outline-variant/10 hover:border-primary/30 hover:bg-surface-container-high transition-all text-left disabled:opacity-50"
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container">
                    <img
                      src={`https://img.youtube.com/vi/${entry.video_id}/default.jpg`}
                      alt={entry.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-on-surface truncate" title={entry.title}>{entry.title}</p>
                    <p className="text-xs text-on-surface-variant truncate">
                      {entry.artist || entry.requester_name}
                      {entry.duration_sec > 0 && <span className="ml-2 opacity-60">{formatTime(entry.duration_sec)}</span>}
                    </p>
                  </div>
                  <span className="material-symbols-outlined text-secondary flex-shrink-0 mr-1">
                    {requested ? 'check' : 'replay'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search Results */}
      {loading && (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <EmptyState
          icon="search_off"
          title="No results found"
          subtitle="Try a different search term, or paste a YouTube URL."
        />
      )}

      {!loading && results.length > 0 && (
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-3xl font-headline font-extrabold tracking-tight">Top Results</h2>
            <span className="text-secondary text-sm font-bold uppercase tracking-widest">
              {results.length} Matches
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((result, i) => (
              <TrackCard key={result.video_id} track={result} featured={i === 0} disabled={atLimit} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
