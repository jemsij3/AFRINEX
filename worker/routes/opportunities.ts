import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { opportunityApplicationSchema } from '../../shared/schemas.ts';
import type {
  Opportunity,
  OpportunityApplication,
  OpportunityApplicationStatus,
  OpportunityRegion,
  OpportunityType,
} from '../../shared/types.ts';
import { featureDisabledResponse, isFeatureAccessible } from '../lib/featureAccess.ts';
import { getAppSettings } from '../lib/settings.ts';
import { optionalAuth, requireAuth } from '../middleware/auth.ts';
import type { AppEnv } from '../types.ts';

const opportunitiesRoutes = new Hono<AppEnv>();

const VALID_OPPORTUNITY_TYPES = [
  'job',
  'freelance',
  'scholarship',
  'grant',
  'event',
  'startup',
  'programs',
] as const;

interface DbOpportunityRow {
  id: string;
  title: string;
  organization: string;
  summary: string;
  opportunity_type: OpportunityType;
  region: OpportunityRegion;
  url: string;
  deadline: string | null;
  published: number;
  featured?: number;
  archived?: number;
  bookmarked: number;
  created_at: string;
}

interface DbTrackerRow extends DbOpportunityRow {
  app_id: string;
  app_user_id: string;
  app_status: OpportunityApplicationStatus;
  applied_at: string | null;
  deadline_at: string | null;
  notes: string;
  reminder_sent_at: string | null;
  app_created_at: string;
  app_updated_at: string;
}

function mapOpportunity(row: DbOpportunityRow): Opportunity {
  return {
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
    bookmarked: row.bookmarked === 1,
    createdAt: row.created_at,
  };
}

function mapApplication(row: DbTrackerRow): OpportunityApplication {
  return {
    id: row.app_id,
    userId: row.app_user_id,
    opportunityId: row.id,
    status: row.app_status,
    appliedAt: row.applied_at,
    deadlineAt: row.deadline_at ?? row.deadline,
    notes: row.notes,
    reminderSentAt: row.reminder_sent_at,
    createdAt: row.app_created_at,
    updatedAt: row.app_updated_at,
    opportunity: mapOpportunity(row),
  };
}

// Opportunity Tracker endpoints (MUST precede /:id)
opportunitiesRoutes.get('/tracker', requireAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }
  const user = c.get('user')!;
  const settings = await getAppSettings(db);
  if (!isFeatureAccessible(settings, 'featureOpportunitiesEnabled', user)) {
    return featureDisabledResponse(c, 'Opportunities Hub');
  }

  const statusFilter = c.req.query('status');
  const deadlineFilter = c.req.query('deadline');
  const todayStr = new Date().toISOString().slice(0, 10);

  const conditions: string[] = ['oa.user_id = ?'];
  const params: string[] = [user.id];

  if (
    statusFilter &&
    ['saved', 'applied', 'interviewing', 'accepted', 'rejected', 'withdrawn'].includes(statusFilter)
  ) {
    conditions.push('oa.status = ?');
    params.push(statusFilter);
  }

  if (deadlineFilter === 'upcoming') {
    conditions.push(
      "COALESCE(oa.deadline_at, o.deadline) IS NOT NULL AND COALESCE(oa.deadline_at, o.deadline) != '' AND substr(COALESCE(oa.deadline_at, o.deadline), 1, 10) >= ?"
    );
    params.push(todayStr);
  } else if (deadlineFilter === 'overdue') {
    conditions.push(
      "COALESCE(oa.deadline_at, o.deadline) IS NOT NULL AND COALESCE(oa.deadline_at, o.deadline) != '' AND substr(COALESCE(oa.deadline_at, o.deadline), 1, 10) < ? AND oa.status IN ('saved', 'applied', 'interviewing')"
    );
    params.push(todayStr);
  }

  const rows = await db
    .prepare(
      `SELECT
         oa.id AS app_id, oa.user_id AS app_user_id, oa.status AS app_status,
         oa.applied_at, oa.deadline_at, oa.notes, oa.reminder_sent_at,
         oa.created_at AS app_created_at, oa.updated_at AS app_updated_at,
         o.id, o.title, o.organization, o.summary, o.opportunity_type, o.region, o.url,
         o.deadline, o.published, o.featured, o.archived, o.created_at,
         EXISTS(
           SELECT 1 FROM bookmarks b
           WHERE b.user_id = ? AND b.item_type = 'opportunity' AND b.item_id = o.id
         ) AS bookmarked
       FROM opportunity_applications oa
       INNER JOIN opportunities o ON o.id = oa.opportunity_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE WHEN COALESCE(oa.deadline_at, o.deadline) IS NULL THEN 1 ELSE 0 END ASC,
         COALESCE(oa.deadline_at, o.deadline) ASC,
         oa.updated_at DESC
       LIMIT 100`
    )
    .bind(user.id, ...params)
    .all<DbTrackerRow>();

  const applications = (rows.results ?? []).map(mapApplication);
  const summary = {
    total: applications.length,
    saved: applications.filter((a) => a.status === 'saved').length,
    applied: applications.filter((a) => a.status === 'applied').length,
    interviewing: applications.filter((a) => a.status === 'interviewing').length,
    accepted: applications.filter((a) => a.status === 'accepted').length,
    upcomingDeadlines: applications.filter(
      (a) => a.deadlineAt && a.deadlineAt.slice(0, 10) >= todayStr && ['saved', 'applied', 'interviewing'].includes(a.status)
    ).length,
    overdueDeadlines: applications.filter(
      (a) => a.deadlineAt && a.deadlineAt.slice(0, 10) < todayStr && ['saved', 'applied', 'interviewing'].includes(a.status)
    ).length,
  };

  return c.json({ applications, summary });
});

async function upsertTrackerHandler(
  db: D1Database,
  userId: string,
  oppId: string,
  input: {
    status: OpportunityApplicationStatus;
    appliedAt?: string | null;
    deadlineAt?: string | null;
    notes: string;
  }
) {
  const opp = await db
    .prepare('SELECT id, deadline FROM opportunities WHERE id = ? AND published = 1')
    .bind(oppId)
    .first<{ id: string; deadline: string | null }>();

  if (!opp) {
    return null;
  }

  const effectiveDeadline =
    input.deadlineAt === undefined
      ? opp.deadline
      : input.deadlineAt === ''
        ? null
        : input.deadlineAt;
  const effectiveAppliedAt =
    input.appliedAt !== undefined
      ? input.appliedAt === ''
        ? null
        : input.appliedAt
      : input.status === 'applied' || input.status === 'interviewing' || input.status === 'accepted'
        ? new Date().toISOString().slice(0, 10)
        : null;

  const newId = `oapp_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  await db
    .prepare(
      `INSERT INTO opportunity_applications (id, user_id, opportunity_id, status, applied_at, deadline_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, opportunity_id) DO UPDATE SET
         status = excluded.status,
         applied_at = COALESCE(excluded.applied_at, opportunity_applications.applied_at),
         deadline_at = excluded.deadline_at,
         notes = excluded.notes,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
    )
    .bind(
      newId,
      userId,
      oppId,
      input.status,
      effectiveAppliedAt,
      effectiveDeadline,
      input.notes ?? ''
    )
    .run();

  const row = await db
    .prepare(
      `SELECT
         oa.id AS app_id, oa.user_id AS app_user_id, oa.status AS app_status,
         oa.applied_at, oa.deadline_at, oa.notes, oa.reminder_sent_at,
         oa.created_at AS app_created_at, oa.updated_at AS app_updated_at,
         o.id, o.title, o.organization, o.summary, o.opportunity_type, o.region, o.url,
         o.deadline, o.published, o.featured, o.archived, o.created_at,
         EXISTS(
           SELECT 1 FROM bookmarks b
           WHERE b.user_id = ? AND b.item_type = 'opportunity' AND b.item_id = o.id
         ) AS bookmarked
       FROM opportunity_applications oa
       INNER JOIN opportunities o ON o.id = oa.opportunity_id
       WHERE oa.user_id = ? AND oa.opportunity_id = ?`
    )
    .bind(userId, userId, oppId)
    .first<DbTrackerRow>();

  return row ? mapApplication(row) : null;
}

opportunitiesRoutes.post(
  '/tracker/:opportunityId',
  requireAuth,
  zValidator('json', opportunityApplicationSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);
    const user = c.get('user')!;
    const settings = await getAppSettings(db);
    if (!isFeatureAccessible(settings, 'featureOpportunitiesEnabled', user)) {
      return featureDisabledResponse(c, 'Opportunities Hub');
    }
    const oppId = c.req.param('opportunityId');
    const application = await upsertTrackerHandler(db, user.id, oppId, c.req.valid('json'));
    if (!application) {
      return c.json({ error: 'Not found', message: 'Opportunity not found.' }, 404);
    }
    return c.json({ application }, 201);
  }
);

opportunitiesRoutes.put(
  '/tracker/:opportunityId',
  requireAuth,
  zValidator('json', opportunityApplicationSchema),
  async (c) => {
    const db = c.env.DB;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);
    const user = c.get('user')!;
    const settings = await getAppSettings(db);
    if (!isFeatureAccessible(settings, 'featureOpportunitiesEnabled', user)) {
      return featureDisabledResponse(c, 'Opportunities Hub');
    }
    const oppId = c.req.param('opportunityId');
    const application = await upsertTrackerHandler(db, user.id, oppId, c.req.valid('json'));
    if (!application) {
      return c.json({ error: 'Not found', message: 'Opportunity not found.' }, 404);
    }
    return c.json({ application });
  }
);

opportunitiesRoutes.delete('/tracker/:opportunityId', requireAuth, async (c) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const user = c.get('user')!;
  const oppId = c.req.param('opportunityId');

  const res = await db
    .prepare('DELETE FROM opportunity_applications WHERE user_id = ? AND opportunity_id = ?')
    .bind(user.id, oppId)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: 'Not found', message: 'Tracked application not found.' }, 404);
  }
  return c.json({ ok: true });
});

opportunitiesRoutes.get('/', optionalAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const user = c.get('user');
  const settings = await getAppSettings(db);
  if (!settings.featureOpportunitiesEnabled && user?.role !== 'admin') {
    return c.json(
      { error: 'Feature disabled', message: 'Opportunities Hub is temporarily disabled.' },
      503
    );
  }

  const oppType = c.req.query('type');
  const region = c.req.query('region');
  const deadlineFilter = c.req.query('deadline');
  const q = c.req.query('q')?.trim();
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, Number.parseInt(c.req.query('per_page') ?? '24', 10) || 24));
  const offset = (page - 1) * perPage;
  const todayStr = new Date().toISOString().slice(0, 10);

  const conditions: string[] = ['o.published = 1', 'COALESCE(o.archived, 0) = 0'];
  const params: string[] = [];

  if (oppType && (VALID_OPPORTUNITY_TYPES as readonly string[]).includes(oppType)) {
    conditions.push('o.opportunity_type = ?');
    params.push(oppType);
  }

  if (region && ['africa', 'global', 'remote'].includes(region)) {
    conditions.push('o.region = ?');
    params.push(region);
  }

  if (deadlineFilter === 'upcoming') {
    conditions.push("o.deadline IS NOT NULL AND o.deadline != '' AND substr(o.deadline, 1, 10) >= ?");
    params.push(todayStr);
  } else if (deadlineFilter === 'overdue') {
    conditions.push("o.deadline IS NOT NULL AND o.deadline != '' AND substr(o.deadline, 1, 10) < ?");
    params.push(todayStr);
  }

  if (q) {
    conditions.push('(o.title LIKE ? OR o.organization LIKE ? OR o.summary LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const userId = user?.id ?? '__anon__';
  const whereSql = conditions.join(' AND ');
  const [rows, countRow] = await Promise.all([
    db
      .prepare(
        `SELECT
          o.id, o.title, o.organization, o.summary, o.opportunity_type, o.region, o.url, o.deadline, o.published, o.featured, o.archived, o.created_at,
          EXISTS(
            SELECT 1 FROM bookmarks b
            WHERE b.user_id = ? AND b.item_type = 'opportunity' AND b.item_id = o.id
          ) AS bookmarked
        FROM opportunities o
        WHERE ${whereSql}
        ORDER BY COALESCE(o.featured, 0) DESC, o.created_at DESC
        LIMIT ? OFFSET ?`
      )
      .bind(userId, ...params, perPage, offset)
      .all<DbOpportunityRow>(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM opportunities o WHERE ${whereSql}`)
      .bind(...params)
      .first<{ total: number }>(),
  ]);

  const total = Number(countRow?.total ?? 0);
  return c.json({
    opportunities: (rows.results ?? []).map(mapOpportunity),
    page,
    per_page: perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  });
});

opportunitiesRoutes.get('/:id', optionalAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const oppId = c.req.param('id');
  const user = c.get('user');
  const settings = await getAppSettings(db);
  if (!isFeatureAccessible(settings, 'featureOpportunitiesEnabled', user)) {
    return featureDisabledResponse(c, 'Opportunities Hub');
  }
  const userId = user?.id ?? '__anon__';

  const row = await db
    .prepare(
      `SELECT
        o.id, o.title, o.organization, o.summary, o.opportunity_type, o.region, o.url, o.deadline, o.published, o.featured, o.archived, o.created_at,
        EXISTS(
          SELECT 1 FROM bookmarks b
          WHERE b.user_id = ? AND b.item_type = 'opportunity' AND b.item_id = o.id
        ) AS bookmarked
      FROM opportunities o
      WHERE o.id = ? AND o.published = 1 AND COALESCE(o.archived, 0) = 0`
    )
    .bind(userId, oppId)
    .first<DbOpportunityRow>();

  if (!row) {
    return c.json({ error: 'Not found', message: 'Opportunity not found.' }, 404);
  }

  return c.json({ opportunity: mapOpportunity(row) });
});

export default opportunitiesRoutes;

