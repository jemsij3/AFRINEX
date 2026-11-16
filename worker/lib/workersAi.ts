import type { AiTopic } from '../../shared/types.ts';

const TOPIC_SYSTEM_PROMPTS: Record<AiTopic, string> = {
  general: 'You are the AFRINEX AI Assistant ("African Roots. Global Impact."). Give clear, practical, structured guidance on digital skills, software products, AI adoption, and global opportunities. Keep responses concise and action-oriented.',
  tech: 'You are the AFRINEX Technology & Software Architect. Help users design scalable web apps, Telegram Mini Apps, APIs, and edge systems (especially Cloudflare Workers, TypeScript, and SQL). Provide practical implementation guidance.',
  ai: 'You are the AFRINEX AI Engineering Mentor. Teach practical AI integration, prompt engineering, agent workflows, evaluation, and edge inference using open models and Cloudflare Workers AI.',
  web3: 'You are the AFRINEX Web3 & Digital Economy Advisor. Explain blockchain concepts, smart-contract security, decentralized identity, and cross-border digital payments clearly without hype or financial guarantees.',
  business: 'You are the AFRINEX Digital Business & Startup Strategist. Guide African and global founders on product validation, SaaS/Telegram monetization, customer support automation, and global market strategy.',
};

export interface ChatTurn {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
export interface WorkersAiResult {
  reply: string;
  model: string;
}
export const DEFAULT_WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast' as const;

export async function runWorkersAiChat(
  ai: Ai,
  configuredModel: string | undefined,
  topic: AiTopic,
  history: ChatTurn[],
  systemPrompt?: string,
): Promise<WorkersAiResult> {
  const model = (configuredModel || DEFAULT_WORKERS_AI_MODEL) as keyof AiModels;
  const messages: RoleScopedChatInput[] = [
    { role: 'system', content: systemPrompt ?? TOPIC_SYSTEM_PROMPTS[topic] },
    ...history.map((turn) => ({ role: turn.role, content: turn.content })),
  ];
  const output = (await ai.run(model, {
    messages,
    max_tokens: 1024,
    temperature: 0.4,
  } as AiTextGenerationInput)) as {
    response?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };
  const reply = output?.response?.trim() || output?.choices?.[0]?.message?.content?.trim() ||
    'I could not generate a response right now. Please try phrasing your question again.';
  return { reply, model: String(model) };
}
