import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import {
  createBuilderProjectSchema,
  createBuilderVersionSchema,
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
  BuilderProjectStatus,
  BuilderProjectVersion,
  BuilderProvidersResponse,
  BuilderSpec,
  BuilderType,
} from '../../shared/types.ts';
import { utcDayStartIso } from '../../shared/utils.ts';
import {
  executeBuilderProjectTest,
  generateModularBuilderProject,
  generateSourceFilesForSpec,
  regenerateSingleBuilderFile,
} from '../lib/builderEngine.ts';
import { buildDeploymentConfig, normalizeBuilderConfig } from '../lib/builderTemplates.ts';
import { featureDisabledResponse, isFeatureAccessible } from '../lib/featureAccess.ts';
import { createNotificationSafe, logSystemEvent } from '../lib/monitoring.ts';
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

const PROJECT_SELECT_COLUMNS =
  'id, user_id, builder_type, name, prompt, spec_json, files_json, status, folder, is_favorite, last_error, created_at, updated_at';

interface DbBuilderRow {
  id: string;
  user_id: string;
  builder_type: BuilderType;
  name: string;
  prompt: string;
  spec_json: string;
  files_json: string;
  status: BuilderProjectStatus;
  folder?: string | null;
  is_favorite?: number | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

interface DbVersionRow {
  id: string;
  project_id: string;
  user_id: string;
  version_number: number;
  label: string;
  name: string;
  prompt: string;
  spec_json: string;
  files_json: string;
  status: BuilderProjectStatus;
  created_at: string;
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
    folder: row.folder ?? 'General',
    isFavorite: row.is_favorite === 1,
    lastError: row.last_error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapVersionRow(row: DbVersionRow): BuilderProjectVersion {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    versionNumber: Number(row.version_number),
    label: row.label,
    name: row.name,
    prompt: row.prompt,
    spec: safeParseSpec(row.spec_json),
    files: safeParseFiles(row.files_json),
    status: row.status,
    createdAt: row.created_at,
  };
}

async function createVersionSnapshot(
  db: D1Database,
  projectRow: DbBuilderRow,
  label: string
): Promise<BuilderProjectVersion | null> {
  try {
    const maxRow = await db
      .prepare('SELECT COALESCE(MAX(version_number), 0) AS max_ver FROM builder_project_versions WHERE project_id = ?')
      .bind(projectRow.id)
      .first<{ max_ver: number }>();
    const nextVersion = Number(maxRow?.max_ver ?? 0) + 1;
    const versionId = `bpv_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;

    await db
      .prepare(
        `INSERT INTO builder_project_versions (id, project_id, user_id, version_number, label, name, prompt, spec_json, files_json, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        versionId,
        projectRow.id,
        projectRow.user_id,
        nextVersion,
        label.slice(0, 80),
        projectRow.name,
        projectRow.prompt,
        projectRow.spec_json,
        projectRow.files_json,
        projectRow.status
      )
      .run();

    const created = await db
      .prepare(
        `SELECT id, project_id, user_id, version_number, label, name, prompt, spec_json, files_json, status, created_at
         FROM builder_project_versions WHERE id = ?`
      )
      .bind(versionId)
      .first<DbVersionRow>();

    return created ? mapVersionRow(created) : null;
  } catch {
    return null;
  }
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
  const statusFilter = c.req.query('status');
  const folderFilter = c.req.query('folder')?.trim();
  const favoriteOnly = c.req.query('favorite') === 'true';
  const q = c.req.query('q')?.trim();
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, Number.parseInt(c.req.query('per_page') ?? '50', 10) || 50));
  const offset = (page - 1) * perPage;

  const conditions: string[] = ['user_id = ?'];
  const params: Array<string | number> = [user.id];

  if (
    builderTypeFilter &&
    ['telegram_bot', 'ai_agent', 'website', 'mini_app', 'workflow'].includes(builderTypeFilter)
  ) {
    conditions.push('builder_type = ?');
    params.push(builderTypeFilter);
  }

  if (
    statusFilter &&
    ['draft', 'in_progress', 'completed', 'failed', 'generated', 'previewed', 'deployed'].includes(statusFilter)
  ) {
    conditions.push('status = ?');
    params.push(statusFilter);
  }

  if (folderFilter && folderFilter !== 'all') {
    conditions.push('folder = ?');
    params.push(folderFilter);
  }

  if (favoriteOnly) {
    conditions.push('is_favorite = 1');
  }

  if (q) {
    conditions.push('(name LIKE ? OR prompt LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like);
  }

  const whereSql = conditions.join(' AND ');
  const [rows, countRow, folderRows] = await Promise.all([
    db
      .prepare(
        `SELECT ${PROJECT_SELECT_COLUMNS}
         FROM builder_projects
         WHERE ${whereSql}
         ORDER BY is_favorite DESC, updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, perPage, offset)
      .all<DbBuilderRow>(),
    db
      .prepare(`SELECT COUNT(*) AS total FROM builder_projects WHERE ${whereSql}`)
      .bind(...params)
      .first<{ total: number }>(),
    db
      .prepare('SELECT DISTINCT folder FROM builder_projects WHERE user_id = ? ORDER BY folder ASC')
      .bind(user.id)
      .all<{ folder: string }>(),
  ]);

  const total = Number(countRow?.total ?? 0);
  return c.json({
    projects: (rows.results ?? []).map(mapBuilderRow),
    folders: (folderRows.results ?? []).map((f) => f.folder).filter(Boolean),
    page,
    per_page: perPage,
    total,
    total_pages: Math.max(1, Math.ceil(total / perPage)),
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
      const utcDayStart = utcDayStartIso();
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
      await logSystemEvent(db, {
        level: 'error',
        category: 'ai',
        eventName: 'builder.create_failed',
        message,
        userId: user.id,
        requestPath: c.req.path,
        metadata: { builderType },
      });
      await createNotificationSafe(db, {
        userId: user.id,
        type: 'project',
        title: `Builder Failed: ${name}`,
        body: message,
        linkSection: 'builders',
      });
      return c.json({ error: 'Builder generation failed', message }, c.env.AI ? 502 : 503);
    }

    const initialStatus: BuilderProjectStatus = generationStep === 'plan' ? 'draft' : 'generated';
    const id = `bld_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
    await db
      .prepare(
        `INSERT INTO builder_projects (id, user_id, builder_type, name, prompt, spec_json, files_json, status, folder, is_favorite)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'General', 0)`
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
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ?`)
      .bind(id)
      .first<DbBuilderRow>();

    if (row) {
      await createVersionSnapshot(
        db,
        row,
        generationStep === 'plan' ? 'Initial Project Plan' : 'Initial Plan & Source Bundle'
      );
      await createNotificationSafe(db, {
        userId: user.id,
        type: 'project',
        title: `Project Created: ${name}`,
        body: `Your ${builderType.replace('_', ' ')} project is ready with ${generated.files.length} generated file(s).`,
        linkSection: 'builders',
        linkRefId: id,
      });
    }

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
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ? AND user_id = ?`)
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
      await db
        .prepare("UPDATE builder_projects SET status = 'failed', last_error = ? WHERE id = ? AND user_id = ?")
        .bind(message.slice(0, 300), id, user.id)
        .run()
        .catch(() => {});
      await logSystemEvent(db, {
        level: 'error',
        category: 'ai',
        eventName: 'builder.generate_files_failed',
        message,
        userId: user.id,
        requestPath: c.req.path,
        metadata: { projectId: id, builderType: project.builderType },
      });
      return c.json({ error: 'Source generation failed', message }, c.env.AI ? 502 : 503);
    }

    await db
      .prepare(
        `UPDATE builder_projects
         SET name = ?, prompt = ?, spec_json = ?, files_json = ?, status = 'generated', last_error = NULL,
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
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ?`)
      .bind(id)
      .first<DbBuilderRow>();

    if (updated) {
      await createVersionSnapshot(db, updated, 'Generated Source Bundle');
    }

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
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ? AND user_id = ?`)
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
      await logSystemEvent(db, {
        level: 'error',
        category: 'ai',
        eventName: 'builder.regenerate_file_failed',
        message,
        userId: user.id,
        metadata: { projectId: id, filePath },
      });
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
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ?`)
      .bind(id)
      .first<DbBuilderRow>();

    if (updated) {
      await createVersionSnapshot(db, updated, `Regenerated ${filePath}`);
    }

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
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ? AND user_id = ?`)
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
    const nextFolder = input.folder ?? existing.folder ?? 'General';
    const nextFavorite =
      input.isFavorite !== undefined ? (input.isFavorite ? 1 : 0) : existing.isFavorite ? 1 : 0;

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
         SET name = ?, prompt = ?, spec_json = ?, files_json = ?, status = ?, folder = ?, is_favorite = ?,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ?`
      )
      .bind(
        nextName,
        nextPrompt,
        JSON.stringify(nextSpec),
        JSON.stringify(nextFiles),
        nextStatus,
        nextFolder,
        nextFavorite,
        id,
        user.id
      )
      .run();

    const updated = await db
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ?`)
      .bind(id)
      .first<DbBuilderRow>();

    if (updated && (input.files !== undefined || input.config !== undefined || input.prompt !== undefined)) {
      await createVersionSnapshot(db, updated, input.files ? 'Edited Source Files' : 'Updated Configuration');
    }

    return c.json({ project: updated ? mapBuilderRow(updated) : null });
  }
);

builderRoutes.post('/projects/:id/duplicate', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const existingRow = await db
    .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ? AND user_id = ?`)
    .bind(id, user.id)
    .first<DbBuilderRow>();

  if (!existingRow) {
    return c.json({ error: 'Not found', message: 'Builder project not found.' }, 404);
  }

  const newId = `bld_${crypto.randomUUID().replace(/-/g, '').slice(0, 14)}`;
  const copyName = `Copy of ${existingRow.name}`.slice(0, 80);

  await db
    .prepare(
      `INSERT INTO builder_projects (id, user_id, builder_type, name, prompt, spec_json, files_json, status, folder, is_favorite)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .bind(
      newId,
      user.id,
      existingRow.builder_type,
      copyName,
      existingRow.prompt,
      existingRow.spec_json,
      existingRow.files_json,
      existingRow.status === 'deployed' ? 'generated' : existingRow.status,
      existingRow.folder ?? 'General'
    )
    .run();

  const copiedRow = await db
    .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ?`)
    .bind(newId)
    .first<DbBuilderRow>();

  if (copiedRow) {
    await createVersionSnapshot(db, copiedRow, `Duplicated from ${existingRow.name}`);
  }

  return c.json({ project: copiedRow ? mapBuilderRow(copiedRow) : null }, 201);
});

builderRoutes.get('/projects/:id/versions', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const ownerCheck = await db
    .prepare('SELECT id FROM builder_projects WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first<{ id: string }>();

  if (!ownerCheck) {
    return c.json({ error: 'Not found', message: 'Builder project not found.' }, 404);
  }

  const rows = await db
    .prepare(
      `SELECT id, project_id, user_id, version_number, label, name, prompt, spec_json, files_json, status, created_at
       FROM builder_project_versions
       WHERE project_id = ? AND user_id = ?
       ORDER BY version_number DESC
       LIMIT 30`
    )
    .bind(id, user.id)
    .all<DbVersionRow>();

  return c.json({ versions: (rows.results ?? []).map(mapVersionRow) });
});

builderRoutes.post(
  '/projects/:id/versions',
  zValidator('json', createBuilderVersionSchema),
  async (c) => {
    const db = c.env.DB;
    const user = c.get('user')!;
    const id = c.req.param('id');
    if (!db) return c.json({ error: 'Database unavailable' }, 503);

    const existingRow = await db
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ? AND user_id = ?`)
      .bind(id, user.id)
      .first<DbBuilderRow>();

    if (!existingRow) {
      return c.json({ error: 'Not found', message: 'Builder project not found.' }, 404);
    }

    const { label } = c.req.valid('json');
    const version = await createVersionSnapshot(db, existingRow, label);
    return c.json({ version }, 201);
  }
);

builderRoutes.post('/projects/:id/versions/:versionId/restore', async (c) => {
  const db = c.env.DB;
  const user = c.get('user')!;
  const id = c.req.param('id');
  const versionId = c.req.param('versionId');
  if (!db) return c.json({ error: 'Database unavailable' }, 503);

  const [existingRow, targetVersion] = await Promise.all([
    db
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ? AND user_id = ?`)
      .bind(id, user.id)
      .first<DbBuilderRow>(),
    db
      .prepare(
        `SELECT id, project_id, user_id, version_number, label, name, prompt, spec_json, files_json, status, created_at
         FROM builder_project_versions
         WHERE id = ? AND project_id = ? AND user_id = ?`
      )
      .bind(versionId, id, user.id)
      .first<DbVersionRow>(),
  ]);

  if (!existingRow || !targetVersion) {
    return c.json({ error: 'Not found', message: 'Project or version snapshot not found.' }, 404);
  }

  await db
    .prepare(
      `UPDATE builder_projects
       SET name = ?, prompt = ?, spec_json = ?, files_json = ?, status = ?,
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
       WHERE id = ? AND user_id = ?`
    )
    .bind(
      targetVersion.name,
      targetVersion.prompt,
      targetVersion.spec_json,
      targetVersion.files_json,
      targetVersion.status,
      id,
      user.id
    )
    .run();

  const updated = await db
    .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ?`)
    .bind(id)
    .first<DbBuilderRow>();

  if (updated) {
    await createVersionSnapshot(db, updated, `Restored v${targetVersion.version_number}`);
  }

  return c.json({ project: updated ? mapBuilderRow(updated) : null });
});

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
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ? AND user_id = ?`)
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
    const nextStatus: BuilderProjectStatus =
      project.status === 'deployed' || project.status === 'completed'
        ? project.status
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
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ?`)
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
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ? AND user_id = ?`)
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
    const nextStatus: BuilderProjectStatus = input.markDeployed ? 'deployed' : project.status;

    await db
      .prepare(
        `UPDATE builder_projects
         SET spec_json = ?, status = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ? AND user_id = ?`
      )
      .bind(JSON.stringify(nextSpec), nextStatus, id, user.id)
      .run();

    const updated = await db
      .prepare(`SELECT ${PROJECT_SELECT_COLUMNS} FROM builder_projects WHERE id = ?`)
      .bind(id)
      .first<DbBuilderRow>();

    if (updated) {
      await createVersionSnapshot(db, updated, input.markDeployed ? 'Deployment Configured' : 'Updated Deploy Metadata');
      if (input.markDeployed) {
        await createNotificationSafe(db, {
          userId: user.id,
          type: 'project',
          title: `Deployment Saved: ${project.name}`,
          body: deployment.deployUrl
            ? `Deployment endpoint recorded (${deployment.deployUrl}).`
            : 'Project marked deployed with Cloudflare export bundle.',
          linkSection: 'builders',
          linkRefId: id,
        });
      }
    }

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

