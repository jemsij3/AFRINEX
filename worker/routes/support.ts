import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createSupportTicketSchema } from '../../shared/schemas.ts';
import type {
  SupportTicket,
  SupportTicketCategory,
  SupportTicketStatus,
} from '../../shared/types.ts';
import { createNotificationSafe } from '../lib/monitoring.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const supportRoutes = new Hono<AppEnv>();

supportRoutes.use('*', requireAuth);

interface DbTicketRow {
  id: string;
  user_id: string;
  category: SupportTicketCategory;
  subject: string;
  message: string;
  status: SupportTicketStatus;
  admin_reply: string | null;
  replied_by: string | null;
  replied_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapTicket(row: DbTicketRow): SupportTicket {
  return {
    id: row.id,
    userId: row.user_id,
    category: row.category,
    subject: row.subject,
    message: row.message,
    status: row.status,
    adminReply: row.admin_reply,
    repliedBy: row.replied_by,
    repliedAt: row.replied_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

supportRoutes.get('/tickets', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const rows = await db
    .prepare(
      `SELECT id, user_id, category, subject, message, status, admin_reply, replied_by, replied_at, created_at, updated_at
       FROM support_tickets
       WHERE user_id = ?
       ORDER BY created_at DESC
       LIMIT 50`
    )
    .bind(user.id)
    .all<DbTicketRow>();

  return c.json({ tickets: (rows.results ?? []).map(mapTicket) });
});

supportRoutes.post(
  '/tickets',
  rateLimit({ keyPrefix: 'support_ticket', limit: 10, windowSeconds: 300 }),
  zValidator('json', createSupportTicketSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const { category, subject, message } = c.req.valid('json');
    const id = `sup_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;

    await db
      .prepare(
        `INSERT INTO support_tickets (id, user_id, category, subject, message, status)
         VALUES (?, ?, ?, ?, ?, 'open')`
      )
      .bind(id, user.id, category, subject, message)
      .run();

    await createNotificationSafe(db, {
      userId: user.id,
      type: 'support',
      title: `Support Request Received: ${subject}`,
      body: 'Your request has been logged in Help & Support. Administrators can review and reply inside the platform.',
      linkSection: 'support',
      linkRefId: id,
    });

    const row = await db
      .prepare(
        `SELECT id, user_id, category, subject, message, status, admin_reply, replied_by, replied_at, created_at, updated_at
         FROM support_tickets WHERE id = ?`
      )
      .bind(id)
      .first<DbTicketRow>();

    return c.json({ ticket: row ? mapTicket(row) : null }, 201);
  }
);

export default supportRoutes;
