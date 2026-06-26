import EmojiPicker, { Theme, type EmojiClickData, Categories } from 'emoji-picker-react';

// Isolated wrapper so the (heavy) emoji-picker-react library lives in its own
// lazy chunk and only loads when the user actually opens the emoji picker.
interface EmojiPickerPanelProps {
  onSelect: (emoji: string) => void;
}

export default function EmojiPickerPanel({ onSelect }: EmojiPickerPanelProps) {
  return (
    <EmojiPicker
      theme={Theme.DARK}
      onEmojiClick={(emojiData: EmojiClickData) => onSelect(emojiData.emoji)}
      height={350}
      width={320}
      searchDisabled={false}
      previewConfig={{ showPreview: true, defaultEmoji: '1f60a', defaultCaption: 'Smile' }}
      categories={[
        { name: 'Smiles & Emotions', category: Categories.SMILEYS_PEOPLE },
        { name: 'People & Body', category: Categories.SMILEYS_PEOPLE },
        { name: 'Animals & Nature', category: Categories.ANIMALS_NATURE },
        { name: 'Food & Drink', category: Categories.FOOD_DRINK },
        { name: 'Activities', category: Categories.ACTIVITIES },
        { name: 'Travel & Places', category: Categories.TRAVEL_PLACES },
        { name: 'Objects', category: Categories.OBJECTS },
        { name: 'Symbols', category: Categories.SYMBOLS },
        { name: 'Flags', category: Categories.FLAGS },
      ]}
      style={{
        '--epr-emoji-size': '20px',
        '--epr-emoji-padding': '4px',
        '--epr-category-navigation-button-size': '18px',
        '--epr-category-font-size': '12px',
        '--epr-search-input-font-size': '14px',
        '--epr-search-input-padding': '8px',
        '--epr-search-input-height': '32px',
        '--epr-picker-height': '350px',
        '--epr-picker-width': '320px',
      } as React.CSSProperties}
    />
  );
}
