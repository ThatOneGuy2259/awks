import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../lib/api';
import type { HistoryEntry } from '../lib/api';
import { useUserStore } from '../stores/userStore';
import { useRequestTrack } from '../hooks/useRequestTrack';
import { ConfirmModal } from '../components/ConfirmModal';
import { EmptyState } from '../components/EmptyState';

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatRelative(iso: string) {
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

/** Day-bucket label for grouping (Today / Yesterday / weekday / date). */
function groupLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (dayDiff <= 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
}

function groupByDay(entries: HistoryEntry[]) {
  const groups: { label: string; items: HistoryEntry[] }[] = [];
  for (const entry of entries) {
    const label = groupLabel(entry.played_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(entry);
    else groups.push({ label, items: [entry] });
  }
  return groups;
}

export function HistoryView() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const isAdmin = useUserStore((s) => s.role === 'admin');
  const { request, requesting, lastRequestedId } = useRequestTrack();

  const fetchHistory = useCallback(() => {
    setLoading(true);
    api.getHistory(20, 0)
      .then((data) => {
        const rows = data || [];
        setEntries(rows);
        setHasMore(rows.length >= 20);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    api.getHistory(20, entries.length)
      .then((data) => {
        const rows = data || [];
        setEntries((prev) => [...prev, ...rows]);
        setHasMore(rows.length >= 20);
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  }, [entries.length, loadingMore, hasMore]);

  const handleDelete = async (id: string) => {
    try {
      await api.deleteHistoryEntry(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('delete history entry failed:', err);
    }
  };

  const handleClearAll = async () => {
    try {
      await api.clearHistory();
      setEntries([]);
    } catch (err) {
      console.error('clear history failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="material-symbols-outlined text-4xl text-primary animate-spin">progress_activity</span>
      </div>
    );
  }

  const groups = groupByDay(entries);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black font-headline tracking-tighter text-on-surface">History</h2>
          <p className="text-sm text-on-surface-variant mt-1">Previously played tracks</p>
        </div>
        {isAdmin && entries.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-full border border-red-500/20 text-red-400 text-xs font-bold hover:bg-red-500/10 transition-colors"
          >
            <span className="material-symbols-outlined text-sm">delete_sweep</span>
            Clear All
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <EmptyState icon="history" title="No tracks played yet" subtitle="Songs you and others play will show up here." />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => (
            <div key={group.label} className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-on-surface-variant/70 px-3">
                {group.label}
              </h3>
              {group.items.map((entry) => {
                const requested = lastRequestedId === entry.video_id;
                return (
                  <div
                    key={entry.id}
                    className="flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors group"
                  >
                    <div className="relative w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-surface-container">
                      <img
                        src={`https://img.youtube.com/vi/${entry.video_id}/default.jpg`}
                        alt={entry.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {entry.skipped && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <span className="material-symbols-outlined text-sm text-orange-400">skip_next</span>
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate" title={entry.title}>{entry.title}</p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {entry.artist ? `${entry.artist} · ` : ''}{entry.requester_name}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-xs text-on-surface-variant tabular-nums hidden sm:inline">{formatTime(entry.duration_sec)}</span>
                      <span className="text-xs text-on-surface-variant/60 w-16 text-right hidden sm:inline">{formatRelative(entry.played_at)}</span>
                      <button
                        onClick={() => request(entry.video_id)}
                        disabled={requesting || requested}
                        title={requested ? 'Added to queue' : 'Play again'}
                        aria-label={requested ? 'Added to queue' : 'Request this track again'}
                        className="p-2 rounded-full text-on-surface-variant hover:text-secondary hover:bg-secondary/10 transition-colors disabled:opacity-50 sm:opacity-0 sm:group-hover:opacity-100 disabled:sm:opacity-50"
                      >
                        <span className="material-symbols-outlined text-base">{requested ? 'check' : 'replay'}</span>
                      </button>
                      {isAdmin && (
                        <button
                          onClick={() => handleDelete(entry.id)}
                          className="p-1 text-on-surface-variant/40 hover:text-red-400 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                          title="Remove from history"
                          aria-label="Remove from history"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* Infinite scroll sentinel */}
          {hasMore && (
            <div className="py-4 flex justify-center">
              {loadingMore && (
                <span className="material-symbols-outlined text-base text-primary animate-spin">progress_activity</span>
              )}
              <InfiniteScrollSentinel onVisible={loadMore} />
            </div>
          )}
        </div>
      )}

      {showClearConfirm && (
        <ConfirmModal
          title="Clear all history?"
          message="This permanently removes every played track from the history. This cannot be undone."
          confirmLabel="Clear All"
          danger
          onConfirm={handleClearAll}
          onClose={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  );
}

function InfiniteScrollSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) onVisibleRef.current(); },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} />;
}
