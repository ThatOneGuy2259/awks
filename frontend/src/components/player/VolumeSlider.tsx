interface VolumeSliderProps {
  volume: number;
  onChange: (v: number) => void;
}

export function VolumeSlider({ volume, onChange }: VolumeSliderProps) {
  const icon = volume === 0 ? 'volume_off' : volume < 50 ? 'volume_down' : 'volume_up';

  return (
    <div className="flex items-center gap-2 w-28">
      <button
        className="text-on-surface-variant hover:text-on-surface transition-colors"
        onClick={() => onChange(volume === 0 ? 70 : 0)}
      >
        <span className="material-symbols-outlined text-lg">{icon}</span>
      </button>
      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label="Volume"
        className="w-full h-1 bg-surface-container-high rounded-full appearance-none accent-on-surface-variant cursor-pointer"
      />
    </div>
  );
}
