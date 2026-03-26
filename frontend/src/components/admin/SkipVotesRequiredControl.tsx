interface SkipControlProps {
  value: number;
  onChange: (v: number) => void;
}

export function SkipVotesRequiredControl({ value, onChange }: SkipControlProps) {
  return (
    <div>
      <div className="flex justify-between mb-2">
        <label className="text-sm font-medium text-on-surface-variant">Votes Required to Skip</label>
        <span className="text-sm font-bold text-secondary">{value}</span>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange(Math.max(1, value - 1))}
          className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-primary/20 transition-all"
        >
          -
        </button>
        <span className="text-lg font-bold">{value}</span>
        <button
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-primary/20 transition-all"
        >
          +
        </button>
      </div>
    </div>
  );
}

interface MaxTracksControlProps {
  value: number;
  onChange: (v: number) => void;
}

export function MaxTracksPerUserControl({ value, onChange }: MaxTracksControlProps) {
  return (
    <div>
      <div className="flex justify-between mb-2">
        <label className="text-sm font-medium text-on-surface-variant">Max Tracks per User</label>
        <span className="text-sm font-bold text-secondary">{value}</span>
      </div>
      <div className="flex items-center gap-4">
        <button
          onClick={() => onChange(Math.max(1, value - 1))}
          className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-primary/20 transition-all"
        >
          -
        </button>
        <span className="text-lg font-bold">{value}</span>
        <button
          onClick={() => onChange(value + 1)}
          className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-primary/20 transition-all"
        >
          +
        </button>
      </div>
    </div>
  );
}
