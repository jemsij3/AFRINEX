import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, BriefcaseBusiness, Code2, MessageSquarePlus, Pencil, Send, Sparkles, Trash2 } from 'lucide-react';
import type { AiMessage, AiTopic } from '../../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { useAuth } from '../lib/auth-context.tsx';

type Category = 'ai' | 'technology' | 'web3' | 'business' | 'general';
interface Conversation {
  id: string;
  title: string;
  category: Category;
  topic?: AiTopic;
  createdAt: string;
  updatedAt: string;
}
interface Usage { used: number; limit: number | 'unlimited'; plan: string; reset_at: string }
interface Props { onNavigate?: () => void }

const CATEGORIES: Array<{ id: Category; label: string; icon: typeof Sparkles }> = [
  { id: 'ai', label: 'AI', icon: Sparkles },
  { id: 'technology', label: 'Technology', icon: Code2 },
  { id: 'web3', label: 'Web3', icon: Bot },
  { id: 'business', label: 'Business', icon: BriefcaseBusiness },
  { id: 'general', label: 'General', icon: MessageSquarePlus },
];
const panelClass = 'rounded-2xl border border-[var(--afrinex-border)] bg-[var(--afrinex-surface)]';
const inputClass = 'rounded-xl border border-[var(--afrinex-border)] bg-[var(--afrinex-bg)] px-3 py-2 text-sm focus:border-[var(--afrinex-accent)] focus:outline-none';

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Render a small safe Markdown subset without injecting HTML. */
function MarkdownText({ text }: { text: string }) {
  const blocks = text.split(/```([\s\S]*?)```/g);
  return <div className="space-y-2 whitespace-pre-wrap break-words">{blocks.map((block, i) => {
    if (i % 2 === 1) return <pre key={i} className="overflow-x-auto rounded-lg bg-black/10 p-3 font-mono text-xs dark:bg-white/10"><code>{block.replace(/^\w+\n/, '')}</code></pre>;
    const tokens = block.split(/(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s]+)/g);
    return <span key={i}>{tokens.map((token, j) => {
      if (token.startsWith('**') && token.endsWith('**')) return <strong key={j}>{token.slice(2, -2)}</strong>;
      if (token.startsWith('`') && token.endsWith('`')) return <code key={j} className="rounded bg-black/10 px-1 dark:bg-white/10">{token.slice(1, -1)}</code>;
      if (/^https?:\/\//.test(token)) return <a key={j} href={token} target="_blank" rel="noreferrer" className="underline underline-offset-2">{token}</a>;
      return token;
    })}</span>;
  })}</div>;
}

export function AssistantPage({ onNavigate }: Props) {
  const { user, token } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [category, setCategory] = useState<Category>('general');
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [input, setInput] = useState('');
  const [loadingList, setLoadingList] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryContent, setRetryContent] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    if (!token) { setLoadingList(false); return; }
    setLoadingList(true);
    const result = await apiFetch<{ conversations: Conversation[] }>('/api/ai/conversations', undefined, token);
    if (result.ok && result.data) setConversations(result.data.conversations);
    else setError(result.error ?? 'Unable to load conversations.');
    setLoadingList(false);
  }, [token]);

  const loadUsage = useCallback(async () => {
    if (!token) return;
    const result = await apiFetch<Usage>('/api/ai/usage', undefined, token);
    if (result.ok && result.data) setUsage(result.data);
  }, [token]);

  useEffect(() => { void loadList(); void loadUsage(); }, [loadList, loadUsage]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, sending]);

  const openConversation = async (item: Conversation) => {
    if (!token) return;
    setActiveId(item.id);
    setCategory(item.category);
    setLoadingMessages(true);
    setError(null);
    const result = await apiFetch<{ conversation: Conversation; messages: AiMessage[] }>(`/api/ai/conversations/${item.id}`, undefined, token);
    if (result.ok && result.data) setMessages(result.data.messages);
    else setError(result.error ?? 'Could not load messages.');
    setLoadingMessages(false);
  };

  const createConversation = async (selected: Category) => {
    if (!token) return;
    setShowCategoryPicker(false);
    setError(null);
    const result = await apiFetch<{ conversation: Conversation }>('/api/ai/conversations', {
      method: 'POST', body: JSON.stringify({ category: selected }),
    }, token);
    if (!result.ok || !result.data?.conversation) { setError(result.error ?? 'Could not create conversation.'); return; }
    const conversation = result.data.conversation;
    setConversations((old) => [conversation, ...old]);
    setActiveId(conversation.id);
    setCategory(selected);
    setMessages([]);
  };

  const startRename = (item: Conversation) => { setRenamingId(item.id); setRenameTitle(item.title); };
  const saveRename = async (id: string) => {
    if (!token || !renameTitle.trim()) return;
    const result = await apiFetch<{ conversation: Conversation }>(`/api/ai/conversations/${id}`, {
      method: 'PATCH', body: JSON.stringify({ title: renameTitle.trim() }),
    }, token);
    if (result.ok && result.data?.conversation) {
      setConversations((items) => items.map((item) => item.id === id ? result.data!.conversation : item));
      setRenamingId(null);
    } else setError(result.error ?? 'Could not rename conversation.');
  };

  const deleteConversation = async (item: Conversation) => {
    if (!token || !window.confirm(`Delete “${item.title}” and its messages?`)) return;
    const result = await apiFetch(`/api/ai/conversations/${item.id}`, { method: 'DELETE' }, token);
    if (!result.ok) { setError(result.error ?? 'Could not delete conversation.'); return; }
    setConversations((items) => items.filter((conv) => conv.id !== item.id));
    if (activeId === item.id) { setActiveId(null); setMessages([]); }
  };

  const sendMessage = async (override?: string) => {
    const content = (override ?? input).trim();
    if (!content || sending || !token) return;
    let conversationId = activeId;
    setError(null);
    setRetryContent(null);
    setSending(true);
    if (!conversationId) {
      const created = await apiFetch<{ conversation: Conversation }>('/api/ai/conversations', {
        method: 'POST', body: JSON.stringify({ category }),
      }, token);
      if (!created.ok || !created.data?.conversation) {
        setError(created.error ?? 'Could not create conversation.'); setSending(false); return;
      }
      conversationId = created.data.conversation.id;
      setActiveId(conversationId);
      setConversations((old) => [created.data!.conversation, ...old]);
    }
    setInput('');
    const pending: AiMessage = { id: `pending_${Date.now()}`, conversationId, role: 'user', content, model: null, createdAt: new Date().toISOString() };
    setMessages((old) => [...old, pending]);
    const result = await apiFetch<{ userMessage: AiMessage; message: AiMessage; usage: Usage }>(`/api/ai/conversations/${conversationId}/messages`, {
      method: 'POST', body: JSON.stringify({ content }),
    }, token);
    if (result.ok && result.data?.message) {
      setMessages((old) => [...old.filter((message) => message.id !== pending.id), result.data!.userMessage, result.data!.message]);
      setUsage(result.data.usage);
      void loadList();
    } else {
      setMessages((old) => old.filter((message) => message.id !== pending.id));
      setInput(content);
      setRetryContent(content);
      setError(result.error ?? 'AI response failed. Try again.');
    }
    setSending(false);
  };

  if (!user) return <section className={`${panelClass} space-y-4 p-6`}>
    <h1 className="font-display text-xl font-bold">AFRINEX AI Assistant</h1>
    <p className="text-sm text-[var(--afrinex-muted)]">Sign in through Telegram to use the AI Assistant and save conversations.</p>
    <button type="button" onClick={onNavigate} className="min-h-11 rounded-xl bg-[var(--afrinex-accent)] px-5 text-sm font-medium text-[var(--afrinex-accent-text)]">Go to My Account</button>
  </section>;

  const activeCategory = CATEGORIES.find((item) => item.id === category)!;
  return <div className="grid min-h-[72dvh] grid-cols-1 gap-4 lg:grid-cols-[290px_minmax(0,1fr)]">
    <aside className={`${panelClass} flex flex-col p-4`}>
      <button type="button" onClick={() => setShowCategoryPicker((show) => !show)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[var(--afrinex-accent)] px-3 text-sm font-medium text-[var(--afrinex-accent-text)]">
        <MessageSquarePlus className="h-4 w-4" /> New Conversation
      </button>
      {showCategoryPicker && <div className="mt-3 space-y-1 rounded-xl border border-[var(--afrinex-border)] p-2" aria-label="Choose conversation category">
        {CATEGORIES.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => void createConversation(id)} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm hover:bg-black/5 dark:hover:bg-white/5"><Icon className="h-4 w-4 text-[var(--afrinex-accent)]" />{label}</button>)}
      </div>}
      <h2 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-[var(--afrinex-muted)]">Your conversations</h2>
      <div className="max-h-[55dvh] space-y-1 overflow-y-auto">
        {loadingList ? <p className="p-2 text-xs text-[var(--afrinex-muted)]">Loading conversations…</p> : conversations.length === 0 ? <p className="p-2 text-xs text-[var(--afrinex-muted)]">No conversations yet. Start one above.</p> : conversations.map((item) => <div key={item.id} className={`group flex items-center gap-1 rounded-xl border p-2 ${activeId === item.id ? 'border-[var(--afrinex-accent)] bg-black/5 dark:bg-white/5' : 'border-transparent'}`}>
          <div className="min-w-0 flex-1">
            {renamingId === item.id ? <form onSubmit={(event) => { event.preventDefault(); void saveRename(item.id); }} className="flex gap-1"><input autoFocus value={renameTitle} onChange={(event) => setRenameTitle(event.target.value)} className={`${inputClass} min-w-0 flex-1`} maxLength={120} /><button className="text-xs text-[var(--afrinex-accent)]">Save</button></form> : <button type="button" onClick={() => void openConversation(item)} className="block w-full truncate text-left text-sm font-medium">{item.title}</button>}
            <div className="mt-1 flex items-center gap-2 text-[10px] capitalize text-[var(--afrinex-muted)]"><span className="rounded-full bg-black/5 px-2 py-0.5 dark:bg-white/10">{item.category}</span><span>{formatDate(item.updatedAt)}</span></div>
          </div>
          <button type="button" aria-label={`Rename ${item.title}`} onClick={() => startRename(item)} className="rounded p-1.5 text-[var(--afrinex-muted)] hover:text-[var(--afrinex-text)]"><Pencil className="h-3.5 w-3.5" /></button>
          <button type="button" aria-label={`Delete ${item.title}`} onClick={() => void deleteConversation(item)} className="rounded p-1.5 text-[var(--afrinex-muted)] hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>)}
      </div>
      <div className="mt-auto border-t border-[var(--afrinex-border)] pt-3 text-xs text-[var(--afrinex-muted)]">Daily usage: {usage?.limit === 'unlimited' ? 'Unlimited' : `${usage?.used ?? 0} / ${usage?.limit ?? 20} messages today`}</div>
    </aside>

    <section className={`${panelClass} flex min-h-[72dvh] min-w-0 flex-col`}>
      <header className="border-b border-[var(--afrinex-border)] p-4">
        <p className="text-xs font-medium text-[var(--afrinex-accent)]">Cloudflare Workers AI</p>
        <h1 className="font-display text-lg font-bold">AFRINEX AI Assistant</h1>
        {activeId && <p className="mt-1 text-xs capitalize text-[var(--afrinex-muted)]">{activeCategory.label} conversation</p>}
      </header>
      {error && <div role="alert" className="mx-4 mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300"><span>{error}</span>{retryContent && <button type="button" onClick={() => void sendMessage(retryContent)} disabled={sending} className="rounded-lg border border-red-500/40 px-3 py-1 text-xs font-medium">Retry</button>}</div>}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {loadingMessages ? <p className="text-sm text-[var(--afrinex-muted)]">Loading messages…</p> : messages.length === 0 ? <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4 text-center"><Sparkles className="h-9 w-9 text-[var(--afrinex-accent)]" /><h2 className="font-display text-xl font-semibold">Start a new conversation</h2><p className="max-w-sm text-sm text-[var(--afrinex-muted)]">Choose a category in the sidebar, then ask AFRINEX AI a question.</p><div className="flex flex-wrap justify-center gap-2">{CATEGORIES.map(({ id, label }) => <button key={id} type="button" onClick={() => void createConversation(id)} className="rounded-full border border-[var(--afrinex-border)] px-3 py-1.5 text-xs hover:border-[var(--afrinex-accent)]">{label}</button>)}</div></div> : messages.map((message) => <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed sm:max-w-[78%] ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100'}`}><MarkdownText text={message.content} /><p className={`mt-2 text-[10px] ${message.role === 'user' ? 'text-blue-100' : 'text-[var(--afrinex-muted)]'}`}>{message.role === 'user' ? 'You' : 'AFRINEX AI'}</p></div></div>)}
        {sending && <div className="flex justify-start"><div className="rounded-2xl bg-gray-100 px-4 py-3 text-sm text-[var(--afrinex-muted)] dark:bg-gray-800" aria-live="polite">AFRINEX AI is thinking<span className="animate-pulse"> …</span></div></div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="border-t border-[var(--afrinex-border)] p-3 sm:p-4">
        <div className="flex items-end gap-2"><textarea rows={2} maxLength={4000} value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder="Message AFRINEX AI…" className={`${inputClass} min-h-12 flex-1 resize-y`} /><button type="submit" disabled={sending || !input.trim()} aria-label="Send message" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl bg-[var(--afrinex-accent)] text-[var(--afrinex-accent-text)] disabled:opacity-50"><Send className="h-4 w-4" /></button></div>
        <p className="mt-1 text-right text-[10px] text-[var(--afrinex-muted)]">{input.length} / 4000 · Enter to send, Shift+Enter for newline</p>
      </form>
    </section>
  </div>;
}
