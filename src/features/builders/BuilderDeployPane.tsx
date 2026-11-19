import { useEffect, useState } from 'react';
import { Check, CheckCircle2, Copy, Download, Rocket, Terminal, XCircle } from 'lucide-react';
import type { BuilderProject } from '../../../shared/types.ts';
import { copyTextToClipboard } from '../../lib/telegram.ts';
import { downloadProjectZip } from './zipExport.ts';

interface BuilderDeployPaneProps {
  project: BuilderProject;
  busyAction: string | null;
  onDeploy: (payload: {
    deployUrl: string | null;
    webhookUrl: string | null;
    markDeployed: boolean;
  }) => Promise<void>;
}

export function BuilderDeployPane({
  project,
  busyAction,
  onDeploy,
}: BuilderDeployPaneProps) {
  const deployment = project.spec.deployment;
  const [deployUrl, setDeployUrl] = useState(deployment?.deployUrl ?? '');
  const [webhookUrl, setWebhookUrl] = useState(deployment?.webhookUrl ?? '');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

  useEffect(() => {
    setDeployUrl(deployment?.deployUrl ?? '');
    setWebhookUrl(deployment?.webhookUrl ?? '');
    setDeployError(null);
  }, [project.id, deployment?.deployUrl, deployment?.webhookUrl]);

  const handleCopyCommand = async (cmd: string) => {
    const ok = await copyTextToClipboard(cmd);
    if (ok) {
      setCopiedCmd(cmd);
      setTimeout(() => setCopiedCmd(null), 1600);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeployError(null);
    try {
      await onDeploy({
        deployUrl: deployUrl.trim() || null,
        webhookUrl: webhookUrl.trim() || null,
        markDeployed: true,
      });
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Unable to save deployment configuration.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Deployment Readiness</h3>
            <span className="rounded-md border border-[var(--afrinex-border)] px-2 py-0.5 font-mono text-[11px]">
              {deployment?.targetEnvironment ?? project.spec.targetRuntime}
            </span>
          </div>

          <ul className="space-y-2 text-xs">
            {(deployment?.readinessChecks ?? []).map((item) => (
              <li
                key={item.label}
                className="flex items-start gap-2 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 py-2"
              >
                {item.passed ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 text-amber-400 shrink-0" />
                )}
                <div className="space-y-0.5">
                  <span className="block font-medium">{item.label}</span>
                  {item.note && (
                    <span className="block font-mono text-[11px] text-[var(--afrinex-muted)]">
                      {item.note}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="pt-1 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={project.files.length === 0}
              onClick={() => downloadProjectZip(project.name, project.files)}
              className="min-h-[40px] inline-flex items-center gap-2 rounded-xl border border-[var(--afrinex-border)] px-4 text-xs font-medium hover:border-[var(--afrinex-accent)] disabled:opacity-40"
            >
              <Download className="h-4 w-4" />
              Download ZIP Bundle ({project.files.length} files)
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold">Target URLs & Status</h3>
            {deployment?.deployedAt && (
              <span className="text-[11px] text-emerald-400 font-medium">
                Deployed {new Date(deployment.deployedAt).toLocaleDateString()}
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
              Deployed Worker / Pages URL (optional)
            </label>
            <input
              type="url"
              value={deployUrl}
              onChange={(e) => setDeployUrl(e.target.value)}
              placeholder="https://my-project.workers.dev"
              className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
            />
          </div>

          {(project.builderType === 'telegram_bot' ||
            project.builderType === 'workflow' ||
            project.builderType === 'mini_app') && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
                Webhook / Mini App Endpoint URL (optional)
              </label>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://my-project.workers.dev/webhook"
                className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
              />
            </div>
          )}

          {deployError && (
            <p className="text-xs text-amber-400">{deployError}</p>
          )}

          <button
            type="submit"
            disabled={busyAction !== null}
            className="min-h-[42px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-4 text-xs font-semibold text-[var(--afrinex-accent-text)] disabled:opacity-50"
          >
            <Rocket className="h-4 w-4" />
            {busyAction === 'deploy' ? 'Saving Deployment...' : 'Save Config & Mark Deployed'}
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2.5">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[var(--afrinex-accent)]" />
          <h3 className="font-display text-xs font-semibold uppercase tracking-wide text-[var(--afrinex-muted)]">
            Cloudflare Deployment Commands
          </h3>
        </div>
        <div className="space-y-2">
          {(deployment?.cliCommands ?? ['npx wrangler deploy']).map((cmd) => (
            <div
              key={cmd}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 py-2"
            >
              <code className="overflow-x-auto font-mono text-xs">{cmd}</code>
              <button
                type="button"
                onClick={() => void handleCopyCommand(cmd)}
                className="min-h-[30px] inline-flex items-center gap-1 rounded-md border border-[var(--afrinex-border)] px-2.5 text-[11px] shrink-0"
              >
                {copiedCmd === cmd ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
                {copiedCmd === cmd ? 'Copied' : 'Copy'}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
