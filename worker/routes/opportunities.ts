import { Hono } from 'hono';
import type {
  Opportunity,
  OpportunityRegion,
  OpportunityType,
} from '../../shared/types.ts';
import { optionalAuth } from '../middleware/auth.ts';
import type { AppEnv } from '../types.ts';

const opportunitiesRoutes = new Hono<AppEnv>();

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
  bookmarked: number;
  created_at: string;
}

opportunitiesRoutes.get('/', optionalAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const user = c.get('user');
  const oppType = c.req.query('type');
  const region = c.req.query('region');
  const q = c.req.query('q')?.trim();

  const conditions: string[] = ['o.published = 1'];
  const params: string[] = [];

  if (
    oppType &&
    ['job', 'freelance', 'scholarship', 'grant', 'event'].includes(oppType)
  ) {
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
        o.id, o.title, o.organization, o.summary, o.opportunity_type, o.region, o.url, o.deadline, o.published, o.created_at,
        EXISTS(
          SELECT 1 FROM bookmarks b
          WHERE b.user_id = ? AND b.item_type = 'opportunity' AND b.item_id = o.id
        ) AS bookmarked
      FROM opportunities o
      WHERE ${conditions.join(' AND ')}
      ORDER BY o.created_at DESC`
    )
    .bind(userId, ...params)
    .all<DbOpportunityRow>();

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
    bookmarked: row.bookmarked === 1,
    createdAt: row.created_at,
  }));

  return c.json({ opportunities });
});

export default opportunitiesRoutes;
