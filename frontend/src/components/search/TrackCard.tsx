import type { SearchResult } from '../../lib/api';
import { api } from '../../lib/api';
import { useState } from 'react';

interface TrackCardProps {
  track: SearchResult;
  featured?: boolean;
}

export function TrackCard({ track, featured }: TrackCardProps) {
  const [requesting, setRequesting] = useState(false);
  const [requested, setRequested] = useState(false);

  const handleRequest = async () => {
    setRequesting(true);
    try {
      await api.addToQueue(`https://www.youtube.com/watch?v=${track.video_id}`);
      setRequested(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to request');
    } finally {
      setRequesting(false);
    }
  };

  if (featured) {
    return (
      <div className="lg:col-span-2 group relative overflow-hidden rounded-xl bg-surface-container-high p-8 flex gap-8 items-center border border-outline-variant/10 hover:border-primary/30 transition-all">
        <div className="relative w-40 h-40 flex-shrink-0">
          <img
            className="w-full h-full object-cover rounded-xl shadow-2xl shadow-primary-dim/20"
            src={track.thumbnail_url}
            alt={track.title}
          />
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 rounded-xl">
            <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>
              play_arrow
            </span>
          </div>
        </div>
        <div className="flex-grow">
          <span className="bg-secondary/10 text-secondary text-[10px] font-bold px-2 py-1 rounded uppercase tracking-tighter mb-2 inline-block">
            Best Match
          </span>
          <h3 className="text-3xl font-headline font-bold text-on-surface leading-tight">{track.title}</h3>
          <p className="text-on-surface-variant font-medium mt-1">{track.artist}</p>
          <div className="mt-6 flex gap-4">
            <button
              onClick={handleRequest}
              disabled={requesting || requested}
              className="signature-gradient text-on-primary-fixed font-bold px-8 py-3 rounded-full flex items-center gap-2 active:scale-95 transition-transform disabled:opacity-50"
            >
              <span className="material-symbols-outlined">{requested ? 'check' : 'add'}</span>
              {requested ? 'Requested' : requesting ? 'Requesting...' : 'Request'}
            </button>
            <button className="p-3 rounded-full border border-outline-variant/30 text-on-surface hover:bg-white/5">
              <span className="material-symbols-outlined">favorite</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface-container p-6 rounded-xl border border-outline-variant/10 group">
      <img
        className="w-full aspect-square object-cover rounded-lg mb-4 grayscale group-hover:grayscale-0 transition-all duration-500"
        src={track.thumbnail_url}
        alt={track.title}
      />
      <div className="flex justify-between items-start">
        <div className="min-w-0 flex-1">
          <h4 className="font-bold text-on-surface truncate">{track.title}</h4>
          <p className="text-sm text-on-surface-variant truncate">{track.artist}</p>
        </div>
        <button
          onClick={handleRequest}
          disabled={requesting || requested}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-highest text-secondary hover:bg-secondary hover:text-on-secondary-fixed transition-all disabled:opacity-50 flex-shrink-0 ml-2"
        >
          <span className="material-symbols-outlined">{requested ? 'check' : 'playlist_add'}</span>
        </button>
      </div>
    </div>
  );
}
