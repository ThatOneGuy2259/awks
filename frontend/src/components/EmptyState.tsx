import type { ReactNode } from 'react';

interface EmptyStateProps {
  /** Material Symbols icon name. */
  icon: string;
  title: string;
  subtitle?: string;
  /** Optional call-to-action rendered below the text. */
  action?: ReactNode;
  /** Vertical padding scale. */
  size?: 'sm' | 'md' | 'lg';
}

const PADDING = { sm: 'py-12', md: 'py-16', lg: 'py-24' } as const;
const ICON = { sm: 'text-4xl', md: 'text-5xl', lg: 'text-6xl' } as const;

/** Consistent empty / zero-data placeholder used across pages. */
export function EmptyState({ icon, title, subtitle, action, size = 'md' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${PADDING[size]} px-6`}>
      <span className={`material-symbols-outlined ${ICON[size]} text-on-surface-variant/40 mb-4`}>
        {icon}
      </span>
      <p className="text-lg font-bold text-on-surface">{title}</p>
      {subtitle && <p className="text-sm text-on-surface-variant mt-1 max-w-sm">{subtitle}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
