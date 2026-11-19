import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  bookmarkToggleSchema,
  dashboardProfileUpdateSchema,
} from '../../shared/schemas.ts';
import type {
  AiTool,
  AiToolCategory,
  AiToolPricing,
  AnnouncementAudience,
  AnnouncementRecord,
  BuilderType,
  Course,
  CourseCertificate,
  DashboardAiUsage,
  DashboardOverviewResponse,
  LearningTrack,
  Opportunity,
  OpportunityRegion,
  OpportunityType,
} from '../../shared/types.ts';
import { featureDisabledResponse, isFeatureAccessible } from '../lib/featureAccess.ts';
import { getAppSettings } from '../lib/settings.ts';
import {
  mapDbUser,
  requireAuth,
  USER_SELECT_COLUMNS,
  type DbUserRow,
} from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const dashboardRoutes = new Hono<AppEnv>();

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

async function getUserAiUsage(
  db: D1Database,
  user: NonNullable<AppEnv['Variables']['user']>,
  freeDailyLimit: number
): Promise<DashboardAiUsage> {
  const row = await db
    .prepare('SELECT count FROM ai_daily_usage WHERE user_id = ? AND usage_date = ?')
    .bind(user.id, utcToday())
    .first<{ count: number }>();

  const unlimited = user.tier === 'pro' || user.role === 'admin';
  return {
    used_today: Number(row?.count ?? 0),
    limit: unlimited ? 'unlimited' : freeDailyLimit,
    plan: user.tier,
  };
}

dashboardRoutes.get('/dashboard', requireAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const user = c.get('user')!;
  const settings = await getAppSettings(db);
  const recipientName = `${user.firstName}${user.lastName ? ` ${user.lastName}` : ''}`;
  const tierAudience = user.tier === 'pro' ? 'pro' : 'free';

  const [
    completedRow,
    totalLessonsRow,
    projectCountRow,
    aiUsage,
    courseRows,
    toolRows,
    oppRows,
    enrolledRows,
    certRows,
    recentProjectRows,
    subscriptionRows,
    announcementRows,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM lesson_progress lp
         INNER JOIN lessons l ON l.id = lp.lesson_id
         INNER JOIN courses c ON c.id = l.course_id
         WHERE lp.user_id = ? AND c.published = 1 AND l.published = 1`
      )
      .bind(user.id)
      .first<{ total: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM lessons l
         INNER JOIN courses c ON c.id = l.course_id
         WHERE c.published = 1 AND l.published = 1`
      )
      .first<{ total: number }>(),
    db
      .prepare('SELECT COUNT(*) AS total FROM builder_projects WHERE user_id = ?')
      .bind(user.id)
      .first<{ total: number }>(),
    getUserAiUsage(db, user, settings.aiFreeDailyLimit),
    db
      .prepare(
        `SELECT
          c.id, c.slug, c.title, c.summary, c.track, c.category, c.is_pro, c.published, c.created_at,
          (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = 1) AS lesson_count,
          (SELECT COUNT(*) FROM lesson_progress lp
           INNER JOIN lessons l2 ON l2.id = lp.lesson_id
           WHERE l2.course_id = c.id AND l2.published = 1 AND lp.user_id = ?) AS completed_count
        FROM courses c
        INNER JOIN bookmarks b ON b.item_id = c.id AND b.item_type = 'course'
        WHERE b.user_id = ? AND c.published = 1
        ORDER BY b.created_at DESC`
      )
      .bind(user.id, user.id)
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
        completed_count: number;
      }>(),
    db
      .prepare(
        `SELECT t.id, t.name, t.summary, t.category, t.url, t.pricing_model, t.featured, t.published, t.created_at
         FROM ai_tools t
         INNER JOIN bookmarks b ON b.item_id = t.id AND b.item_type = 'tool'
         WHERE b.user_id = ? AND t.published = 1
         ORDER BY b.created_at DESC`
      )
      .bind(user.id)
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
      }>(),
    db
      .prepare(
        `SELECT o.id, o.title, o.organization, o.summary, o.opportunity_type, o.region, o.url, o.deadline, o.published, o.created_at
         FROM opportunities o
         INNER JOIN bookmarks b ON b.item_id = o.id AND b.item_type = 'opportunity'
         WHERE b.user_id = ? AND o.published = 1 AND COALESCE(o.archived, 0) = 0
         ORDER BY b.created_at DESC`
      )
      .bind(user.id)
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
      }>(),
    db
      .prepare(
        `SELECT c.id AS course_id, c.title, c.track, c.category, e.enrolled_at,
                (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = 1) AS lesson_count,
                (SELECT COUNT(*) FROM lesson_progress lp
                 INNER JOIN lessons l2 ON l2.id = lp.lesson_id
                 WHERE l2.course_id = c.id AND l2.published = 1 AND lp.user_id = ?) AS completed_count
         FROM course_enrollments e
         INNER JOIN courses c ON c.id = e.course_id
         WHERE e.user_id = ? AND c.published = 1
         ORDER BY e.enrolled_at DESC
         LIMIT 20`
      )
      .bind(user.id, user.id)
      .all<{
        course_id: string;
        title: string;
        track: LearningTrack;
        category: string;
        enrolled_at: string;
        lesson_count: number;
        completed_count: number;
      }>(),
    db
      .prepare(
        `SELECT cert.id, cert.user_id, cert.course_id, cert.certificate_code, cert.issued_at,
                c.title AS course_title, c.track AS course_track, c.category AS course_category
         FROM certificates cert
         INNER JOIN courses c ON c.id = cert.course_id
         WHERE cert.user_id = ?
         ORDER BY cert.issued_at DESC`
      )
      .bind(user.id)
      .all<{
        id: string;
        user_id: string;
        course_id: string;
        certificate_code: string;
        issued_at: string;
        course_title: string;
        course_track: LearningTrack;
        course_category: string;
      }>(),
    db
      .prepare(
        `SELECT id, name, builder_type, status, updated_at
         FROM builder_projects
         WHERE user_id = ?
         ORDER BY updated_at DESC
         LIMIT 6`
      )
      .bind(user.id)
      .all<{
        id: string;
        name: string;
        builder_type: BuilderType;
        status: string;
        updated_at: string;
      }>(),
    db
      .prepare(
        `SELECT id, plan, status, started_at, expires_at
         FROM subscriptions
         WHERE user_id = ?
         ORDER BY started_at DESC
         LIMIT 10`
      )
      .bind(user.id)
      .all<{
        id: string;
        plan: string;
        status: 'active' | 'expired' | 'cancelled';
        started_at: string;
        expires_at: string;
      }>(),
    db
      .prepare(
        `SELECT id, title, body, audience, published, created_by, sent_at, delivery_count, delivery_status, created_at, updated_at
         FROM announcements
         WHERE published = 1 AND (audience = 'all' OR audience = ?)
         ORDER BY created_at DESC
         LIMIT 5`
      )
      .bind(tierAudience)
      .all<{
        id: string;
        title: string;
        body: string;
        audience: AnnouncementAudience;
        published: number;
        created_by: string | null;
        sent_at: string | null;
        delivery_count: number;
        delivery_status: 'draft' | 'published' | 'sent' | 'partial';
        created_at: string;
        updated_at: string;
      }>(),
  ]);

  const courses: Course[] = (courseRows.results ?? []).map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    track: row.track,
    category: row.category,
    isPro: row.is_pro === 1,
    published: row.published === 1,
    lessonCount: Number(row.lesson_count ?? 0),
    completedCount: Number(row.completed_count ?? 0),
    bookmarked: true,
    createdAt: row.created_at,
  }));

  const tools: AiTool[] = (toolRows.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    summary: row.summary,
    category: row.category,
    url: row.url,
    pricingModel: row.pricing_model,
    featured: row.featured === 1,
    published: row.published === 1,
    bookmarked: true,
    createdAt: row.created_at,
  }));

  const opportunities: Opportunity[] = (oppRows.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    organization: row.organization,
    summary: row.summary,
    opportunityType: row.opportunity_type,
    region: row.region,
    url: row.url,
    deadline: row.deadline,
    published: row.published === 1,
    bookmarked: true,
    createdAt: row.created_at,
  }));

  const certificates: CourseCertificate[] = (certRows.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    courseTrack: row.course_track,
    courseCategory: row.course_category,
    recipientName,
    certificateCode: row.certificate_code,
    issuedAt: row.issued_at,
  }));

  const announcements: AnnouncementRecord[] = (announcementRows.results ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    audience: row.audience,
    published: row.published === 1,
    createdBy: row.created_by,
    sentAt: row.sent_at,
    deliveryCount: Number(row.delivery_count ?? 0),
    deliveryStatus: row.delivery_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  const projectCount = Number(projectCountRow?.total ?? 0);

  const payload: DashboardOverviewResponse = {
    stats: {
      completedLessons: Number(completedRow?.total ?? 0),
      totalLessons: Number(totalLessonsRow?.total ?? 0),
      bookmarkCount: courses.length + tools.length + opportunities.length,
      projectCount,
    },
    project_count: projectCount,
    ai_usage: aiUsage,
    bookmarks: {
      courses,
      tools,
      opportunities,
    },
    enrolledCourses: (enrolledRows.results ?? []).map((row) => ({
      courseId: row.course_id,
      title: row.title,
      track: row.track,
      category: row.category,
      lessonCount: Number(row.lesson_count ?? 0),
      completedCount: Number(row.completed_count ?? 0),
      enrolledAt: row.enrolled_at,
    })),
    certificates,
    recentProjects: (recentProjectRows.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      builderType: row.builder_type,
      status: row.status,
      updatedAt: row.updated_at,
    })),
    subscriptions: (subscriptionRows.results ?? []).map((row) => ({
      id: row.id,
      plan: row.plan,
      status: row.status,
      startedAt: row.started_at,
      expiresAt: row.expires_at,
    })),
    announcements,
  };

  return c.json(payload);
});

dashboardRoutes.get('/dashboard/ai-usage', requireAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const user = c.get('user')!;
  const settings = await getAppSettings(db);
  const usage = await getUserAiUsage(db, user, settings.aiFreeDailyLimit);
  return c.json(usage);
});

dashboardRoutes.put(
  '/dashboard/profile',
  requireAuth,
  rateLimit({ keyPrefix: 'profile_upd', limit: 20, windowSeconds: 60 }),
  zValidator('json', dashboardProfileUpdateSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) {
      return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
    }

    const user = c.get('user')!;
    const input = c.req.valid('json');

    const firstName = input.first_name ?? input.firstName;
    const lastName =
      input.last_name !== undefined ? input.last_name : input.lastName;
    const languageCode = input.language_code ?? input.languageCode;
    const photoUrlRaw =
      input.photo_url !== undefined ? input.photo_url : input.photoUrl;
    const photoUrl = photoUrlRaw === '' ? null : photoUrlRaw;

    const existing = await db
      .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = ?`)
      .bind(user.id)
      .first<DbUserRow>();

    if (!existing) {
      return c.json({ error: 'Not found', message: 'User not found.' }, 404);
    }

    await db
      .prepare(
        `UPDATE users
         SET first_name = ?,
             last_name = ?,
             language_code = ?,
             photo_url = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`
      )
      .bind(
        firstName ?? existing.first_name,
        lastName !== undefined ? lastName : existing.last_name,
        languageCode ?? existing.language_code ?? 'en',
        photoUrl !== undefined ? photoUrl : existing.photo_url,
        user.id
      )
      .run();

    const updated = await db
      .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = ?`)
      .bind(user.id)
      .first<DbUserRow>();

    return c.json({ user: updated ? mapDbUser(updated, c.env) : user });
  }
);

dashboardRoutes.post(
  '/bookmarks',
  requireAuth,
  zValidator('json', bookmarkToggleSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) {
      return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
    }

    const user = c.get('user')!;
    const { itemType, itemId } = c.req.valid('json');
    const settings = await getAppSettings(db);
    const bookmarkFeatureMap = {
      course: ['featureLearningEnabled', 'Learning Center'],
      tool: ['featureToolsEnabled', 'AI Tools Directory'],
      opportunity: ['featureOpportunitiesEnabled', 'Opportunities Hub'],
    } as const;
    const [featureKey, featureLabel] = bookmarkFeatureMap[itemType];
    if (!isFeatureAccessible(settings, featureKey, user)) {
      return featureDisabledResponse(c, featureLabel);
    }

    const existing = await db
      .prepare('SELECT 1 AS found FROM bookmarks WHERE user_id = ? AND item_type = ? AND item_id = ?')
      .bind(user.id, itemType, itemId)
      .first<{ found: number }>();

    if (existing) {
      await db
        .prepare('DELETE FROM bookmarks WHERE user_id = ? AND item_type = ? AND item_id = ?')
        .bind(user.id, itemType, itemId)
        .run();
      return c.json({ bookmarked: false, itemType, itemId });
    }

    const tableMap = {
      course: 'courses',
      tool: 'ai_tools',
      opportunity: 'opportunities',
    } as const;
    const targetTable = tableMap[itemType];
    const targetExists = await db
      .prepare(`SELECT id FROM ${targetTable} WHERE id = ? AND published = 1`)
      .bind(itemId)
      .first<{ id: string }>();

    if (!targetExists) {
      return c.json({ error: 'Not found', message: 'Bookmarked item does not exist.' }, 404);
    }

    await db
      .prepare('INSERT INTO bookmarks (user_id, item_type, item_id) VALUES (?, ?, ?)')
      .bind(user.id, itemType, itemId)
      .run();

    return c.json({ bookmarked: true, itemType, itemId });
  }
);

export default dashboardRoutes;
