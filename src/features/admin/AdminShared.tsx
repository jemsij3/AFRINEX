import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import type { AdminPermission, BuilderType, EffectiveUserRole } from '../../../shared/types.ts';

export const PERMISSION_METADATA: Array<{
  id: AdminPermission;
  label: string;
  description: string;
}> = [
  {
    id: 'users.manage',
    label: 'Users Management',
    description: 'Search, inspect, suspend/reactivate, and manage membership tiers',
  },
  {
    id: 'learning.manage',
    label: 'Learning Center',
    description: 'Create, edit, publish, reorder, and delete courses & lessons',
  },
  {
    id: 'tools.manage',
    label: 'AI Tools Directory',
    description: 'Add, categorize, feature, publish, and remove AI tools',
  },
  {
    id: 'opportunities.manage',
    label: 'Opportunities',
    description: 'Publish, feature, archive, and manage global/African opportunities',
  },
  {
    id: 'ai.manage',
    label: 'AI Assistant Controls',
    description: 'Configure Workers AI availability, free daily quota, and system prompt',
  },
  {
    id: 'builders.manage',
    label: 'AI Builders',
    description: 'Inspect generated builder projects and configure enabled builder types',
  },
  {
    id: 'billing.manage',
    label: 'Subscriptions & Payments',
    description: 'View Telegram Stars revenue, subscriptions, and reconcile payments',
  },
  {
    id: 'announcements.manage',
    label: 'Announcements',
    description: 'Publish platform announcements and send Telegram Bot broadcasts',
  },
  {
    id: 'settings.manage',
    label: 'App Configuration',
    description: 'Branding, maintenance mode, feature toggles, and Pro Stars pricing',
  },
  {
    id: 'audit.view',
    label: 'Audit Logs',
    description: 'View immutable administrative activity logs across the platform',
  },
];

export const BUILDER_TYPE_LABELS: Record<BuilderType, string> = {
  telegram_bot: 'Telegram Bot',
  ai_agent: 'AI Agent',
  website: 'Website',
  mini_app: 'Mini App',
  workflow: 'Automation Workflow',
};

export function formatShortDate(value: string | null | undefined): string {
  if (!value) return '—';
  return value.slice(0, 10);
}

export function formatShortDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16);
  return parsed.toISOString().replace('T', ' ').slice(0, 16);
}

export function formatRoleLabel(role: EffectiveUserRole | string | undefined): string {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return 'Member';
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  destructive = false,
  busy = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="admin-confirm-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-6 shadow-xl space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h3 id="admin-confirm-title" className="font-display text-base font-semibold">
              {title}
            </h3>
            <p className="text-sm text-[var(--afrinex-muted)]">{description}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {children}

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] px-4 text-xs font-medium hover:border-[var(--afrinex-accent)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`min-h-[40px] rounded-xl px-4 text-xs font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ${
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
