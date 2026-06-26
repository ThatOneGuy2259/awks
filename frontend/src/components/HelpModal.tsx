import { useEscapeClose } from '../hooks/useEscapeClose';

interface HelpModalProps {
  onClose: () => void;
}

const sections = [
  {
    icon: 'search',
    title: 'Search & Request',
    items: [
      'Search for tracks by name, artist, or paste a YouTube URL',
      'Suggestions appear as you type — click one to search instantly',
      'Tracks over 10 minutes are filtered out automatically',
      'Click "Request" to add a track to the queue',
    ],
  },
  {
    icon: 'palette',
    title: 'Custom Themes',
    items: [
      'Open Settings (gear icon) to choose from built-in themes',
      'Create your own theme with 3 colors: background, primary, and secondary',
      'Live preview shows how your theme looks before saving',
      'Export themes as a shareable string, import themes from others',
    ],
  },
  {
    icon: 'equalizer',
    title: 'Visualizer EQ',
    items: [
      'Click the equalizer icon in the player bar to open the EQ panel',
      '8-band equalizer lets you boost or reduce specific frequency ranges',
      'Toggle mirrored mode or flip the frequency layout (bass center vs outer)',
      'Export and import EQ presets to share with others',
    ],
  },
  {
    icon: 'skip_next',
    title: 'Playback & Voting',
    items: [
      'Vote to skip the current track — requires enough votes from listeners',
      'Queue shows upcoming tracks with position and who requested them',
      'Volume control adjusts your local listening volume',
    ],
  },
  {
    icon: 'keyboard',
    title: 'Tips',
    items: [
      'Press Enter to search, arrow keys to navigate suggestions, Escape to dismiss',
      'Trending tags update based on what\'s been played recently',
      'Your theme, EQ settings, and volume persist across sessions',
    ],
  },
];

export function HelpModal({ onClose }: HelpModalProps) {
  useEscapeClose(onClose);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface-container-high rounded-2xl p-6 w-full max-w-lg mx-4 border border-outline-variant/10 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold font-headline">How to Use AWKS</h2>
          <button onClick={onClose} className="p-1 text-on-surface-variant hover:text-on-surface transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-primary text-lg">{section.icon}</span>
                <h3 className="text-sm font-bold text-on-surface uppercase tracking-widest">{section.title}</h3>
              </div>
              <ul className="space-y-1.5 pl-8">
                {section.items.map((item) => (
                  <li key={item} className="text-sm text-on-surface-variant leading-relaxed list-disc">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
