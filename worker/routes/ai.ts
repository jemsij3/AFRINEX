import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { aiChatSchema } from '../../shared/schemas.ts';
import type { AiChatResponse, AiConversation, AiMessage, AiTopic } from '../../shared/types.ts';
import { runWorkersAiChat } from '../lib/workersAi.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const aiRoutes = new Hono<AppEnv>();

aiRoutes.use('*', requireAuth);

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

function mapConversation(row: DbConversationRow): AiConversation {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    topic: row.topic,
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

aiRoutes.get('/conversations', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const rows = await db
    .prepare(
      'SELECT id, user_id, title, topic, created_at, updated_at FROM ai_conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30'
    )
    .bind(user.id)
    .all<DbConversationRow>();

  return c.json({
    conversations: (rows.results ?? []).map(mapConversation),
  });
});

aiRoutes.get('/conversations/:id/messages', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const conversationId = c.req.param('id');

  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const conv = await db
    .prepare(
      'SELECT id, user_id, title, topic, created_at, updated_at FROM ai_conversations WHERE id = ? AND user_id = ?'
    )
    .bind(conversationId, user.id)
    .first<DbConversationRow>();

  if (!conv) {
    return c.json({ error: 'Not found', message: 'Conversation not found.' }, 404);
  }

  const messagesResult = await db
    .prepare(
      'SELECT id, conversation_id, role, content, model, created_at FROM ai_messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 100'
    )
    .bind(conversationId)
    .all<DbMessageRow>();

  return c.json({
    conversation: mapConversation(conv),
    messages: (messagesResult.results ?? []).map(mapMessage),
  });
});

aiRoutes.delete('/conversations/:id', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const conversationId = c.req.param('id');

  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const result = await db
    .prepare('DELETE FROM ai_conversations WHERE id = ? AND user_id = ?')
    .bind(conversationId, user.id)
    .run();

  if (!result.meta.changes) {
    return c.json({ error: 'Not found', message: 'Conversation not found.' }, 404);
  }

  return c.json({ ok: true });
});

aiRoutes.post(
  '/chat',
  rateLimit({ keyPrefix: 'ai_chat', limit: 25, windowSeconds: 60 }),
  zValidator('json', aiChatSchema),
  async (c) => {
    const db = c.env.DB;
    const ai = c.env.AI;
    const user = c.get('user')!;
    const { conversationId, topic, message } = c.req.valid('json');

    if (!db) {
      return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
    }
    if (!ai) {
      return c.json(
        {
          error: 'Workers AI unavailable',
          message:
            'Cloudflare Workers AI binding (AI) is not attached. Run with remote AI or deploy to Cloudflare.',
        },
        503
      );
    }

    const DAILY_AI_LIMITS = {
      free: 25,
      pro: 250,
      admin: 500,
    } as const;

    let activeConvId = conversationId;
    let activeTopic: AiTopic = topic ?? 'general';

    if (activeConvId) {
      const existing = await db
        .prepare('SELECT id, topic FROM ai_conversations WHERE id = ? AND user_id = ?')
        .bind(activeConvId, user.id)
        .first<{ id: string; topic: AiTopic }>();

      if (!existing) {
        return c.json({ error: 'Not found', message: 'Conversation not found.' }, 404);
      }
      activeTopic = topic ?? existing.topic;
    } else {
      activeConvId = `conv_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    }

    // Enforce per-tier daily quota (atomic counter in D1 so deleting chats cannot bypass limits)
    const todayUtc = new Date().toISOString().slice(0, 10);
    const dailyLimit =
      user.role === 'admin'
        ? DAILY_AI_LIMITS.admin
        : user.tier === 'pro'
          ? DAILY_AI_LIMITS.pro
          : DAILY_AI_LIMITS.free;

    const usageRow = await db
      .prepare('SELECT count FROM ai_daily_usage WHERE user_id = ? AND usage_date = ?')
      .bind(user.id, todayUtc)
      .first<{ count: number }>();

    if ((usageRow?.count ?? 0) >= dailyLimit) {
      return c.json(
        {
          error: 'Daily AI limit reached',
          message:
            user.tier === 'free'
              ? `Free plan includes ${dailyLimit} AI prompts/day. Upgrade to AFRINEX Pro for ${DAILY_AI_LIMITS.pro}/day.`
              : `Daily quota of ${dailyLimit} AI prompts reached. Resets at 00:00 UTC.`,
        },
        429
      );
    }

    // Load recent turns for context-aware responses (only when resuming)
    const history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];
    if (conversationId) {
      const priorRows = await db
        .prepare(
          'SELECT role, content FROM ai_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 10'
        )
        .bind(activeConvId)
        .all<{ role: 'user' | 'assistant' | 'system'; content: string }>();

      for (const turn of (priorRows.results ?? []).reverse()) {
        history.push({
          role: turn.role,
          content: turn.content.length > 2000 ? `${turn.content.slice(0, 1997)}...` : turn.content,
        });
      }
    }
    history.push({ role: 'user', content: message });

    const userMsgId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const assistantMsgId = `msg_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

    let aiOutput;
    try {
      aiOutput = await runWorkersAiChat(ai, c.env.WORKERS_AI_MODEL, activeTopic, history);
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : 'Workers AI inference failed';
      return c.json({ error: 'AI inference failed', message: errMessage }, 502);
    }

    const statements: D1PreparedStatement[] = [];
    if (!conversationId) {
      statements.push(
        db
          .prepare(
            'INSERT INTO ai_conversations (id, user_id, title, topic) VALUES (?, ?, ?, ?)'
          )
          .bind(activeConvId, user.id, buildConversationTitle(message), activeTopic)
      );
    } else {
      statements.push(
        db
          .prepare(
            "UPDATE ai_conversations SET topic = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
          )
          .bind(activeTopic, activeConvId)
      );
    }

    statements.push(
      db
        .prepare(
          'INSERT INTO ai_messages (id, conversation_id, role, content, model) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(userMsgId, activeConvId, 'user', message, null),
      db
        .prepare(
          'INSERT INTO ai_messages (id, conversation_id, role, content, model) VALUES (?, ?, ?, ?, ?)'
        )
        .bind(assistantMsgId, activeConvId, 'assistant', aiOutput.reply, aiOutput.model),
      db
        .prepare(
          `INSERT INTO ai_daily_usage (user_id, usage_date, count) VALUES (?, ?, 1)
           ON CONFLICT(user_id, usage_date) DO UPDATE SET count = count + 1`
        )
        .bind(user.id, todayUtc)
    );

    await db.batch(statements);

    const [convRow, userMsgRow, assistantMsgRow] = await Promise.all([
      db
        .prepare(
          'SELECT id, user_id, title, topic, created_at, updated_at FROM ai_conversations WHERE id = ?'
        )
        .bind(activeConvId)
        .first<DbConversationRow>(),
      db
        .prepare(
          'SELECT id, conversation_id, role, content, model, created_at FROM ai_messages WHERE id = ?'
        )
        .bind(userMsgId)
        .first<DbMessageRow>(),
      db
        .prepare(
          'SELECT id, conversation_id, role, content, model, created_at FROM ai_messages WHERE id = ?'
        )
        .bind(assistantMsgId)
        .first<DbMessageRow>(),
    ]);

    if (!convRow || !userMsgRow || !assistantMsgRow) {
      return c.json({ error: 'Database error', message: 'Failed to persist AI messages.' }, 500);
    }

    const payload: AiChatResponse = {
      conversation: mapConversation(convRow),
      userMessage: mapMessage(userMsgRow),
      assistantMessage: mapMessage(assistantMsgRow),
    };

    return c.json(payload);
  }
);

export default aiRoutes;
