import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode2,
  Play,
  RefreshCw,
  Save,
  Send,
  Smartphone,
  Sparkles,
  Workflow,
  XCircle,
} from 'lucide-react';
import type {
  AiAgentBuilderConfig,
  AutomationBuilderConfig,
  BuilderFile,
  BuilderProject,
  BuilderTestRun,
  MiniAppBuilderConfig,
  TelegramBotBuilderConfig,
  WebsiteBuilderConfig,
} from '../../../shared/types.ts';
import { copyTextToClipboard } from '../../lib/telegram.ts';
import type { BuilderWorkspaceTab } from './builderCatalog.ts';
import { downloadProjectZip } from './zipExport.ts';

interface BuilderPreviewPaneProps {
  project: BuilderProject;
  activeTab: Extract<BuilderWorkspaceTab, 'plan' | 'files' | 'preview'>;
  busyAction: string | null;
  onGenerateFiles: () => Promise<void>;
  onRegenerateFile: (filePath: string, instructions: string) => Promise<void>;
  onSaveFiles: (files: BuilderFile[]) => Promise<void>;
  onRunTest: (payload: { testInput?: string; command?: string; payloadJson?: string }) => Promise<BuilderTestRun | null>;
  onToggleWorkflowActive: (isActive: boolean) => Promise<void>;
}

function buildWebsiteSrcDoc(files: BuilderFile[]): string {
  const htmlFile = files.find((f) => f.path === 'index.html')?.content ?? '';
  const cssFile = files.find((f) => f.path === 'styles.css')?.content ?? '';
  const jsFile = files.find((f) => f.path === 'app.js')?.content ?? '';

  if (!htmlFile.trim()) {
    return '<!doctype html><html><body style="font-family:system-ui;padding:24px"><p>Generate source files to render the live website preview.</p></body></html>';
  }

  let output = htmlFile;
  if (cssFile.trim()) {
    const linkPattern = /<link[^>]+href=["']\.?\/?styles\.css["'][^>]*>/i;
    const styleBlock = `<style>\n${cssFile}\n</style>`;
    if (linkPattern.test(output)) {
      output = output.replace(linkPattern, styleBlock);
    } else if (output.includes('</head>')) {
      output = output.replace('</head>', `${styleBlock}\n</head>`);
    } else {
      output = `${styleBlock}\n${output}`;
    }
  }

  if (jsFile.trim()) {
    const scriptPattern = /<script[^>]+src=["']\.?\/?app\.js["'][^>]*><\/script>/i;
    const scriptBlock = `<script>\n${jsFile}\n</script>`;
    if (scriptPattern.test(output)) {
      output = output.replace(scriptPattern, scriptBlock);
    } else if (output.includes('</body>')) {
      output = output.replace('</body>', `${scriptBlock}\n</body>`);
    } else {
      output = `${output}\n${scriptBlock}`;
    }
  }

  return output;
}

export function BuilderPreviewPane({
  project,
  activeTab,
  busyAction,
  onGenerateFiles,
  onRegenerateFile,
  onSaveFiles,
  onRunTest,
  onToggleWorkflowActive,
}: BuilderPreviewPaneProps) {
  const [selectedFilePath, setSelectedFilePath] = useState<string>(
    project.files[0]?.path ?? ''
  );
  const [editingCode, setEditingCode] = useState(false);
  const [draftContent, setDraftContent] = useState('');
  const [regenInstructions, setRegenInstructions] = useState('');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);

  // Interactive test states
  const [botInput, setBotInput] = useState('');
  const [agentPrompt, setAgentPrompt] = useState(
    'Introduce your role and show how you handle an incoming user request.'
  );
  const [siteViewport, setSiteViewport] = useState<'desktop' | 'mobile'>('desktop');
  const [miniAppScreenIndex, setMiniAppScreenIndex] = useState(0);
  const [workflowPayload, setWorkflowPayload] = useState(
    JSON.stringify(
      {
        event: 'webhook_received',
        status: 'active',
        user: 'member_102',
        amount: 250,
      },
      null,
      2
    )
  );
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    if (project.files.length > 0 && !project.files.some((f) => f.path === selectedFilePath)) {
      setSelectedFilePath(project.files[0].path);
    } else if (project.files.length === 0) {
      setSelectedFilePath('');
    }
    setEditingCode(false);
    setMiniAppScreenIndex(0);
    setTestError(null);
  }, [project.id, project.files, selectedFilePath]);

  const activeFile = useMemo(
    () => project.files.find((f) => f.path === selectedFilePath) ?? project.files[0] ?? null,
    [project.files, selectedFilePath]
  );

  useEffect(() => {
    setDraftContent(activeFile?.content ?? '');
  }, [activeFile?.path, activeFile?.content]);

  const inlinedWebsiteDoc = useMemo(
    () => (project.builderType === 'website' ? buildWebsiteSrcDoc(project.files) : ''),
    [project.builderType, project.files]
  );

  const handleCopyFile = async () => {
    if (!activeFile) return;
    const ok = await copyTextToClipboard(activeFile.content);
    if (ok) {
      setCopiedPath(activeFile.path);
      setTimeout(() => setCopiedPath(null), 1600);
    }
  };

  const handleSaveEditedFile = async () => {
    if (!activeFile) return;
    const nextFiles = project.files.map((file) =>
      file.path === activeFile.path ? { ...file, content: draftContent } : file
    );
    await onSaveFiles(nextFiles);
    setEditingCode(false);
  };

  if (activeTab === 'plan') {
    const plan = project.spec.plan;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4">
          <div className="space-y-1 max-w-2xl">
            <p className="text-xs font-medium text-[var(--afrinex-accent)]">
              Architecture Plan & Specification
            </p>
            <p className="text-sm font-medium">{project.spec.architectureSummary}</p>
            <p className="text-xs text-[var(--afrinex-muted)]">
              {plan?.overview ?? project.prompt}
            </p>
          </div>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void onGenerateFiles()}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-semibold text-[var(--afrinex-accent-text)] hover:opacity-90 disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {busyAction === 'generate-files'
              ? 'Generating Source Files...'
              : project.files.length > 0
                ? 'Regenerate All Source Files'
                : 'Generate Source Files'}
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2">
            <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--afrinex-muted)]">
              Planned Modules
            </h3>
            <ul className="space-y-2 text-xs">
              {(plan?.modules ?? []).map((mod) => (
                <li key={mod.name} className="rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 py-2">
                  <span className="block font-mono font-semibold text-[var(--afrinex-accent)]">
                    {mod.name}
                  </span>
                  <span className="text-[var(--afrinex-muted)]">{mod.responsibility}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--afrinex-muted)]">
                Capabilities & Entry Points
              </h3>
              <ul className="space-y-1 text-xs">
                {project.spec.capabilities.map((cap) => (
                  <li key={cap}>· {cap}</li>
                ))}
              </ul>
              {plan?.entryPoints && plan.entryPoints.length > 0 && (
                <div className="pt-2 flex flex-wrap gap-1.5">
                  {plan.entryPoints.map((ep) => (
                    <span
                      key={ep}
                      className="rounded-md border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-2 py-0.5 font-mono text-[11px]"
                    >
                      {ep}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2">
              <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--afrinex-muted)]">
                Security & Data Models
              </h3>
              {plan?.dataModels && plan.dataModels.length > 0 && (
                <p className="font-mono text-[11px] text-[var(--afrinex-muted)]">
                  Tables: {plan.dataModels.join(', ')}
                </p>
              )}
              <ul className="space-y-1 text-xs text-[var(--afrinex-muted)]">
                {(plan?.securityControls ?? []).map((sec) => (
                  <li key={sec}>· {sec}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === 'files') {
    if (project.files.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-[var(--afrinex-border)] p-6 text-center space-y-3">
          <FileCode2 className="mx-auto h-7 w-7 text-[var(--afrinex-muted)]" />
          <div className="space-y-1">
            <p className="text-sm font-medium">No source files generated yet</p>
            <p className="text-xs text-[var(--afrinex-muted)]">
              This project currently holds a saved plan draft. Generate modular source files from
              your configuration to inspect, edit, test, and export.
            </p>
          </div>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => void onGenerateFiles()}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-semibold text-[var(--afrinex-accent-text)]"
          >
            <Sparkles className="h-4 w-4" />
            {busyAction === 'generate-files' ? 'Generating Files...' : 'Generate Source Files'}
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[230px_1fr]">
          <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-2.5 space-y-1 h-fit">
            <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--afrinex-muted)]">
              Project Files ({project.files.length})
            </p>
            {project.files.map((file) => {
              const selected = activeFile?.path === file.path;
              return (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => {
                    setSelectedFilePath(file.path);
                    setEditingCode(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left font-mono text-xs transition-colors ${
                    selected
                      ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)] font-semibold'
                      : 'text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <span className="truncate">{file.path}</span>
                  <span className="text-[10px] opacity-75">{file.language}</span>
                </button>
              );
            })}
          </div>

          {activeFile && (
            <div className="space-y-3 min-w-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Code2 className="h-4 w-4 text-[var(--afrinex-accent)]" />
                  <span className="font-mono text-xs font-semibold">{activeFile.path}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingCode((prev) => !prev)}
                    className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
                  >
                    {editingCode ? <Eye className="h-3.5 w-3.5" /> : <Code2 className="h-3.5 w-3.5" />}
                    {editingCode ? 'View Mode' : 'Edit File'}
                  </button>

                  {editingCode && (
                    <button
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void handleSaveEditedFile()}
                      className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg bg-[var(--afrinex-accent)] px-3 text-xs font-semibold text-[var(--afrinex-accent-text)]"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {busyAction === 'save-files' ? 'Saving...' : 'Save Edits'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleCopyFile()}
                    className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium"
                  >
                    {copiedPath === activeFile.path ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copiedPath === activeFile.path ? 'Copied' : 'Copy'}
                  </button>

                  <button
                    type="button"
                    onClick={() => downloadProjectZip(project.name, project.files)}
                    className="min-h-[34px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3 text-xs font-medium hover:border-[var(--afrinex-accent)]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Export ZIP
                  </button>
                </div>
              </div>

              {editingCode ? (
                <textarea
                  rows={16}
                  value={draftContent}
                  onChange={(e) => setDraftContent(e.target.value)}
                  spellCheck={false}
                  className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3.5 font-mono text-xs leading-relaxed focus:border-[var(--afrinex-accent)] focus:outline-none"
                />
              ) : (
                <pre className="max-h-[420px] overflow-auto rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 font-mono text-xs leading-relaxed">
                  <code>{activeFile.content}</code>
                </pre>
              )}

              <div className="flex flex-col gap-2 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 sm:flex-row sm:items-center">
                <input
                  type="text"
                  value={regenInstructions}
                  onChange={(e) => setRegenInstructions(e.target.value)}
                  placeholder={`Optional instructions to regenerate ${activeFile.path}...`}
                  className="min-h-[38px] flex-1 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={async () => {
                    await onRegenerateFile(activeFile.path, regenInstructions);
                    setRegenInstructions('');
                  }}
                  className="min-h-[38px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-3.5 text-xs font-medium hover:border-[var(--afrinex-accent)] disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${busyAction === 'regenerate-file' ? 'animate-spin' : ''}`}
                  />
                  {busyAction === 'regenerate-file' ? 'Regenerating...' : 'Regenerate File'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Interactive Preview & Testing per Builder Type
  const testHistory = project.spec.testHistory ?? [];
  const runSafeTest = async (payload: {
    testInput?: string;
    command?: string;
    payloadJson?: string;
  }) => {
    setTestError(null);
    try {
      await onRunTest(payload);
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'Test run failed.');
    }
  };

  return (
    <div className="space-y-4">
      {testError && (
        <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300">
          {testError}
        </p>
      )}

      {project.builderType === 'telegram_bot' && (() => {
        const c = project.spec.config as TelegramBotBuilderConfig | undefined;
        const cmds = c?.commands ?? ['/start', '/help'];
        return (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-[var(--afrinex-border)] pb-2.5">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[var(--afrinex-accent)]" />
                  <div>
                    <p className="text-xs font-semibold">{project.name}</p>
                    <p className="text-[11px] text-[var(--afrinex-muted)]">
                      Telegram Bot Simulator · {c?.webhookMode ?? 'webhook'}
                    </p>
                  </div>
                </div>
                <span className="rounded-md border border-[var(--afrinex-border)] px-2 py-0.5 font-mono text-[10px]">
                  {c?.keyboardType ?? 'inline'} menu
                </span>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] text-[var(--afrinex-muted)]">
                  Tap a command or keyboard button to test routing:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {cmds.map((cmd) => (
                    <button
                      key={cmd}
                      type="button"
                      disabled={busyAction !== null}
                      onClick={() => void runSafeTest({ command: cmd })}
                      className="min-h-[34px] rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 font-mono text-xs hover:border-[var(--afrinex-accent)]"
                    >
                      {cmd}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={botInput}
                  onChange={(e) => setBotInput(e.target.value)}
                  placeholder="Send custom command or text message..."
                  className="min-h-[40px] flex-1 rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
                />
                <button
                  type="button"
                  disabled={busyAction !== null || !botInput.trim()}
                  onClick={async () => {
                    await runSafeTest({ testInput: botInput.trim() });
                    setBotInput('');
                  }}
                  className="min-h-[40px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--afrinex-accent)] px-3.5 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
                >
                  <Send className="h-3.5 w-3.5" />
                  {busyAction === 'test' ? 'Testing...' : 'Send'}
                </button>
              </div>
            </div>

            <TestHistoryPanel runs={testHistory} emptyLabel="Run any bot command to verify webhook routing and keyboard replies." />
          </div>
        );
      })()}

      {project.builderType === 'ai_agent' && (() => {
        const c = project.spec.config as AiAgentBuilderConfig | undefined;
        return (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--afrinex-border)] pb-2.5">
                <div>
                  <p className="text-xs font-semibold">{c?.agentIdentity ?? project.name}</p>
                  <p className="font-mono text-[11px] text-[var(--afrinex-muted)]">
                    {c?.aiProviderModel ?? project.spec.modelUsed ?? 'Workers AI'}
                  </p>
                </div>
                <span className="rounded-md border border-[var(--afrinex-border)] px-2 py-0.5 text-[10px]">
                  {c?.memoryMode ?? 'd1_conversation'} · {c?.accessControl ?? 'authenticated'}
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-[var(--afrinex-muted)]">
                  Live Agent Test Prompt
                </label>
                <textarea
                  rows={3}
                  value={agentPrompt}
                  onChange={(e) => setAgentPrompt(e.target.value)}
                  className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
                />
              </div>

              <button
                type="button"
                disabled={busyAction !== null || !agentPrompt.trim()}
                onClick={() => void runSafeTest({ testInput: agentPrompt })}
                className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                {busyAction === 'test' ? 'Running Agent Turn...' : 'Run Live Agent Test'}
              </button>
            </div>

            <TestHistoryPanel runs={testHistory} emptyLabel="Run an agent test prompt to verify Workers AI inference and normalized text handling." />
          </div>
        );
      })()}

      {project.builderType === 'website' && (() => {
        const c = project.spec.config as WebsiteBuilderConfig | undefined;
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSiteViewport('desktop')}
                  className={`min-h-[34px] rounded-lg px-3 text-xs font-medium ${
                    siteViewport === 'desktop'
                      ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                      : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)]'
                  }`}
                >
                  Desktop View
                </button>
                <button
                  type="button"
                  onClick={() => setSiteViewport('mobile')}
                  className={`min-h-[34px] rounded-lg px-3 text-xs font-medium ${
                    siteViewport === 'mobile'
                      ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                      : 'border border-[var(--afrinex-border)] text-[var(--afrinex-muted)]'
                  }`}
                >
                  Mobile (390px)
                </button>
                <span className="text-[11px] text-[var(--afrinex-muted)]">
                  {c?.websiteType ?? 'saas'} · {c?.pages.join(' / ')}
                </span>
              </div>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runSafeTest({})}
                className="min-h-[36px] inline-flex items-center gap-1.5 rounded-xl bg-[var(--afrinex-accent)] px-3.5 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                {busyAction === 'test' ? 'Auditing...' : 'Run Website Audit'}
              </button>
            </div>

            <div className="flex justify-center rounded-xl border border-[var(--afrinex-border)] bg-black/20 p-3">
              <iframe
                title={`${project.name} Live Preview`}
                srcDoc={inlinedWebsiteDoc}
                sandbox="allow-scripts"
                className={`h-[420px] rounded-lg border border-[var(--afrinex-border)] bg-white transition-all ${
                  siteViewport === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
                }`}
              />
            </div>

            <TestHistoryPanel runs={testHistory} emptyLabel="Run the Website Audit to verify viewport responsiveness, stylesheet, pages, forms, and API routes." />
          </div>
        );
      })()}

      {project.builderType === 'mini_app' && (() => {
        const c = project.spec.config as MiniAppBuilderConfig | undefined;
        const screens = c?.screens && c.screens.length > 0 ? c.screens : ['Home', 'Explore', 'Profile'];
        const activeScreen = screens[miniAppScreenIndex] ?? screens[0];
        const isLightTheme = c?.mobileTheme === 'light';

        return (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">
            <div className="space-y-3">
              <div
                className={`mx-auto w-full max-w-[350px] overflow-hidden rounded-3xl border border-[var(--afrinex-border)] shadow-lg ${
                  isLightTheme ? 'bg-slate-50 text-slate-900' : 'bg-[#0e1621] text-slate-100'
                }`}
              >
                <div className="flex items-center justify-between border-b border-black/10 dark:border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs font-semibold truncate">{project.name}</span>
                  </div>
                  <span className="text-[10px] opacity-70">
                    {c?.telegramSdkEnabled ? 'Telegram WebApp' : 'Mobile WebApp'}
                  </span>
                </div>

                <div className="min-h-[250px] p-4 space-y-3">
                  <div className="rounded-xl border border-current/10 p-3 space-y-1">
                    <p className="text-[10px] uppercase tracking-wide text-emerald-500 font-semibold">
                      Active Screen
                    </p>
                    <h4 className="text-base font-bold">{activeScreen}</h4>
                    <p className="text-xs opacity-75">{project.prompt.slice(0, 140)}</p>
                  </div>

                  <div className="rounded-xl border border-current/10 p-3 text-xs space-y-1">
                    <p className="font-semibold">Runtime Capabilities</p>
                    <p className="opacity-75">Platform: {c?.targetPlatform ?? 'telegram_mini_app'}</p>
                    <p className="opacity-75">Auth: {c?.authMode ?? 'telegram_initdata'}</p>
                    <p className="opacity-75">Payments: {c?.paymentsMode ?? 'none'}</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-1 border-t border-black/10 dark:border-white/10 p-2">
                  {screens.slice(0, 4).map((screen, idx) => (
                    <button
                      key={screen}
                      type="button"
                      onClick={() => setMiniAppScreenIndex(idx)}
                      className={`rounded-xl py-2 px-1 text-[11px] font-medium truncate ${
                        idx === miniAppScreenIndex
                          ? 'bg-emerald-500 text-slate-950 font-semibold'
                          : 'opacity-70 hover:opacity-100'
                      }`}
                    >
                      {screen}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runSafeTest({})}
                className="w-full min-h-[40px] inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
              >
                <CheckCircle2 className="h-4 w-4" />
                {busyAction === 'test' ? 'Running Mini App Audit...' : 'Run Mini App Audit'}
              </button>
            </div>

            <TestHistoryPanel runs={testHistory} emptyLabel="Preview screens in the device shell and run the Mini App Audit to verify Telegram SDK, auth, and payments." />
          </div>
        );
      })()}

      {project.builderType === 'workflow' && (() => {
        const c = project.spec.config as AutomationBuilderConfig | undefined;
        return (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--afrinex-border)] pb-2.5">
                <div className="flex items-center gap-2">
                  <Workflow className="h-4 w-4 text-[var(--afrinex-accent)]" />
                  <span className="text-xs font-semibold">
                    Trigger: {c?.triggerType ?? 'webhook'}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void onToggleWorkflowActive(!(c?.isActive ?? false))}
                  className={`min-h-[30px] rounded-lg border px-2.5 text-[11px] font-semibold ${
                    c?.isActive
                      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
                      : 'border-[var(--afrinex-border)] text-[var(--afrinex-muted)]'
                  }`}
                >
                  {c?.isActive ? 'Active (Click to Pause)' : 'Paused (Click to Activate)'}
                </button>
              </div>

              <div className="space-y-1.5 text-xs">
                <p className="text-[11px] text-[var(--afrinex-muted)]">
                  Condition: <span className="font-mono">{c?.conditions || 'Always run'}</span>
                </p>
                <p className="text-[11px] text-[var(--afrinex-muted)]">
                  Mapping: <span className="font-mono">{c?.dataMapping || 'Pass-through'}</span>
                </p>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {(c?.actions ?? []).map((step, idx) => (
                    <span
                      key={`${step}-${idx}`}
                      className="rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] px-2.5 py-1 text-[11px]"
                    >
                      {idx + 1}. {step}
                    </span>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium text-[var(--afrinex-muted)]">
                  Sample Trigger JSON Payload
                </label>
                <textarea
                  rows={5}
                  value={workflowPayload}
                  onChange={(e) => setWorkflowPayload(e.target.value)}
                  className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-3 font-mono text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
                />
              </div>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void runSafeTest({ payloadJson: workflowPayload })}
                className="min-h-[40px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5" />
                {busyAction === 'test' ? 'Executing Pipeline...' : 'Execute Workflow Test'}
              </button>
            </div>

            <TestHistoryPanel runs={testHistory} emptyLabel="Execute a test payload to trace condition checks, field mapping, and ordered step execution." />
          </div>
        );
      })()}
    </div>
  );
}

function TestHistoryPanel({
  runs,
  emptyLabel,
}: {
  runs: BuilderTestRun[];
  emptyLabel: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3 h-fit">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--afrinex-muted)]">
          Test & Execution History ({runs.length})
        </h3>
      </div>

      {runs.length === 0 ? (
        <p className="text-xs text-[var(--afrinex-muted)]">{emptyLabel}</p>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
          {runs.map((run) => (
            <div
              key={run.id}
              className="rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 space-y-1.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-semibold">
                  {run.passed ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-amber-400" />
                  )}
                  {run.passed ? 'Passed' : 'Attention Required'}
                </span>
                <span className="font-mono text-[10px] text-[var(--afrinex-muted)]">
                  {new Date(run.executedAt).toLocaleTimeString()}
                </span>
              </div>
              <p className="font-mono text-[11px] text-[var(--afrinex-muted)]">
                Input: {run.inputSummary}
              </p>
              <p className="text-xs leading-relaxed whitespace-pre-wrap">{run.outputSummary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
