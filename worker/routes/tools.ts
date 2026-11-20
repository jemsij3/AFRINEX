import { Hono } from 'hono';
import type { AiTool, AiToolCategory, AiToolPricing } from '../../shared/types.ts';
import { featureDisabledResponse, isFeatureAccessible } from '../lib/featureAccess.ts';
import { getAppSettings } from '../lib/settings.ts';
import { optionalAuth } from '../middleware/auth.ts';
import type { AppEnv } from '../types.ts';

const toolsRoutes = new Hono<AppEnv>();

interface DbToolRow {
  id: string;
  name: string;
  summary: string;
  category: AiToolCategory;
  url: string;
  pricing_model: AiToolPricing;
  featured: number;
  published: number;
  bookmarked: number;
  created_at: string;
}

function mapTool(row: DbToolRow): AiTool {
  return {
    id: row.id,
    name: row.name,
    summary: row.summary,
    category: row.category,
    url: row.url,
    pricingModel: row.pricing_model,
    featured: row.featured === 1,
    published: row.published === 1,
    bookmarked: row.bookmarked === 1,
    createdAt: row.created_at,
  };
}

toolsRoutes.get('/', optionalAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const user = c.get('user');
  const settings = await getAppSettings(db);
  if (!settings.featureToolsEnabled && user?.role !== 'admin') {
    return c.json(
      { error: 'Feature disabled', message: 'AI Tools Directory is temporarily disabled.' },
      503
    );
  }
  const category = c.req.query('category');
  const q = c.req.query('q')?.trim();
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, Number.parseInt(c.req.query('per_page') ?? '24', 10) || 24));
  const offset = (page - 1) * perPage;

  const conditions: string[] = ['t.published = 1'];
  const params: string[] = [];

  if (
    category &&
    ['writing', 'coding', 'design', 'productivity', 'business'].includes(category)
  ) {
    conditions.push('t.category = ?');
    params.push(category);
  }

  if (q) {
    conditions.push('(t.name LIKE ? OR t.summary LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like);
  }

  const userId = user?.id ?? '__anon__';
  const whereSql = conditions.join(' AND ');
  const [rows, countRow] = await Promise.all([
    db
      .prepare(
        `SELECT
          t.id, t.name, t.summary, t.category, t.url, t.pricing_model, t.featured, t.published, t.created_at,
          EXISTS(
            SELECT 1 FROM bookmarks b
            WHERE b.user_id = ? AND b.item_type = 'tool' AND b.item_id = t.id
          ) AS bookmarked
        FROM ai_tools t
        WHERE ${whereSql}
        ORDER BY t.featured DESC, t.created_at DESC
        LIMIT ? OFFSET ?`
      )
      .bind(userId, ...params, perPage, offset)
      .all<DbToolRow>(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM ai_tools t WHERE ${whereSql}`)
      .bind(...params)
      .first<{ total: number }>(),
  ]);

  const total = Number(countRow?.total ?? 0);
  return c.json({
    tools: (rows.results ?? []).map(mapTool),
    page,
    per_page: perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
  });
});

toolsRoutes.get('/:id', optionalAuth, async (c) => {
  const db = c.env.DB;
  if (!db) {
    return c.json({ error: 'Database unavailable', message: 'D1 binding missing.' }, 503);
  }

  const toolId = c.req.param('id');
  const user = c.get('user');
  const settings = await getAppSettings(db);
  if (!isFeatureAccessible(settings, 'featureToolsEnabled', user)) {
    return featureDisabledResponse(c, 'AI Tools Directory');
  }
  const userId = user?.id ?? '__anon__';

  const row = await db
    .prepare(
      `SELECT
        t.id, t.name, t.summary, t.category, t.url, t.pricing_model, t.featured, t.published, t.created_at,
        EXISTS(
          SELECT 1 FROM bookmarks b
          WHERE b.user_id = ? AND b.item_type = 'tool' AND b.item_id = t.id
        ) AS bookmarked
      FROM ai_tools t
      WHERE t.id = ? AND t.published = 1`
    )
    .bind(userId, toolId)
    .first<DbToolRow>();

  if (!row) {
    return c.json({ error: 'Not found', message: 'AI tool not found.' }, 404);
  }

  return c.json({ tool: mapTool(row) });
});

export default toolsRoutes;
