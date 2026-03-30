import { useEffect, useRef } from 'react';
import { EmoteFetcher, EmoteParser } from '@mkody/twitch-emoticons';

// Hook to parse emotes in messages
export function useEmoteParser() {
  const parserRef = useRef<EmoteParser | null>(null);

  useEffect(() => {
    const initializeParser = async () => {
      try {
        const fetcher = new EmoteFetcher({
          forceStatic: false,
          twitchThemeMode: 'dark'
        });

        // Popular Twitch channel IDs for more emotes
        const popularChannelIds = [
          44317909,  // xQc
          129955881, // Kai Cenat
          51257523,  // Pokimane
          4664781,   // Myth
          138864227, // Adin Ross
          19614509,  // NICKMERCS
          18991531,  // TimTheTatman
          15188617,  // Lirik
          36029255,  // Summit1g
          22484632   // Shroud
        ];

        // Fetch global emotes from each platform
        await Promise.all([
          fetcher.fetchBTTVEmotes(undefined),
          fetcher.fetchFFZEmotes(undefined),
          fetcher.fetchSevenTVEmotes(undefined, { format: 'webp' })
        ]);

        // Fetch emotes from popular channels for more variety
        const channelPromises = popularChannelIds.map(channelId =>
          Promise.all([
            fetcher.fetchBTTVEmotes(channelId).catch(() => {}),
            fetcher.fetchFFZEmotes(channelId).catch(() => {}),
            fetcher.fetchSevenTVEmotes(channelId, { format: 'webp' }).catch(() => {})
          ])
        );
        
        await Promise.all(channelPromises);

        parserRef.current = new EmoteParser(fetcher, {
          type: 'html',
          template: `<img alt="{name}" title="{name}" class="inline-emote" src="{link}" style="display: inline-block; vertical-align: middle; height: 1.6em; margin: 0 2px;" />`
        });
      } catch (error) {
        console.error('Failed to initialize emote parser:', error);
      }
    };

    initializeParser();
  }, []);

  const parseMessage = (text: string): string => {
    if (!parserRef.current) return text;
    try {
      return parserRef.current.parse(text);
    } catch (error) {
      console.error('Failed to parse emotes:', error);
      return text;
    }
  };

  return { parseMessage };
}
