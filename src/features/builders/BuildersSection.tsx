import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Copy,
  Download,
  FileCode2,
  Folder,
  FolderOpen,
  History,
  Layers,
  Loader2,
  Pencil,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  Trash2,
  UserCheck,
} from 'lucide-react';
import type {
  AutomationBuilderConfig,
  BuilderFile,
  BuilderProject,
  BuilderProjectConfig,
  BuilderProjectStatus,
  BuilderProjectVersion,
  BuilderProvidersResponse,
  BuilderTestRun,
  BuilderType,
  PlatformSectionId,
} from '../../../shared/types.ts';
import {
  ConfirmDialog,
  EmptyState,
  ErrorBanner,
  SkeletonList,
  useToast,
} from '../../components/FeedbackUI.tsx';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import { setTelegramClosingConfirmation } from '../../lib/telegram.ts';
import { BuilderConfigFields } from './BuilderConfigFields.tsx';
import { BuilderDeployPane } from './BuilderDeployPane.tsx';
import { BuilderPreviewPane } from './BuilderPreviewPane.tsx';
import {
  BUILDER_CATALOG,
  BUILDER_STATUS_STYLES,
  type BuilderWorkspaceTab,
  getCatalogEntry,
  getDefaultBuilderConfig,
} from './builderCatalog.ts';
import { downloadProjectZip } from './zipExport.ts';

interface BuildersSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
  initialProjectId?: string | null;
}

const LIFECYCLE_STATUS_OPTIONS: Array<{ value: BuilderProjectStatus; label: string }> = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'generated', label: 'Generated' },
  { value: 'previewed', label: 'Tested / Previewed' },
  { value: 'completed', label: 'Completed' },
  { value: 'deployed', label: 'Deployed' },
  { value: 'failed', label: 'Attention / Failed' },
];

export function BuildersSection({ onNavigate, initialProjectId }: BuildersSectionProps) {
  const { user, token, platformConfig } = useAuth();
  const { showToast } = useToast();

  const [providers, setProviders] = useState<BuilderProvidersResponse | null>(null);
  const [builderType, setBuilderType] = useState<BuilderType>('telegram_bot');
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [config, setConfig] = useState<BuilderProjectConfig>(() =>
    getDefaultBuilderConfig('telegram_bot')
  );

  const [projects, setProjects] = useState<BuilderProject[]>([]);
  const [projectFilter, setProjectFilter] = useState<BuilderType | 'all'>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    initialProjectId ?? null
  );
  const [workspaceTab, setWorkspaceTab] = useState<BuilderWorkspaceTab>('plan');

  const [versions, setVersions] = useState<BuilderProjectVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [snapshotLabel, setSnapshotLabel] = useState('');
  const [restoreVersionTarget, setRestoreVersionTarget] = useState<BuilderProjectVersion | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<BuilderProject | null>(null);
  const [editingFolder, setEditingFolder] = useState<string>('');

  const [loadingProjects, setLoadingProjects] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastGenerationStep, setLastGenerationStep] = useState<'plan' | 'full'>('full');

  const enabledTypes = platformConfig?.enabledBuilderTypes;
  const visibleCatalog = useMemo(
    () =>
      enabledTypes && user?.role !== 'admin'
        ? BUILDER_CATALOG.filter((item) => enabledTypes.includes(item.id))
        : BUILDER_CATALOG,
    [enabledTypes, user?.role]
  );

  useEffect(() => {
    if (visibleCatalog.length > 0 && !visibleCatalog.some((t) => t.id === builderType)) {
      const nextType = visibleCatalog[0].id;
      setBuilderType(nextType);
      setConfig(getDefaultBuilderConfig(nextType, providers?.defaultModel));
    }
  }, [visibleCatalog, builderType, providers?.defaultModel]);

  const loadProviders = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch<BuilderProvidersResponse>('/api/builders/providers', undefined, token);
    if (res.ok && res.data) {
      setProviders(res.data);
    }
  }, [token]);

  const loadProjects = useCallback(async () => {
    if (!token) return;
    setLoadingProjects(true);
    const res = await apiFetch<{ projects: BuilderProject[] }>(
      '/api/builders/projects?per_page=50',
      undefined,
      token
    );
    if (res.ok && res.data) {
      setProjects(res.data.projects);
      setSelectedProjectId((current) => {
        if (initialProjectId && res.data!.projects.some((p) => p.id === initialProjectId)) {
          return initialProjectId;
        }
        if (current && res.data!.projects.some((p) => p.id === current)) return current;
        return res.data!.projects[0]?.id ?? null;
      });
    }
    setLoadingProjects(false);
  }, [token, initialProjectId]);

  useEffect(() => {
    if (user && token) {
      void loadProviders();
      void loadProjects();
    } else {
      setProjects([]);
      setSelectedProjectId(null);
    }
  }, [user, token, loadProviders, loadProjects]);

  useEffect(() => {
    if (initialProjectId) {
      setSelectedProjectId(initialProjectId);
    }
  }, [initialProjectId]);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  useEffect(() => {
    setEditingFolder(selectedProject?.folder ?? 'General');
  }, [selectedProject?.id, selectedProject?.folder]);

  const hasUnsavedEditorChanges = useMemo(() => {
    if (!editingProjectId) {
      return name.trim().length > 0 || prompt.trim().length > 0;
    }
    const target = projects.find((p) => p.id === editingProjectId);
    if (!target) return false;
    return target.name !== name || target.prompt !== prompt;
  }, [editingProjectId, name, prompt, projects]);

  useEffect(() => {
    setTelegramClosingConfirmation(hasUnsavedEditorChanges);
    return () => setTelegramClosingConfirmation(false);
  }, [hasUnsavedEditorChanges]);

  const loadVersions = useCallback(
    async (projectId: string) => {
      if (!token) return;
      setLoadingVersions(true);
      const res = await apiFetch<{ versions: BuilderProjectVersion[] }>(
        `/api/builders/projects/${projectId}/versions`,
        undefined,
        token
      );
      if (res.ok && res.data) {
        setVersions(res.data.versions);
      }
      setLoadingVersions(false);
    },
    [token]
  );

  useEffect(() => {
    if (selectedProject && workspaceTab === 'versions') {
      void loadVersions(selectedProject.id);
    }
  }, [selectedProject?.id, workspaceTab, loadVersions]);

  const filteredProjects = useMemo(
    () =>
      projectFilter === 'all'
        ? projects
        : projects.filter((p) => p.builderType === projectFilter),
    [projects, projectFilter]
  );

  const activeCatalog = getCatalogEntry(builderType);

  const switchBuilderType = (nextType: BuilderType) => {
    setEditingProjectId(null);
    setBuilderType(nextType);
    setConfig(getDefaultBuilderConfig(nextType, providers?.defaultModel));
    setError(null);
  };

  const resetToNewProject = () => {
    setEditingProjectId(null);
    setName('');
    setPrompt('');
    setConfig(getDefaultBuilderConfig(builderType, providers?.defaultModel));
    setError(null);
  };

  const reopenProjectForEdit = (proj: BuilderProject) => {
    setSelectedProjectId(proj.id);
    setEditingProjectId(proj.id);
    setBuilderType(proj.builderType);
    setName(proj.name);
    setPrompt(proj.prompt);
    setConfig(
      proj.spec.config ??
        getDefaultBuilderConfig(proj.builderType, providers?.defaultModel)
    );
    setError(null);
  };

  const upsertProjectInState = (updated: BuilderProject) => {
    setProjects((prev) => {
      const exists = prev.some((p) => p.id === updated.id);
      if (exists) {
        return prev.map((p) => (p.id === updated.id ? updated : p));
      }
      return [updated, ...prev];
    });
    setSelectedProjectId(updated.id);
  };

  const submitGenerate = async (generationStep: 'plan' | 'full') => {
    if (!token || busyAction) return;
    if (name.trim().length < 2) {
      setError('Enter a project name (at least 2 characters).');
      return;
    }
    if (prompt.trim().length < 10) {
      setError('Describe what your project should do (at least 10 characters).');
      return;
    }

    setLastGenerationStep(generationStep);
    setBusyAction(generationStep === 'plan' ? 'create-plan' : 'create-full');
    setProgressLabel(
      generationStep === 'plan'
        ? `Designing ${activeCatalog.shortLabel} specification & plan...`
        : `Generating ${activeCatalog.shortLabel} plan & multi-file source code...`
    );
    setError(null);

    const res = await apiFetch<{ project: BuilderProject | null }>(
      '/api/builders/projects',
      {
        method: 'POST',
        body: JSON.stringify({
          builderType,
          name: name.trim(),
          prompt: prompt.trim(),
          generationStep,
          config,
        }),
      },
      token
    );

    if (res.ok && res.data?.project) {
      const created = res.data.project;
      upsertProjectInState(created);
      setEditingProjectId(created.id);
      setWorkspaceTab(created.files.length > 0 ? 'files' : 'plan');
      showToast(
        generationStep === 'plan' ? 'Project plan created.' : 'Plan and source bundle generated.',
        'success'
      );
    } else {
      setError(res.error ?? 'Builder generation failed. Please retry.');
    }

    setBusyAction(null);
    setProgressLabel(null);
  };

  const handleSaveProjectChanges = async () => {
    if (!token || !editingProjectId || busyAction) return;
    setBusyAction('save-project');
    setProgressLabel('Saving project configuration...');
    setError(null);

    const res = await apiFetch<{ project: BuilderProject | null }>(
      `/api/builders/projects/${editingProjectId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          prompt: prompt.trim(),
          config,
        }),
      },
      token
    );

    if (res.ok && res.data?.project) {
      upsertProjectInState(res.data.project);
      showToast('Project configuration saved.', 'success');
    } else {
      setError(res.error ?? 'Unable to save project changes.');
    }

    setBusyAction(null);
    setProgressLabel(null);
  };

  const handleGenerateFiles = async (targetProjectId?: string) => {
    const id = targetProjectId ?? selectedProject?.id;
    if (!token || !id || busyAction) return;

    setBusyAction('generate-files');
    setProgressLabel('Generating modular Cloudflare source files from project plan...');
    setError(null);

    const useEditorValues = editingProjectId === id;
    const res = await apiFetch<{ project: BuilderProject | null }>(
      `/api/builders/projects/${id}/generate-files`,
      {
        method: 'POST',
        body: JSON.stringify(
          useEditorValues
            ? { name: name.trim(), prompt: prompt.trim(), config }
            : {}
        ),
      },
      token
    );

    if (res.ok && res.data?.project) {
      upsertProjectInState(res.data.project);
      setWorkspaceTab('files');
      showToast('Source files generated cleanly.', 'success');
    } else {
      setError(res.error ?? 'Could not generate source files.');
    }

    setBusyAction(null);
    setProgressLabel(null);
  };

  const handleRegenerateFile = async (filePath: string, instructions: string) => {
    if (!token || !selectedProject || busyAction) return;
    setBusyAction('regenerate-file');
    setProgressLabel(`Regenerating ${filePath}...`);
    setError(null);

    const res = await apiFetch<{ file: BuilderFile; project: BuilderProject | null }>(
      `/api/builders/projects/${selectedProject.id}/regenerate-file`,
      {
        method: 'POST',
        body: JSON.stringify({
          filePath,
          instructions: instructions.trim() || undefined,
        }),
      },
      token
    );

    if (res.ok && res.data?.project) {
      upsertProjectInState(res.data.project);
      showToast(`Regenerated ${filePath}.`, 'success');
    } else {
      setError(res.error ?? `Failed to regenerate ${filePath}.`);
    }

    setBusyAction(null);
    setProgressLabel(null);
  };

  const handleSaveFiles = async (files: BuilderFile[]) => {
    if (!token || !selectedProject || busyAction) return;
    setBusyAction('save-files');
    setError(null);

    const res = await apiFetch<{ project: BuilderProject | null }>(
      `/api/builders/projects/${selectedProject.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ files }),
      },
      token
    );

    if (res.ok && res.data?.project) {
      upsertProjectInState(res.data.project);
      showToast('Source files saved & versioned.', 'success');
    } else {
      setError(res.error ?? 'Failed to save edited files.');
    }

    setBusyAction(null);
  };

  const handleRunTest = async (payload: {
    testInput?: string;
    command?: string;
    payloadJson?: string;
  }): Promise<BuilderTestRun | null> => {
    if (!token || !selectedProject || busyAction) return null;
    setBusyAction('test');
    setError(null);

    const res = await apiFetch<{ testRun: BuilderTestRun; project: BuilderProject | null }>(
      `/api/builders/projects/${selectedProject.id}/test`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    );

    setBusyAction(null);

    if (res.ok && res.data?.project) {
      upsertProjectInState(res.data.project);
      return res.data.testRun;
    }

    throw new Error(res.error ?? 'Project test failed.');
  };

  const handleToggleWorkflowActive = async (isActive: boolean) => {
    if (!token || !selectedProject || busyAction) return;
    setBusyAction('toggle-workflow');
    const currentCfg = selectedProject.spec.config as AutomationBuilderConfig | undefined;
    const res = await apiFetch<{ project: BuilderProject | null }>(
      `/api/builders/projects/${selectedProject.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          isActive,
          ...(currentCfg ? { config: { ...currentCfg, isActive } } : {}),
        }),
      },
      token
    );
    if (res.ok && res.data?.project) {
      upsertProjectInState(res.data.project);
      if (editingProjectId === res.data.project.id && res.data.project.spec.config) {
        setConfig(res.data.project.spec.config);
      }
      showToast(isActive ? 'Workflow activated.' : 'Workflow paused.', 'info');
    }
    setBusyAction(null);
  };

  const handlePatchMetadata = async (
    proj: BuilderProject,
    patch: { folder?: string; isFavorite?: boolean; status?: BuilderProjectStatus }
  ) => {
    if (!token || busyAction) return;
    setBusyAction('patch-meta');
    const res = await apiFetch<{ project: BuilderProject | null }>(
      `/api/builders/projects/${proj.id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      },
      token
    );
    if (res.ok && res.data?.project) {
      upsertProjectInState(res.data.project);
      showToast('Project updated.', 'success');
    } else {
      showToast(res.error ?? 'Could not update project.', 'error');
    }
    setBusyAction(null);
  };

  const handleDuplicate = async (proj: BuilderProject) => {
    if (!token || busyAction) return;
    setBusyAction('duplicate');
    const res = await apiFetch<{ project: BuilderProject | null }>(
      `/api/builders/projects/${proj.id}/duplicate`,
      { method: 'POST' },
      token
    );
    if (res.ok && res.data?.project) {
      upsertProjectInState(res.data.project);
      showToast(`Created "${res.data.project.name}".`, 'success');
    } else {
      showToast(res.error ?? 'Could not duplicate project.', 'error');
    }
    setBusyAction(null);
  };

  const handleCreateSnapshot = async () => {
    if (!token || !selectedProject || busyAction) return;
    const label = snapshotLabel.trim() || `Checkpoint ${versions.length + 1}`;
    setBusyAction('create-snapshot');
    const res = await apiFetch<{ version: BuilderProjectVersion }>(
      `/api/builders/projects/${selectedProject.id}/versions`,
      {
        method: 'POST',
        body: JSON.stringify({ label }),
      },
      token
    );
    if (res.ok && res.data?.version) {
      setVersions((prev) => [res.data!.version, ...prev]);
      setSnapshotLabel('');
      showToast(`Saved version v${res.data.version.versionNumber}.`, 'success');
    } else {
      showToast(res.error ?? 'Could not save snapshot.', 'error');
    }
    setBusyAction(null);
  };

  const handleConfirmRestoreVersion = async () => {
    if (!token || !selectedProject || !restoreVersionTarget) return;
    setBusyAction('restore-version');
    const res = await apiFetch<{ project: BuilderProject | null }>(
      `/api/builders/projects/${selectedProject.id}/versions/${restoreVersionTarget.id}/restore`,
      { method: 'POST' },
      token
    );
    if (res.ok && res.data?.project) {
      upsertProjectInState(res.data.project);
      await loadVersions(selectedProject.id);
      showToast(`Restored snapshot v${restoreVersionTarget.versionNumber}.`, 'success');
    } else {
      showToast(res.error ?? 'Could not restore version.', 'error');
    }
    setRestoreVersionTarget(null);
    setBusyAction(null);
  };

  const handleDeploy = async (payload: {
    deployUrl: string | null;
    webhookUrl: string | null;
    markDeployed: boolean;
  }) => {
    if (!token || !selectedProject || busyAction) return;
    setBusyAction('deploy');
    setError(null);

    const res = await apiFetch<{ project: BuilderProject | null }>(
      `/api/builders/projects/${selectedProject.id}/deploy`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      token
    );

    setBusyAction(null);

    if (res.ok && res.data?.project) {
      upsertProjectInState(res.data.project);
      showToast(
        payload.markDeployed ? 'Project marked deployed.' : 'Deployment configuration saved.',
        'success'
      );
      return;
    }

    throw new Error(res.error ?? 'Could not save deployment settings.');
  };

  const handleConfirmDelete = async () => {
    if (!token || !deleteTarget) return;
    setBusyAction('delete');
    const id = deleteTarget.id;
    const res = await apiFetch(`/api/builders/projects/${id}`, { method: 'DELETE' }, token);
    if (res.ok) {
      const next = projects.filter((p) => p.id !== id);
      setProjects(next);
      if (selectedProjectId === id) {
        setSelectedProjectId(next[0]?.id ?? null);
      }
      if (editingProjectId === id) {
        resetToNewProject();
      }
      showToast(`Deleted "${deleteTarget.name}".`, 'info');
    } else {
      showToast(res.error ?? 'Could not delete project.', 'error');
    }
    setDeleteTarget(null);
    setBusyAction(null);
  };

  if (!user) {
    return (
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <UserCheck className="mt-0.5 h-5 w-5 text-[var(--afrinex-accent)] shrink-0" />
          <div className="space-y-1.5">
            <h1 className="font-display text-xl font-bold sm:text-2xl">
              AI Builders & Agents
            </h1>
            <p className="text-sm text-[var(--afrinex-muted)]">
              Sign in through Telegram to configure, generate, preview, test, and export
              Telegram Bots, AI Agents, Websites, Mini Apps, and Automation Workflows.
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

  const currentStageIndex = !selectedProject
    ? 1
    : selectedProject.status === 'deployed' || selectedProject.status === 'completed'
      ? 5
      : selectedProject.status === 'previewed'
        ? 4
        : selectedProject.files.length > 0
          ? 3
          : 2;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Builder Project"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? ''}" and all saved version snapshots? This cannot be undone.`}
        confirmLabel="Delete Project"
        destructive
        busy={busyAction === 'delete'}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={Boolean(restoreVersionTarget)}
        title={`Restore Version v${restoreVersionTarget?.versionNumber ?? ''}`}
        description={`Restore "${restoreVersionTarget?.label ?? ''}" (${restoreVersionTarget?.files.length ?? 0} files)? A new snapshot will be appended cleanly to your history.`}
        confirmLabel="Restore Snapshot"
        busy={busyAction === 'restore-version'}
        onConfirm={() => void handleConfirmRestoreVersion()}
        onCancel={() => setRestoreVersionTarget(null)}
      />

      {/* Builder Configuration & Generator */}
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-[var(--afrinex-accent)]">
              Modular Architecture · Source Generation · Versioning · Live Testing
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              AI Builders & Agents
            </h1>
            <p className="text-sm text-[var(--afrinex-muted)]">
              Choose one of five dedicated builders, configure its domain requirements, generate a
              structured plan and source bundle, manage versions, test interactively, and export.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('workspace')}
              className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--afrinex-border)] px-3.5 text-xs font-medium hover:border-[var(--afrinex-accent)]"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              My Workspace
            </button>
            {editingProjectId && (
              <button
                type="button"
                onClick={resetToNewProject}
                className="min-h-[38px] inline-flex items-center gap-1.5 rounded-xl border border-[var(--afrinex-border)] px-3.5 text-xs font-medium hover:border-[var(--afrinex-accent)]"
              >
                <Plus className="h-3.5 w-3.5" />
                New Project
              </button>
            )}
          </div>
        </div>

        {/* Lifecycle Stepper */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-[11px]">
          {[
            { step: 1, label: '1. Configure' },
            { step: 2, label: '2. Project Plan' },
            { step: 3, label: '3. Source Files' },
            { step: 4, label: '4. Preview & Test' },
            { step: 5, label: '5. Deploy / Export' },
          ].map((item) => {
            const reached = currentStageIndex >= item.step;
            return (
              <div
                key={item.step}
                className={`rounded-lg border px-2.5 py-1.5 text-center font-medium ${
                  reached
                    ? 'border-[var(--afrinex-accent)]/50 bg-[var(--afrinex-accent)]/10 text-[var(--afrinex-accent)]'
                    : 'border-[var(--afrinex-border)] text-[var(--afrinex-muted)]'
                }`}
              >
                {item.label}
              </div>
            );
          })}
        </div>

        {/* 5 Independent Builder Cards */}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {visibleCatalog.map((item) => {
            const active = builderType === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={Boolean(
                  editingProjectId &&
                    editingProjectId === selectedProject?.id &&
                    item.id !== builderType
                )}
                onClick={() => switchBuilderType(item.id)}
                className={`rounded-xl border p-3 text-left transition-colors ${
                  active
                    ? 'border-[var(--afrinex-accent)] bg-[var(--afrinex-accent)]/10'
                    : 'border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] hover:border-[var(--afrinex-accent)]/50'
                } disabled:opacity-50`}
              >
                <p className="text-xs font-semibold">{item.shortLabel}</p>
                <p className="mt-1 text-[11px] leading-snug text-[var(--afrinex-muted)]">
                  {item.tagline}
                </p>
              </button>
            );
          })}
        </div>

        {/* Project Name & Description */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
                Project Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={activeCatalog.defaultNamePlaceholder}
                className="min-h-[44px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3.5 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
                Target Runtime
              </label>
              <div className="min-h-[44px] flex items-center justify-between rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3.5 text-xs text-[var(--afrinex-muted)]">
                <span>{activeCatalog.runtimeLabel}</span>
                <button
                  type="button"
                  onClick={() => {
                    if (!name.trim()) setName(activeCatalog.defaultNamePlaceholder);
                    setPrompt(activeCatalog.samplePrompt);
                  }}
                  className="text-[11px] font-medium text-[var(--afrinex-accent)] hover:underline"
                >
                  Fill Sample Brief
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Project Description & Requirements
            </label>
            <textarea
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={activeCatalog.defaultPromptPlaceholder}
              className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
            />
          </div>

          <BuilderConfigFields
            builderType={builderType}
            config={config}
            providers={providers}
            onChange={setConfig}
          />

          {progressLabel && (
            <div className="flex items-center gap-2.5 rounded-xl border border-[var(--afrinex-accent)]/40 bg-[var(--afrinex-accent)]/10 px-4 py-3 text-xs font-medium">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--afrinex-accent)]" />
              <span>{progressLabel}</span>
            </div>
          )}

          {error && (
            <ErrorBanner
              message={error}
              onRetry={() => void submitGenerate(lastGenerationStep)}
            />
          )}

          <div className="flex flex-wrap items-center gap-2.5">
            {editingProjectId ? (
              <>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleSaveProjectChanges()}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] px-4 text-sm font-medium hover:border-[var(--afrinex-accent)] disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {busyAction === 'save-project' ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleGenerateFiles(editingProjectId)}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-semibold text-[var(--afrinex-accent-text)] hover:opacity-90 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  {busyAction === 'generate-files'
                    ? 'Regenerating Files...'
                    : 'Regenerate Files from Updated Config'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void submitGenerate('plan')}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] px-4 text-sm font-medium hover:border-[var(--afrinex-accent)] disabled:opacity-50"
                >
                  <Layers className="h-4 w-4" />
                  {busyAction === 'create-plan' ? 'Generating Plan...' : '1. Generate Project Plan'}
                </button>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void submitGenerate('full')}
                  className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-semibold text-[var(--afrinex-accent-text)] hover:opacity-90 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  {busyAction === 'create-full' ? 'Generating Plan & Code...' : 'Generate Plan & Source Code'}
                </button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Saved Projects Sidebar + Active Project Workspace */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[310px_1fr]">
        <aside className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-4 space-y-3 h-fit">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-sm font-semibold">
              Saved Projects ({projects.length})
            </h2>
            <select
              aria-label="Filter projects by builder type"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value as BuilderType | 'all')}
              className="rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-2 py-1 text-[11px]"
            >
              <option value="all">All Builders</option>
              {BUILDER_CATALOG.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.shortLabel}
                </option>
              ))}
            </select>
          </div>

          {loadingProjects ? (
            <SkeletonList rows={3} />
          ) : filteredProjects.length === 0 ? (
            <EmptyState
              title="No projects here yet"
              description="Configure a project above and generate a plan or full source bundle."
            />
          ) : (
            <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
              {filteredProjects.map((proj) => {
                const active = proj.id === selectedProjectId;
                const badge = BUILDER_STATUS_STYLES[proj.status] ?? BUILDER_STATUS_STYLES.draft;
                const cat = getCatalogEntry(proj.builderType);
                return (
                  <div
                    key={proj.id}
                    className={`rounded-xl border p-3 text-xs space-y-2 ${
                      active
                        ? 'border-[var(--afrinex-accent)] bg-black/5 dark:bg-white/5'
                        : 'border-[var(--afrinex-border)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        setWorkspaceTab(proj.files.length > 0 ? 'preview' : 'plan');
                      }}
                      className="w-full text-left space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold truncate inline-flex items-center gap-1">
                          {proj.isFavorite && (
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400 shrink-0" />
                          )}
                          <span className="truncate">{proj.name}</span>
                        </p>
                        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] shrink-0 ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--afrinex-muted)]">
                        {cat.shortLabel} · {proj.folder || 'General'} · {proj.files.length} file(s)
                      </p>
                    </button>

                    <div className="flex items-center justify-between gap-1 pt-1 border-t border-[var(--afrinex-border)]">
                      <button
                        type="button"
                        onClick={() => reopenProjectForEdit(proj)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-accent)]"
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDuplicate(proj)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-accent)]"
                      >
                        <Copy className="h-3 w-3" />
                        Duplicate
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${proj.name}`}
                        onClick={() => setDeleteTarget(proj)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--afrinex-muted)] hover:text-red-500"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <div className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-6 space-y-5 min-w-0">
          {!selectedProject ? (
            <EmptyState
              title="Select or generate a builder project"
              description="Each project keeps its own specification, multi-file source bundle, version snapshots, test history, and Cloudflare deployment configuration."
            />
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--afrinex-border)] pb-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-bold">{selectedProject.name}</h2>
                    <span className="rounded-md border border-[var(--afrinex-border)] px-2 py-0.5 text-[11px]">
                      {getCatalogEntry(selectedProject.builderType).shortLabel}
                    </span>
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] ${
                        (BUILDER_STATUS_STYLES[selectedProject.status] ?? BUILDER_STATUS_STYLES.draft).className
                      }`}
                    >
                      {(BUILDER_STATUS_STYLES[selectedProject.status] ?? BUILDER_STATUS_STYLES.draft).label}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--afrinex-muted)]">
                    {selectedProject.spec.generationMode === 'workers_ai'
                      ? `Workers AI (${selectedProject.spec.modelUsed ?? 'default'})`
                      : 'Modular Blueprint'}{' '}
                    · {selectedProject.spec.targetRuntime} · Updated{' '}
                    {new Date(selectedProject.updatedAt).toLocaleString()}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    aria-label="Toggle project favorite"
                    onClick={() =>
                      void handlePatchMetadata(selectedProject, {
                        isFavorite: !selectedProject.isFavorite,
                      })
                    }
                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${
                        selectedProject.isFavorite ? 'fill-amber-400 text-amber-400' : ''
                      }`}
                    />
                    {selectedProject.isFavorite ? 'Starred' : 'Star'}
                  </button>

                  <select
                    aria-label="Project lifecycle status"
                    value={selectedProject.status}
                    onChange={(e) =>
                      void handlePatchMetadata(selectedProject, {
                        status: e.target.value as BuilderProjectStatus,
                      })
                    }
                    className="min-h-[36px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-2.5 text-xs"
                  >
                    {LIFECYCLE_STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        Status: {opt.label}
                      </option>
                    ))}
                  </select>

                  <div className="inline-flex items-center gap-1 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-2 py-1">
                    <Folder className="h-3.5 w-3.5 text-[var(--afrinex-muted)]" />
                    <input
                      value={editingFolder}
                      onChange={(e) => setEditingFolder(e.target.value)}
                      onBlur={() => {
                        const trimmed = editingFolder.trim() || 'General';
                        if (trimmed !== (selectedProject.folder ?? 'General')) {
                          void handlePatchMetadata(selectedProject, { folder: trimmed });
                        }
                      }}
                      placeholder="Folder"
                      aria-label="Project folder"
                      className="w-24 bg-transparent text-xs focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => reopenProjectForEdit(selectedProject)}
                    className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit Config
                  </button>
                  {selectedProject.files.length > 0 && (
                    <button
                      type="button"
                      onClick={() => downloadProjectZip(selectedProject.name, selectedProject.files)}
                      className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export ZIP
                    </button>
                  )}
                </div>
              </div>

              {/* Workspace Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {[
                  { id: 'plan' as const, label: 'Project Plan', icon: Layers },
                  {
                    id: 'files' as const,
                    label: `Source Files (${selectedProject.files.length})`,
                    icon: FileCode2,
                  },
                  { id: 'preview' as const, label: 'Preview & Test', icon: Play },
                  { id: 'versions' as const, label: 'Versions', icon: History },
                  { id: 'deploy' as const, label: 'Deploy & Export', icon: Rocket },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = workspaceTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setWorkspaceTab(tab.id)}
                      className={`min-h-[38px] inline-flex items-center gap-1.5 rounded-xl px-3.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                        active
                          ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)] font-semibold'
                          : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {workspaceTab === 'deploy' ? (
                <BuilderDeployPane
                  project={selectedProject}
                  busyAction={busyAction}
                  onDeploy={handleDeploy}
                />
              ) : workspaceTab === 'versions' ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5">
                    <input
                      value={snapshotLabel}
                      onChange={(e) => setSnapshotLabel(e.target.value)}
                      placeholder="Snapshot label (e.g. Before adding webhook handler)"
                      className="min-h-[40px] flex-1 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void handleCreateSnapshot()}
                      className="min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {busyAction === 'create-snapshot' ? 'Saving...' : 'Save Snapshot'}
                    </button>
                  </div>

                  {loadingVersions ? (
                    <SkeletonList rows={3} />
                  ) : versions.length === 0 ? (
                    <EmptyState
                      title="No saved versions yet"
                      description="Snapshots are captured automatically when plans or files change, or you can save a manual checkpoint above."
                    />
                  ) : (
                    <div className="divide-y divide-[var(--afrinex-border)] rounded-xl border border-[var(--afrinex-border)]">
                      {versions.map((ver) => (
                        <div
                          key={ver.id}
                          className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 text-xs"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[var(--afrinex-accent)]">
                                v{ver.versionNumber}
                              </span>
                              <span className="font-medium truncate">{ver.label}</span>
                            </div>
                            <p className="text-[11px] text-[var(--afrinex-muted)]">
                              {ver.files.length} file(s) · Status: {ver.status} ·{' '}
                              {new Date(ver.createdAt).toLocaleString()}
                            </p>
                          </div>

                          <button
                            type="button"
                            disabled={busyAction !== null}
                            onClick={() => setRestoreVersionTarget(ver)}
                            className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 font-medium hover:border-[var(--afrinex-accent)] self-start sm:self-auto"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Restore
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <BuilderPreviewPane
                  project={selectedProject}
                  activeTab={workspaceTab}
                  busyAction={busyAction}
                  onGenerateFiles={() => handleGenerateFiles(selectedProject.id)}
                  onRegenerateFile={handleRegenerateFile}
                  onSaveFiles={handleSaveFiles}
                  onRunTest={handleRunTest}
                  onToggleWorkflowActive={handleToggleWorkflowActive}
                />
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
