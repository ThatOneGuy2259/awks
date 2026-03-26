interface SkipControlProps {
  mode: string;
  fixedValue: number;
  percentValue: number;
  onModeChange: (mode: string) => void;
  onFixedChange: (v: number) => void;
  onPercentChange: (v: number) => void;
}

export function SkipVotesRequiredControl({ mode, fixedValue, percentValue, onModeChange, onFixedChange, onPercentChange }: SkipControlProps) {
  return (
    <div className="space-y-4">
      <label className="text-sm font-medium text-on-surface-variant">Skip Vote Mode</label>

      {/* Mode Toggle */}
      <div className="flex rounded-lg overflow-hidden border border-outline-variant/20">
        <button
          onClick={() => onModeChange('fixed')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
            mode === 'fixed'
              ? 'bg-secondary/20 text-secondary'
              : 'bg-surface-container-high text-on-surface-variant hover:bg-white/5'
          }`}
        >
          Fixed Count
        </button>
        <button
          onClick={() => onModeChange('percent')}
          className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
            mode === 'percent'
              ? 'bg-secondary/20 text-secondary'
              : 'bg-surface-container-high text-on-surface-variant hover:bg-white/5'
          }`}
        >
          % of Listeners
        </button>
      </div>

      {/* Fixed Mode Controls */}
      {mode === 'fixed' && (
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-xs text-on-surface-variant">Votes required</span>
            <span className="text-sm font-bold text-secondary">{fixedValue}</span>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => onFixedChange(Math.max(1, fixedValue - 1))}
              className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-primary/20 transition-all"
            >
              -
            </button>
            <span className="text-lg font-bold">{fixedValue}</span>
            <button
              onClick={() => onFixedChange(fixedValue + 1)}
              className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface hover:bg-primary/20 transition-all"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Percent Mode Controls */}
      {mode === 'percent' && (
        <div>
          <div className="flex justify-between mb-2">
            <span className="text-xs text-on-surface-variant">Threshold</span>
            <span className="text-sm font-bold text-secondary">{percentValue}%</span>
          </div>
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={percentValue}
            onChange={(e) => onPercentChange(Number(e.target.value))}
            className="w-full h-1 bg-surface-container-high rounded-full appearance-none accent-secondary cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-on-surface-variant mt-1">
            <span>10%</span>
            <span>50%</span>
            <span>100%</span>
          </div>
        </div>
      )}
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
