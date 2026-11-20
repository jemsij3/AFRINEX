import { useCallback, useEffect, useState } from 'react';
import { HelpCircle, LifeBuoy, Send, UserCheck } from 'lucide-react';
import type {
  PlatformSectionId,
  SupportTicket,
  SupportTicketCategory,
} from '../../../shared/types.ts';
import {
  EmptyState,
  ErrorBanner,
  SkeletonList,
  useToast,
} from '../../components/FeedbackUI.tsx';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';
import { setTelegramClosingConfirmation } from '../../lib/telegram.ts';

interface SupportSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
}

const HELP_GUIDES = [
  {
    title: 'Getting Started & Telegram Authentication',
    body: 'AFRINEX authenticates securely via signed Telegram Mini App initData verified on Cloudflare Workers and issues short-lived session tokens without storing passwords.',
  },
  {
    title: 'AI Assistant & Daily Usage Limits',
    body: 'Free members receive a configurable daily allowance powered by Cloudflare Workers AI across AI, Technology, Web3, and Business topics. AFRINEX Pro lifts the daily message cap.',
  },
  {
    title: 'AI Builders & My Workspace',
    body: 'Generate structured specifications, source bundles, interactive test runs, and ZIP exports for Telegram Bots, AI Agents, Websites, Mini Apps, and Automation Workflows. Organize and restore version snapshots inside My Workspace.',
  },
  {
    title: 'Shared Integrations & Encrypted Secrets',
    body: 'Save webhook URLs, REST APIs, LLM endpoints, and Telegram Bot credentials inside Integrations. Sensitive tokens are encrypted with AES-256-GCM at rest and masked in UI responses.',
  },
  {
    title: 'Opportunity Tracker & Deadlines',
    body: 'Track application stages (Saved, Applied, Interviewing, Accepted, Rejected) with personal notes and deadline alerts inside Opportunities.',
  },
  {
    title: 'AFRINEX Pro via Telegram Stars (XTR)',
    body: 'Pro memberships use native Telegram Stars invoices. Once Telegram confirms successful_payment via webhook, your account upgrades automatically and appears in Dashboard billing history.',
  },
];

export function SupportSection({ onNavigate }: SupportSectionProps) {
  const { user, token } = useAuth();
  const { showToast } = useToast();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [category, setCategory] = useState<SupportTicketCategory>('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isDirty = Boolean(subject.trim() || message.trim());
  useEffect(() => {
    setTelegramClosingConfirmation(isDirty);
    return () => setTelegramClosingConfirmation(false);
  }, [isDirty]);

  const loadTickets = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    const res = await apiFetch<{ tickets: SupportTicket[] }>('/api/support/tickets', undefined, token);
    if (res.ok && res.data) {
      setTickets(res.data.tickets);
    } else {
      setError(res.error ?? 'Could not load support tickets.');
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    if (user && token) {
      void loadTickets();
    } else {
      setLoading(false);
    }
  }, [user, token, loadTickets]);

  const submitTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || submitting) return;
    if (subject.trim().length < 4) {
      showToast('Subject must be at least 4 characters.', 'error');
      return;
    }
    if (message.trim().length < 10) {
      showToast('Please provide at least 10 characters explaining your request.', 'error');
      return;
    }

    setSubmitting(true);
    setError(null);
    const res = await apiFetch<{ ticket: SupportTicket }>(
      '/api/support/tickets',
      {
        method: 'POST',
        body: JSON.stringify({
          category,
          subject: subject.trim(),
          message: message.trim(),
        }),
      },
      token
    );
    setSubmitting(false);

    if (res.ok) {
      setSubject('');
      setMessage('');
      showToast('Support ticket submitted.', 'success');
      await loadTickets();
    } else {
      setError(res.error ?? 'Could not submit support ticket.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Platform Documentation & FAQ */}
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
        <div>
          <p className="text-xs font-medium text-[var(--afrinex-accent)] inline-flex items-center gap-1.5">
            <HelpCircle className="h-3.5 w-3.5" />
            Documentation & Guides
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            AFRINEX Help & Support
          </h1>
          <p className="mt-1 text-sm text-[var(--afrinex-muted)]">
            Explore how each AFRINEX capability works or submit a tracked support ticket directly to platform administrators.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {HELP_GUIDES.map((guide) => (
            <article
              key={guide.title}
              className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2"
            >
              <h2 className="font-display text-sm font-semibold">{guide.title}</h2>
              <p className="text-xs leading-relaxed text-[var(--afrinex-muted)]">{guide.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* Support Tickets */}
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-5 sm:p-7 space-y-5">
        <div className="flex items-center gap-2">
          <LifeBuoy className="h-5 w-5 text-[var(--afrinex-accent)]" />
          <h2 className="font-display text-lg font-semibold">Contact Support</h2>
        </div>

        {!user ? (
          <div className="rounded-xl border border-[var(--afrinex-border)] p-5 space-y-3">
            <div className="flex items-start gap-3">
              <UserCheck className="mt-0.5 h-5 w-5 text-[var(--afrinex-accent)] shrink-0" />
              <div className="space-y-1">
                <p className="font-display text-sm font-semibold">Sign in to submit a support ticket</p>
                <p className="text-xs text-[var(--afrinex-muted)]">
                  Tickets are linked directly to your Telegram member account so admins can reply in-app.
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
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_1.2fr]">
            <form onSubmit={(e) => void submitTicket(e)} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
                  Topic Category
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
                  className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                >
                  <option value="general">General Question</option>
                  <option value="account">Account & Telegram Auth</option>
                  <option value="billing">AFRINEX Pro & Stars Billing</option>
                  <option value="builders">AI Builders & Workspace</option>
                  <option value="integrations">Integrations & Webhooks</option>
                  <option value="bug">Report an Issue</option>
                  <option value="feature">Feature Request</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
                  Subject
                </label>
                <input
                  required
                  minLength={4}
                  maxLength={140}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Short summary of your request"
                  className="min-h-[42px] w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-medium text-[var(--afrinex-muted)]">
                  Details
                </label>
                <textarea
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Describe what happened or what you need help with..."
                  className="w-full rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] p-3 text-sm"
                />
              </div>

              {error && <ErrorBanner message={error} onRetry={() => void loadTickets()} />}

              <button
                type="submit"
                disabled={submitting}
                className="min-h-[44px] inline-flex items-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)] hover:opacity-90 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
                {submitting ? 'Submitting Ticket...' : 'Submit Support Ticket'}
              </button>
            </form>

            <div className="space-y-3">
              <h3 className="font-display text-sm font-semibold">
                My Support Tickets ({tickets.length})
              </h3>
              {loading ? (
                <SkeletonList rows={3} />
              ) : tickets.length === 0 ? (
                <EmptyState
                  title="No support tickets yet"
                  description="Any questions or bug reports you submit will appear here along with administrator replies."
                />
              ) : (
                <div className="space-y-3">
                  {tickets.map((ticket) => (
                    <article
                      key={ticket.id}
                      className="rounded-xl border border-[var(--afrinex-border)] p-4 space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-sm">{ticket.subject}</span>
                        <span
                          className={`rounded-md border px-2 py-0.5 text-[10px] uppercase font-mono ${
                            ticket.status === 'resolved' || ticket.status === 'closed'
                              ? 'border-emerald-500/40 text-emerald-500'
                              : ticket.status === 'in_progress'
                                ? 'border-amber-500/40 text-amber-400'
                                : 'border-[var(--afrinex-border)] text-[var(--afrinex-muted)]'
                          }`}
                        >
                          {ticket.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-[var(--afrinex-muted)] whitespace-pre-line">
                        {ticket.message}
                      </p>
                      <p className="font-mono text-[11px] text-[var(--afrinex-muted)]">
                        {ticket.category} · Submitted {ticket.createdAt.slice(0, 10)}
                      </p>
                      {ticket.adminReply && (
                        <div className="rounded-lg border border-[var(--afrinex-accent)]/40 bg-[var(--afrinex-accent)]/10 p-3 space-y-1">
                          <p className="font-semibold text-[var(--afrinex-accent)]">
                            Administrator Reply
                          </p>
                          <p className="whitespace-pre-line">{ticket.adminReply}</p>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
