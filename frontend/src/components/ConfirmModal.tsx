import { useEscapeClose } from '../hooks/useEscapeClose';

interface ConfirmModalProps {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as a destructive action. */
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Themed replacement for window.confirm(). */
export function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  onConfirm,
  onClose,
}: ConfirmModalProps) {
  useEscapeClose(onClose);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative bg-surface-container-high rounded-2xl p-6 w-full max-w-sm mx-4 border border-outline-variant/10 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="text-lg font-bold font-headline text-on-surface">{title}</h2>
        {message && <p className="text-sm text-on-surface-variant mt-2 leading-relaxed">{message}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full text-sm font-bold text-on-surface-variant hover:bg-white/5 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-colors ${
              danger
                ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                : 'bg-primary text-on-primary-fixed hover:opacity-90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
