import { usePlaybackStore } from '../../../stores/playbackStore';
import { useListenerStore } from '../../../stores/listenerStore';
import { useConnectionStore } from '../../../stores/connectionStore';

export function WmpStatusBar() {
  const currentTrack = usePlaybackStore((s) => s.currentTrack);
  const listenerCount = useListenerStore((s) => s.count);
  const connectionStatus = useConnectionStore((s) => s.status);

  const connectionLabel = {
    connected: 'Connected',
    connecting: 'Connecting…',
    disconnected: 'Disconnected',
  }[connectionStatus];

  return (
    <div className="wmp-status-bar">
      <span className="wmp-status-bar__segment">{connectionLabel}</span>
      <span className="wmp-status-bar__segment">
        {currentTrack ? `Now Playing: ${currentTrack.title} — ${currentTrack.artist}` : 'Not streaming'}
      </span>
      <span className="wmp-status-bar__segment">{listenerCount} listener{listenerCount === 1 ? '' : 's'}</span>
    </div>
  );
}
