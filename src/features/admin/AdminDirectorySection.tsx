import { useCallback, useEffect, useState } from 'react';
import { Archive, Edit3, Plus, Search, Star, Trash2 } from 'lucide-react';
import type {
  AiTool,
  AiToolCategory,
  AiToolPricing,
  Opportunity,
  OpportunityRegion,
  OpportunityType,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { ConfirmDialog } from './AdminShared.tsx';

interface DirectoryProps {
  token: string | null;
  onRefreshOverview: () => void;
}

// D. AI Tools Directory Management
export function AdminToolsSection({ token, onRefreshOverview }: DirectoryProps) {
  const [tools, setTools] = useState<AiTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | AiToolCategory>('all');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState<AiToolCategory>('coding');
  const [url, setUrl] = useState('');
  const [pricingModel, setPricingModel] = useState<AiToolPricing>('freemium');
  const [featured, setFeatured] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AiTool | null>(null);

  const loadTools = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch<{ tools: AiTool[] }>('/api/admin/tools', undefined, token);
    if (res.ok && res.data) {
      setTools(res.data.tools);
    } else if (res.error) {
      setFeedback(res.error);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadTools();
  }, [loadTools]);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setSummary('');
    setCategory('coding');
    setUrl('');
    setPricingModel('freemium');
    setFeatured(false);
  };

  const startEdit = (tool: AiTool) => {
    setEditingId(tool.id);
    setName(tool.name);
    setSummary(tool.summary);
    setCategory(tool.category);
    setUrl(tool.url);
    setPricingModel(tool.pricingModel);
    setFeatured(tool.featured);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setFeedback(null);

    const payload = { name, summary, category, url, pricingModel, featured };
    const res = editingId
      ? await apiFetch(
          `/api/admin/tools/${editingId}`,
          { method: 'PUT', body: JSON.stringify(payload) },
          token
        )
      : await apiFetch(
          '/api/admin/tools',
          { method: 'POST', body: JSON.stringify(payload) },
          token
        );

    if (res.ok) {
      setFeedback(editingId ? 'AI tool updated.' : 'AI tool added to directory.');
      resetForm();
      await loadTools();
      onRefreshOverview();
    } else {
      setFeedback(res.error ?? 'Failed to save AI tool.');
    }
    setBusy(false);
  };

  const toggleFeature = async (tool: AiTool) => {
    if (!token) return;
    const res = await apiFetch(
      `/api/admin/tools/${tool.id}/feature`,
      { method: 'PATCH', body: JSON.stringify({ featured: !tool.featured }) },
      token
    );
    if (res.ok) {
      setTools((prev) =>
        prev.map((t) => (t.id === tool.id ? { ...t, featured: !tool.featured } : t))
      );
    }
  };

  const togglePublish = async (tool: AiTool) => {
    if (!token) return;
    const res = await apiFetch(
      `/api/admin/tools/${tool.id}/publish`,
      { method: 'PATCH', body: JSON.stringify({ published: !tool.published }) },
      token
    );
    if (res.ok) {
      setTools((prev) =>
        prev.map((t) => (t.id === tool.id ? { ...t, published: !tool.published } : t))
      );
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setBusy(true);
    const res = await apiFetch(`/api/admin/tools/${deleteTarget.id}`, { method: 'DELETE' }, token);
    if (res.ok) {
      setFeedback(`Removed "${deleteTarget.name}".`);
      setDeleteTarget(null);
      await loadTools();
      onRefreshOverview();
    } else {
      setFeedback(res.error ?? 'Failed to delete tool.');
    }
    setBusy(false);
  };

  const filteredTools = tools.filter((t) => {
    const matchesCat = categoryFilter === 'all' || t.category === categoryFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || t.name.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {feedback && (
        <p className="text-xs font-medium text-[var(--afrinex-accent)]">{feedback}</p>
      )}

      <form
        onSubmit={(e) => void handleSave(e)}
        className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">
            {editingId ? 'Edit AI Tool' : 'Add AI Tool'}
          </h3>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-[var(--afrinex-muted)]"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input
            required
            minLength={2}
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tool name"
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as AiToolCategory)}
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          >
            <option value="writing">Writing</option>
            <option value="coding">Coding</option>
            <option value="design">Design</option>
            <option value="productivity">Productivity</option>
            <option value="business">Business</option>
          </select>
          <select
            value={pricingModel}
            onChange={(e) => setPricingModel(e.target.value as AiToolPricing)}
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          >
            <option value="free">Free</option>
            <option value="freemium">Freemium</option>
            <option value="paid">Paid</option>
            <option value="open-source">Open Source</option>
          </select>
          <input
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          />
        </div>

        <textarea
          required
          minLength={10}
          maxLength={500}
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Describe what this AI tool does and why it helps members..."
          className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 text-sm"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
              className="h-4 w-4 accent-[var(--afrinex-accent)]"
            />
            Featured in AI Tools Directory
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {editingId ? 'Save Changes' : 'Add AI Tool'}
          </button>
        </div>
      </form>

      {/* Search & Category Filter */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--afrinex-muted)]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter AI tools..."
            className="min-h-[40px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as 'all' | AiToolCategory)}
          className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
        >
          <option value="all">All Categories</option>
          <option value="writing">Writing</option>
          <option value="coding">Coding</option>
          <option value="design">Design</option>
          <option value="productivity">Productivity</option>
          <option value="business">Business</option>
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--afrinex-muted)]">Loading AI tools...</p>
      ) : filteredTools.length === 0 ? (
        <p className="text-sm text-[var(--afrinex-muted)]">No tools match your filter.</p>
      ) : (
        <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
          {filteredTools.map((tool) => (
            <div
              key={tool.id}
              className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold">{tool.name}</p>
                <p className="text-xs text-[var(--afrinex-muted)] capitalize">
                  {tool.category} · {tool.pricingModel} ·{' '}
                  {tool.published ? 'Published' : 'Unpublished'}
                  {tool.featured ? ' · Featured' : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void toggleFeature(tool)}
                  className={`min-h-[36px] inline-flex items-center gap-1 rounded-lg border px-2.5 text-xs font-medium ${
                    tool.featured
                      ? 'border-[var(--afrinex-accent)] text-[var(--afrinex-accent)]'
                      : 'border-[var(--afrinex-border)]'
                  }`}
                >
                  <Star className="h-3.5 w-3.5" />
                  {tool.featured ? 'Featured' : 'Feature'}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(tool)}
                  className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs font-medium"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void togglePublish(tool)}
                  className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs font-medium"
                >
                  {tool.published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(tool)}
                  aria-label={`Delete ${tool.name}`}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete AI Tool?"
        description={`Remove "${deleteTarget?.name ?? ''}" from the AFRINEX directory permanently?`}
        confirmLabel="Delete Tool"
        destructive
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

// E. Opportunities Management
export function AdminOpportunitiesSection({ token, onRefreshOverview }: DirectoryProps) {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'archived' | 'all'>('active');

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [organization, setOrganization] = useState('');
  const [summary, setSummary] = useState('');
  const [opportunityType, setOpportunityType] = useState<OpportunityType>('grant');
  const [region, setRegion] = useState<OpportunityRegion>('africa');
  const [url, setUrl] = useState('');
  const [deadline, setDeadline] = useState('');
  const [featured, setFeatured] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Opportunity | null>(null);

  const loadOpportunities = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch<{ opportunities: Opportunity[] }>(
      '/api/admin/opportunities',
      undefined,
      token
    );
    if (res.ok && res.data) {
      setOpportunities(res.data.opportunities);
    } else if (res.error) {
      setFeedback(res.error);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void loadOpportunities();
  }, [loadOpportunities]);

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setOrganization('');
    setSummary('');
    setOpportunityType('grant');
    setRegion('africa');
    setUrl('');
    setDeadline('');
    setFeatured(false);
  };

  const startEdit = (opp: Opportunity) => {
    setEditingId(opp.id);
    setTitle(opp.title);
    setOrganization(opp.organization);
    setSummary(opp.summary);
    setOpportunityType(opp.opportunityType);
    setRegion(opp.region);
    setUrl(opp.url);
    setDeadline(opp.deadline ?? '');
    setFeatured(Boolean(opp.featured));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    setFeedback(null);

    const payload = {
      title,
      organization,
      summary,
      opportunityType,
      region,
      url,
      deadline: deadline.trim() || undefined,
      featured,
    };

    const res = editingId
      ? await apiFetch(
          `/api/admin/opportunities/${editingId}`,
          { method: 'PUT', body: JSON.stringify({ ...payload, deadline: deadline.trim() || null }) },
          token
        )
      : await apiFetch(
          '/api/admin/opportunities',
          { method: 'POST', body: JSON.stringify(payload) },
          token
        );

    if (res.ok) {
      setFeedback(editingId ? 'Opportunity updated.' : 'Opportunity published.');
      resetForm();
      await loadOpportunities();
      onRefreshOverview();
    } else {
      setFeedback(res.error ?? 'Failed to save opportunity.');
    }
    setBusy(false);
  };

  const togglePublish = async (opp: Opportunity) => {
    if (!token) return;
    const res = await apiFetch(
      `/api/admin/opportunities/${opp.id}/publish`,
      { method: 'PATCH', body: JSON.stringify({ published: !opp.published }) },
      token
    );
    if (res.ok) {
      setOpportunities((prev) =>
        prev.map((o) => (o.id === opp.id ? { ...o, published: !opp.published } : o))
      );
    }
  };

  const toggleFeature = async (opp: Opportunity) => {
    if (!token) return;
    const next = !opp.featured;
    const res = await apiFetch(
      `/api/admin/opportunities/${opp.id}/feature`,
      { method: 'PATCH', body: JSON.stringify({ featured: next }) },
      token
    );
    if (res.ok) {
      setOpportunities((prev) =>
        prev.map((o) => (o.id === opp.id ? { ...o, featured: next } : o))
      );
    }
  };

  const toggleArchive = async (opp: Opportunity) => {
    if (!token) return;
    const next = !opp.archived;
    const res = await apiFetch(
      `/api/admin/opportunities/${opp.id}/archive`,
      { method: 'PATCH', body: JSON.stringify({ archived: next }) },
      token
    );
    if (res.ok) {
      setOpportunities((prev) =>
        prev.map((o) => (o.id === opp.id ? { ...o, archived: next } : o))
      );
    }
  };

  const archiveExpired = async () => {
    if (!token) return;
    setBusy(true);
    const res = await apiFetch<{ archivedCount: number }>(
      '/api/admin/opportunities/archive-expired',
      { method: 'POST' },
      token
    );
    if (res.ok && res.data) {
      setFeedback(`Archived ${res.data.archivedCount} expired opportunity listing(s).`);
      await loadOpportunities();
    } else {
      setFeedback(res.error ?? 'Failed to archive expired opportunities.');
    }
    setBusy(false);
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setBusy(true);
    const res = await apiFetch(
      `/api/admin/opportunities/${deleteTarget.id}`,
      { method: 'DELETE' },
      token
    );
    if (res.ok) {
      setFeedback(`Deleted "${deleteTarget.title}".`);
      setDeleteTarget(null);
      await loadOpportunities();
      onRefreshOverview();
    } else {
      setFeedback(res.error ?? 'Failed to delete opportunity.');
    }
    setBusy(false);
  };

  const filtered = opportunities.filter((opp) => {
    const matchesStatus =
      statusFilter === 'all'
        ? true
        : statusFilter === 'archived'
          ? Boolean(opp.archived)
          : !opp.archived;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      opp.title.toLowerCase().includes(q) ||
      opp.organization.toLowerCase().includes(q);
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {feedback && (
        <p className="text-xs font-medium text-[var(--afrinex-accent)]">{feedback}</p>
      )}

      <form
        onSubmit={(e) => void handleSave(e)}
        className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-3"
      >
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold">
            {editingId ? 'Edit Opportunity' : 'Publish New Opportunity'}
          </h3>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs text-[var(--afrinex-muted)]"
            >
              Cancel Edit
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input
            required
            minLength={3}
            maxLength={140}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Opportunity title"
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          />
          <input
            required
            minLength={2}
            maxLength={100}
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="Organization"
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          />
          <input
            required
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Application URL (https://...)"
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          />
          <select
            value={opportunityType}
            onChange={(e) => setOpportunityType(e.target.value as OpportunityType)}
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
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
            value={region}
            onChange={(e) => setRegion(e.target.value as OpportunityRegion)}
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
          >
            <option value="africa">Africa</option>
            <option value="remote">Remote</option>
            <option value="global">Global</option>
          </select>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm tabular-nums"
          />
        </div>

        <textarea
          required
          minLength={10}
          maxLength={600}
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          placeholder="Eligibility, benefits, and application guidance..."
          className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 text-sm"
        />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
              className="h-4 w-4 accent-[var(--afrinex-accent)]"
            />
            Feature at top of Opportunities Hub
          </label>
          <button
            type="submit"
            disabled={busy}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {editingId ? 'Save Opportunity' : 'Publish Opportunity'}
          </button>
        </div>
      </form>

      {/* Filter & Bulk Archive Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--afrinex-muted)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search opportunities or organizations..."
              className="min-h-[40px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'active' | 'archived' | 'all')}
            className="min-h-[40px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
          >
            <option value="active">Active Listings</option>
            <option value="archived">Archived</option>
            <option value="all">All</option>
          </select>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void archiveExpired()}
          className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--afrinex-border)] px-3.5 text-xs font-medium hover:border-[var(--afrinex-accent)] whitespace-nowrap"
        >
          <Archive className="h-3.5 w-3.5" />
          Archive Expired
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--afrinex-muted)]">Loading opportunities...</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-[var(--afrinex-muted)]">No opportunities match your filter.</p>
      ) : (
        <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
          {filtered.map((opp) => (
            <div
              key={opp.id}
              className="p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
            >
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-semibold">{opp.title}</p>
                <p className="text-xs text-[var(--afrinex-muted)] capitalize tabular-nums">
                  {opp.organization} · {opp.opportunityType} · {opp.region}
                  {opp.deadline ? ` · Due ${opp.deadline}` : ''} ·{' '}
                  {opp.published ? 'Published' : 'Unpublished'}
                  {opp.featured ? ' · Featured' : ''}
                  {opp.archived ? ' · Archived' : ''}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void toggleFeature(opp)}
                  className={`min-h-[36px] inline-flex items-center gap-1 rounded-lg border px-2.5 text-xs font-medium ${
                    opp.featured
                      ? 'border-[var(--afrinex-accent)] text-[var(--afrinex-accent)]'
                      : 'border-[var(--afrinex-border)]'
                  }`}
                >
                  <Star className="h-3.5 w-3.5" />
                  {opp.featured ? 'Featured' : 'Feature'}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(opp)}
                  className="min-h-[36px] inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs font-medium"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => void togglePublish(opp)}
                  className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs font-medium"
                >
                  {opp.published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={() => void toggleArchive(opp)}
                  className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs font-medium"
                >
                  {opp.archived ? 'Unarchive' : 'Archive'}
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(opp)}
                  aria-label={`Delete ${opp.title}`}
                  className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-[var(--afrinex-border)] text-red-600"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Opportunity?"
        description={`Permanently delete "${deleteTarget?.title ?? ''}"?`}
        confirmLabel="Delete Opportunity"
        destructive
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
