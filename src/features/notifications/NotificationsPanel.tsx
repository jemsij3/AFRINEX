import { useCallback, useEffect, useState } from 'react';
import {
  ArrowRight,
  Bell,
  CheckCheck,
  SlidersHorizontal,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type {
  NotificationPreferences,
  NotificationRecord,
  PlatformSectionId,
} from '../../../shared/types.ts';
import {
  EmptyState,
  ErrorBanner,
  PaginationBar,
  SkeletonList,
  useToast,
} from '../../components/FeedbackUI.tsx';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';

interface NotificationsPanelProps {
  onNavigate: (section: PlatformSectionId) => void;
  onUnreadCountChange?: (count: number) => void;
}

export function NotificationsPanel({
  onNavigate,
  onUnreadCountChange,
}: NotificationsPanelProps) {
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), per_page: '15' });
    if (unreadOnly) params.set('unread', 'true');

    const res = await apiFetch<{
      notifications: NotificationRecord[];
      unreadCount: number;
      preferences: NotificationPreferences;
      total_pages: number;
    }>(`/api/notifications?${params.toString()}`, undefined, token);

    if (res.ok && res.data) {
      setNotifications(res.data.notifications);
      setUnreadCount(res.data.unreadCount);
      onUnreadCountChange?.(res.data.unreadCount);
      setPrefs(res.data.preferences);
      setTotalPages(res.data.total_pages);
    } else {
      setError(res.error ?? 'Failed to load notifications.');
    }
    setLoading(false);
  }, [token, page, unreadOnly, onUnreadCountChange]);

  useEffect(() => {
    if (user && token) {
      void loadNotifications();
    } else {
      setLoading(false);
    }
  }, [user, token, loadNotifications]);

  const markRead = async (item: NotificationRecord) => {
    if (!token || item.isRead) return;
    const res = await apiFetch(`/api/notifications/${item.id}/read`, { method: 'POST' }, token);
    if (res.ok) {
      setNotifications((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, isRead: true } : row))
      );
      const nextCount = Math.max(0, unreadCount - 1);
      setUnreadCount(nextCount);
      onUnreadCountChange?.(nextCount);
    }
  };

  const markAllRead = async () => {
    if (!token || unreadCount === 0) return;
    const res = await apiFetch('/api/notifications/read-all', { method: 'POST' }, token);
    if (res.ok) {
      setNotifications((prev) => prev.map((row) => ({ ...row, isRead: true })));
      setUnreadCount(0);
      onUnreadCountChange?.(0);
      showToast('All notifications marked as read.', 'success');
    } else {
      showToast(res.error ?? 'Could not mark notifications read.', 'error');
    }
  };

  const dismissNotification = async (id: string) => {
    if (!token) return;
    const target = notifications.find((n) => n.id === id);
    const res = await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' }, token);
    if (res.ok) {
      setNotifications((prev) => prev.filter((row) => row.id !== id));
      if (target && !target.isRead) {
        const nextCount = Math.max(0, unreadCount - 1);
        setUnreadCount(nextCount);
        onUnreadCountChange?.(nextCount);
      }
    } else {
      showToast(res.error ?? 'Could not remove notification.', 'error');
    }
  };

  const togglePref = async (
    key: keyof Omit<NotificationPreferences, 'userId' | 'updatedAt'>
  ) => {
    if (!token || !prefs || savingPrefs) return;
    setSavingPrefs(true);
    const nextValue = !prefs[key];
    const res = await apiFetch<{ preferences: NotificationPreferences }>(
      '/api/notifications/preferences',
      {
        method: 'PUT',
        body: JSON.stringify({ [key]: nextValue }),
      },
      token
    );
    setSavingPrefs(false);
    if (res.ok && res.data?.preferences) {
      setPrefs(res.data.preferences);
      showToast('Notification preference updated.', 'success');
    } else {
      showToast(res.error ?? 'Could not save preferences.', 'error');
    }
  };

  if (!user) {
    return (
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <UserCheck className="mt-0.5 h-5 w-5 text-[var(--afrinex-accent)] shrink-0" />
          <div className="space-y-1">
            <h1 className="font-display text-xl font-bold sm:text-2xl">
              Notifications & Activity
            </h1>
            <p className="text-sm text-[var(--afrinex-muted)]">
              Sign in with Telegram to view deadline alerts, builder updates, support replies, and billing confirmations.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="min-h-[44px] rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)]"
        >
          Go to My Account
        </button>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--afrinex-accent)] inline-flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5" />
            Activity Center · {unreadCount} unread
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Notifications
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPage(1);
              setUnreadOnly((prev) => !prev);
            }}
            className={`min-h-[40px] rounded-xl px-3.5 text-xs font-medium transition-colors ${
              unreadOnly
                ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
            }`}
          >
            {unreadOnly ? 'Showing Unread' : 'Filter Unread'}
          </button>

          <button
            type="button"
            disabled={unreadCount === 0}
            onClick={() => void markAllRead()}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--afrinex-border)] px-3.5 text-xs font-medium hover:border-[var(--afrinex-accent)] disabled:opacity-40"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark All Read
          </button>

          <button
            type="button"
            onClick={() => setShowPrefs((prev) => !prev)}
            className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--afrinex-border)] px-3.5 text-xs font-medium hover:border-[var(--afrinex-accent)]"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Preferences
          </button>
        </div>
      </div>

      {showPrefs && prefs && (
        <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-3">
          <p className="text-xs font-semibold">Notification Preferences</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-xs">
            {[
              { key: 'telegramEnabled' as const, label: 'Telegram Bot DM Alerts' },
              { key: 'deadlinesEnabled' as const, label: 'Opportunity Deadlines' },
              { key: 'projectEventsEnabled' as const, label: 'Builder & Project Events' },
              { key: 'billingEventsEnabled' as const, label: 'Subscriptions & Payments' },
              { key: 'announcementsEnabled' as const, label: 'Platform Announcements' },
              { key: 'aiEventsEnabled' as const, label: 'AI Quota & Assistant Events' },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 cursor-pointer"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={prefs[item.key]}
                  disabled={savingPrefs}
                  onChange={() => void togglePref(item.key)}
                  className="h-4 w-4 accent-[#0f5e43]"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <ErrorBanner message={error} onRetry={() => void loadNotifications()} />}

      {loading ? (
        <SkeletonList rows={4} />
      ) : notifications.length === 0 ? (
        <EmptyState
          title={unreadOnly ? 'No unread notifications' : 'Your activity feed is clear'}
          description="Updates from opportunity deadlines, builder deployments, Stars payments, certificates, and support replies appear here automatically."
        />
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => (
            <article
              key={item.id}
              className={`rounded-xl border p-4 space-y-2 transition-colors ${
                item.isRead
                  ? 'border-[var(--afrinex-border)] opacity-85'
                  : 'border-[var(--afrinex-accent)]/50 bg-[var(--afrinex-accent)]/5'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--afrinex-muted)]">
                    <span className="rounded border border-[var(--afrinex-border)] px-1.5 py-0.5 uppercase font-mono">
                      {item.type}
                    </span>
                    <span className="font-mono tabular-nums">
                      {item.createdAt.slice(0, 16).replace('T', ' ')}
                    </span>
                    {!item.isRead && (
                      <span className="font-semibold text-[var(--afrinex-accent)]">Unread</span>
                    )}
                  </div>
                  <h2 className="font-display text-sm font-semibold">{item.title}</h2>
                  <p className="text-xs leading-relaxed text-[var(--afrinex-muted)]">{item.body}</p>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {item.linkSection && (
                    <button
                      type="button"
                      onClick={() => {
                        void markRead(item);
                        onNavigate(item.linkSection!);
                      }}
                      className="min-h-[34px] inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] px-2.5 text-[11px] font-medium hover:border-[var(--afrinex-accent)]"
                    >
                      Open
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  )}
                  {!item.isRead && (
                    <button
                      type="button"
                      onClick={() => void markRead(item)}
                      className="min-h-[34px] rounded-lg border border-[var(--afrinex-border)] px-2.5 text-[11px] hover:border-[var(--afrinex-accent)]"
                    >
                      Mark Read
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Dismiss notification"
                    onClick={() => void dismissNotification(item.id)}
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}

          <PaginationBar page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </section>
  );
}
