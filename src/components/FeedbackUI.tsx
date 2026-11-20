import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  RefreshCw,
  X,
} from 'lucide-react';
import { triggerHapticNotification } from '../lib/telegram.ts';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue>({
  showToast: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = 'info') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
    if (variant === 'success') triggerHapticNotification('success');
    if (variant === 'error') triggerHapticNotification('error');

    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 3600);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-20 right-4 left-4 sm:left-auto sm:bottom-6 sm:w-96 z-50 flex flex-col gap-2 pointer-events-none"
        >
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs font-medium shadow-lg backdrop-blur-md ${
                toast.variant === 'success'
                  ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-100'
                  : toast.variant === 'error'
                    ? 'border-red-500/40 bg-red-950/90 text-red-100'
                    : 'border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] text-[var(--afrinex-text)]'
              }`}
            >
              {toast.variant === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : toast.variant === 'error' ? (
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              ) : (
                <Info className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0 mt-0.5" />
              )}
              <span className="flex-1 leading-relaxed">{toast.message}</span>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(toast.id)}
                className="opacity-70 hover:opacity-100 shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  return useContext(ToastContext);
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="space-y-1.5">
          <h2 id="confirm-dialog-title" className="font-display text-base font-bold">
            {title}
          </h2>
          <p className="text-sm leading-relaxed text-[var(--afrinex-muted)]">{description}</p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] px-4 text-xs font-medium hover:border-[var(--afrinex-accent)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-50 ${
              destructive
                ? 'bg-red-600 text-white'
                : 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
            }`}
          >
            {busy ? 'Working...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-2xl border border-[var(--afrinex-border)] p-5 space-y-3 animate-pulse"
        >
          <div className="h-3 w-24 rounded bg-black/10 dark:bg-white/10" />
          <div className="h-5 w-3/4 rounded bg-black/10 dark:bg-white/10" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-black/10 dark:bg-white/10" />
            <div className="h-3 w-5/6 rounded bg-black/10 dark:bg-white/10" />
          </div>
          <div className="h-10 w-full rounded-xl bg-black/10 dark:bg-white/10 pt-2" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2 animate-pulse"
        >
          <div className="h-4 w-1/3 rounded bg-black/10 dark:bg-white/10" />
          <div className="h-3 w-2/3 rounded bg-black/10 dark:bg-white/10" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--afrinex-border)] p-6 sm:p-8 text-center space-y-3">
      <p className="font-display text-sm font-semibold">{title}</p>
      <p className="text-xs text-[var(--afrinex-muted)] max-w-md mx-auto leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-[40px] rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)]"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">
      <div className="flex items-center gap-2 min-w-0">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="leading-snug">{message}</span>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-[32px] inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 px-2.5 font-medium hover:bg-amber-500/20 shrink-0"
        >
          <RefreshCw className="h-3 w-3" />
          Retry
        </button>
      )}
    </div>
  );
}

export function PaginationBar({
  page,
  totalPages,
  total,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total?: number;
  onPageChange: (nextPage: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-2 border-t border-[var(--afrinex-border)] text-xs">
      <span className="text-[var(--afrinex-muted)] tabular-nums">
        Page {page} of {totalPages}
        {total !== undefined ? ` (${total} total)` : ''}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] px-3 font-medium hover:border-[var(--afrinex-accent)] disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Prev
        </button>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] px-3 font-medium hover:border-[var(--afrinex-accent)] disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
