import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors in a page so they don't unmount the app root. The
 * WebSocket and WebRTC hooks live above this, so audio keeps playing while
 * the page shows a fallback.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary] page crashed:', error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24 px-6 text-center">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant">error</span>
        <div>
          <h2 className="text-lg font-bold font-headline text-on-surface">This page hit an error</h2>
          <p className="text-sm text-on-surface-variant mt-1">The music is still playing.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => this.setState({ error: null })}
            className="px-4 py-2 rounded-full text-sm font-bold bg-primary text-on-primary-fixed hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-full text-sm font-bold text-on-surface-variant hover:bg-white/5 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
