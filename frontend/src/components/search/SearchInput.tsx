interface SearchInputProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
}

export function SearchInput({ value, onChange, onSubmit }: SearchInputProps) {
  return (
    <div className="relative group">
      <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
        <span className="material-symbols-outlined text-primary text-3xl">search</span>
      </div>
      <input
        autoFocus
        className="w-full bg-surface-container-low border-none rounded-full py-8 pl-20 pr-8 text-2xl font-headline font-bold text-on-surface placeholder:text-on-surface-variant focus:ring-2 focus:ring-secondary/50 transition-all shadow-2xl shadow-purple-900/10 outline-none"
        placeholder="Search tracks, artists, or paste a YouTube URL..."
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
      />
    </div>
  );
}
