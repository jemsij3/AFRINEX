import type { AiToolExecutionSummary, AiTopic, PlatformUser } from '../../shared/types.ts';
import type { WorkerBindings } from '../types.ts';
import { extractAiText } from './aiResponse.ts';
import {
  buildAssistantToolDefinitions,
  buildConnectedToolsSystemContext,
  executeAssistantToolCall,
  loadUserIntegrationsForAssistant,
  type AssistantToolArgs,
  type WorkersAiToolDefinition,
} from './integrationTools.ts';

const TOPIC_SYSTEM_PROMPTS: Record<AiTopic, string> = {
  general:
    'You are the AFRINEX AI Assistant ("African Roots. Global Impact."). Give clear, practical, structured guidance on digital skills, software products, AI adoption, and global opportunities. Keep responses concise and action-oriented.',
  tech: 'You are the AFRINEX Technology & Software Architect. Help users design scalable web apps, Telegram Mini Apps, APIs, and edge systems (especially Cloudflare Workers, TypeScript, and SQL). Provide practical implementation guidance.',
  ai: 'You are the AFRINEX AI Engineering Mentor. Teach practical AI integration, prompt engineering, agent workflows, evaluation, and edge inference using open models and Cloudflare Workers AI.',
  web3: 'You are the AFRINEX Web3 & Digital Economy Advisor. Explain blockchain concepts, smart-contract security, decentralized identity, and cross-border digital payments clearly without hype or financial guarantees.',
  business:
    'You are the AFRINEX Digital Business & Startup Strategist. Guide African and global founders on product validation, SaaS/Telegram monetization, customer support automation, and global market strategy.',
};

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface WorkersAiResult {
  reply: string;
  model: string;
  toolsUsed?: AiToolExecutionSummary[];
}

export interface AssistantToolContext {
  db: D1Database;
  user: PlatformUser;
  env: WorkerBindings;
}

export interface AiProviderModelOption {
  id: string;
  label: string;
  provider: string;
  strength: string;
}

export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as const;

export const SUPPORTED_WORKERS_AI_MODELS: AiProviderModelOption[] = [
  {
    id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    label: 'Llama 3.3 70B Instruct Fast',
    provider: 'Cloudflare Workers AI',
    strength: 'Best overall reasoning, architecture, and tool orchestration',
  },
  {
    id: '@cf/meta/llama-3.1-8b-instruct',
    label: 'Llama 3.1 8B Instruct',
    provider: 'Cloudflare Workers AI',
    strength: 'Low-latency chat and lightweight workflow classification',
  },
  {
    id: '@cf/qwen/qwen2.5-coder-32b-instruct',
    label: 'Qwen 2.5 Coder 32B Instruct',
    provider: 'Cloudflare Workers AI',
    strength: 'Structured code generation, TypeScript, and SQL schemas',
  },
];

export function getAvailableAiModels(configuredModel?: string): AiProviderModelOption[] {
  const trimmed = typeof configuredModel === 'string' ? configuredModel.trim() : '';
  if (!trimmed || SUPPORTED_WORKERS_AI_MODELS.some((m) => m.id === trimmed)) {
    return SUPPORTED_WORKERS_AI_MODELS;
  }
  return [
    {
      id: trimmed,
      label: trimmed,
      provider: 'Cloudflare Workers AI (Configured)',
      strength: 'Active environment default model',
    },
    ...SUPPORTED_WORKERS_AI_MODELS,
  ];
}

export function buildCombinedSystemPrompt(
  topic: AiTopic,
  globalSystemPrompt?: string | null
): string {
  const topicPrompt = TOPIC_SYSTEM_PROMPTS[topic] ?? TOPIC_SYSTEM_PROMPTS.general;
  const trimmedGlobal = typeof globalSystemPrompt === 'string' ? globalSystemPrompt.trim() : '';
  if (!trimmedGlobal || trimmedGlobal === topicPrompt) {
    return topicPrompt;
  }
  return `${trimmedGlobal}\n\nTopic Focus (${topic}):\n${topicPrompt}`;
}

interface ParsedToolCall {
  id: string;
  name: string;
  arguments: AssistantToolArgs;
  rawArguments: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseToolArgs(raw: unknown): { parsed: AssistantToolArgs; rawStr: string } {
  if (isPlainRecord(raw)) {
    return { parsed: raw as AssistantToolArgs, rawStr: JSON.stringify(raw) };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return { parsed: {}, rawStr: '{}' };
    try {
      const obj = JSON.parse(trimmed) as unknown;
      if (isPlainRecord(obj)) {
        return { parsed: obj as AssistantToolArgs, rawStr: trimmed };
      }
    } catch {
      return { parsed: { query: trimmed }, rawStr: trimmed };
    }
  }
  return { parsed: {}, rawStr: '{}' };
}

function extractToolCalls(
  rawOutput: unknown,
  registeredToolNames: Set<string>
): ParsedToolCall[] {
  if (!isPlainRecord(rawOutput)) return [];
  const envelope = isPlainRecord(rawOutput.result) ? rawOutput.result : rawOutput;

  const rawList: unknown[] = [];
  if (Array.isArray(envelope.tool_calls)) {
    rawList.push(...envelope.tool_calls);
  } else if (
    Array.isArray(envelope.choices) &&
    envelope.choices.length > 0 &&
    isPlainRecord(envelope.choices[0]) &&
    isPlainRecord(envelope.choices[0].message) &&
    Array.isArray(envelope.choices[0].message.tool_calls)
  ) {
    rawList.push(...envelope.choices[0].message.tool_calls);
  }

  const parsedCalls: ParsedToolCall[] = [];
  for (let i = 0; i < rawList.length; i += 1) {
    const item = rawList[i];
    if (!isPlainRecord(item)) continue;

    // OpenAI shape: { id, type: 'function', function: { name, arguments } }
    if (isPlainRecord(item.function) && typeof item.function.name === 'string') {
      const { parsed, rawStr } = parseToolArgs(item.function.arguments);
      parsedCalls.push({
        id: typeof item.id === 'string' && item.id ? item.id : `call_${i}_${Date.now()}`,
        name: item.function.name.trim(),
        arguments: parsed,
        rawArguments: rawStr,
      });
      continue;
    }

    // Legacy Workers AI shape: { name, arguments }
    if (typeof item.name === 'string') {
      const { parsed, rawStr } = parseToolArgs(item.arguments ?? item.parameters);
      parsedCalls.push({
        id: typeof item.id === 'string' && item.id ? item.id : `call_${i}_${Date.now()}`,
        name: item.name.trim(),
        arguments: parsed,
        rawArguments: rawStr,
      });
    }
  }

  if (parsedCalls.length > 0) {
    return parsedCalls;
  }

  // Fallback for open-weight models that return JSON tool call inside `response`
  const textCandidate = typeof envelope.response === 'string' ? envelope.response.trim() : '';
  if (textCandidate.startsWith('{') && textCandidate.endsWith('}')) {
    try {
      const parsedObj = JSON.parse(textCandidate) as unknown;
      if (
        isPlainRecord(parsedObj) &&
        typeof parsedObj.name === 'string' &&
        registeredToolNames.has(parsedObj.name.trim())
      ) {
        const { parsed, rawStr } = parseToolArgs(parsedObj.arguments ?? parsedObj.parameters);
        return [
          {
            id: `call_json_${Date.now()}`,
            name: parsedObj.name.trim(),
            arguments: parsed,
            rawArguments: rawStr,
          },
        ];
      }
    } catch {
      // Not a standalone JSON tool call
    }
  }

  return [];
}

function isUnsupportedToolsError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    msg.includes('tools') &&
    (msg.includes('unsupported') || msg.includes('not supported') || msg.includes('invalid schema'))
  );
}

export async function runWorkersAiChat(
  ai: Ai,
  configuredModel: string | undefined,
  topic: AiTopic,
  history: ChatTurn[],
  globalSystemPrompt?: string,
  toolContext?: AssistantToolContext
): Promise<WorkersAiResult> {
  const model = (configuredModel || DEFAULT_WORKERS_AI_MODEL) as keyof AiModels;
  let combinedSystemPrompt = buildCombinedSystemPrompt(topic, globalSystemPrompt);

  const userIntegrations = toolContext
    ? await loadUserIntegrationsForAssistant(toolContext.db, toolContext.user.id)
    : [];

  let toolDefinitions: WorkersAiToolDefinition[] = [];
  if (toolContext) {
    combinedSystemPrompt = `${combinedSystemPrompt}\n\n${buildConnectedToolsSystemContext(
      userIntegrations,
      toolContext.user
    )}`;
    toolDefinitions = buildAssistantToolDefinitions(userIntegrations);
  }

  const registeredToolNames = new Set(toolDefinitions.map((t) => t.function.name));

  const sanitizedHistory = history
    .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
    .map((turn) => ({ role: turn.role, content: turn.content }));

  // Mutable conversation transcript for tool-calling loop
  const conversationMessages: Array<Record<string, unknown>> = [
    { role: 'system', content: combinedSystemPrompt },
    ...sanitizedHistory,
  ];

  const toolsUsedMap = new Map<string, AiToolExecutionSummary>();
  const MAX_TOOL_ROUNDS = 4;

  let lastOutput: unknown = null;
  let toolsRejectedByModel = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const requestPayload: Record<string, unknown> = {
      messages: conversationMessages,
      max_tokens: 1024,
      temperature: 0.4,
    };
    if (toolDefinitions.length > 0 && !toolsRejectedByModel) {
      requestPayload.tools = toolDefinitions;
    }

    try {
      lastOutput = await ai.run(model, requestPayload as AiTextGenerationInput);
    } catch (err) {
      if (toolDefinitions.length > 0 && !toolsRejectedByModel && isUnsupportedToolsError(err)) {
        toolsRejectedByModel = true;
        delete requestPayload.tools;
        lastOutput = await ai.run(model, requestPayload as AiTextGenerationInput);
      } else {
        throw err;
      }
    }

    const toolCalls = toolContext
      ? extractToolCalls(lastOutput, registeredToolNames)
      : [];

    if (toolCalls.length === 0 || !toolContext) {
      const reply =
        extractAiText(lastOutput) ||
        'I could not generate a response right now. Please try phrasing your question again.';
      const toolsUsed = Array.from(toolsUsedMap.values());
      return {
        reply,
        model: String(model),
        ...(toolsUsed.length > 0 ? { toolsUsed } : {}),
      };
    }

    const boundedCalls = toolCalls.slice(0, 5);
    conversationMessages.push({
      role: 'assistant',
      content: extractAiText(lastOutput) || null,
      tool_calls: boundedCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: tc.rawArguments,
        },
      })),
    });

    for (const tc of boundedCalls) {
      const execResult = await executeAssistantToolCall({
        db: toolContext.db,
        env: toolContext.env,
        user: toolContext.user,
        integrations: userIntegrations,
        functionName: tc.name,
        args: tc.arguments,
      });

      if (execResult.summary) {
        toolsUsedMap.set(execResult.summary.toolId, execResult.summary);
      }

      conversationMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.name,
        content: JSON.stringify(execResult.payload),
      });
    }
  }

  // Final synthesis turn if all MAX_TOOL_ROUNDS produced tool_calls
  conversationMessages.push({
    role: 'system',
    content:
      'Summarize the exact tool responses and statuses above clearly for the user without invoking any further tools or fabricating missing data.',
  });
  lastOutput = await ai.run(model, {
    messages: conversationMessages as RoleScopedChatInput[],
    max_tokens: 1024,
    temperature: 0.3,
  } as AiTextGenerationInput);

  const reply =
    extractAiText(lastOutput) ||
    'Tool execution completed, but no summary response was produced. Please try again.';
  const toolsUsed = Array.from(toolsUsedMap.values());
  return {
    reply,
    model: String(model),
    ...(toolsUsed.length > 0 ? { toolsUsed } : {}),
  };
}
