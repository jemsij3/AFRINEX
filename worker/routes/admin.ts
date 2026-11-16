import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  adminCreateCourseSchema,
  adminCreateLessonSchema,
  adminCreateOpportunitySchema,
  adminCreateToolSchema,
  adminUpdateUserSchema,
} from '../../shared/schemas.ts';
import type { AdminOverviewResponse, AuditLogEntry } from '../../shared/types.ts';
import { mapDbUser, requireAuth, requireRole } from '../middleware/auth.ts';
import type { AppEnv } from '../types.ts';

const adminRoutes = new Hono<AppEnv>();

// Protect every endpoint under /api/admin with JWT verification + admin RBAC
adminRoutes.use('*', requireAuth, requireRole('admin'));

interface CountRow {
  total: number;
}

async function countTable(db: D1Database, tableName: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS total FROM ${tableName}`).first<CountRow>();
  return row?.total ?? 0;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

async function logAdminAction(
  db: D1Database,
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO audit_logs (id, actor_user_id, action, target_type, target_id, metadata_json) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(
      crypto.randomUUID(),
      actorUserId,
      action,
      targetType,
      targetId,
      JSON.stringify(metadata)
    )
    .run();
}

adminRoutes.get('/overview', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const [
    usersCount,
    coursesCount,
    lessonsCount,
    aiToolsCount,
    opportunitiesCount,
    builderProjectsCount,
    paymentsCount,
  ] = await Promise.all([
    countTable(db, 'users'),
    countTable(db, 'courses'),
    countTable(db, 'lessons'),
    countTable(db, 'ai_tools'),
    countTable(db, 'opportunities'),
    countTable(db, 'builder_projects'),
    countTable(db, 'payments'),
  ]);

  const usersResult = await db
    .prepare(
      'SELECT id, telegram_id, username, first_name, last_name, photo_url, language_code, role, tier, pro_expires_at, created_at FROM users ORDER BY created_at DESC LIMIT 50'
    )
    .all<Parameters<typeof mapDbUser>[0]>();

  const auditResult = await db
    .prepare(
      'SELECT id, actor_user_id, action, target_type, target_id, metadata_json, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 25'
    )
    .all<{
      id: string;
      actor_user_id: string | null;
      action: string;
      target_type: string | null;
      target_id: string | null;
      metadata_json: string;
      created_at: string;
    }>();

  const recentAuditLogs: AuditLogEntry[] = (auditResult.results ?? []).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
  }));

  const payload: AdminOverviewResponse = {
    counts: {
      users: usersCount,
      courses: coursesCount,
      lessons: lessonsCount,
      aiTools: aiToolsCount,
      opportunities: opportunitiesCount,
      builderProjects: builderProjectsCount,
      payments: paymentsCount,
    },
    users: (usersResult.results ?? []).map(mapDbUser),
    recentAuditLogs,
  };

  return c.json(payload);
});

adminRoutes.patch(
  '/users/:id',
  zValidator('json', adminUpdateUserSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) {
      return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
    }

    const actor = c.get('user')!;
    const targetUserId = c.req.param('id');
    const updates = c.req.valid('json');

    if (actor.id === targetUserId && updates.role === 'member') {
      return c.json(
        {
          error: 'Invalid operation',
          message: 'Admins cannot demote their own active account.',
        },
        400
      );
    }

    const existing = await db
      .prepare('SELECT id, role, tier, pro_expires_at FROM users WHERE id = ?')
      .bind(targetUserId)
      .first<{
        id: string;
        role: 'member' | 'admin';
        tier: 'free' | 'pro';
        pro_expires_at: string | null;
      }>();

    if (!existing) {
      return c.json({ error: 'Not found', message: 'User not found.' }, 404);
    }

    const nextRole = updates.role ?? existing.role;
    const nextTier = updates.tier ?? existing.tier;
    const roleChanged = nextRole !== existing.role;

    let nextProExpiresAt = existing.pro_expires_at;
    if (updates.tier === 'free') {
      nextProExpiresAt = null;
    } else if (updates.tier === 'pro') {
      const existingMs = existing.pro_expires_at ? Date.parse(existing.pro_expires_at) : 0;
      if (!Number.isFinite(existingMs) || existingMs <= Date.now()) {
        nextProExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    await db
      .prepare(
        `UPDATE users
         SET role = ?,
             tier = ?,
             pro_expires_at = ?,
             token_version = CASE WHEN ? = 1 THEN token_version + 1 ELSE token_version END,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`
      )
      .bind(nextRole, nextTier, nextProExpiresAt, roleChanged ? 1 : 0, targetUserId)
      .run();

    await logAdminAction(db, actor.id, 'admin.update_user', 'user', targetUserId, {
      role: nextRole,
      tier: nextTier,
      proExpiresAt: nextProExpiresAt,
    });

    const updated = await db
      .prepare(
        'SELECT id, telegram_id, username, first_name, last_name, photo_url, language_code, role, tier, pro_expires_at, created_at FROM users WHERE id = ?'
      )
      .bind(targetUserId)
      .first<Parameters<typeof mapDbUser>[0]>();

    return c.json({ user: updated ? mapDbUser(updated) : null });
  }
);

// Courses CRUD
adminRoutes.post('/courses', zValidator('json', adminCreateCourseSchema), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const input = c.req.valid('json');
  const id = `course_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const slug = `${slugify(input.title)}-${id.slice(-4)}`;

  await db
    .prepare(
      'INSERT INTO courses (id, slug, title, summary, track, category, is_pro, published) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
    )
    .bind(
      id,
      slug,
      input.title,
      input.summary,
      input.track,
      input.category,
      input.isPro ? 1 : 0
    )
    .run();

  await logAdminAction(db, actor.id, 'admin.create_course', 'course', id, {
    title: input.title,
  });

  return c.json({ ok: true, id, slug }, 201);
});

adminRoutes.delete('/courses/:id', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const id = c.req.param('id');
  const res = await db.prepare('DELETE FROM courses WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return c.json({ error: 'Course not found' }, 404);

  await logAdminAction(db, actor.id, 'admin.delete_course', 'course', id);
  return c.json({ ok: true });
});

// Lessons CRUD
adminRoutes.post('/lessons', zValidator('json', adminCreateLessonSchema), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const input = c.req.valid('json');
  const course = await db
    .prepare('SELECT id FROM courses WHERE id = ?')
    .bind(input.courseId)
    .first<{ id: string }>();
  if (!course) return c.json({ error: 'Course not found' }, 404);

  const id = `lesson_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  await db
    .prepare(
      'INSERT INTO lessons (id, course_id, title, content_md, duration_mins, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .bind(
      id,
      input.courseId,
      input.title,
      input.contentMd,
      input.durationMins,
      input.sortOrder
    )
    .run();

  await logAdminAction(db, actor.id, 'admin.create_lesson', 'lesson', id, {
    courseId: input.courseId,
    title: input.title,
  });

  return c.json({ ok: true, id }, 201);
});

adminRoutes.delete('/lessons/:id', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const id = c.req.param('id');
  const res = await db.prepare('DELETE FROM lessons WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return c.json({ error: 'Lesson not found' }, 404);

  await logAdminAction(db, actor.id, 'admin.delete_lesson', 'lesson', id);
  return c.json({ ok: true });
});

// AI Tools CRUD
adminRoutes.post('/tools', zValidator('json', adminCreateToolSchema), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const input = c.req.valid('json');
  const id = `tool_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  await db
    .prepare(
      'INSERT INTO ai_tools (id, name, summary, category, url, pricing_model, featured, published) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
    )
    .bind(
      id,
      input.name,
      input.summary,
      input.category,
      input.url,
      input.pricingModel,
      input.featured ? 1 : 0
    )
    .run();

  await logAdminAction(db, actor.id, 'admin.create_tool', 'ai_tool', id, {
    name: input.name,
  });

  return c.json({ ok: true, id }, 201);
});

adminRoutes.delete('/tools/:id', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const id = c.req.param('id');
  const res = await db.prepare('DELETE FROM ai_tools WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return c.json({ error: 'Tool not found' }, 404);

  await logAdminAction(db, actor.id, 'admin.delete_tool', 'ai_tool', id);
  return c.json({ ok: true });
});

// Opportunities CRUD
adminRoutes.post(
  '/opportunities',
  zValidator('json', adminCreateOpportunitySchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const input = c.req.valid('json');
    const id = `opp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

    await db
      .prepare(
        'INSERT INTO opportunities (id, title, organization, summary, opportunity_type, region, url, deadline, published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)'
      )
      .bind(
        id,
        input.title,
        input.organization,
        input.summary,
        input.opportunityType,
        input.region,
        input.url,
        input.deadline || null
      )
      .run();

    await logAdminAction(db, actor.id, 'admin.create_opportunity', 'opportunity', id, {
      title: input.title,
    });

    return c.json({ ok: true, id }, 201);
  }
);

adminRoutes.delete('/opportunities/:id', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const id = c.req.param('id');
  const res = await db.prepare('DELETE FROM opportunities WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return c.json({ error: 'Opportunity not found' }, 404);

  await logAdminAction(db, actor.id, 'admin.delete_opportunity', 'opportunity', id);
  return c.json({ ok: true });
});

export default adminRoutes;
