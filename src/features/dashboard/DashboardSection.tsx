import { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Bell,
  Bookmark,
  Bot,
  Briefcase,
  CheckCircle2,
  CreditCard,
  ExternalLink,
  FolderOpen,
  GraduationCap,
  HelpCircle,
  KeyRound,
  LogOut,
  MessageSquare,
  Pencil,
  Settings,
  ShieldCheck,
  Star,
  UserCheck,
} from 'lucide-react';
import type {
  DashboardOverviewResponse,
  PaymentRecord,
  PlatformSectionId,
  ProPlanDetails,
  ProPlanId,
  StarsInvoiceResponse,
} from '../../../shared/types.ts';
import {
  EmptyState,
  ErrorBanner,
  SkeletonList,
  useToast,
} from '../../components/FeedbackUI.tsx';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import {
  openTelegramExternalLink,
  openTelegramInvoice,
  setTelegramClosingConfirmation,
} from '../../lib/telegram.ts';

interface DashboardSectionProps {
  inTelegram: boolean;
  onNavigate: (section: PlatformSectionId) => void;
  onBackToAdmin?: () => void;
  onOpenBuilderProject?: (projectId: string) => void;
  onUnreadCountChange?: (count: number) => void;
}

type BookmarkFilterTab = 'all' | 'course' | 'tool' | 'opportunity';

export function DashboardSection({
  inTelegram,
  onNavigate,
  onBackToAdmin,
  onOpenBuilderProject,
  onUnreadCountChange,
}: DashboardSectionProps) {
  const { user, token, status, error, platformConfig, signInWithTelegram, signOut, refreshProfile } =
    useAuth();
  const { showToast } = useToast();

  const [dashboard, setDashboard] = useState<DashboardOverviewResponse | null>(null);
  const [plans, setPlans] = useState<ProPlanDetails[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState<boolean>(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [checkoutBusyPlan, setCheckoutBusyPlan] = useState<ProPlanId | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [bookmarkFilter, setBookmarkFilter] = useState<BookmarkFilterTab>('all');

  const [editingProfile, setEditingProfile] = useState<boolean>(false);
  const [firstNameInput, setFirstNameInput] = useState<string>('');
  const [lastNameInput, setLastNameInput] = useState<string>('');
  const [languageInput, setLanguageInput] = useState<string>('en');
  const [photoUrlInput, setPhotoUrlInput] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => {
    setTelegramClosingConfirmation(editingProfile);
    return () => setTelegramClosingConfirmation(false);
  }, [editingProfile]);

  const loadPlans = useCallback(async () => {
    const res = await apiFetch<{ plans: ProPlanDetails[] }>('/api/payments/plans', undefined, null);
    if (res.ok && res.data) {
      setPlans(res.data.plans);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    setLoadingDashboard(true);
    setDashboardError(null);
    const [dashRes, histRes] = await Promise.all([
      apiFetch<DashboardOverviewResponse>('/api/dashboard', undefined, token),
      apiFetch<{ payments: PaymentRecord[] }>('/api/payments/history', undefined, token),
    ]);
    if (dashRes.ok && dashRes.data) {
      setDashboard(dashRes.data);
      if (dashRes.data.unreadNotifications !== undefined) {
        onUnreadCountChange?.(dashRes.data.unreadNotifications);
      }
    } else {
      setDashboardError(dashRes.error ?? 'Failed to load dashboard summary.');
    }
    if (histRes.ok && histRes.data) {
      setPayments(histRes.data.payments);
    }
    setLoadingDashboard(false);
  }, [token, onUnreadCountChange]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (user && token) {
      void loadDashboard();
      setFirstNameInput(user.firstName);
      setLastNameInput(user.lastName ?? '');
      setLanguageInput(user.languageCode ?? 'en');
      setPhotoUrlInput(user.photoUrl ?? '');
    } else {
      setDashboard(null);
      setPayments([]);
    }
  }, [user, token, loadDashboard]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || savingProfile) return;
    setSavingProfile(true);
    setProfileError(null);
    setProfileNotice(null);

    const res = await apiFetch(
      '/api/dashboard/profile',
      {
        method: 'PUT',
        body: JSON.stringify({
          first_name: firstNameInput.trim(),
          last_name: lastNameInput.trim() || null,
          language_code: languageInput.trim() || 'en',
          photo_url: photoUrlInput.trim() || null,
        }),
      },
      token
    );

    if (res.ok) {
      await refreshProfile();
      setEditingProfile(false);
      setProfileNotice('Profile updated.');
      showToast('Profile saved.', 'success');
    } else {
      setProfileError(res.error ?? 'Could not update profile.');
    }
    setSavingProfile(false);
  };

  const removeBookmark = async (
    itemType: 'course' | 'tool' | 'opportunity',
    itemId: string
  ) => {
    if (!token) return;
    const res = await apiFetch(
      `/api/bookmarks/${itemType}/${itemId}`,
      { method: 'DELETE' },
      token
    );
    if (res.ok) {
      showToast('Bookmark removed.', 'info');
      await loadDashboard();
    } else {
      showToast(res.error ?? 'Could not remove bookmark.', 'error');
    }
  };

  const handleStarsUpgrade = async (planId: ProPlanId) => {
    if (!token) return;
    setCheckoutBusyPlan(planId);
    setBillingMessage(null);

    const res = await apiFetch<StarsInvoiceResponse>(
      '/api/payments/stars-invoice',
      {
        method: 'POST',
        body: JSON.stringify({ plan: planId }),
      },
      token
    );

    if (!res.ok || !res.data) {
      setBillingMessage(res.error ?? 'Could not create Telegram Stars invoice.');
      setCheckoutBusyPlan(null);
      return;
    }

    const opened = openTelegramInvoice(res.data.invoiceLink, (invoiceStatus) => {
      if (invoiceStatus === 'paid') {
        setBillingMessage('Payment confirmed. Updating your AFRINEX Pro membership...');
        showToast('AFRINEX Pro membership activated!', 'success');
        void refreshProfile().then(() => loadDashboard());
      } else if (invoiceStatus === 'cancelled') {
        setBillingMessage('Telegram Stars checkout was cancelled.');
      } else {
        setBillingMessage(`Payment status: ${invoiceStatus}`);
      }
      setCheckoutBusyPlan(null);
    });

    if (!opened) {
      setBillingMessage(
        'Invoice link created, but Telegram WebApp.openInvoice is only available inside Telegram.'
      );
      setCheckoutBusyPlan(null);
    }
  };

  const completionPercent =
    dashboard && dashboard.stats.totalLessons > 0
      ? Math.round((dashboard.stats.completedLessons / dashboard.stats.totalLessons) * 100)
      : 0;

  const showCourses = bookmarkFilter === 'all' || bookmarkFilter === 'course';
  const showTools = bookmarkFilter === 'all' || bookmarkFilter === 'tool';
  const showOpportunities = bookmarkFilter === 'all' || bookmarkFilter === 'opportunity';
  const visibleBookmarkCount =
    (showCourses ? dashboard?.bookmarks.courses.length ?? 0 : 0) +
    (showTools ? dashboard?.bookmarks.tools.length ?? 0 : 0) +
    (showOpportunities ? dashboard?.bookmarks.opportunities.length ?? 0 : 0);

  return (
    <div className="space-y-6">
      {onBackToAdmin && (
        <div className="rounded-2xl border border-[var(--afrinex-accent)]/40 bg-[var(--afrinex-surface)] p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs">
            <p className="font-semibold text-[var(--afrinex-accent)]">
              Member View Preview
            </p>
            <p className="text-[var(--afrinex-muted)]">
              You are viewing your personal member dashboard. Ordinary members only see this layout.
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToAdmin}
            className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)]"
          >
            <ShieldCheck className="h-4 w-4" />
            Back to Admin Dashboard
          </button>
        </div>
      )}

      {/* 1. Profile */}
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-[var(--afrinex-accent)]">
              {platformConfig?.platformName || 'AFRINEX'} · Member Dashboard
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              My Profile & Workspace
            </h1>
            <p className="text-sm text-[var(--afrinex-muted)]">
              Your learning progress, tracked opportunities, bookmarks, AI usage, builders, and integrations.
            </p>
          </div>

          {user && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setEditingProfile((prev) => !prev);
                  setProfileError(null);
                  setProfileNotice(null);
                }}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] px-4 text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap"
              >
                <Pencil className="h-4 w-4" />
                {editingProfile ? 'Close Editor' : 'Edit Profile'}
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] px-4 text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>

        {status === 'loading' ? (
          <SkeletonList rows={2} />
        ) : user ? (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-4 rounded-xl border border-[var(--afrinex-border)] p-4 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-[var(--afrinex-muted)]">Member Name</dt>
                <dd className="mt-1 font-medium">
                  {user.firstName}
                  {user.lastName ? ` ${user.lastName}` : ''}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--afrinex-muted)]">Telegram Handle</dt>
                <dd className="mt-1 font-mono text-xs">
                  {user.username ? `@${user.username}` : `ID ${user.telegramId}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--afrinex-muted)]">Account Role</dt>
                <dd className="mt-1 font-medium capitalize">
                  {user.effectiveRole ?? user.role}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--afrinex-muted)]">Membership Plan</dt>
                <dd className="mt-1 font-medium">
                  {user.tier === 'pro'
                    ? platformConfig?.proPlanLabel || 'AFRINEX Pro'
                    : platformConfig?.freePlanLabel || 'Free Member'}
                </dd>
              </div>
            </dl>

            {profileNotice && (
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--afrinex-accent)]">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {profileNotice}
              </p>
            )}

            {editingProfile && (
              <form
                onSubmit={(e) => void handleSaveProfile(e)}
                className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3"
              >
                <h2 className="font-display text-sm font-semibold">Edit Profile</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    required
                    minLength={1}
                    maxLength={80}
                    value={firstNameInput}
                    onChange={(e) => setFirstNameInput(e.target.value)}
                    placeholder="First name"
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <input
                    maxLength={80}
                    value={lastNameInput}
                    onChange={(e) => setLastNameInput(e.target.value)}
                    placeholder="Last name (optional)"
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <input
                    minLength={2}
                    maxLength={16}
                    value={languageInput}
                    onChange={(e) => setLanguageInput(e.target.value)}
                    placeholder="Language code (e.g. en)"
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <input
                    type="url"
                    value={photoUrlInput}
                    onChange={(e) => setPhotoUrlInput(e.target.value)}
                    placeholder="Photo URL (https://..., optional)"
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                </div>
                {profileError && (
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    {profileError}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="min-h-[40px] rounded-lg bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </form>
            )}

            {/* Quick Workspace & Platform Shortcuts */}
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <button
                type="button"
                onClick={() => onNavigate('workspace')}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-left text-xs hover:border-[var(--afrinex-accent)]"
              >
                <FolderOpen className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0" />
                <div>
                  <p className="font-semibold">My Workspace</p>
                  <p className="text-[11px] text-[var(--afrinex-muted)] tabular-nums">
                    {dashboard?.project_count ?? 0} projects
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('integrations')}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-left text-xs hover:border-[var(--afrinex-accent)]"
              >
                <KeyRound className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0" />
                <div>
                  <p className="font-semibold">Integrations</p>
                  <p className="text-[11px] text-[var(--afrinex-muted)] tabular-nums">
                    {dashboard?.integrationsCount ?? 0} saved
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-left text-xs hover:border-[var(--afrinex-accent)]"
              >
                <Bell className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0" />
                <div>
                  <p className="font-semibold">Notifications</p>
                  <p className="text-[11px] text-[var(--afrinex-muted)] tabular-nums">
                    {dashboard?.unreadNotifications ?? 0} unread
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('support')}
                className="flex items-center gap-2.5 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-left text-xs hover:border-[var(--afrinex-accent)]"
              >
                <HelpCircle className="h-4 w-4 text-[var(--afrinex-accent)] shrink-0" />
                <div>
                  <p className="font-semibold">Help & Support</p>
                  <p className="text-[11px] text-[var(--afrinex-muted)] tabular-nums">
                    {dashboard?.openSupportTickets ?? 0} open
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-[var(--afrinex-border)] p-5">
            <div className="flex items-start gap-3">
              <UserCheck className="mt-0.5 h-5 w-5 text-[var(--afrinex-accent)] shrink-0" />
              <div className="space-y-1">
                <h2 className="font-display text-base font-semibold">
                  {inTelegram ? 'Sign in with Telegram' : 'Open AFRINEX in Telegram'}
                </h2>
                <p className="text-sm text-[var(--afrinex-muted)]">
                  {inTelegram
                    ? 'Tap below to sign in with your Telegram account.'
                    : 'Sign-in happens automatically when you open AFRINEX inside the Telegram Mini App.'}
                </p>
              </div>
            </div>

            {error && <ErrorBanner message={error} />}

            {inTelegram && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void signInWithTelegram()}
                  className="min-h-[44px] rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                >
                  Sign In with Telegram
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {user && (
        <>
          {dashboardError && (
            <ErrorBanner message={dashboardError} onRetry={() => void loadDashboard()} />
          )}

          {/* Platform Announcements */}
          {dashboard?.announcements && dashboard.announcements.length > 0 && (
            <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-6 space-y-3">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--afrinex-accent)]">
                <Bell className="h-4 w-4" />
                Platform Announcements
              </div>
              <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                {dashboard.announcements.map((ann) => (
                  <article key={ann.id} className="p-4 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="font-display text-sm font-semibold">{ann.title}</h2>
                      <span className="font-mono text-[11px] text-[var(--afrinex-muted)] tabular-nums">
                        {ann.createdAt.slice(0, 10)}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--afrinex-muted)] whitespace-pre-line">
                      {ann.body}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          )}

          {/* 2. Membership & AFRINEX Pro */}
          <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  Membership & AFRINEX Pro
                </h2>
                <p className="text-sm text-[var(--afrinex-muted)]">
                  Digital subscriptions billed natively inside Telegram using XTR Stars.
                </p>
              </div>
              {user.proExpiresAt && (
                <span className="text-xs text-[var(--afrinex-accent)] font-mono tabular-nums">
                  Active until {user.proExpiresAt.slice(0, 10)}
                </span>
              )}
            </div>

            {billingMessage && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {billingMessage}
              </p>
            )}

            {plans.length === 0 ? (
              <p className="text-sm text-[var(--afrinex-muted)]">
                Subscription plans are currently unavailable.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="flex flex-col justify-between rounded-xl border border-[var(--afrinex-border)] p-5 space-y-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="font-display text-base font-semibold">{plan.title}</h3>
                        <span className="inline-flex items-center gap-1 font-mono text-sm font-semibold tabular-nums text-[var(--afrinex-accent)]">
                          <Star className="h-4 w-4" />
                          {plan.starsAmount} XTR
                        </span>
                      </div>
                      <p className="text-sm text-[var(--afrinex-muted)]">{plan.description}</p>
                    </div>

                    <button
                      type="button"
                      disabled={checkoutBusyPlan === plan.id}
                      onClick={() => void handleStarsUpgrade(plan.id)}
                      className="min-h-[44px] w-full rounded-xl bg-[var(--afrinex-accent)] text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
                    >
                      {checkoutBusyPlan === plan.id
                        ? 'Preparing Telegram Invoice...'
                        : `Pay ${plan.starsAmount} Stars`}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 3. Learning Progress + AI Usage + Builders + Opportunity Deadlines + Recent AI Chats */}
          <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-lg font-semibold">
                Activity, Learning, Tracker & AI Usage
              </h2>
              {loadingDashboard && (
                <span className="text-xs text-[var(--afrinex-muted)]">Refreshing...</span>
              )}
            </div>

            {loadingDashboard && !dashboard ? (
              <SkeletonList rows={3} />
            ) : dashboard && (
              <>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4">
                    <dt className="text-xs text-[var(--afrinex-muted)]">Lessons Completed</dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {dashboard.stats.completedLessons} / {dashboard.stats.totalLessons}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4">
                    <dt className="text-xs text-[var(--afrinex-muted)]">Completion Rate</dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {completionPercent}%
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4">
                    <dt className="text-xs text-[var(--afrinex-muted)]">Saved Bookmarks</dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {dashboard.stats.bookmarkCount}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4">
                    <dt className="text-xs text-[var(--afrinex-muted)]">Builder Projects</dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {dashboard.project_count}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4 col-span-2 sm:col-span-1">
                    <dt className="text-xs text-[var(--afrinex-muted)]">AI Usage Today</dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {dashboard.ai_usage.limit === 'unlimited'
                        ? `${dashboard.ai_usage.used_today} / ∞`
                        : `${dashboard.ai_usage.used_today} / ${dashboard.ai_usage.limit}`}
                    </dd>
                  </div>
                </dl>

                {/* Opportunity Tracker Deadlines + Recent AI Conversations */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold inline-flex items-center gap-1.5">
                        <Briefcase className="h-4 w-4 text-[var(--afrinex-accent)]" />
                        Opportunity Tracker Summary
                      </h3>
                      <button
                        type="button"
                        onClick={() => onNavigate('opportunities')}
                        className="text-xs font-medium text-[var(--afrinex-accent)]"
                      >
                        Open Tracker
                      </button>
                    </div>
                    {!dashboard.trackedOpportunitiesSummary ||
                    dashboard.trackedOpportunitiesSummary.total === 0 ? (
                      <p className="text-xs text-[var(--afrinex-muted)]">
                        No opportunities tracked yet. Save jobs, grants, or scholarships in the
                        Opportunities Hub to track deadlines and application notes.
                      </p>
                    ) : (
                      <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 text-xs">
                        <div className="rounded-lg border border-[var(--afrinex-border)] p-2.5">
                          <dt className="text-[11px] text-[var(--afrinex-muted)]">Tracked</dt>
                          <dd className="font-display text-lg font-bold tabular-nums">
                            {dashboard.trackedOpportunitiesSummary.total}
                          </dd>
                        </div>
                        <div className="rounded-lg border border-[var(--afrinex-border)] p-2.5">
                          <dt className="text-[11px] text-[var(--afrinex-muted)]">Applied</dt>
                          <dd className="font-display text-lg font-bold tabular-nums">
                            {dashboard.trackedOpportunitiesSummary.applied}
                          </dd>
                        </div>
                        <div className="rounded-lg border border-[var(--afrinex-border)] p-2.5">
                          <dt className="text-[11px] text-[var(--afrinex-muted)]">Upcoming Due</dt>
                          <dd className="font-display text-lg font-bold tabular-nums text-[var(--afrinex-accent)]">
                            {dashboard.trackedOpportunitiesSummary.upcomingDeadlines}
                          </dd>
                        </div>
                        <div className="rounded-lg border border-[var(--afrinex-border)] p-2.5">
                          <dt className="text-[11px] text-[var(--afrinex-muted)]">Overdue</dt>
                          <dd
                            className={`font-display text-lg font-bold tabular-nums ${
                              dashboard.trackedOpportunitiesSummary.overdueDeadlines > 0
                                ? 'text-amber-500'
                                : ''
                            }`}
                          >
                            {dashboard.trackedOpportunitiesSummary.overdueDeadlines}
                          </dd>
                        </div>
                      </dl>
                    )}
                  </div>

                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold inline-flex items-center gap-1.5">
                        <MessageSquare className="h-4 w-4 text-[var(--afrinex-accent)]" />
                        Recent AI Conversations
                      </h3>
                      <button
                        type="button"
                        onClick={() => onNavigate('assistant')}
                        className="text-xs font-medium text-[var(--afrinex-accent)]"
                      >
                        Open AI Assistant
                      </button>
                    </div>
                    {!dashboard.recentAiConversations ||
                    dashboard.recentAiConversations.length === 0 ? (
                      <p className="text-xs text-[var(--afrinex-muted)]">
                        No AI conversations yet. Ask AFRINEX AI about engineering, grants, or strategy.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {dashboard.recentAiConversations.map((conv) => (
                          <button
                            key={conv.id}
                            type="button"
                            onClick={() => onNavigate('assistant')}
                            className="w-full rounded-lg border border-[var(--afrinex-border)] p-2.5 text-left hover:border-[var(--afrinex-accent)] transition-colors flex items-center justify-between gap-2 text-xs"
                          >
                            <span className="font-medium truncate">{conv.title}</span>
                            <span className="text-[11px] text-[var(--afrinex-muted)] capitalize shrink-0">
                              {conv.topic} · {conv.updatedAt.slice(0, 10)}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Enrolled Courses & Certificates */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold inline-flex items-center gap-1.5">
                        <GraduationCap className="h-4 w-4 text-[var(--afrinex-accent)]" />
                        Enrolled Courses
                      </h3>
                      <button
                        type="button"
                        onClick={() => onNavigate('learning')}
                        className="text-xs font-medium text-[var(--afrinex-accent)]"
                      >
                        Browse Tracks
                      </button>
                    </div>
                    {!dashboard.enrolledCourses || dashboard.enrolledCourses.length === 0 ? (
                      <p className="text-xs text-[var(--afrinex-muted)]">
                        You have not enrolled in a course yet. Open the Learning Center to begin.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {dashboard.enrolledCourses.map((course) => {
                          const pct =
                            course.lessonCount > 0
                              ? Math.round((course.completedCount / course.lessonCount) * 100)
                              : 0;
                          return (
                            <div
                              key={course.courseId}
                              className="rounded-lg border border-[var(--afrinex-border)] p-3 space-y-1.5"
                            >
                              <div className="flex items-center justify-between gap-2 text-xs">
                                <span className="font-medium truncate">{course.title}</span>
                                <span className="font-mono tabular-nums text-[var(--afrinex-muted)] shrink-0">
                                  {course.completedCount}/{course.lessonCount} · {pct}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                                <div
                                  className="h-full bg-[var(--afrinex-accent)]"
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-display text-sm font-semibold inline-flex items-center gap-1.5">
                        <Award className="h-4 w-4 text-[var(--afrinex-accent)]" />
                        Earned Certificates ({dashboard.certificates?.length ?? 0})
                      </h3>
                    </div>
                    {!dashboard.certificates || dashboard.certificates.length === 0 ? (
                      <p className="text-xs text-[var(--afrinex-muted)]">
                        Complete all lessons in any course to claim your verifiable certificate.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {dashboard.certificates.map((cert) => (
                          <div
                            key={cert.id}
                            className="rounded-lg border border-[var(--afrinex-border)] p-3 space-y-1 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-medium truncate">{cert.courseTitle}</span>
                              <span className="font-mono tabular-nums text-[var(--afrinex-muted)]">
                                {cert.issuedAt.slice(0, 10)}
                              </span>
                            </div>
                            <p className="font-mono text-[11px] text-[var(--afrinex-muted)] truncate">
                              {cert.certificateCode}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Builder Projects Summary */}
                <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-sm font-semibold inline-flex items-center gap-1.5">
                      <Bot className="h-4 w-4 text-[var(--afrinex-accent)]" />
                      Recent Builder Projects ({dashboard.project_count})
                    </h3>
                    <button
                      type="button"
                      onClick={() => onNavigate('workspace')}
                      className="text-xs font-medium text-[var(--afrinex-accent)]"
                    >
                      Open My Workspace
                    </button>
                  </div>
                  {!dashboard.recentProjects || dashboard.recentProjects.length === 0 ? (
                    <p className="text-xs text-[var(--afrinex-muted)]">
                      No builder projects yet. Generate bots, AI agents, Mini Apps, or websites in
                      AI Builders.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {dashboard.recentProjects.map((proj) => (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => {
                            if (onOpenBuilderProject) {
                              onOpenBuilderProject(proj.id);
                            } else {
                              onNavigate('builders');
                            }
                          }}
                          className="rounded-lg border border-[var(--afrinex-border)] p-3 text-left hover:border-[var(--afrinex-accent)] transition-colors"
                        >
                          <p className="text-xs font-medium truncate inline-flex items-center gap-1">
                            {proj.isFavorite && (
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                            )}
                            <span className="truncate">{proj.name}</span>
                          </p>
                          <p className="mt-1 text-[11px] text-[var(--afrinex-muted)] capitalize">
                            {proj.builderType.replace('_', ' ')} · {proj.folder || 'General'} · {proj.status}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>

          {/* 4. Unified Filterable Bookmarks */}
          <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold">Saved Bookmarks</h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'all', label: `All (${dashboard?.stats.bookmarkCount ?? 0})` },
                    { id: 'course', label: `Courses (${dashboard?.bookmarks.courses.length ?? 0})` },
                    { id: 'tool', label: `AI Tools (${dashboard?.bookmarks.tools.length ?? 0})` },
                    {
                      id: 'opportunity',
                      label: `Opportunities (${dashboard?.bookmarks.opportunities.length ?? 0})`,
                    },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setBookmarkFilter(tab.id)}
                    className={`min-h-[34px] rounded-lg px-3 text-xs font-medium ${
                      bookmarkFilter === tab.id
                        ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                        : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)]'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {!dashboard || visibleBookmarkCount === 0 ? (
              <EmptyState
                title="No bookmarks in this category"
                description="Save courses, AI tools, or global opportunities to access and manage them here."
              />
            ) : (
              <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                {showCourses &&
                  dashboard.bookmarks.courses.map((course) => (
                    <div
                      key={`c_${course.id}`}
                      className="flex items-center justify-between gap-3 p-4"
                    >
                      <button
                        type="button"
                        onClick={() => onNavigate('learning')}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                          Course · {course.track}
                        </p>
                        <p className="font-medium truncate">{course.title}</p>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${course.title}`}
                        onClick={() => void removeBookmark('course', course.id)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-accent)]"
                      >
                        <Bookmark className="h-4 w-4 fill-[var(--afrinex-accent)]" />
                      </button>
                    </div>
                  ))}

                {showTools &&
                  dashboard.bookmarks.tools.map((tool) => (
                    <div
                      key={`t_${tool.id}`}
                      className="flex items-center justify-between gap-3 p-4"
                    >
                      <a
                        href={tool.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          if (openTelegramExternalLink(tool.url)) {
                            e.preventDefault();
                          }
                        }}
                        className="min-w-0 flex-1"
                      >
                        <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                          AI Tool · {tool.category}
                        </p>
                        <p className="font-medium inline-flex items-center gap-1.5 truncate">
                          {tool.name}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </p>
                      </a>
                      <button
                        type="button"
                        aria-label={`Remove ${tool.name}`}
                        onClick={() => void removeBookmark('tool', tool.id)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-accent)]"
                      >
                        <Bookmark className="h-4 w-4 fill-[var(--afrinex-accent)]" />
                      </button>
                    </div>
                  ))}

                {showOpportunities &&
                  dashboard.bookmarks.opportunities.map((opp) => (
                    <div
                      key={`o_${opp.id}`}
                      className="flex items-center justify-between gap-3 p-4"
                    >
                      <a
                        href={opp.url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => {
                          if (openTelegramExternalLink(opp.url)) {
                            e.preventDefault();
                          }
                        }}
                        className="min-w-0 flex-1"
                      >
                        <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                          {opp.opportunityType} · {opp.region}
                        </p>
                        <p className="font-medium inline-flex items-center gap-1.5 truncate">
                          {opp.title}
                          <ExternalLink className="h-3 w-3 shrink-0" />
                        </p>
                      </a>
                      <button
                        type="button"
                        aria-label={`Remove ${opp.title}`}
                        onClick={() => void removeBookmark('opportunity', opp.id)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-accent)]"
                      >
                        <Bookmark className="h-4 w-4 fill-[var(--afrinex-accent)]" />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </section>

          {/* 7. Subscription History & 8. Account Settings */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold inline-flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-[var(--afrinex-accent)]" />
                Subscription & Payment History
              </h2>

              {dashboard?.subscriptions && dashboard.subscriptions.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-[var(--afrinex-muted)]">Subscriptions</p>
                  <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                    {dashboard.subscriptions.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between gap-3 p-3 text-xs"
                      >
                        <div>
                          <p className="font-medium">{sub.plan}</p>
                          <p className="font-mono text-[11px] text-[var(--afrinex-muted)] tabular-nums">
                            {sub.startedAt.slice(0, 10)} → {sub.expiresAt.slice(0, 10)}
                          </p>
                        </div>
                        <span className="font-mono capitalize">{sub.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {payments.length === 0 ? (
                <p className="text-sm text-[var(--afrinex-muted)]">
                  No Telegram Stars payment transactions recorded yet.
                </p>
              ) : (
                <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 p-3.5 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{p.plan}</p>
                        <p className="font-mono text-[11px] text-[var(--afrinex-muted)] truncate">
                          {p.telegramPaymentChargeId}
                        </p>
                      </div>
                      <span className="font-mono font-medium tabular-nums shrink-0">
                        {p.amount} {p.currency} · {p.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-6 space-y-4">
              <h2 className="font-display text-lg font-semibold inline-flex items-center gap-2">
                <Settings className="h-4 w-4 text-[var(--afrinex-accent)]" />
                Account Settings
              </h2>
              <dl className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)] text-xs">
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <dt className="text-[var(--afrinex-muted)]">Telegram ID</dt>
                  <dd className="font-mono tabular-nums">{user.telegramId}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <dt className="text-[var(--afrinex-muted)]">Preferred Language</dt>
                  <dd className="font-mono uppercase">{user.languageCode || 'en'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <dt className="text-[var(--afrinex-muted)]">Account Status</dt>
                  <dd className="capitalize font-medium">{user.accountStatus ?? 'active'}</dd>
                </div>
                <div className="flex items-center justify-between gap-3 p-3.5">
                  <dt className="text-[var(--afrinex-muted)]">Member Since</dt>
                  <dd className="font-mono tabular-nums">
                    {user.createdAt ? user.createdAt.slice(0, 10) : '—'}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProfile(true)}
                  className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] px-4 text-xs font-medium hover:border-[var(--afrinex-accent)]"
                >
                  Update Profile Details
                </button>
                <button
                  type="button"
                  onClick={() => void signOut()}
                  className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] px-4 text-xs font-medium hover:border-red-500"
                >
                  Revoke Active Session
                </button>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
