import { useState, useMemo, useEffect } from 'react';
import { useQueueStore } from '../../stores/queueStore';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useSkipVoteStore } from '../../stores/skipVoteStore';
import { useUserStore } from '../../stores/userStore';
import { api } from '../../lib/api';
import { toast } from '../../stores/toastStore';
import { WmpListRow } from './components/WmpListRow';
import type { UseWmpSearchReturn } from './hooks/useWmpSearch';

type SortKey = 'title' | 'artist' | 'duration' | 'requester';
type SortDirection = 'asc' | 'desc' | null;

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface LibraryViewProps {
  search: UseWmpSearchReturn;
}

export function LibraryView({ search }: LibraryViewProps) {
  const tracks = useQueueStore((s) => s.tracks);
  const currentTrack = usePlaybackStore((s) => s.currentTrack);
  const userId = useUserStore((s) => s.id);
  const isAdmin = useUserStore((s) => s.role === 'admin');
  const { votes, votedByMe, getVotesRequired } = useSkipVoteStore();
  const votesRequired = getVotesRequired();
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Escape clears the dropdown when results/suggestions are showing.
  useEffect(() => {
    if (!search.query) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') search.clear();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [search.query, search.clear]);

  const sortedTracks = useMemo(() => {
    if (!sortKey || !sortDir) return tracks;
    const sorted = [...tracks];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'title') cmp = a.title.localeCompare(b.title);
      else if (sortKey === 'artist') cmp = a.artist.localeCompare(b.artist);
      else if (sortKey === 'duration') cmp = a.duration_sec - b.duration_sec;
      else if (sortKey === 'requester') cmp = a.requester_name.localeCompare(b.requester_name);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [tracks, sortKey, sortDir]);

  const cycleSort = (key: SortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDir('asc');
    } else if (sortDir === 'asc') {
      setSortDir('desc');
    } else {
      setSortKey(null);
      setSortDir(null);
    }
  };

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  };

  const handleSkipVote = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTrack) return;
    try {
      if (votedByMe) {
        await api.retractSkipVote(currentTrack.queueId);
        useSkipVoteStore.getState().setVotedByMe(false);
      } else {
        await api.castSkipVote(currentTrack.queueId);
        useSkipVoteStore.getState().setVotedByMe(true);
      }
    } catch (err) {
      console.error('vote skip error:', err);
    }
  };

  const handleRemove = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    try {
      await api.deleteFromQueue(trackId);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to remove');
    }
  };

  const renderTitleCell = (t: typeof sortedTracks[number]) => {
    const isPlaying = t.id === currentTrack?.queueId;
    return (
      <span className={isPlaying ? 'wmp-library__playing-title' : ''}>
        {isPlaying && <span className="wmp-library__playing-indicator">▶</span>}
        {t.title}
      </span>
    );
  };

  const renderActionCell = (t: typeof sortedTracks[number]) => {
    const isPlaying = t.id === currentTrack?.queueId;
    const isMine = userId !== '' && t.requested_by === userId;
    // Immediate removal allowed when:
    //   - You're an admin (any song)
    //   - You own a pending song
    //   - You own the currently playing song AND you've already voted to skip it
    const canImmediateRemove =
      isAdmin || (isMine && (!isPlaying || votedByMe));

    if (isPlaying) {
      return (
        <div className="wmp-library__action-group">
          <button
            type="button"
            className={`wmp-library__skip-btn ${votedByMe ? 'wmp-library__skip-btn--active' : ''}`}
            onClick={handleSkipVote}
            title={votedByMe ? `Retract vote (${votes}/${votesRequired})` : `Vote to skip (${votes}/${votesRequired})`}
          >
            ⏭ {votes}/{votesRequired}
          </button>
          {canImmediateRemove && (
            <button
              type="button"
              className="wmp-library__remove-btn wmp-library__remove-btn--always"
              onClick={(e) => handleRemove(e, t.id)}
              title="Remove immediately"
            >
              ✕
            </button>
          )}
        </div>
      );
    }
    if (canImmediateRemove && t.status === 'pending') {
      return (
        <button
          type="button"
          className={`wmp-library__remove-btn ${isAdmin && !isMine ? 'wmp-library__remove-btn--always' : ''}`}
          onClick={(e) => handleRemove(e, t.id)}
          title={isAdmin && !isMine ? 'Remove (admin)' : 'Remove from queue'}
        >
          ✕ Remove
        </button>
      );
    }
    return null;
  };

  const dropdownVisible = search.query.length > 0 && (
    search.loading ||
    !!search.error ||
    search.results.length > 0 ||
    search.suggestions.length > 0
  );

  return (
    <div className="wmp-library">
      <aside className="wmp-library__nav-tree">
        <div className="wmp-library__nav-heading">Playlists</div>
        <div className="wmp-library__nav-heading">Music</div>
        <div className="wmp-library__nav-item">Now Playing</div>
        <div className="wmp-library__nav-item wmp-library__nav-item--active">Queue</div>
        <div className="wmp-library__nav-item">Recently Requested</div>
      </aside>

      <section className="wmp-library__content">
        {dropdownVisible && (
          <div className="wmp-search__dropdown">
            {search.loading && <div className="wmp-search__dropdown-status">Searching…</div>}
            {search.error && (
              <div className="wmp-search__dropdown-status wmp-search__dropdown-status--error">{search.error}</div>
            )}
            {!search.loading && !search.error && search.results.length > 0 && (
              <>
                {search.results.map((r) => (
                  <button
                    key={r.video_id}
                    className="wmp-search__dropdown-row"
                    onClick={() => search.request(r)}
                  >
                    <span className="wmp-search__dropdown-title">{r.title}</span>
                    <span className="wmp-search__dropdown-artist">{r.artist}</span>
                  </button>
                ))}
              </>
            )}
            {!search.loading && !search.error && search.results.length === 0 && search.suggestions.length > 0 && (
              <>
                {search.suggestions.map((s, i) => (
                  <button
                    key={i}
                    className="wmp-search__dropdown-row wmp-search__dropdown-row--suggestion"
                    onClick={() => search.submit(s)}
                  >
                    <span className="wmp-search__dropdown-suggestion-icon">↗</span>
                    <span>{s}</span>
                  </button>
                ))}
                <div className="wmp-search__dropdown-hint">Press Enter to search</div>
              </>
            )}
          </div>
        )}
        <div className="wmp-library__rows">
          <WmpListRow
            isHeader
            cells={[
              <button className="wmp-library__col-btn" onClick={() => cycleSort('title')}>Title{sortIndicator('title')}</button>,
              <button className="wmp-library__col-btn" onClick={() => cycleSort('artist')}>Artist{sortIndicator('artist')}</button>,
              <button className="wmp-library__col-btn" onClick={() => cycleSort('duration')}>Length{sortIndicator('duration')}</button>,
              <button className="wmp-library__col-btn" onClick={() => cycleSort('requester')}>Requested By{sortIndicator('requester')}</button>,
              <span />,
            ]}
          />
          {sortedTracks.length === 0 ? (
            <div className="wmp-library__empty">
              The queue is empty. Use the search box above to request a song.
            </div>
          ) : (
            sortedTracks.map((t) => {
              const isPlaying = t.id === currentTrack?.queueId;
              return (
                <WmpListRow
                  key={t.id}
                  selected={selectedId === t.id}
                  playing={isPlaying}
                  onClick={() => setSelectedId(t.id)}
                  cells={[
                    renderTitleCell(t),
                    t.artist,
                    formatDuration(t.duration_sec),
                    t.requester_name,
                    renderActionCell(t),
                  ]}
                />
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
