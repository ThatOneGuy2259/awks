import { useConnectionStore } from '../stores/connectionStore';

const CONFIG = {
  connected: { color: 'bg-green-500', label: 'Connected', pulse: false },
  connecting: { color: 'bg-amber-400', label: 'Connecting…', pulse: true },
  disconnected: { color: 'bg-red-500', label: 'Disconnected', pulse: false },
} as const;

export function ConnectionIndicator() {
  const status = useConnectionStore((s) => s.status);
  const { color, label, pulse } = CONFIG[status];

  return (
    <span
      className="group relative flex h-2.5 w-2.5 items-center justify-center"
      role="status"
      aria-label={`Connection status: ${label}`}
    >
      {pulse && (
        <span className={`absolute inline-flex h-full w-full rounded-full ${color} opacity-75 animate-ping`} />
      )}
      <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${color}`} />

      {/* Instant custom tooltip (the native title attribute has an uncontrollable delay) */}
      <span
        className="pointer-events-none absolute top-full left-1/2 z-[60] mt-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-outline-variant/20 bg-surface-container-high px-2 py-1 text-xs font-medium text-on-surface opacity-0 shadow-lg group-hover:opacity-100"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
