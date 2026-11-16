import type { BuilderFile, BuilderSpec, BuilderType } from '../../shared/types.ts';
import { DEFAULT_WORKERS_AI_MODEL } from './workersAi.ts';

function slugifyProjectName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'afrinex-project'
  );
}

function buildStarterFiles(
  builderType: BuilderType,
  name: string,
  prompt: string,
  summary: string
): BuilderFile[] {
  const slug = slugifyProjectName(name);

  if (builderType === 'website') {
    return [
      {
        path: 'index.html',
        language: 'html',
        content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
  </head>
  <body>
    <main style="max-width: 720px; margin: 4rem auto; font-family: system-ui, sans-serif; padding: 0 1rem;">
      <h1>${name}</h1>
      <p>${summary}</p>
    </main>
  </body>
</html>
`,
      },
      {
        path: 'wrangler.toml',
        language: 'toml',
        content: `name = "${slug}"
compatibility_date = "2025-02-01"

[assets]
directory = "./dist"
`,
      },
      {
        path: 'README.md',
        language: 'markdown',
        content: `# ${name}\n\nGenerated via AFRINEX Builder (${builderType}).\n\n## Goal\n${prompt}\n`,
      },
    ];
  }

  const workerEntry =
    builderType === 'telegram_bot'
      ? `import { Hono } from 'hono';

type Env = {
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_WEBHOOK_SECRET: string;
};

const app = new Hono<{ Bindings: Env }>();

app.post('/webhook', async (c) => {
  const secret = c.req.header('X-Telegram-Bot-Api-Secret-Token');
  if (secret !== c.env.TELEGRAM_WEBHOOK_SECRET) {
    return c.json({ error: 'Unauthorized webhook' }, 401);
  }
  const update = await c.req.json();
  // Handle Telegram update payload safely here
  return c.json({ ok: true, receivedUpdateId: update.update_id ?? null });
});

app.get('/health', (c) => c.json({ ok: true, bot: '${slug}' }));

export default app;
`
      : `import { Hono } from 'hono';

type Env = {
  AI?: Ai;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/', (c) =>
  c.json({
    service: '${slug}',
    builderType: '${builderType}',
    summary: ${JSON.stringify(summary)},
  })
);

export default app;
`;

  return [
    {
      path: 'wrangler.toml',
      language: 'toml',
      content: `name = "${slug}"
main = "src/index.ts"
compatibility_date = "2025-02-01"

[ai]
binding = "AI"
`,
    },
    {
      path: 'src/index.ts',
      language: 'typescript',
      content: workerEntry,
    },
    {
      path: 'README.md',
      language: 'markdown',
      content: `# ${name}\n\nBuilder Type: \`${builderType}\`\n\n## Specification\n${summary}\n\n## Original Prompt\n${prompt}\n`,
    },
  ];
}

function buildStarterSpec(
  builderType: BuilderType,
  name: string,
  prompt: string
): { spec: BuilderSpec; files: BuilderFile[] } {
  const defaults: Record<
    BuilderType,
    { capabilities: string[]; envVars: string[]; runtime: 'cloudflare-workers' | 'cloudflare-pages' }
  > = {
    telegram_bot: {
      capabilities: [
        'Webhook signature verification (X-Telegram-Bot-Api-Secret-Token)',
        'Hono edge routing on Cloudflare Workers',
        'Stateless Bot API command dispatch',
      ],
      envVars: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_WEBHOOK_SECRET'],
      runtime: 'cloudflare-workers',
    },
    ai_agent: {
      capabilities: [
        'Cloudflare Workers AI reasoning loop',
        'Structured JSON tool execution contract',
        'D1 task memory persistence',
      ],
      envVars: ['AI_MODEL'],
      runtime: 'cloudflare-workers',
    },
    website: {
      capabilities: [
        'Mobile-first responsive layout',
        'Cloudflare Static Assets edge delivery',
      ],
      envVars: [],
      runtime: 'cloudflare-pages',
    },
    mini_app: {
      capabilities: [
        'Telegram WebApp SDK lifecycle & theme sync',
        'HMAC-SHA256 initData verification endpoint',
        'Hono Worker + Static Assets bundle',
      ],
      envVars: ['TELEGRAM_BOT_TOKEN', 'JWT_SECRET'],
      runtime: 'cloudflare-workers',
    },
    workflow: {
      capabilities: [
        'Webhook-triggered edge automation pipeline',
        'Idempotent D1 step logging',
      ],
      envVars: ['WEBHOOK_SIGNING_SECRET'],
      runtime: 'cloudflare-workers',
    },
  };

  const config = defaults[builderType];
  const summary = `Cloudflare ${builderType.replace('_', ' ')} blueprint for "${name}": ${prompt.slice(0, 180)}`;

  return {
    spec: {
      architectureSummary: summary,
      targetRuntime: config.runtime,
      capabilities: config.capabilities,
      envVarsNeeded: config.envVars,
      generationMode: 'starter_scaffold',
    },
    files: buildStarterFiles(builderType, name, prompt, summary),
  };
}

export async function generateModularBuilderProject(
  ai: Ai | undefined,
  configuredModel: string | undefined,
  builderType: BuilderType,
  name: string,
  prompt: string,
  environment = 'production'
): Promise<{ spec: BuilderSpec; files: BuilderFile[] }> {
  const fallback = buildStarterSpec(builderType, name, prompt);
  const isDev = environment === 'development';

  if (!ai) {
    if (isDev) {
      return fallback;
    }
    throw new Error('Cloudflare Workers AI binding (AI) is not attached.');
  }

  try {
    const model = (configuredModel || DEFAULT_WORKERS_AI_MODEL) as keyof AiModels;
    const systemPrompt =
      'You are the AFRINEX Cloudflare Architect. Return strictly valid JSON with keys: "architectureSummary" (string, <= 240 chars), "capabilities" (array of 3-5 short strings), and "envVarsNeeded" (array of environment variable names). Do not include markdown fences.';

    const output = (await ai.run(model, {
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Project Name: ${name}\nBuilder Type: ${builderType}\nRequirements: ${prompt}`,
        },
      ],
      max_tokens: 512,
      temperature: 0.2,
    } as AiTextGenerationInput)) as {
      response?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };

    const raw =
      output?.response?.trim() || output?.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return fallback;
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      architectureSummary?: string;
      capabilities?: string[];
      envVarsNeeded?: string[];
    };

    const summary =
      typeof parsed.architectureSummary === 'string' && parsed.architectureSummary.trim()
        ? parsed.architectureSummary.trim()
        : fallback.spec.architectureSummary;

    const capabilities =
      Array.isArray(parsed.capabilities) && parsed.capabilities.length > 0
        ? parsed.capabilities.slice(0, 6).map(String)
        : fallback.spec.capabilities;

    const envVarsNeeded = Array.isArray(parsed.envVarsNeeded)
      ? parsed.envVarsNeeded.slice(0, 8).map(String)
      : fallback.spec.envVarsNeeded;

    return {
      spec: {
        architectureSummary: summary,
        targetRuntime: fallback.spec.targetRuntime,
        capabilities,
        envVarsNeeded,
        generationMode: 'workers_ai',
      },
      files: buildStarterFiles(builderType, name, prompt, summary),
    };
  } catch (err) {
    if (isDev) {
      // Returns starter scaffold only when local Workers AI remote auth is unavailable in dev
      return fallback;
    }
    throw err instanceof Error ? err : new Error('Workers AI builder generation failed');
  }
}
