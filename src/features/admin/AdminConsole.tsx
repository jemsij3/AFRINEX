import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bot,
  Briefcase,
  Cpu,
  CreditCard,
  GraduationCap,
  Megaphone,
  RefreshCw,
  Settings,
  ShieldCheck,
  UserCheck,
  Users,
  Wrench,
} from 'lucide-react';
import type {
  AdminOverviewResponse,
  AdminPermission,
  PlatformSectionId,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import { AdminAiSection, AdminBuildersSection } from './AdminAiBuildersSection.tsx';
import { AdminBillingSection } from './AdminBillingSection.tsx';
import { AdminOpportunitiesSection, AdminToolsSection } from './AdminDirectorySection.tsx';
import { AdminLearningSection } from './AdminLearningSection.tsx';
import {
  AdminAnnouncementsSection,
  AdminRolesAuditSection,
  AdminSettingsSection,
} from './AdminOperationsSection.tsx';
import { AdminOverviewSection } from './AdminOverviewSection.tsx';
import { formatRoleLabel } from './AdminShared.tsx';
import { AdminUsersSection } from './AdminUsersSection.tsx';

type AdminTabId =
  | 'overview'
  | 'users'
  | 'learning'
  | 'tools'
  | 'opportunities'
  | 'ai'
  | 'builders'
  | 'billing'
  | 'announcements'
  | 'settings'
  | 'roles-audit';

interface AdminNavItem {
  id: AdminTabId;
  label: string;
  requiredPermission?: AdminPermission;
  icon: typeof BarChart3;
}

const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { id: 'overview', label: 'Platform Overview', icon: BarChart3 },
  { id: 'users', label: 'Users', requiredPermission: 'users.manage', icon: Users },
  { id: 'learning', label: 'Learning Center', requiredPermission: 'learning.manage', icon: GraduationCap },
  { id: 'tools', label: 'AI Tools', requiredPermission: 'tools.manage', icon: Wrench },
  { id: 'opportunities', label: 'Opportunities', requiredPermission: 'opportunities.manage', icon: Briefcase },
  { id: 'ai', label: 'AI Assistant', requiredPermission: 'ai.manage', icon: Cpu },
  { id: 'builders', label: 'AI Builders', requiredPermission: 'builders.manage', icon: Bot },
  { id: 'billing', label: 'Subscriptions & Stars', requiredPermission: 'billing.manage', icon: CreditCard },
  { id: 'announcements', label: 'Announcements', requiredPermission: 'announcements.manage', icon: Megaphone },
  { id: 'settings', label: 'App Configuration', requiredPermission: 'settings.manage', icon: Settings },
  { id: 'roles-audit', label: 'Roles & Audit Logs', requiredPermission: 'audit.view', icon: ShieldCheck },
];

interface AdminConsoleProps {
  onSwitchToMemberView?: () => void;
  onNavigate?: (section: PlatformSectionId) => void;
}

export function AdminConsole({ onSwitchToMemberView }: AdminConsoleProps) {
  const { user, token, refreshConfig } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTabId>('overview');
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [loadingOverview, setLoadingOverview] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';
  const isOwner = Boolean(user?.isOwner || user?.effectiveRole === 'owner');
  const permissions = useMemo(() => new Set(user?.adminPermissions ?? []), [user]);

  const visibleNavItems = useMemo(
    () =>
      ADMIN_NAV_ITEMS.filter(
        (item) => isOwner || !item.requiredPermission || permissions.has(item.requiredPermission)
      ),
    [isOwner, permissions]
  );

  const loadOverview = useCallback(async () => {
    if (!token || !isAdmin) return;
    setLoadingOverview(true);
    setError(null);
    const res = await apiFetch<AdminOverviewResponse>('/api/admin/overview', undefined, token);
    if (res.ok && res.data) {
      setOverview(res.data);
    } else {
      setError(res.error ?? 'Unable to load admin overview.');
    }
    setLoadingOverview(false);
  }, [token, isAdmin]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  if (!user || !isAdmin) {
    return (
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-2">
        <h1 className="font-display text-xl font-bold">Administrator Access Required</h1>
        <p className="text-sm text-[var(--afrinex-muted)]">
          This area is restricted to the AFRINEX owner and authorized administrators verified by
          server-side Telegram authentication.
        </p>
      </section>
    );
  }

  const currentNav = visibleNavItems.find((item) => item.id === activeTab) ?? visibleNavItems[0];

  return (
    <div className="space-y-4">
      {overview?.adminConfigStatus && !overview.adminConfigStatus.adminIdsConfigured && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <p className="font-semibold">ADMIN_TELEGRAM_IDS is missing or empty</p>
            <p className="text-[var(--afrinex-muted)]">
              Add your numeric Telegram user ID under Cloudflare Dashboard → Workers &amp; Pages →{' '}
              <span className="font-mono">afrinex</span> → Settings → Variables and Secrets (name{' '}
              <span className="font-mono">ADMIN_TELEGRAM_IDS</span>), or as a GitHub Repository
              Secret, then sign out and back in so Owner privileges apply.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[240px_1fr] items-start">
        {/* Desktop 240px Sidebar + Mobile Horizontal Tab Strip */}
        <aside className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 lg:sticky lg:top-18 space-y-3">
          <div className="px-2 pt-1 pb-2 border-b border-[var(--afrinex-border)] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[var(--afrinex-accent)]">
                AFRINEX Admin
              </p>
              <p className="text-xs font-semibold truncate">
                {user.firstName} · {formatRoleLabel(user.effectiveRole ?? (isOwner ? 'owner' : 'admin'))}
              </p>
            </div>
          </div>

          <nav
            aria-label="Admin sections"
            className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`min-h-[40px] flex items-center gap-2.5 rounded-xl px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 lg:w-full lg:text-left ${
                    active
                      ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                      : 'text-[var(--afrinex-muted)] hover:bg-black/5 dark:hover:bg-white/5 hover:text-[var(--afrinex-text)]'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {onSwitchToMemberView && (
            <div className="pt-2 border-t border-[var(--afrinex-border)]">
              <button
                type="button"
                onClick={onSwitchToMemberView}
                className="min-h-[40px] w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--afrinex-border)] px-3 text-xs font-medium text-[var(--afrinex-muted)] hover:border-[var(--afrinex-accent)] hover:text-[var(--afrinex-text)]"
              >
                <UserCheck className="h-3.5 w-3.5" />
                Switch to Member View
              </button>
            </div>
          )}
        </aside>

        {/* Active Admin Workspace Panel */}
        <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-6 space-y-5 min-w-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--afrinex-border)] pb-4">
            <div>
              <p className="text-xs font-medium text-[var(--afrinex-accent)]">
                Admin Dashboard
              </p>
              <h1 className="font-display text-xl font-bold tracking-tight sm:text-2xl">
                {currentNav.label}
              </h1>
            </div>

            <button
              type="button"
              onClick={() => void loadOverview()}
              className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--afrinex-border)] px-3.5 text-xs font-medium hover:border-[var(--afrinex-accent)] whitespace-nowrap self-start sm:self-auto"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingOverview ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {error && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{error}</p>
          )}

          {activeTab === 'overview' && (
            <AdminOverviewSection
              overview={overview}
              loading={loadingOverview}
              onSelectTab={(tab) => setActiveTab(tab as AdminTabId)}
            />
          )}

          {activeTab === 'users' && (
            <AdminUsersSection
              token={token}
              currentUser={user}
              onRefreshOverview={() => void loadOverview()}
            />
          )}

          {activeTab === 'learning' && (
            <AdminLearningSection
              token={token}
              onRefreshOverview={() => void loadOverview()}
            />
          )}

          {activeTab === 'tools' && (
            <AdminToolsSection
              token={token}
              onRefreshOverview={() => void loadOverview()}
            />
          )}

          {activeTab === 'opportunities' && (
            <AdminOpportunitiesSection
              token={token}
              onRefreshOverview={() => void loadOverview()}
            />
          )}

          {activeTab === 'ai' && (
            <AdminAiSection
              token={token}
              onConfigChanged={() => void refreshConfig()}
            />
          )}

          {activeTab === 'builders' && (
            <AdminBuildersSection
              token={token}
              onConfigChanged={() => void refreshConfig()}
            />
          )}

          {activeTab === 'billing' && (
            <AdminBillingSection
              token={token}
              onOpenSettings={() => setActiveTab('settings')}
            />
          )}

          {activeTab === 'announcements' && <AdminAnnouncementsSection token={token} />}

          {activeTab === 'settings' && (
            <AdminSettingsSection
              token={token}
              onSettingsUpdated={() => {
                void refreshConfig();
                void loadOverview();
              }}
            />
          )}

          {activeTab === 'roles-audit' && <AdminRolesAuditSection token={token} />}
        </section>
      </div>
    </div>
  );
}
