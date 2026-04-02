import { create } from 'zustand';
import { EmoteFetcher, EmoteParser } from '@mkody/twitch-emoticons';

export interface Emote {
  id: string;
  code: string;
  link: string;
  animated: boolean;
  provider: 'twitch' | 'bttv' | 'ffz' | '7tv';
}

interface EmoteState {
  emotes: Emote[];
  parser: EmoteParser | null;
  fetcher: EmoteFetcher | null;
  loading: boolean;
  initialized: boolean;
  fallbackEmotes: Map<string, string>;
  initialize: () => Promise<void>;
}

const POPULAR_CHANNEL_IDS = [
  44317909,  // xQc
  129955881, // Kai Cenat
  51257523,  // Pokimane
  4664781,   // Myth
  138864227, // Adin Ross
  19614509,  // NICKMERCS
  18991531,  // TimTheTatman
  15188617,  // Lirik
  36029255,  // Summit1g
  22484632,  // Shroud
];

const BTTV_FFZ_CHANNEL_IDS = [
  44317909,  // xQc
  51257523,  // Pokimane
  36029255,  // Summit1g
  22484632,  // Shroud
];

const FALLBACK_EMOTES: [string, string][] = [
  ['Pepega', 'https://cdn.betterttv.net/emote/5849c9a4f52fbdd5ac2e4c2c/3x'],
  ['Pog', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef2d/3x'],
  ['KEKW', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef36/3x'],
  ['Sadge', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef31/3x'],
  ['MonkaS', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef32/3x'],
  ['LULW', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef37/3x'],
  ['OMEGALUL', 'https://cdn.betterttv.net/emote/5e9ca7756833236c47beef38/3x'],
  ['PepeLaugh', 'https://cdn.betterttv.net/emote/566ca92365dbbdab32ec053a/3x'],
  ['PepeHands', 'https://cdn.betterttv.net/emote/5e76233d1344a4562ec642de/3x'],
  ['Kappa', 'https://static-cdn.jtvnw.net/emoticons/v1/25/3.0'],
];

export const useEmoteStore = create<EmoteState>((set, get) => ({
  emotes: [],
  parser: null,
  fetcher: null,
  loading: false,
  initialized: false,
  fallbackEmotes: new Map(),

  initialize: async () => {
    const state = get();
    if (state.initialized || state.loading) return;
    set({ loading: true });

    try {
      const fetcher = new EmoteFetcher({
        forceStatic: false,
        twitchThemeMode: 'dark',
      });

      // Fetch global emotes
      await Promise.all([
        fetcher.fetchBTTVEmotes(undefined).catch(() => {}),
        fetcher.fetchFFZEmotes(undefined).catch(() => {}),
        fetcher.fetchSevenTVEmotes(undefined, { format: 'webp' }).catch(() => {}),
      ]);

      // Fetch per-channel emotes
      await Promise.all([
        ...POPULAR_CHANNEL_IDS.map((id) =>
          fetcher.fetchSevenTVEmotes(id, { format: 'webp' }).catch(() => {})
        ),
        ...BTTV_FFZ_CHANNEL_IDS.map((id) =>
          Promise.all([
            fetcher.fetchBTTVEmotes(id).catch(() => {}),
            fetcher.fetchFFZEmotes(id).catch(() => {}),
          ])
        ),
      ]);

      const allEmotes: Emote[] = [];
      const seen = new Set<string>();
      fetcher.emotes.forEach((emote) => {
        const key = `${emote.type}-${emote.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          allEmotes.push({
            id: emote.id,
            code: emote.code,
            link: emote.toLink(),
            animated: (emote as unknown as { animated?: boolean }).animated || false,
            provider: emote.type as Emote['provider'],
          });
        }
      });

      const parser = new EmoteParser(fetcher, {
        type: 'html',
        template: `<img alt="{name}" title="{name}" class="inline-emote" src="{link}" style="display: inline-block; vertical-align: middle; height: 1.6em; margin: 0 2px;" />`,
      });

      set({ emotes: allEmotes, parser, fetcher, loading: false, initialized: true });
    } catch (error) {
      console.error('Failed to initialize emotes:', error);
      const fallbackMap = new Map(FALLBACK_EMOTES);
      const fallbackEmoteList: Emote[] = FALLBACK_EMOTES.map(([code, link]) => ({
        id: code.toLowerCase(),
        code,
        link,
        animated: false,
        provider: 'bttv' as const,
      }));
      set({
        emotes: fallbackEmoteList,
        fallbackEmotes: fallbackMap,
        loading: false,
        initialized: true,
      });
    }
  },
}));
