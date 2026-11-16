import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageSquarePlus, SendHorizontal, Trash2, UserCheck } from 'lucide-react';
import type {
  AiChatResponse,
  AiConversation,
  AiMessage,
  AiTopic,
  PlatformSectionId,
} from '../../../shared/types.ts';
import { apiFetch } from '../../lib/api.ts';
import { useAuth } from '../../lib/auth-context.tsx';

const TOPICS: Array<{ id: AiTopic; label: string }> = [
  { id: 'general', label: 'General' },
  { id: 'tech', label: 'Technology' },
  { id: 'ai', label: 'AI' },
  { id: 'web3', label: 'Web3' },
  { id: 'business', label: 'Business' },
];

const STARTER_PROMPTS: Record<AiTopic, string[]> = {
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

interface AssistantSectionProps {
  onNavigate: (section: PlatformSectionId) => void;
}

export function AssistantSection({ onNavigate }: AssistantSectionProps) {
  const { user, token } = useAuth();
  const [topic, setTopic] = useState<AiTopic>('general');
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState<string>('');
  const [loadingList, setLoadingList] = useState<boolean>(false);
  const [loadingMessages, setLoadingMessages] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const threadEndRef = useRef<HTMLDivElement | null>(null);

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
    }
    setLoadingList(false);
  }, [token]);

  useEffect(() => {
    if (user && token) {
      void loadConversations();
    } else {
      setConversations([]);
      setMessages([]);
      setActiveConversationId(null);
    }
  }, [user, token, loadConversations]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, sending]);

  const openConversation = async (conv: AiConversation) => {
    if (!token) return;
    setActiveConversationId(conv.id);
    setTopic(conv.topic);
    setLoadingMessages(true);
    setError(null);
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
  };

  const deleteConversation = async (convId: string) => {
    if (!token) return;
    const res = await apiFetch(`/api/ai/conversations/${convId}`, { method: 'DELETE' }, token);
    if (res.ok) {
      setConversations((prev) => prev.filter((c) => c.id !== convId));
      if (activeConversationId === convId) {
        startNewChat();
      }
    } else {
      setError(res.error ?? 'Could not delete conversation.');
    }
  };

  const sendMessage = async (textOverride?: string) => {
    const content = (textOverride ?? input).trim();
    if (!content || sending || !token) return;

    setSending(true);
    setError(null);
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
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
      setInput(content);
      setError(res.error ?? 'Workers AI request failed.');
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
              Sign in with your Telegram session (or local dev account) to ask questions and
              save context-aware conversations powered by Cloudflare Workers AI.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('dashboard')}
          className="min-h-[44px] rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)] transition-opacity hover:opacity-90 whitespace-nowrap"
        >
          Go to Dashboard Sign-In
        </button>
      </section>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[270px_1fr]">
      {/* Conversation History Rail */}
      <aside className="rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)] p-4 space-y-3 h-fit">
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
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {conversations.map((conv) => {
              const active = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition-colors shrink-0 lg:shrink ${
                    active
                      ? 'border-[var(--afrinex-accent)] bg-black/5 dark:bg-white/5'
                      : 'border-[var(--afrinex-border)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => void openConversation(conv)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p className="font-medium truncate max-w-[160px] lg:max-w-none">
                      {conv.title}
                    </p>
                    <p className="text-[11px] text-[var(--afrinex-muted)] capitalize">
                      {conv.topic}
                    </p>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${conv.title}`}
                    onClick={() => void deleteConversation(conv.id)}
                    className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-[var(--afrinex-muted)] hover:text-red-600 dark:hover:text-red-400 shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
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
                Ask anything about <span className="font-medium text-[var(--afrinex-text)]">{topic}</span> or pick a starter prompt below:
              </p>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {STARTER_PROMPTS[topic].map((prompt) => (
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
                    className={`max-w-[88%] sm:max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                      isUser
                        ? 'bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)]'
                        : 'border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)]'
                    }`}
                  >
                    {msg.content}
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
            <div className="text-xs text-[var(--afrinex-muted)]">
              Generating response with Cloudflare Workers AI...
            </div>
          )}
          <div ref={threadEndRef} />
        </div>

        {/* Error & Composer */}
        <div className="border-t border-[var(--afrinex-border)] p-3 sm:p-4 space-y-2">
          {error && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{error}</p>
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
        </div>
      </section>
    </div>
  );
}
