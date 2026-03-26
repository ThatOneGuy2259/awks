import type { QueueTrack } from '../../lib/api';
import { api } from '../../lib/api';
import { useUserStore } from '../../stores/userStore';

interface QueueItemProps {
  track: QueueTrack;
  index: number;
}

export function QueueItem({ track, index }: QueueItemProps) {
  const isAdmin = useUserStore((s) => s.role === 'admin');

  const handleRemove = async () => {
    try {
      await api.deleteFromQueue(track.id);
    } catch (err) {
      console.error('remove error:', err);
    }
  };

  return (
    <div className="group flex items-center gap-6 p-4 rounded-lg bg-surface-container hover:bg-surface-container-high transition-all duration-300">
      <span className="text-on-surface-variant font-black text-lg w-6 opacity-30 group-hover:opacity-100 transition-opacity">
        {String(index).padStart(2, '0')}
      </span>
      <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
        <img
          className="w-full h-full object-cover"
          src={track.thumbnail_url || `https://img.youtube.com/vi/${track.video_id}/default.jpg`}
          alt={track.title}
        />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="font-bold text-on-surface truncate group-hover:text-primary transition-colors">
          {track.title}
        </h4>
        <p className="text-on-surface-variant text-sm truncate">{track.artist}</p>
      </div>
      <div className="hidden md:flex items-center gap-2 text-on-surface-variant text-xs font-medium px-4">
        {track.requester_avatar && (
          <img className="w-6 h-6 rounded-full" src={track.requester_avatar} alt={track.requester_name} />
        )}
        <span>
          Requested by <span className="text-on-surface">{track.requester_name}</span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button className="p-2 text-on-surface-variant hover:text-secondary transition-colors">
          <span className="material-symbols-outlined">thumb_up</span>
        </button>
        {isAdmin && (
          <button
            onClick={handleRemove}
            className="p-2 text-on-surface-variant hover:text-error transition-colors"
            title="Remove from queue"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>
    </div>
  );
}
