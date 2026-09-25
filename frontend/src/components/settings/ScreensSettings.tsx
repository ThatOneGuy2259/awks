import { useCallback, useEffect, useState } from 'react';
import { api, type ListenDevice } from '../../lib/api';
import { useUserStore } from '../../stores/userStore';
import { toast } from '../../stores/toastStore';
import { ConfirmModal } from '../ConfirmModal';

// The server stores UTC as 'YYYY-MM-DD HH:MM:SS'.
function parseUtc(s: string): Date {
  return new Date(s.replace(' ', 'T') + 'Z');
}

function lastSeen(d: ListenDevice): string {
  if (d.connected) return 'Connected now';
  if (!d.last_seen_at) return 'Never connected';
  return `Last seen ${parseUtc(d.last_seen_at).toLocaleString()}`;
}

/**
 * Pair TVs and other screens with /listen, and remove them. A code works once
 * and expires in 10 minutes; the paired screen keeps its own key.
 */
export function ScreensSettings() {
  const isAdmin = useUserStore((s) => s.role === 'admin');
  const [devices, setDevices] = useState<ListenDevice[] | null>(null);
  const [code, setCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [removeTarget, setRemoveTarget] = useState<ListenDevice | null>(null);

  const loadDevices = useCallback(() => {
    api.getListenDevices().then(setDevices).catch(() => setDevices([]));
  }, []);

  useEffect(loadDevices, [loadDevices]);

  // While a code is showing: tick the countdown, and poll so the new screen
  // shows up (and the code hides) as soon as it pairs.
  useEffect(() => {
    if (!code) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(loadDevices, 3000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [code, loadDevices]);

  const [countAtCode, setCountAtCode] = useState(0);
  useEffect(() => {
    if (code && devices && devices.length > countAtCode) {
      setCode(null);
      toast('Screen paired', 'success');
    }
  }, [code, devices, countAtCode]);

  const handleCreate = async () => {
    try {
      const res = await api.createListenCode();
      setCountAtCode(devices?.length ?? 0);
      setCode({ code: res.code, expiresAt: new Date(res.expires_at).getTime() });
      setNow(Date.now());
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : "Couldn't make a code.");
    }
  };

  const handleRemove = async (d: ListenDevice) => {
    try {
      await api.removeListenDevice(d.id);
      loadDevices();
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : "Couldn't remove that screen.");
    }
  };

  const remaining = code ? Math.max(0, Math.floor((code.expiresAt - now) / 1000)) : 0;
  const expired = code !== null && remaining === 0;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-xl bg-surface-container-lowest p-5 space-y-4">
        <p className="text-sm text-on-surface-variant">
          Put AWKS on a TV or shared screen without signing in there. Open{' '}
          <span className="text-on-surface font-medium">{window.location.host}/listen</span> on the screen and enter a code
          from here. The screen can listen and see the queue, but can't request songs, vote or chat.
        </p>

        {code && !expired ? (
          <div className="rounded-xl bg-surface-container-high p-5 text-center space-y-2">
            <p className="text-4xl font-black tracking-[0.3em] text-on-surface select-all">{code.code}</p>
            <p className="text-xs text-on-surface-variant">
              Works once. Expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </p>
          </div>
        ) : (
          <button
            onClick={handleCreate}
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-primary text-on-primary-fixed hover:opacity-90 transition-opacity"
          >
            <span className="material-symbols-outlined text-base">add</span>
            {expired ? 'Code expired. Make a new one' : 'Pair a screen'}
          </button>
        )}
      </div>

      <div className="rounded-xl bg-surface-container-lowest p-5">
        <h3 className="text-sm font-bold text-on-surface mb-3">{isAdmin ? 'All paired screens' : 'Your paired screens'}</h3>
        {devices === null ? (
          <p className="text-sm text-on-surface-variant">Loading…</p>
        ) : devices.length === 0 ? (
          <p className="text-sm text-on-surface-variant">No screens paired yet.</p>
        ) : (
          <ul className="space-y-2">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-lg bg-surface-container p-3">
                <span className="material-symbols-outlined text-on-surface-variant">tv</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface truncate">
                    {d.name}
                    {isAdmin && d.created_by_name && (
                      <span className="text-on-surface-variant font-normal"> · paired by {d.created_by_name}</span>
                    )}
                  </p>
                  <p className={`text-xs ${d.connected ? 'text-secondary' : 'text-on-surface-variant'}`}>{lastSeen(d)}</p>
                </div>
                <button
                  onClick={() => setRemoveTarget(d)}
                  className="px-3 py-1.5 rounded-full text-xs font-bold text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {removeTarget && (
        <ConfirmModal
          title="Remove this screen?"
          message={`${removeTarget.name} stops playing now and needs a new code to listen again.`}
          confirmLabel="Remove"
          danger
          onConfirm={() => handleRemove(removeTarget)}
          onClose={() => setRemoveTarget(null)}
        />
      )}
    </div>
  );
}
