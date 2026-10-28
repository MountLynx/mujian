import { config, type LlmProvider } from '../config.ts';
import type { ThinkingMode } from '../types.ts';
import { parseJsonLoose, sleep } from '../utils.ts';

export interface LlmUsageDelta {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  failures: number;
}

export interface JsonCallOptions<T> {
  label: string;
  system: string;
  user: string;
  schemaHint?: string;
  thinking?: boolean;
  maxTokens?: number;
  temperature?: number;
  validate: (value: unknown) => T;
  /** Called whenever a transport attempt or validation failure occurs. */
  onRetry?: (info: { attempt: number; reason: string }) => void;
}

export interface JsonCallResult<T> {
  data: T;
  content: string;
  reasoning: string;
  usage: LlmUsageDelta;
  latencyMs: number;
  thinking: boolean;
}

export class LlmError extends Error {
  code: string;
  retryable: boolean;
  constructor(message: string, code = 'llm_error', retryable = false) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.retryable = retryable;
  }
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string | null; reasoning_content?: string | null };
    finish_reason?: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
    prompt_cache_hit_tokens?: number;
  };
  error?: { message?: string; type?: string; code?: string };
}

export interface LanguageModel {
  readonly model: string;
  callJson<T>(options: JsonCallOptions<T>): Promise<JsonCallResult<T>>;
}

export function thinkingForMode(
  mode: ThinkingMode,
  kind: 'gm' | 'character' | 'reaction',
): boolean {
  if (mode === 'enabled') return true;
  if (mode === 'disabled') return false;
  // auto: the director thinks; the ensemble answers fast. Reactions get a bit
  // more deliberation because the player is making a costly choice.
  return kind === 'gm';
}

function emptyUsage(): LlmUsageDelta {
  return {
    calls: 0,
    promptTokens: 0,
    completionTokens: 0,
    cachedTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    failures: 0,
  };
}

function addUsage(target: LlmUsageDelta, source: LlmUsageDelta): void {
  target.calls += source.calls;
  target.promptTokens += source.promptTokens;
  target.completionTokens += source.completionTokens;
  target.cachedTokens += source.cachedTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.totalTokens += source.totalTokens;
  target.failures += source.failures;
}

export class DeepSeekModel implements LanguageModel {
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options?: {
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    timeoutMs?: number;
    maxRetries?: number;
  }) {
    this.model = options?.model ?? config.llm.deepseek.model;
    this.baseUrl = (options?.baseUrl ?? config.llm.deepseek.baseUrl).replace(/\/+$/, '');
    this.apiKey = options?.apiKey ?? config.llm.deepseek.apiKey;
    this.timeoutMs = options?.timeoutMs ?? config.llm.timeoutMs;
    this.maxRetries = options?.maxRetries ?? config.llm.maxRetries;
  }

  private ensureConfigured(): void {
    if (!this.apiKey) {
      throw new LlmError('未配置 DEEPSEEK_API_KEY，无法调用模型。', 'missing_api_key');
    }
  }

  async callJson<T>(options: JsonCallOptions<T>): Promise<JsonCallResult<T>> {
    this.ensureConfigured();
    const usage = emptyUsage();
    const started = Date.now();
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: options.system },
      { role: 'user', content: options.user },
    ];

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      let response: ChatResponse;
      try {
        response = await this.request(messages, options);
      } catch (error) {
        const normalized =
          error instanceof LlmError
            ? error
            : new LlmError(
                error instanceof Error ? error.message : String(error),
                'network_error',
                true,
              );
        lastError = normalized;
        usage.failures += 1;
        if (!normalized.retryable || attempt >= this.maxRetries) throw normalized;
        options.onRetry?.({ attempt, reason: normalized.message });
        await sleep(700 * 2 ** (attempt - 1));
        continue;
      }

      usage.calls += 1;
      const rawUsage = response.usage ?? {};
      const promptTokens = rawUsage.prompt_tokens ?? 0;
      const completionTokens = rawUsage.completion_tokens ?? 0;
      usage.promptTokens += promptTokens;
      usage.completionTokens += completionTokens;
      usage.cachedTokens +=
        rawUsage.prompt_tokens_details?.cached_tokens ??
        rawUsage.prompt_cache_hit_tokens ??
        0;
      usage.reasoningTokens += rawUsage.completion_tokens_details?.reasoning_tokens ?? 0;
      usage.totalTokens += rawUsage.total_tokens ?? promptTokens + completionTokens;

      const choice = response.choices?.[0];
      const content = choice?.message?.content?.trim() ?? '';
      const reasoning = choice?.message?.reasoning_content?.trim() ?? '';
      if (!content) {
        lastError = new LlmError(
          `模型没有返回正文（finish_reason=${choice?.finish_reason ?? 'unknown'}）。`,
          'empty_content',
          true,
        );
        usage.failures += 1;
        if (attempt >= this.maxRetries) throw lastError;
        options.onRetry?.({ attempt, reason: '模型返回空内容，重试。' });
        continue;
      }

      try {
        const parsed = parseJsonLoose(content);
        const data = options.validate(parsed);
        return {
          data,
          content,
          reasoning,
          usage,
          latencyMs: Date.now() - started,
          thinking: options.thinking ?? false,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        lastError = new LlmError(`模型输出未通过结构校验：${reason}`, 'invalid_json', true);
        usage.failures += 1;
        if (attempt >= this.maxRetries) throw lastError;
        options.onRetry?.({ attempt, reason: `结构校验失败，重试：${reason}` });
        messages.push(
          { role: 'assistant', content: content.slice(0, 12_000) },
          {
            role: 'user',
            content:
              `上一条输出无法被系统接受：${reason}\n` +
              '请只返回一个严格合法的 JSON 对象，不要代码围栏，不要补充解释。' +
              '字符串里的引号必须转义，换行必须写成 \\n，不要输出裸控制字符。' +
              (options.schemaHint ? `\n字段要求：\n${options.schemaHint}` : ''),
          },
        );
      }
    }
    throw lastError ?? new LlmError('模型调用失败。');
  }

  private async request(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options: JsonCallOptions<unknown>,
  ): Promise<ChatResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          messages,
          response_format: { type: 'json_object' },
          temperature: options.temperature ?? 0.75,
          // Effort-max outputs spend most of their budget on thinking tokens.
          // Keep a generous floor: effort=max can burn the whole budget on thinking
          // and then return no text block (`stop_reason=max_tokens`).
          max_tokens: Math.max(options.maxTokens ?? 5000, 32_000),
          stream: false,
          thinking: { type: options.thinking ? 'enabled' : 'disabled' },
        }),
      });
      const text = await response.text();
      let parsed: ChatResponse | null = null;
      try {
        parsed = JSON.parse(text) as ChatResponse;
      } catch {
        /* handled below */
      }
      if (!response.ok) {
        const detail =
          parsed?.error?.message ??
          text.slice(0, 500).replace(/\s+/g, ' ') ??
          response.statusText;
        const retryable = response.status === 408 || response.status === 409 || response.status === 429 || response.status >= 500;
        throw new LlmError(
          `DeepSeek API ${response.status}: ${detail}`,
          `http_${response.status}`,
          retryable,
        );
      }
      if (!parsed) {
        throw new LlmError('DeepSeek 返回了无法解析的响应。', 'bad_response', true);
      }
      if (parsed.error) {
        throw new LlmError(`DeepSeek API 错误：${parsed.error.message ?? '未知错误'}`, 'api_error', true);
      }
      return parsed;
    } catch (error) {
      if (error instanceof LlmError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LlmError(`模型调用超时（${this.timeoutMs}ms）。`, 'timeout', true);
      }
      throw new LlmError(error instanceof Error ? error.message : String(error), 'network_error', true);
    } finally {
      clearTimeout(timer);
    }
  }
}


/* ------------------------------------------------------------------------ */
/* Anthropic-compatible provider (MiniMax)                                  */
/* ------------------------------------------------------------------------ */

interface AnthropicBlock {
  type?: string;
  text?: string;
  thinking?: string;
  signature?: string;
}

interface AnthropicResponse {
  id?: string;
  type?: string;
  role?: string;
  model?: string;
  content?: AnthropicBlock[] | string;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
    output_tokens_details?: { thinking_tokens?: number };
  };
  stop_reason?: string;
  base_resp?: { status_code?: number; status_msg?: string };
  error?: { type?: string; message?: string };
}

const ANTHROPIC_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
type AnthropicEffort = (typeof ANTHROPIC_EFFORTS)[number];

function anthropicEffort(value: string | undefined): AnthropicEffort {
  return (ANTHROPIC_EFFORTS as readonly string[]).includes(value ?? '')
    ? (value as AnthropicEffort)
    : 'max';
}

function anthropicText(response: AnthropicResponse): { content: string; reasoning: string } {
  if (typeof response.content === 'string') {
    return { content: response.content.trim(), reasoning: '' };
  }
  const blocks = Array.isArray(response.content) ? response.content : [];
  const content = blocks
    .filter((block) => block.type === 'text' || typeof block.text === 'string')
    .map((block) => block.text ?? '')
    .join('')
    .trim();
  const reasoning = blocks
    .filter((block) => block.type === 'thinking' || typeof block.thinking === 'string')
    .map((block) => block.thinking ?? '')
    .join('\n')
    .trim();
  return { content, reasoning };
}

/**
 * MiniMax exposes an Anthropic-compatible `/v1/messages` endpoint. It has no
 * OpenAI-style `response_format` and no boolean thinking switch; instead the
 * caller selects an effort tier (`low|medium|high|xhigh|max`). We always send
 * the configured effort, and parse JSON from the text blocks.
 */
export class AnthropicModel implements LanguageModel {
  readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly effort: AnthropicEffort;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(options?: {
    model?: string;
    baseUrl?: string;
    apiKey?: string;
    effort?: string;
    timeoutMs?: number;
    maxRetries?: number;
  }) {
    this.model = options?.model ?? config.llm.minimax.model;
    this.baseUrl = (options?.baseUrl ?? config.llm.minimax.baseUrl).replace(/\/+$/, '');
    this.apiKey = options?.apiKey ?? config.llm.minimax.apiKey;
    this.effort = anthropicEffort(options?.effort ?? config.llm.minimax.effort);
    this.timeoutMs = options?.timeoutMs ?? config.llm.timeoutMs;
    this.maxRetries = options?.maxRetries ?? config.llm.maxRetries;
  }

  private ensureConfigured(): void {
    if (!this.apiKey) {
      throw new LlmError('未配置 MINIMAX_API_KEY，无法调用模型。', 'missing_api_key');
    }
  }

  async callJson<T>(options: JsonCallOptions<T>): Promise<JsonCallResult<T>> {
    this.ensureConfigured();
    const usage = emptyUsage();
    const started = Date.now();
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: options.user },
    ];

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt += 1) {
      let response: AnthropicResponse;
      try {
        response = await this.request(messages, options);
      } catch (error) {
        const normalized =
          error instanceof LlmError
            ? error
            : new LlmError(
                error instanceof Error ? error.message : String(error),
                'network_error',
                true,
              );
        lastError = normalized;
        usage.failures += 1;
        if (!normalized.retryable || attempt >= this.maxRetries) throw normalized;
        options.onRetry?.({ attempt, reason: normalized.message });
        await sleep(700 * 2 ** (attempt - 1));
        continue;
      }

      usage.calls += 1;
      const rawUsage = response.usage ?? {};
      // Anthropic-style usage reports non-cached input separately from cache
      // reads. Count the full prompt so cross-provider totals stay comparable.
      const promptTokens =
        (rawUsage.input_tokens ?? 0) +
        (rawUsage.cache_read_input_tokens ?? 0) +
        (rawUsage.cache_creation_input_tokens ?? 0);
      const completionTokens = rawUsage.output_tokens ?? 0;
      usage.promptTokens += promptTokens;
      usage.completionTokens += completionTokens;
      usage.cachedTokens += rawUsage.cache_read_input_tokens ?? 0;
      usage.reasoningTokens += rawUsage.output_tokens_details?.thinking_tokens ?? 0;
      usage.totalTokens += promptTokens + completionTokens;

      const { content, reasoning } = anthropicText(response);
      if (!content) {
        lastError = new LlmError(
          `模型没有返回正文（stop_reason=${response.stop_reason ?? 'unknown'}）。`,
          'empty_content',
          true,
        );
        usage.failures += 1;
        if (attempt >= this.maxRetries) throw lastError;
        options.onRetry?.({ attempt, reason: '模型返回空内容，重试。' });
        continue;
      }

      try {
        const parsed = parseJsonLoose(content);
        const data = options.validate(parsed);
        return {
          data,
          content,
          reasoning,
          usage,
          latencyMs: Date.now() - started,
          thinking: true,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        lastError = new LlmError(
          `模型输出未通过结构校验：${reason}${response.stop_reason === 'max_tokens' ? '（输出可能被 max_tokens 截断）' : ''}`,
          'invalid_json',
          true,
        );
        usage.failures += 1;
        if (attempt >= this.maxRetries) throw lastError;
        options.onRetry?.({ attempt, reason: `结构校验失败，重试：${reason}` });
        messages.push(
          { role: 'assistant', content: content.slice(0, 12_000) },
          {
            role: 'user',
            content:
              `上一条输出无法被系统接受：${reason}\n` +
              '请只返回一个严格合法的 JSON 对象，不要代码围栏，不要补充解释。' +
              '字符串里的引号必须转义，换行必须写成 \\n，不要输出裸控制字符。' +
              (options.schemaHint ? `\n字段要求：\n${options.schemaHint}` : ''),
          },
        );
      }
    }
    throw lastError ?? new LlmError('模型调用失败。');
  }

  private async request(
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    options: JsonCallOptions<unknown>,
  ): Promise<AnthropicResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const url = this.baseUrl.endsWith('/v1')
        ? `${this.baseUrl}/messages`
        : `${this.baseUrl}/v1/messages`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          max_tokens: options.maxTokens ?? 5000,
          system: options.system,
          messages,
          temperature: options.temperature ?? 0.75,
          output_config: { effort: this.effort },
        }),
      });
      const text = await response.text();
      let parsed: AnthropicResponse | null = null;
      try {
        parsed = JSON.parse(text) as AnthropicResponse;
      } catch {
        /* handled below */
      }
      if (!response.ok) {
        const detail =
          parsed?.error?.message ??
          parsed?.base_resp?.status_msg ??
          text.slice(0, 500).replace(/\s+/g, ' ');
        const retryable =
          response.status === 408 ||
          response.status === 409 ||
          response.status === 429 ||
          response.status >= 500;
        throw new LlmError(
          `MiniMax API ${response.status}: ${detail}`,
          `http_${response.status}`,
          retryable,
        );
      }
      if (!parsed) {
        throw new LlmError('MiniMax 返回了无法解析的响应。', 'bad_response', true);
      }
      if (parsed.type === 'error' || parsed.error) {
        throw new LlmError(
          `MiniMax API 错误：${parsed.error?.message ?? parsed.base_resp?.status_msg ?? '未知错误'}`,
          'api_error',
          true,
        );
      }
      if (parsed.base_resp?.status_code && parsed.base_resp.status_code !== 0) {
        throw new LlmError(
          `MiniMax API 错误 ${parsed.base_resp.status_code}：${parsed.base_resp.status_msg ?? '未知错误'}`,
          'minimax_error',
          true,
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof LlmError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new LlmError(`模型调用超时（${this.timeoutMs}ms）。`, 'timeout', true);
      }
      throw new LlmError(error instanceof Error ? error.message : String(error), 'network_error', true);
    } finally {
      clearTimeout(timer);
    }
  }
}

export interface CreateLanguageModelOptions {
  provider?: LlmProvider;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
  effort?: string;
}

export function createLanguageModel(options: CreateLanguageModelOptions = {}): LanguageModel {
  const provider = options.provider ?? config.llm.provider;
  if (provider === 'minimax') {
    return new AnthropicModel({
      model: options.model ?? config.llm.minimax.model,
      baseUrl: options.baseUrl ?? config.llm.minimax.baseUrl,
      apiKey: options.apiKey ?? config.llm.minimax.apiKey,
      effort: options.effort ?? config.llm.minimax.effort,
    });
  }
  return new DeepSeekModel({
    model: options.model ?? config.llm.deepseek.model,
    baseUrl: options.baseUrl ?? config.llm.deepseek.baseUrl,
    apiKey: options.apiKey ?? config.llm.deepseek.apiKey,
  });
}

export { addUsage };
