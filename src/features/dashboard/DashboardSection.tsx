import { useCallback, useEffect, useState } from 'react';
import {
  Bookmark,
  CheckCircle2,
  ExternalLink,
  LogOut,
  Pencil,
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
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import { openTelegramInvoice } from '../../lib/telegram.ts';

interface DashboardSectionProps {
  inTelegram: boolean;
  onNavigate: (section: PlatformSectionId) => void;
}

export function DashboardSection({ inTelegram, onNavigate }: DashboardSectionProps) {
  const { user, token, status, error, signInWithTelegram, signOut, refreshProfile } = useAuth();

  const [dashboard, setDashboard] = useState<DashboardOverviewResponse | null>(null);
  const [plans, setPlans] = useState<ProPlanDetails[]>([]);
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState<boolean>(false);
  const [checkoutBusyPlan, setCheckoutBusyPlan] = useState<ProPlanId | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  const [editingProfile, setEditingProfile] = useState<boolean>(false);
  const [firstNameInput, setFirstNameInput] = useState<string>('');
  const [lastNameInput, setLastNameInput] = useState<string>('');
  const [languageInput, setLanguageInput] = useState<string>('en');
  const [photoUrlInput, setPhotoUrlInput] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    const res = await apiFetch<{ plans: ProPlanDetails[] }>('/api/payments/plans', undefined, null);
    if (res.ok && res.data) {
      setPlans(res.data.plans);
    }
  }, []);

  const loadDashboard = useCallback(async () => {
    if (!token) return;
    setLoadingDashboard(true);
    const [dashRes, histRes] = await Promise.all([
      apiFetch<DashboardOverviewResponse>('/api/dashboard', undefined, token),
      apiFetch<{ payments: PaymentRecord[] }>('/api/payments/history', undefined, token),
    ]);
    if (dashRes.ok && dashRes.data) {
      setDashboard(dashRes.data);
    }
    if (histRes.ok && histRes.data) {
      setPayments(histRes.data.payments);
    }
    setLoadingDashboard(false);
  }, [token]);

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
      '/api/bookmarks',
      {
        method: 'POST',
        body: JSON.stringify({ itemType, itemId }),
      },
      token
    );
    if (res.ok) {
      await loadDashboard();
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

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-[var(--afrinex-accent)]">
              Profile · Progress · Bookmarks · AFRINEX Pro
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              My Dashboard & AFRINEX Pro
            </h1>
            <p className="text-sm text-[var(--afrinex-muted)]">
              Manage your profile, learning progress, saved items, and AFRINEX Pro membership.
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
          <p className="text-sm text-[var(--afrinex-muted)]">Verifying AFRINEX session...</p>
        ) : user ? (
          <div className="space-y-6">
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
                <dt className="text-xs text-[var(--afrinex-muted)]">Access Role</dt>
                <dd className="mt-1 font-medium capitalize">{user.role}</dd>
              </div>
              <div>
                <dt className="text-xs text-[var(--afrinex-muted)]">Membership Tier</dt>
                <dd className="mt-1 font-medium uppercase tabular-nums">{user.tier}</dd>
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

            <div className="flex flex-wrap items-center gap-3">
              {user.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => onNavigate('admin')}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 whitespace-nowrap shrink-0"
                >
                  <ShieldCheck className="h-4 w-4" />
                  Open Admin Console
                </button>
              )}
              <button
                type="button"
                onClick={() => onNavigate('learning')}
                className="min-h-[44px] rounded-xl border border-[var(--afrinex-border)] px-4 text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap shrink-0"
              >
                Continue Learning
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

            {error && (
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                {error}
              </p>
            )}

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
          {/* AFRINEX Pro & Telegram Stars Membership */}
          <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">
                  AFRINEX Pro via Telegram Stars
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

            {payments.length > 0 && (
              <div className="space-y-2 pt-2">
                <h3 className="font-display text-sm font-semibold">Payment Records</h3>
                <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                  {payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-3 p-3.5 text-xs"
                    >
                      <div>
                        <span className="font-medium">{p.plan}</span>
                        <span className="mx-2 text-[var(--afrinex-muted)]">·</span>
                        <span className="font-mono text-[var(--afrinex-muted)]">
                          {p.telegramPaymentChargeId}
                        </span>
                      </div>
                      <span className="font-mono font-medium tabular-nums">
                        {p.amount} {p.currency} ({p.status})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Learning Progress, Usage & Bookmarks */}
          <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-6">
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-display text-lg font-semibold">
                Activity, Progress & Bookmarks
              </h2>
              {loadingDashboard && (
                <span className="text-xs text-[var(--afrinex-muted)]">Refreshing...</span>
              )}
            </div>

            {dashboard && (
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
                      {dashboard.stats.totalLessons > 0
                        ? Math.round(
                            (dashboard.stats.completedLessons / dashboard.stats.totalLessons) *
                              100
                          )
                        : 0}
                      %
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
                        ? `${dashboard.ai_usage.used_today} (∞)`
                        : `${dashboard.ai_usage.used_today} / ${dashboard.ai_usage.limit}`}
                    </dd>
                  </div>
                </dl>

                {dashboard.stats.bookmarkCount === 0 ? (
                  <p className="text-sm text-[var(--afrinex-muted)]">
                    No bookmarks yet. Save courses, AI tools, or opportunities to access them
                    quickly here.
                  </p>
                ) : (
                  <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                    {dashboard.bookmarks.courses.map((course) => (
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

                    {dashboard.bookmarks.tools.map((tool) => (
                      <div
                        key={`t_${tool.id}`}
                        className="flex items-center justify-between gap-3 p-4"
                      >
                        <a
                          href={tool.url}
                          target="_blank"
                          rel="noreferrer"
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

                    {dashboard.bookmarks.opportunities.map((opp) => (
                      <div
                        key={`o_${opp.id}`}
                        className="flex items-center justify-between gap-3 p-4"
                      >
                        <a
                          href={opp.url}
                          target="_blank"
                          rel="noreferrer"
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
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
