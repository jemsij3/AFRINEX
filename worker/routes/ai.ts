import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { aiChatSchema } from '../../shared/schemas.ts';
import type { AiChatResponse, AiConversation, AiMessage, AiTopic } from '../../shared/types.ts';
import { runWorkersAiChat } from '../lib/workersAi.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const aiRoutes = new Hono<AppEnv>();
aiRoutes.use('*', requireAuth);

const categorySchema = z.enum(['ai', 'technology', 'web3', 'business', 'general']);
const createConversationSchema = z.object({
  category: categorySchema.default('general'),
  title: z.string().trim().min(1).max(120).optional(),
});
const renameConversationSchema = z.object({ title: z.string().trim().min(1).max(120) });
const messageSchema = z.object({ content: z.string().trim().min(1).max(4000) });

interface DbConversationRow {
  id: string;
  user_id: string;
  title: string;
  topic: AiTopic;
  created_at: string;
  updated_at: string;
}
interface DbMessageRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  created_at: string;
}
interface UsageRow { count: number }

const FREE_DAILY_LIMIT = 20;
const ASSISTANT_PROMPT = 'You are AFRINEX AI Assistant, a helpful AI focused on AI, technology, Web3, business, and general assistance. Be concise, accurate, and helpful.';

function mapCategoryToTopic(category: z.infer<typeof categorySchema>): AiTopic {
  return category === 'technology' ? 'tech' : category;
}
function mapTopicToCategory(topic: AiTopic): z.infer<typeof categorySchema> {
  return topic === 'tech' ? 'technology' : topic;
}
function mapConversation(row: DbConversationRow): AiConversation & { category: string } {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    topic: row.topic,
    category: mapTopicToCategory(row.topic),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function mapMessage(row: DbMessageRow): AiMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    model: row.model,
    createdAt: row.created_at,
  };
}
function buildConversationTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, ' ').trim();
  return cleaned.length > 56 ? `${cleaned.slice(0, 53)}...` : cleaned;
}
function utcDayStart(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}
function utcToday(): string { return new Date().toISOString().slice(0, 10); }

async function getUsage(db: D1Database, userId: string): Promise<number> {
  const row = await db.prepare('SELECT count FROM ai_daily_usage WHERE user_id = ? AND usage_date = ?')
    .bind(userId, utcToday()).first<UsageRow>();
  return row?.count ?? 0;
}

aiRoutes.post('/conversations', rateLimit({ keyPrefix: 'ai_conversation', limit: 30, windowSeconds: 60 }), zValidator('json', createConversationSchema), async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const input = c.req.valid('json');
  const id = `conv_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  await db.prepare('INSERT INTO ai_conversations (id, user_id, title, topic) VALUES (?, ?, ?, ?)')
    .bind(id, user.id, input.title || 'New Conversation', mapCategoryToTopic(input.category)).run();
  const row = await db.prepare('SELECT id, user_id, title, topic, created_at, updated_at FROM ai_conversations WHERE id = ?')
    .bind(id).first<DbConversationRow>();
  return c.json({ conversation: row ? mapConversation(row) : null }, 201);
});

aiRoutes.get('/conversations', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  const rows = await db.prepare('SELECT id, user_id, title, topic, created_at, updated_at FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 100')
    .bind(user.id).all<DbConversationRow>();
  return c.json({ conversations: (rows.results ?? []).map(mapConversation) });
});

aiRoutes.get('/conversations/:id', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const conversation = await db.prepare('SELECT id, user_id, title, topic, created_at, updated_at FROM ai_conversations WHERE id = ? AND user_id = ?')
    .bind(id, user.id).first<DbConversationRow>();
  if (!conversation) return c.json({ error: 'Conversation not found' }, 404);
  const messages = await db.prepare('SELECT id, conversation_id, role, content, model, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 500')
    .bind(id).all<DbMessageRow>();
  return c.json({ conversation: mapConversation(conversation), messages: (messages.results ?? []).map(mapMessage) });
});

// Backwards-compatible history endpoint used by the existing AssistantSection.
aiRoutes.get('/conversations/:id/messages', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  const conversation = await db.prepare('SELECT id, user_id, title, topic, created_at, updated_at FROM ai_conversations WHERE id = ? AND user_id = ?')
    .bind(id, user.id).first<DbConversationRow>();
  if (!conversation) return c.json({ error: 'Not found', message: 'Conversation not found.' }, 404);
  const messages = await db.prepare('SELECT id, conversation_id, role, content, model, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 500')
    .bind(id).all<DbMessageRow>();
  return c.json({ conversation: mapConversation(conversation), messages: (messages.results ?? []).map(mapMessage) });
});

aiRoutes.patch('/conversations/:id', rateLimit({ keyPrefix: 'ai_conversation', limit: 30, windowSeconds: 60 }), zValidator('json', renameConversationSchema), async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const { title } = c.req.valid('json');
  const result = await db.prepare("UPDATE ai_conversations SET title = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND user_id = ?")
    .bind(title, id, user.id).run();
  if (!result.meta.changes) return c.json({ error: 'Conversation not found' }, 404);
  const conversation = await db.prepare('SELECT id, user_id, title, topic, created_at, updated_at FROM ai_conversations WHERE id = ?')
    .bind(id).first<DbConversationRow>();
  return c.json({ conversation: conversation ? mapConversation(conversation) : null });
});

aiRoutes.delete('/conversations/:id', rateLimit({ keyPrefix: 'ai_conversation', limit: 30, windowSeconds: 60 }), async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  const result = await db.prepare('DELETE FROM ai_conversations WHERE id = ? AND user_id = ?').bind(c.req.param('id'), user.id).run();
  if (!result.meta.changes) return c.json({ error: 'Not found', message: 'Conversation not found.' }, 404);
  return c.json({ ok: true });
});

aiRoutes.get('/usage', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const used = await getUsage(db, user.id);
  const unlimited = user.tier === 'pro' || user.role === 'admin';
  return c.json({ used, limit: unlimited ? 'unlimited' : FREE_DAILY_LIMIT, plan: user.tier, reset_at: new Date(Date.now() + (24 * 60 * 60 * 1000 - (Date.now() % (24 * 60 * 60 * 1000)))).toISOString() });
});

aiRoutes.post('/conversations/:id/messages', rateLimit({ keyPrefix: 'ai_chat', limit: 25, windowSeconds: 60 }), zValidator('json', messageSchema), async (c) => {
  const db = c.env.DB;
  const ai = c.env.AI;
  const user = c.get('user')!;
  const conversationId = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  if (!ai) return c.json({ error: 'Workers AI unavailable', message: 'Cloudflare Workers AI binding (AI) is not attached.' }, 503);
  const conversation = await db.prepare('SELECT id, user_id, title, topic, created_at, updated_at FROM ai_conversations WHERE id = ? AND user_id = ?')
    .bind(conversationId, user.id).first<DbConversationRow>();
  if (!conversation) return c.json({ error: 'Conversation not found' }, 404);

  const used = await getUsage(db, user.id);
  const unlimited = user.tier === 'pro' || user.role === 'admin';
  if (!unlimited && used >= FREE_DAILY_LIMIT) {
    return c.json({ error: 'Daily message limit reached. Upgrade to Pro for unlimited messages.' }, 429);
  }

  const { content } = c.req.valid('json');
  const prior = await db.prepare('SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10')
    .bind(conversationId).all<{ role: 'user' | 'assistant' | 'system'; content: string }>();
  const history = (prior.results ?? []).reverse().map((row) => ({
    role: row.role,
    content: row.content.length > 4000 ? `${row.content.slice(0, 3997)}...` : row.content,
  }));
  history.push({ role: 'user', content });

  let output;
  try {
    output = await runWorkersAiChat(ai, c.env.WORKERS_AI_MODEL, conversation.topic, history, ASSISTANT_PROMPT);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Workers AI inference failed.';
    return c.json({ error: 'AI inference failed', message }, 502);
  }

  const userMessageId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const assistantMessageId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const today = utcToday();
  await db.batch([
    db.prepare('INSERT INTO ai_messages (id, conversation_id, role, content, model) VALUES (?, ?, ?, ?, NULL)')
      .bind(userMessageId, conversationId, 'user', content),
    db.prepare('INSERT INTO ai_messages (id, conversation_id, role, content, model) VALUES (?, ?, ?, ?, ?)')
      .bind(assistantMessageId, conversationId, 'assistant', output.reply, output.model),
    db.prepare("UPDATE ai_conversations SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND user_id = ?")
      .bind(conversationId, user.id),
    db.prepare('INSERT INTO ai_daily_usage (user_id, usage_date, count) VALUES (?, ?, 1) ON CONFLICT(user_id, usage_date) DO UPDATE SET count = count + 1')
      .bind(user.id, today),
  ]);
  const [userMessage, assistantMessage] = await Promise.all([
    db.prepare('SELECT id, conversation_id, role, content, model, created_at FROM ai_messages WHERE id = ?').bind(userMessageId).first<DbMessageRow>(),
    db.prepare('SELECT id, conversation_id, role, content, model, created_at FROM ai_messages WHERE id = ?').bind(assistantMessageId).first<DbMessageRow>(),
  ]);
  const updatedUsage = await getUsage(db, user.id);
  return c.json({ userMessage: userMessage ? mapMessage(userMessage) : null, message: assistantMessage ? mapMessage(assistantMessage) : null, usage: { used: updatedUsage, limit: unlimited ? 'unlimited' : FREE_DAILY_LIMIT } });
});

// Existing single-call chat endpoint remains available for the current AssistantSection.
aiRoutes.post('/chat', rateLimit({ keyPrefix: 'ai_chat', limit: 25, windowSeconds: 60 }), zValidator('json', aiChatSchema), async (c) => {
  const db = c.env.DB;
  const ai = c.env.AI;
  const user = c.get('user')!;
  const { conversationId, topic, message } = c.req.valid('json');
  if (!db) return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  if (!ai) return c.json({ error: 'Workers AI unavailable', message: 'Cloudflare Workers AI binding (AI) is not attached.' }, 503);
  let activeConvId = conversationId;
  let activeTopic: AiTopic = topic ?? 'general';
  if (activeConvId) {
    const existing = await db.prepare('SELECT id, topic FROM ai_conversations WHERE id = ? AND user_id = ?').bind(activeConvId, user.id).first<{ id: string; topic: AiTopic }>();
    if (!existing) return c.json({ error: 'Not found', message: 'Conversation not found.' }, 404);
    activeTopic = topic ?? existing.topic;
  } else {
    activeConvId = `conv_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  }
  const used = await getUsage(db, user.id);
  const unlimited = user.tier === 'pro' || user.role === 'admin';
  if (!unlimited && used >= FREE_DAILY_LIMIT) return c.json({ error: 'Daily message limit reached. Upgrade to Pro for unlimited messages.' }, 429);
  const prior = conversationId ? await db.prepare('SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10').bind(activeConvId).all<{ role: 'user' | 'assistant' | 'system'; content: string }>() : { results: [] };
  const history = (prior.results ?? []).reverse().map((turn) => ({ role: turn.role, content: turn.content.slice(0, 4000) }));
  history.push({ role: 'user', content: message });
  let output;
  try { output = await runWorkersAiChat(ai, c.env.WORKERS_AI_MODEL, activeTopic, history); }
  catch (error) { return c.json({ error: 'AI inference failed', message: error instanceof Error ? error.message : 'Workers AI inference failed.' }, 502); }
  const userMessageId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const assistantMessageId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const today = utcToday();
  const statements: D1PreparedStatement[] = [];
  if (!conversationId) statements.push(db.prepare('INSERT INTO ai_conversations (id, user_id, title, topic) VALUES (?, ?, ?, ?)').bind(activeConvId, user.id, buildConversationTitle(message), activeTopic));
  else statements.push(db.prepare("UPDATE ai_conversations SET topic = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ? AND user_id = ?").bind(activeTopic, activeConvId, user.id));
  statements.push(
    db.prepare('INSERT INTO ai_messages (id, conversation_id, role, content, model) VALUES (?, ?, ?, ?, ?)').bind(userMessageId, activeConvId, 'user', message, null),
    db.prepare('INSERT INTO ai_messages (id, conversation_id, role, content, model) VALUES (?, ?, ?, ?, ?)').bind(assistantMessageId, activeConvId, 'assistant', output.reply, output.model),
    db.prepare('INSERT INTO ai_daily_usage (user_id, usage_date, count) VALUES (?, ?, 1) ON CONFLICT(user_id, usage_date) DO UPDATE SET count = count + 1').bind(user.id, today),
  );
  await db.batch(statements);
  const [conv, userMsg, assistantMsg] = await Promise.all([
    db.prepare('SELECT id, user_id, title, topic, created_at, updated_at FROM ai_conversations WHERE id = ?').bind(activeConvId).first<DbConversationRow>(),
    db.prepare('SELECT id, conversation_id, role, content, model, created_at FROM ai_messages WHERE id = ?').bind(userMessageId).first<DbMessageRow>(),
    db.prepare('SELECT id, conversation_id, role, content, model, created_at FROM ai_messages WHERE id = ?').bind(assistantMessageId).first<DbMessageRow>(),
  ]);
  if (!conv || !userMsg || !assistantMsg) return c.json({ error: 'Database error', message: 'Failed to persist AI messages.' }, 500);
  const payload: AiChatResponse = { conversation: mapConversation(conv), userMessage: mapMessage(userMsg), assistantMessage: mapMessage(assistantMsg) };
  return c.json(payload);
});

export default aiRoutes;
