import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createBuilderProjectSchema } from '../../shared/schemas.ts';
import type { BuilderFile, BuilderProject, BuilderSpec, BuilderType } from '../../shared/types.ts';
import { generateModularBuilderProject } from '../lib/builderEngine.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const builderRoutes = new Hono<AppEnv>();

builderRoutes.use('*', requireAuth);

interface DbBuilderRow {
  id: string;
  user_id: string;
  builder_type: BuilderType;
  name: string;
  prompt: string;
  spec_json: string;
  files_json: string;
  status: 'draft' | 'generated' | 'previewed' | 'deployed';
  created_at: string;
  updated_at: string;
}

function mapBuilderRow(row: DbBuilderRow): BuilderProject {
  return {
    id: row.id,
    userId: row.user_id,
    builderType: row.builder_type,
    name: row.name,
    prompt: row.prompt,
    spec: JSON.parse(row.spec_json) as BuilderSpec,
    files: JSON.parse(row.files_json) as BuilderFile[],
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

builderRoutes.get('/projects', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const rows = await db
    .prepare(
      'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30'
    )
    .bind(user.id)
    .all<DbBuilderRow>();

  return c.json({
    projects: (rows.results ?? []).map(mapBuilderRow),
  });
});

builderRoutes.post(
  '/projects',
  rateLimit({ keyPrefix: 'builder_gen', limit: 15, windowSeconds: 60 }),
  zValidator('json', createBuilderProjectSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const { builderType, name, prompt } = c.req.valid('json');
    let generated;
    try {
      generated = await generateModularBuilderProject(
        c.env.AI,
        c.env.WORKERS_AI_MODEL,
        builderType,
        name,
        prompt,
        c.env.ENVIRONMENT ?? 'production'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Workers AI builder generation failed.';
      return c.json({ error: 'Builder generation failed', message }, c.env.AI ? 502 : 503);
    }

    const id = `bld_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await db
      .prepare(
        `INSERT INTO builder_projects (id, user_id, builder_type, name, prompt, spec_json, files_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'generated')`
      )
      .bind(
        id,
        user.id,
        builderType,
        name,
        prompt,
        JSON.stringify(generated.spec),
        JSON.stringify(generated.files)
      )
      .run();

    const row = await db
      .prepare(
        'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE id = ?'
      )
      .bind(id)
      .first<DbBuilderRow>();

    return c.json({ project: row ? mapBuilderRow(row) : null }, 201);
  }
);

builderRoutes.delete('/projects/:id', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const res = await db
    .prepare('DELETE FROM builder_projects WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .run();

  if (!res.meta.changes) {
    return c.json({ error: 'Builder project not found' }, 404);
  }

  return c.json({ ok: true });
});

export default builderRoutes;
