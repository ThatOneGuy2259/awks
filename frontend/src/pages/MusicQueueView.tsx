import { usePlaybackStore } from '../stores/playbackStore';
import { QueueList } from '../components/queue/QueueList';
import { OnlineListeners } from '../components/social/OnlineListeners';
import { LiveChat } from '../components/social/LiveChat';
import { wsSend } from '../hooks/useWebSocket';
import { ReactionBar } from '../components/social/ReactionBar';
import { ReactionOverlay } from '../components/social/ReactionOverlay';

export function MusicQueueView() {
  const track = usePlaybackStore((s) => s.currentTrack);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 max-w-7xl mx-auto px-6 py-8">
      {/* Left Column: Now Playing & Queue */}
      <div className="xl:col-span-8 space-y-12">
        {/* Now Playing (Editorial Style) */}
        {track && (
          <section className="relative group">
            <ReactionOverlay />
            <div className="flex flex-col md:flex-row items-end md:items-center gap-8">
              <div className="relative flex-shrink-0">
                <div className="w-48 h-48 md:w-64 md:h-64 rounded-xl overflow-hidden shadow-2xl shadow-primary/20 rotate-[-2deg] group-hover:rotate-0 transition-transform duration-500">
                  <img
                    className="w-full h-full object-cover scale-110 group-hover:scale-100 transition-transform duration-700"
                    src={track.thumbnail}
                    alt={track.title}
                  />
                </div>
                <div className="absolute -bottom-4 -right-4 p-4 rounded-full signature-gradient shadow-xl text-black flex items-center justify-center">
                  <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>
                    pause
                  </span>
                </div>
              </div>
              <div className="flex-1 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary/10 text-secondary border border-secondary/20 text-[10px] font-bold uppercase tracking-widest">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                  Now Playing
                </div>
                <div>
                  <h2 className="text-4xl md:text-6xl font-black font-headline tracking-tighter text-on-surface">
                    {track.title}
                  </h2>
                  <p className="text-xl md:text-2xl text-primary font-medium">{track.artist}</p>
                </div>
                <ReactionBar />
              </div>
            </div>
          </section>
        )}

        {/* Queue Section */}
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold font-headline">Up Next</h3>
          </div>
          <QueueList />
        </section>
      </div>

      {/* Right Column: Online Listeners & Chat */}
      <div className="xl:col-span-4">
        <div className="sticky top-24 space-y-8">
          <OnlineListeners />
          <LiveChat onSend={(text) => wsSend('CHAT_SEND', { text })} />
        </div>
      </div>
    </div>
  );
}
