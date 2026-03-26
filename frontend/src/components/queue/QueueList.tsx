import { useQueueStore } from '../../stores/queueStore';
import { QueueItem } from './QueueItem';

export function QueueList() {
  const tracks = useQueueStore((s) => s.tracks);
  const pending = tracks.filter((t) => t.status === 'pending');

  if (pending.length === 0) {
    return (
      <div className="text-center py-12 text-on-surface-variant">
        <span className="material-symbols-outlined text-4xl mb-2 block">queue_music</span>
        <p>Queue is empty. Search and add some tracks!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {pending.map((track, i) => (
        <QueueItem key={track.id} track={track} index={i + 1} />
      ))}
    </div>
  );
}
