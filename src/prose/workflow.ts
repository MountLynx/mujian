import type { JsonCallResult, LanguageModel } from '../llm/client.ts';
import type { LlmUsage, Run } from '../types.ts';
import {
  buildDraftPrompt,
  buildOutlinePrompt,
  buildStorySpine,
  parseProseDraft,
  parseProseOutline,
  renderProseMarkdown,
  type ProseDraft,
  type ProseOptions,
  type ProseOutline,
} from './prompts.ts';

function emptyUsage(): LlmUsage {
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

function addUsage(target: LlmUsage, source: LlmUsage): void {
  target.calls += source.calls;
  target.promptTokens += source.promptTokens;
  target.completionTokens += source.completionTokens;
  target.cachedTokens += source.cachedTokens;
  target.reasoningTokens += source.reasoningTokens;
  target.totalTokens += source.totalTokens;
  target.failures += source.failures;
}

export interface ProseResult {
  outline: ProseOutline;
  draft: ProseDraft;
  usage: LlmUsage;
  markdown: string;
}

/**
 * A two-step text-creation workflow on top of the simulation:
 *   1. outline the simulation's beats into scenes;
 *   2. write the prose in a chosen POV / person / style.
 *
 * It never mutates the run. POV and style are author choices; the simulation
 * only supplies deeds, effects, responses, facts and the POV character's own
 * private material.
 */
export class ProseWorkflow {
  private readonly run: Run;
  private readonly model: LanguageModel;

  constructor(run: Run, model: LanguageModel) {
    this.run = run;
    this.model = model;
  }

  private async call<T>(
    label: string,
    prompt: { system: string; user: string; schemaHint: string },
    options: { maxTokens: number; temperature: number; validate: (value: unknown) => T },
  ): Promise<JsonCallResult<T>> {
    return this.model.callJson<T>({
      label,
      system: prompt.system,
      user: prompt.user,
      schemaHint: prompt.schemaHint,
      thinking: true,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      validate: options.validate,
    });
  }

  async generate(options: ProseOptions = {}): Promise<ProseResult> {
    const complete = this.run.beats.filter((beat) => beat.phase === 'complete');
    if (!complete.length) throw new Error('这场推演还没有完成任何时刻，无法创作正文。');
    if (options.pov && options.pov !== 'omniscient' && !this.run.characters[options.pov]) {
      throw new Error(`POV 角色不存在：${options.pov}`);
    }

    const { spine } = buildStorySpine(this.run, options);
    if (!spine.trim()) throw new Error('推演记录为空。');

    const usage = emptyUsage();
    const outlinePrompt = buildOutlinePrompt(this.run, options);
    const outlineResult = await this.call('prose:outline', outlinePrompt, {
      maxTokens: 3200,
      temperature: 0.75,
      validate: parseProseOutline,
    });
    addUsage(usage, outlineResult.usage);

    const draftPrompt = buildDraftPrompt(this.run, options, outlineResult.data);
    const draftResult = await this.call('prose:draft', draftPrompt, {
      maxTokens: 12000,
      temperature: 0.9,
      validate: parseProseDraft,
    });
    addUsage(usage, draftResult.usage);

    return {
      outline: outlineResult.data,
      draft: draftResult.data,
      usage,
      markdown: renderProseMarkdown({ outline: outlineResult.data, draft: draftResult.data }),
    };
  }
}
