import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  createBuilderProjectSchema,
  deployBuilderProjectSchema,
  generateBuilderFilesSchema,
  regenerateBuilderFileSchema,
  testBuilderProjectSchema,
  updateBuilderProjectSchema,
} from '../../shared/schemas.ts';
import type {
  AutomationBuilderConfig,
  BuilderFile,
  BuilderProject,
  BuilderProvidersResponse,
  BuilderSpec,
  BuilderType,
} from '../../shared/types.ts';
import {
  executeBuilderProjectTest,
  generateModularBuilderProject,
  generateSourceFilesForSpec,
  regenerateSingleBuilderFile,
} from '../lib/builderEngine.ts';
import { buildDeploymentConfig, normalizeBuilderConfig } from '../lib/builderTemplates.ts';
import { featureDisabledResponse, isFeatureAccessible } from '../lib/featureAccess.ts';
import { getAppSettings } from '../lib/settings.ts';
import { DEFAULT_WORKERS_AI_MODEL, getAvailableAiModels } from '../lib/workersAi.ts';
import { requireAuth } from '../middleware/auth.ts';
import { rateLimit } from '../middleware/rateLimit.ts';
import type { AppEnv } from '../types.ts';

const builderRoutes = new Hono<AppEnv>();

builderRoutes.use('*', requireAuth, async (c, next) => {
  const db = c.env.DB;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);
  const user = c.get('user');
  const settings = await getAppSettings(db);
  if (!isFeatureAccessible(settings, 'featureBuildersEnabled', user)) {
    return featureDisabledResponse(c, 'AI Builders');
  }
  await next();
});

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

function safeParseSpec(raw: string): BuilderSpec {
  try {
    const parsed = JSON.parse(raw) as BuilderSpec;
    if (parsed && typeof parsed === 'object') {
      return {
        architectureSummary: parsed.architectureSummary ?? '',
        targetRuntime: parsed.targetRuntime ?? 'cloudflare-workers',
        capabilities: Array.isArray(parsed.capabilities) ? parsed.capabilities : [],
        envVarsNeeded: Array.isArray(parsed.envVarsNeeded) ? parsed.envVarsNeeded : [],
        generationMode: parsed.generationMode ?? 'starter_scaffold',
        config: parsed.config,
        plan: parsed.plan,
        testHistory: Array.isArray(parsed.testHistory) ? parsed.testHistory : [],
        deployment: parsed.deployment,
        modelUsed: parsed.modelUsed,
        generatedAt: parsed.generatedAt,
      };
    }
  } catch {
    // Fall back to empty spec
  }
  return {
    architectureSummary: '',
    targetRuntime: 'cloudflare-workers',
    capabilities: [],
    envVarsNeeded: [],
    generationMode: 'starter_scaffold',
    testHistory: [],
  };
}

function safeParseFiles(raw: string): BuilderFile[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as BuilderFile[]) : [];
  } catch {
    return [];
  }
}

function mapBuilderRow(row: DbBuilderRow): BuilderProject {
  return {
    id: row.id,
    userId: row.user_id,
    builderType: row.builder_type,
    name: row.name,
    prompt: row.prompt,
    spec: safeParseSpec(row.spec_json),
    files: safeParseFiles(row.files_json),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

builderRoutes.get('/providers', (c) => {
  const defaultModel = c.env.WORKERS_AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL;
  const payload: BuilderProvidersResponse = {
    workersAiBound: Boolean(c.env.AI),
    defaultModel,
    models: getAvailableAiModels(c.env.WORKERS_AI_MODEL),
  };
  return c.json(payload);
});

builderRoutes.get('/projects', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const builderTypeFilter = c.req.query('builderType');
  const validFilter =
    builderTypeFilter &&
    ['telegram_bot', 'ai_agent', 'website', 'mini_app', 'workflow'].includes(builderTypeFilter);

  const rows = validFilter
    ? await db
        .prepare(
          'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE user_id = ? AND builder_type = ? ORDER BY updated_at DESC LIMIT 50'
        )
        .bind(user.id, builderTypeFilter)
        .all<DbBuilderRow>()
    : await db
        .prepare(
          'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50'
        )
        .bind(user.id)
        .all<DbBuilderRow>();

  return c.json({
    projects: (rows.results ?? []).map(mapBuilderRow),
  });
});

builderRoutes.post(
  '/projects',
  rateLimit({ keyPrefix: 'builder_gen', limit: 20, windowSeconds: 60 }),
  zValidator('json', createBuilderProjectSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const { builderType, name, prompt, generationStep, config } = c.req.valid('json');
    const settings = await getAppSettings(db);

    if (!settings.featureBuildersEnabled && user.role !== 'admin') {
      return c.json(
        { error: 'Feature disabled', message: 'AI Builders are temporarily disabled by an administrator.' },
        503
      );
    }

    if (!settings.enabledBuilderTypes.includes(builderType) && user.role !== 'admin') {
      return c.json(
        {
          error: 'Builder type disabled',
          message: `The ${builderType.replace('_', ' ')} builder is currently disabled by an administrator.`,
        },
        403
      );
    }

    if (user.role !== 'admin' && user.tier !== 'pro') {
      const utcDayStart = `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
      const countRow = await db
        .prepare('SELECT COUNT(*) AS total FROM builder_projects WHERE user_id = ? AND created_at >= ?')
        .bind(user.id, utcDayStart)
        .first<{ total: number }>();

      if (Number(countRow?.total ?? 0) >= settings.builderDailyLimit) {
        return c.json(
          {
            error: 'Daily builder limit reached',
            message: `Free members can generate up to ${settings.builderDailyLimit} builder projects per day. Upgrade to AFRINEX Pro for higher limits.`,
          },
          429
        );
      }
    }

    let generated;
    try {
      generated = await generateModularBuilderProject(
        c.env.AI,
        c.env.WORKERS_AI_MODEL,
        builderType,
        name,
        prompt,
        c.env.ENVIRONMENT ?? 'production',
        config,
        generationStep
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Workers AI builder generation failed.';
      return c.json({ error: 'Builder generation failed', message }, c.env.AI ? 502 : 503);
    }

    const initialStatus = generationStep === 'plan' ? 'draft' : 'generated';
    const id = `bld_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await db
      .prepare(
        `INSERT INTO builder_projects (id, user_id, builder_type, name, prompt, spec_json, files_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        user.id,
        builderType,
        name,
        prompt,
        JSON.stringify(generated.spec),
        JSON.stringify(generated.files),
        initialStatus
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

builderRoutes.post(
  '/projects/:id/generate-files',
  rateLimit({ keyPrefix: 'builder_files', limit: 20, windowSeconds: 60 }),
  zValidator('json', generateBuilderFilesSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const id = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const existingRow = await db
      .prepare(
        'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE id = ? AND user_id = ?'
      )
      .bind(id, user.id)
      .first<DbBuilderRow>();

    if (!existingRow) {
      return c.json({ error: 'Not found', message: 'Builder project not found.' }, 404);
    }

    const project = mapBuilderRow(existingRow);
    const settings = await getAppSettings(db);
    if (!settings.enabledBuilderTypes.includes(project.builderType) && user.role !== 'admin') {
      return c.json(
        {
          error: 'Builder type disabled',
          message: `The ${project.builderType.replace('_', ' ')} builder is currently disabled by an administrator.`,
        },
        403
      );
    }

    const input = c.req.valid('json');
    const nextName = input.name ?? project.name;
    const nextPrompt = input.prompt ?? project.prompt;
    const nextConfig = normalizeBuilderConfig(
      project.builderType,
      input.config ?? project.spec.config,
      nextName,
      nextPrompt
    );

    let generated;
    try {
      generated = await generateSourceFilesForSpec(
        c.env.AI,
        c.env.WORKERS_AI_MODEL,
        project.builderType,
        nextName,
        nextPrompt,
        project.spec,
        nextConfig,
        c.env.ENVIRONMENT ?? 'production'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Source code generation failed.';
      return c.json({ error: 'Source generation failed', message }, c.env.AI ? 502 : 503);
    }

    await db
      .prepare(
        `UPDATE builder_projects
         SET name = ?, prompt = ?, spec_json = ?, files_json = ?, status = 'generated',
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ?`
      )
      .bind(
        nextName,
        nextPrompt,
        JSON.stringify(generated.spec),
        JSON.stringify(generated.files),
        id,
        user.id
      )
      .run();

    const updated = await db
      .prepare(
        'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE id = ?'
      )
      .bind(id)
      .first<DbBuilderRow>();

    return c.json({ project: updated ? mapBuilderRow(updated) : null });
  }
);

builderRoutes.post(
  '/projects/:id/regenerate-file',
  rateLimit({ keyPrefix: 'builder_regen', limit: 30, windowSeconds: 60 }),
  zValidator('json', regenerateBuilderFileSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const id = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const existingRow = await db
      .prepare(
        'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE id = ? AND user_id = ?'
      )
      .bind(id, user.id)
      .first<DbBuilderRow>();

    if (!existingRow) {
      return c.json({ error: 'Not found', message: 'Builder project not found.' }, 404);
    }

    const project = mapBuilderRow(existingRow);
    const settings = await getAppSettings(db);
    if (!settings.enabledBuilderTypes.includes(project.builderType) && user.role !== 'admin') {
      return c.json(
        {
          error: 'Builder type disabled',
          message: `The ${project.builderType.replace('_', ' ')} builder is currently disabled by an administrator.`,
        },
        403
      );
    }

    const { filePath, instructions } = c.req.valid('json');

    let result;
    try {
      result = await regenerateSingleBuilderFile(
        c.env.AI,
        c.env.WORKERS_AI_MODEL,
        project,
        filePath,
        instructions,
        c.env.ENVIRONMENT ?? 'production'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'File regeneration failed.';
      return c.json({ error: 'Regeneration failed', message }, 502);
    }

    await db
      .prepare(
        `UPDATE builder_projects
         SET files_json = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ?`
      )
      .bind(JSON.stringify(result.files), id, user.id)
      .run();

    const updated = await db
      .prepare(
        'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE id = ?'
      )
      .bind(id)
      .first<DbBuilderRow>();

    return c.json({
      file: result.file,
      project: updated ? mapBuilderRow(updated) : null,
    });
  }
);

builderRoutes.patch(
  '/projects/:id',
  zValidator('json', updateBuilderProjectSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const id = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const existingRow = await db
      .prepare(
        'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE id = ? AND user_id = ?'
      )
      .bind(id, user.id)
      .first<DbBuilderRow>();

    if (!existingRow) {
      return c.json({ error: 'Not found', message: 'Builder project not found.' }, 404);
    }

    const existing = mapBuilderRow(existingRow);
    const settings = await getAppSettings(db);
    if (!settings.enabledBuilderTypes.includes(existing.builderType) && user.role !== 'admin') {
      return c.json(
        {
          error: 'Builder type disabled',
          message: `The ${existing.builderType.replace('_', ' ')} builder is currently disabled by an administrator.`,
        },
        403
      );
    }

    const input = c.req.valid('json');
    const nextName = input.name ?? existing.name;
    const nextPrompt = input.prompt ?? existing.prompt;
    const nextFiles = input.files ?? existing.files;

    let nextConfig = normalizeBuilderConfig(
      existing.builderType,
      input.config ?? existing.spec.config,
      nextName,
      nextPrompt
    );
    if (existing.builderType === 'workflow' && input.isActive !== undefined) {
      nextConfig = {
        ...(nextConfig as AutomationBuilderConfig),
        isActive: input.isActive,
      };
    }

    const nextSpec: BuilderSpec = {
      ...existing.spec,
      config: nextConfig,
    };
    nextSpec.deployment = buildDeploymentConfig(existing.builderType, nextName, nextSpec, nextFiles);
    const nextStatus = input.status ?? existing.status;

    await db
      .prepare(
        `UPDATE builder_projects
         SET name = ?, prompt = ?, spec_json = ?, files_json = ?, status = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ?`
      )
      .bind(
        nextName,
        nextPrompt,
        JSON.stringify(nextSpec),
        JSON.stringify(nextFiles),
        nextStatus,
        id,
        user.id
      )
      .run();

    const updated = await db
      .prepare(
        'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE id = ?'
      )
      .bind(id)
      .first<DbBuilderRow>();

    return c.json({ project: updated ? mapBuilderRow(updated) : null });
  }
);

builderRoutes.post(
  '/projects/:id/test',
  rateLimit({ keyPrefix: 'builder_test', limit: 30, windowSeconds: 60 }),
  zValidator('json', testBuilderProjectSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const id = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const existingRow = await db
      .prepare(
        'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE id = ? AND user_id = ?'
      )
      .bind(id, user.id)
      .first<DbBuilderRow>();

    if (!existingRow) {
      return c.json({ error: 'Not found', message: 'Builder project not found.' }, 404);
    }

    const project = mapBuilderRow(existingRow);
    const settings = await getAppSettings(db);
    if (!settings.enabledBuilderTypes.includes(project.builderType) && user.role !== 'admin') {
      return c.json(
        {
          error: 'Builder type disabled',
          message: `The ${project.builderType.replace('_', ' ')} builder is currently disabled by an administrator.`,
        },
        403
      );
    }

    const input = c.req.valid('json');

    let testRun;
    try {
      testRun = await executeBuilderProjectTest(
        c.env.AI,
        c.env.WORKERS_AI_MODEL,
        project,
        input,
        c.env.ENVIRONMENT ?? 'production'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Builder test failed.';
      return c.json({ error: 'Builder test failed', message }, 400);
    }

    const nextHistory = [testRun, ...(project.spec.testHistory ?? [])].slice(0, 15);
    const nextSpec: BuilderSpec = {
      ...project.spec,
      testHistory: nextHistory,
    };
    const nextStatus =
      project.status === 'deployed'
        ? 'deployed'
        : project.files.length > 0
          ? 'previewed'
          : project.status;

    await db
      .prepare(
        `UPDATE builder_projects
         SET spec_json = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ?`
      )
      .bind(JSON.stringify(nextSpec), nextStatus, id, user.id)
      .run();

    const updated = await db
      .prepare(
        'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE id = ?'
      )
      .bind(id)
      .first<DbBuilderRow>();

    return c.json({
      testRun,
      project: updated ? mapBuilderRow(updated) : null,
    });
  }
);

builderRoutes.post(
  '/projects/:id/deploy',
  zValidator('json', deployBuilderProjectSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const id = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const existingRow = await db
      .prepare(
        'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE id = ? AND user_id = ?'
      )
      .bind(id, user.id)
      .first<DbBuilderRow>();

    if (!existingRow) {
      return c.json({ error: 'Not found', message: 'Builder project not found.' }, 404);
    }

    const project = mapBuilderRow(existingRow);
    const settings = await getAppSettings(db);
    if (!settings.enabledBuilderTypes.includes(project.builderType) && user.role !== 'admin') {
      return c.json(
        {
          error: 'Builder type disabled',
          message: `The ${project.builderType.replace('_', ' ')} builder is currently disabled by an administrator.`,
        },
        403
      );
    }

    const input = c.req.valid('json');
    const deployedAt = input.markDeployed ? new Date().toISOString() : project.spec.deployment?.deployedAt ?? null;
    const deployment = buildDeploymentConfig(
      project.builderType,
      project.name,
      project.spec,
      project.files,
      {
        deployUrl: input.deployUrl === '' ? null : input.deployUrl ?? project.spec.deployment?.deployUrl ?? null,
        webhookUrl: input.webhookUrl === '' ? null : input.webhookUrl ?? project.spec.deployment?.webhookUrl ?? null,
        deployedAt,
      }
    );

    const nextSpec: BuilderSpec = {
      ...project.spec,
      deployment,
    };
    const nextStatus = input.markDeployed ? 'deployed' : project.status;

    await db
      .prepare(
        `UPDATE builder_projects
         SET spec_json = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ?`
      )
      .bind(JSON.stringify(nextSpec), nextStatus, id, user.id)
      .run();

    const updated = await db
      .prepare(
        'SELECT id, user_id, builder_type, name, prompt, spec_json, files_json, status, created_at, updated_at FROM builder_projects WHERE id = ?'
      )
      .bind(id)
      .first<DbBuilderRow>();

    return c.json({ project: updated ? mapBuilderRow(updated) : null });
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
