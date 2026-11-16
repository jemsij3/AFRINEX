import { Hono } from 'hono';
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
import { DEFAULT_WORKERS_AI_MODEL } from './lib/workersAi.ts';

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

// Security headers for all Worker responses
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
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

// Phase 2-6: Complete AFRINEX Platform API
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
