import { useConnectionStore } from '../stores/connectionStore';
import { useUIStore } from '../stores/uiStore';

export function ConnectionBanner() {
  const status = useConnectionStore((s) => s.status);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);

  if (status === 'connected') return null;

  return (
    <div className={`fixed top-16 left-0 right-0 z-[90] flex items-center justify-center gap-2 py-2 text-xs font-bold transition-[left] duration-300 ease-in-out ${sidebarCollapsed ? 'lg:left-0' : 'lg:left-64'} ${
      status === 'connecting'
        ? 'bg-amber-500/10 text-amber-400 border-b border-amber-500/20'
        : 'bg-red-500/10 text-red-400 border-b border-red-500/20'
    }`}>
      {status === 'connecting' ? (
        <>
          <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
          <span>Reconnecting...</span>
        </>
      ) : (
        <>
          <span className="material-symbols-outlined text-sm">cloud_off</span>
          <span>Disconnected</span>
        </>
      )}
    </div>
  );
}
