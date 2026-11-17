-- AFRINEX Starter Learning Catalog
-- Additive seed migration preserving existing users, progress, and enrollments.

INSERT OR IGNORE INTO courses (
  id,
  slug,
  title,
  summary,
  track,
  category,
  is_pro,
  published,
  created_at
) VALUES
  (
    'course_starter_ai_prompting',
    'applied-ai-prompting-for-builders',
    'Applied AI Prompting & Structured Workflows',
    'Master prompt structure, system instructions, and reliable JSON outputs using open-weight LLMs for daily research and operations.',
    'beginner',
    'AI',
    0,
    1,
    '2026-01-10T09:00:00.000Z'
  ),
  (
    'course_starter_productivity_ops',
    'digital-productivity-and-automation-systems',
    'Digital Productivity & Personal Knowledge Systems',
    'Organize notes, sprint plans, and lightweight automations so solo builders and small teams ship consistently on mobile and desktop.',
    'beginner',
    'Productivity',
    0,
    1,
    '2026-01-11T09:00:00.000Z'
  ),
  (
    'course_starter_coding_workers',
    'edge-apis-with-typescript-and-d1',
    'Edge APIs with TypeScript, Hono & Cloudflare D1',
    'Design fast edge backends using TypeScript, Zod validation, SQLite migrations in D1, and Telegram initData verification.',
    'intermediate',
    'Coding',
    0,
    1,
    '2026-01-12T09:00:00.000Z'
  ),
  (
    'course_starter_design_miniapp',
    'mobile-first-telegram-mini-app-design',
    'Mobile-First Design for Telegram Mini Apps',
    'Craft thumb-friendly layouts, clean typography, dark/light theme adaptation, and low-friction onboarding inside Telegram WebView.',
    'intermediate',
    'Design',
    0,
    1,
    '2026-01-13T09:00:00.000Z'
  ),
  (
    'course_starter_web3_payments',
    'web3-fundamentals-and-digital-rails',
    'Web3 Architecture & Cross-Border Digital Rails',
    'Understand wallets, on-chain verification patterns, smart-contract security basics, and practical digital payment flows.',
    'advanced',
    'Web3',
    1,
    1,
    '2026-01-14T09:00:00.000Z'
  ),
  (
    'course_starter_business_agents',
    'ai-powered-business-and-stars-monetization',
    'AI Business Automation & Telegram Stars Revenue',
    'Launch customer-support bots, automated lead pipelines, and recurring Telegram Stars memberships for digital products.',
    'advanced',
    'Business',
    1,
    1,
    '2026-01-15T09:00:00.000Z'
  );

INSERT OR IGNORE INTO lessons (
  id,
  course_id,
  title,
  content_md,
  duration_mins,
  sort_order,
  published,
  created_at
) VALUES
  -- Course 1: AI (Beginner)
  (
    'lesson_starter_ai_1',
    'course_starter_ai_prompting',
    'How Language Models Process Context',
    '## Context Windows & Instructions\n\nEvery model response depends on three layers:\n\n1. **System instructions** that define role, tone, and boundaries.\n2. **Task context** containing facts, constraints, and examples.\n3. **User input** requesting a concrete deliverable.\n\n### Practical Rule\nKeep prompts specific: state the audience, output format, and length before asking the model to generate.',
    10,
    1,
    1,
    '2026-01-10T09:05:00.000Z'
  ),
  (
    'lesson_starter_ai_2',
    'course_starter_ai_prompting',
    'Designing Reliable Structured Outputs',
    '## Turning Free Text into Actionable Data\n\nWhen integrating AI into an app or workflow, ask for predictable schemas:\n\n- Provide an explicit JSON shape.\n- List allowed enum values.\n- Validate the parsed response before saving it to your database.\n\n### Checklist\nAlways handle fallback text gracefully in case a model wraps JSON inside Markdown code fences.',
    14,
    2,
    1,
    '2026-01-10T09:10:00.000Z'
  ),
  (
    'lesson_starter_ai_3',
    'course_starter_ai_prompting',
    'Reviewing & Verifying AI Answers',
    '## Human-in-the-Loop Verification\n\nNever publish generated facts, legal terms, or financial figures without review.\n\n- Cross-check numbers against source documents.\n- Ask the model to list assumptions separately.\n- Keep prompts modular so individual steps can be tested and improved.',
    12,
    3,
    1,
    '2026-01-10T09:15:00.000Z'
  ),

  -- Course 2: Productivity (Beginner)
  (
    'lesson_starter_prod_1',
    'course_starter_productivity_ops',
    'Building a Weekly Execution Cadence',
    '## Focus Over Busywork\n\nHigh-output builders protect uninterrupted blocks for deep creation:\n\n- Pick **one primary outcome** per week.\n- Break projects into 30-minute verifiable tasks.\n- Review completed work every Friday to tighten estimates.',
    10,
    1,
    1,
    '2026-01-11T09:05:00.000Z'
  ),
  (
    'lesson_starter_prod_2',
    'course_starter_productivity_ops',
    'Reusable Templates for Client & Team Work',
    '## Standardizing Repeatable Workflows\n\nTurn repeated tasks into checklists and templates:\n\n1. Project brief template (goals, scope, deadline).\n2. Weekly progress update template.\n3. Launch readiness checklist.\n\nStandardization cuts communication overhead and reduces missed steps.',
    12,
    2,
    1,
    '2026-01-11T09:10:00.000Z'
  ),
  (
    'lesson_starter_prod_3',
    'course_starter_productivity_ops',
    'Automating Summaries & Follow-Ups',
    '## Lightweight Daily Automations\n\nCombine structured notes with AI assistants to draft meeting summaries, action items, and follow-up messages in seconds—while keeping final approval in your hands.',
    11,
    3,
    1,
    '2026-01-11T09:15:00.000Z'
  ),

  -- Course 3: Coding (Intermediate)
  (
    'lesson_starter_code_1',
    'course_starter_coding_workers',
    'Routing & Typed Validation with Hono and Zod',
    '## Edge-First API Architecture\n\nHono runs cleanly on Cloudflare Workers using standard Web `Request` and `Response` APIs.\n\n- Group routes by domain (`/api/courses`, `/api/builders`, `/api/dashboard`).\n- Validate every JSON payload with **Zod** before touching SQL.\n- Return consistent JSON error objects on `4xx` and `5xx` responses.',
    16,
    1,
    1,
    '2026-01-12T09:05:00.000Z'
  ),
  (
    'lesson_starter_code_2',
    'course_starter_coding_workers',
    'Safe SQLite Queries & Migrations in Cloudflare D1',
    '## Parameterized Queries & Additive Migrations\n\nCloudflare D1 speaks SQLite at the edge:\n\n1. Always use `.bind(...)` placeholders—never interpolate user strings into SQL.\n2. Keep schema changes additive (`CREATE TABLE IF NOT EXISTS`, new versioned `.sql` files).\n3. Test migrations locally with `--local` before applying `--remote`.',
    18,
    2,
    1,
    '2026-01-12T09:10:00.000Z'
  ),
  (
    'lesson_starter_code_3',
    'course_starter_coding_workers',
    'Verifying Telegram Mini App initData at the Edge',
    '## Zero-Trust Session Issuance\n\nVerify Telegram `initData` on the server using **Web Crypto HMAC-SHA256**:\n\n- Derive the secret key from `"WebAppData"` and `TELEGRAM_BOT_TOKEN`.\n- Sort all fields except `hash` alphabetically.\n- Enforce an `auth_date` freshness window before minting a signed session JWT.',
    20,
    3,
    1,
    '2026-01-12T09:15:00.000Z'
  ),

  -- Course 4: Design (Intermediate)
  (
    'lesson_starter_design_1',
    'course_starter_design_miniapp',
    'Thumb-Zone Ergonomics & Mobile Navigation',
    '## Designing for One-Handed Use\n\nMost Telegram Mini App sessions happen on phones:\n\n- Place primary navigation and main actions within comfortable thumb reach.\n- Keep tap targets at least `44x44px`.\n- Avoid dense multi-column tables on narrow screens.',
    12,
    1,
    1,
    '2026-01-13T09:05:00.000Z'
  ),
  (
    'lesson_starter_design_2',
    'course_starter_design_miniapp',
    'Typography, Contrast & Theme Sync',
    '## Clarity Across Light & Dark Themes\n\nSync surface tokens with Telegram `themeParams` while guaranteeing readable contrast:\n\n- Pair clean display headings with legible body copy.\n- Use subtle 1px borders to separate cards without heavy shadows.\n- Respect `viewportStableHeight` so bottom bars stay visible when keyboards open.',
    14,
    2,
    1,
    '2026-01-13T09:10:00.000Z'
  ),
  (
    'lesson_starter_design_3',
    'course_starter_design_miniapp',
    'Clear Empty, Loading & Error States',
    '## Designing Resilient Flows\n\nEvery screen needs intentional states:\n\n- Show concise skeletons or spinners while fetching.\n- Explain empty states with a clear next action.\n- Display friendly, actionable retry messages if a network call fails.',
    13,
    3,
    1,
    '2026-01-13T09:15:00.000Z'
  ),

  -- Course 5: Web3 (Advanced)
  (
    'lesson_starter_web3_1',
    'course_starter_web3_payments',
    'Cryptographic Identities, Keys & Signing',
    '## Public/Private Key Fundamentals\n\nModern Web3 apps rely on asymmetric cryptography:\n\n- Users prove ownership by signing a nonce challenge off-chain.\n- Never store or transmit raw private keys to backend servers.\n- Verify signatures deterministically before granting account access.',
    18,
    1,
    1,
    '2026-01-14T09:05:00.000Z'
  ),
  (
    'lesson_starter_web3_2',
    'course_starter_web3_payments',
    'Stablecoin & Cross-Border Settlement Patterns',
    '## Practical Payment Architecture\n\nDesign payment experiences with clear confirmation states:\n\n1. Display network, fee, and settlement currency upfront.\n2. Track transaction hashes idempotently in your database.\n3. Reconcile confirmations server-side before unlocking paid entitlements.',
    20,
    2,
    1,
    '2026-01-14T09:10:00.000Z'
  ),
  (
    'lesson_starter_web3_3',
    'course_starter_web3_payments',
    'Smart-Contract & Wallet Security Hygiene',
    '## Protecting Users from Common Risks\n\n- Limit token approvals to exact required amounts.\n- Validate contract addresses and chain IDs explicitly.\n- Surface human-readable transaction previews before asking users to sign.',
    16,
    3,
    1,
    '2026-01-14T09:15:00.000Z'
  ),

  -- Course 6: Business (Advanced)
  (
    'lesson_starter_biz_1',
    'course_starter_business_agents',
    'Designing Customer Support & Lead Bots',
    '## High-Leverage Telegram Automation\n\nCombine webhook-driven bots with Workers AI:\n\n- Capture structured inquiries in chat and route complex cases to humans.\n- Store conversation context per user in D1.\n- Track engagement events cleanly without leaking private user messages.',
    15,
    1,
    1,
    '2026-01-15T09:05:00.000Z'
  ),
  (
    'lesson_starter_biz_2',
    'course_starter_business_agents',
    'Idempotent Telegram Stars (XTR) Checkout',
    '## Monetizing Inside Telegram\n\nTelegram Stars (`XTR`) let users subscribe in two taps:\n\n1. Generate an invoice link server-side with `createInvoiceLink`.\n2. Approve `pre_checkout_query` within Telegram timeout limits.\n3. Verify `successful_payment` webhooks idempotently using `telegram_payment_charge_id` before extending `pro_expires_at`.',
    19,
    2,
    1,
    '2026-01-15T09:10:00.000Z'
  ),
  (
    'lesson_starter_biz_3',
    'course_starter_business_agents',
    'Retention Loops, Analytics & Growth',
    '## Sustaining Recurring Value\n\nTrack completion rates, active AI sessions, and renewal timing to focus improvements where learners get measurable value.',
    14,
    3,
    1,
    '2026-01-15T09:15:00.000Z'
  );
