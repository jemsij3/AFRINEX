-- Additive migration 0009: Curated AFRINEX 18-course catalog across 6 categories
-- Safe & non-destructive: uses INSERT OR IGNORE so existing courses, enrollments, and progress remain intact.

INSERT OR IGNORE INTO courses (
  id,
  slug,
  title,
  summary,
  track,
  category,
  is_pro,
  published,
  resources_json,
  created_at
) VALUES
  -- 1. Artificial Intelligence & Automation
  (
    'course_ai_prompting_foundations',
    'ai-prompting-foundations-and-information-retrieval',
    'AI Prompting Foundations & Information Retrieval',
    'Learn structured prompting principles, clear task framing, and reliable information retrieval techniques for everyday AI workflows.',
    'beginner',
    'Artificial Intelligence & Automation',
    0,
    1,
    '[{"title":"AI Prompting Foundations & Information Retrieval","url":"https://www.deeplearning.ai/courses/ai-prompting-for-everyone"}]',
    '2026-11-18T00:00:00.000Z'
  ),
  (
    'course_ai_llm_workflows_openai',
    'building-app-workflows-with-llms-and-openai-api',
    'Building App Workflows with LLMs & OpenAI API',
    'Design practical application workflows powered by large language models, structured outputs, and API-driven prompt pipelines.',
    'intermediate',
    'Artificial Intelligence & Automation',
    0,
    1,
    '[{"title":"Building App Workflows with LLMs & OpenAI API","url":"https://www.deeplearning.ai/courses/chatgpt-prompt-eng"}]',
    '2026-11-18T00:01:00.000Z'
  ),
  (
    'course_ai_multistep_eval_agents',
    'advanced-multi-step-chain-and-evaluation-agents',
    'Advanced Multi-Step Chain & Evaluation Agents',
    'Architect multi-step reasoning chains, moderation checks, and automated evaluation pipelines for production LLM systems.',
    'advanced',
    'Artificial Intelligence & Automation',
    0,
    1,
    '[{"title":"Advanced Multi-Step Chain & Evaluation Agents","url":"https://www.deeplearning.ai/courses/building-systems-with-chatgpt-api"}]',
    '2026-11-18T00:02:00.000Z'
  ),

  -- 2. Web3 & TON Blockchain
  (
    'course_ton_intro_architecture',
    'introduction-to-ton-gram-history-and-telegram-web3',
    'Introduction to TON, Gram History & Telegram Web3 Architecture',
    'Understand The Open Network (TON) architecture, its Telegram roots, asynchronous sharding, and Web3 Mini App ecosystem.',
    'beginner',
    'Web3 & TON Blockchain',
    0,
    1,
    '[{"title":"Introduction to TON, Gram History & Telegram Web3 Architecture","url":"https://ton.org/en/what-is-ton"}]',
    '2026-11-18T00:03:00.000Z'
  ),
  (
    'course_ton_connect_bots',
    'integrating-ton-connect-sdk-wallets-and-telegram-bots',
    'Integrating TON Connect SDK, Wallets, and Telegram Bots',
    'Connect Telegram bots and Mini Apps to TON wallets securely using TON Connect SDK and official blockchain guidelines.',
    'intermediate',
    'Web3 & TON Blockchain',
    0,
    1,
    '[{"title":"Integrating TON Connect SDK, Wallets, and Telegram Bots","url":"https://core.telegram.org/bots/blockchain-guidelines"}]',
    '2026-11-18T00:04:00.000Z'
  ),
  (
    'course_ton_blueprint_smart_contracts',
    'writing-smart-contracts-with-blueprint-acton-and-agents',
    'Writing Smart Contracts with Blueprint/Acton & Autonomous Telegram Agents',
    'Build, test, and deploy your first TON smart contracts using Blueprint and connect autonomous Telegram agents on-chain.',
    'advanced',
    'Web3 & TON Blockchain',
    0,
    1,
    '[{"title":"Writing Smart Contracts with Blueprint/Acton & Autonomous Telegram Agents","url":"https://docs.ton.org/contracts/blueprint/first-smart-contract"}]',
    '2026-11-18T00:05:00.000Z'
  ),

  -- 3. Modern Software & Web Development
  (
    'course_dev_js_basics',
    'interactive-javascript-basics-and-problem-solving',
    'Interactive JavaScript Basics & Problem Solving',
    'Master core JavaScript syntax, data structures, functional patterns, and algorithmic problem solving through hands-on exercises.',
    'beginner',
    'Modern Software & Web Development',
    0,
    1,
    '[{"title":"Interactive JavaScript Basics & Problem Solving","url":"https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/"}]',
    '2026-11-18T00:06:00.000Z'
  ),
  (
    'course_dev_react_ui',
    'building-modern-component-based-uis-with-react',
    'Building Modern Component-Based UIs with React',
    'Learn modern React components, state management, effects, and responsive UI composition straight from the official React curriculum.',
    'intermediate',
    'Modern Software & Web Development',
    0,
    1,
    '[{"title":"Building Modern Component-Based UIs with React","url":"https://react.dev/learn"}]',
    '2026-11-18T00:07:00.000Z'
  ),
  (
    'course_dev_fullstack_graphql',
    'modern-web-applications-with-react-nodejs-and-graphql',
    'Modern Web Applications with React, Node.js, and GraphQL',
    'Build full-stack production web applications covering React frontends, Node.js APIs, TypeScript, testing, and GraphQL.',
    'advanced',
    'Modern Software & Web Development',
    0,
    1,
    '[{"title":"Modern Web Applications with React, Node.js, and GraphQL","url":"https://fullstackopen.com/en/"}]',
    '2026-11-18T00:08:00.000Z'
  ),

  -- 4. Digital Freelancing & Remote Careers
  (
    'course_career_personal_brand',
    'building-your-personal-professional-brand-online',
    'Building Your Personal Professional Brand Online',
    'Position your digital skills, portfolio, and inbound marketing presence to attract global clients and remote career opportunities.',
    'beginner',
    'Digital Freelancing & Remote Careers',
    0,
    1,
    '[{"title":"Building Your Personal Professional Brand Online","url":"https://academy.hubspot.com/"}]',
    '2026-11-18T00:09:00.000Z'
  ),
  (
    'course_career_winning_proposals',
    'crafting-winning-proposals-and-client-communication',
    'Crafting Winning Proposals & Client Communication',
    'Write tailored client proposals, scope milestones clearly, and manage freelance client relationships for repeat contracts.',
    'intermediate',
    'Digital Freelancing & Remote Careers',
    0,
    1,
    '[{"title":"Crafting Winning Proposals & Client Communication","url":"https://www.upwork.com/resources/academy"}]',
    '2026-11-18T00:10:00.000Z'
  ),
  (
    'course_career_scaling_remote',
    'scaling-as-an-independent-global-remote-professional',
    'Scaling as an Independent Global Remote Professional',
    'Adopt asynchronous collaboration, handbook-first documentation, and distributed engineering/consulting practices used by top remote teams.',
    'advanced',
    'Digital Freelancing & Remote Careers',
    0,
    1,
    '[{"title":"Scaling as an Independent Global Remote Professional","url":"https://about.gitlab.com/company/culture/all-remote/guide/"}]',
    '2026-11-18T00:11:00.000Z'
  ),

  -- 5. Digital Business & E-Commerce
  (
    'course_biz_digital_storefront',
    'fundamentals-of-setting-up-a-digital-storefront',
    'Fundamentals of Setting Up a Digital Storefront',
    'Learn e-commerce fundamentals from product positioning and storefront structure to checkout conversion and fulfillment.',
    'beginner',
    'Digital Business & E-Commerce',
    0,
    1,
    '[{"title":"Fundamentals of Setting Up a Digital Storefront","url":"https://www.shopify.com/blog/ecommerce-fundamentals"}]',
    '2026-11-18T00:12:00.000Z'
  ),
  (
    'course_biz_social_performance_ads',
    'social-media-growth-and-targeted-performance-ads',
    'Social Media Growth & Targeted Performance Ads',
    'Plan audience targeting, creative testing, and measurable performance ad campaigns to grow digital storefronts.',
    'intermediate',
    'Digital Business & E-Commerce',
    0,
    1,
    '[{"title":"Social Media Growth & Targeted Performance Ads","url":"https://www.facebook.com/business/learn"}]',
    '2026-11-18T00:13:00.000Z'
  ),
  (
    'course_biz_crossborder_payments',
    'implementing-cross-border-payment-infrastructures',
    'Implementing Cross-Border Payment Infrastructures',
    'Integrate secure, global checkout sessions, multi-currency payments, and reliable webhook fulfillment into digital businesses.',
    'advanced',
    'Digital Business & E-Commerce',
    0,
    1,
    '[{"title":"Implementing Cross-Border Payment Infrastructures","url":"https://docs.stripe.com/payments/checkout"}]',
    '2026-11-18T00:14:00.000Z'
  ),

  -- 6. Essential Tech Skills & Productivity
  (
    'course_tech_git_github_basics',
    'git-and-github-basics-for-version-control',
    'Git & GitHub Basics for Version Control',
    'Master repositories, commits, branching, pull requests, and collaborative Git workflows using interactive GitHub exercises.',
    'beginner',
    'Essential Tech Skills & Productivity',
    0,
    1,
    '[{"title":"Git & GitHub Basics for Version Control","url":"https://skills.github.com/"}]',
    '2026-11-18T00:15:00.000Z'
  ),
  (
    'course_tech_cli_power_tools',
    'command-line-power-tools-scripting-and-env-setup',
    'Command Line Power Tools, Scripting & Environment Setup',
    'Level up developer productivity with shell scripting, command-line text processing, SSH, debugging, and environment tooling.',
    'intermediate',
    'Essential Tech Skills & Productivity',
    0,
    1,
    '[{"title":"Command Line Power Tools, Scripting & Environment Setup","url":"https://missing.csail.mit.edu/"}]',
    '2026-11-18T00:16:00.000Z'
  ),
  (
    'course_tech_edge_serverless_workers',
    'building-edge-native-serverless-web-applications',
    'Building Edge-Native Serverless Web Applications',
    'Build and deploy low-latency full-stack applications on Cloudflare Workers, D1, and edge bindings.',
    'advanced',
    'Essential Tech Skills & Productivity',
    0,
    1,
    '[{"title":"Building Edge-Native Serverless Web Applications","url":"https://developers.cloudflare.com/workers/"}]',
    '2026-11-18T00:17:00.000Z'
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
  (
    'lesson_ai_prompting_foundations_1',
    'course_ai_prompting_foundations',
    'Structured Prompting & Information Retrieval',
    '## Overview

Build repeatable prompts using clear role framing, task constraints, and source verification.

### Core Takeaways
- Separate system instructions, context, and output format.
- Ask for verifiable citations or structured lists when retrieving information.
- Iterate on edge cases before automating.

### Course Link
Use the **Course Resources** link above: https://www.deeplearning.ai/courses/ai-prompting-for-everyone',
    15,
    1,
    1,
    '2026-11-18T00:00:00.000Z'
  ),
  (
    'lesson_ai_llm_workflows_openai_1',
    'course_ai_llm_workflows_openai',
    'LLM Prompt Engineering for Developers',
    '## Overview

Translate natural-language prompts into dependable software workflows using API calls and structured JSON responses.

### Core Takeaways
- Use delimiters and explicit schemas for deterministic parsing.
- Chain summarization, classification, and transformation steps.
- Handle invalid outputs with validation and retries.

### Course Link
Use the **Course Resources** link above: https://www.deeplearning.ai/courses/chatgpt-prompt-eng',
    20,
    1,
    1,
    '2026-11-18T00:01:00.000Z'
  ),
  (
    'lesson_ai_multistep_eval_agents_1',
    'course_ai_multistep_eval_agents',
    'Multi-Step Chains & Automated Evaluations',
    '## Overview

Move from single prompts to resilient multi-step agent pipelines backed by systematic quality evaluation.

### Core Takeaways
- Decompose complex tasks into testable sub-prompts.
- Apply input classification and output moderation guardrails.
- Score responses against rubric-based evaluation sets.

### Course Link
Use the **Course Resources** link above: https://www.deeplearning.ai/courses/building-systems-with-chatgpt-api',
    25,
    1,
    1,
    '2026-11-18T00:02:00.000Z'
  ),
  (
    'lesson_ton_intro_architecture_1',
    'course_ton_intro_architecture',
    'TON Architecture & Telegram Web3 Basics',
    '## Overview

Explore how TON scales through dynamic sharding, actor-model smart contracts, and native integration with Telegram.

### Core Takeaways
- Origin from Telegram Open Network (Gram) to community-driven TON.
- Masterchain vs. workchains and shardchains.
- How Telegram Mini Apps bridge everyday users to Web3.

### Course Link
Use the **Course Resources** link above: https://ton.org/en/what-is-ton',
    15,
    1,
    1,
    '2026-11-18T00:03:00.000Z'
  ),
  (
    'lesson_ton_connect_bots_1',
    'course_ton_connect_bots',
    'TON Connect & Bot Blockchain Guidelines',
    '## Overview

Implement compliant wallet connections, transaction signing requests, and user verification inside Telegram bots and Mini Apps.

### Core Takeaways
- Follow Telegram bot blockchain integration guidelines.
- Verify wallet proof signatures on your backend.
- Keep private keys strictly client-side in user wallets.

### Course Link
Use the **Course Resources** link above: https://core.telegram.org/bots/blockchain-guidelines',
    20,
    1,
    1,
    '2026-11-18T00:04:00.000Z'
  ),
  (
    'lesson_ton_blueprint_smart_contracts_1',
    'course_ton_blueprint_smart_contracts',
    'First TON Smart Contract with Blueprint',
    '## Overview

Scaffold, compile, unit-test, and deploy TON smart contracts with Blueprint while automating contract interactions via Telegram.

### Core Takeaways
- Project structure, sandbox testing, and deployment scripts in Blueprint.
- Asynchronous message passing between contracts on TON.
- Event-driven notifications to Telegram bots.

### Course Link
Use the **Course Resources** link above: https://docs.ton.org/contracts/blueprint/first-smart-contract',
    25,
    1,
    1,
    '2026-11-18T00:05:00.000Z'
  ),
  (
    'lesson_dev_js_basics_1',
    'course_dev_js_basics',
    'JavaScript Core Syntax & Algorithms',
    '## Overview

Build strong programming fundamentals with JavaScript variables, arrays, objects, recursion, and algorithm challenges.

### Core Takeaways
- Master ES6+ syntax, array methods, and clean functions.
- Solve algorithmic problems step-by-step.
- Prepare for TypeScript and modern frontend frameworks.

### Course Link
Use the **Course Resources** link above: https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/',
    20,
    1,
    1,
    '2026-11-18T00:06:00.000Z'
  ),
  (
    'lesson_dev_react_ui_1',
    'course_dev_react_ui',
    'Thinking in React & Managing State',
    '## Overview

Design modular, accessible React interfaces with predictable state and clean data flow.

### Core Takeaways
- Break screens into reusable components.
- Manage local and lifted state cleanly with hooks.
- Avoid unnecessary effects and keep rendering pure.

### Course Link
Use the **Course Resources** link above: https://react.dev/learn',
    20,
    1,
    1,
    '2026-11-18T00:07:00.000Z'
  ),
  (
    'lesson_dev_fullstack_graphql_1',
    'course_dev_fullstack_graphql',
    'Full-Stack Architecture with React, Node & GraphQL',
    '## Overview

Connect modern single-page apps to tested backend APIs, GraphQL schemas, and CI/CD pipelines.

### Core Takeaways
- Structure REST and GraphQL endpoints with authentication.
- Write automated integration and end-to-end tests.
- Containerize and deploy full-stack services reliably.

### Course Link
Use the **Course Resources** link above: https://fullstackopen.com/en/',
    30,
    1,
    1,
    '2026-11-18T00:08:00.000Z'
  ),
  (
    'lesson_career_personal_brand_1',
    'course_career_personal_brand',
    'Positioning & Inbound Personal Branding',
    '## Overview

Stand out in global digital markets with clear positioning, case studies, and trustworthy online channels.

### Core Takeaways
- Define a focused niche and measurable value proposition.
- Publish proof-of-work portfolio summaries.
- Build inbound discovery through consistent content.

### Course Link
Use the **Course Resources** link above: https://academy.hubspot.com/',
    15,
    1,
    1,
    '2026-11-18T00:09:00.000Z'
  ),
  (
    'lesson_career_winning_proposals_1',
    'course_career_winning_proposals',
    'High-Converting Proposals & Milestone Scoping',
    '## Overview

Win remote contracts by diagnosing client problems quickly and proposing transparent deliverables.

### Core Takeaways
- Lead proposals with the client outcome, not generic templates.
- Break projects into clear milestones and acceptance criteria.
- Communicate proactively to prevent scope creep.

### Course Link
Use the **Course Resources** link above: https://www.upwork.com/resources/academy',
    18,
    1,
    1,
    '2026-11-18T00:10:00.000Z'
  ),
  (
    'lesson_career_scaling_remote_1',
    'course_career_scaling_remote',
    'Async Collaboration & Scaling Remote Operations',
    '## Overview

Operate seamlessly across time zones using async-first communication, clear written workflows, and scalable delivery habits.

### Core Takeaways
- Replace unnecessary meetings with written proposals and async updates.
- Maintain single-source-of-truth project documentation.
- Build sustainable boundaries and predictable delivery SLAs.

### Course Link
Use the **Course Resources** link above: https://about.gitlab.com/company/culture/all-remote/guide/',
    22,
    1,
    1,
    '2026-11-18T00:11:00.000Z'
  ),
  (
    'lesson_biz_digital_storefront_1',
    'course_biz_digital_storefront',
    'Storefront Architecture & Product Launch Basics',
    '## Overview

Launch an online storefront built for trust, mobile speed, and clear product storytelling.

### Core Takeaways
- Structure product pages with clear benefits, pricing, and FAQs.
- Simplify mobile navigation and checkout steps.
- Track conversion metrics from day one.

### Course Link
Use the **Course Resources** link above: https://www.shopify.com/blog/ecommerce-fundamentals',
    15,
    1,
    1,
    '2026-11-18T00:12:00.000Z'
  ),
  (
    'lesson_biz_social_performance_ads_1',
    'course_biz_social_performance_ads',
    'Performance Marketing & Campaign Measurement',
    '## Overview

Acquire customers profitably by pairing audience segmentation with disciplined A/B creative testing.

### Core Takeaways
- Match campaign objectives to funnel stages.
- Measure ROAS, CAC, and conversion events accurately.
- Refresh ad creatives before audience fatigue sets in.

### Course Link
Use the **Course Resources** link above: https://www.facebook.com/business/learn',
    20,
    1,
    1,
    '2026-11-18T00:13:00.000Z'
  ),
  (
    'lesson_biz_crossborder_payments_1',
    'course_biz_crossborder_payments',
    'Global Checkout Flows & Webhook Fulfillment',
    '## Overview

Architect cross-border payment flows with idempotent webhook handling, currency support, and server-side verification.

### Core Takeaways
- Create server-verified checkout sessions rather than trusting client callbacks.
- Fulfill orders idempotently from signed payment webhooks.
- Support regional payment methods and clear receipts.

### Course Link
Use the **Course Resources** link above: https://docs.stripe.com/payments/checkout',
    25,
    1,
    1,
    '2026-11-18T00:14:00.000Z'
  ),
  (
    'lesson_tech_git_github_basics_1',
    'course_tech_git_github_basics',
    'Commits, Branches & Pull Requests',
    '## Overview

Track code safely and collaborate with teams using Git version control and GitHub pull requests.

### Core Takeaways
- Create feature branches, stage clean commits, and resolve merge conflicts.
- Open clear pull requests for review and automated CI checks.
- Protect main branches from accidental overwrites.

### Course Link
Use the **Course Resources** link above: https://skills.github.com/',
    15,
    1,
    1,
    '2026-11-18T00:15:00.000Z'
  ),
  (
    'lesson_tech_cli_power_tools_1',
    'course_tech_cli_power_tools',
    'Shell Mastery, Scripting & Dev Environments',
    '## Overview

Automate repetitive developer tasks and navigate Unix shells confidently.

### Core Takeaways
- Compose pipes, grep/ripgrep, sed/awk, and shell scripts.
- Manage SSH keys, dotfiles, and reproducible dev environments.
- Profile and debug command-line workflows efficiently.

### Course Link
Use the **Course Resources** link above: https://missing.csail.mit.edu/',
    20,
    1,
    1,
    '2026-11-18T00:16:00.000Z'
  ),
  (
    'lesson_tech_edge_serverless_workers_1',
    'course_tech_edge_serverless_workers',
    'Serverless Edge Runtime & Bindings on Workers',
    '## Overview

Run JavaScript/TypeScript backends across Cloudflare''s global edge network with zero cold-start overhead.

### Core Takeaways
- Work with Web Fetch APIs, Wrangler, and environment bindings (D1, AI, Assets).
- Keep secrets isolated on the server via Worker secrets.
- Deploy globally via automated GitHub Actions pipelines.

### Course Link
Use the **Course Resources** link above: https://developers.cloudflare.com/workers/',
    25,
    1,
    1,
    '2026-11-18T00:17:00.000Z'
  );
