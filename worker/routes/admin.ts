import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  adminAiConfigSchema,
  adminAnnouncementSchema,
  adminAppSettingsSchema,
  adminArchiveToggleSchema,
  adminBuildersConfigSchema,
  adminCreateCourseSchema,
  adminCreateLessonSchema,
  adminCreateOpportunitySchema,
  adminCreateToolSchema,
  adminFeatureToggleSchema,
  adminPublishToggleSchema,
  adminReconcilePaymentSchema,
  adminReorderLessonsSchema,
  adminUpdateCourseSchema,
  adminUpdateLessonSchema,
  adminUpdateOpportunitySchema,
  adminUpdateToolSchema,
  adminUpdateUserSchema,
} from '../../shared/schemas.ts';
import type {
  AdminAiControlResponse,
  AdminAiUsageResponse,
  AdminBuilderProjectEntry,
  AdminBuildersResponse,
  AdminOverviewResponse,
  AdminPaginatedAuditLogsResponse,
  AdminPaginatedPaymentsResponse,
  AdminPaginatedSubscriptionsResponse,
  AdminPaginatedUsersResponse,
  AdminPaymentEntry,
  AdminRevenueResponse,
  AdminSubscriptionEntry,
  AdminUserDetailResponse,
  AiTool,
  AiToolCategory,
  AiToolPricing,
  AnnouncementAudience,
  AnnouncementRecord,
  AuditLogEntry,
  BuilderType,
  Course,
  CourseCertificate,
  CourseResource,
  LearningTrack,
  Lesson,
  Opportunity,
  OpportunityRegion,
  OpportunityType,
} from '../../shared/types.ts';
import { getAppSettings, updateAppSettings } from '../lib/settings.ts';
import { sendTelegramMessage } from '../lib/telegramBot.ts';
import { DEFAULT_WORKERS_AI_MODEL } from '../lib/workersAi.ts';
import {
  DEFAULT_DELEGATED_ADMIN_PERMISSIONS,
  hasConfiguredAdminIds,
  isConfiguredOwnerTelegramId,
  mapDbUser,
  parseConfiguredOwnerIds,
  requireAdminPermission,
  requireAuth,
  requireRole,
  USER_SELECT_COLUMNS,
  type DbUserRow,
} from '../middleware/auth.ts';
import type { AppEnv } from '../types.ts';

const adminRoutes = new Hono<AppEnv>();

// Protect every endpoint under /api/admin with JWT verification + admin RBAC
adminRoutes.use('*', requireAuth, requireRole('admin'));

interface CountRow {
  total: number;
}

async function countTable(db: D1Database, tableName: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) AS total FROM ${tableName}`).first<CountRow>();
  return Number(row?.total ?? 0);
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
    Number.isFinite(perPageParsed) && perPageParsed >= 1 ? Math.min(perPageParsed, 100) : 50;
  return { page, perPage, offset: (page - 1) * perPage };
}

function parseResourcesJson(raw: string | null | undefined): CourseResource[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CourseResource =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as CourseResource).title === 'string' &&
        typeof (item as CourseResource).url === 'string'
    );
  } catch {
    return [];
  }
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

// A. Platform Overview
adminRoutes.get('/overview', async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const now = Date.now();
  const iso24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const iso7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const iso30d = new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  const todayPrefix = new Date(now).toISOString().slice(0, 10);

  const [
    usersCount,
    coursesCount,
    lessonsCount,
    aiToolsCount,
    opportunitiesCount,
    builderProjectsCount,
    paymentsCount,
    usersResult,
    auditResult,
    new7dRow,
    new30dRow,
    active24hRow,
    active7dRow,
    active30dRow,
    suspendedRow,
    publishedCoursesRow,
    publishedLessonsRow,
    aiReqTotalRow,
    aiReqTodayRow,
    aiErrRow,
    activeSubsRow,
    paymentBreakdownRow,
    builderBreakdownRows,
    adminRoleRows,
  ] = await Promise.all([
    countTable(db, 'users'),
    countTable(db, 'courses'),
    countTable(db, 'lessons'),
    countTable(db, 'ai_tools'),
    countTable(db, 'opportunities'),
    countTable(db, 'builder_projects'),
    countTable(db, 'payments'),
    db
      .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users ORDER BY created_at DESC LIMIT 50`)
      .all<DbUserRow>(),
    db
      .prepare(
        `SELECT a.id, a.actor_user_id, a.action, a.target_type, a.target_id, a.metadata_json, a.created_at,
                u.first_name AS actor_first_name, u.last_name AS actor_last_name, u.username AS actor_username, u.telegram_id AS actor_telegram_id
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ORDER BY a.created_at DESC
         LIMIT 25`
      )
      .all<{
        id: string;
        actor_user_id: string | null;
        action: string;
        target_type: string | null;
        target_id: string | null;
        metadata_json: string;
        created_at: string;
        actor_first_name: string | null;
        actor_last_name: string | null;
        actor_username: string | null;
        actor_telegram_id: number | null;
      }>(),
    db.prepare('SELECT COUNT(*) AS total FROM users WHERE created_at >= ?').bind(iso7d).first<CountRow>(),
    db.prepare('SELECT COUNT(*) AS total FROM users WHERE created_at >= ?').bind(iso30d).first<CountRow>(),
    db
      .prepare('SELECT COUNT(*) AS total FROM users WHERE COALESCE(last_active_at, updated_at) >= ?')
      .bind(iso24h)
      .first<CountRow>(),
    db
      .prepare('SELECT COUNT(*) AS total FROM users WHERE COALESCE(last_active_at, updated_at) >= ?')
      .bind(iso7d)
      .first<CountRow>(),
    db
      .prepare('SELECT COUNT(*) AS total FROM users WHERE COALESCE(last_active_at, updated_at) >= ?')
      .bind(iso30d)
      .first<CountRow>(),
    db
      .prepare("SELECT COUNT(*) AS total FROM users WHERE account_status = 'suspended'")
      .first<CountRow>(),
    db.prepare('SELECT COUNT(*) AS total FROM courses WHERE published = 1').first<CountRow>(),
    db.prepare('SELECT COUNT(*) AS total FROM lessons WHERE published = 1').first<CountRow>(),
    db.prepare('SELECT COALESCE(SUM(count), 0) AS total FROM ai_daily_usage').first<CountRow>(),
    db
      .prepare('SELECT COALESCE(SUM(count), 0) AS total FROM ai_daily_usage WHERE usage_date = ?')
      .bind(todayPrefix)
      .first<CountRow>(),
    db
      .prepare("SELECT COUNT(*) AS total FROM ai_request_logs WHERE status = 'error'")
      .first<CountRow>(),
    db
      .prepare(
        "SELECT COUNT(*) AS total FROM subscriptions WHERE status = 'active' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')"
      )
      .first<CountRow>(),
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) AS completed_revenue,
           COUNT(CASE WHEN status = 'pending' AND failed_reason IS NULL THEN 1 END) AS pending_payments,
           COUNT(CASE WHEN status = 'pending' AND failed_reason IS NOT NULL THEN 1 END) AS failed_payments,
           COUNT(CASE WHEN status = 'refunded' THEN 1 END) AS refunded_payments
         FROM payments`
      )
      .first<{
        completed_revenue: number;
        pending_payments: number;
        failed_payments: number;
        refunded_payments: number;
      }>(),
    db
      .prepare('SELECT builder_type, COUNT(*) AS count FROM builder_projects GROUP BY builder_type')
      .all<{ builder_type: BuilderType; count: number }>(),
    db
      .prepare("SELECT telegram_id, role FROM users WHERE role = 'admin'")
      .all<{ telegram_id: number; role: string }>(),
  ]);

  let ownerCount = 0;
  let adminCount = 0;
  for (const row of adminRoleRows.results ?? []) {
    if (isConfiguredOwnerTelegramId(Number(row.telegram_id), c.env)) {
      ownerCount += 1;
    } else {
      adminCount += 1;
    }
  }

  const recentAuditLogs: AuditLogEntry[] = (auditResult.results ?? []).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_first_name
      ? `${row.actor_first_name}${row.actor_last_name ? ` ${row.actor_last_name}` : ''}`
      : null,
    actorUsername: row.actor_username ?? null,
    actorTelegramId: row.actor_telegram_id ? Number(row.actor_telegram_id) : null,
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
    metrics: {
      newUsers7d: Number(new7dRow?.total ?? 0),
      newUsers30d: Number(new30dRow?.total ?? 0),
      activeUsers24h: Number(active24hRow?.total ?? 0),
      activeUsers7d: Number(active7dRow?.total ?? 0),
      activeUsers30d: Number(active30dRow?.total ?? 0),
      ownerCount,
      adminCount,
      suspendedCount: Number(suspendedRow?.total ?? 0),
      publishedCourses: Number(publishedCoursesRow?.total ?? 0),
      publishedLessons: Number(publishedLessonsRow?.total ?? 0),
      aiRequestsTotal: Number(aiReqTotalRow?.total ?? 0),
      aiRequestsToday: Number(aiReqTodayRow?.total ?? 0),
      aiErrorsTotal: Number(aiErrRow?.total ?? 0),
      activeProSubscriptions: Number(activeSubsRow?.total ?? 0),
      completedRevenue: Number(paymentBreakdownRow?.completed_revenue ?? 0),
      pendingPayments: Number(paymentBreakdownRow?.pending_payments ?? 0),
      failedPayments: Number(paymentBreakdownRow?.failed_payments ?? 0),
      refundedPayments: Number(paymentBreakdownRow?.refunded_payments ?? 0),
      builderBreakdown: (builderBreakdownRows.results ?? []).map((r) => ({
        builderType: r.builder_type,
        count: Number(r.count ?? 0),
      })),
    },
    adminConfigStatus: {
      adminIdsConfigured: hasConfiguredAdminIds(c.env),
      telegramBotConfigured: Boolean(c.env.TELEGRAM_BOT_TOKEN),
      workersAiBound: Boolean(c.env.AI),
    },
    users: (usersResult.results ?? []).map((row) => mapDbUser(row, c.env)),
    recentAuditLogs,
  };

  return c.json(payload);
});

// B. User Management
adminRoutes.get('/users', requireAdminPermission('users.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const { page, perPage, offset } = parsePagination(
    c.req.query('page'),
    c.req.query('per_page')
  );
  const q = c.req.query('q')?.trim();
  const roleFilter = c.req.query('role')?.trim();
  const tierFilter = c.req.query('tier')?.trim();
  const statusFilter = c.req.query('status')?.trim();

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (q) {
    conditions.push(
      '(CAST(telegram_id AS TEXT) LIKE ? OR COALESCE(username, \'\') LIKE ? OR first_name LIKE ? OR COALESCE(last_name, \'\') LIKE ? OR id LIKE ?)'
    );
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  const ownerIds = parseConfiguredOwnerIds(c.env);
  if (roleFilter === 'owner') {
    if (ownerIds.length === 0) {
      conditions.push('1 = 0');
    } else {
      conditions.push(`telegram_id IN (${ownerIds.map(() => '?').join(',')})`);
      params.push(...ownerIds);
    }
  } else if (roleFilter === 'admin') {
    conditions.push("role = 'admin'");
    if (ownerIds.length > 0) {
      conditions.push(`telegram_id NOT IN (${ownerIds.map(() => '?').join(',')})`);
      params.push(...ownerIds);
    }
  } else if (roleFilter === 'member') {
    conditions.push("role = 'member'");
  }

  if (tierFilter === 'free' || tierFilter === 'pro') {
    conditions.push('tier = ?');
    params.push(tierFilter);
  }

  if (statusFilter === 'active') {
    conditions.push("COALESCE(account_status, 'active') != 'suspended'");
  } else if (statusFilter === 'suspended') {
    conditions.push("account_status = 'suspended'");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRow, rows] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS total FROM users ${whereClause}`)
      .bind(...params)
      .first<CountRow>(),
    db
      .prepare(
        `SELECT ${USER_SELECT_COLUMNS} FROM users ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`
      )
      .bind(...params, perPage, offset)
      .all<DbUserRow>(),
  ]);

  const total = Number(countRow?.total ?? 0);
  const payload: AdminPaginatedUsersResponse = {
    users: (rows.results ?? []).map((row) => mapDbUser(row, c.env)),
    page,
    per_page: perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  };
  return c.json(payload);
});

adminRoutes.get('/users/:id', requireAdminPermission('users.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const userId = c.req.param('id');
  const userRow = await db
    .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = ?`)
    .bind(userId)
    .first<DbUserRow>();

  if (!userRow) {
    return c.json({ error: 'Not found', message: 'User not found.' }, 404);
  }

  const mappedUser = mapDbUser(userRow, c.env);
  const today = new Date().toISOString().slice(0, 10);

  const [
    completedRow,
    totalLessonsRow,
    enrolledRows,
    certRows,
    aiTodayRow,
    aiTotalRow,
    aiConvRow,
    builderRows,
    subRows,
    payRows,
    auditRows,
  ] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM lesson_progress lp
         INNER JOIN lessons l ON l.id = lp.lesson_id
         INNER JOIN courses c ON c.id = l.course_id
         WHERE lp.user_id = ? AND c.published = 1 AND l.published = 1`
      )
      .bind(userId)
      .first<CountRow>(),
    db
      .prepare(
        'SELECT COUNT(*) AS total FROM lessons l INNER JOIN courses c ON c.id = l.course_id WHERE c.published = 1 AND l.published = 1'
      )
      .first<CountRow>(),
    db
      .prepare(
        `SELECT c.id AS course_id, c.title, c.track, e.enrolled_at,
                (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.published = 1) AS total_lessons,
                (SELECT COUNT(*) FROM lesson_progress lp
                 INNER JOIN lessons l2 ON l2.id = lp.lesson_id
                 WHERE l2.course_id = c.id AND l2.published = 1 AND lp.user_id = ?) AS completed_lessons
         FROM course_enrollments e
         INNER JOIN courses c ON c.id = e.course_id
         WHERE e.user_id = ?
         ORDER BY e.enrolled_at DESC
         LIMIT 20`
      )
      .bind(userId, userId)
      .all<{
        course_id: string;
        title: string;
        track: LearningTrack;
        enrolled_at: string;
        total_lessons: number;
        completed_lessons: number;
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
      .bind(userId)
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
      .prepare('SELECT count AS total FROM ai_daily_usage WHERE user_id = ? AND usage_date = ?')
      .bind(userId, today)
      .first<CountRow>(),
    db
      .prepare('SELECT COALESCE(SUM(count), 0) AS total FROM ai_daily_usage WHERE user_id = ?')
      .bind(userId)
      .first<CountRow>(),
    db
      .prepare('SELECT COUNT(*) AS total FROM ai_conversations WHERE user_id = ?')
      .bind(userId)
      .first<CountRow>(),
    db
      .prepare(
        'SELECT id, name, builder_type, status, created_at FROM builder_projects WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
      )
      .bind(userId)
      .all<{
        id: string;
        name: string;
        builder_type: BuilderType;
        status: string;
        created_at: string;
      }>(),
    db
      .prepare(
        'SELECT id, user_id, plan, status, started_at, expires_at FROM subscriptions WHERE user_id = ? ORDER BY started_at DESC LIMIT 20'
      )
      .bind(userId)
      .all<{
        id: string;
        user_id: string;
        plan: string;
        status: 'active' | 'expired' | 'cancelled';
        started_at: string;
        expires_at: string;
      }>(),
    db
      .prepare(
        'SELECT id, user_id, plan, telegram_payment_charge_id, currency, amount, status, reconciliation_note, reconciled_at, failed_reason, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC LIMIT 20'
      )
      .bind(userId)
      .all<{
        id: string;
        user_id: string;
        plan: string;
        telegram_payment_charge_id: string;
        currency: string;
        amount: number;
        status: 'pending' | 'completed' | 'refunded';
        reconciliation_note?: string | null;
        reconciled_at?: string | null;
        failed_reason?: string | null;
        created_at: string;
      }>(),
    db
      .prepare(
        'SELECT id, actor_user_id, action, target_type, target_id, metadata_json, created_at FROM audit_logs WHERE actor_user_id = ? OR target_id = ? ORDER BY created_at DESC LIMIT 20'
      )
      .bind(userId, userId)
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

  const certificates: CourseCertificate[] = (certRows.results ?? []).map((row) => ({
    id: row.id,
    userId: row.user_id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    courseTrack: row.course_track,
    courseCategory: row.course_category,
    recipientName: `${mappedUser.firstName}${mappedUser.lastName ? ` ${mappedUser.lastName}` : ''}`,
    certificateCode: row.certificate_code,
    issuedAt: row.issued_at,
  }));

  const detail: AdminUserDetailResponse = {
    user: mappedUser,
    learning: {
      completedLessons: Number(completedRow?.total ?? 0),
      totalLessons: Number(totalLessonsRow?.total ?? 0),
      enrolledCourses: (enrolledRows.results ?? []).map((r) => ({
        courseId: r.course_id,
        title: r.title,
        track: r.track,
        enrolledAt: r.enrolled_at,
        completedLessons: Number(r.completed_lessons ?? 0),
        totalLessons: Number(r.total_lessons ?? 0),
      })),
      certificates,
    },
    aiUsage: {
      usedToday: Number(aiTodayRow?.total ?? 0),
      totalRequests: Number(aiTotalRow?.total ?? 0),
      totalConversations: Number(aiConvRow?.total ?? 0),
    },
    builderProjects: (builderRows.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      builderType: r.builder_type,
      status: r.status,
      createdAt: r.created_at,
    })),
    subscriptions: (subRows.results ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      plan: r.plan,
      status: r.status,
      startedAt: r.started_at,
      expiresAt: r.expires_at,
      username: mappedUser.username,
      firstName: mappedUser.firstName,
      lastName: mappedUser.lastName,
      telegramId: mappedUser.telegramId,
    })),
    payments: (payRows.results ?? []).map((r) => ({
      id: r.id,
      userId: r.user_id,
      plan: r.plan,
      telegramPaymentChargeId: r.telegram_payment_charge_id,
      currency: r.currency,
      amount: r.amount,
      status: r.status,
      reconciliationNote: r.reconciliation_note ?? null,
      reconciledAt: r.reconciled_at ?? null,
      failedReason: r.failed_reason ?? null,
      createdAt: r.created_at,
      username: mappedUser.username,
      firstName: mappedUser.firstName,
      lastName: mappedUser.lastName,
      telegramId: mappedUser.telegramId,
    })),
    recentAuditLogs: (auditRows.results ?? []).map((r) => ({
      id: r.id,
      actorUserId: r.actor_user_id,
      action: r.action,
      targetType: r.target_type,
      targetId: r.target_id,
      metadataJson: r.metadata_json,
      createdAt: r.created_at,
    })),
  };

  return c.json(detail);
});

adminRoutes.patch(
  '/users/:id',
  requireAdminPermission('users.manage'),
  zValidator('json', adminUpdateUserSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) {
      return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
    }

    const actor = c.get('user')!;
    const targetUserId = c.req.param('id');
    const updates = c.req.valid('json');

    const existing = await db
      .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = ?`)
      .bind(targetUserId)
      .first<DbUserRow>();

    if (!existing) {
      return c.json({ error: 'Not found', message: 'User not found.' }, 404);
    }

    const targetIsOwner = isConfiguredOwnerTelegramId(
      Number(existing.telegram_id),
      c.env
    );

    if ((updates.role !== undefined || updates.adminPermissions !== undefined) && !actor.isOwner) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'Only the AFRINEX Owner can assign or modify administrator roles and permissions.',
        },
        403
      );
    }

    if (targetIsOwner && (updates.role === 'member' || updates.accountStatus === 'suspended')) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'Configured AFRINEX Owner accounts cannot be demoted or suspended.',
        },
        403
      );
    }

    if (actor.id === targetUserId && (updates.role === 'member' || updates.accountStatus === 'suspended')) {
      return c.json(
        {
          error: 'Invalid operation',
          message: 'You cannot demote or suspend your own active account.',
        },
        400
      );
    }

    const nextRole = targetIsOwner ? 'admin' : updates.role ?? existing.role;
    const nextTier = updates.tier ?? existing.tier;
    const nextAccountStatus = targetIsOwner
      ? 'active'
      : updates.accountStatus ?? (existing.account_status === 'suspended' ? 'suspended' : 'active');
    const nextSuspendedAt =
      nextAccountStatus === 'suspended'
        ? existing.suspended_at ?? new Date().toISOString()
        : null;
    const nextSuspendedReason =
      nextAccountStatus === 'suspended'
        ? updates.suspendedReason !== undefined
          ? updates.suspendedReason
          : existing.suspended_reason ?? 'Suspended by an administrator.'
        : null;

    let nextPermissionsJson = existing.admin_permissions_json ?? '[]';
    if (nextRole === 'member') {
      nextPermissionsJson = '[]';
    } else if (updates.adminPermissions !== undefined) {
      nextPermissionsJson = JSON.stringify(updates.adminPermissions);
    } else if (nextRole === 'admin' && existing.role !== 'admin') {
      nextPermissionsJson = JSON.stringify(DEFAULT_DELEGATED_ADMIN_PERMISSIONS);
    }

    const shouldRevokeSession =
      nextRole !== existing.role ||
      nextAccountStatus !== (existing.account_status ?? 'active') ||
      nextPermissionsJson !== (existing.admin_permissions_json ?? '[]');

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
             account_status = ?,
             suspended_at = ?,
             suspended_reason = ?,
             admin_permissions_json = ?,
             token_version = CASE WHEN ? = 1 THEN token_version + 1 ELSE token_version END,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?`
      )
      .bind(
        nextRole,
        nextTier,
        nextProExpiresAt,
        nextAccountStatus,
        nextSuspendedAt,
        nextSuspendedReason,
        nextPermissionsJson,
        shouldRevokeSession ? 1 : 0,
        targetUserId
      )
      .run();

    await logAdminAction(db, actor.id, 'admin.update_user', 'user', targetUserId, {
      role: nextRole,
      tier: nextTier,
      accountStatus: nextAccountStatus,
      suspendedReason: nextSuspendedReason,
      permissionsUpdated: updates.adminPermissions !== undefined,
    });

    const updated = await db
      .prepare(`SELECT ${USER_SELECT_COLUMNS} FROM users WHERE id = ?`)
      .bind(targetUserId)
      .first<DbUserRow>();

    return c.json({ user: updated ? mapDbUser(updated, c.env) : null });
  }
);

// C. Learning Center Management
adminRoutes.get('/courses', requireAdminPermission('learning.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const rows = await db
    .prepare(
      `SELECT c.id, c.slug, c.title, c.summary, c.track, c.category, c.is_pro, c.published, c.image_url, c.resources_json, c.created_at,
              (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id) AS lesson_count,
              (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id) AS enrollment_count,
              (SELECT COUNT(*) FROM certificates cert WHERE cert.course_id = c.id) AS completion_count
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
      image_url: string | null;
      resources_json: string | null;
      created_at: string;
      lesson_count: number;
      enrollment_count: number;
      completion_count: number;
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
    imageUrl: row.image_url ?? null,
    resources: parseResourcesJson(row.resources_json),
    lessonCount: Number(row.lesson_count ?? 0),
    completedCount: 0,
    enrollmentCount: Number(row.enrollment_count ?? 0),
    completionCount: Number(row.completion_count ?? 0),
    bookmarked: false,
    createdAt: row.created_at,
  }));

  return c.json({ courses });
});

adminRoutes.get('/courses/:id/lessons', requireAdminPermission('learning.manage'), async (c) => {
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

adminRoutes.post(
  '/courses',
  requireAdminPermission('learning.manage'),
  zValidator('json', adminCreateCourseSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const input = c.req.valid('json');
    const id = `course_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const slug = `${slugify(input.title)}-${id.slice(-4)}`;
    const imageUrl = input.imageUrl ? input.imageUrl : null;
    const resourcesJson = JSON.stringify(input.resources ?? []);

    await db
      .prepare(
        'INSERT INTO courses (id, slug, title, summary, track, category, is_pro, published, image_url, resources_json) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)'
      )
      .bind(
        id,
        slug,
        input.title,
        input.summary,
        input.track,
        input.category,
        input.isPro ? 1 : 0,
        imageUrl,
        resourcesJson
      )
      .run();

    await logAdminAction(db, actor.id, 'admin.create_course', 'course', id, {
      title: input.title,
    });

    return c.json({ ok: true, id, slug }, 201);
  }
);

adminRoutes.put(
  '/courses/:id',
  requireAdminPermission('learning.manage'),
  zValidator('json', adminUpdateCourseSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const existing = await db
      .prepare(
        'SELECT id, title, summary, track, category, is_pro, published, image_url, resources_json FROM courses WHERE id = ?'
      )
      .bind(id)
      .first<{
        id: string;
        title: string;
        summary: string;
        track: LearningTrack;
        category: string;
        is_pro: number;
        published: number;
        image_url: string | null;
        resources_json: string | null;
      }>();

    if (!existing) return c.json({ error: 'Course not found' }, 404);

    const nextTitle = input.title ?? existing.title;
    const nextSummary = input.summary ?? existing.summary;
    const nextTrack = input.track ?? existing.track;
    const nextCategory = input.category ?? existing.category;
    const nextIsPro = input.isPro !== undefined ? (input.isPro ? 1 : 0) : existing.is_pro;
    const nextPublished =
      input.published !== undefined ? (input.published ? 1 : 0) : existing.published;
    const nextImageUrl =
      input.imageUrl !== undefined ? (input.imageUrl ? input.imageUrl : null) : existing.image_url;
    const nextResourcesJson =
      input.resources !== undefined
        ? JSON.stringify(input.resources)
        : existing.resources_json ?? '[]';

    await db
      .prepare(
        'UPDATE courses SET title = ?, summary = ?, track = ?, category = ?, is_pro = ?, published = ?, image_url = ?, resources_json = ? WHERE id = ?'
      )
      .bind(
        nextTitle,
        nextSummary,
        nextTrack,
        nextCategory,
        nextIsPro,
        nextPublished,
        nextImageUrl,
        nextResourcesJson,
        id
      )
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
        imageUrl: nextImageUrl,
        resources: parseResourcesJson(nextResourcesJson),
      },
    });
  }
);

adminRoutes.patch(
  '/courses/:id/publish',
  requireAdminPermission('learning.manage'),
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

adminRoutes.delete('/courses/:id', requireAdminPermission('learning.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const id = c.req.param('id');
  const res = await db.prepare('DELETE FROM courses WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return c.json({ error: 'Course not found' }, 404);

  await logAdminAction(db, actor.id, 'admin.delete_course', 'course', id);
  return c.json({ ok: true });
});

adminRoutes.post(
  '/courses/:id/lessons/reorder',
  requireAdminPermission('learning.manage'),
  zValidator('json', adminReorderLessonsSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const courseId = c.req.param('id');
    const { lessonIds } = c.req.valid('json');

    const statements = lessonIds.map((lessonId, index) =>
      db
        .prepare('UPDATE lessons SET sort_order = ? WHERE id = ? AND course_id = ?')
        .bind(index + 1, lessonId, courseId)
    );
    if (statements.length > 0) {
      await db.batch(statements);
    }

    await logAdminAction(db, actor.id, 'admin.reorder_lessons', 'course', courseId, {
      lessonCount: lessonIds.length,
    });

    return c.json({ ok: true });
  }
);

adminRoutes.post(
  '/lessons',
  requireAdminPermission('learning.manage'),
  zValidator('json', adminCreateLessonSchema),
  async (c) => {
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
  }
);

adminRoutes.put(
  '/lessons/:id',
  requireAdminPermission('learning.manage'),
  zValidator('json', adminUpdateLessonSchema),
  async (c) => {
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
  }
);

adminRoutes.patch(
  '/lessons/:id/publish',
  requireAdminPermission('learning.manage'),
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

adminRoutes.delete('/lessons/:id', requireAdminPermission('learning.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const id = c.req.param('id');
  const res = await db.prepare('DELETE FROM lessons WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return c.json({ error: 'Lesson not found' }, 404);

  await logAdminAction(db, actor.id, 'admin.delete_lesson', 'lesson', id);
  return c.json({ ok: true });
});

// D. AI Tools Directory CRUD
adminRoutes.get('/tools', requireAdminPermission('tools.manage'), async (c) => {
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

adminRoutes.post(
  '/tools',
  requireAdminPermission('tools.manage'),
  zValidator('json', adminCreateToolSchema),
  async (c) => {
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
  }
);

adminRoutes.put(
  '/tools/:id',
  requireAdminPermission('tools.manage'),
  zValidator('json', adminUpdateToolSchema),
  async (c) => {
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
  }
);

adminRoutes.patch(
  '/tools/:id/feature',
  requireAdminPermission('tools.manage'),
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
  requireAdminPermission('tools.manage'),
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

adminRoutes.delete('/tools/:id', requireAdminPermission('tools.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const actor = c.get('user')!;
  const id = c.req.param('id');
  const res = await db.prepare('DELETE FROM ai_tools WHERE id = ?').bind(id).run();
  if (!res.meta.changes) return c.json({ error: 'Tool not found' }, 404);

  await logAdminAction(db, actor.id, 'admin.delete_tool', 'ai_tool', id);
  return c.json({ ok: true });
});

// E. Opportunities Management
adminRoutes.get('/opportunities', requireAdminPermission('opportunities.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const rows = await db
    .prepare(
      'SELECT id, title, organization, summary, opportunity_type, region, url, deadline, published, COALESCE(featured, 0) AS featured, COALESCE(archived, 0) AS archived, created_at FROM opportunities ORDER BY COALESCE(archived, 0) ASC, COALESCE(featured, 0) DESC, created_at DESC'
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
      featured: number;
      archived: number;
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
    featured: row.featured === 1,
    archived: row.archived === 1,
    bookmarked: false,
    createdAt: row.created_at,
  }));

  return c.json({ opportunities });
});

adminRoutes.post(
  '/opportunities',
  requireAdminPermission('opportunities.manage'),
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
          'INSERT INTO opportunities (id, title, organization, summary, opportunity_type, region, url, deadline, published, featured, archived) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0)'
        )
        .bind(
          id,
          input.title,
          input.organization,
          input.summary,
          input.opportunityType,
          input.region,
          input.url,
          input.deadline || null,
          input.featured ? 1 : 0
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
  requireAdminPermission('opportunities.manage'),
  zValidator('json', adminUpdateOpportunitySchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const existing = await db
      .prepare(
        'SELECT id, title, organization, summary, opportunity_type, region, url, deadline, published, COALESCE(featured, 0) AS featured, COALESCE(archived, 0) AS archived FROM opportunities WHERE id = ?'
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
        featured: number;
        archived: number;
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
    const nextFeatured =
      input.featured !== undefined ? (input.featured ? 1 : 0) : existing.featured;
    const nextArchived =
      input.archived !== undefined ? (input.archived ? 1 : 0) : existing.archived;

    try {
      await db
        .prepare(
          'UPDATE opportunities SET title = ?, organization = ?, summary = ?, opportunity_type = ?, region = ?, url = ?, deadline = ?, published = ?, featured = ?, archived = ? WHERE id = ?'
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
          nextFeatured,
          nextArchived,
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
        featured: nextFeatured === 1,
        archived: nextArchived === 1,
      },
    });
  }
);

adminRoutes.patch(
  '/opportunities/:id/publish',
  requireAdminPermission('opportunities.manage'),
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

adminRoutes.patch(
  '/opportunities/:id/feature',
  requireAdminPermission('opportunities.manage'),
  zValidator('json', adminFeatureToggleSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await db
      .prepare('SELECT id, COALESCE(featured, 0) AS featured FROM opportunities WHERE id = ?')
      .bind(id)
      .first<{ id: string; featured: number }>();

    if (!existing) return c.json({ error: 'Opportunity not found' }, 404);

    const nextFeatured =
      body?.featured !== undefined ? (body.featured ? 1 : 0) : existing.featured === 1 ? 0 : 1;

    await db
      .prepare('UPDATE opportunities SET featured = ? WHERE id = ?')
      .bind(nextFeatured, id)
      .run();
    await logAdminAction(db, actor.id, 'admin.feature_opportunity', 'opportunity', id, {
      featured: nextFeatured === 1,
    });

    return c.json({ ok: true, id, featured: nextFeatured === 1 });
  }
);

adminRoutes.patch(
  '/opportunities/:id/archive',
  requireAdminPermission('opportunities.manage'),
  zValidator('json', adminArchiveToggleSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await db
      .prepare('SELECT id, COALESCE(archived, 0) AS archived FROM opportunities WHERE id = ?')
      .bind(id)
      .first<{ id: string; archived: number }>();

    if (!existing) return c.json({ error: 'Opportunity not found' }, 404);

    const nextArchived =
      body?.archived !== undefined ? (body.archived ? 1 : 0) : existing.archived === 1 ? 0 : 1;

    await db
      .prepare('UPDATE opportunities SET archived = ? WHERE id = ?')
      .bind(nextArchived, id)
      .run();
    await logAdminAction(db, actor.id, 'admin.archive_opportunity', 'opportunity', id, {
      archived: nextArchived === 1,
    });

    return c.json({ ok: true, id, archived: nextArchived === 1 });
  }
);

adminRoutes.post(
  '/opportunities/archive-expired',
  requireAdminPermission('opportunities.manage'),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const todayDate = new Date().toISOString().slice(0, 10);

    const res = await db
      .prepare(
        "UPDATE opportunities SET archived = 1 WHERE COALESCE(archived, 0) = 0 AND deadline IS NOT NULL AND deadline != '' AND deadline GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]*' AND substr(deadline, 1, 10) < ?"
      )
      .bind(todayDate)
      .run();

    const archivedCount = Number(res.meta.changes ?? 0);
    await logAdminAction(
      db,
      actor.id,
      'admin.archive_expired_opportunities',
      'opportunity',
      'bulk',
      { archivedCount, cutoffDate: todayDate }
    );

    return c.json({ ok: true, archivedCount });
  }
);

adminRoutes.delete(
  '/opportunities/:id',
  requireAdminPermission('opportunities.manage'),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const res = await db.prepare('DELETE FROM opportunities WHERE id = ?').bind(id).run();
    if (!res.meta.changes) return c.json({ error: 'Opportunity not found' }, 404);

    await logAdminAction(db, actor.id, 'admin.delete_opportunity', 'opportunity', id);
    return c.json({ ok: true });
  }
);

// F. AI Assistant Management (privacy-preserving: aggregate metrics & errors only, never chat transcripts)
adminRoutes.get('/ai-usage', requireAdminPermission('ai.manage'), async (c) => {
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

adminRoutes.get('/ai', requireAdminPermission('ai.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const iso24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    settings,
    usageSummary,
    messageCountRow,
    convCountRow,
    req24hRow,
    errTotalRow,
    err24hRow,
    recentErrorRows,
  ] = await Promise.all([
    getAppSettings(db),
    db
      .prepare(
        'SELECT COALESCE(SUM(count), 0) AS total_requests, COUNT(DISTINCT usage_date) AS active_days, COUNT(DISTINCT user_id) AS active_users FROM ai_daily_usage'
      )
      .first<{ total_requests: number; active_days: number; active_users: number }>(),
    db.prepare('SELECT COUNT(*) AS total FROM ai_messages').first<CountRow>(),
    db.prepare('SELECT COUNT(*) AS total FROM ai_conversations').first<CountRow>(),
    db
      .prepare('SELECT COUNT(*) AS total FROM ai_request_logs WHERE created_at >= ?')
      .bind(iso24h)
      .first<CountRow>(),
    db
      .prepare("SELECT COUNT(*) AS total FROM ai_request_logs WHERE status = 'error'")
      .first<CountRow>(),
    db
      .prepare("SELECT COUNT(*) AS total FROM ai_request_logs WHERE status = 'error' AND created_at >= ?")
      .bind(iso24h)
      .first<CountRow>(),
    db
      .prepare(
        "SELECT id, model, error_message, created_at FROM ai_request_logs WHERE status = 'error' ORDER BY created_at DESC LIMIT 15"
      )
      .all<{ id: string; model: string; error_message: string | null; created_at: string }>(),
  ]);

  const totalRequests = Number(usageSummary?.total_requests ?? 0);
  const totalMessages = Math.max(Number(messageCountRow?.total ?? 0), totalRequests);
  const activeDays = Number(usageSummary?.active_days ?? 0);
  const dailyAverage =
    activeDays > 0 ? Math.round((totalRequests / activeDays) * 10) / 10 : 0;

  const payload: AdminAiControlResponse = {
    model: c.env.WORKERS_AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL,
    workersAiBound: Boolean(c.env.AI),
    config: {
      aiEnabled: settings.featureAiAssistantEnabled,
      aiFreeDailyLimit: settings.aiFreeDailyLimit,
      aiSystemPrompt: settings.aiSystemPrompt,
    },
    stats: {
      totalMessages,
      totalConversations: Number(convCountRow?.total ?? 0),
      dailyAverage,
      activeUsers: Number(usageSummary?.active_users ?? 0),
      requests24h: Number(req24hRow?.total ?? 0),
      errorsTotal: Number(errTotalRow?.total ?? 0),
      errors24h: Number(err24hRow?.total ?? 0),
      recentErrors: (recentErrorRows.results ?? []).map((r) => ({
        id: r.id,
        model: r.model,
        errorMessage: r.error_message,
        createdAt: r.created_at,
      })),
    },
  };

  return c.json(payload);
});

adminRoutes.put(
  '/ai/config',
  requireAdminPermission('ai.manage'),
  zValidator('json', adminAiConfigSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const input = c.req.valid('json');
    const updated = await updateAppSettings(db, actor.id, {
      featureAiAssistantEnabled: input.aiEnabled,
      aiFreeDailyLimit: input.aiFreeDailyLimit,
      aiSystemPrompt: input.aiSystemPrompt,
    });

    await logAdminAction(db, actor.id, 'admin.update_ai_config', 'app_settings', 'ai', {
      aiEnabled: updated.featureAiAssistantEnabled,
      aiFreeDailyLimit: updated.aiFreeDailyLimit,
    });

    return c.json({
      ok: true,
      config: {
        aiEnabled: updated.featureAiAssistantEnabled,
        aiFreeDailyLimit: updated.aiFreeDailyLimit,
        aiSystemPrompt: updated.aiSystemPrompt,
      },
    });
  }
);

// G. AI Builders Management
adminRoutes.get('/builders', requireAdminPermission('builders.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const { page, perPage, offset } = parsePagination(
    c.req.query('page'),
    c.req.query('per_page')
  );
  const typeFilter = c.req.query('type')?.trim();
  const q = c.req.query('q')?.trim();

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (
    typeFilter &&
    ['telegram_bot', 'ai_agent', 'website', 'mini_app', 'workflow'].includes(typeFilter)
  ) {
    conditions.push('b.builder_type = ?');
    params.push(typeFilter);
  }

  if (q) {
    conditions.push(
      "(b.name LIKE ? OR b.prompt LIKE ? OR COALESCE(u.username, '') LIKE ? OR COALESCE(u.first_name, '') LIKE ?)"
    );
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRow, rows, countsByTypeRows, settings] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS total
         FROM builder_projects b
         LEFT JOIN users u ON u.id = b.user_id
         ${whereClause}`
      )
      .bind(...params)
      .first<CountRow>(),
    db
      .prepare(
        `SELECT b.id, b.user_id, b.builder_type, b.name, b.prompt, b.status, b.created_at, b.updated_at,
                u.username, u.first_name, u.last_name, u.telegram_id
         FROM builder_projects b
         LEFT JOIN users u ON u.id = b.user_id
         ${whereClause}
         ORDER BY b.updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, perPage, offset)
      .all<{
        id: string;
        user_id: string;
        builder_type: BuilderType;
        name: string;
        prompt: string;
        status: 'draft' | 'generated' | 'previewed' | 'deployed';
        created_at: string;
        updated_at: string;
        username: string | null;
        first_name: string | null;
        last_name: string | null;
        telegram_id: number | null;
      }>(),
    db
      .prepare('SELECT builder_type, COUNT(*) AS count FROM builder_projects GROUP BY builder_type')
      .all<{ builder_type: BuilderType; count: number }>(),
    getAppSettings(db),
  ]);

  const total = Number(countRow?.total ?? 0);
  const projects: AdminBuilderProjectEntry[] = (rows.results ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    builderType: r.builder_type,
    name: r.name,
    prompt: r.prompt,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    username: r.username ?? null,
    firstName: r.first_name ?? 'Deleted User',
    lastName: r.last_name ?? null,
    telegramId: Number(r.telegram_id ?? 0),
  }));

  const payload: AdminBuildersResponse = {
    projects,
    page,
    per_page: perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
    countsByType: (countsByTypeRows.results ?? []).map((r) => ({
      builderType: r.builder_type,
      count: Number(r.count ?? 0),
    })),
    config: {
      buildersEnabled: settings.featureBuildersEnabled,
      enabledBuilderTypes: settings.enabledBuilderTypes,
      builderDailyLimit: settings.builderDailyLimit,
    },
  };

  return c.json(payload);
});

adminRoutes.put(
  '/builders/config',
  requireAdminPermission('builders.manage'),
  zValidator('json', adminBuildersConfigSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const input = c.req.valid('json');
    const updated = await updateAppSettings(db, actor.id, {
      featureBuildersEnabled: input.buildersEnabled,
      enabledBuilderTypes: input.enabledBuilderTypes,
      builderDailyLimit: input.builderDailyLimit,
    });

    await logAdminAction(db, actor.id, 'admin.update_builders_config', 'app_settings', 'builders', {
      buildersEnabled: updated.featureBuildersEnabled,
      enabledBuilderTypes: updated.enabledBuilderTypes,
      builderDailyLimit: updated.builderDailyLimit,
    });

    return c.json({
      ok: true,
      config: {
        buildersEnabled: updated.featureBuildersEnabled,
        enabledBuilderTypes: updated.enabledBuilderTypes,
        builderDailyLimit: updated.builderDailyLimit,
      },
    });
  }
);

// H. Subscriptions & Payments
adminRoutes.get('/payments', requireAdminPermission('billing.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const { page, perPage, offset } = parsePagination(
    c.req.query('page'),
    c.req.query('per_page')
  );
  const statusFilter = c.req.query('status')?.trim();

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (statusFilter === 'completed' || statusFilter === 'refunded') {
    conditions.push('p.status = ?');
    params.push(statusFilter);
  } else if (statusFilter === 'pending') {
    conditions.push("p.status = 'pending' AND p.failed_reason IS NULL");
  } else if (statusFilter === 'failed') {
    conditions.push("p.status = 'pending' AND p.failed_reason IS NOT NULL");
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRow, rows] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS total FROM payments p ${whereClause}`)
      .bind(...params)
      .first<CountRow>(),
    db
      .prepare(
        `SELECT p.id, p.user_id, p.plan, p.telegram_payment_charge_id, p.currency, p.amount, p.status,
                p.reconciliation_note, p.reconciled_at, p.failed_reason, p.created_at,
                u.username, u.first_name, u.last_name, u.telegram_id
         FROM payments p
         LEFT JOIN users u ON u.id = p.user_id
         ${whereClause}
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, perPage, offset)
      .all<{
        id: string;
        user_id: string;
        plan: string;
        telegram_payment_charge_id: string;
        currency: string;
        amount: number;
        status: 'pending' | 'completed' | 'refunded';
        reconciliation_note: string | null;
        reconciled_at: string | null;
        failed_reason: string | null;
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
    reconciliationNote: row.reconciliation_note ?? null,
    reconciledAt: row.reconciled_at ?? null,
    failedReason: row.failed_reason ?? null,
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

adminRoutes.patch(
  '/payments/:id/reconcile',
  requireAdminPermission('billing.manage'),
  zValidator('json', adminReconcilePaymentSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const { reconciliationNote } = c.req.valid('json');
    const nowIso = new Date().toISOString();

    const res = await db
      .prepare('UPDATE payments SET reconciliation_note = ?, reconciled_at = ? WHERE id = ?')
      .bind(reconciliationNote, nowIso, id)
      .run();

    if (!res.meta.changes) {
      return c.json({ error: 'Payment not found' }, 404);
    }

    await logAdminAction(db, actor.id, 'admin.reconcile_payment', 'payment', id, {
      reconciliationNote,
      reconciledAt: nowIso,
    });

    return c.json({ ok: true, id, reconciliationNote, reconciledAt: nowIso });
  }
);

adminRoutes.get('/subscriptions', requireAdminPermission('billing.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const { page, perPage, offset } = parsePagination(
    c.req.query('page'),
    c.req.query('per_page')
  );
  const statusFilter = c.req.query('status')?.trim();

  const conditions: string[] = [];
  const params: Array<string | number> = [];
  if (statusFilter === 'active' || statusFilter === 'expired' || statusFilter === 'cancelled') {
    conditions.push('s.status = ?');
    params.push(statusFilter);
  }
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRow, rows] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS total FROM subscriptions s ${whereClause}`)
      .bind(...params)
      .first<CountRow>(),
    db
      .prepare(
        `SELECT s.id, s.user_id, s.plan, s.status, s.started_at, s.expires_at,
                u.username, u.first_name, u.last_name, u.telegram_id
         FROM subscriptions s
         LEFT JOIN users u ON u.id = s.user_id
         ${whereClause}
         ORDER BY s.started_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, perPage, offset)
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

adminRoutes.get('/revenue', requireAdminPermission('billing.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const [totalsRow, monthlyRows, activeSubRow] = await Promise.all([
    db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) AS total_revenue,
           COUNT(CASE WHEN status = 'completed' THEN 1 END) AS total_payments,
           COUNT(CASE WHEN status = 'pending' AND failed_reason IS NULL THEN 1 END) AS pending_payments,
           COUNT(CASE WHEN status = 'pending' AND failed_reason IS NOT NULL THEN 1 END) AS failed_payments,
           COUNT(CASE WHEN status = 'refunded' THEN 1 END) AS refunded_payments,
           COALESCE(SUM(CASE WHEN status = 'refunded' THEN amount ELSE 0 END), 0) AS refunded_revenue
         FROM payments`
      )
      .first<{
        total_revenue: number;
        total_payments: number;
        pending_payments: number;
        failed_payments: number;
        refunded_payments: number;
        refunded_revenue: number;
      }>(),
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
    pending_payments: Number(totalsRow?.pending_payments ?? 0),
    failed_payments: Number(totalsRow?.failed_payments ?? 0),
    refunded_payments: Number(totalsRow?.refunded_payments ?? 0),
    refunded_revenue: Number(totalsRow?.refunded_revenue ?? 0),
  };

  return c.json(payload);
});

// I. Announcements & Notifications
adminRoutes.get('/announcements', requireAdminPermission('announcements.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const rows = await db
    .prepare(
      'SELECT id, title, body, audience, published, created_by, sent_at, delivery_count, delivery_status, created_at, updated_at FROM announcements ORDER BY created_at DESC LIMIT 50'
    )
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
    }>();

  const announcements: AnnouncementRecord[] = (rows.results ?? []).map((r) => ({
    id: r.id,
    title: r.title,
    body: r.body,
    audience: r.audience,
    published: r.published === 1,
    createdBy: r.created_by,
    sentAt: r.sent_at,
    deliveryCount: Number(r.delivery_count ?? 0),
    deliveryStatus: r.delivery_status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return c.json({ announcements });
});

adminRoutes.post(
  '/announcements',
  requireAdminPermission('announcements.manage'),
  zValidator('json', adminAnnouncementSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const input = c.req.valid('json');
    const id = `ann_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const status = input.published ? 'published' : 'draft';

    await db
      .prepare(
        'INSERT INTO announcements (id, title, body, audience, published, created_by, delivery_status) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(id, input.title, input.body, input.audience, input.published ? 1 : 0, actor.id, status)
      .run();

    await logAdminAction(db, actor.id, 'admin.create_announcement', 'announcement', id, {
      title: input.title,
      audience: input.audience,
      published: input.published,
    });

    return c.json({ ok: true, id }, 201);
  }
);

adminRoutes.put(
  '/announcements/:id',
  requireAdminPermission('announcements.manage'),
  zValidator('json', adminAnnouncementSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const input = c.req.valid('json');

    const res = await db
      .prepare(
        "UPDATE announcements SET title = ?, body = ?, audience = ?, published = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .bind(input.title, input.body, input.audience, input.published ? 1 : 0, id)
      .run();

    if (!res.meta.changes) return c.json({ error: 'Announcement not found' }, 404);

    await logAdminAction(db, actor.id, 'admin.update_announcement', 'announcement', id, {
      title: input.title,
    });

    return c.json({ ok: true });
  }
);

adminRoutes.patch(
  '/announcements/:id/publish',
  requireAdminPermission('announcements.manage'),
  zValidator('json', adminPublishToggleSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await db
      .prepare('SELECT id, published FROM announcements WHERE id = ?')
      .bind(id)
      .first<{ id: string; published: number }>();
    if (!existing) return c.json({ error: 'Announcement not found' }, 404);

    const nextPublished =
      body?.published !== undefined ? (body.published ? 1 : 0) : existing.published === 1 ? 0 : 1;

    await db
      .prepare(
        "UPDATE announcements SET published = ?, delivery_status = CASE WHEN ? = 1 AND delivery_status = 'draft' THEN 'published' ELSE delivery_status END, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .bind(nextPublished, nextPublished, id)
      .run();

    await logAdminAction(db, actor.id, 'admin.publish_announcement', 'announcement', id, {
      published: nextPublished === 1,
    });

    return c.json({ ok: true, id, published: nextPublished === 1 });
  }
);

adminRoutes.post(
  '/announcements/:id/send-telegram',
  requireAdminPermission('announcements.manage'),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const botToken = c.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return c.json(
        {
          error: 'Telegram Bot not configured',
          message: 'TELEGRAM_BOT_TOKEN is required to deliver announcements via Telegram.',
        },
        503
      );
    }

    const actor = c.get('user')!;
    const id = c.req.param('id');

    const ann = await db
      .prepare('SELECT id, title, body, audience FROM announcements WHERE id = ?')
      .bind(id)
      .first<{ id: string; title: string; body: string; audience: AnnouncementAudience }>();
    if (!ann) return c.json({ error: 'Announcement not found' }, 404);

    const tierCondition =
      ann.audience === 'pro'
        ? "AND tier = 'pro'"
        : ann.audience === 'free'
          ? "AND tier = 'free'"
          : '';

    const recipients = await db
      .prepare(
        `SELECT telegram_id FROM users WHERE COALESCE(account_status, 'active') != 'suspended' ${tierCondition} ORDER BY created_at DESC LIMIT 200`
      )
      .all<{ telegram_id: number }>();

    const targets = recipients.results ?? [];
    const messageText = `AFRINEX Announcement: ${ann.title}\n\n${ann.body}`;

    let sentCount = 0;
    let failedCount = 0;
    for (const target of targets) {
      try {
        await sendTelegramMessage(botToken, Number(target.telegram_id), messageText);
        sentCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    const status = failedCount > 0 && sentCount > 0 ? 'partial' : sentCount > 0 ? 'sent' : 'published';
    const sentAt = new Date().toISOString();

    await db
      .prepare(
        "UPDATE announcements SET published = 1, sent_at = ?, delivery_count = ?, delivery_status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?"
      )
      .bind(sentAt, sentCount, status, id)
      .run();

    await logAdminAction(db, actor.id, 'admin.send_announcement_telegram', 'announcement', id, {
      audience: ann.audience,
      attempted: targets.length,
      sentCount,
      failedCount,
    });

    return c.json({
      ok: true,
      attempted: targets.length,
      sentCount,
      failedCount,
      deliveryStatus: status,
      sentAt,
    });
  }
);

adminRoutes.delete(
  '/announcements/:id',
  requireAdminPermission('announcements.manage'),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const id = c.req.param('id');
    const res = await db.prepare('DELETE FROM announcements WHERE id = ?').bind(id).run();
    if (!res.meta.changes) return c.json({ error: 'Announcement not found' }, 404);

    await logAdminAction(db, actor.id, 'admin.delete_announcement', 'announcement', id);
    return c.json({ ok: true });
  }
);

// J. App Configuration Settings (never stores or returns secrets)
adminRoutes.get('/settings', requireAdminPermission('settings.manage'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const settings = await getAppSettings(db);
  return c.json({
    settings,
    environmentStatus: {
      adminIdsConfigured: hasConfiguredAdminIds(c.env),
      telegramBotConfigured: Boolean(c.env.TELEGRAM_BOT_TOKEN),
      workersAiBound: Boolean(c.env.AI),
      workersAiModel: c.env.WORKERS_AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL,
    },
  });
});

adminRoutes.put(
  '/settings',
  requireAdminPermission('settings.manage'),
  zValidator('json', adminAppSettingsSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const actor = c.get('user')!;
    const input = c.req.valid('json');
    const updated = await updateAppSettings(db, actor.id, input);

    await logAdminAction(db, actor.id, 'admin.update_settings', 'app_settings', 'global', {
      updatedKeys: Object.keys(input),
    });

    return c.json({ ok: true, settings: updated });
  }
);

// K. Audit Logs
adminRoutes.get('/audit-logs', requireAdminPermission('audit.view'), async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const { page, perPage, offset } = parsePagination(
    c.req.query('page'),
    c.req.query('per_page')
  );
  const actionFilter = c.req.query('action')?.trim();
  const actorFilter = c.req.query('actor_user_id')?.trim();
  const targetTypeFilter = c.req.query('target_type')?.trim();

  const conditions: string[] = [];
  const params: Array<string | number> = [];

  if (actionFilter) {
    conditions.push('a.action LIKE ?');
    params.push(`%${actionFilter}%`);
  }
  if (actorFilter) {
    conditions.push('a.actor_user_id = ?');
    params.push(actorFilter);
  }
  if (targetTypeFilter) {
    conditions.push('a.target_type = ?');
    params.push(targetTypeFilter);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRow, rows] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS total FROM audit_logs a ${whereClause}`)
      .bind(...params)
      .first<CountRow>(),
    db
      .prepare(
        `SELECT a.id, a.actor_user_id, a.action, a.target_type, a.target_id, a.metadata_json, a.created_at,
                u.first_name AS actor_first_name, u.last_name AS actor_last_name, u.username AS actor_username, u.telegram_id AS actor_telegram_id
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ${whereClause}
         ORDER BY a.created_at DESC
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
        actor_first_name: string | null;
        actor_last_name: string | null;
        actor_username: string | null;
        actor_telegram_id: number | null;
      }>(),
  ]);

  const total = Number(countRow?.total ?? 0);
  const auditLogs: AuditLogEntry[] = (rows.results ?? []).map((row) => ({
    id: row.id,
    actorUserId: row.actor_user_id,
    actorName: row.actor_first_name
      ? `${row.actor_first_name}${row.actor_last_name ? ` ${row.actor_last_name}` : ''}`
      : null,
    actorUsername: row.actor_username ?? null,
    actorTelegramId: row.actor_telegram_id ? Number(row.actor_telegram_id) : null,
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
