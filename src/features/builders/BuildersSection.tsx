import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, FileCode2, Plus, Trash2, UserCheck } from 'lucide-react';
import type { BuilderProject, BuilderType, PlatformSectionId } from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';

const BUILDER_TYPES: Array<{ id: BuilderType; label: string; hint: string }> = [
  { id: 'telegram_bot', label: 'Telegram Bot', hint: 'Webhook bot with commands & replies' },
  { id: 'ai_agent', label: 'AI Agent', hint: 'Cloudflare Workers AI reasoning workflow' },
  { id: 'website', label: 'Website', hint: 'Fast static edge landing or web product' },
  { id: 'mini_app', label: 'Mini App', hint: 'Telegram WebApp + Worker API' },
  { id: 'workflow', label: 'Automation', hint: 'Webhook-triggered business automation' },
];

interface BuildersSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
}

export function BuildersSection({ onNavigate }: BuildersSectionProps) {
  const { user, token } = useAuth();
  const [builderType, setBuilderType] = useState<BuilderType>('telegram_bot');
  const [name, setName] = useState('');
  const [prompt, setPrompt] = useState('');
  const [projects, setProjects] = useState<BuilderProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedFileIndex, setSelectedFileIndex] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const res = await apiFetch<{ projects: BuilderProject[] }>(
      '/api/builders/projects',
      undefined,
      token
    );
    if (res.ok && res.data) {
      setProjects(res.data.projects);
      if (res.data.projects.length > 0 && !selectedProjectId) {
        setSelectedProjectId(res.data.projects[0].id);
      }
    }
    setLoading(false);
  }, [token, selectedProjectId]);

  useEffect(() => {
    if (user && token) {
      void loadProjects();
    } else {
      setProjects([]);
      setSelectedProjectId(null);
    }
  }, [user, token, loadProjects]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || creating) return;

    setCreating(true);
    setError(null);
    const res = await apiFetch<{ project: BuilderProject | null }>(
      '/api/builders/projects',
      {
        method: 'POST',
        body: JSON.stringify({ builderType, name, prompt }),
      },
      token
    );

    if (res.ok && res.data?.project) {
      const created = res.data.project;
      setProjects((prev) => [created, ...prev]);
      setSelectedProjectId(created.id);
      setSelectedFileIndex(0);
      setName('');
      setPrompt('');
    } else {
      setError(res.error ?? 'Could not generate project blueprint.');
    }
    setCreating(false);
  };

  const handleDelete = async (id: string) => {
    if (!token) return;
    const res = await apiFetch(`/api/builders/projects/${id}`, { method: 'DELETE' }, token);
    if (res.ok) {
      const next = projects.filter((p) => p.id !== id);
      setProjects(next);
      if (selectedProjectId === id) {
        setSelectedProjectId(next[0]?.id ?? null);
        setSelectedFileIndex(0);
      }
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;
  const activeFile = selectedProject?.files[selectedFileIndex] ?? selectedProject?.files[0] ?? null;

  const copyFileContent = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable in restricted WebView
    }
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
              Sign in through Telegram to generate Cloudflare-compatible architecture
              blueprints and source files for bots, AI agents, websites, Mini Apps, and workflows.
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
        <div className="space-y-1">
          <p className="text-xs font-medium text-[var(--afrinex-accent)]">
            Project Blueprint & Code Generator
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            AI Builders & Agents
          </h1>
          <p className="text-sm text-[var(--afrinex-muted)]">
            Describe a bot, agent, website, Mini App, or automation in plain language to
            generate a structured Cloudflare project specification and exportable source files.
          </p>
        </div>

        <form onSubmit={(e) => void handleGenerate(e)} className="space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {BUILDER_TYPES.map((item) => {
              const active = builderType === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setBuilderType(item.id)}
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              required
              minLength={2}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              className="min-h-[44px] rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3.5 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
            />
            <div className="min-h-[44px] flex items-center rounded-xl border border-[var(--afrinex-border)] px-3.5 text-xs text-[var(--afrinex-muted)]">
              {BUILDER_TYPES.find((t) => t.id === builderType)?.hint}
            </div>
          </div>

          <textarea
            required
            minLength={10}
            maxLength={2000}
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what your product should do, who it serves, and key commands or pages..."
            className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
          />

          {error && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={creating}
            className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            {creating ? 'Generating Spec & Files...' : 'Generate Project Blueprint'}
          </button>
        </form>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-[290px_1fr]">
        <aside className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-4 space-y-3 h-fit">
          <h2 className="font-display text-sm font-semibold">
            Saved Projects ({projects.length})
          </h2>

          {loading ? (
            <p className="text-xs text-[var(--afrinex-muted)]">Loading projects...</p>
          ) : projects.length === 0 ? (
            <p className="text-xs text-[var(--afrinex-muted)]">
              No builder projects yet. Generate your first blueprint above.
            </p>
          ) : (
            <div className="space-y-2">
              {projects.map((proj) => {
                const active = proj.id === selectedProjectId;
                return (
                  <div
                    key={proj.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-xs ${
                      active
                        ? 'border-[var(--afrinex-accent)] bg-black/5 dark:bg-white/5'
                        : 'border-[var(--afrinex-border)]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProjectId(proj.id);
                        setSelectedFileIndex(0);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="font-medium truncate">{proj.name}</p>
                      <p className="text-[11px] text-[var(--afrinex-muted)] capitalize">
                        {proj.builderType.replace('_', ' ')} · {proj.spec.targetRuntime}
                      </p>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${proj.name}`}
                      onClick={() => void handleDelete(proj.id)}
                      className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </aside>

        <div className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-6 space-y-5">
          {!selectedProject ? (
            <p className="text-sm text-[var(--afrinex-muted)]">
              Select a saved project to inspect its architecture specification and generated files.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-lg font-bold">{selectedProject.name}</h2>
                  <span className="text-xs text-[var(--afrinex-muted)] font-mono">
                    {selectedProject.spec.generationMode === 'workers_ai'
                      ? 'Cloudflare Workers AI'
                      : 'Blueprint Template'}
                  </span>
                </div>
                <p className="text-sm text-[var(--afrinex-muted)]">
                  {selectedProject.spec.architectureSummary}
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2">
                  <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--afrinex-muted)]">
                    Capabilities
                  </h3>
                  <ul className="space-y-1 text-xs">
                    {selectedProject.spec.capabilities.map((cap) => (
                      <li key={cap}>· {cap}</li>
                    ))}
                  </ul>
                </div>

                <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2">
                  <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--afrinex-muted)]">
                    Required Environment Variables
                  </h3>
                  <p className="font-mono text-xs text-[var(--afrinex-muted)]">
                    {selectedProject.spec.envVarsNeeded.length > 0
                      ? selectedProject.spec.envVarsNeeded.join(', ')
                      : 'None required'}
                  </p>
                  <p className="text-xs text-[var(--afrinex-muted)] pt-1">
                    Blueprint files are ready to copy for deployment to Cloudflare.
                  </p>
                </div>
              </div>

              {selectedProject.files.length > 0 && (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-x-auto">
                      {selectedProject.files.map((file, index) => (
                        <button
                          key={file.path}
                          type="button"
                          onClick={() => setSelectedFileIndex(index)}
                          className={`min-h-[36px] inline-flex items-center gap-1.5 rounded-lg px-3 font-mono text-xs whitespace-nowrap shrink-0 ${
                            index === selectedFileIndex
                              ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                              : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)]'
                          }`}
                        >
                          <FileCode2 className="h-3.5 w-3.5" />
                          {file.path}
                        </button>
                      ))}
                    </div>

                    {activeFile && (
                      <button
                        type="button"
                        onClick={() => void copyFileContent()}
                        className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium"
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copied ? 'Copied' : 'Copy File'}
                      </button>
                    )}
                  </div>

                  {activeFile && (
                    <pre className="overflow-x-auto rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 text-xs leading-relaxed font-mono">
                      <code>{activeFile.content}</code>
                    </pre>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
