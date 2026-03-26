import { NowPlayingHero } from '../components/queue/NowPlayingHero';
import { AudioVisualizer } from '../components/player/AudioVisualizer';
import { ProgressBar } from '../components/player/ProgressBar';
import { useQueueStore } from '../stores/queueStore';
import { usePlaybackStore } from '../stores/playbackStore';

export function MainListenerView() {
  const tracks = useQueueStore((s) => s.tracks);
  const currentTrack = usePlaybackStore((s) => s.currentTrack);
  const pending = tracks.filter((t) => t.status === 'pending');

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Editorial Player Section */}
      <NowPlayingHero />

      {/* Visualizer & Progress */}
      {currentTrack && (
        <section className="mb-16">
          <AudioVisualizer />
          <ProgressBar />
        </section>
      )}

      {/* Next Up Bento Grid */}
      {pending.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl font-black font-headline">The Queue</h3>
            <button className="text-primary font-bold text-sm hover:underline">View All Tracks</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Next Up Focus Card */}
            {pending[0] && (
              <div className="col-span-1 md:col-span-2 bg-surface-container-low p-6 rounded-lg group hover:bg-surface-container-high transition-all border border-outline-variant/5">
                <div className="flex gap-6">
                  <div className="w-32 h-32 rounded-[1rem] overflow-hidden shrink-0 shadow-lg shadow-black/40">
                    <img
                      className="w-full h-full object-cover"
                      src={pending[0].thumbnail_url || `https://img.youtube.com/vi/${pending[0].video_id}/hqdefault.jpg`}
                      alt={pending[0].title}
                    />
                  </div>
                  <div className="flex flex-col justify-center gap-2">
                    <span className="text-primary text-[10px] font-bold uppercase tracking-widest">Next Track</span>
                    <h4 className="text-2xl font-black font-headline group-hover:text-secondary transition-colors">
                      {pending[0].title}
                    </h4>
                    <p className="text-on-surface-variant font-medium">{pending[0].artist}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Secondary Tracks */}
            {pending.slice(1, 3).map((track) => (
              <div
                key={track.id}
                className="bg-surface-container-low p-6 rounded-lg group hover:bg-surface-container-high transition-all border border-outline-variant/5"
              >
                <div className="flex items-center gap-4 mb-4">
                  <div className="w-16 h-16 rounded-[1rem] overflow-hidden shrink-0">
                    <img
                      className="w-full h-full object-cover"
                      src={track.thumbnail_url || `https://img.youtube.com/vi/${track.video_id}/default.jpg`}
                      alt={track.title}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="font-bold text-on-surface truncate">{track.title}</h4>
                    <p className="text-xs text-on-surface-variant truncate">{track.artist}</p>
                  </div>
                  <span className="text-xs font-bold text-on-surface-variant">
                    {Math.floor(track.duration_sec / 60)}:{String(track.duration_sec % 60).padStart(2, '0')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
