import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  variant?: 'danger' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

/**
 * Accessible confirmation dialog for destructive or publishing admin actions.
 */
export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel,
  variant = 'primary',
  busy = false,
  onConfirm,
  onCancel,
  children,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div className="w-full max-w-lg border border-slate-700 bg-[#0D0F14] p-6 space-y-4 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={`h-5 w-5 ${variant === 'danger' ? 'text-[#E11D2E]' : 'text-amber-400'}`}
              aria-hidden="true"
            />
            <h2
              id="confirm-modal-title"
              className="font-display text-xl font-bold text-white uppercase"
            >
              {title}
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            aria-label="Close modal"
            className="text-slate-400 hover:text-white cursor-pointer disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">{description}</p>
        {children}

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="px-4 py-2 border border-slate-700 hover:border-white text-xs font-mono uppercase text-slate-200 cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`px-5 py-2 text-xs font-display font-bold uppercase tracking-wider text-white cursor-pointer disabled:opacity-50 ${
              variant === 'danger'
                ? 'bg-red-700 hover:bg-red-600'
                : 'bg-[#E11D2E] hover:bg-[#FF2D3F]'
            }`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
