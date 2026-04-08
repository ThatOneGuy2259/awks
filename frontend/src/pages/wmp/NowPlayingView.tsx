import type { RefObject } from 'react';
import { usePlaybackStore } from '../../stores/playbackStore';
import { useQueueStore } from '../../stores/queueStore';
import { TransportBar } from './TransportBar';
import { Visualizer } from './visualizer/Visualizer';
import type { VisualizerHandle } from './WmpPage';

interface NowPlayingViewProps {
  volume: number;
  setVolume: (v: number) => void;
  analyserRef: RefObject<AnalyserNode | null>;
  audioContextRef: RefObject<AudioContext | null>;
  visualizerRef: RefObject<VisualizerHandle | null>;
}

export function NowPlayingView({ volume, setVolume, analyserRef, audioContextRef, visualizerRef }: NowPlayingViewProps) {
  const currentTrack = usePlaybackStore((s) => s.currentTrack);
  const queueTracks = useQueueStore((s) => s.tracks);
  const upNext = queueTracks.find((t) => t.status === 'pending');

  return (
    <div className="wmp-now-playing">
      <Visualizer
        ref={visualizerRef}
        analyserRef={analyserRef}
        audioContextRef={audioContextRef}
      />
      <div className="wmp-now-playing__gradient-overlay" />

      {upNext && (
        <div className="wmp-now-playing__up-next">
          Up next: <strong>{upNext.title}</strong>
        </div>
      )}

      <div className="wmp-now-playing__track-info">
        {currentTrack ? (
          <>
            {currentTrack.thumbnail && (
              <img className="wmp-now-playing__art" src={currentTrack.thumbnail} alt={currentTrack.title} />
            )}
            <div className="wmp-now-playing__text">
              <div className="wmp-now-playing__title">{currentTrack.title}</div>
              <div className="wmp-now-playing__artist">{currentTrack.artist}</div>
              <div className="wmp-now-playing__requester">Requested by {currentTrack.requesterName}</div>
            </div>
          </>
        ) : (
          <div className="wmp-now-playing__text">
            <div className="wmp-now-playing__title">Nothing is playing</div>
          </div>
        )}
      </div>

      <div className="wmp-now-playing__transport">
        <TransportBar volume={volume} setVolume={setVolume} />
      </div>
    </div>
  );
}
