import type { QueueTrack } from '../../lib/api';
import { api } from '../../lib/api';

interface AdminQueueItemProps {
  track: QueueTrack;
  isPlaying?: boolean;
}

export function AdminQueueItem({ track, isPlaying }: AdminQueueItemProps) {
  const handleDelete = async () => {
    try {
      await api.deleteFromQueue(track.id);
    } catch (err) {
      console.error('delete error:', err);
    }
  };

  const handleMoveToTop = async () => {
    try {
      await api.moveToTop(track.id);
    } catch (err) {
      console.error('move to top error:', err);
    }
  };

  return (
    <div
      className={`rounded-xl p-4 flex items-center gap-6 group transition-colors ${
        isPlaying
          ? 'bg-surface-container-high/40 hover:bg-surface-container-high'
          : 'bg-surface-container-low hover:bg-surface-container-high'
      }`}
    >
      <div className="relative w-20 h-20 flex-shrink-0">
        <img
          className={`w-full h-full object-cover rounded-lg ${!isPlaying ? 'grayscale group-hover:grayscale-0 transition-all' : ''}`}
          src={track.thumbnail_url || `https://img.youtube.com/vi/${track.video_id}/default.jpg`}
          alt={track.title}
          loading="lazy"
        />
        {isPlaying && (
          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center rounded-lg">
            <span className="material-symbols-outlined text-primary animate-pulse" style={{ fontVariationSettings: "'FILL' 1" }}>
              equalizer
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {isPlaying ? (
            <span className="text-[10px] bg-secondary/20 text-secondary px-2 py-0.5 rounded font-black tracking-tighter">
              NOW PLAYING
            </span>
          ) : (
            <span className="text-[10px] bg-surface-container-highest text-on-surface-variant px-2 py-0.5 rounded font-black tracking-tighter uppercase">
              IN QUEUE
            </span>
          )}
          <span className="text-on-surface-variant text-xs">Requested by @{track.requester_name}</span>
        </div>
        <h4 className="text-xl font-bold truncate text-on-surface" title={track.title}>{track.title}</h4>
        <p className="text-on-surface-variant text-sm truncate font-medium">
          {track.artist} &bull; {Math.floor(track.duration_sec / 60)}:{String(track.duration_sec % 60).padStart(2, '0')}
        </p>
      </div>

      <div className={`flex gap-2 ${isPlaying ? '' : 'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity'}`}>
        {!isPlaying && (
          <button
            onClick={handleMoveToTop}
            className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:text-primary transition-all active:scale-90"
            title="Move to Top"
          >
            <span className="material-symbols-outlined">vertical_align_top</span>
          </button>
        )}
        <button
          onClick={handleDelete}
          className="w-10 h-10 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:text-error transition-all active:scale-90"
          title="Remove"
        >
          <span className="material-symbols-outlined">{isPlaying ? 'delete' : 'close'}</span>
        </button>
      </div>
    </div>
  );
}
