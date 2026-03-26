import { useEffect, useState, useCallback } from 'react';
import { api } from '../lib/api';
import type { HistoryEntry } from '../lib/api';

export function HistoryView() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    api.getHistory(20, 0)
      .then((data) => {
        setEntries(data);
        setHasMore(data.length >= 20);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    api.getHistory(20, entries.length)
      .then((data) => {
        setEntries((prev) => [...prev, ...data]);
        setHasMore(data.length >= 20);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [entries.length, loadingMore, hasMore]);

  function formatTime(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h2 className="text-3xl font-black font-headline tracking-tighter text-on-surface">History</h2>
        <p className="text-sm text-on-surface-variant mt-1">Previously played tracks</p>
      </div>

      {entries.length === 0 ? (
        <div className="text-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-5xl mb-4 block">history</span>
          <p className="text-lg font-medium">No tracks played yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group"
            >
              <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container">
                <img
                  src={`https://img.youtube.com/vi/${entry.video_id}/default.jpg`}
                  alt={entry.title}
                  className="w-full h-full object-cover"
                />
                {entry.skipped && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="material-symbols-outlined text-sm text-orange-400">skip_next</span>
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-on-surface truncate">{entry.title}</p>
                <p className="text-xs text-on-surface-variant truncate">
                  {entry.artist ? `${entry.artist} \u00b7 ` : ''}{entry.requester_name}
                </p>
              </div>

              <div className="flex items-center gap-4 flex-shrink-0">
                <span className="text-xs text-on-surface-variant tabular-nums">{formatTime(entry.duration_sec)}</span>
                <span className="text-xs text-on-surface-variant/60 w-16 text-right">{formatDate(entry.played_at)}</span>
              </div>
            </div>
          ))}

          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 text-sm text-on-surface-variant hover:text-primary transition-colors"
            >
              {loadingMore ? (
                <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
              ) : (
                'Load more'
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
