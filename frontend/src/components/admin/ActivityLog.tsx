const mockLogs = [
  { time: '14:22:10', color: 'primary', text: '<strong>@admin</strong> moved "Midnight City" to the top of the queue.' },
  { time: '14:18:45', color: 'error-dim', text: '<strong>System</strong> automatically removed track "Nyan Cat" (Restricted).' },
  { time: '14:05:12', color: 'secondary', text: '<strong>@user1</strong> was timed out for 10 minutes (Spam).' },
  { time: '13:58:22', color: 'on-surface-variant/20', text: 'Vote skip initiated for current track (32% reached).' },
];

export function ActivityLog() {
  return (
    <section className="mt-12 md:mt-24">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-3xl font-black font-headline tracking-tight">System Activity</h3>
        <button className="text-sm font-bold text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-2">
          Export Logs <span className="material-symbols-outlined text-sm">download</span>
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {[0, 1].map((col) => (
          <div key={col} className="space-y-4">
            {mockLogs
              .filter((_, i) => i % 2 === col)
              .map((log, i) => (
                <div
                  key={i}
                  className={`flex gap-4 p-4 rounded-xl border-l-4 bg-surface-container-low/50`}
                  style={{ borderLeftColor: `var(--color-${log.color.split('/')[0]})` }}
                >
                  <span className="text-on-surface-variant text-xs font-mono shrink-0">{log.time}</span>
                  <p className="text-sm" dangerouslySetInnerHTML={{ __html: log.text }} />
                </div>
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
