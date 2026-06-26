import { useQueueStore } from '../../stores/queueStore';
import { QueueItem } from './QueueItem';
import { EmptyState } from '../EmptyState';

export function QueueList() {
  const tracks = useQueueStore((s) => s.tracks);
  const pending = tracks.filter((t) => t.status === 'pending');

  if (pending.length === 0) {
    return (
      <EmptyState
        icon="queue_music"
        title="Queue is empty"
        subtitle="Search and add some tracks to get the party started."
        size="sm"
      />
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
