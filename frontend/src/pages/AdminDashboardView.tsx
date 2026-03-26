import { useState, useEffect } from 'react';
import { useQueueStore } from '../stores/queueStore';
import { useListenerStore } from '../stores/listenerStore';
import { AdminQueueItem } from '../components/admin/AdminQueueItem';
import { SkipVotesRequiredControl, MaxTracksPerUserControl } from '../components/admin/SkipVotesRequiredControl';
import { UserTimeoutModal } from '../components/admin/UserTimeoutModal';
import { ActivityLog } from '../components/admin/ActivityLog';
import { api } from '../lib/api';

export function AdminDashboardView() {
  const tracks = useQueueStore((s) => s.tracks);
  const { count: listenerCount, listeners } = useListenerStore();
  const [skipVotesRequired, setSkipVotesRequired] = useState(5);
  const [skipMode, setSkipMode] = useState('fixed');
  const [skipPercent, setSkipPercent] = useState(50);
  const [maxTracksPerUser, setMaxTracksPerUser] = useState(3);
  const [timeoutTarget, setTimeoutTarget] = useState<{ id: string; username: string } | null>(null);

  const playing = tracks.find((t) => t.status === 'playing');
  const pending = tracks.filter((t) => t.status === 'pending');

  useEffect(() => {
    api.getSettings().then((settings) => {
      if (settings.skip_votes_required) setSkipVotesRequired(Number(settings.skip_votes_required));
      if (settings.skip_mode) setSkipMode(settings.skip_mode);
      if (settings.skip_percent) setSkipPercent(Number(settings.skip_percent));
      if (settings.max_tracks_per_user) setMaxTracksPerUser(Number(settings.max_tracks_per_user));
    }).catch(() => {});
  }, []);

  const updateSetting = (key: string, value: string) => {
    api.updateSettings({ [key]: value }).catch((err) => {
      console.error('settings update failed:', err);
    });
  };

  return (
    <div className="max-w-7xl mx-auto px-6 md:px-12 py-8">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-5xl font-extrabold font-headline tracking-tighter text-on-surface mb-2">
            Admin Command
          </h1>
          <p className="text-on-surface-variant font-medium">
            Active Sessions: <span className="text-secondary">{listenerCount}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="glass-card px-6 py-3 rounded-xl flex items-center gap-4">
            <div className="text-right">
              <p className="text-[10px] text-on-surface-variant uppercase tracking-widest">Tracks</p>
              <p className="text-lg font-bold text-secondary">{tracks.length}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-secondary">bolt</span>
            </div>
          </div>
        </div>
      </div>

      {/* Bento Grid Layout */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Live Queue Management */}
        <section className="md:col-span-8 space-y-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-2xl font-bold font-headline text-on-surface">Queue Management</h3>
            <span className="bg-surface-container-high text-primary px-3 py-1 rounded-full text-xs font-bold">
              {pending.length} TRACKS REMAINING
            </span>
          </div>
          <div className="space-y-4">
            {playing && <AdminQueueItem track={playing} isPlaying />}
            {pending.map((track) => (
              <AdminQueueItem key={track.id} track={track} />
            ))}
            {!playing && pending.length === 0 && (
              <div className="text-center py-12 text-on-surface-variant">
                <p>No tracks in queue.</p>
              </div>
            )}
          </div>
        </section>

        {/* Right Sidebar */}
        <aside className="md:col-span-4 space-y-6">
          {/* Skip Settings */}
          <div className="glass-card rounded-2xl p-6 border border-white/5">
            <h3 className="text-lg font-bold font-headline mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">tune</span> Settings
            </h3>
            <div className="space-y-6">
              <SkipVotesRequiredControl
                mode={skipMode}
                fixedValue={skipVotesRequired}
                percentValue={skipPercent}
                onModeChange={(m) => { setSkipMode(m); updateSetting('skip_mode', m); }}
                onFixedChange={(v) => { setSkipVotesRequired(v); updateSetting('skip_votes_required', String(v)); }}
                onPercentChange={(v) => { setSkipPercent(v); updateSetting('skip_percent', String(v)); }}
              />
              <MaxTracksPerUserControl
                value={maxTracksPerUser}
                onChange={(v) => { setMaxTracksPerUser(v); updateSetting('max_tracks_per_user', String(v)); }}
              />
            </div>
          </div>

          {/* Active Listeners */}
          <div className="bg-surface-container-low rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold font-headline">Active Listeners</h3>
              <span className="text-xs text-on-surface-variant">{listeners.length} online</span>
            </div>
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {listeners.map((listener) => (
                <div key={listener.id} className="flex items-center gap-3">
                  {listener.avatar_url ? (
                    <img className="w-10 h-10 rounded-full flex-shrink-0" src={listener.avatar_url} alt={listener.username} />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
                      {listener.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{listener.username}</p>
                  </div>
                  <button
                    onClick={() => setTimeoutTarget({ id: listener.id, username: listener.username })}
                    className="p-2 text-on-surface-variant hover:text-error transition-colors flex-shrink-0"
                    title="Timeout"
                  >
                    <span className="material-symbols-outlined text-sm">block</span>
                  </button>
                </div>
              ))}
              {listeners.length === 0 && (
                <p className="text-on-surface-variant text-sm">No listeners connected.</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Activity Logs */}
      <ActivityLog />

      {/* Timeout Modal */}
      {timeoutTarget && (
        <UserTimeoutModal
          userId={timeoutTarget.id}
          username={timeoutTarget.username}
          onClose={() => setTimeoutTarget(null)}
        />
      )}
    </div>
  );
}
