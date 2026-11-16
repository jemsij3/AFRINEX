import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  adminCreateCourseSchema,
  adminCreateLessonSchema,
  adminCreateOpportunitySchema,
  adminCreateToolSchema,
  adminFeatureToggleSchema,
  adminPublishToggleSchema,
  adminUpdateCourseSchema,
  adminUpdateLessonSchema,
  adminUpdateOpportunitySchema,
  adminUpdateToolSchema,
  adminUpdateUserSchema,
} from '../../shared/schemas.ts';
import type {
  AdminAiUsageResponse,
  AdminOverviewResponse,
  AdminPaginatedAuditLogsResponse,
  AdminPaginatedPaymentsResponse,
  AdminPaginatedSubscriptionsResponse,
  AdminPaginatedUsersResponse,
  AdminPaymentEntry,
  AdminRevenueResponse,
  AdminSubscriptionEntry,
  AiTool,
  AiToolCategory,
  AiToolPricing,
  AuditLogEntry,
  Course,
  LearningTrack,
  Lesson,
  Opportunity,
  OpportunityRegion,
  OpportunityType,
} from '../../shared/types.ts';
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

function parsePagination(
  pageRaw: string | undefined,
  perPageRaw: string | undefined
): { page: number; perPage: number; offset: number } {
  const pageParsed = Number.parseInt(pageRaw ?? '1', 10);
  const perPageParsed = Number.parseInt(perPageRaw ?? '50', 10);
  const page = Number.isFinite(pageParsed) && pageParsed >= 1 ? pageParsed : 1;
  const perPage =
    Number.isFinite(perPageParsed) && perPageParsed >= 1
      ? Math.min(perPageParsed, 100)
      : 50;
  return { page, perPage, offset: (page - 1) * perPage };
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

// Stage 7: Paginated users list
adminRoutes.get('/users', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const { page, perPage, offset } = parsePagination(
    c.req.query('page'),
    c.req.query('per_page')
  );

  const [countRow, rows] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS total FROM users').first<CountRow>(),
    db
      .prepare(
        'SELECT id, telegram_id, username, first_name, last_name, photo_url, language_code, role, tier, pro_expires_at, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      .bind(perPage, offset)
      .all<Parameters<typeof mapDbUser>[0]>(),
  ]);

  const total = Number(countRow?.total ?? 0);
  const payload: AdminPaginatedUsersResponse = {
    users: (rows.results ?? []).map(mapDbUser),
    page,
    per_page: perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
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

// Courses CRUD (includes unpublished items for admins)
adminRoutes.get('/courses', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const rows = await db
    .prepare(
      `SELECT c.id, c.slug, c.title, c.summary, c.track, c.category, c.is_pro, c.published, c.created_at,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count
       FROM courses c
       ORDER BY c.created_at DESC`
    )
    .all<{
      id: string;
      slug: string;
      title: string;
      summary: string;
      track: LearningTrack;
      category: string;
      is_pro: number;
      published: number;
      created_at: string;
      lesson_count: number;
    }>();

  const courses: Course[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    track: row.track,
    category: row.category,
    isPro: row.is_pro === 1,
    published: row.published === 1,
    lessonCount: Number(row.lesson_count ?? 0),
    completedCount: 0,
    bookmarked: false,
    createdAt: row.created_at,
  }));

  return c.json({ courses });
});

adminRoutes.get('/courses/:id/lessons', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const courseId = c.req.param('id');
  const rows = await db
    .prepare(
      'SELECT id, course_id, title, content_md, duration_mins, sort_order, published, created_at FROM lessons WHERE course_id = ? ORDER BY sort_order ASC, created_at ASC'
    )
    .bind(courseId)
    .all<{
      id: string;
      course_id: string;
      title: string;
      content_md: string;
      duration_mins: number;
      sort_order: number;
      published: number;
      created_at: string;
    }>();

  const lessons: Lesson[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    courseId: row.course_id,
    title: row.title,
    contentMd: row.content_md,
    durationMins: row.duration_mins,
    sortOrder: row.sort_order,
    published: row.published === 1,
    completed: false,
    locked: false,
    createdAt: row.created_at,
  }));

  return c.json({ lessons });
});

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

adminRoutes.put('/courses/:id', zValidator('json', adminUpdateCourseSchema), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const id = c.req.param('id');
  const input = c.req.valid('json');

  const existing = await db
    .prepare('SELECT id, title, summary, track, category, is_pro, published FROM courses WHERE id = ?')
    .bind(id)
    .first<{
      id: string;
      title: string;
      summary: string;
      track: LearningTrack;
      category: string;
      is_pro: number;
      published: number;
    }>();

  if (!existing) return c.json({ error: 'Course not found' }, 404);

  const nextTitle = input.title ?? existing.title;
  const nextSummary = input.summary ?? existing.summary;
  const nextTrack = input.track ?? existing.track;
  const nextCategory = input.category ?? existing.category;
  const nextIsPro = input.isPro !== undefined ? (input.isPro ? 1 : 0) : existing.is_pro;
  const nextPublished =
    input.published !== undefined ? (input.published ? 1 : 0) : existing.published;

  await db
    .prepare(
      'UPDATE courses SET title = ?, summary = ?, track = ?, category = ?, is_pro = ?, published = ? WHERE id = ?'
    )
    .bind(nextTitle, nextSummary, nextTrack, nextCategory, nextIsPro, nextPublished, id)
    .run();

  await logAdminAction(db, actor.id, 'admin.update_course', 'course', id, {
    title: nextTitle,
    published: nextPublished === 1,
  });

  return c.json({
    ok: true,
    course: {
      id,
      title: nextTitle,
      summary: nextSummary,
      track: nextTrack,
      category: nextCategory,
      isPro: nextIsPro === 1,
      published: nextPublished === 1,
    },
  });
});

adminRoutes.patch(
  '/courses/:id/publish',
  zValidator('json', adminPublishToggleSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await db
      .prepare('SELECT id, published FROM courses WHERE id = ?')
      .bind(id)
      .first<{ id: string; published: number }>();

    if (!existing) return c.json({ error: 'Course not found' }, 404);

    const nextPublished =
      body?.published !== undefined ? (body.published ? 1 : 0) : existing.published === 1 ? 0 : 1;

    await db.prepare('UPDATE courses SET published = ? WHERE id = ?').bind(nextPublished, id).run();
    await logAdminAction(db, actor.id, 'admin.publish_course', 'course', id, {
      published: nextPublished === 1,
    });

    return c.json({ ok: true, id, published: nextPublished === 1 });
  }
);

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
      'INSERT INTO lessons (id, course_id, title, content_md, duration_mins, sort_order, published) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(
      id,
      input.courseId,
      input.title,
      input.contentMd,
      input.durationMins,
      input.sortOrder,
      input.published ? 1 : 0
    )
    .run();

  await logAdminAction(db, actor.id, 'admin.create_lesson', 'lesson', id, {
    courseId: input.courseId,
    title: input.title,
  });

  return c.json({ ok: true, id }, 201);
});

adminRoutes.put('/lessons/:id', zValidator('json', adminUpdateLessonSchema), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const id = c.req.param('id');
  const input = c.req.valid('json');

  const existing = await db
    .prepare(
      'SELECT id, course_id, title, content_md, duration_mins, sort_order, published FROM lessons WHERE id = ?'
    )
    .bind(id)
    .first<{
      id: string;
      course_id: string;
      title: string;
      content_md: string;
      duration_mins: number;
      sort_order: number;
      published: number;
    }>();

  if (!existing) return c.json({ error: 'Lesson not found' }, 404);

  const nextTitle = input.title ?? existing.title;
  const nextContentMd = input.contentMd ?? existing.content_md;
  const nextDurationMins = input.durationMins ?? existing.duration_mins;
  const nextSortOrder = input.sortOrder ?? existing.sort_order;
  const nextPublished =
    input.published !== undefined ? (input.published ? 1 : 0) : existing.published;

  await db
    .prepare(
      'UPDATE lessons SET title = ?, content_md = ?, duration_mins = ?, sort_order = ?, published = ? WHERE id = ?'
    )
    .bind(nextTitle, nextContentMd, nextDurationMins, nextSortOrder, nextPublished, id)
    .run();

  await logAdminAction(db, actor.id, 'admin.update_lesson', 'lesson', id, {
    courseId: existing.course_id,
    title: nextTitle,
    published: nextPublished === 1,
  });

  return c.json({
    ok: true,
    lesson: {
      id,
      courseId: existing.course_id,
      title: nextTitle,
      contentMd: nextContentMd,
      durationMins: nextDurationMins,
      sortOrder: nextSortOrder,
      published: nextPublished === 1,
    },
  });
});

adminRoutes.patch(
  '/lessons/:id/publish',
  zValidator('json', adminPublishToggleSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await db
      .prepare('SELECT id, published FROM lessons WHERE id = ?')
      .bind(id)
      .first<{ id: string; published: number }>();

    if (!existing) return c.json({ error: 'Lesson not found' }, 404);

    const nextPublished =
      body?.published !== undefined ? (body.published ? 1 : 0) : existing.published === 1 ? 0 : 1;

    await db.prepare('UPDATE lessons SET published = ? WHERE id = ?').bind(nextPublished, id).run();
    await logAdminAction(db, actor.id, 'admin.publish_lesson', 'lesson', id, {
      published: nextPublished === 1,
    });

    return c.json({ ok: true, id, published: nextPublished === 1 });
  }
);

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
adminRoutes.get('/tools', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const rows = await db
    .prepare(
      'SELECT id, name, summary, category, url, pricing_model, featured, published, created_at FROM ai_tools ORDER BY featured DESC, created_at DESC'
    )
    .all<{
      id: string;
      name: string;
      summary: string;
      category: AiToolCategory;
      url: string;
      pricing_model: AiToolPricing;
      featured: number;
      published: number;
      created_at: string;
    }>();

  const tools: AiTool[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    summary: row.summary,
    category: row.category,
    url: row.url,
    pricingModel: row.pricing_model,
    featured: row.featured === 1,
    published: row.published === 1,
    bookmarked: false,
    createdAt: row.created_at,
  }));

  return c.json({ tools });
});

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

adminRoutes.put('/tools/:id', zValidator('json', adminUpdateToolSchema), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const id = c.req.param('id');
  const input = c.req.valid('json');

  const existing = await db
    .prepare(
      'SELECT id, name, summary, category, url, pricing_model, featured, published FROM ai_tools WHERE id = ?'
    )
    .bind(id)
    .first<{
      id: string;
      name: string;
      summary: string;
      category: AiToolCategory;
      url: string;
      pricing_model: AiToolPricing;
      featured: number;
      published: number;
    }>();

  if (!existing) return c.json({ error: 'Tool not found' }, 404);

  const nextName = input.name ?? existing.name;
  const nextSummary = input.summary ?? existing.summary;
  const nextCategory = input.category ?? existing.category;
  const nextUrl = input.url ?? existing.url;
  const nextPricing = input.pricingModel ?? existing.pricing_model;
  const nextFeatured =
    input.featured !== undefined ? (input.featured ? 1 : 0) : existing.featured;
  const nextPublished =
    input.published !== undefined ? (input.published ? 1 : 0) : existing.published;

  await db
    .prepare(
      'UPDATE ai_tools SET name = ?, summary = ?, category = ?, url = ?, pricing_model = ?, featured = ?, published = ? WHERE id = ?'
    )
    .bind(
      nextName,
      nextSummary,
      nextCategory,
      nextUrl,
      nextPricing,
      nextFeatured,
      nextPublished,
      id
    )
    .run();

  await logAdminAction(db, actor.id, 'admin.update_tool', 'ai_tool', id, {
    name: nextName,
  });

  return c.json({
    ok: true,
    tool: {
      id,
      name: nextName,
      summary: nextSummary,
      category: nextCategory,
      url: nextUrl,
      pricingModel: nextPricing,
      featured: nextFeatured === 1,
      published: nextPublished === 1,
    },
  });
});

adminRoutes.patch(
  '/tools/:id/feature',
  zValidator('json', adminFeatureToggleSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await db
      .prepare('SELECT id, featured FROM ai_tools WHERE id = ?')
      .bind(id)
      .first<{ id: string; featured: number }>();

    if (!existing) return c.json({ error: 'Tool not found' }, 404);

    const nextFeatured =
      body?.featured !== undefined ? (body.featured ? 1 : 0) : existing.featured === 1 ? 0 : 1;

    await db.prepare('UPDATE ai_tools SET featured = ? WHERE id = ?').bind(nextFeatured, id).run();
    await logAdminAction(db, actor.id, 'admin.feature_tool', 'ai_tool', id, {
      featured: nextFeatured === 1,
    });

    return c.json({ ok: true, id, featured: nextFeatured === 1 });
  }
);

adminRoutes.patch(
  '/tools/:id/publish',
  zValidator('json', adminPublishToggleSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await db
      .prepare('SELECT id, published FROM ai_tools WHERE id = ?')
      .bind(id)
      .first<{ id: string; published: number }>();

    if (!existing) return c.json({ error: 'Tool not found' }, 404);

    const nextPublished =
      body?.published !== undefined ? (body.published ? 1 : 0) : existing.published === 1 ? 0 : 1;

    await db.prepare('UPDATE ai_tools SET published = ? WHERE id = ?').bind(nextPublished, id).run();
    await logAdminAction(db, actor.id, 'admin.publish_tool', 'ai_tool', id, {
      published: nextPublished === 1,
    });

    return c.json({ ok: true, id, published: nextPublished === 1 });
  }
);

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
adminRoutes.get('/opportunities', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const rows = await db
    .prepare(
      'SELECT id, title, organization, summary, opportunity_type, region, url, deadline, published, created_at FROM opportunities ORDER BY created_at DESC'
    )
    .all<{
      id: string;
      title: string;
      organization: string;
      summary: string;
      opportunity_type: OpportunityType;
      region: OpportunityRegion;
      url: string;
      deadline: string | null;
      published: number;
      created_at: string;
    }>();

  const opportunities: Opportunity[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    organization: row.organization,
    summary: row.summary,
    opportunityType: row.opportunity_type,
    region: row.region,
    url: row.url,
    deadline: row.deadline,
    published: row.published === 1,
    bookmarked: false,
    createdAt: row.created_at,
  }));

  return c.json({ opportunities });
});

adminRoutes.post(
  '/opportunities',
  zValidator('json', adminCreateOpportunitySchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const input = c.req.valid('json');
    const id = `opp_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

    try {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Database insert failed';
      if (msg.includes('CHECK constraint')) {
        return c.json(
          {
            error: 'Opportunity type not supported by database schema',
            message: `Database CHECK constraint rejected opportunityType "${input.opportunityType}".`,
          },
          400
        );
      }
      throw err;
    }

    await logAdminAction(db, actor.id, 'admin.create_opportunity', 'opportunity', id, {
      title: input.title,
    });

    return c.json({ ok: true, id }, 201);
  }
);

adminRoutes.put(
  '/opportunities/:id',
  zValidator('json', adminUpdateOpportunitySchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const existing = await db
      .prepare(
        'SELECT id, title, organization, summary, opportunity_type, region, url, deadline, published FROM opportunities WHERE id = ?'
      )
      .bind(id)
      .first<{
        id: string;
        title: string;
        organization: string;
        summary: string;
        opportunity_type: OpportunityType;
        region: OpportunityRegion;
        url: string;
        deadline: string | null;
        published: number;
      }>();

    if (!existing) return c.json({ error: 'Opportunity not found' }, 404);

    const nextTitle = input.title ?? existing.title;
    const nextOrg = input.organization ?? existing.organization;
    const nextSummary = input.summary ?? existing.summary;
    const nextType = input.opportunityType ?? existing.opportunity_type;
    const nextRegion = input.region ?? existing.region;
    const nextUrl = input.url ?? existing.url;
    const nextDeadline =
      input.deadline !== undefined ? input.deadline || null : existing.deadline;
    const nextPublished =
      input.published !== undefined ? (input.published ? 1 : 0) : existing.published;

    try {
      await db
        .prepare(
          'UPDATE opportunities SET title = ?, organization = ?, summary = ?, opportunity_type = ?, region = ?, url = ?, deadline = ?, published = ? WHERE id = ?'
        )
        .bind(
          nextTitle,
          nextOrg,
          nextSummary,
          nextType,
          nextRegion,
          nextUrl,
          nextDeadline,
          nextPublished,
          id
        )
        .run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Database update failed';
      if (msg.includes('CHECK constraint')) {
        return c.json(
          {
            error: 'Opportunity type not supported by database schema',
            message: `Database CHECK constraint rejected opportunityType "${nextType}".`,
          },
          400
        );
      }
      throw err;
    }

    await logAdminAction(db, actor.id, 'admin.update_opportunity', 'opportunity', id, {
      title: nextTitle,
    });

    return c.json({
      ok: true,
      opportunity: {
        id,
        title: nextTitle,
        organization: nextOrg,
        summary: nextSummary,
        opportunityType: nextType,
        region: nextRegion,
        url: nextUrl,
        deadline: nextDeadline,
        published: nextPublished === 1,
      },
    });
  }
);

adminRoutes.patch(
  '/opportunities/:id/publish',
  zValidator('json', adminPublishToggleSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await db
      .prepare('SELECT id, published FROM opportunities WHERE id = ?')
      .bind(id)
      .first<{ id: string; published: number }>();

    if (!existing) return c.json({ error: 'Opportunity not found' }, 404);

    const nextPublished =
      body?.published !== undefined ? (body.published ? 1 : 0) : existing.published === 1 ? 0 : 1;

    await db
      .prepare('UPDATE opportunities SET published = ? WHERE id = ?')
      .bind(nextPublished, id)
      .run();
    await logAdminAction(db, actor.id, 'admin.publish_opportunity', 'opportunity', id, {
      published: nextPublished === 1,
    });

    return c.json({ ok: true, id, published: nextPublished === 1 });
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

// Stage 7: Payments, Subscriptions, Revenue, AI Usage & Audit Logs
adminRoutes.get('/payments', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const { page, perPage, offset } = parsePagination(
    c.req.query('page'),
    c.req.query('per_page')
  );

  const [countRow, rows] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS total FROM payments').first<CountRow>(),
    db
      .prepare(
        `SELECT p.id, p.user_id, p.plan, p.telegram_payment_charge_id, p.currency, p.amount, p.status, p.created_at,
                u.username, u.first_name, u.last_name, u.telegram_id
         FROM payments p
         LEFT JOIN users u ON u.id = p.user_id
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(perPage, offset)
      .all<{
        id: string;
        user_id: string;
        plan: string;
        telegram_payment_charge_id: string;
        currency: string;
        amount: number;
        status: 'pending' | 'completed' | 'refunded';
        created_at: string;
        username: string | null;
        first_name: string | null;
        last_name: string | null;
        telegram_id: number | null;
      }>(),
  ]);

  const total = Number(countRow?.total ?? 0);
  const payments: AdminPaymentEntry[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    plan: row.plan,
    telegramPaymentChargeId: row.telegram_payment_charge_id,
    currency: row.currency,
    amount: row.amount,
    status: row.status,
    createdAt: row.created_at,
    username: row.username ?? null,
    firstName: row.first_name ?? 'Deleted User',
    lastName: row.last_name ?? null,
    telegramId: Number(row.telegram_id ?? 0),
  }));

  const payload: AdminPaginatedPaymentsResponse = {
    payments,
    page,
    per_page: perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  };
  return c.json(payload);
});

adminRoutes.get('/subscriptions', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const { page, perPage, offset } = parsePagination(
    c.req.query('page'),
    c.req.query('per_page')
  );

  const [countRow, rows] = await Promise.all([
    db.prepare('SELECT COUNT(*) AS total FROM subscriptions').first<CountRow>(),
    db
      .prepare(
        `SELECT s.id, s.user_id, s.plan, s.status, s.started_at, s.expires_at,
                u.username, u.first_name, u.last_name, u.telegram_id
         FROM subscriptions s
         LEFT JOIN users u ON u.id = s.user_id
         ORDER BY s.started_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(perPage, offset)
      .all<{
        id: string;
        user_id: string;
        plan: string;
        status: 'active' | 'expired' | 'cancelled';
        started_at: string;
        expires_at: string;
        username: string | null;
        first_name: string | null;
        last_name: string | null;
        telegram_id: number | null;
      }>(),
  ]);

  const total = Number(countRow?.total ?? 0);
  const subscriptions: AdminSubscriptionEntry[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    plan: row.plan,
    status: row.status,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    username: row.username ?? null,
    firstName: row.first_name ?? 'Deleted User',
    lastName: row.last_name ?? null,
    telegramId: Number(row.telegram_id ?? 0),
  }));

  const payload: AdminPaginatedSubscriptionsResponse = {
    subscriptions,
    page,
    per_page: perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  };
  return c.json(payload);
});

adminRoutes.get('/revenue', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const [totalsRow, monthlyRows, activeSubRow] = await Promise.all([
    db
      .prepare(
        "SELECT COALESCE(SUM(amount), 0) AS total_revenue, COUNT(*) AS total_payments FROM payments WHERE status = 'completed'"
      )
      .first<{ total_revenue: number; total_payments: number }>(),
    db
      .prepare(
        `SELECT substr(created_at, 1, 7) AS month, COALESCE(SUM(amount), 0) AS amount
         FROM payments
         WHERE status = 'completed'
         GROUP BY substr(created_at, 1, 7)
         ORDER BY month ASC
         LIMIT 12`
      )
      .all<{ month: string; amount: number }>(),
    db
      .prepare(
        "SELECT COUNT(*) AS total FROM subscriptions WHERE status = 'active' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
      )
      .first<CountRow>(),
  ]);

  const payload: AdminRevenueResponse = {
    total_revenue: Number(totalsRow?.total_revenue ?? 0),
    monthly_revenue: (monthlyRows.results ?? []).map((r) => ({
      month: r.month,
      amount: Number(r.amount ?? 0),
    })),
    active_subscriptions: Number(activeSubRow?.total ?? 0),
    total_payments: Number(totalsRow?.total_payments ?? 0),
  };

  return c.json(payload);
});

adminRoutes.get('/ai-usage', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const [usageSummary, messageCountRow] = await Promise.all([
    db
      .prepare(
        'SELECT COALESCE(SUM(count), 0) AS total_requests, COUNT(DISTINCT usage_date) AS active_days, COUNT(DISTINCT user_id) AS active_users FROM ai_daily_usage'
      )
      .first<{ total_requests: number; active_days: number; active_users: number }>(),
    db.prepare('SELECT COUNT(*) AS total FROM ai_messages').first<CountRow>(),
  ]);

  const totalRequests = Number(usageSummary?.total_requests ?? 0);
  const totalMessages = Math.max(Number(messageCountRow?.total ?? 0), totalRequests);
  const activeDays = Number(usageSummary?.active_days ?? 0);
  const dailyAverage =
    activeDays > 0 ? Math.round((totalRequests / activeDays) * 10) / 10 : 0;

  const payload: AdminAiUsageResponse = {
    total_messages: totalMessages,
    daily_average: dailyAverage,
    active_users: Number(usageSummary?.active_users ?? 0),
  };

  return c.json(payload);
});

adminRoutes.get('/audit-logs', async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const { page, perPage, offset } = parsePagination(
    c.req.query('page'),
    c.req.query('per_page')
  );
  const actionFilter = c.req.query('action')?.trim();
  const actorFilter = c.req.query('actor_user_id')?.trim();

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (actionFilter) {
    conditions.push('action LIKE ?');
    params.push(`%${actionFilter}%`);
  }
  if (actorFilter) {
    conditions.push('actor_user_id = ?');
    params.push(actorFilter);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRow, rows] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS total FROM audit_logs ${whereClause}`)
      .bind(...params)
      .first<CountRow>(),
    db
      .prepare(
        `SELECT id, actor_user_id, action, target_type, target_id, metadata_json, created_at
         FROM audit_logs
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, perPage, offset)
      .all<{
        id: string;
        actor_user_id: string | null;
        action: string;
        target_type: string | null;
        target_id: string | null;
        metadata_json: string;
        created_at: string;
      }>(),
  ]);

  const total = Number(countRow?.total ?? 0);
  const auditLogs: AuditLogEntry[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    metadataJson: row.metadata_json,
    createdAt: row.created_at,
  }));

  const payload: AdminPaginatedAuditLogsResponse = {
    audit_logs: auditLogs,
    page,
    per_page: perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  };

  return c.json(payload);
});

export default adminRoutes;
