-- AFRINEX Starter Catalog Seed
-- Migration: 0002_seed_catalog.sql

INSERT OR IGNORE INTO courses (id, slug, title, summary, track, category, is_pro, published) VALUES
  ('course_ai_foundations', 'ai-foundations-for-builders', 'AI Foundations for Digital Builders', 'Practical prompt engineering, structured outputs, and everyday workflows using modern open models.', 'beginner', 'Artificial Intelligence', 0, 1),
  ('course_tg_mini_apps', 'telegram-mini-app-architecture', 'Building Telegram Mini Apps at the Edge', 'Learn initData authentication, mobile-first React layouts, and Cloudflare Workers APIs.', 'intermediate', 'Telegram Engineering', 0, 1),
  ('course_biz_automation', 'autonomous-business-workflows', 'Autonomous Business & Support Workflows', 'Design reliable AI agents, webhook pipelines, and Telegram Stars monetization.', 'advanced', 'Automation & Systems', 1, 1);

INSERT OR IGNORE INTO lessons (id, course_id, title, content_md, duration_mins, sort_order) VALUES
  ('lesson_ai_1', 'course_ai_foundations', 'How Modern LLMs Reason & Format Output', 'Explore token context, system prompts, and predictable JSON generation.', 12, 1),
  ('lesson_ai_2', 'course_ai_foundations', 'Designing Prompts for Real Business Tasks', 'Structure inputs, constraints, and verification steps for reliable answers.', 15, 2),
  ('lesson_tg_1', 'course_tg_mini_apps', 'Telegram WebApp Lifecycle & Theme Sync', 'Configure ready(), expand(), viewport heights, and Android keyboard ergonomics.', 14, 1),
  ('lesson_tg_2', 'course_tg_mini_apps', 'Verifying Telegram initData with Web Crypto', 'Implement replay-safe HMAC-SHA256 verification inside Cloudflare Workers.', 18, 2),
  ('lesson_auto_1', 'course_biz_automation', 'Event-Driven Telegram Bot & Payment Webhooks', 'Handle bot updates, pre-checkout queries, and idempotent Stars billing.', 20, 1);

INSERT OR IGNORE INTO ai_tools (id, name, summary, category, url, pricing_model, featured, published) VALUES
  ('tool_workers_ai', 'Cloudflare Workers AI', 'Serverless GPU inference for open-weight models directly inside edge Workers.', 'coding', 'https://developers.cloudflare.com/workers-ai/', 'freemium', 1, 1),
  ('tool_hono', 'Hono Framework', 'Ultrafast Web-Standards TypeScript router tailored for Cloudflare Workers and edge APIs.', 'coding', 'https://hono.dev/', 'open-source', 1, 1),
  ('tool_notion_ai', 'Notion Workspace', 'Connected docs, sprint specs, and knowledge hubs for distributed African tech teams.', 'productivity', 'https://www.notion.so/', 'freemium', 0, 1),
  ('tool_figma', 'Figma Design System', 'Collaborative mobile-first UI prototyping and component systems.', 'design', 'https://www.figma.com/', 'freemium', 0, 1),
  ('tool_copy_studio', 'Editorial Brief Assistant', 'Structured long-form technical writing and investor pitch drafting workflows.', 'writing', 'https://afrinex.org/tools', 'free', 0, 1),
  ('tool_stripe_atlas', 'Global Founder Toolkit', 'Cross-border incorporation, invoicing, and compliance resources for remote founders.', 'business', 'https://afrinex.org/tools', 'paid', 0, 1);

INSERT OR IGNORE INTO opportunities (id, title, organization, summary, opportunity_type, region, url, deadline, published) VALUES
  ('opp_cf_workers_fellow', 'Edge Systems & AI Builder Fellowship', 'AFRINEX Talent Network', 'Remote 12-week technical fellowship building real-world digital products on Cloudflare Workers.', 'grant', 'africa', 'https://afrinex.org/opportunities', '2026-12-31', 1),
  ('opp_remote_ts', 'Remote Full-Stack TypeScript Engineer', 'Pan-African Fintech Collective', 'Build resilient payment APIs and mobile-first dashboards with TypeScript and SQL.', 'job', 'remote', 'https://afrinex.org/opportunities', '2026-12-15', 1),
  ('opp_web3_bounty', 'Open-Source Telegram Bot & Mini App Bounties', 'Global Builder Guild', 'Paid freelance milestones for verified Telegram automation and community tooling.', 'freelance', 'global', 'https://afrinex.org/opportunities', '2026-12-20', 1),
  ('opp_africa_tech_summit', 'African Digital Builders Summit', 'AFRINEX Community', 'Virtual & regional founder showcase connecting builders, mentors, and global partners.', 'event', 'africa', 'https://afrinex.org/opportunities', '2027-01-18', 1);
