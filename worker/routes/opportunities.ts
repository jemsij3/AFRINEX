import { Hono } from 'hono';
import type {
  Opportunity,
  OpportunityRegion,
  OpportunityType,
} from '../../shared/types.ts';
import { featureDisabledResponse, isFeatureAccessible } from '../lib/featureAccess.ts';
import { getAppSettings } from '../lib/settings.ts';
import { optionalAuth } from '../middleware/auth.ts';
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
  const q = c.req.query('q')?.trim();

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

  if (q) {
    conditions.push('(o.title LIKE ? OR o.organization LIKE ? OR o.summary LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const userId = user?.id ?? '__anon__';
  const rows = await db
    .prepare(
      `SELECT
        o.id, o.title, o.organization, o.summary, o.opportunity_type, o.region, o.url, o.deadline, o.published, o.featured, o.archived, o.created_at,
        EXISTS(
          SELECT 1 FROM bookmarks b
          WHERE b.user_id = ? AND b.item_type = 'opportunity' AND b.item_id = o.id
        ) AS bookmarked
      FROM opportunities o
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(o.featured, 0) DESC, o.created_at DESC`
    )
    .bind(userId, ...params)
    .all<DbOpportunityRow>();

  return c.json({ opportunities: (rows.results ?? []).map(mapOpportunity) });
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
