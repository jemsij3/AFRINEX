import type { PlatformSectionBlueprint } from '../../shared/types.ts';

export const AFRINEX_SECTIONS: PlatformSectionBlueprint[] = [
  {
    id: 'assistant',
    title: 'AI Assistant',
    shortLabel: 'Assistant',
    summary:
      'Context-aware technology, AI, Web3, and business guidance powered by Cloudflare Workers AI.',
    phaseTarget: 'Open Assistant',
    endpoints: ['POST /api/ai/chat', 'GET /api/ai/conversations'],
    d1Tables: ['ai_conversations', 'ai_messages'],
  },
  {
    id: 'builders',
    title: 'AI Builders & Agents',
    shortLabel: 'Builders',
    summary:
      'Modular project and code generators for Telegram bots, AI agents, websites, Mini Apps, and workflows.',
    phaseTarget: 'Open Builders',
    endpoints: ['GET /api/builders/projects', 'POST /api/builders/projects'],
    d1Tables: ['builder_projects'],
  },
  {
    id: 'telegram-bots',
    title: 'Telegram Bots',
    shortLabel: 'Telegram Bots',
    summary:
      'Register @BotFather bots, activate live webhook receivers, and monitor bot command analytics.',
    phaseTarget: 'Manage Bots',
    endpoints: ['GET /api/telegram-bots/bots', 'POST /api/telegram-bots/register-bot'],
    d1Tables: ['telegram_bots', 'telegram_analytics'],
  },
  {
    id: 'learning',
    title: 'Learning Center',
    shortLabel: 'Learn',
    summary:
      'Structured beginner, intermediate, and advanced tracks with lesson completion tracking.',
    phaseTarget: 'Start Learning',
    endpoints: ['GET /api/courses', 'POST /api/lessons/:id/complete'],
    d1Tables: ['courses', 'lessons', 'lesson_progress'],
  },
  {
    id: 'tools',
    title: 'AI Tools Directory',
    shortLabel: 'Tools',
    summary:
      'Curated discovery across writing, coding, design, productivity, and business workflows.',
    phaseTarget: 'Browse Directory',
    endpoints: ['GET /api/tools', 'POST /api/bookmarks'],
    d1Tables: ['ai_tools', 'bookmarks'],
  },
  {
    id: 'opportunities',
    title: 'Opportunities',
    shortLabel: 'Opportunities',
    summary:
      'Remote jobs, freelance gigs, scholarships, grants, and technology events across Africa and globally.',
    phaseTarget: 'View Listings',
    endpoints: ['GET /api/opportunities', 'POST /api/bookmarks'],
    d1Tables: ['opportunities', 'bookmarks'],
  },
  {
    id: 'dashboard',
    title: 'My Dashboard & AFRINEX Pro',
    shortLabel: 'Dashboard',
    summary:
      'User profile, bookmarks, learning progress, and AFRINEX Pro memberships via Telegram Stars.',
    phaseTarget: 'Open Dashboard',
    endpoints: ['GET /api/dashboard', 'POST /api/payments/stars-invoice'],
    d1Tables: ['users', 'subscriptions', 'payments'],
  },
  {
    id: 'admin',
    title: 'Admin Console',
    shortLabel: 'Admin',
    summary:
      'Manage users, courses, lessons, tools, opportunities, builders, and platform activity.',
    phaseTarget: 'Open Admin',
    endpoints: ['GET /api/admin/overview', 'POST /api/admin/courses'],
    d1Tables: ['audit_logs', 'users'],
  },
];
