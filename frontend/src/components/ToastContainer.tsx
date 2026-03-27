import { useToastStore } from '../stores/toastStore';

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-20 right-6 z-[200] space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl shadow-black/30 backdrop-blur-xl border text-sm font-medium animate-slide-in ${
            t.type === 'error'
              ? 'bg-red-500/10 text-red-400 border-red-500/20'
              : 'bg-green-500/10 text-green-400 border-green-500/20'
          }`}
        >
          <span className="material-symbols-outlined text-base">
            {t.type === 'error' ? 'error' : 'check_circle'}
          </span>
          <span className="flex-1">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="opacity-50 hover:opacity-100">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}
