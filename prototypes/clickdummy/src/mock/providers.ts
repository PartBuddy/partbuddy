/**
 * Provider profiles shown in the prototype. Model names and limits follow the AI-layer research
 * (docs/research.md § 3); endpoints are the documented local defaults. No requests are made.
 */

export type ProviderKind = 'cloud' | 'local';

export interface ProviderProfile {
  id: string;
  vendor: string;
  model: string;
  kind: ProviderKind;
  endpoint?: string;
  contextTokens: number;
  tools: boolean;
  images: boolean;
}

export const providers: ProviderProfile[] = [
  { id: 'anthropic', vendor: 'Anthropic', model: 'Claude Opus 5.5', kind: 'cloud', contextTokens: 1_000_000, tools: true, images: true },
  { id: 'openai', vendor: 'OpenAI', model: 'GPT-6.1 Sol', kind: 'cloud', contextTokens: 1_050_000, tools: true, images: true },
  { id: 'google', vendor: 'Google', model: 'Gemini 3.8 Flash', kind: 'cloud', contextTokens: 1_048_576, tools: true, images: true },
  { id: 'strata', vendor: 'Strata', model: 'Qwen3.8-Flash-Next', kind: 'local', endpoint: '127.0.0.1:8080', contextTokens: 262_144, tools: true, images: true },
  { id: 'ollama', vendor: 'Ollama', model: 'qwen3.8:27b', kind: 'local', endpoint: '127.0.0.1:11434', contextTokens: 4_096, tools: true, images: true },
  { id: 'lmstudio', vendor: 'LM Studio', model: 'Gemma 4 31B', kind: 'local', endpoint: '127.0.0.1:1234', contextTokens: 131_072, tools: false, images: true },
];

/** Agent sessions are refused below this context size (ADR 0011). */
export const minimumAgentContext = 64_000;

export function findProvider(id: string): ProviderProfile {
  const provider = providers.find((p) => p.id === id);
  if (!provider) throw new Error(`unknown provider ${id}`);
  return provider;
}
