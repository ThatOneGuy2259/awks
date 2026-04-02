import { useEffect } from 'react';
import { useEmoteStore } from '../../stores/emoteStore';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Hook to parse emotes in messages
export function useEmoteParser() {
  const initialize = useEmoteStore((s) => s.initialize);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const parseMessage = (text: string): string => {
    const { parser, fallbackEmotes } = useEmoteStore.getState();

    // Try parser first if available
    if (parser) {
      try {
        const escaped = escapeHtml(text);
        return parser.parse(escaped);
      } catch (error) {
        console.warn('Library parser failed, using fallback:', error);
      }
    }

    // Fallback to manual parsing
    if (fallbackEmotes.size === 0) return escapeHtml(text);

    try {
      const words = text.split(' ');
      const parsedWords = words.map(word => {
        const emoteUrl = fallbackEmotes.get(word);
        if (emoteUrl) {
          const safe = escapeHtml(word);
          return `<img alt="${safe}" title="${safe}" class="inline-emote" src="${emoteUrl}" style="display: inline-block; vertical-align: middle; height: 1.6em; margin: 0 2px;" />`;
        }
        return escapeHtml(word);
      });

      return parsedWords.join(' ');
    } catch (error) {
      console.error('Failed to parse emotes:', error);
      return escapeHtml(text);
    }
  };

  return { parseMessage };
}
