import type { AiTopic } from '../../shared/types.ts';
import { extractAiText } from './aiResponse.ts';

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

export async function runWorkersAiChat(
  ai: Ai,
  configuredModel: string | undefined,
  topic: AiTopic,
  history: ChatTurn[],
  globalSystemPrompt?: string
): Promise<WorkersAiResult> {
  const model = (configuredModel || DEFAULT_WORKERS_AI_MODEL) as keyof AiModels;
  const combinedSystemPrompt = buildCombinedSystemPrompt(topic, globalSystemPrompt);
  const sanitizedHistory = history
    .filter((turn) => turn.role === 'user' || turn.role === 'assistant')
    .map((turn) => ({ role: turn.role, content: turn.content }));

  const messages: RoleScopedChatInput[] = [
    { role: 'system', content: combinedSystemPrompt },
    ...sanitizedHistory,
  ];
  const output: unknown = await ai.run(model, {
    messages,
    max_tokens: 1024,
    temperature: 0.4,
  } as AiTextGenerationInput);

  const reply =
    extractAiText(output) ||
    'I could not generate a response right now. Please try phrasing your question again.';
  return { reply, model: String(model) };
}

