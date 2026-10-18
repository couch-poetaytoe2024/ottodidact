import type { ProviderStatus } from '../shared/ai';

export interface ServerConfig {
  provider: 'openai' | 'mock';
  model: string;
  apiKey: string;
  port: number;
  maxOutputTokens: number;
  reasoningEffort?: 'none' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  verbosity?: 'low' | 'medium' | 'high';
  contextCharLimit: number;
  timeoutMs: number;
  rateLimitPerMinute: number;
  inputUSDPerMillion?: number;
  outputUSDPerMillion?: number;
}
function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const value = env[name]?.trim();
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error(name + ' must be an integer between ' + min + ' and ' + max + '.');
  return parsed;
}
function price(value: string | undefined, name: string): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(name + ' must be a nonnegative USD price per million tokens.');
  return parsed;
}
function optionalChoice<T extends string>(env: NodeJS.ProcessEnv, name: string, choices: readonly T[]): T | undefined {
  const value = env[name]?.trim();
  if (!value) return undefined;
  if (!choices.includes(value as T)) throw new Error(name + ' must be one of: ' + choices.join(', ') + '.');
  return value as T;
}
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const provider = env.AI_PROVIDER?.trim() || 'openai';
  if (provider !== 'openai' && provider !== 'mock') throw new Error('AI_PROVIDER must be openai or mock.');
  return {
    provider, model: provider === 'mock' ? 'deterministic-demo' : env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
    apiKey: provider === 'openai' ? env.OPENAI_API_KEY?.trim() || '' : '',
    port: integer(env, 'PORT', 8787, 1, 65535),
    maxOutputTokens: integer(env, 'AI_MAX_OUTPUT_TOKENS', 1800, 256, 8192),
    // Opt in only for models supporting these controls and the selected values.
    // Leaving them unset preserves provider defaults and older-model compatibility.
    reasoningEffort: optionalChoice(env, 'OPENAI_REASONING_EFFORT', ['none', 'low', 'medium', 'high', 'xhigh', 'max']),
    verbosity: optionalChoice(env, 'OPENAI_VERBOSITY', ['low', 'medium', 'high']),
    contextCharLimit: integer(env, 'AI_CONTEXT_CHAR_LIMIT', 24000, 8000, 48000),
    timeoutMs: integer(env, 'AI_TIMEOUT_MS', 45000, 1000, 90000),
    rateLimitPerMinute: integer(env, 'AI_RATE_LIMIT_PER_MINUTE', 20, 1, 120),
    inputUSDPerMillion: price(env.AI_INPUT_USD_PER_MILLION, 'AI_INPUT_USD_PER_MILLION'),
    outputUSDPerMillion: price(env.AI_OUTPUT_USD_PER_MILLION, 'AI_OUTPUT_USD_PER_MILLION'),
  };
}
export function providerStatus(config: ServerConfig): ProviderStatus {
  const configured = config.provider === 'mock' || Boolean(config.apiKey && !/^(your[_-]|replace[_-]|sk-replace)/i.test(config.apiKey));
  return {
    provider: config.provider, model: config.model, configured,
    message: config.provider === 'mock'
      ? 'Demo content: mock mode does not analyze your screenshot.'
      : configured ? 'Selected snapshots are sent to OpenAI only when you submit a question.'
        : 'Set OPENAI_API_KEY in the backend .env, then restart npm run dev. Use AI_PROVIDER=mock only for the labelled demo.',
  };
}
