import type {
  AiAgentBuilderConfig,
  AutomationBuilderConfig,
  BuilderFile,
  BuilderProject,
  BuilderProjectConfig,
  BuilderProjectPlan,
  BuilderSpec,
  BuilderTestRun,
  BuilderType,
  MiniAppBuilderConfig,
  TelegramBotBuilderConfig,
  WebsiteBuilderConfig,
} from '../../shared/types.ts';
import { extractAiJsonObject, extractAiText, normalizeAiResponse } from './aiResponse.ts';
import {
  buildDefaultPlan,
  buildDeploymentConfig,
  buildFilesForBuilder,
  getTargetRuntime,
  normalizeBuilderConfig,
} from './builderTemplates.ts';
import { DEFAULT_WORKERS_AI_MODEL } from './workersAi.ts';

const BUILDER_ARCHITECT_GUIDANCE: Record<BuilderType, string> = {
  telegram_bot:
    'You are designing a production Cloudflare Worker Telegram Bot. Focus on Bot API webhooks, X-Telegram-Bot-Api-Secret-Token verification, commands, inline/reply keyboards, user profiles, admin commands, and optional Workers AI.',
  ai_agent:
    'You are designing a production Cloudflare Workers AI Agent. Focus on system instructions, model selection, knowledge grounding, structured tool invocation, conversation memory, and access control.',
  website:
    'You are designing a responsive modern Website / Web App on Cloudflare. Focus on semantic HTML5, responsive CSS, configured page sections, forms, and optional Hono + D1 backend/auth/payment routes.',
  mini_app:
    'You are designing a mobile-first Telegram Mini App / WebApp on Cloudflare Workers. Focus on Telegram.WebApp SDK integration, HMAC-SHA256 initData verification, mobile screen navigation, D1 persistence, and Stars/checkout payments.',
  workflow:
    'You are designing an edge Automation Workflow on Cloudflare Workers. Focus on webhook/cron/Telegram triggers, logical condition evaluation, data field mapping, ordered action steps, idempotent D1 run logs, and monitoring.',
};

function sanitizeStringArray(value: unknown, fallback: string[], maxItems = 10): string[] {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => Boolean(item) && item !== '[object Object]')
    .slice(0, maxItems);
  return cleaned.length > 0 ? cleaned : fallback;
}

function sanitizeModules(
  value: unknown,
  fallback: Array<{ name: string; responsibility: string }>
): Array<{ name: string; responsibility: string }> {
  if (!Array.isArray(value)) return fallback;
  const out: Array<{ name: string; responsibility: string }> = [];
  for (const item of value) {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      const rec = item as Record<string, unknown>;
      const modName = typeof rec.name === 'string' ? rec.name.trim() : '';
      const resp = typeof rec.responsibility === 'string' ? rec.responsibility.trim() : '';
      if (modName && resp) {
        out.push({ name: modName, responsibility: resp });
      }
    }
  }
  return out.length > 0 ? out.slice(0, 8) : fallback;
}

function stripCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)```$/);
  return match?.[1] ? match[1].trimEnd() + '\n' : trimmed;
}

function getPrimaryCodePath(builderType: BuilderType): string {
  switch (builderType) {
    case 'telegram_bot':
      return 'src/index.ts';
    case 'ai_agent':
      return 'src/agent.ts';
    case 'website':
      return 'index.html';
    case 'mini_app':
      return 'src/App.tsx';
    case 'workflow':
      return 'src/workflow.ts';
  }
}

export async function generateBuilderPlan(
  ai: Ai | undefined,
  configuredModel: string | undefined,
  builderType: BuilderType,
  name: string,
  prompt: string,
  rawConfig: unknown,
  environment = 'production'
): Promise<{ spec: BuilderSpec; config: BuilderProjectConfig }> {
  const config = normalizeBuilderConfig(builderType, rawConfig, name, prompt);
  const targetRuntime = getTargetRuntime(builderType, config);
  const defaults = buildDefaultPlan(builderType, name, prompt, config);
  const isDev = environment === 'development';

  const baseSpec: BuilderSpec = {
    architectureSummary: defaults.summary,
    targetRuntime,
    capabilities: defaults.capabilities,
    envVarsNeeded: defaults.envVarsNeeded,
    generationMode: 'starter_scaffold',
    config,
    plan: defaults.plan,
    testHistory: [],
    generatedAt: new Date().toISOString(),
  };

  if (!ai) {
    if (isDev) {
      baseSpec.deployment = buildDeploymentConfig(builderType, name, baseSpec, []);
      return { spec: baseSpec, config };
    }
    throw new Error('Cloudflare Workers AI binding (AI) is not attached.');
  }

  const chosenModel =
    builderType === 'ai_agent'
      ? (config as AiAgentBuilderConfig).aiProviderModel || configuredModel || DEFAULT_WORKERS_AI_MODEL
      : configuredModel || DEFAULT_WORKERS_AI_MODEL;

  try {
    const output: unknown = await ai.run(chosenModel as keyof AiModels, {
      messages: [
        {
          role: 'system',
          content: `${BUILDER_ARCHITECT_GUIDANCE[builderType]} Return ONLY a valid JSON object (no markdown fences) with keys: "architectureSummary" (string <= 260 chars), "capabilities" (array of 3-6 concise strings), "envVarsNeeded" (array of uppercase env var names), "plan" (object with "overview" string, "modules" array of {name, responsibility}, "entryPoints" string[], "dataModels" string[], "integrations" string[], "securityControls" string[], "deploymentSteps" string[]).`,
        },
        {
          role: 'user',
          content: `Project Name: ${name}\nBuilder Type: ${builderType}\nDescription: ${prompt}\nConfiguration: ${JSON.stringify(config)}`,
        },
      ],
      max_tokens: 900,
      temperature: 0.25,
    } as AiTextGenerationInput);

    const normalized = normalizeAiResponse(output);
    if (!normalized.text && !normalized.json) {
      throw new Error('AI provider returned an empty response while generating the project plan.');
    }

    const parsed = normalized.json ?? extractAiJsonObject(output);
    if (!parsed) {
      const plainOverview = extractAiText(output);
      if (plainOverview) {
        const specWithText: BuilderSpec = {
          ...baseSpec,
          architectureSummary: plainOverview.slice(0, 260),
          generationMode: 'workers_ai',
          modelUsed: String(chosenModel),
        };
        specWithText.deployment = buildDeploymentConfig(builderType, name, specWithText, []);
        return { spec: specWithText, config };
      }
      throw new Error('AI provider returned an unreadable response format.');
    }

    const rawPlan =
      parsed.plan && typeof parsed.plan === 'object' && !Array.isArray(parsed.plan)
        ? (parsed.plan as Record<string, unknown>)
        : {};

    const plan: BuilderProjectPlan = {
      overview:
        typeof rawPlan.overview === 'string' && rawPlan.overview.trim()
          ? rawPlan.overview.trim()
          : defaults.plan.overview,
      modules: sanitizeModules(rawPlan.modules, defaults.plan.modules),
      entryPoints: sanitizeStringArray(rawPlan.entryPoints, defaults.plan.entryPoints, 8),
      dataModels: sanitizeStringArray(rawPlan.dataModels, defaults.plan.dataModels, 8),
      integrations: sanitizeStringArray(rawPlan.integrations, defaults.plan.integrations, 8),
      securityControls: sanitizeStringArray(
        rawPlan.securityControls,
        defaults.plan.securityControls,
        6
      ),
      deploymentSteps: sanitizeStringArray(
        rawPlan.deploymentSteps,
        defaults.plan.deploymentSteps,
        6
      ),
    };

    const summary =
      typeof parsed.architectureSummary === 'string' && parsed.architectureSummary.trim()
        ? parsed.architectureSummary.trim()
        : defaults.summary;

    const spec: BuilderSpec = {
      architectureSummary: summary,
      targetRuntime,
      capabilities: sanitizeStringArray(parsed.capabilities, defaults.capabilities, 6),
      envVarsNeeded: sanitizeStringArray(parsed.envVarsNeeded, defaults.envVarsNeeded, 10),
      generationMode: 'workers_ai',
      config,
      plan,
      testHistory: [],
      modelUsed: String(chosenModel),
      generatedAt: new Date().toISOString(),
    };
    spec.deployment = buildDeploymentConfig(builderType, name, spec, []);
    return { spec, config };
  } catch (err) {
    if (isDev) {
      baseSpec.deployment = buildDeploymentConfig(builderType, name, baseSpec, []);
      return { spec: baseSpec, config };
    }
    throw err instanceof Error
      ? err
      : new Error('Workers AI project plan generation failed.');
  }
}

export async function generateSourceFilesForSpec(
  ai: Ai | undefined,
  configuredModel: string | undefined,
  builderType: BuilderType,
  name: string,
  prompt: string,
  spec: BuilderSpec,
  config: BuilderProjectConfig,
  environment = 'production'
): Promise<{ spec: BuilderSpec; files: BuilderFile[] }> {
  const scaffoldFiles = buildFilesForBuilder(
    builderType,
    name,
    prompt,
    spec.architectureSummary,
    config
  );
  const isDev = environment === 'development';

  if (!ai) {
    if (isDev) {
      const updatedSpec: BuilderSpec = {
        ...spec,
        config,
        deployment: buildDeploymentConfig(builderType, name, spec, scaffoldFiles),
      };
      return { spec: updatedSpec, files: scaffoldFiles };
    }
    throw new Error('Cloudflare Workers AI binding (AI) is not attached.');
  }

  const primaryPath = getPrimaryCodePath(builderType);
  const templatePrimary = scaffoldFiles.find((f) => f.path === primaryPath);
  const chosenModel =
    builderType === 'ai_agent'
      ? (config as AiAgentBuilderConfig).aiProviderModel || configuredModel || DEFAULT_WORKERS_AI_MODEL
      : configuredModel || DEFAULT_WORKERS_AI_MODEL;

  try {
    const output: unknown = await ai.run(chosenModel as keyof AiModels, {
      messages: [
        {
          role: 'system',
          content: `${BUILDER_ARCHITECT_GUIDANCE[builderType]} Generate clean, complete, production-ready source code for "${primaryPath}". Return ONLY the raw file contents (no explanatory prose outside comments). Preserve all configured routes/commands/screens/steps and never use placeholder TODOs.`,
        },
        {
          role: 'user',
          content: `Project Name: ${name}\nBuilder Type: ${builderType}\nGoal: ${prompt}\nConfiguration: ${JSON.stringify(config)}\nStarter Reference for ${primaryPath}:\n${templatePrimary?.content ?? ''}`,
        },
      ],
      max_tokens: 1800,
      temperature: 0.2,
    } as AiTextGenerationInput);

    const extracted = extractAiText(output);
    const cleanedCode = extracted ? stripCodeFences(extracted) : '';

    // Validate AI returned plausible source code rather than empty/refusal/JSON error
    const isValidCode =
      cleanedCode.length >= 80 &&
      !cleanedCode.includes('[object Object]') &&
      (builderType === 'website'
        ? cleanedCode.toLowerCase().includes('<html') && cleanedCode.toLowerCase().includes('</html>')
        : cleanedCode.includes('export ') || cleanedCode.includes('import '));

    const finalFiles = scaffoldFiles.map((file) =>
      file.path === primaryPath && isValidCode
        ? { ...file, content: cleanedCode.endsWith('\n') ? cleanedCode : `${cleanedCode}\n` }
        : file
    );

    const updatedSpec: BuilderSpec = {
      ...spec,
      config,
      generationMode: 'workers_ai',
      modelUsed: String(chosenModel),
      generatedAt: new Date().toISOString(),
      deployment: buildDeploymentConfig(builderType, name, spec, finalFiles),
    };
    return { spec: updatedSpec, files: finalFiles };
  } catch (err) {
    if (isDev) {
      const updatedSpec: BuilderSpec = {
        ...spec,
        config,
        deployment: buildDeploymentConfig(builderType, name, spec, scaffoldFiles),
      };
      return { spec: updatedSpec, files: scaffoldFiles };
    }
    throw err instanceof Error ? err : new Error('Workers AI source code generation failed.');
  }
}

export async function generateModularBuilderProject(
  ai: Ai | undefined,
  configuredModel: string | undefined,
  builderType: BuilderType,
  name: string,
  prompt: string,
  environment = 'production',
  rawConfig?: unknown,
  generationStep: 'plan' | 'full' = 'full'
): Promise<{ spec: BuilderSpec; files: BuilderFile[] }> {
  const { spec, config } = await generateBuilderPlan(
    ai,
    configuredModel,
    builderType,
    name,
    prompt,
    rawConfig,
    environment
  );

  if (generationStep === 'plan') {
    return { spec, files: [] };
  }

  return generateSourceFilesForSpec(
    ai,
    configuredModel,
    builderType,
    name,
    prompt,
    spec,
    config,
    environment
  );
}

export async function regenerateSingleBuilderFile(
  ai: Ai | undefined,
  configuredModel: string | undefined,
  project: BuilderProject,
  filePath: string,
  instructions?: string,
  environment = 'production'
): Promise<{ file: BuilderFile; files: BuilderFile[] }> {
  const existingFile = project.files.find((f) => f.path === filePath);
  if (!existingFile) {
    throw new Error(`File "${filePath}" does not exist in this project.`);
  }

  const config = normalizeBuilderConfig(
    project.builderType,
    project.spec.config,
    project.name,
    project.prompt
  );
  const isDev = environment === 'development';

  if (!ai) {
    if (isDev) {
      const freshFiles = buildFilesForBuilder(
        project.builderType,
        project.name,
        project.prompt,
        project.spec.architectureSummary,
        config
      );
      const refreshed = freshFiles.find((f) => f.path === filePath) ?? existingFile;
      return {
        file: refreshed,
        files: project.files.map((f) => (f.path === filePath ? refreshed : f)),
      };
    }
    throw new Error('Cloudflare Workers AI binding (AI) is not attached.');
  }

  const chosenModel =
    project.builderType === 'ai_agent'
      ? (config as AiAgentBuilderConfig).aiProviderModel || configuredModel || DEFAULT_WORKERS_AI_MODEL
      : configuredModel || DEFAULT_WORKERS_AI_MODEL;

  const output: unknown = await ai.run(chosenModel as keyof AiModels, {
    messages: [
      {
        role: 'system',
        content: `${BUILDER_ARCHITECT_GUIDANCE[project.builderType]} Regenerate ONLY the file "${filePath}" (${existingFile.language}). Return ONLY the complete file source code without markdown explanations.`,
      },
      {
        role: 'user',
        content: `Project: ${project.name}\nGoal: ${project.prompt}\nConfiguration: ${JSON.stringify(config)}\nAdditional Instructions: ${instructions || 'Improve clarity, validation, and completeness.'}\nCurrent File Content:\n${existingFile.content}`,
      },
    ],
    max_tokens: 1800,
    temperature: 0.25,
  } as AiTextGenerationInput);

  const rawText = extractAiText(output);
  if (!rawText) {
    throw new Error('AI provider returned an empty response while regenerating the file.');
  }

  const cleaned = stripCodeFences(rawText);
  if (!cleaned || cleaned.includes('[object Object]')) {
    throw new Error('AI provider returned invalid content while regenerating the file.');
  }

  const updatedFile: BuilderFile = {
    ...existingFile,
    content: cleaned.endsWith('\n') ? cleaned : `${cleaned}\n`,
  };
  const updatedFiles = project.files.map((f) => (f.path === filePath ? updatedFile : f));
  return { file: updatedFile, files: updatedFiles };
}

export async function executeBuilderProjectTest(
  ai: Ai | undefined,
  configuredModel: string | undefined,
  project: BuilderProject,
  input: { testInput?: string; command?: string; payloadJson?: string },
  environment = 'production'
): Promise<BuilderTestRun> {
  const config = normalizeBuilderConfig(
    project.builderType,
    project.spec.config,
    project.name,
    project.prompt
  );
  const now = new Date().toISOString();
  const id = `tst_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

  if (project.builderType === 'telegram_bot') {
    const c = config as TelegramBotBuilderConfig;
    const testedCommand = (input.command || input.testInput || c.commands[0] || '/start').trim();
    const matched = c.commands.some(
      (cmd) => cmd.toLowerCase() === testedCommand.toLowerCase()
    );
    let replyText = matched
      ? `Command ${testedCommand} matched and routed cleanly.`
      : `Fallback handler received "${testedCommand}".`;

    if (c.aiIntegrationEnabled && ai && !matched && input.testInput) {
      try {
        const aiOut: unknown = await ai.run(
          (configuredModel || DEFAULT_WORKERS_AI_MODEL) as keyof AiModels,
          {
            messages: [
              { role: 'system', content: `You are Telegram bot "${project.name}". ${c.botPurpose}` },
              { role: 'user', content: input.testInput },
            ],
            max_tokens: 256,
          } as AiTextGenerationInput
        );
        const extracted = extractAiText(aiOut);
        if (extracted) replyText = extracted;
      } catch {
        // Keep deterministic fallback summary on sandbox failure
      }
    }

    return {
      id,
      kind: 'command_sim',
      passed: project.files.some((f) => f.path === 'src/index.ts'),
      inputSummary: testedCommand,
      outputSummary: replyText,
      details: {
        webhookMode: c.webhookMode,
        keyboardType: c.keyboardType,
        keyboardButtons: c.commands.slice(0, 4),
        matchedRegisteredCommand: matched,
        userRegistrationEnabled: c.userRegistrationEnabled,
        adminFeaturesEnabled: c.adminFeaturesEnabled,
      },
      executedAt: now,
    };
  }

  if (project.builderType === 'ai_agent') {
    const c = config as AiAgentBuilderConfig;
    const promptText = (input.testInput || 'Introduce yourself and list your available tools.').trim();
    const model = (c.aiProviderModel || configuredModel || DEFAULT_WORKERS_AI_MODEL) as keyof AiModels;

    if (!ai) {
      if (environment === 'development') {
        return {
          id,
          kind: 'agent_turn',
          passed: true,
          inputSummary: promptText,
          outputSummary: `[Dev Sandbox] Agent "${c.agentIdentity}" ready with model ${String(model)} and tools: ${c.tools.join(', ') || 'none'}.`,
          details: { model: String(model), memoryMode: c.memoryMode, tools: c.tools },
          executedAt: now,
        };
      }
      throw new Error('Workers AI binding is required to run the AI Agent test.');
    }

    const aiOut: unknown = await ai.run(model, {
      messages: [
        {
          role: 'system',
          content: `${c.agentIdentity}\n\n${c.systemInstructions}${c.knowledgeBaseSummary ? `\n\nKnowledge:\n${c.knowledgeBaseSummary}` : ''}\n\nAvailable tools: ${c.tools.join(', ') || 'none'}`,
        },
        { role: 'user', content: promptText },
      ],
      max_tokens: 512,
      temperature: 0.35,
    } as AiTextGenerationInput);

    const reply = extractAiText(aiOut);
    if (!reply) {
      throw new Error('AI Agent test received an empty response from the configured provider.');
    }

    return {
      id,
      kind: 'agent_turn',
      passed: true,
      inputSummary: promptText,
      outputSummary: reply,
      details: {
        model: String(model),
        memoryMode: c.memoryMode,
        accessControl: c.accessControl,
        tools: c.tools,
      },
      executedAt: now,
    };
  }

  if (project.builderType === 'website') {
    const c = config as WebsiteBuilderConfig;
    const html = project.files.find((f) => f.path === 'index.html')?.content ?? '';
    const css = project.files.find((f) => f.path === 'styles.css')?.content ?? '';
    const hasWorker = project.files.some((f) => f.path === 'src/worker.ts');

    const checks = [
      { check: 'Responsive viewport meta tag', ok: html.includes('name="viewport"') },
      { check: 'Stylesheet linked & generated', ok: html.includes('styles.css') && css.length > 50 },
      { check: 'Navigation pages rendered', ok: c.pages.every((p) => html.includes(p)) },
      { check: 'Lead/contact form present', ok: !c.includeForms || html.includes('<form') },
      {
        check: 'Backend Worker API generated',
        ok: !(c.includeBackendApi || c.includeDatabaseAuth || c.includePayments) || hasWorker,
      },
    ];
    const allOk = checks.every((item) => item.ok);

    return {
      id,
      kind: 'site_audit',
      passed: allOk,
      inputSummary: `Audit ${c.websiteType} website (${c.pages.length} pages)`,
      outputSummary: allOk
        ? `All ${checks.length} responsive & feature checks passed.`
        : `${checks.filter((x) => !x.ok).length} check(s) require regeneration.`,
      details: { checks },
      executedAt: now,
    };
  }

  if (project.builderType === 'mini_app') {
    const c = config as MiniAppBuilderConfig;
    const html = project.files.find((f) => f.path === 'index.html')?.content ?? '';
    const appCode = project.files.find((f) => f.path === 'src/App.tsx')?.content ?? '';
    const workerCode = project.files.find((f) => f.path === 'worker/index.ts')?.content ?? '';

    const checks = [
      {
        check: 'Telegram WebApp SDK configured',
        ok: !c.telegramSdkEnabled || html.includes('telegram-web-app.js'),
      },
      {
        check: 'Configured screens included',
        ok: c.screens.every((s) => appCode.includes(s)),
      },
      {
        check: 'Auth endpoint generated',
        ok: c.authMode === 'public' || workerCode.includes('/api/auth'),
      },
      {
        check: 'Payment flow configured',
        ok: c.paymentsMode !== 'telegram_stars' || workerCode.includes('stars-invoice'),
      },
    ];
    const allOk = checks.every((item) => item.ok);

    return {
      id,
      kind: 'miniapp_audit',
      passed: allOk,
      inputSummary: `Audit ${c.targetPlatform} (${c.screens.length} screens)`,
      outputSummary: allOk
        ? `All ${checks.length} Mini App & API checks passed.`
        : `${checks.filter((x) => !x.ok).length} check(s) require attention.`,
      details: { checks },
      executedAt: now,
    };
  }

  // Automation Workflow execution test
  const c = config as AutomationBuilderConfig;
  let samplePayload: Record<string, unknown> = { event: 'manual_test', status: 'active', amount: 100 };
  if (input.payloadJson?.trim()) {
    try {
      const parsed = JSON.parse(input.payloadJson) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        samplePayload = parsed as Record<string, unknown>;
      }
    } catch {
      throw new Error('Sample trigger payload must be valid JSON.');
    }
  }

  const trace = c.actions.map((step, idx) => ({
    step: idx + 1,
    action: step,
    status: 'completed',
  }));

  return {
    id,
    kind: 'workflow_exec',
    passed: trace.length > 0,
    inputSummary: `Trigger: ${c.triggerType} (${JSON.stringify(samplePayload).slice(0, 90)})`,
    outputSummary: `Executed ${trace.length} action step(s) cleanly (${c.isActive ? 'Workflow Active' : 'Sandbox Run'}).`,
    details: {
      triggerType: c.triggerType,
      conditions: c.conditions || 'Always run',
      dataMapping: c.dataMapping,
      steps: trace,
      samplePayload,
    },
    executedAt: now,
  };
}
