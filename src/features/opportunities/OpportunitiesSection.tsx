import { useCallback, useEffect, useState } from 'react';
import {
  Bookmark,
  Briefcase,
  CalendarClock,
  CheckCircle2,
  ExternalLink,
  Search,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type {
  Opportunity,
  OpportunityApplication,
  OpportunityApplicationStatus,
  OpportunityRegion,
  OpportunityType,
  PlatformSectionId,
} from '../../../shared/types.ts';
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  PaginationBar,
  SkeletonCards,
  SkeletonList,
  useDebouncedValue,
  useToast,
} from '../../components/FeedbackUI.tsx';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import { openTelegramExternalLink } from '../../lib/telegram.ts';

const TYPE_FILTERS: Array<{ id: 'all' | OpportunityType; label: string }> = [
  { id: 'all', label: 'All Types' },
  { id: 'job', label: 'Jobs' },
  { id: 'freelance', label: 'Freelance' },
  { id: 'scholarship', label: 'Scholarships' },
  { id: 'grant', label: 'Grants' },
  { id: 'event', label: 'Events' },
  { id: 'startup', label: 'Startups' },
  { id: 'programs', label: 'Programs' },
];

const REGION_FILTERS: Array<{ id: 'all' | OpportunityRegion; label: string }> = [
  { id: 'all', label: 'All Regions' },
  { id: 'africa', label: 'Africa' },
  { id: 'remote', label: 'Remote' },
  { id: 'global', label: 'Global' },
];

const APPLICATION_STATUS_OPTIONS: Array<{ value: OpportunityApplicationStatus; label: string }> = [
  { value: 'saved', label: 'Saved to Track' },
  { value: 'applied', label: 'Applied' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

interface TrackerSummary {
  total: number;
  saved: number;
  applied: number;
  interviewing: number;
  accepted: number;
  upcomingDeadlines: number;
  overdueDeadlines: number;
}

interface OpportunitiesSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
}

export function OpportunitiesSection({ onNavigate }: OpportunitiesSectionProps) {
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const [viewTab, setViewTab] = useState<'browse' | 'tracker'>('browse');
  const [oppType, setOppType] = useState<'all' | OpportunityType>('all');
  const [region, setRegion] = useState<'all' | OpportunityRegion>('all');
  const [browseDeadline, setBrowseDeadline] = useState<'all' | 'upcoming'>('all');
  const [search, setSearch] = useState<string>('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Opportunity Tracker State
  const [applications, setApplications] = useState<OpportunityApplication[]>([]);
  const [trackerSummary, setTrackerSummary] = useState<TrackerSummary | null>(null);
  const [trackerStatusFilter, setTrackerStatusFilter] = useState<'all' | OpportunityApplicationStatus>('all');
  const [trackerDeadlineFilter, setTrackerDeadlineFilter] = useState<'all' | 'upcoming' | 'overdue'>('all');
  const [loadingTracker, setLoadingTracker] = useState<boolean>(false);
  const [trackerError, setTrackerError] = useState<string | null>(null);
  const [trackedIds, setTrackedIds] = useState<Set<string>>(new Set());
  const [savingTrackerId, setSavingTrackerId] = useState<string | null>(null);
  const [removeTrackerTarget, setRemoveTrackerTarget] = useState<OpportunityApplication | null>(null);
  const [draftEdits, setDraftEdits] = useState<
    Record<
      string,
      { status: OpportunityApplicationStatus; appliedAt: string; deadlineAt: string; notes: string }
    >
  >({});

  useEffect(() => {
    setPage(1);
  }, [oppType, region, browseDeadline, debouncedSearch]);

  const loadOpportunities = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (oppType !== 'all') params.set('type', oppType);
    if (region !== 'all') params.set('region', region);
    if (browseDeadline === 'upcoming') params.set('deadline', 'upcoming');
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());
    params.set('page', String(page));
    params.set('per_page', '12');

    const res = await apiFetch<{
      opportunities: Opportunity[];
      page?: number;
      total?: number;
      total_pages?: number;
    }>(`/api/opportunities?${params.toString()}`, undefined, token);
    if (res.ok && res.data) {
      setOpportunities(res.data.opportunities);
      setTotal(res.data.total ?? res.data.opportunities.length);
      setTotalPages(res.data.total_pages ?? 1);
    } else {
      setError(res.error ?? 'Failed to load opportunities.');
    }
    setLoading(false);
  }, [oppType, region, browseDeadline, debouncedSearch, page, token]);

  const loadTracker = useCallback(async () => {
    if (!token) {
      setApplications([]);
      setTrackerSummary(null);
      setTrackedIds(new Set());
      return;
    }
    setLoadingTracker(true);
    setTrackerError(null);
    const params = new URLSearchParams();
    if (trackerStatusFilter !== 'all') params.set('status', trackerStatusFilter);
    if (trackerDeadlineFilter !== 'all') params.set('deadline', trackerDeadlineFilter);
    const query = params.toString() ? `?${params.toString()}` : '';

    const res = await apiFetch<{ applications: OpportunityApplication[]; summary: TrackerSummary }>(
      `/api/opportunities/tracker${query}`,
      undefined,
      token
    );
    if (res.ok && res.data) {
      setApplications(res.data.applications);
      setTrackerSummary(res.data.summary);
      if (trackerStatusFilter === 'all' && trackerDeadlineFilter === 'all') {
        setTrackedIds(new Set(res.data.applications.map((a) => a.opportunityId)));
      }
      const drafts: Record<
        string,
        { status: OpportunityApplicationStatus; appliedAt: string; deadlineAt: string; notes: string }
      > = {};
      for (const app of res.data.applications) {
        drafts[app.opportunityId] = {
          status: app.status,
          appliedAt: app.appliedAt ?? '',
          deadlineAt: app.deadlineAt ?? '',
          notes: app.notes ?? '',
        };
      }
      setDraftEdits(drafts);
    } else {
      setTrackerError(res.error ?? 'Failed to load tracked applications.');
    }
    setLoadingTracker(false);
  }, [token, trackerStatusFilter, trackerDeadlineFilter]);

  useEffect(() => {
    void loadOpportunities();
  }, [loadOpportunities]);

  useEffect(() => {
    if (user && token) {
      void loadTracker();
    }
  }, [user, token, loadTracker]);

  const toggleBookmark = async (opp: Opportunity) => {
    if (!user || !token) {
      onNavigate('dashboard');
      return;
    }

    const res = await apiFetch<{ bookmarked: boolean }>(
      '/api/bookmarks',
      {
        method: 'POST',
        body: JSON.stringify({ itemType: 'opportunity', itemId: opp.id }),
      },
      token
    );

    if (res.ok && res.data) {
      const next = res.data.bookmarked;
      setOpportunities((prev) =>
        prev.map((item) => (item.id === opp.id ? { ...item, bookmarked: next } : item))
      );
      showToast(next ? `Bookmarked "${opp.title}"` : 'Bookmark removed', 'info');
    } else {
      showToast(res.error ?? 'Could not update bookmark.', 'error');
    }
  };

  const trackOpportunity = async (opp: Opportunity) => {
    if (!user || !token) {
      onNavigate('dashboard');
      return;
    }
    setSavingTrackerId(opp.id);
    const res = await apiFetch<{ application: OpportunityApplication }>(
      `/api/opportunities/tracker/${opp.id}`,
      {
        method: 'POST',
        body: JSON.stringify({
          status: 'saved',
          deadlineAt: opp.deadline ?? null,
          notes: '',
        }),
      },
      token
    );
    setSavingTrackerId(null);
    if (res.ok) {
      setTrackedIds((prev) => new Set(prev).add(opp.id));
      showToast(`Added "${opp.title}" to your Opportunity Tracker.`, 'success');
      void loadTracker();
    } else {
      showToast(res.error ?? 'Could not track opportunity.', 'error');
    }
  };

  const saveTrackedApplication = async (opportunityId: string) => {
    if (!token) return;
    const draft = draftEdits[opportunityId];
    if (!draft) return;
    setSavingTrackerId(opportunityId);
    const res = await apiFetch<{ application: OpportunityApplication }>(
      `/api/opportunities/tracker/${opportunityId}`,
      {
        method: 'PUT',
        body: JSON.stringify({
          status: draft.status,
          appliedAt: draft.appliedAt.trim() || null,
          deadlineAt: draft.deadlineAt.trim() || null,
          notes: draft.notes,
        }),
      },
      token
    );
    setSavingTrackerId(null);
    if (res.ok) {
      showToast('Application progress saved.', 'success');
      await loadTracker();
    } else {
      showToast(res.error ?? 'Could not update tracked application.', 'error');
    }
  };

  const confirmRemoveTracked = async () => {
    if (!token || !removeTrackerTarget) return;
    const oppId = removeTrackerTarget.opportunityId;
    setSavingTrackerId(oppId);
    const res = await apiFetch(
      `/api/opportunities/tracker/${oppId}`,
      { method: 'DELETE' },
      token
    );
    setSavingTrackerId(null);
    setRemoveTrackerTarget(null);
    if (res.ok) {
      setTrackedIds((prev) => {
        const next = new Set(prev);
        next.delete(oppId);
        return next;
      });
      showToast('Removed from Opportunity Tracker.', 'info');
      await loadTracker();
    } else {
      showToast(res.error ?? 'Failed to remove entry.', 'error');
    }
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
      <ConfirmDialog
        open={Boolean(removeTrackerTarget)}
        title="Remove Tracked Opportunity"
        description={`Remove "${removeTrackerTarget?.opportunity?.title ?? 'this opportunity'}" and its personal application notes from your tracker?`}
        confirmLabel="Remove"
        destructive
        busy={savingTrackerId === removeTrackerTarget?.opportunityId}
        onConfirm={() => void confirmRemoveTracked()}
        onCancel={() => setRemoveTrackerTarget(null)}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium text-[var(--afrinex-accent)]">
            Global & African Opportunities
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Jobs, Grants, Scholarships & Tracker
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setViewTab('browse')}
            className={`min-h-[40px] rounded-xl px-3.5 text-xs font-medium transition-colors whitespace-nowrap ${
              viewTab === 'browse'
                ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)] font-semibold'
                : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
            }`}
          >
            Browse Opportunities
          </button>
          <button
            type="button"
            onClick={() => setViewTab('tracker')}
            className={`min-h-[40px] inline-flex items-center gap-1.5 rounded-xl px-3.5 text-xs font-medium transition-colors whitespace-nowrap ${
              viewTab === 'tracker'
                ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)] font-semibold'
                : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
            }`}
          >
            <Briefcase className="h-3.5 w-3.5" />
            Opportunity Tracker
            {trackerSummary && trackerSummary.total > 0 ? ` (${trackerSummary.total})` : ''}
          </button>
        </div>
      </div>

      {viewTab === 'tracker' ? (
        !user ? (
          <div className="rounded-xl border border-[var(--afrinex-border)] p-5 space-y-3">
            <div className="flex items-start gap-3">
              <UserCheck className="mt-0.5 h-5 w-5 text-[var(--afrinex-accent)] shrink-0" />
              <div className="space-y-1">
                <h2 className="font-display text-base font-semibold">
                  Sign in to use the Opportunity Tracker
                </h2>
                <p className="text-sm text-[var(--afrinex-muted)]">
                  Track application stages, submission dates, upcoming deadlines, and notes across devices.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('dashboard')}
              className="min-h-[40px] rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)]"
            >
              Go to My Account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {trackerSummary && (
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                <div className="rounded-xl border border-[var(--afrinex-border)] p-3">
                  <dt className="text-[11px] text-[var(--afrinex-muted)]">Tracked</dt>
                  <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">
                    {trackerSummary.total}
                  </dd>
                </div>
                <div className="rounded-xl border border-[var(--afrinex-border)] p-3">
                  <dt className="text-[11px] text-[var(--afrinex-muted)]">Applied</dt>
                  <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">
                    {trackerSummary.applied}
                  </dd>
                </div>
                <div className="rounded-xl border border-[var(--afrinex-border)] p-3">
                  <dt className="text-[11px] text-[var(--afrinex-muted)]">Interviewing</dt>
                  <dd className="mt-0.5 font-display text-xl font-bold tabular-nums">
                    {trackerSummary.interviewing}
                  </dd>
                </div>
                <div className="rounded-xl border border-[var(--afrinex-border)] p-3">
                  <dt className="text-[11px] text-[var(--afrinex-muted)]">Upcoming Due</dt>
                  <dd className="mt-0.5 font-display text-xl font-bold tabular-nums text-[var(--afrinex-accent)]">
                    {trackerSummary.upcomingDeadlines}
                  </dd>
                </div>
                <div className="rounded-xl border border-[var(--afrinex-border)] p-3 col-span-2 sm:col-span-1">
                  <dt className="text-[11px] text-[var(--afrinex-muted)]">Overdue</dt>
                  <dd
                    className={`mt-0.5 font-display text-xl font-bold tabular-nums ${
                      trackerSummary.overdueDeadlines > 0 ? 'text-amber-500' : ''
                    }`}
                  >
                    {trackerSummary.overdueDeadlines}
                  </dd>
                </div>
              </dl>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <select
                aria-label="Filter tracker by status"
                value={trackerStatusFilter}
                onChange={(e) =>
                  setTrackerStatusFilter(e.target.value as 'all' | OpportunityApplicationStatus)
                }
                className="min-h-[38px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
              >
                <option value="all">All Statuses</option>
                {APPLICATION_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {(['all', 'upcoming', 'overdue'] as const).map((dl) => (
                <button
                  key={dl}
                  type="button"
                  onClick={() => setTrackerDeadlineFilter(dl)}
                  className={`min-h-[38px] rounded-xl px-3 text-xs font-medium capitalize ${
                    trackerDeadlineFilter === dl
                      ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                      : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)]'
                  }`}
                >
                  {dl === 'all' ? 'All Deadlines' : dl}
                </button>
              ))}
            </div>

            {trackerError && (
              <ErrorBanner message={trackerError} onRetry={() => void loadTracker()} />
            )}

            {loadingTracker ? (
              <SkeletonList rows={3} />
            ) : applications.length === 0 ? (
              <EmptyState
                title="No tracked applications match"
                description="Browse global and African opportunities and click Track to follow deadlines, dates, and personal notes."
                actionLabel="Browse Opportunities"
                onAction={() => setViewTab('browse')}
              />
            ) : (
              <div className="space-y-3">
                {applications.map((app) => {
                  const draft = draftEdits[app.opportunityId] ?? {
                    status: app.status,
                    appliedAt: app.appliedAt ?? '',
                    deadlineAt: app.deadlineAt ?? '',
                    notes: app.notes ?? '',
                  };
                  const isOverdue = Boolean(
                    draft.deadlineAt &&
                      draft.deadlineAt.slice(0, 10) < todayStr &&
                      ['saved', 'applied', 'interviewing'].includes(draft.status)
                  );
                  return (
                    <article
                      key={app.id}
                      className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 sm:p-5 space-y-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="space-y-0.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-[var(--afrinex-muted)]">
                            <span className="capitalize">
                              {app.opportunity?.opportunityType ?? 'opportunity'} ·{' '}
                              {app.opportunity?.organization ?? ''}
                            </span>
                            {isOverdue && (
                              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 font-semibold text-amber-400">
                                Deadline Passed
                              </span>
                            )}
                          </div>
                          <h2 className="font-display text-base font-semibold">
                            {app.opportunity?.title ?? app.opportunityId}
                          </h2>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {app.opportunity?.url && (
                            <a
                              href={app.opportunity.url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => {
                                if (openTelegramExternalLink(app.opportunity!.url)) {
                                  e.preventDefault();
                                }
                              }}
                              className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
                            >
                              Open
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          <button
                            type="button"
                            aria-label="Remove from tracker"
                            onClick={() => setRemoveTrackerTarget(app)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-red-500"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 text-xs">
                        <label className="space-y-1">
                          <span className="block text-[11px] text-[var(--afrinex-muted)]">
                            Application Status
                          </span>
                          <select
                            value={draft.status}
                            onChange={(e) =>
                              setDraftEdits((prev) => ({
                                ...prev,
                                [app.opportunityId]: {
                                  ...draft,
                                  status: e.target.value as OpportunityApplicationStatus,
                                },
                              }))
                            }
                            className="min-h-[38px] w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-2.5 text-xs"
                          >
                            {APPLICATION_STATUS_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="space-y-1">
                          <span className="block text-[11px] text-[var(--afrinex-muted)]">
                            Applied Date
                          </span>
                          <input
                            type="date"
                            value={draft.appliedAt.slice(0, 10)}
                            onChange={(e) =>
                              setDraftEdits((prev) => ({
                                ...prev,
                                [app.opportunityId]: { ...draft, appliedAt: e.target.value },
                              }))
                            }
                            className="min-h-[38px] w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-2.5 text-xs"
                          />
                        </label>

                        <label className="space-y-1">
                          <span className="block text-[11px] text-[var(--afrinex-muted)]">
                            Deadline Date
                          </span>
                          <input
                            type="date"
                            value={draft.deadlineAt.slice(0, 10)}
                            onChange={(e) =>
                              setDraftEdits((prev) => ({
                                ...prev,
                                [app.opportunityId]: { ...draft, deadlineAt: e.target.value },
                              }))
                            }
                            className="min-h-[38px] w-full rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-2.5 text-xs"
                          />
                        </label>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                        <textarea
                          rows={2}
                          value={draft.notes}
                          onChange={(e) =>
                            setDraftEdits((prev) => ({
                              ...prev,
                              [app.opportunityId]: { ...draft, notes: e.target.value },
                            }))
                          }
                          placeholder="Personal notes, referral contact, essay links, interview prep..."
                          className="flex-1 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-2.5 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
                        />
                        <button
                          type="button"
                          disabled={savingTrackerId === app.opportunityId}
                          onClick={() => void saveTrackedApplication(app.opportunityId)}
                          className="min-h-[38px] rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
                        >
                          {savingTrackerId === app.opportunityId ? 'Saving...' : 'Save Progress'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--afrinex-muted)]" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search jobs, grants, scholarships..."
                className="min-h-[44px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] pl-9 pr-3 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              {(['all', 'upcoming'] as const).map((dl) => (
                <button
                  key={dl}
                  type="button"
                  onClick={() => setBrowseDeadline(dl)}
                  className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-xl px-3 text-xs font-medium ${
                    browseDeadline === dl
                      ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                      : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)]'
                  }`}
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  {dl === 'all' ? 'Any Deadline' : 'Open Deadlines'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {TYPE_FILTERS.map((item) => {
                const active = oppType === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setOppType(item.id)}
                    className={`min-h-[40px] rounded-xl px-3.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                        : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {REGION_FILTERS.map((item) => {
                const active = region === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setRegion(item.id)}
                    className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-black/10 dark:bg-white/15 text-[var(--afrinex-text)]'
                        : 'text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {error && <ErrorBanner message={error} onRetry={() => void loadOpportunities()} />}

          {loading ? (
            <SkeletonCards count={4} />
          ) : opportunities.length === 0 ? (
            <EmptyState
              title="No matching opportunities"
              description={
                oppType === 'all' && region === 'all' && !debouncedSearch.trim()
                  ? 'No published opportunities are available yet.'
                  : 'Try broadening your region, category, or deadline filters.'
              }
              actionLabel={
                oppType !== 'all' || region !== 'all' || search.trim() ? 'Reset Filters' : undefined
              }
              onAction={() => {
                setOppType('all');
                setRegion('all');
                setBrowseDeadline('all');
                setSearch('');
              }}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {opportunities.map((opp) => {
                  const isTracked = trackedIds.has(opp.id);
                  return (
                    <article
                      key={opp.id}
                      className="flex flex-col justify-between rounded-2xl border border-[var(--afrinex-border)] p-5 space-y-4"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-[var(--afrinex-muted)] capitalize">
                            {opp.featured ? (
                              <span className="font-semibold text-[var(--afrinex-accent)]">
                                Featured ·{' '}
                              </span>
                            ) : null}
                            {opp.opportunityType} · {opp.region}
                            {opp.deadline ? ` · Due ${opp.deadline}` : ''}
                          </span>
                          <button
                            type="button"
                            aria-label={`Bookmark ${opp.title}`}
                            onClick={() => void toggleBookmark(opp)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-accent)]"
                          >
                            <Bookmark
                              className={`h-4 w-4 ${
                                opp.bookmarked
                                  ? 'fill-[var(--afrinex-accent)] text-[var(--afrinex-accent)]'
                                  : ''
                              }`}
                            />
                          </button>
                        </div>

                        <h2 className="font-display text-base font-semibold">{opp.title}</h2>
                        <p className="text-xs font-medium text-[var(--afrinex-accent)]">
                          {opp.organization}
                        </p>
                        <p className="text-sm leading-relaxed text-[var(--afrinex-muted)]">
                          {opp.summary}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <a
                          href={opp.url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => {
                            if (openTelegramExternalLink(opp.url)) {
                              e.preventDefault();
                            }
                          }}
                          className="min-h-[42px] flex-1 inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--afrinex-border)] text-sm font-medium hover:border-[var(--afrinex-accent)] transition-colors"
                        >
                          View Opportunity
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>

                        {isTracked ? (
                          <button
                            type="button"
                            onClick={() => setViewTab('tracker')}
                            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--afrinex-accent)]/50 bg-[var(--afrinex-accent)]/10 px-3.5 text-xs font-semibold text-[var(--afrinex-accent)]"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Tracked
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={savingTrackerId === opp.id}
                            onClick={() => void trackOpportunity(opp)}
                            className="min-h-[42px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--afrinex-accent)] px-3.5 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
                          >
                            <Briefcase className="h-3.5 w-3.5" />
                            {savingTrackerId === opp.id ? 'Saving...' : 'Track'}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>

              <PaginationBar
                page={page}
                totalPages={totalPages}
                total={total}
                onPageChange={setPage}
              />
            </>
          )}
        </>
      )}
    </section>
  );
}
