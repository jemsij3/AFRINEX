import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './types.ts';
import type { HealthCheckResponse, PlatformSectionBlueprint } from '../shared/types.ts';
import authRoutes from './routes/auth.ts';
import adminRoutes from './routes/admin.ts';
import aiRoutes from './routes/ai.ts';
import learningRoutes from './routes/learning.ts';
import toolsRoutes from './routes/tools.ts';
import opportunitiesRoutes from './routes/opportunities.ts';
import dashboardRoutes from './routes/dashboard.ts';
import builderRoutes from './routes/builders.ts';
import telegramServicesRoutes from './routes/telegramServices.ts';
import telegramBotManagementRoutes from './routes/telegramBotManagement.ts';
import paymentRoutes from './routes/payments.ts';
import webhookRoutes from './routes/webhooks.ts';
import publicRoutes from './routes/public.ts';
import { DEFAULT_WORKERS_AI_MODEL } from './lib/workersAi.ts';
import { ensureD1Schema, invalidateSchemaEnsureCache } from './lib/schemaEnsure.ts';
import { getAppSettings } from './lib/settings.ts';
import { verifySessionJwt } from './lib/jwt.ts';
import { getJwtSecret, isConfiguredOwnerTelegramId } from './middleware/auth.ts';

const app = new Hono<AppEnv>();

const SECTION_BLUEPRINTS: PlatformSectionBlueprint[] = [
  {
    id: 'assistant',
    title: 'AI Assistant',
    shortLabel: 'Assistant',
    summary: 'Context-aware technology, AI, Web3, and business Q&A powered by Cloudflare Workers AI.',
    phaseTarget: 'Active',
    endpoints: ['POST /api/ai/chat', 'GET /api/ai/conversations'],
    d1Tables: ['ai_conversations', 'ai_messages'],
  },
  {
    id: 'builders',
    title: 'AI Builders & Agents',
    shortLabel: 'Builders',
    summary: 'Modular generators for Telegram bots, AI agents, websites, Mini Apps, and automation workflows.',
    phaseTarget: 'Active',
    endpoints: ['GET /api/builders/projects', 'POST /api/builders/projects'],
    d1Tables: ['builder_projects'],
  },
  {
    id: 'telegram',
    title: 'Telegram Services',
    shortLabel: 'Telegram',
    summary: 'Bot management, channel tools, Mini App integrations, and customer-support automation.',
    phaseTarget: 'Active',
    endpoints: ['GET /api/telegram-services', 'POST /api/telegram-services'],
    d1Tables: ['telegram_services'],
  },
  {
    id: 'learning',
    title: 'Learning Center',
    shortLabel: 'Learn',
    summary: 'Beginner, intermediate, and advanced digital tracks with lesson progress tracking.',
    phaseTarget: 'Active',
    endpoints: ['GET /api/courses', 'POST /api/lessons/:id/complete'],
    d1Tables: ['courses', 'lessons', 'lesson_progress'],
  },
  {
    id: 'tools',
    title: 'AI Tools Directory',
    shortLabel: 'Tools',
    summary: 'Curated tools across writing, coding, design, productivity, and business.',
    phaseTarget: 'Active',
    endpoints: ['GET /api/tools', 'POST /api/bookmarks'],
    d1Tables: ['ai_tools', 'bookmarks'],
  },
  {
    id: 'opportunities',
    title: 'Opportunities',
    shortLabel: 'Opportunities',
    summary: 'Remote jobs, freelance gigs, scholarships, grants, and events across Africa and globally.',
    phaseTarget: 'Active',
    endpoints: ['GET /api/opportunities', 'POST /api/bookmarks'],
    d1Tables: ['opportunities', 'bookmarks'],
  },
  {
    id: 'dashboard',
    title: 'My Dashboard & AFRINEX Pro',
    shortLabel: 'Dashboard',
    summary: 'User profile, bookmarks, learning progress, and Telegram Stars Pro membership.',
    phaseTarget: 'Active',
    endpoints: ['GET /api/dashboard', 'POST /api/payments/stars-invoice'],
    d1Tables: ['users', 'subscriptions', 'payments'],
  },
  {
    id: 'admin',
    title: 'Admin Console',
    shortLabel: 'Admin',
    summary: 'Protected RBAC console to manage users, courses, tools, opportunities, builders, and plans.',
    phaseTarget: 'RBAC Protected',
    endpoints: ['GET /api/admin/overview', 'POST /api/admin/courses'],
    d1Tables: ['audit_logs', 'users'],
  },
];

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://telegram.org",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self'",
  "frame-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self' https://web.telegram.org https://*.telegram.org https://*.t.me",
].join('; ');

// Security headers for all Worker responses
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  c.header('Content-Security-Policy', CONTENT_SECURITY_POLICY);

  const forwardedProto = c.req.header('x-forwarded-proto');
  if (c.req.url.startsWith('https://') || forwardedProto === 'https') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});

// Ensure Stage 0 / partially-migrated D1 tables have required additive columns/tables
app.use('/api/*', async (c, next) => {
  if (c.req.path !== '/api/health' && c.env.DB) {
    await ensureD1Schema(c.env.DB);
  }
  await next();
});

// Enforce maintenance mode for non-admin users on feature routes
app.use('/api/*', async (c, next) => {
  const path = c.req.path;
  if (
    !c.env.DB ||
    path === '/api/health' ||
    path === '/api/config/public' ||
    path.startsWith('/api/auth/') ||
    path.startsWith('/api/webhooks/') ||
    path.startsWith('/api/admin/')
  ) {
    await next();
    return;
  }

  const settings = await getAppSettings(c.env.DB);
  if (!settings.maintenanceMode) {
    await next();
    return;
  }

  // Allow authenticated owners and administrators to bypass maintenance lock
  const authHeader = c.req.header('Authorization');
  const secret = getJwtSecret(c.env);
  if (authHeader?.startsWith('Bearer ') && secret) {
    try {
      const payload = await verifySessionJwt(authHeader.slice(7).trim(), secret);
      if (
        payload.role === 'admin' ||
        isConfiguredOwnerTelegramId(payload.tgId, c.env)
      ) {
        await next();
        return;
      }
    } catch {
      // Invalid token falls through to maintenance response
    }
  }

  return c.json(
    {
      error: 'Maintenance mode',
      message: settings.maintenanceMessage,
    },
    503
  );
});

// Ensure all unhandled errors on /api/* return structured JSON instead of plain-text 500s
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    const status = err.status;
    if (c.req.path.startsWith('/api/')) {
      return c.json(
        {
          error: status >= 500 ? 'Server error' : 'Request error',
          message: err.message || 'Invalid request.',
        },
        status
      );
    }
    return err.getResponse();
  }

  const rawMessage = err instanceof Error ? err.message : 'Unexpected server error';
  console.error('[AFRINEX Worker Error]', {
    method: c.req.method,
    path: c.req.path,
    message: rawMessage,
  });

  if (c.req.path.startsWith('/api/')) {
    const lowerMessage = rawMessage.toLowerCase();
    const isDatabaseSchemaError =
      lowerMessage.includes('no such table') ||
      lowerMessage.includes('no such column') ||
      lowerMessage.includes('has no column named');

    if (isDatabaseSchemaError && c.env.DB) {
      invalidateSchemaEnsureCache(c.env.DB);
    }

    const isConstraintError = lowerMessage.includes('constraint failed');
    const isDatabaseError =
      isDatabaseSchemaError ||
      isConstraintError ||
      rawMessage.includes('D1_ERROR') ||
      rawMessage.includes('SQLITE_');

    return c.json(
      {
        error: isDatabaseSchemaError
          ? 'Database schema error'
          : isDatabaseError
            ? 'Database error'
            : 'Internal server error',
        message: isDatabaseSchemaError
          ? 'Database schema mismatch detected. Apply pending D1 migrations and try again.'
          : isConstraintError
            ? 'A database constraint prevented saving this request. Please verify your input and try again.'
            : isDatabaseError
              ? 'A temporary database error occurred. Please try again.'
              : 'An unexpected error occurred while processing your request.',
      },
      500
    );
  }

  return c.text('Internal Server Error', 500);
});

app.get('/api/health', async (c) => {
  let d1Healthy = false;
  if (c.env.DB) {
    try {
      await c.env.DB.prepare('SELECT 1 AS ok').first();
      d1Healthy = true;
    } catch {
      d1Healthy = false;
    }
  }

  const response: HealthCheckResponse = {
    ok: true,
    service: 'afrinex-worker',
    environment: c.env.ENVIRONMENT ?? 'production',
    runtime: 'cloudflare-workers',
    bindings: {
      d1: d1Healthy,
      workersAi: Boolean(c.env.AI),
      telegramConfigured: Boolean(c.env.TELEGRAM_BOT_TOKEN),
    },
    model: c.env.WORKERS_AI_MODEL ?? DEFAULT_WORKERS_AI_MODEL,
    timestamp: new Date().toISOString(),
  };

  return c.json(response);
});

app.get('/api/platform/blueprint', (c) => {
  return c.json({
    brand: 'AFRINEX',
    slogan: 'African Roots. Global Impact.',
    sections: SECTION_BLUEPRINTS,
  });
});

// Complete AFRINEX Platform API
app.route('/api', publicRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/admin', adminRoutes);
app.route('/api/ai', aiRoutes);
app.route('/api', learningRoutes);
app.route('/api/tools', toolsRoutes);
app.route('/api/opportunities', opportunitiesRoutes);
app.route('/api', dashboardRoutes);
app.route('/api/builders', builderRoutes);
app.route('/api/telegram-services', telegramServicesRoutes);
app.route('/api/telegram-bots', telegramBotManagementRoutes);
app.route('/api/payments', paymentRoutes);
app.route('/api/webhooks', webhookRoutes);

app.all('/api/*', (c) => {
  return c.json(
    {
      error: 'Not found',
      message: `API endpoint ${c.req.path} does not exist.`,
    },
    404
  );
});

// Fallback to Cloudflare Workers Static Assets for SPA client routes
app.all('*', async (c) => {
  if (c.env.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text('AFRINEX API service running.', 200);
});

export default app;
