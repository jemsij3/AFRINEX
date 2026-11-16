import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  Star,
  Trash2,
} from 'lucide-react';
import type {
  AdminAiUsageResponse,
  AdminOverviewResponse,
  AdminPaginatedAuditLogsResponse,
  AdminPaginatedPaymentsResponse,
  AdminPaginatedSubscriptionsResponse,
  AdminPaginatedUsersResponse,
  AdminRevenueResponse,
  AiTool,
  AiToolCategory,
  AiToolPricing,
  Course,
  LearningTrack,
  Lesson,
  MembershipTier,
  Opportunity,
  OpportunityRegion,
  OpportunityType,
  UserRole,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';

type AdminTab =
  | 'users'
  | 'courses'
  | 'tools'
  | 'opportunities'
  | 'revenue'
  | 'ai_usage'
  | 'audit';

export function AdminConsole() {
  const { user, token } = useAuth();
  const [tab, setTab] = useState<AdminTab>('users');
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [tools, setTools] = useState<AiTool[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null);

  // Stage 7: Paginated Users
  const [usersPage, setUsersPage] = useState<number>(1);
  const [usersData, setUsersData] = useState<AdminPaginatedUsersResponse | null>(null);

  // Stage 7: Revenue, Payments, Subscriptions
  const [revenueData, setRevenueData] = useState<AdminRevenueResponse | null>(null);
  const [paymentsPage, setPaymentsPage] = useState<number>(1);
  const [paymentsData, setPaymentsData] = useState<AdminPaginatedPaymentsResponse | null>(null);
  const [subsPage, setSubsPage] = useState<number>(1);
  const [subsData, setSubsData] = useState<AdminPaginatedSubscriptionsResponse | null>(null);

  // Stage 7: AI Usage
  const [aiUsageData, setAiUsageData] = useState<AdminAiUsageResponse | null>(null);

  // Stage 7: Audit Logs
  const [auditPage, setAuditPage] = useState<number>(1);
  const [auditActionFilter, setAuditActionFilter] = useState<string>('');
  const [auditActorFilter, setAuditActorFilter] = useState<string>('');
  const [auditData, setAuditData] = useState<AdminPaginatedAuditLogsResponse | null>(null);

  // Course form + edit
  const [courseTitle, setCourseTitle] = useState('');
  const [courseSummary, setCourseSummary] = useState('');
  const [courseTrack, setCourseTrack] = useState<LearningTrack>('beginner');
  const [courseCategory, setCourseCategory] = useState('Artificial Intelligence');
  const [courseIsPro, setCourseIsPro] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);

  // Lesson form + management
  const [lessonCourseId, setLessonCourseId] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDuration, setLessonDuration] = useState('15');
  const [lessonSortOrder, setLessonSortOrder] = useState('1');
  const [lessonContentMd, setLessonContentMd] = useState('');
  const [selectedLessonsCourseId, setSelectedLessonsCourseId] = useState<string | null>(null);
  const [courseLessons, setCourseLessons] = useState<Lesson[]>([]);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);

  // Tool form + edit
  const [toolName, setToolName] = useState('');
  const [toolSummary, setToolSummary] = useState('');
  const [toolCategory, setToolCategory] = useState<AiToolCategory>('coding');
  const [toolUrl, setToolUrl] = useState('https://');
  const [toolPricing, setToolPricing] = useState<AiToolPricing>('freemium');
  const [editingTool, setEditingTool] = useState<AiTool | null>(null);

  // Opportunity form + edit
  const [oppTitle, setOppTitle] = useState('');
  const [oppOrg, setOppOrg] = useState('');
  const [oppSummary, setOppSummary] = useState('');
  const [oppType, setOppType] = useState<OpportunityType>('job');
  const [oppRegion, setOppRegion] = useState<OpportunityRegion>('africa');
  const [oppUrl, setOppUrl] = useState('https://');
  const [oppDeadline, setOppDeadline] = useState('');
  const [editingOpp, setEditingOpp] = useState<Opportunity | null>(null);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const [ovRes, usersRes, cRes, tRes, oRes] = await Promise.all([
      apiFetch<AdminOverviewResponse>('/api/admin/overview', undefined, token),
      apiFetch<AdminPaginatedUsersResponse>(
        `/api/admin/users?page=${usersPage}&per_page=20`,
        undefined,
        token
      ),
      apiFetch<{ courses: Course[] }>('/api/admin/courses', undefined, token),
      apiFetch<{ tools: AiTool[] }>('/api/admin/tools', undefined, token),
      apiFetch<{ opportunities: Opportunity[] }>('/api/admin/opportunities', undefined, token),
    ]);

    if (ovRes.ok && ovRes.data) {
      setOverview(ovRes.data);
    } else {
      setError(ovRes.error ?? 'Failed to load admin overview.');
    }
    if (usersRes.ok && usersRes.data) {
      setUsersData(usersRes.data);
    }
    if (cRes.ok && cRes.data) {
      setCourses(cRes.data.courses);
      setLessonCourseId((prev) =>
        prev && cRes.data!.courses.some((c) => c.id === prev)
          ? prev
          : (cRes.data!.courses[0]?.id ?? '')
      );
    }
    if (tRes.ok && tRes.data) setTools(tRes.data.tools);
    if (oRes.ok && oRes.data) setOpportunities(oRes.data.opportunities);

    setLoading(false);
  }, [token, usersPage]);

  const loadRevenueAndBilling = useCallback(async () => {
    if (!token) return;
    const [revRes, payRes, subRes] = await Promise.all([
      apiFetch<AdminRevenueResponse>('/api/admin/revenue', undefined, token),
      apiFetch<AdminPaginatedPaymentsResponse>(
        `/api/admin/payments?page=${paymentsPage}&per_page=20`,
        undefined,
        token
      ),
      apiFetch<AdminPaginatedSubscriptionsResponse>(
        `/api/admin/subscriptions?page=${subsPage}&per_page=20`,
        undefined,
        token
      ),
    ]);
    if (revRes.ok && revRes.data) setRevenueData(revRes.data);
    if (payRes.ok && payRes.data) setPaymentsData(payRes.data);
    if (subRes.ok && subRes.data) setSubsData(subRes.data);
  }, [token, paymentsPage, subsPage]);

  const loadAiUsage = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch<AdminAiUsageResponse>('/api/admin/ai-usage', undefined, token);
    if (res.ok && res.data) setAiUsageData(res.data);
  }, [token]);

  const loadAuditLogs = useCallback(async () => {
    if (!token) return;
    const params = new URLSearchParams({ page: String(auditPage), per_page: '25' });
    if (auditActionFilter.trim()) params.set('action', auditActionFilter.trim());
    if (auditActorFilter.trim()) params.set('actor_user_id', auditActorFilter.trim());
    const res = await apiFetch<AdminPaginatedAuditLogsResponse>(
      `/api/admin/audit-logs?${params.toString()}`,
      undefined,
      token
    );
    if (res.ok && res.data) setAuditData(res.data);
  }, [token, auditPage, auditActionFilter, auditActorFilter]);

  const loadCourseLessons = useCallback(
    async (courseId: string) => {
      if (!token) return;
      setSelectedLessonsCourseId(courseId);
      const res = await apiFetch<{ lessons: Lesson[] }>(
        `/api/admin/courses/${courseId}/lessons`,
        undefined,
        token
      );
      if (res.ok && res.data) {
        setCourseLessons(res.data.lessons);
      }
    },
    [token]
  );

  useEffect(() => {
    if (user?.role === 'admin') {
      void loadAll();
    } else {
      setLoading(false);
    }
  }, [user?.role, loadAll]);

  useEffect(() => {
    if (user?.role !== 'admin') return;
    if (tab === 'revenue') void loadRevenueAndBilling();
    if (tab === 'ai_usage') void loadAiUsage();
    if (tab === 'audit') void loadAuditLogs();
  }, [user?.role, tab, loadRevenueAndBilling, loadAiUsage, loadAuditLogs]);

  const handleUpdateUser = async (
    targetId: string,
    updates: { role?: UserRole; tier?: MembershipTier }
  ) => {
    setUpdatingUserId(targetId);
    setError(null);
    const result = await apiFetch(
      `/api/admin/users/${targetId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(updates),
      },
      token
    );
    if (result.ok) {
      await loadAll();
    } else {
      setError(result.error ?? 'Failed to update user.');
    }
    setUpdatingUserId(null);
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await apiFetch(
      '/api/admin/courses',
      {
        method: 'POST',
        body: JSON.stringify({
          title: courseTitle,
          summary: courseSummary,
          track: courseTrack,
          category: courseCategory,
          isPro: courseIsPro,
        }),
      },
      token
    );
    if (res.ok) {
      setCourseTitle('');
      setCourseSummary('');
      setCourseIsPro(false);
      await loadAll();
    } else {
      setError(res.error ?? 'Failed to create course.');
    }
  };

  const handleSaveCourseEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCourse) return;
    setError(null);
    const res = await apiFetch(
      `/api/admin/courses/${editingCourse.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          title: editingCourse.title,
          summary: editingCourse.summary,
          track: editingCourse.track,
          category: editingCourse.category,
          isPro: editingCourse.isPro,
        }),
      },
      token
    );
    if (res.ok) {
      setEditingCourse(null);
      await loadAll();
    } else {
      setError(res.error ?? 'Failed to update course.');
    }
  };

  const handleCreateLesson = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lessonCourseId) return;
    setError(null);
    const res = await apiFetch(
      '/api/admin/lessons',
      {
        method: 'POST',
        body: JSON.stringify({
          courseId: lessonCourseId,
          title: lessonTitle,
          contentMd: lessonContentMd,
          durationMins: Number(lessonDuration) || 15,
          sortOrder: Number(lessonSortOrder) || 1,
        }),
      },
      token
    );
    if (res.ok) {
      setLessonTitle('');
      setLessonContentMd('');
      await loadAll();
      if (selectedLessonsCourseId === lessonCourseId) {
        await loadCourseLessons(lessonCourseId);
      }
    } else {
      setError(res.error ?? 'Failed to create lesson.');
    }
  };

  const handleSaveLessonEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLesson) return;
    setError(null);
    const res = await apiFetch(
      `/api/admin/lessons/${editingLesson.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          title: editingLesson.title,
          contentMd: editingLesson.contentMd,
          durationMins: editingLesson.durationMins,
          sortOrder: editingLesson.sortOrder,
        }),
      },
      token
    );
    if (res.ok) {
      const cId = editingLesson.courseId;
      setEditingLesson(null);
      await loadCourseLessons(cId);
    } else {
      setError(res.error ?? 'Failed to update lesson.');
    }
  };

  const handleCreateTool = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await apiFetch(
      '/api/admin/tools',
      {
        method: 'POST',
        body: JSON.stringify({
          name: toolName,
          summary: toolSummary,
          category: toolCategory,
          url: toolUrl,
          pricingModel: toolPricing,
          featured: false,
        }),
      },
      token
    );
    if (res.ok) {
      setToolName('');
      setToolSummary('');
      setToolUrl('https://');
      await loadAll();
    } else {
      setError(res.error ?? 'Failed to create AI tool.');
    }
  };

  const handleSaveToolEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTool) return;
    setError(null);
    const res = await apiFetch(
      `/api/admin/tools/${editingTool.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          name: editingTool.name,
          summary: editingTool.summary,
          category: editingTool.category,
          url: editingTool.url,
          pricingModel: editingTool.pricingModel,
        }),
      },
      token
    );
    if (res.ok) {
      setEditingTool(null);
      await loadAll();
    } else {
      setError(res.error ?? 'Failed to update tool.');
    }
  };

  const handleCreateOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = await apiFetch(
      '/api/admin/opportunities',
      {
        method: 'POST',
        body: JSON.stringify({
          title: oppTitle,
          organization: oppOrg,
          summary: oppSummary,
          opportunityType: oppType,
          region: oppRegion,
          url: oppUrl,
          deadline: oppDeadline || undefined,
        }),
      },
      token
    );
    if (res.ok) {
      setOppTitle('');
      setOppOrg('');
      setOppSummary('');
      setOppUrl('https://');
      setOppDeadline('');
      await loadAll();
    } else {
      setError(res.error ?? 'Failed to create opportunity.');
    }
  };

  const handleSaveOppEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOpp) return;
    setError(null);
    const res = await apiFetch(
      `/api/admin/opportunities/${editingOpp.id}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          title: editingOpp.title,
          organization: editingOpp.organization,
          summary: editingOpp.summary,
          opportunityType: editingOpp.opportunityType,
          region: editingOpp.region,
          url: editingOpp.url,
          deadline: editingOpp.deadline ?? null,
        }),
      },
      token
    );
    if (res.ok) {
      setEditingOpp(null);
      await loadAll();
    } else {
      setError(res.error ?? 'Failed to update opportunity.');
    }
  };

  const handlePatchToggle = async (path: string, body?: Record<string, unknown>) => {
    setError(null);
    const res = await apiFetch(
      path,
      {
        method: 'PATCH',
        body: body ? JSON.stringify(body) : JSON.stringify({}),
      },
      token
    );
    if (res.ok) {
      await loadAll();
      if (selectedLessonsCourseId) {
        await loadCourseLessons(selectedLessonsCourseId);
      }
    } else {
      setError(res.error ?? 'Failed to update status.');
    }
  };

  const handleDeleteItem = async (path: string) => {
    setError(null);
    const res = await apiFetch(path, { method: 'DELETE' }, token);
    if (res.ok) {
      await loadAll();
      if (selectedLessonsCourseId) {
        await loadCourseLessons(selectedLessonsCourseId);
      }
    } else {
      setError(res.error ?? 'Failed to delete item.');
    }
  };

  if (!user || user.role !== 'admin') {
    return (
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-3">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
          <ShieldAlert className="h-5 w-5" />
          <h1 className="font-display text-lg font-semibold">Admin Access Required</h1>
        </div>
        <p className="text-sm text-[var(--afrinex-muted)]">
          Only accounts with administrator permissions can access the AFRINEX Admin Dashboard.
        </p>
      </section>
    );
  }

  const maxMonthlyAmount = Math.max(
    1,
    ...(revenueData?.monthly_revenue.map((m) => m.amount) ?? [0])
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-8 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--afrinex-accent)]">
              Protected RBAC Console
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              AFRINEX Admin Dashboard
            </h1>
          </div>

          <button
            type="button"
            onClick={() => {
              void loadAll();
              if (tab === 'revenue') void loadRevenueAndBilling();
              if (tab === 'ai_usage') void loadAiUsage();
              if (tab === 'audit') void loadAuditLogs();
            }}
            disabled={loading}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] px-4 text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Data
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {(
            [
              ['users', 'Users'],
              ['courses', 'Courses & Lessons'],
              ['tools', 'AI Tools'],
              ['opportunities', 'Opportunities'],
              ['revenue', 'Revenue & Billing'],
              ['ai_usage', 'AI Usage'],
              ['audit', 'Audit Logs'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`min-h-[40px] rounded-xl px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                tab === id
                  ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                  : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm font-medium text-amber-700 dark:text-amber-400">{error}</p>
        )}

        {overview && (
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {[
              ['Users', overview.counts.users],
              ['Courses', overview.counts.courses],
              ['Lessons', overview.counts.lessons],
              ['AI Tools', overview.counts.aiTools],
              ['Opportunities', overview.counts.opportunities],
              ['Builders', overview.counts.builderProjects],
              ['Payments', overview.counts.payments],
            ].map(([label, count]) => (
              <div
                key={label}
                className="rounded-xl border border-[var(--afrinex-border)] p-3.5"
              >
                <dt className="text-xs text-[var(--afrinex-muted)]">{label}</dt>
                <dd className="mt-1 font-display text-xl font-bold tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>
        )}

        {tab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold">
                Registered Users ({usersData?.total ?? overview?.users.length ?? 0})
              </h2>
              {usersData && usersData.total_pages > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    disabled={usersPage <= 1}
                    onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="font-mono tabular-nums">
                    Page {usersData.page} / {usersData.total_pages}
                  </span>
                  <button
                    type="button"
                    disabled={usersPage >= usersData.total_pages}
                    onClick={() => setUsersPage((p) => Math.min(usersData.total_pages, p + 1))}
                    className="min-h-[34px] min-w-[34px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {!usersData || usersData.users.length === 0 ? (
              <p className="text-sm text-[var(--afrinex-muted)]">No registered users yet.</p>
            ) : (
              <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                {usersData.users.map((member) => {
                  const isSelf = member.id === user.id;
                  const busy = updatingUserId === member.id;
                  return (
                    <div
                      key={member.id}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {member.firstName}
                          {member.lastName ? ` ${member.lastName}` : ''}
                          {isSelf ? ' (You)' : ''}
                        </p>
                        <p className="text-xs text-[var(--afrinex-muted)] font-mono truncate">
                          {member.id} · tg:{member.telegramId} ·{' '}
                          {member.username ? `@${member.username}` : 'no-handle'}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void handleUpdateUser(member.id, {
                              tier: member.tier === 'pro' ? 'free' : 'pro',
                            })
                          }
                          className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          Tier: {member.tier.toUpperCase()}
                        </button>
                        <button
                          type="button"
                          disabled={busy || isSelf}
                          onClick={() =>
                            void handleUpdateUser(member.id, {
                              role: member.role === 'admin' ? 'member' : 'admin',
                            })
                          }
                          className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap disabled:opacity-50"
                        >
                          Role: {member.role}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'courses' && (
          <div className="space-y-6">
            <form
              onSubmit={(e) => void handleCreateCourse(e)}
              className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3"
            >
              <h2 className="font-display text-sm font-semibold">Add New Course</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  required
                  value={courseTitle}
                  onChange={(e) => setCourseTitle(e.target.value)}
                  placeholder="Course title"
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                />
                <input
                  required
                  value={courseCategory}
                  onChange={(e) => setCourseCategory(e.target.value)}
                  placeholder="Category"
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                />
                <select
                  value={courseTrack}
                  onChange={(e) => setCourseTrack(e.target.value as LearningTrack)}
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={courseIsPro}
                    onChange={(e) => setCourseIsPro(e.target.checked)}
                  />
                  AFRINEX Pro Only
                </label>
              </div>
              <textarea
                required
                rows={2}
                value={courseSummary}
                onChange={(e) => setCourseSummary(e.target.value)}
                placeholder="Concise course summary..."
                className="w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-sm"
              />
              <button
                type="submit"
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)]"
              >
                <Plus className="h-4 w-4" />
                Create Course
              </button>
            </form>

            {editingCourse && (
              <form
                onSubmit={(e) => void handleSaveCourseEdit(e)}
                className="rounded-xl border border-[var(--afrinex-accent)] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold">
                    Edit Course: {editingCourse.title}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setEditingCourse(null)}
                    className="text-xs text-[var(--afrinex-muted)]"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    required
                    value={editingCourse.title}
                    onChange={(e) =>
                      setEditingCourse({ ...editingCourse, title: e.target.value })
                    }
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <input
                    required
                    value={editingCourse.category}
                    onChange={(e) =>
                      setEditingCourse({ ...editingCourse, category: e.target.value })
                    }
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <select
                    value={editingCourse.track}
                    onChange={(e) =>
                      setEditingCourse({
                        ...editingCourse,
                        track: e.target.value as LearningTrack,
                      })
                    }
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={editingCourse.isPro}
                      onChange={(e) =>
                        setEditingCourse({ ...editingCourse, isPro: e.target.checked })
                      }
                    />
                    AFRINEX Pro Only
                  </label>
                </div>
                <textarea
                  required
                  rows={2}
                  value={editingCourse.summary}
                  onChange={(e) =>
                    setEditingCourse({ ...editingCourse, summary: e.target.value })
                  }
                  className="w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-sm"
                />
                <button
                  type="submit"
                  className="min-h-[40px] rounded-lg bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)]"
                >
                  Save Course Changes
                </button>
              </form>
            )}

            {courses.length > 0 && (
              <form
                onSubmit={(e) => void handleCreateLesson(e)}
                className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3"
              >
                <h2 className="font-display text-sm font-semibold">Add Lesson to Course</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <select
                    required
                    value={lessonCourseId}
                    onChange={(e) => setLessonCourseId(e.target.value)}
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  >
                    {courses.map((cItem) => (
                      <option key={cItem.id} value={cItem.id}>
                        {cItem.title}
                      </option>
                    ))}
                  </select>
                  <input
                    required
                    minLength={3}
                    value={lessonTitle}
                    onChange={(e) => setLessonTitle(e.target.value)}
                    placeholder="Lesson title"
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <input
                    required
                    type="number"
                    min={1}
                    max={240}
                    value={lessonDuration}
                    onChange={(e) => setLessonDuration(e.target.value)}
                    placeholder="Duration (minutes)"
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <input
                    required
                    type="number"
                    min={1}
                    max={500}
                    value={lessonSortOrder}
                    onChange={(e) => setLessonSortOrder(e.target.value)}
                    placeholder="Lesson order"
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                </div>
                <textarea
                  required
                  minLength={10}
                  rows={3}
                  value={lessonContentMd}
                  onChange={(e) => setLessonContentMd(e.target.value)}
                  placeholder="Lesson content (Markdown supported)..."
                  className="w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-sm"
                />
                <button
                  type="submit"
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)]"
                >
                  <Plus className="h-4 w-4" />
                  Add Lesson
                </button>
              </form>
            )}

            {courses.length === 0 ? (
              <p className="text-sm text-[var(--afrinex-muted)]">No courses created yet.</p>
            ) : (
              <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                {courses.map((cItem) => (
                  <div key={cItem.id} className="p-4 space-y-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {cItem.title}{' '}
                          {!cItem.published && (
                            <span className="ml-1 text-xs text-amber-600">(Unpublished)</span>
                          )}
                        </p>
                        <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                          {cItem.track} · {cItem.category} · {cItem.lessonCount} lessons
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void loadCourseLessons(cItem.id)}
                          className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
                        >
                          Lessons
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handlePatchToggle(`/api/admin/courses/${cItem.id}/publish`)
                          }
                          className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs hover:border-[var(--afrinex-accent)]"
                        >
                          {cItem.published ? (
                            <>
                              <EyeOff className="h-3.5 w-3.5" />
                              Unpublish
                            </>
                          ) : (
                            <>
                              <Eye className="h-3.5 w-3.5" />
                              Publish
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          aria-label={`Edit ${cItem.title}`}
                          onClick={() => setEditingCourse(cItem)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-accent)]"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${cItem.title}`}
                          onClick={() => void handleDeleteItem(`/api/admin/courses/${cItem.id}`)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-600"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {selectedLessonsCourseId === cItem.id && (
                      <div className="rounded-xl border border-[var(--afrinex-border)] p-3 space-y-2 bg-[var(--afrinex-bg)]">
                        <div className="flex items-center justify-between text-xs font-semibold">
                          <span>Lessons ({courseLessons.length})</span>
                          <button
                            type="button"
                            onClick={() => setSelectedLessonsCourseId(null)}
                            className="text-[var(--afrinex-muted)]"
                          >
                            Close
                          </button>
                        </div>

                        {editingLesson && editingLesson.courseId === cItem.id && (
                          <form
                            onSubmit={(e) => void handleSaveLessonEdit(e)}
                            className="rounded-lg border border-[var(--afrinex-accent)] p-3 space-y-2"
                          >
                            <input
                              required
                              value={editingLesson.title}
                              onChange={(e) =>
                                setEditingLesson({ ...editingLesson, title: e.target.value })
                              }
                              className="min-h-[36px] w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-xs"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <input
                                required
                                type="number"
                                min={1}
                                value={editingLesson.durationMins}
                                onChange={(e) =>
                                  setEditingLesson({
                                    ...editingLesson,
                                    durationMins: Number(e.target.value) || 10,
                                  })
                                }
                                className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-xs"
                              />
                              <input
                                required
                                type="number"
                                min={1}
                                value={editingLesson.sortOrder}
                                onChange={(e) =>
                                  setEditingLesson({
                                    ...editingLesson,
                                    sortOrder: Number(e.target.value) || 1,
                                  })
                                }
                                className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-xs"
                              />
                            </div>
                            <textarea
                              required
                              rows={3}
                              value={editingLesson.contentMd}
                              onChange={(e) =>
                                setEditingLesson({
                                  ...editingLesson,
                                  contentMd: e.target.value,
                                })
                              }
                              className="w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-2.5 text-xs"
                            />
                            <div className="flex gap-2">
                              <button
                                type="submit"
                                className="min-h-[34px] rounded-lg bg-[var(--afrinex-accent)] px-3 text-xs font-medium text-[var(--afrinex-accent-text)]"
                              >
                                Save Lesson
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingLesson(null)}
                                className="min-h-[34px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        )}

                        {courseLessons.length === 0 ? (
                          <p className="text-xs text-[var(--afrinex-muted)]">No lessons yet.</p>
                        ) : (
                          courseLessons.map((lesson) => (
                            <div
                              key={lesson.id}
                              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-2.5 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {lesson.sortOrder}. {lesson.title}{' '}
                                  {lesson.published === false && (
                                    <span className="text-amber-600">(Unpublished)</span>
                                  )}
                                </p>
                                <p className="text-[var(--afrinex-muted)] tabular-nums">
                                  {lesson.durationMins} min
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handlePatchToggle(
                                      `/api/admin/lessons/${lesson.id}/publish`
                                    )
                                  }
                                  className="min-h-[32px] rounded-lg border border-[var(--afrinex-border)] px-2 text-[11px]"
                                >
                                  {lesson.published === false ? 'Publish' : 'Unpublish'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEditingLesson(lesson)}
                                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-accent)]"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDeleteItem(`/api/admin/lessons/${lesson.id}`)
                                  }
                                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'tools' && (
          <div className="space-y-6">
            <form
              onSubmit={(e) => void handleCreateTool(e)}
              className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3"
            >
              <h2 className="font-display text-sm font-semibold">Add AI Tool</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  required
                  value={toolName}
                  onChange={(e) => setToolName(e.target.value)}
                  placeholder="Tool name"
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                />
                <input
                  required
                  type="url"
                  value={toolUrl}
                  onChange={(e) => setToolUrl(e.target.value)}
                  placeholder="https://..."
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                />
                <select
                  value={toolCategory}
                  onChange={(e) => setToolCategory(e.target.value as AiToolCategory)}
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                >
                  <option value="writing">Writing</option>
                  <option value="coding">Coding</option>
                  <option value="design">Design</option>
                  <option value="productivity">Productivity</option>
                  <option value="business">Business</option>
                </select>
                <select
                  value={toolPricing}
                  onChange={(e) => setToolPricing(e.target.value as AiToolPricing)}
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                >
                  <option value="free">Free</option>
                  <option value="freemium">Freemium</option>
                  <option value="paid">Paid</option>
                  <option value="open-source">Open Source</option>
                </select>
              </div>
              <textarea
                required
                rows={2}
                value={toolSummary}
                onChange={(e) => setToolSummary(e.target.value)}
                placeholder="What does this tool help users do?"
                className="w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-sm"
              />
              <button
                type="submit"
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)]"
              >
                <Plus className="h-4 w-4" />
                Add Tool
              </button>
            </form>

            {editingTool && (
              <form
                onSubmit={(e) => void handleSaveToolEdit(e)}
                className="rounded-xl border border-[var(--afrinex-accent)] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold">
                    Edit Tool: {editingTool.name}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setEditingTool(null)}
                    className="text-xs text-[var(--afrinex-muted)]"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    required
                    value={editingTool.name}
                    onChange={(e) => setEditingTool({ ...editingTool, name: e.target.value })}
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <input
                    required
                    type="url"
                    value={editingTool.url}
                    onChange={(e) => setEditingTool({ ...editingTool, url: e.target.value })}
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <select
                    value={editingTool.category}
                    onChange={(e) =>
                      setEditingTool({
                        ...editingTool,
                        category: e.target.value as AiToolCategory,
                      })
                    }
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  >
                    <option value="writing">Writing</option>
                    <option value="coding">Coding</option>
                    <option value="design">Design</option>
                    <option value="productivity">Productivity</option>
                    <option value="business">Business</option>
                  </select>
                  <select
                    value={editingTool.pricingModel}
                    onChange={(e) =>
                      setEditingTool({
                        ...editingTool,
                        pricingModel: e.target.value as AiToolPricing,
                      })
                    }
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  >
                    <option value="free">Free</option>
                    <option value="freemium">Freemium</option>
                    <option value="paid">Paid</option>
                    <option value="open-source">Open Source</option>
                  </select>
                </div>
                <textarea
                  required
                  rows={2}
                  value={editingTool.summary}
                  onChange={(e) =>
                    setEditingTool({ ...editingTool, summary: e.target.value })
                  }
                  className="w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-sm"
                />
                <button
                  type="submit"
                  className="min-h-[40px] rounded-lg bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)]"
                >
                  Save Tool Changes
                </button>
              </form>
            )}

            {tools.length === 0 ? (
              <p className="text-sm text-[var(--afrinex-muted)]">No AI tools added yet.</p>
            ) : (
              <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                {tools.map((tItem) => (
                  <div
                    key={tItem.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {tItem.name}
                        {tItem.featured && (
                          <span className="ml-2 text-xs text-[var(--afrinex-accent)]">
                            · Featured
                          </span>
                        )}
                        {!tItem.published && (
                          <span className="ml-2 text-xs text-amber-600">(Unpublished)</span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                        {tItem.category} · {tItem.pricingModel}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          void handlePatchToggle(`/api/admin/tools/${tItem.id}/feature`)
                        }
                        className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs hover:border-[var(--afrinex-accent)]"
                      >
                        <Star className="h-3.5 w-3.5" />
                        {tItem.featured ? 'Unfeature' : 'Feature'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void handlePatchToggle(`/api/admin/tools/${tItem.id}/publish`)
                        }
                        className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs hover:border-[var(--afrinex-accent)]"
                      >
                        {tItem.published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${tItem.name}`}
                        onClick={() => setEditingTool(tItem)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-accent)]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${tItem.name}`}
                        onClick={() => void handleDeleteItem(`/api/admin/tools/${tItem.id}`)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'opportunities' && (
          <div className="space-y-6">
            <form
              onSubmit={(e) => void handleCreateOpportunity(e)}
              className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3"
            >
              <h2 className="font-display text-sm font-semibold">Post Opportunity</h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  required
                  value={oppTitle}
                  onChange={(e) => setOppTitle(e.target.value)}
                  placeholder="Opportunity title"
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                />
                <input
                  required
                  value={oppOrg}
                  onChange={(e) => setOppOrg(e.target.value)}
                  placeholder="Organization"
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                />
                <select
                  value={oppType}
                  onChange={(e) => setOppType(e.target.value as OpportunityType)}
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                >
                  <option value="job">Job</option>
                  <option value="freelance">Freelance</option>
                  <option value="scholarship">Scholarship</option>
                  <option value="grant">Grant</option>
                  <option value="event">Event</option>
                  <option value="startup">Startup</option>
                  <option value="programs">Programs</option>
                </select>
                <select
                  value={oppRegion}
                  onChange={(e) => setOppRegion(e.target.value as OpportunityRegion)}
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                >
                  <option value="africa">Africa</option>
                  <option value="remote">Remote</option>
                  <option value="global">Global</option>
                </select>
                <input
                  required
                  type="url"
                  value={oppUrl}
                  onChange={(e) => setOppUrl(e.target.value)}
                  placeholder="https://..."
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                />
                <input
                  value={oppDeadline}
                  onChange={(e) => setOppDeadline(e.target.value)}
                  placeholder="Deadline (YYYY-MM-DD, optional)"
                  className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                />
              </div>
              <textarea
                required
                rows={2}
                value={oppSummary}
                onChange={(e) => setOppSummary(e.target.value)}
                placeholder="Brief summary and eligibility..."
                className="w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-sm"
              />
              <button
                type="submit"
                className="min-h-[40px] inline-flex items-center gap-1.5 rounded-lg bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)]"
              >
                <Plus className="h-4 w-4" />
                Publish Opportunity
              </button>
            </form>

            {editingOpp && (
              <form
                onSubmit={(e) => void handleSaveOppEdit(e)}
                className="rounded-xl border border-[var(--afrinex-accent)] p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold">
                    Edit Opportunity: {editingOpp.title}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setEditingOpp(null)}
                    className="text-xs text-[var(--afrinex-muted)]"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    required
                    value={editingOpp.title}
                    onChange={(e) => setEditingOpp({ ...editingOpp, title: e.target.value })}
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <input
                    required
                    value={editingOpp.organization}
                    onChange={(e) =>
                      setEditingOpp({ ...editingOpp, organization: e.target.value })
                    }
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <select
                    value={editingOpp.opportunityType}
                    onChange={(e) =>
                      setEditingOpp({
                        ...editingOpp,
                        opportunityType: e.target.value as OpportunityType,
                      })
                    }
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  >
                    <option value="job">Job</option>
                    <option value="freelance">Freelance</option>
                    <option value="scholarship">Scholarship</option>
                    <option value="grant">Grant</option>
                    <option value="event">Event</option>
                    <option value="startup">Startup</option>
                    <option value="programs">Programs</option>
                  </select>
                  <select
                    value={editingOpp.region}
                    onChange={(e) =>
                      setEditingOpp({
                        ...editingOpp,
                        region: e.target.value as OpportunityRegion,
                      })
                    }
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  >
                    <option value="africa">Africa</option>
                    <option value="remote">Remote</option>
                    <option value="global">Global</option>
                  </select>
                  <input
                    required
                    type="url"
                    value={editingOpp.url}
                    onChange={(e) => setEditingOpp({ ...editingOpp, url: e.target.value })}
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                  <input
                    value={editingOpp.deadline ?? ''}
                    onChange={(e) =>
                      setEditingOpp({ ...editingOpp, deadline: e.target.value || null })
                    }
                    placeholder="Deadline (YYYY-MM-DD)"
                    className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                  />
                </div>
                <textarea
                  required
                  rows={2}
                  value={editingOpp.summary}
                  onChange={(e) => setEditingOpp({ ...editingOpp, summary: e.target.value })}
                  className="w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-sm"
                />
                <button
                  type="submit"
                  className="min-h-[40px] rounded-lg bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)]"
                >
                  Save Opportunity Changes
                </button>
              </form>
            )}

            {opportunities.length === 0 ? (
              <p className="text-sm text-[var(--afrinex-muted)]">
                No opportunities added yet.
              </p>
            ) : (
              <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                {opportunities.map((oItem) => (
                  <div
                    key={oItem.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {oItem.title}
                        {!oItem.published && (
                          <span className="ml-2 text-xs text-amber-600">(Unpublished)</span>
                        )}
                      </p>
                      <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                        {oItem.organization} · {oItem.opportunityType} · {oItem.region}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          void handlePatchToggle(`/api/admin/opportunities/${oItem.id}/publish`)
                        }
                        className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs hover:border-[var(--afrinex-accent)]"
                      >
                        {oItem.published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        type="button"
                        aria-label={`Edit ${oItem.title}`}
                        onClick={() => setEditingOpp(oItem)}
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-accent)]"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${oItem.title}`}
                        onClick={() =>
                          void handleDeleteItem(`/api/admin/opportunities/${oItem.id}`)
                        }
                        className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'revenue' && (
          <div className="space-y-6">
            {revenueData ? (
              <>
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4">
                    <dt className="text-xs text-[var(--afrinex-muted)]">Total Revenue</dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {revenueData.total_revenue} XTR
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4">
                    <dt className="text-xs text-[var(--afrinex-muted)]">
                      Active Subscriptions
                    </dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {revenueData.active_subscriptions}
                    </dd>
                  </div>
                  <div className="rounded-xl border border-[var(--afrinex-border)] p-4">
                    <dt className="text-xs text-[var(--afrinex-muted)]">Completed Payments</dt>
                    <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                      {revenueData.total_payments}
                    </dd>
                  </div>
                </dl>

                <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
                  <h2 className="font-display text-sm font-semibold">Monthly Stars Revenue</h2>
                  {revenueData.monthly_revenue.length === 0 ? (
                    <p className="text-sm text-[var(--afrinex-muted)]">
                      No completed Telegram Stars revenue recorded yet.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {revenueData.monthly_revenue.map((entry) => (
                        <div key={entry.month} className="space-y-1">
                          <div className="flex items-center justify-between text-xs font-mono tabular-nums">
                            <span>{entry.month}</span>
                            <span>{entry.amount} XTR</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                            <div
                              className="h-full bg-[var(--afrinex-accent)]"
                              style={{
                                width: `${Math.max(4, Math.round((entry.amount / maxMonthlyAmount) * 100))}%`,
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--afrinex-muted)]">Loading revenue metrics...</p>
            )}

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">
                  Payment History ({paymentsData?.total ?? 0})
                </h2>
                {paymentsData && paymentsData.total_pages > 1 && (
                  <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                    <button
                      type="button"
                      disabled={paymentsPage <= 1}
                      onClick={() => setPaymentsPage((p) => Math.max(1, p - 1))}
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span>
                      {paymentsData.page} / {paymentsData.total_pages}
                    </span>
                    <button
                      type="button"
                      disabled={paymentsPage >= paymentsData.total_pages}
                      onClick={() =>
                        setPaymentsPage((p) => Math.min(paymentsData.total_pages, p + 1))
                      }
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {!paymentsData || paymentsData.payments.length === 0 ? (
                <p className="text-sm text-[var(--afrinex-muted)]">No payments recorded yet.</p>
              ) : (
                <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                  {paymentsData.payments.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col gap-1 p-3.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <span className="font-medium">
                          {p.firstName}
                          {p.username ? ` (@${p.username})` : ''}
                        </span>
                        <span className="mx-2 text-[var(--afrinex-muted)]">·</span>
                        <span className="font-mono">{p.plan}</span>
                        <span className="mx-2 text-[var(--afrinex-muted)]">·</span>
                        <span className="font-mono text-[var(--afrinex-muted)]">
                          {p.telegramPaymentChargeId}
                        </span>
                      </div>
                      <span className="font-mono font-medium tabular-nums">
                        {p.amount} {p.currency} ({p.status}) · {p.createdAt.slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-base font-semibold">
                  Subscriptions ({subsData?.total ?? 0})
                </h2>
                {subsData && subsData.total_pages > 1 && (
                  <div className="flex items-center gap-2 text-xs font-mono tabular-nums">
                    <button
                      type="button"
                      disabled={subsPage <= 1}
                      onClick={() => setSubsPage((p) => Math.max(1, p - 1))}
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] disabled:opacity-40"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span>
                      {subsData.page} / {subsData.total_pages}
                    </span>
                    <button
                      type="button"
                      disabled={subsPage >= subsData.total_pages}
                      onClick={() => setSubsPage((p) => Math.min(subsData.total_pages, p + 1))}
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] disabled:opacity-40"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>

              {!subsData || subsData.subscriptions.length === 0 ? (
                <p className="text-sm text-[var(--afrinex-muted)]">
                  No subscriptions recorded yet.
                </p>
              ) : (
                <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                  {subsData.subscriptions.map((sub) => (
                    <div
                      key={sub.id}
                      className="flex flex-col gap-1 p-3.5 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <span className="font-medium">
                          {sub.firstName}
                          {sub.username ? ` (@${sub.username})` : ''}
                        </span>
                        <span className="mx-2 text-[var(--afrinex-muted)]">·</span>
                        <span className="font-mono">{sub.plan}</span>
                      </div>
                      <span className="font-mono text-[var(--afrinex-muted)] tabular-nums">
                        {sub.status} · expires {sub.expiresAt.slice(0, 10)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'ai_usage' && (
          <div className="space-y-4">
            <h2 className="font-display text-base font-semibold">Platform AI Usage Metrics</h2>
            {aiUsageData ? (
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--afrinex-border)] p-4">
                  <dt className="text-xs text-[var(--afrinex-muted)]">Total AI Messages</dt>
                  <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                    {aiUsageData.total_messages}
                  </dd>
                </div>
                <div className="rounded-xl border border-[var(--afrinex-border)] p-4">
                  <dt className="text-xs text-[var(--afrinex-muted)]">Daily Average</dt>
                  <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                    {aiUsageData.daily_average}
                  </dd>
                </div>
                <div className="rounded-xl border border-[var(--afrinex-border)] p-4">
                  <dt className="text-xs text-[var(--afrinex-muted)]">Active AI Users</dt>
                  <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
                    {aiUsageData.active_users}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-[var(--afrinex-muted)]">Loading AI usage...</p>
            )}
          </div>
        )}

        {tab === 'audit' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="font-display text-base font-semibold">
                Security Audit Log ({auditData?.total ?? 0})
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={auditActionFilter}
                  onChange={(e) => {
                    setAuditActionFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  placeholder="Filter by action..."
                  className="min-h-[38px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
                />
                <input
                  value={auditActorFilter}
                  onChange={(e) => {
                    setAuditActorFilter(e.target.value);
                    setAuditPage(1);
                  }}
                  placeholder="Actor user ID..."
                  className="min-h-[38px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
                />
              </div>
            </div>

            {!auditData || auditData.audit_logs.length === 0 ? (
              <p className="text-sm text-[var(--afrinex-muted)]">
                No audit activity matches your filter.
              </p>
            ) : (
              <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                {auditData.audit_logs.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="text-xs min-w-0">
                      <span className="font-mono font-medium">{entry.action}</span>
                      <span className="mx-2 text-[var(--afrinex-muted)]">·</span>
                      <span className="text-[var(--afrinex-muted)]">
                        {entry.targetType ?? 'system'} {entry.targetId ?? ''}
                      </span>
                      {entry.actorUserId && (
                        <>
                          <span className="mx-2 text-[var(--afrinex-muted)]">·</span>
                          <span className="font-mono text-[var(--afrinex-muted)]">
                            actor:{entry.actorUserId}
                          </span>
                        </>
                      )}
                    </div>
                    <span className="font-mono text-[11px] text-[var(--afrinex-muted)] tabular-nums shrink-0">
                      {entry.createdAt}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {auditData && auditData.total_pages > 1 && (
              <div className="flex items-center justify-end gap-2 text-xs font-mono tabular-nums">
                <button
                  type="button"
                  disabled={auditPage <= 1}
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span>
                  Page {auditData.page} / {auditData.total_pages}
                </span>
                <button
                  type="button"
                  disabled={auditPage >= auditData.total_pages}
                  onClick={() => setAuditPage((p) => Math.min(auditData.total_pages, p + 1))}
                  className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
