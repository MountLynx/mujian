import path from 'node:path';
import process from 'node:process';

// Node 24 can read .env without a dependency. A missing file is fine; the
// server still starts and /api/health reports that the key is absent.
try {
  process.loadEnvFile(path.resolve(process.cwd(), '.env'));
} catch {
  /* no .env */
}

function env(name: string, fallback = ''): string {
  return (process.env[name] ?? fallback).trim();
}

export type LlmProvider = 'deepseek' | 'minimax';

const providerEnv = env('LLM_PROVIDER', 'deepseek').toLowerCase();
const provider: LlmProvider = providerEnv === 'minimax' ? 'minimax' : 'deepseek';
const thinkingEnv = env('LLM_THINKING', 'auto');
const thinking = (['auto', 'enabled', 'disabled'].includes(thinkingEnv)
  ? thinkingEnv
  : 'auto') as 'auto' | 'enabled' | 'disabled';
const port = Number(env('PORT', '4386')) || 4386;
const host = env('HOST', '127.0.0.1');

const deepseek = {
  baseUrl: env('DEEPSEEK_BASE_URL', 'https://api.deepseek.com').replace(/\/+$/, ''),
  apiKey: env('DEEPSEEK_API_KEY'),
  model: env('DEEPSEEK_MODEL', 'deepseek-flash'),
};
const minimax = {
  baseUrl: env('MINIMAX_BASE_URL', 'https://api.minimax.cn/anthropic').replace(/\/+$/, ''),
  apiKey: env('MINIMAX_API_KEY'),
  model: env('MINIMAX_MODEL', 'MiniMax-M3.1-Flash'),
  effort: env('MINIMAX_EFFORT', 'max'),
};
const active = provider === 'minimax' ? minimax : deepseek;

export const config = {
  port,
  host,
  dataDir: path.resolve(process.cwd(), 'data'),
  runsDir: path.resolve(process.cwd(), 'data', 'runs'),
  projectsDir: path.resolve(process.cwd(), 'data', 'projects'),
  worldsDir: path.resolve(process.cwd(), 'content', 'worlds'),
  worldRunsDir: path.resolve(process.cwd(), 'data', 'worlds'),
  scenariosDir: path.resolve(process.cwd(), 'content', 'scenarios'),
  publicDir: path.resolve(process.cwd(), 'public'),
  llm: {
    provider,
    baseUrl: active.baseUrl,
    apiKey: active.apiKey,
    model: active.model,
    thinking,
    effort: provider === 'minimax' ? minimax.effort : '',
    timeoutMs: Number(env('LLM_TIMEOUT_MS', '600000')) || 600_000,
    maxRetries: 3,
    actionConcurrency: Math.max(1, Number(env('LLM_ACTION_CONCURRENCY', '4')) || 4),
    deepseek,
    minimax,
  },
  version: '0.2.0',
} as const;

export function hasLlmCredentials(providerOverride?: LlmProvider): boolean {
  const selected = providerOverride ?? config.llm.provider;
  return Boolean(selected === 'minimax' ? config.llm.minimax.apiKey : config.llm.deepseek.apiKey);
}
