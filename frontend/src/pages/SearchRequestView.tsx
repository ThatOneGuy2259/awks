import { useState } from 'react';
import { SearchInput } from '../components/search/SearchInput';
import { TrackCard } from '../components/search/TrackCard';
import { api, type SearchResult } from '../lib/api';

const trendingSuggestions = ['Phonk', 'Midnight Lo-fi', 'Cyberpunk 2077', 'Hyperpop', 'Synthwave', 'Chillhop'];

export function SearchRequestView() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

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
        <SearchInput value={query} onChange={setQuery} onSubmit={() => handleSearch()} />

        {/* Trending Suggestions */}
        <div className="mt-8 flex flex-wrap gap-3 items-center">
          <span className="text-sm font-semibold uppercase tracking-widest text-on-surface-variant mr-2 font-label">
            Trending
          </span>
          {trendingSuggestions.map((tag) => (
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

      {/* Search Results */}
      {loading && (
        <div className="text-center py-12">
          <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
        </div>
      )}

      {!loading && searched && results.length === 0 && (
        <div className="text-center py-12 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl block mb-2">search_off</span>
          <p>No results found. Try a different search.</p>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="max-w-6xl mx-auto">
          <div className="flex items-baseline justify-between mb-8">
            <h2 className="text-3xl font-headline font-extrabold tracking-tight">Top Results</h2>
            <span className="text-secondary text-sm font-bold uppercase tracking-widest">
              {results.length} Matches
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {results.map((result, i) => (
              <TrackCard key={result.video_id} track={result} featured={i === 0} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
