import { useState } from 'react';
import { api } from '../../lib/api';

interface UserTimeoutModalProps {
  userId: string;
  username: string;
  onClose: () => void;
}

export function UserTimeoutModal({ userId, username, onClose }: UserTimeoutModalProps) {
  const [minutes, setMinutes] = useState(10);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleTimeout = async () => {
    setLoading(true);
    try {
      await api.timeoutUser(userId, minutes, reason || undefined);
      onClose();
    } catch (err) {
      console.error('timeout error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass-card rounded-2xl p-8 w-full max-w-md border border-outline-variant/10" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-xl font-bold font-headline mb-6">Timeout @{username}</h3>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-on-surface-variant font-medium block mb-2">Duration (minutes)</label>
            <input
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              className="w-full bg-surface-container-low border-none rounded-full py-3 px-4 text-on-surface outline-none focus:ring-1 focus:ring-secondary/50"
            />
          </div>
          <div>
            <label className="text-sm text-on-surface-variant font-medium block mb-2">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Spamming requests"
              className="w-full bg-surface-container-low border-none rounded-full py-3 px-4 text-on-surface outline-none focus:ring-1 focus:ring-secondary/50 placeholder:text-on-surface-variant"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-8">
          <button onClick={onClose} className="flex-1 py-3 rounded-full border border-outline-variant/20 text-on-surface font-bold text-sm hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleTimeout}
            disabled={loading}
            className="flex-1 py-3 rounded-full bg-error text-on-error font-bold text-sm active:scale-95 transition-transform disabled:opacity-50"
          >
            {loading ? 'Applying...' : 'Timeout User'}
          </button>
        </div>
      </div>
    </div>
  );
}
