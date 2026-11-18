import { useCallback, useEffect, useState } from 'react';
import { Eye, Search, ShieldAlert, ShieldCheck, X } from 'lucide-react';
import type {
  AdminPaginatedUsersResponse,
  AdminPermission,
  AdminUserDetailResponse,
  PlatformUser,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import {
  ConfirmDialog,
  PERMISSION_METADATA,
  formatRoleLabel,
  formatShortDate,
  formatShortDateTime,
} from './AdminShared.tsx';

interface AdminUsersSectionProps {
  token: string | null;
  currentUser: PlatformUser;
  onRefreshOverview: () => void;
}

export function AdminUsersSection({
  token,
  currentUser,
  onRefreshOverview,
}: AdminUsersSectionProps) {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [tierFilter, setTierFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Detail inspection modal
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<AdminUserDetailResponse | null>(null);

  // Suspend confirmation dialog
  const [suspendTarget, setSuspendTarget] = useState<PlatformUser | null>(null);
  const [suspendReason, setSuspendReason] = useState('');

  // Owner-only role & permissions delegation dialog
  const [roleTarget, setRoleTarget] = useState<PlatformUser | null>(null);
  const [roleDraft, setRoleDraft] = useState<'member' | 'admin'>('member');
  const [permDraft, setPermDraft] = useState<AdminPermission[]>([]);

  const loadUsers = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), per_page: '20' });
    if (search.trim()) params.set('q', search.trim());
    if (roleFilter !== 'all') params.set('role', roleFilter);
    if (tierFilter !== 'all') params.set('tier', tierFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);

    const res = await apiFetch<AdminPaginatedUsersResponse>(
      `/api/admin/users?${params.toString()}`,
      undefined,
      token
    );
    if (res.ok && res.data) {
      setUsers(res.data.users);
      setTotalPages(res.data.total_pages);
      setTotalUsers(res.data.total);
    } else if (res.error) {
      setFeedback(res.error);
    }
    setLoading(false);
  }, [token, page, search, roleFilter, tierFilter, statusFilter]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const inspectUser = async (userId: string) => {
    if (!token) return;
    setDetailLoading(true);
    setDetail(null);
    const res = await apiFetch<AdminUserDetailResponse>(`/api/admin/users/${userId}`, undefined, token);
    if (res.ok && res.data) {
      setDetail(res.data);
    } else {
      setFeedback(res.error ?? 'Failed to inspect user.');
    }
    setDetailLoading(false);
  };

  const toggleTier = async (target: PlatformUser) => {
    if (!token) return;
    setBusyId(target.id);
    setFeedback(null);
    const nextTier = target.tier === 'pro' ? 'free' : 'pro';
    const res = await apiFetch<{ user: PlatformUser }>(
      `/api/admin/users/${target.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ tier: nextTier }),
      },
      token
    );
    if (res.ok && res.data?.user) {
      setUsers((prev) => prev.map((u) => (u.id === target.id ? res.data!.user : u)));
      setFeedback(`Updated ${target.firstName} to ${nextTier.toUpperCase()} tier.`);
      onRefreshOverview();
    } else {
      setFeedback(res.error ?? 'Unable to update tier.');
    }
    setBusyId(null);
  };

  const confirmSuspendToggle = async () => {
    if (!token || !suspendTarget) return;
    const isCurrentlySuspended = suspendTarget.accountStatus === 'suspended';
    const nextStatus = isCurrentlySuspended ? 'active' : 'suspended';

    setBusyId(suspendTarget.id);
    setFeedback(null);
    const res = await apiFetch<{ user: PlatformUser }>(
      `/api/admin/users/${suspendTarget.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          accountStatus: nextStatus,
          suspendedReason:
            nextStatus === 'suspended'
              ? suspendReason.trim() || 'Suspended by an administrator.'
              : null,
        }),
      },
      token
    );

    if (res.ok && res.data?.user) {
      setUsers((prev) => prev.map((u) => (u.id === suspendTarget.id ? res.data!.user : u)));
      setFeedback(
        nextStatus === 'suspended'
          ? `Suspended ${suspendTarget.firstName} and revoked active sessions.`
          : `Reactivated ${suspendTarget.firstName}.`
      );
      setSuspendTarget(null);
      setSuspendReason('');
      onRefreshOverview();
    } else {
      setFeedback(res.error ?? 'Unable to update account status.');
    }
    setBusyId(null);
  };

  const openRoleDialog = (target: PlatformUser) => {
    setRoleTarget(target);
    setRoleDraft(target.role);
    setPermDraft(target.adminPermissions ?? []);
  };

  const saveRoleDelegation = async () => {
    if (!token || !roleTarget) return;
    setBusyId(roleTarget.id);
    setFeedback(null);
    const res = await apiFetch<{ user: PlatformUser }>(
      `/api/admin/users/${roleTarget.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          role: roleDraft,
          adminPermissions: roleDraft === 'admin' ? permDraft : [],
        }),
      },
      token
    );
    if (res.ok && res.data?.user) {
      setUsers((prev) => prev.map((u) => (u.id === roleTarget.id ? res.data!.user : u)));
      setFeedback(`Updated access role & permissions for ${roleTarget.firstName}.`);
      setRoleTarget(null);
      onRefreshOverview();
    } else {
      setFeedback(res.error ?? 'Unable to update role and permissions.');
    }
    setBusyId(null);
  };

  const togglePermissionItem = (perm: AdminPermission) => {
    setPermDraft((prev) =>
      prev.includes(perm) ? prev.filter((item) => item !== perm) : [...prev, perm]
    );
  };

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_140px_130px_140px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--afrinex-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Search name, @username, Telegram ID..."
            className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] pl-9 pr-3 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
          />
        </div>

        <select
          value={roleFilter}
          onChange={(e) => {
            setPage(1);
            setRoleFilter(e.target.value);
          }}
          className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
        >
          <option value="all">All Roles</option>
          <option value="owner">Owners</option>
          <option value="admin">Admins</option>
          <option value="member">Members</option>
        </select>

        <select
          value={tierFilter}
          onChange={(e) => {
            setPage(1);
            setTierFilter(e.target.value);
          }}
          className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
        >
          <option value="all">All Tiers</option>
          <option value="free">Free</option>
          <option value="pro">Pro</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => {
            setPage(1);
            setStatusFilter(e.target.value);
          }}
          className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {feedback && (
        <p className="text-xs font-medium text-[var(--afrinex-accent)]">{feedback}</p>
      )}

      {/* Users Table */}
      {loading ? (
        <p className="text-sm text-[var(--afrinex-muted)]">Loading users...</p>
      ) : users.length === 0 ? (
        <p className="text-sm text-[var(--afrinex-muted)]">No users match the current filters.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--afrinex-muted)] tabular-nums">
            Showing {users.length} of {totalUsers} total accounts (Page {page} of {totalPages})
          </p>

          <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
            {users.map((entry) => {
              const effectiveRole = entry.effectiveRole ?? (entry.isOwner ? 'owner' : entry.role);
              const isSuspended = entry.accountStatus === 'suspended';
              const isSelf = entry.id === currentUser.id;
              return (
                <div
                  key={entry.id}
                  className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold truncate">
                        {entry.firstName}
                        {entry.lastName ? ` ${entry.lastName}` : ''}
                      </p>
                      <span className="font-mono text-xs text-[var(--afrinex-muted)]">
                        {entry.username ? `@${entry.username}` : 'No username'} · ID {entry.telegramId}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--afrinex-muted)]">
                      <span className="font-medium text-[var(--afrinex-text)]">
                        {formatRoleLabel(effectiveRole)}
                      </span>
                      <span>·</span>
                      <span className="uppercase font-medium">{entry.tier}</span>
                      <span>·</span>
                      <span className={isSuspended ? 'text-red-600 dark:text-red-400 font-medium' : ''}>
                        {isSuspended ? 'Suspended' : 'Active'}
                      </span>
                      <span>·</span>
                      <span className="font-mono tabular-nums">
                        Joined {formatShortDate(entry.createdAt)}
                      </span>
                      {entry.lastActiveAt && (
                        <>
                          <span>·</span>
                          <span className="font-mono tabular-nums">
                            Active {formatShortDateTime(entry.lastActiveAt)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => void inspectUser(entry.id)}
                      className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Inspect
                    </button>

                    <button
                      type="button"
                      disabled={busyId === entry.id}
                      onClick={() => void toggleTier(entry)}
                      className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)] disabled:opacity-50"
                    >
                      {entry.tier === 'pro' ? 'Set Free' : 'Grant Pro'}
                    </button>

                    {currentUser.isOwner && !entry.isOwner && !isSelf && (
                      <button
                        type="button"
                        disabled={busyId === entry.id}
                        onClick={() => openRoleDialog(entry)}
                        className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)] disabled:opacity-50"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Role & Perms
                      </button>
                    )}

                    {!entry.isOwner && !isSelf && (
                      <button
                        type="button"
                        disabled={busyId === entry.id}
                        onClick={() => {
                          setSuspendTarget(entry);
                          setSuspendReason(entry.suspendedReason ?? '');
                        }}
                        className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border px-3 text-xs font-medium disabled:opacity-50 ${
                          isSuspended
                            ? 'border-[var(--afrinex-accent)] text-[var(--afrinex-accent)]'
                            : 'border-red-500/40 text-red-600 dark:text-red-400'
                        }`}
                      >
                        <ShieldAlert className="h-3.5 w-3.5" />
                        {isSuspended ? 'Reactivate' : 'Suspend'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {/* User Inspection Modal */}
      {(detailLoading || detail) && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-6 shadow-xl space-y-5">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--afrinex-border)] pb-3">
              <div>
                <h3 className="font-display text-lg font-bold">
                  {detail ? `${detail.user.firstName} ${detail.user.lastName ?? ''}`.trim() : 'Loading User...'}
                </h3>
                {detail && (
                  <p className="font-mono text-xs text-[var(--afrinex-muted)]">
                    Telegram ID {detail.user.telegramId}
                    {detail.user.username ? ` · @${detail.user.username}` : ''}
                    {` · ${formatRoleLabel(detail.user.effectiveRole)}`}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                aria-label="Close inspection dialog"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailLoading ? (
              <p className="text-sm text-[var(--afrinex-muted)]">Loading account details...</p>
            ) : detail ? (
              <div className="space-y-5 text-xs">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-3">
                    <p className="text-[var(--afrinex-muted)]">Membership</p>
                    <p className="mt-1 font-semibold uppercase">{detail.user.tier}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-3">
                    <p className="text-[var(--afrinex-muted)]">Lessons Done</p>
                    <p className="mt-1 font-semibold tabular-nums">
                      {detail.learning.completedLessons}/{detail.learning.totalLessons}
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-3">
                    <p className="text-[var(--afrinex-muted)]">AI Usage</p>
                    <p className="mt-1 font-semibold tabular-nums">
                      {detail.aiUsage.usedToday} today · {detail.aiUsage.totalRequests} total
                    </p>
                  </div>
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-3">
                    <p className="text-[var(--afrinex-muted)]">Builder Projects</p>
                    <p className="mt-1 font-semibold tabular-nums">{detail.builderProjects.length}</p>
                  </div>
                </div>

                {detail.user.accountStatus === 'suspended' && (
                  <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3">
                    <p className="font-semibold text-red-600 dark:text-red-400">Account Suspended</p>
                    <p className="mt-0.5 text-[var(--afrinex-muted)]">
                      {detail.user.suspendedReason || 'Suspended by an administrator.'}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <h4 className="font-display text-sm font-semibold">
                    Enrolled Courses ({detail.learning.enrolledCourses.length}) · Certificates ({detail.learning.certificates.length})
                  </h4>
                  {detail.learning.enrolledCourses.length === 0 ? (
                    <p className="text-[var(--afrinex-muted)]">No course enrollments.</p>
                  ) : (
                    <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                      {detail.learning.enrolledCourses.map((c) => (
                        <div key={c.courseId} className="p-2.5 flex items-center justify-between gap-2">
                          <span className="font-medium truncate">{c.title}</span>
                          <span className="font-mono text-[var(--afrinex-muted)] tabular-nums">
                            {c.completedLessons}/{c.totalLessons}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="font-display text-sm font-semibold">
                    Subscriptions ({detail.subscriptions.length}) & Payments ({detail.payments.length})
                  </h4>
                  {detail.payments.length === 0 ? (
                    <p className="text-[var(--afrinex-muted)]">No Stars payment records.</p>
                  ) : (
                    <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                      {detail.payments.map((p) => (
                        <div key={p.id} className="p-2.5 flex items-center justify-between gap-2">
                          <span>
                            {p.plan} · {p.amount} {p.currency}
                          </span>
                          <span className="font-mono uppercase">{p.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="font-display text-sm font-semibold">Recent Account Audit Events</h4>
                  {detail.recentAuditLogs.length === 0 ? (
                    <p className="text-[var(--afrinex-muted)]">No audit events recorded for this account.</p>
                  ) : (
                    <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                      {detail.recentAuditLogs.slice(0, 8).map((log) => (
                        <div key={log.id} className="p-2.5 flex items-center justify-between gap-2">
                          <span className="font-mono">{log.action}</span>
                          <span className="font-mono text-[var(--afrinex-muted)] tabular-nums">
                            {formatShortDateTime(log.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Suspend / Reactivate Confirmation */}
      <ConfirmDialog
        open={Boolean(suspendTarget)}
        title={
          suspendTarget?.accountStatus === 'suspended'
            ? `Reactivate ${suspendTarget?.firstName}?`
            : `Suspend ${suspendTarget?.firstName}?`
        }
        description={
          suspendTarget?.accountStatus === 'suspended'
            ? 'Restoring access allows this user to sign in via Telegram again.'
            : 'Suspending this account immediately revokes all active JWT sessions and blocks API and sign-in access.'
        }
        confirmLabel={suspendTarget?.accountStatus === 'suspended' ? 'Reactivate Account' : 'Suspend Account'}
        destructive={suspendTarget?.accountStatus !== 'suspended'}
        busy={Boolean(suspendTarget && busyId === suspendTarget.id)}
        onConfirm={() => void confirmSuspendToggle()}
        onCancel={() => {
          setSuspendTarget(null);
          setSuspendReason('');
        }}
      >
        {suspendTarget?.accountStatus !== 'suspended' && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--afrinex-muted)]">
              Suspension reason (shown to user)
            </label>
            <input
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              maxLength={300}
              placeholder="Policy violation or requested hold..."
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
            />
          </div>
        )}
      </ConfirmDialog>

      {/* Owner-Only Role & Granular Permissions Modal */}
      <ConfirmDialog
        open={Boolean(roleTarget)}
        title={`Manage Role & Permissions · ${roleTarget?.firstName ?? ''}`}
        description="Only the AFRINEX Owner can promote/demote delegated administrators or assign module permissions. Updating roles revokes active user sessions so new permissions apply immediately."
        confirmLabel="Save Role & Permissions"
        busy={Boolean(roleTarget && busyId === roleTarget.id)}
        onConfirm={() => void saveRoleDelegation()}
        onCancel={() => setRoleTarget(null)}
      >
        <div className="space-y-3 text-xs">
          <div className="space-y-1">
            <label className="font-medium text-[var(--afrinex-muted)]">Access Role</label>
            <select
              value={roleDraft}
              onChange={(e) => setRoleDraft(e.target.value as 'member' | 'admin')}
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
            >
              <option value="member">Member (Standard User)</option>
              <option value="admin">Delegated Admin</option>
            </select>
          </div>

          {roleDraft === 'admin' && (
            <div className="space-y-2 max-h-56 overflow-y-auto rounded-xl border border-[var(--afrinex-border)] p-3">
              <p className="font-medium text-[var(--afrinex-muted)]">Delegated Admin Permissions</p>
              {PERMISSION_METADATA.map((perm) => (
                <label key={perm.id} className="flex items-start gap-2.5 cursor-pointer py-1">
                  <input
                    type="checkbox"
                    checked={permDraft.includes(perm.id)}
                    onChange={() => togglePermissionItem(perm.id)}
                    className="mt-0.5 h-4 w-4 accent-[var(--afrinex-accent)]"
                  />
                  <span>
                    <span className="font-medium block">{perm.label}</span>
                    <span className="text-[11px] text-[var(--afrinex-muted)]">{perm.description}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </ConfirmDialog>
    </div>
  );
}
