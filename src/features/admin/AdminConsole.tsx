import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, ShieldAlert, Trash2 } from 'lucide-react';
import type {
  AdminOverviewResponse,
  AiTool,
  AiToolCategory,
  AiToolPricing,
  Course,
  LearningTrack,
  MembershipTier,
  Opportunity,
  OpportunityRegion,
  OpportunityType,
  UserRole,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';

type AdminTab = 'users' | 'courses' | 'tools' | 'opportunities';

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

  // Course form
  const [courseTitle, setCourseTitle] = useState('');
  const [courseSummary, setCourseSummary] = useState('');
  const [courseTrack, setCourseTrack] = useState<LearningTrack>('beginner');
  const [courseCategory, setCourseCategory] = useState('Artificial Intelligence');
  const [courseIsPro, setCourseIsPro] = useState(false);

  // Tool form
  const [toolName, setToolName] = useState('');
  const [toolSummary, setToolSummary] = useState('');
  const [toolCategory, setToolCategory] = useState<AiToolCategory>('coding');
  const [toolUrl, setToolUrl] = useState('https://');
  const [toolPricing, setToolPricing] = useState<AiToolPricing>('freemium');

  // Opportunity form
  const [oppTitle, setOppTitle] = useState('');
  const [oppOrg, setOppOrg] = useState('');
  const [oppSummary, setOppSummary] = useState('');
  const [oppType, setOppType] = useState<OpportunityType>('job');
  const [oppRegion, setOppRegion] = useState<OpportunityRegion>('africa');
  const [oppUrl, setOppUrl] = useState('https://');
  const [oppDeadline, setOppDeadline] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [ovRes, cRes, tRes, oRes] = await Promise.all([
      apiFetch<AdminOverviewResponse>('/api/admin/overview', undefined, token),
      apiFetch<{ courses: Course[] }>('/api/courses', undefined, token),
      apiFetch<{ tools: AiTool[] }>('/api/tools', undefined, token),
      apiFetch<{ opportunities: Opportunity[] }>('/api/opportunities', undefined, token),
    ]);

    if (ovRes.ok && ovRes.data) {
      setOverview(ovRes.data);
    } else {
      setError(ovRes.error ?? 'Failed to load admin overview.');
    }
    if (cRes.ok && cRes.data) setCourses(cRes.data.courses);
    if (tRes.ok && tRes.data) setTools(tRes.data.tools);
    if (oRes.ok && oRes.data) setOpportunities(oRes.data.opportunities);

    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (user?.role === 'admin') {
      void loadAll();
    } else {
      setLoading(false);
    }
  }, [user?.role, loadAll]);

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

  const handleDeleteItem = async (path: string) => {
    setError(null);
    const res = await apiFetch(path, { method: 'DELETE' }, token);
    if (res.ok) {
      await loadAll();
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
          This area is protected by server-side RBAC. Only users with the{' '}
          <code className="font-mono">admin</code> role can access{' '}
          <code className="font-mono">/api/admin/*</code>.
        </p>
      </section>
    );
  }

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
            onClick={() => void loadAll()}
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
              ['users', 'Users & Audit'],
              ['courses', 'Courses'],
              ['tools', 'AI Tools'],
              ['opportunities', 'Opportunities'],
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

        {tab === 'users' && overview && (
          <div className="space-y-6">
            <div className="space-y-3">
              <h2 className="font-display text-base font-semibold">
                Registered Users ({overview.users.length})
              </h2>
              <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                {overview.users.map((member) => {
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
                          tg:{member.telegramId} ·{' '}
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
            </div>

            <div className="space-y-3">
              <h2 className="font-display text-base font-semibold">Recent Security Audit Log</h2>
              <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                {overview.recentAuditLogs.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-1 p-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="text-xs">
                      <span className="font-mono font-medium">{entry.action}</span>
                      <span className="mx-2 text-[var(--afrinex-muted)]">·</span>
                      <span className="text-[var(--afrinex-muted)]">
                        {entry.targetType ?? 'system'} {entry.targetId ?? ''}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-[var(--afrinex-muted)] tabular-nums">
                      {entry.createdAt}
                    </span>
                  </div>
                ))}
              </div>
            </div>
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

            <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
              {courses.map((cItem) => (
                <div key={cItem.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{cItem.title}</p>
                    <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                      {cItem.track} · {cItem.category} · {cItem.lessonCount} lessons
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete ${cItem.title}`}
                    onClick={() => void handleDeleteItem(`/api/admin/courses/${cItem.id}`)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
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

            <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
              {tools.map((tItem) => (
                <div key={tItem.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{tItem.name}</p>
                    <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                      {tItem.category} · {tItem.pricingModel}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Delete ${tItem.name}`}
                    onClick={() => void handleDeleteItem(`/api/admin/tools/${tItem.id}`)}
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
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
                  placeholder="Deadline (e.g. 2026-12-31)"
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

            <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
              {opportunities.map((oItem) => (
                <div key={oItem.id} className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{oItem.title}</p>
                    <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                      {oItem.organization} · {oItem.opportunityType} · {oItem.region}
                    </p>
                  </div>
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
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
