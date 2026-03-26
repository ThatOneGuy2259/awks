interface AudioStreamProps {
  listening: boolean;
}

export function AudioStream({ listening }: AudioStreamProps) {
  if (listening) return null;

  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-2 px-6 py-3 rounded-full bg-surface-container-high text-on-surface-variant text-sm border border-outline-variant/20">
        <span className="material-symbols-outlined text-base animate-pulse">hearing</span>
        Click anywhere to start listening
      </div>
    </div>
  );
}
