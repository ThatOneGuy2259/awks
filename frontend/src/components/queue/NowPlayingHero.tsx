import { usePlaybackStore } from '../../stores/playbackStore';
import { useListenerStore } from '../../stores/listenerStore';
import { VoteSkipButton } from '../social/VoteSkipButton';

export function NowPlayingHero() {
  const track = usePlaybackStore((s) => s.currentTrack);
  const listenerCount = useListenerStore((s) => s.count);

  if (!track) {
    return (
      <section className="flex flex-col items-center justify-center gap-8 mb-16 py-20">
        <div className="w-72 h-72 lg:w-[480px] lg:h-[480px] rounded-xl bg-surface-container-low flex items-center justify-center">
          <span className="material-symbols-outlined text-on-surface-variant text-8xl">music_off</span>
        </div>
        <div className="text-center space-y-4">
          <h1 className="text-5xl lg:text-8xl font-black font-headline text-on-surface-variant leading-none tracking-tighter">
            Awkward Silence
          </h1>
          <p className="text-xl text-on-surface-variant">No tracks in queue. Add some music!</p>
        </div>
      </section>
    );
  }

  return (
    <section className="flex flex-col md:flex-row items-center md:items-end gap-12 mb-16 relative">
      {/* Asymmetric Background Glow */}
      <div className="absolute -top-20 -left-20 w-96 h-96 bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-40 -right-20 w-80 h-80 bg-secondary/10 blur-[100px] rounded-full pointer-events-none" />

      {/* Hero Album Art */}
      <div className="relative group shrink-0">
        <div className="w-72 h-72 lg:w-[480px] lg:h-[480px] rounded-xl overflow-hidden shadow-2xl shadow-black/60 relative">
          <img
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            src={track.thumbnail}
            alt={track.title}
          />
          <button className="absolute bottom-6 right-6 w-16 h-16 rounded-full bg-secondary-fixed text-on-secondary-fixed flex items-center justify-center shadow-xl shadow-secondary/40 backdrop-blur-md bg-opacity-80 active:scale-90 transition-all">
            <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              play_arrow
            </span>
          </button>
        </div>
      </div>

      {/* Typography & Meta */}
      <div className="flex-1 space-y-6 text-center md:text-left">
        <div className="space-y-2">
          <span className="text-secondary font-label text-sm uppercase tracking-[0.3em] font-bold">
            Now Playing
          </span>
          <h1 className="text-5xl lg:text-8xl font-black font-headline text-on-surface leading-none tracking-tighter">
            {track.title}
          </h1>
          <p className="text-xl lg:text-3xl font-medium text-on-surface-variant">
            {track.artist}
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
          <div className="bg-surface-container-high/60 backdrop-blur-md px-6 py-3 rounded-full flex items-center gap-3 border border-outline-variant/10">
            <span className="material-symbols-outlined text-primary">groups</span>
            <span className="font-label text-sm font-bold">{listenerCount} Listeners</span>
          </div>
        </div>

        <div className="pt-4">
          <VoteSkipButton />
        </div>
      </div>
    </section>
  );
}
