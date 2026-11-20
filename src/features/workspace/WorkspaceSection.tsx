import { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  Download,
  ExternalLink,
  Folder,
  History,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Star,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type {
  BuilderProject,
  BuilderProjectStatus,
  BuilderProjectVersion,
  BuilderType,
  PlatformSectionId,
} from '../../../shared/types.ts';
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  PaginationBar,
  SkeletonList,
  useDebouncedValue,
  useToast,
} from '../../components/FeedbackUI.tsx';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import {
  BUILDER_CATALOG,
  BUILDER_STATUS_STYLES,
  getCatalogEntry,
} from '../builders/builderCatalog.ts';
import { downloadProjectZip } from '../builders/zipExport.ts';

interface WorkspaceSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
  onOpenProject: (projectId: string) => void;
}

const STATUS_OPTIONS: Array<{ id: 'all' | BuilderProjectStatus; label: string }> = [
  { id: 'all', label: 'All Statuses' },
  { id: 'draft', label: 'Draft' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'generated', label: 'Code Ready' },
  { id: 'previewed', label: 'Tested' },
  { id: 'completed', label: 'Completed' },
  { id: 'deployed', label: 'Deployed' },
  { id: 'failed', label: 'Failed' },
];

export function WorkspaceSection({ onNavigate, onOpenProject }: WorkspaceSectionProps) {
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<BuilderProject[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 300);
  const [typeFilter, setTypeFilter] = useState<'all' | BuilderType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | BuilderProjectStatus>('all');
  const [folderFilter, setFolderFilter] = useState<string>('all');
  const [favoriteOnly, setFavoriteOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [renamingProject, setRenamingProject] = useState<BuilderProject | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [folderInput, setFolderInput] = useState('General');
  const [deleteTarget, setDeleteTarget] = useState<BuilderProject | null>(null);

  const [versionsTarget, setVersionsTarget] = useState<BuilderProject | null>(null);
  const [versions, setVersions] = useState<BuilderProjectVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [restoreCandidate, setRestoreCandidate] = useState<BuilderProjectVersion | null>(null);

  const loadProjects = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);

    const params = new URLSearchParams({ page: String(page), per_page: '12' });
    if (typeFilter !== 'all') params.set('builderType', typeFilter);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (folderFilter !== 'all') params.set('folder', folderFilter);
    if (favoriteOnly) params.set('favorite', 'true');
    if (debouncedSearch.trim()) params.set('q', debouncedSearch.trim());

    const res = await apiFetch<{
      projects: BuilderProject[];
      folders?: string[];
      page?: number;
      total?: number;
      total_pages?: number;
    }>(`/api/builders/projects?${params.toString()}`, undefined, token);

    if (res.ok && res.data) {
      setProjects(res.data.projects);
      setFolders(res.data.folders ?? []);
      setTotal(res.data.total ?? res.data.projects.length);
      setTotalPages(res.data.total_pages ?? 1);
    } else {
      setError(res.error ?? 'Could not load workspace projects.');
    }
    setLoading(false);
  }, [token, page, typeFilter, statusFilter, folderFilter, favoriteOnly, debouncedSearch]);

  useEffect(() => {
    if (user && token) {
      void loadProjects();
    } else {
      setLoading(false);
    }
  }, [user, token, loadProjects]);

  useEffect(() => {
    setPage(1);
  }, [typeFilter, statusFilter, folderFilter, favoriteOnly, debouncedSearch]);

  const toggleFavorite = async (project: BuilderProject) => {
    if (!token || busyId) return;
    setBusyId(project.id);
    const nextFav = !project.isFavorite;
    const res = await apiFetch<{ project: BuilderProject }>(
      `/api/builders/projects/${project.id}`,
      { method: 'PATCH', body: JSON.stringify({ isFavorite: nextFav }) },
      token
    );
    if (res.ok && res.data?.project) {
      setProjects((prev) => prev.map((p) => (p.id === project.id ? res.data!.project : p)));
      showToast(nextFav ? 'Pinned to favorites.' : 'Removed from favorites.', 'success');
    } else {
      showToast(res.error ?? 'Could not update favorite status.', 'error');
    }
    setBusyId(null);
  };

  const handleSaveRenameFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !renamingProject || busyId) return;
    if (renameInput.trim().length < 2) {
      showToast('Project name must be at least 2 characters.', 'error');
      return;
    }

    setBusyId(renamingProject.id);
    const res = await apiFetch<{ project: BuilderProject }>(
      `/api/builders/projects/${renamingProject.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          name: renameInput.trim(),
          folder: folderInput.trim() || 'General',
        }),
      },
      token
    );
    setBusyId(null);

    if (res.ok && res.data?.project) {
      setRenamingProject(null);
      showToast('Project details updated.', 'success');
      await loadProjects();
    } else {
      showToast(res.error ?? 'Could not rename project.', 'error');
    }
  };

  const handleDuplicate = async (project: BuilderProject) => {
    if (!token || busyId) return;
    setBusyId(project.id);
    const res = await apiFetch<{ project: BuilderProject }>(
      `/api/builders/projects/${project.id}/duplicate`,
      { method: 'POST' },
      token
    );
    setBusyId(null);
    if (res.ok) {
      showToast(`Duplicated "${project.name}".`, 'success');
      await loadProjects();
    } else {
      showToast(res.error ?? 'Could not duplicate project.', 'error');
    }
  };

  const confirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setBusyId(deleteTarget.id);
    const res = await apiFetch(`/api/builders/projects/${deleteTarget.id}`, { method: 'DELETE' }, token);
    setBusyId(null);
    if (res.ok) {
      showToast(`Deleted "${deleteTarget.name}".`, 'info');
      setDeleteTarget(null);
      await loadProjects();
    } else {
      showToast(res.error ?? 'Could not delete project.', 'error');
    }
  };

  const openVersions = async (project: BuilderProject) => {
    if (!token) return;
    setVersionsTarget(project);
    setLoadingVersions(true);
    const res = await apiFetch<{ versions: BuilderProjectVersion[] }>(
      `/api/builders/projects/${project.id}/versions`,
      undefined,
      token
    );
    if (res.ok && res.data) {
      setVersions(res.data.versions);
    } else {
      showToast(res.error ?? 'Failed to load version history.', 'error');
    }
    setLoadingVersions(false);
  };

  const createSnapshot = async () => {
    if (!token || !versionsTarget || busyId) return;
    setBusyId(`snap_${versionsTarget.id}`);
    const res = await apiFetch<{ version: BuilderProjectVersion }>(
      `/api/builders/projects/${versionsTarget.id}/versions`,
      {
        method: 'POST',
        body: JSON.stringify({ label: snapshotLabel.trim() || 'Workspace Snapshot' }),
      },
      token
    );
    setBusyId(null);
    if (res.ok) {
      setSnapshotLabel('');
      showToast('Version snapshot saved.', 'success');
      await openVersions(versionsTarget);
    } else {
      showToast(res.error ?? 'Could not save snapshot.', 'error');
    }
  };

  const confirmRestoreVersion = async () => {
    if (!token || !versionsTarget || !restoreCandidate) return;
    setBusyId(restoreCandidate.id);
    const res = await apiFetch<{ project: BuilderProject }>(
      `/api/builders/projects/${versionsTarget.id}/versions/${restoreCandidate.id}/restore`,
      { method: 'POST' },
      token
    );
    setBusyId(null);
    if (res.ok) {
      showToast(`Restored v${restoreCandidate.versionNumber}.`, 'success');
      setRestoreCandidate(null);
      setVersionsTarget(null);
      await loadProjects();
    } else {
      showToast(res.error ?? 'Could not restore version.', 'error');
    }
  };

  if (!user) {
    return (
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <UserCheck className="mt-0.5 h-5 w-5 text-[var(--afrinex-accent)] shrink-0" />
          <div className="space-y-1">
            <h1 className="font-display text-xl font-bold sm:text-2xl">My Workspace</h1>
            <p className="text-sm text-[var(--afrinex-muted)]">
              Sign in with Telegram to manage your builder projects, folders, favorites, and version snapshots.
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
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium text-[var(--afrinex-accent)]">
              My Workspace · {total} Project{total === 1 ? '' : 's'}
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Builder Projects & Versions
            </h1>
            <p className="mt-1 text-sm text-[var(--afrinex-muted)]">
              Search, organize in folders, pin favorites, duplicate, inspect snapshots, or launch in AI Builders.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('builders')}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-sm font-medium text-[var(--afrinex-accent-text)] hover:opacity-90 shrink-0 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            New Builder Project
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--afrinex-muted)]" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] pl-9 pr-3 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
            />
          </div>

          <select
            aria-label="Filter by builder type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | BuilderType)}
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
          >
            <option value="all">All 5 Builders</option>
            {BUILDER_CATALOG.map((item) => (
              <option key={item.id} value={item.id}>
                {item.shortLabel}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | BuilderProjectStatus)}
            className="min-h-[42px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2">
            <select
              aria-label="Filter by folder"
              value={folderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
              className="min-h-[42px] flex-1 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs"
            >
              <option value="all">All Folders</option>
              {folders.map((folder) => (
                <option key={folder} value={folder}>
                  {folder}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setFavoriteOnly((prev) => !prev)}
              aria-pressed={favoriteOnly}
              className={`min-h-[42px] inline-flex items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors shrink-0 ${
                favoriteOnly
                  ? 'border-[var(--afrinex-accent)] bg-[var(--afrinex-accent)]/15 text-[var(--afrinex-accent)]'
                  : 'border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
              }`}
            >
              <Star className={`h-3.5 w-3.5 ${favoriteOnly ? 'fill-current' : ''}`} />
              Starred
            </button>
          </div>
        </div>

        {error && <ErrorBanner message={error} onRetry={() => void loadProjects()} />}

        {renamingProject && (
          <form
            onSubmit={(e) => void handleSaveRenameFolder(e)}
            className="rounded-xl border border-[var(--afrinex-accent)]/40 bg-[var(--afrinex-bg)] p-4 space-y-3"
          >
            <p className="text-xs font-semibold">Edit Name & Folder</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                required
                minLength={2}
                maxLength={80}
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="Project name"
                className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
              />
              <input
                maxLength={40}
                value={folderInput}
                onChange={(e) => setFolderInput(e.target.value)}
                placeholder="Folder name (e.g. Client Bots)"
                className="min-h-[40px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={busyId !== null}
                className="min-h-[38px] rounded-lg bg-[var(--afrinex-accent)] px-4 text-xs font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
              >
                Save Changes
              </button>
              <button
                type="button"
                onClick={() => setRenamingProject(null)}
                className="min-h-[38px] rounded-lg border border-[var(--afrinex-border)] px-3 text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {versionsTarget && (
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold inline-flex items-center gap-1.5">
                  <History className="h-4 w-4 text-[var(--afrinex-accent)]" />
                  Version History — {versionsTarget.name}
                </p>
                <p className="text-[11px] text-[var(--afrinex-muted)]">
                  Automatic and manual snapshots stored in D1. Restore any snapshot safely.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVersionsTarget(null)}
                className="text-xs text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"
              >
                Close
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                value={snapshotLabel}
                onChange={(e) => setSnapshotLabel(e.target.value)}
                maxLength={80}
                placeholder="Snapshot label (optional)"
                className="min-h-[38px] flex-1 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-xs"
              />
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => void createSnapshot()}
                className="min-h-[38px] rounded-lg bg-[var(--afrinex-accent)] px-3.5 text-xs font-medium text-[var(--afrinex-accent-text)] disabled:opacity-50"
              >
                Save Snapshot
              </button>
            </div>

            {loadingVersions ? (
              <p className="text-xs text-[var(--afrinex-muted)]">Loading versions...</p>
            ) : versions.length === 0 ? (
              <p className="text-xs text-[var(--afrinex-muted)]">
                No snapshots recorded yet. Save one above to create a restore point.
              </p>
            ) : (
              <div className="divide-y divide-[var(--afrinex-border)] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)]">
                {versions.map((ver) => (
                  <div
                    key={ver.id}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        v{ver.versionNumber} · {ver.label}
                      </p>
                      <p className="text-[11px] text-[var(--afrinex-muted)]">
                        {ver.files.length} file(s) · {ver.status} · {ver.createdAt.slice(0, 16).replace('T', ' ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setRestoreCandidate(ver)}
                      className="min-h-[34px] inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <SkeletonList rows={4} />
        ) : projects.length === 0 ? (
          <EmptyState
            title="No workspace projects found"
            description={
              typeFilter === 'all' && statusFilter === 'all' && folderFilter === 'all' && !favoriteOnly && !debouncedSearch.trim()
                ? 'Generate your first Telegram Bot, AI Agent, Website, Mini App, or Automation workflow inside AI Builders.'
                : 'Try adjusting your search or filter criteria.'
            }
            actionLabel="Open AI Builders"
            onAction={() => onNavigate('builders')}
          />
        ) : (
          <div className="space-y-3">
            {projects.map((proj) => {
              const badge = BUILDER_STATUS_STYLES[proj.status] ?? BUILDER_STATUS_STYLES.draft;
              const catalog = getCatalogEntry(proj.builderType);
              return (
                <article
                  key={proj.id}
                  className="rounded-2xl border border-[var(--afrinex-border)] p-4 sm:p-5 space-y-3"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void toggleFavorite(proj)}
                          aria-label={proj.isFavorite ? 'Remove favorite' : 'Mark favorite'}
                          className="text-[var(--afrinex-muted)] hover:text-amber-400"
                        >
                          <Star
                            className={`h-4 w-4 ${
                              proj.isFavorite ? 'fill-amber-400 text-amber-400' : ''
                            }`}
                          />
                        </button>
                        <h2 className="font-display text-base font-semibold truncate">{proj.name}</h2>
                        <span className="rounded-md border border-[var(--afrinex-border)] px-2 py-0.5 text-[11px]">
                          {catalog.shortLabel}
                        </span>
                        <span className={`rounded-md border px-2 py-0.5 text-[11px] ${badge.className}`}>
                          {badge.label}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md border border-[var(--afrinex-border)] px-2 py-0.5 text-[11px] text-[var(--afrinex-muted)]">
                          <Folder className="h-3 w-3" />
                          {proj.folder || 'General'}
                        </span>
                      </div>

                      <p className="text-xs text-[var(--afrinex-muted)] line-clamp-2">{proj.prompt}</p>
                      <p className="font-mono text-[11px] text-[var(--afrinex-muted)] tabular-nums">
                        {proj.files.length} files · Created {proj.createdAt.slice(0, 10)} · Updated{' '}
                        {proj.updatedAt.slice(0, 16).replace('T', ' ')}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => onOpenProject(proj.id)}
                        className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--afrinex-accent)] px-3.5 text-xs font-medium text-[var(--afrinex-accent-text)] hover:opacity-90"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open in Builder
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setRenamingProject(proj);
                          setRenameInput(proj.name);
                          setFolderInput(proj.folder || 'General');
                        }}
                        className="min-h-[38px] inline-flex items-center gap-1 rounded-xl border border-[var(--afrinex-border)] px-3 text-xs hover:border-[var(--afrinex-accent)]"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Rename
                      </button>

                      <button
                        type="button"
                        disabled={busyId === proj.id}
                        onClick={() => void handleDuplicate(proj)}
                        className="min-h-[38px] inline-flex items-center gap-1 rounded-xl border border-[var(--afrinex-border)] px-3 text-xs hover:border-[var(--afrinex-accent)]"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Duplicate
                      </button>

                      <button
                        type="button"
                        onClick={() => void openVersions(proj)}
                        className="min-h-[38px] inline-flex items-center gap-1 rounded-xl border border-[var(--afrinex-border)] px-3 text-xs hover:border-[var(--afrinex-accent)]"
                      >
                        <History className="h-3.5 w-3.5" />
                        Versions
                      </button>

                      {proj.files.length > 0 && (
                        <button
                          type="button"
                          onClick={() => downloadProjectZip(proj.name, proj.files)}
                          className="min-h-[38px] inline-flex items-center gap-1 rounded-xl border border-[var(--afrinex-border)] px-3 text-xs hover:border-[var(--afrinex-accent)]"
                        >
                          <Download className="h-3.5 w-3.5" />
                          ZIP
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => setDeleteTarget(proj)}
                        aria-label={`Delete ${proj.name}`}
                        className="min-h-[38px] inline-flex items-center gap-1 rounded-xl border border-[var(--afrinex-border)] px-3 text-xs text-red-500 hover:border-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}

            <PaginationBar page={page} totalPages={totalPages} total={total} onPageChange={setPage} />
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Builder Project?"
        description={`This will permanently remove "${deleteTarget?.name ?? ''}" and all of its version snapshots from your AFRINEX workspace.`}
        confirmLabel="Delete Project"
        destructive
        busy={busyId === deleteTarget?.id}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(restoreCandidate)}
        title={`Restore v${restoreCandidate?.versionNumber ?? ''}?`}
        description="AFRINEX will automatically save a backup snapshot of your current project state before restoring this earlier version."
        confirmLabel="Restore Snapshot"
        busy={busyId === restoreCandidate?.id}
        onConfirm={confirmRestoreVersion}
        onCancel={() => setRestoreCandidate(null)}
      />
    </div>
  );
}
