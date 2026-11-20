import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  MessageSquarePlus,
  Pencil,
  SendHorizontal,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import type {
  AiChatResponse,
  AiConversation,
  AiMessage,
  AiTopic,
  PlatformSectionId,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';

interface AssistantUsage {
  used: number;
  limit: number | 'unlimited';
  plan: string;
  reset_at: string;
}

const TOPICS: Array<{ id: AiTopic; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'tech', label: 'Technology' },
  { id: 'ai', label: 'AI' },
  { id: 'web3', label: 'Web3' },
  { id: 'business', label: 'Business' },
];

const SUGGESTED_QUESTIONS: Record<AiTopic, string[]> = {
  general: [
    'What digital skills are most in demand across Africa and remote global teams?',
    'How can I turn a local business problem into a Telegram Mini App product?',
  ],
  tech: [
    'Compare Cloudflare Workers + D1 against traditional Node.js servers for mobile apps.',
    'How should I structure a TypeScript API with Hono and Zod validation?',
  ],
  ai: [
    'How do I build reliable structured JSON outputs with open-weight LLMs?',
    'Design a practical customer-support AI workflow for a small business.',
  ],
  web3: [
    'Explain how decentralized identity and verifiable credentials work in plain English.',
    'What security risks should builders check before integrating Web3 wallets?',
  ],
  business: [
    'Outline a lean launch plan for a B2B automation service in East or West Africa.',
    'How do digital creators monetize Telegram channels and Mini Apps sustainably?',
  ],
};

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Render a safe Markdown subset (code fences, inline code, bold, links) without raw HTML. */
function MarkdownText({ text }: { text: string }) {
  const blocks = text.split(/```([\s\S]*?)```/g);
  return (
    <div className="space-y-2 whitespace-pre-wrap break-words">
      {blocks.map((block, i) => {
        if (i % 2 === 1) {
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg bg-black/10 p-3 font-mono text-xs dark:bg-white/10"
            >
              <code>{block.replace(/^\w+\n/, '')}</code>
            </pre>
          );
        }
        const tokens = block.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s]+)/g);
        return (
          <span key={i}>
            {tokens.map((token, j) => {
              if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
                return <strong key={j}>{token.slice(2, -2)}</strong>;
              }
              if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
                return (
                  <code
                    key={j}
                    className="rounded bg-black/10 px-1 py-0.5 font-mono text-[0.85em] dark:bg-white/10"
                  >
                    {token.slice(1, -1)}
                  </code>
                );
              }
              if (/^https?:\/\//.test(token)) {
                return (
                  <a
                    key={j}
                    href={token}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:opacity-80"
                  >
                    {token}
                  </a>
                );
              }
              return token;
            })}
          </span>
        );
      })}
    </div>
  );
}

interface AssistantSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
  initialPrompt?: string | null;
  onConsumeInitialPrompt?: () => void;
}

export function AssistantSection({
  onNavigate,
  initialPrompt,
  onConsumeInitialPrompt,
}: AssistantSectionProps) {
  const { user, token } = useAuth();
  const [topic, setTopic] = useState<AiTopic>('general');
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [usage, setUsage] = useState<AssistantUsage | null>(null);
  const [input, setInput] = useState<string>(() => initialPrompt?.trim() || '');
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [retryContent, setRetryContent] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      setInput(initialPrompt.trim());
      onConsumeInitialPrompt?.();
    }
  }, [initialPrompt, onConsumeInitialPrompt]);

  const loadConversations = useCallback(async () => {
    if (!token) return;
    setLoadingList(true);
    const res = await apiFetch<{ conversations: AiConversation[] }>(
      '/api/ai/conversations',
      undefined,
      token
    );
    if (res.ok && res.data) {
      setConversations(res.data.conversations);
    } else {
      setError(res.error ?? 'Unable to load conversation history.');
    }
    setLoadingList(false);
  }, [token]);

  const loadUsage = useCallback(async () => {
    if (!token) return;
    const res = await apiFetch<AssistantUsage>('/api/ai/usage', undefined, token);
    if (res.ok && res.data) {
      setUsage(res.data);
    }
  }, [token]);

  useEffect(() => {
    if (user && token) {
      void loadConversations();
      void loadUsage();
    } else {
      setConversations([]);
      setMessages([]);
      setActiveConversationId(null);
      setUsage(null);
    }
  }, [user, token, loadConversations, loadUsage]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const openConversation = async (conv: AiConversation) => {
    if (!token) return;
    setActiveConversationId(conv.id);
    setTopic(conv.topic);
    setRenamingId(null);
    setConfirmDeleteId(null);
    setLoadingMessages(true);
    setError(null);
    setRetryContent(null);
    const res = await apiFetch<{ conversation: AiConversation; messages: AiMessage[] }>(
      `/api/ai/conversations/${conv.id}/messages`,
      undefined,
      token
    );
    if (res.ok && res.data) {
      setMessages(res.data.messages);
    } else {
      setError(res.error ?? 'Unable to load conversation history.');
    }
    setLoadingMessages(false);
  };

  const startNewChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setError(null);
    setRetryContent(null);
    setRenamingId(null);
    setConfirmDeleteId(null);
  };

  const startRename = (conv: AiConversation) => {
    setConfirmDeleteId(null);
    setRenamingId(conv.id);
    setRenameTitle(conv.title);
  };

  const saveRename = async (convId: string) => {
    const trimmed = renameTitle.trim();
    if (!token || !trimmed) return;
    const res = await apiFetch<{ conversation: AiConversation }>(
      `/api/ai/conversations/${convId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ title: trimmed }),
      },
      token
    );
    if (res.ok && res.data?.conversation) {
      setConversations((prev) =>
        prev.map((item) => (item.id === convId ? res.data!.conversation : item))
      );
      setRenamingId(null);
    } else {
      setError(res.error ?? 'Could not rename conversation.');
    }
  };

  const deleteConversation = async (convId: string) => {
    if (!token) return;
    const res = await apiFetch(`/api/ai/conversations/${convId}`, { method: 'DELETE' }, token);
    if (res.ok) {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      setConfirmDeleteId(null);
      if (activeConversationId === convId) {
        startNewChat();
      }
    } else {
      setError(res.error ?? 'Could not delete conversation.');
    }
  };

  const sendMessage = async (textOverride?: string) => {
    const content = (textOverride ?? input).trim();
    if (content.length < 2 || sending || !token) return;

    setSending(true);
    setError(null);
    setRetryContent(null);
    if (!textOverride) {
      setInput('');
    }

    const optimisticUserMsg: AiMessage = {
      id: `pending_${Date.now()}`,
      conversationId: activeConversationId ?? 'pending',
      role: 'user',
      content,
      model: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    const res = await apiFetch<AiChatResponse>(
      '/api/ai/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          conversationId: activeConversationId ?? undefined,
          topic,
          message: content,
        }),
      },
      token
    );

    if (res.ok && res.data) {
      const { conversation, userMessage, assistantMessage } = res.data;
      setActiveConversationId(conversation.id);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== optimisticUserMsg.id),
        userMessage,
        assistantMessage,
      ]);
      setConversations((prev) => {
        const filtered = prev.filter((c) => c.id !== conversation.id);
        return [conversation, ...filtered];
      });
      void loadUsage();
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
      setInput(content);
      setRetryContent(content);
      setError(res.error ?? 'AFRINEX AI is temporarily unavailable. Please try again.');
    }

    setSending(false);
  };

  if (!user) {
    return (
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <UserCheck className="mt-0.5 h-5 w-5 text-[var(--afrinex-accent)] shrink-0" />
          <div className="space-y-1.5">
            <h1 className="font-display text-xl font-bold sm:text-2xl">
              AFRINEX AI Assistant
            </h1>
            <p className="text-sm text-[var(--afrinex-muted)]">
              Sign in through Telegram to ask questions and save context-aware conversations
              powered by Cloudflare Workers AI.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="min-h-[44px] rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 whitespace-nowrap"
        >
          Go to My Account
        </button>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      {/* Conversation History Rail */}
      <aside className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-4 flex flex-col gap-3 h-fit">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold">Conversations</h2>
          <button
            type="button"
            onClick={startNewChat}
            className="min-h-[36px] inline-flex items-center gap-1.5 rounded-lg border border-[var(--afrinex-border)] px-2.5 text-xs font-medium hover:border-[var(--afrinex-accent)] transition-colors whitespace-nowrap shrink-0"
          >
            <MessageSquarePlus className="h-3.5 w-3.5" />
            New Chat
          </button>
        </div>

        {loadingList ? (
          <p className="text-xs text-[var(--afrinex-muted)]">Loading history...</p>
        ) : conversations.length === 0 ? (
          <p className="text-xs text-[var(--afrinex-muted)]">
            No saved threads yet. Ask a question to start.
          </p>
        ) : (
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:max-h-[52dvh] lg:overflow-y-auto lg:pb-0">
            {conversations.map((conv) => {
              const active = conv.id === activeConversationId;
              const isRenaming = renamingId === conv.id;
              const isConfirmingDelete = confirmDeleteId === conv.id;
              return (
                <div
                  key={conv.id}
                  className={`flex items-center justify-between gap-1.5 rounded-xl border px-3 py-2 text-xs transition-colors shrink-0 lg:shrink ${
                    active
                      ? 'border-[var(--afrinex-accent)] bg-black/5 dark:bg-white/5'
                      : 'border-[var(--afrinex-border)]'
                  }`}
                >
                  {isRenaming ? (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveRename(conv.id);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-1"
                    >
                      <input
                        autoFocus
                        value={renameTitle}
                        onChange={(e) => setRenameTitle(e.target.value)}
                        maxLength={120}
                        aria-label="Conversation title"
                        className="min-w-0 flex-1 rounded-lg border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-2 py-1 text-xs focus:border-[var(--afrinex-accent)] focus:outline-none"
                      />
                      <button
                        type="submit"
                        aria-label="Save title"
                        className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-lg text-[var(--afrinex-accent)] hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label="Cancel rename"
                        onClick={() => setRenamingId(null)}
                        className="min-h-[28px] min-w-[28px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void openConversation(conv)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="font-medium truncate max-w-[160px] lg:max-w-none">
                          {conv.title}
                        </p>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--afrinex-muted)] capitalize">
                          <span>{conv.topic}</span>
                          {conv.updatedAt && (
                            <>
                              <span>·</span>
                              <span>{formatDate(conv.updatedAt)}</span>
                            </>
                          )}
                        </div>
                      </button>

                      {isConfirmingDelete ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => void deleteConversation(conv.id)}
                            className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
                          >
                            Delete
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-md border border-[var(--afrinex-border)] px-1.5 py-1 text-[11px] text-[var(--afrinex-muted)]"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            aria-label={`Rename ${conv.title}`}
                            onClick={() => startRename(conv)}
                            className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${conv.title}`}
                            onClick={() => {
                              setRenamingId(null);
                              setConfirmDeleteId(conv.id);
                            }}
                            className="min-h-[30px] min-w-[30px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-600 dark:hover:text-red-400"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="border-t border-[var(--afrinex-border)] pt-2.5 text-xs text-[var(--afrinex-muted)]">
          Daily usage:{' '}
          {usage?.limit === 'unlimited'
            ? 'Unlimited'
            : `${usage?.used ?? 0} / ${usage?.limit ?? 20} messages today`}
        </div>
      </aside>

      {/* Active Chat Workspace */}
      <section className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] flex flex-col min-h-[65dvh] lg:min-h-[72dvh]">
        {/* Header & Topic Switcher */}
        <div className="border-b border-[var(--afrinex-border)] p-4 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h1 className="font-display text-lg font-bold">AFRINEX AI Assistant</h1>
              <p className="text-xs text-[var(--afrinex-muted)]">
                Cloudflare Workers AI · Context-aware Q&A
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {TOPICS.map((item) => {
              const active = topic === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTopic(item.id)}
                  className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
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
        </div>

        {/* Message Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loadingMessages ? (
            <p className="text-sm text-[var(--afrinex-muted)]">Loading messages...</p>
          ) : messages.length === 0 ? (
            <div className="space-y-4 py-4">
              <p className="text-sm text-[var(--afrinex-muted)]">
                Ask anything about <span className="font-medium text-[var(--afrinex-text)]">{topic}</span> or choose a topic prompt below:
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SUGGESTED_QUESTIONS[topic].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void sendMessage(prompt)}
                    className="text-left rounded-xl border border-[var(--afrinex-border)] p-3.5 text-sm leading-snug hover:border-[var(--afrinex-accent)] transition-colors"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      isUser
                        ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)] whitespace-pre-wrap'
                        : 'border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)]'
                    }`}
                  >
                    {isUser ? msg.content : <MarkdownText text={msg.content} />}
                  </div>
                  <span className="mt-1 text-[11px] text-[var(--afrinex-muted)]">
                    {isUser ? 'You' : 'AFRINEX AI'}
                    {msg.model ? ` · ${msg.model.split('/').pop()}` : ''}
                  </span>
                </div>
              );
            })
          )}

          {sending && (
            <div className="text-xs text-[var(--afrinex-muted)]" aria-live="polite">
              Generating response with Cloudflare Workers AI...
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {/* Error & Composer */}
        <div className="border-t border-[var(--afrinex-border)] p-3 sm:p-4 space-y-2">
          {error && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-300"
            >
              <span>{error}</span>
              {retryContent && (
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => void sendMessage(retryContent)}
                  className="rounded-lg border border-amber-500/40 px-2.5 py-1 text-xs font-medium hover:bg-amber-500/10"
                >
                  Retry
                </button>
              )}
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage();
            }}
            className="flex items-end gap-2"
          >
            <textarea
              rows={2}
              maxLength={4000}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder={`Ask about ${topic}, products, or strategy...`}
              className="flex-1 resize-none rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3.5 py-2.5 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none"
            />
            <button
              type="submit"
              disabled={sending || input.trim().length < 2}
              aria-label="Send message"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl bg-[var(--afrinex-accent)] px-4 text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 disabled:opacity-40 shrink-0"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </form>
          <p className="text-right text-[10px] text-[var(--afrinex-muted)]">
            {input.length} / 4000 · Enter to send, Shift+Enter for newline
          </p>
        </div>
      </section>
    </div>
  );
}
