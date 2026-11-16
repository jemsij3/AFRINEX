import type { PlatformSectionBlueprint } from '../../shared/types.ts';

export const AFRINEX_SECTIONS: PlatformSectionBlueprint[] = [
  {
    id: 'assistant',
    title: 'AI Assistant',
    shortLabel: 'Assistant',
    summary:
      'Context-aware technology, AI, Web3, and business guidance powered by Cloudflare Workers AI.',
    phaseTarget: 'Active',
    endpoints: ['POST /api/ai/chat', 'GET /api/ai/conversations'],
    d1Tables: ['ai_conversations', 'ai_messages'],
  },
  {
    id: 'builders',
    title: 'AI Builders & Agents',
    shortLabel: 'Builders',
    summary:
      'Modular project and code generators for Telegram bots, AI agents, websites, Mini Apps, and workflows.',
    phaseTarget: 'Stage 1 Active',
    endpoints: ['GET /api/builders/projects', 'POST /api/builders/projects'],
    d1Tables: ['builder_projects'],
  },
  {
    id: 'telegram',
    title: 'Telegram Services',
    shortLabel: 'Telegram',
    summary:
      'Bot development, channel management tools, Mini App services, and business support automation.',
    phaseTarget: 'Active',
    endpoints: ['GET /api/telegram-services', 'POST /api/telegram-services'],
    d1Tables: ['telegram_services'],
  },
  {
    id: 'learning',
    title: 'Learning Center',
    shortLabel: 'Learn',
    summary:
      'Structured beginner, intermediate, and advanced tracks with lesson completion tracking.',
    phaseTarget: 'Active',
    endpoints: ['GET /api/courses', 'POST /api/lessons/:id/complete'],
    d1Tables: ['courses', 'lessons', 'lesson_progress'],
  },
  {
    id: 'tools',
    title: 'AI Tools Directory',
    shortLabel: 'Tools',
    summary:
      'Curated discovery across writing, coding, design, productivity, and business workflows.',
    phaseTarget: 'Active',
    endpoints: ['GET /api/tools', 'POST /api/bookmarks'],
    d1Tables: ['ai_tools', 'bookmarks'],
  },
  {
    id: 'opportunities',
    title: 'Opportunities',
    shortLabel: 'Opportunities',
    summary:
      'Remote jobs, freelance gigs, scholarships, grants, and technology events across Africa and globally.',
    phaseTarget: 'Active',
    endpoints: ['GET /api/opportunities', 'POST /api/bookmarks'],
    d1Tables: ['opportunities', 'bookmarks'],
  },
  {
    id: 'dashboard',
    title: 'My Dashboard & AFRINEX Pro',
    shortLabel: 'Dashboard',
    summary:
      'User profile, bookmarks, learning progress, and AFRINEX Pro memberships via Telegram Stars.',
    phaseTarget: 'Active',
    endpoints: ['GET /api/dashboard', 'POST /api/payments/stars-invoice'],
    d1Tables: ['users', 'subscriptions', 'payments'],
  },
  {
    id: 'admin',
    title: 'Admin Console',
    shortLabel: 'Admin',
    summary:
      'Role-protected workspace to manage users, courses, lessons, tools, opportunities, builders, and billing.',
    phaseTarget: 'RBAC Protected',
    endpoints: ['GET /api/admin/overview', 'POST /api/admin/courses'],
    d1Tables: ['audit_logs', 'users'],
  },
];
