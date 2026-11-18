import { useCallback, useEffect, useState } from 'react';
import type {
  AdminPaginatedPaymentsResponse,
  AdminPaginatedSubscriptionsResponse,
  AdminPaymentEntry,
  AdminRevenueResponse,
  AppSettingsConfig,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { ConfirmDialog, formatShortDate, formatShortDateTime } from './AdminShared.tsx';

interface AdminBillingSectionProps {
  token: string | null;
  onOpenSettings: () => void;
}

export function AdminBillingSection({ token, onOpenSettings }: AdminBillingSectionProps) {
  const [revenue, setRevenue] = useState<AdminRevenueResponse | null>(null);
  const [payments, setPayments] = useState<AdminPaginatedPaymentsResponse | null>(null);
  const [subscriptions, setSubscriptions] = useState<AdminPaginatedSubscriptionsResponse | null>(null);
  const [pricing, setPricing] = useState<{ monthly: number; yearly: number } | null>(null);

  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [subStatusFilter, setSubStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [reconcileTarget, setReconcileTarget] = useState<AdminPaymentEntry | null>(null);
  const [reconcileNote, setReconcileNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const loadBilling = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const payParams = new URLSearchParams({ page: '1', per_page: '25' });
    if (paymentStatusFilter !== 'all') payParams.set('status', paymentStatusFilter);

    const subParams = new URLSearchParams({ page: '1', per_page: '25' });
    if (subStatusFilter !== 'all') subParams.set('status', subStatusFilter);

    const [revRes, payRes, subRes, cfgRes] = await Promise.all([
      apiFetch<AdminRevenueResponse>('/api/admin/revenue', undefined, token),
      apiFetch<AdminPaginatedPaymentsResponse>(
        `/api/admin/payments?${payParams.toString()}`,
        undefined,
        token
      ),
      apiFetch<AdminPaginatedSubscriptionsResponse>(
        `/api/admin/subscriptions?${subParams.toString()}`,
        undefined,
        token
      ),
      apiFetch<{ settings: AppSettingsConfig }>('/api/admin/settings', undefined, token),
    ]);

    if (revRes.ok && revRes.data) setRevenue(revRes.data);
    if (payRes.ok && payRes.data) setPayments(payRes.data);
    if (subRes.ok && subRes.data) setSubscriptions(subRes.data);
    if (cfgRes.ok && cfgRes.data) {
      setPricing({
        monthly: cfgRes.data.settings.proMonthlyStars,
        yearly: cfgRes.data.settings.proYearlyStars,
      });
    }
    setLoading(false);
  }, [token, paymentStatusFilter, subStatusFilter]);

  useEffect(() => {
    void loadBilling();
  }, [loadBilling]);

  const submitReconciliation = async () => {
    if (!token || !reconcileTarget || reconcileNote.trim().length < 3) return;
    setSavingNote(true);
    const res = await apiFetch(
      `/api/admin/payments/${reconcileTarget.id}/reconcile`,
      {
        method: 'PATCH',
        body: JSON.stringify({ reconciliationNote: reconcileNote.trim() }),
      },
      token
    );
    if (res.ok) {
      setFeedback(`Saved reconciliation note for payment ${reconcileTarget.id}.`);
      setReconcileTarget(null);
      setReconcileNote('');
      await loadBilling();
    } else {
      setFeedback(res.error ?? 'Failed to save reconciliation note.');
    }
    setSavingNote(false);
  };

  if (loading && !revenue) {
    return <p className="text-sm text-[var(--afrinex-muted)]">Loading subscriptions & payments...</p>;
  }

  return (
    <div className="space-y-6">
      {feedback && (
        <p className="text-xs font-medium text-[var(--afrinex-accent)]">{feedback}</p>
      )}

      {/* Revenue & Breakdown Cards */}
      {revenue && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5">
            <p className="text-[11px] text-[var(--afrinex-muted)]">Completed Revenue</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums">
              {revenue.total_revenue} XTR
            </p>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5">
            <p className="text-[11px] text-[var(--afrinex-muted)]">Active Subscriptions</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums">
              {revenue.active_subscriptions}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5">
            <p className="text-[11px] text-[var(--afrinex-muted)]">Completed Payments</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums">
              {revenue.total_payments}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5">
            <p className="text-[11px] text-[var(--afrinex-muted)]">Pending Invoices</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums">
              {revenue.pending_payments ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5">
            <p className="text-[11px] text-[var(--afrinex-muted)]">Failed Invoices</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums">
              {revenue.failed_payments ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5">
            <p className="text-[11px] text-[var(--afrinex-muted)]">Refunded</p>
            <p className="mt-1 font-display text-lg font-bold tabular-nums">
              {revenue.refunded_payments ?? 0} ({revenue.refunded_revenue ?? 0} XTR)
            </p>
          </div>
        </div>
      )}

      {/* Pro Plan Pricing Summary */}
      {pricing && (
        <div className="rounded-xl border border-[var(--afrinex-border)] p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs">
          <div>
            <p className="font-semibold">Current Telegram Stars Pro Pricing</p>
            <p className="text-[var(--afrinex-muted)] tabular-nums">
              Monthly: {pricing.monthly} XTR · Yearly: {pricing.yearly} XTR
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-3 font-medium hover:border-[var(--afrinex-accent)]"
          >
            Edit Pricing in App Settings
          </button>
        </div>
      )}

      {/* Monthly Revenue Breakdown */}
      {revenue && revenue.monthly_revenue.length > 0 && (
        <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2.5">
          <h3 className="font-display text-sm font-semibold">Monthly Completed Revenue</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {revenue.monthly_revenue.map((m) => (
              <div
                key={m.month}
                className="rounded-lg border border-[var(--afrinex-border)] px-3 py-2 text-xs"
              >
                <p className="font-mono text-[var(--afrinex-muted)]">{m.month}</p>
                <p className="font-semibold tabular-nums mt-0.5">{m.amount} XTR</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payments Table */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold">
            Payments Ledger ({payments?.total ?? 0})
          </h3>
          <select
            value={paymentStatusFilter}
            onChange={(e) => setPaymentStatusFilter(e.target.value)}
            className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>

        {!payments || payments.payments.length === 0 ? (
          <p className="text-xs text-[var(--afrinex-muted)]">No payments match this filter.</p>
        ) : (
          <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
            {payments.payments.map((p) => {
              const displayStatus =
                p.status === 'pending' && p.failedReason ? 'failed' : p.status;
              return (
                <div
                  key={p.id}
                  className="p-3.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs"
                >
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">
                      {p.firstName}
                      {p.username ? ` (@${p.username})` : ''} · {p.plan} · {p.amount} {p.currency}
                    </p>
                    <p className="font-mono text-[11px] text-[var(--afrinex-muted)] break-all">
                      Status: <span className="uppercase font-semibold">{displayStatus}</span> ·
                      Charge: {p.telegramPaymentChargeId} · {formatShortDateTime(p.createdAt)}
                    </p>
                    {p.failedReason && (
                      <p className="text-red-600 dark:text-red-400">Failure: {p.failedReason}</p>
                    )}
                    {p.reconciliationNote && (
                      <p className="text-[var(--afrinex-accent)]">
                        Reconciled ({formatShortDate(p.reconciledAt)}): {p.reconciliationNote}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setReconcileTarget(p);
                      setReconcileNote(p.reconciliationNote ?? '');
                    }}
                    className="min-h-[34px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)] shrink-0"
                  >
                    Reconcile Note
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Subscriptions Table */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold">
            Subscriptions ({subscriptions?.total ?? 0})
          </h3>
          <select
            value={subStatusFilter}
            onChange={(e) => setSubStatusFilter(e.target.value)}
            className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {!subscriptions || subscriptions.subscriptions.length === 0 ? (
          <p className="text-xs text-[var(--afrinex-muted)]">No subscription records found.</p>
        ) : (
          <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
            {subscriptions.subscriptions.map((sub) => (
              <div
                key={sub.id}
                className="p-3.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between text-xs"
              >
                <div>
                  <p className="font-semibold">
                    {sub.firstName}
                    {sub.username ? ` (@${sub.username})` : ''} · {sub.plan}
                  </p>
                  <p className="font-mono text-[11px] text-[var(--afrinex-muted)] tabular-nums">
                    Started {formatShortDate(sub.startedAt)} · Expires {formatShortDate(sub.expiresAt)}
                  </p>
                </div>
                <span className="font-mono uppercase font-semibold">{sub.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(reconcileTarget)}
        title="Payment Reconciliation Note"
        description={`Attach an administrative reconciliation note to payment ${reconcileTarget?.id ?? ''}. This never fakes a completed payment status.`}
        confirmLabel="Save Reconciliation Note"
        busy={savingNote}
        onConfirm={() => void submitReconciliation()}
        onCancel={() => {
          setReconcileTarget(null);
          setReconcileNote('');
        }}
      >
        <textarea
          rows={3}
          minLength={3}
          maxLength={500}
          value={reconcileNote}
          onChange={(e) => setReconcileNote(e.target.value)}
          placeholder="Verified against Telegram Stars Bot transaction log..."
          className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-sm"
        />
      </ConfirmDialog>
    </div>
  );
}
