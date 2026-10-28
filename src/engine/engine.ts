import {
  type ActionRecord,
  type Adjudication,
  type Beat,
  type CharacterStateChange,
  type ExternalEventProposal,
  type ExternalEventResult,
  type PrivateCue,
  type ReactionRecord,
  type ResolutionDraft,
  type Run,
} from '../types.ts';
import { OUTCOME_META } from '../types.ts';
import {
  buildActionPrompt,
  buildAdjudicationPrompt,
  buildOpeningPrompt,
  buildReactionPrompt,
  buildResolutionPrompt,
} from '../llm/prompts.ts';
import {
  parseAdjudications,
  parseBeatOpening,
  parseProposedAction,
  parseProposedReaction,
  parseResolution,
  difficultyLabelForDc,
} from '../llm/parsers.ts';
import type { JsonCallResult, LanguageModel } from '../llm/client.ts';
import { thinkingForMode } from '../llm/client.ts';
import { resolveChecks } from '../rules/checks.ts';
import { clockForNextBeat, deadlineForRun, hasDelayFact, isDelayFactText } from './run.ts';
import {
  clamp,
  clockAfter,
  seededD20,
  mapConcurrent,
  newId,
  nowIso,
  truncate,
} from '../utils.ts';
import { config } from '../config.ts';

const MAX_EXTERNAL_EVENTS = 2;

export interface EngineHooks {
  persist?: (run: Run) => Promise<void>;
  log?: (message: string, detail?: unknown) => void;
}

function validTraitName(
  character: { traits: Array<{ name: string; ability?: string | null }> },
  traitName: string | null,
  ability: string,
): string | null {
  if (!traitName) return null;
  const trait = character.traits.find((entry) => entry.name === traitName);
  if (!trait) return null;
  if (trait.ability && trait.ability !== ability) return null;
  return trait.name;
}

export class RunEngine {
  private readonly run: Run;
  private readonly model: LanguageModel;
  private readonly hooks: EngineHooks;

  constructor(run: Run, model: LanguageModel, hooks: EngineHooks = {}) {
    this.run = run;
    this.model = model;
    this.hooks = hooks;
  }

  private async save(): Promise<void> {
    this.run.updatedAt = nowIso();
    await this.hooks.persist?.(this.run);
  }

  private log(message: string, detail?: unknown): void {
    this.hooks.log?.(message, detail);
  }

  private setProgress(
    phase: Run['progress']['phase'],
    label: string,
    detail?: string,
    actorStates?: Run['progress']['actorStates'],
  ): void {
    this.run.progress = {
      phase,
      label,
      detail,
      actorStates,
      updatedAt: nowIso(),
    };
  }

  private trackUsage(result: JsonCallResult<unknown>): void {
    const usage = result.usage;
    this.run.llm.calls += usage.calls;
    this.run.llm.promptTokens += usage.promptTokens;
    this.run.llm.completionTokens += usage.completionTokens;
    this.run.llm.cachedTokens += usage.cachedTokens;
    this.run.llm.reasoningTokens += usage.reasoningTokens;
    this.run.llm.totalTokens += usage.totalTokens;
    this.run.llm.failures += usage.failures;
  }

  private async call<T>(
    label: string,
    thinking: boolean,
    options: {
      system: string;
      user: string;
      schemaHint: string;
      maxTokens: number;
      temperature: number;
      validate: (value: unknown) => T;
    },
  ): Promise<T> {
    const result = await this.model.callJson<T>({
      label,
      system: options.system,
      user: options.user,
      schemaHint: options.schemaHint,
      thinking,
      maxTokens: options.maxTokens,
      temperature: options.temperature,
      validate: options.validate,
      onRetry: (info) => {
        this.run.progress.detail = `模型重试（第 ${info.attempt} 次）：${truncate(info.reason, 140)}`;
        this.run.progress.updatedAt = nowIso();
      },
    });
    this.trackUsage(result);
    this.log(`${label} 完成`, {
      latencyMs: result.latencyMs,
      totalTokens: result.usage.totalTokens,
      thinking: result.thinking,
    });
    return result.data;
  }

  async advanceOne(): Promise<Run> {
    if (this.run.ending) throw new Error('本场已经结束。');
    this.run.status = 'running';
    this.run.error = null;
    this.run.startedAt ??= nowIso();
    this.setProgress('idle', '正在准备这一刻');
    await this.save();

    try {
      const beat = await this.ensureBeat();
      if (beat.phase === 'opening') await this.runOpening(beat);
      if (beat.phase === 'actions') await this.runActions(beat);
      if (beat.phase === 'adjudication') await this.runAdjudication(beat);
      if (beat.phase === 'reactions') await this.runReactions(beat);
      if (beat.phase === 'rolling') await this.runRolls(beat);
      if (beat.phase === 'resolution') await this.runResolution(beat);
      if (beat.phase !== 'complete') {
        throw new Error(`无法识别的幕阶段：${beat.phase}`);
      }

      this.setProgress(
        'idle',
        this.run.ending ? '故事已经收束' : '等待下一时刻',
      );
      if (this.run.ending) {
        this.run.status = 'ended';
        this.run.endedAt ??= nowIso();
      } else {
        this.run.status = 'ready';
      }
      await this.save();
      return this.run;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.run.status = 'error';
      this.run.error = truncate(message, 1200);
      this.setProgress('idle', '本刻中断，可从断点重试');
      this.log('推演中断', { message });
      await this.save();
      throw error;
    }
  }

  private async ensureBeat(): Promise<Beat> {
    const last = this.run.beats.at(-1);
    if (last && last.phase !== 'complete') return last;

    const index = this.run.beats.length;
    const { clock, jump } = clockForNextBeat(this.run);
    const beat: Beat = {
      id: newId('beat'),
      index,
      title: '未命名的时刻',
      phase: 'opening',
      clock,
      timeJump: jump,
      publicBrief: '',
      privateCues: [],
      pressure: this.run.world.pressure,
      sceneQuestion: '',
      gmNote: '',
      actions: [],
      adjudications: [],
      reactions: [],
      externalEvents: [],
      narration: '',
      outcomeNotes: [],
      stateChanges: null,
      nextTimeJump: null,
      ending: null,
      createdAt: nowIso(),
    };
    this.run.beats.push(beat);
    this.run.clock = clock;
    this.run.world.sceneTitle = jump?.label ?? this.run.world.sceneTitle;
    this.ensureDeadlineFact(clock.minutes);
    this.log(`进入第 ${index + 1} 刻`, { clock: clock.display, jump });
    await this.save();
    return beat;
  }

  private async runOpening(beat: Beat): Promise<void> {
    this.setProgress('opening', '导演正在布置此刻', '收束时间，派发每个人能感知到的信息。');
    await this.save();
    const prompt = buildOpeningPrompt({
      scenario: this.run.scenario,
      run: this.run,
      index: beat.index,
      clock: beat.clock,
      jump: beat.timeJump,
    });
    const draft = await this.call(
      `gm:opening:b${beat.index + 1}`,
      thinkingForMode(this.run.settings.thinking, 'gm'),
      {
        ...prompt,
        maxTokens: 6500,
        temperature: 0.8,
        validate: (value) =>
          parseBeatOpening(value, new Set(this.run.scenario.characters.map((character) => character.id))),
      },
    );

    beat.title = draft.title || `第 ${beat.index + 1} 刻`;
    beat.publicBrief = draft.publicBrief;
    beat.privateCues = this.completePrivateCues(draft.privateCues);
    beat.pressure = draft.pressure || beat.pressure;
    beat.sceneQuestion = draft.sceneQuestion;
    beat.gmNote = draft.gmNote;
    this.run.world.pressure = beat.pressure;
    this.run.world.sceneTitle = beat.title;
    beat.phase = 'actions';
    this.log(`第 ${beat.index + 1} 刻开场：${beat.title}`);
    await this.save();
  }

  private completePrivateCues(cues: PrivateCue[]): PrivateCue[] {
    return this.run.scenario.characters.map((character) => {
      const found = cues.find((cue) => cue.characterId === character.id);
      return (
        found ?? {
          characterId: character.id,
          cue: '雨声把这刻压低了一寸。你听见自己的呼吸，也意识到有件事你还没有说出口。',
        }
      );
    });
  }

  private async runActions(beat: Beat): Promise<void> {
    const existing = new Set(beat.actions.map((action) => action.characterId));
    const pending = this.run.scenario.characters.filter(
      (character) => !character.passive && !existing.has(character.id),
    );
    if (!pending.length) {
      beat.phase = 'adjudication';
      await this.save();
      return;
    }
    const actorStates: NonNullable<Run['progress']['actorStates']> = {};
    for (const character of this.run.scenario.characters) {
      if (character.passive || existing.has(character.id)) actorStates[character.id] = 'done';
      else actorStates[character.id] = 'writing';
    }
    this.setProgress(
      'actions',
      `角色正在决定举动 · ${pending.length} 人`,
      '他们彼此看不见本轮的选择。',
      actorStates,
    );
    await this.save();

    const failures: string[] = [];
    await mapConcurrent(pending, config.llm.actionConcurrency, async (character) => {
      const runtime = this.run.characters[character.id]!;
      const prompt = buildActionPrompt({
        scenario: this.run.scenario,
        run: this.run,
        definition: character,
        runtime,
        beat,
      });
      this.log(`角色行动生成：${character.name}`);
      try {
        const draft = await this.call(
          `actor:action:${character.id}:b${beat.index + 1}`,
          thinkingForMode(this.run.settings.thinking, 'character'),
          {
            ...prompt,
            maxTokens: 4200,
            temperature: 0.85,
            validate: (value) =>
              parseProposedAction(
                value,
                new Set(this.run.scenario.characters.map((entry) => entry.id)),
                character.id,
              ),
          },
        );
        const target = draft.targetId
          ? this.run.scenario.characters.find((entry) => entry.id === draft.targetId)
          : null;
        const action: ActionRecord = {
          id: newId('act'),
          characterId: character.id,
          category: draft.category,
          summary: draft.summary,
          deed: draft.deed,
          effect: draft.effect,
          hostile: draft.hostile,
          description: draft.deed,
          dialogue: draft.dialogue,
          thought: draft.thought,
          goalProgress: draft.goalProgress,
          stakes: draft.stakes,
          ability: draft.ability,
          traitName: validTraitName(character, draft.trait, draft.ability),
          targetId: draft.targetId,
          targetLabel: target?.name,
          status: 'declared',
          penalties: 0,
          penaltyNotes: [],
          generatedBy: 'llm',
          createdAt: nowIso(),
        };
        if (!beat.actions.some((entry) => entry.characterId === character.id)) {
          beat.actions.push(action);
        }
        this.run.progress.actorStates![character.id] = 'done';
        this.run.progress.detail = `${character.name} 已经做出选择。`;
        await this.save();
      } catch (error) {
        failures.push(
          `${character.name}：${error instanceof Error ? truncate(error.message, 240) : String(error)}`,
        );
        this.log('角色举动生成失败', { character: character.name, error: String(error) });
      }
    });

    beat.actions.sort(
      (a, b) =>
        this.run.scenario.characters.findIndex((entry) => entry.id === a.characterId) -
        this.run.scenario.characters.findIndex((entry) => entry.id === b.characterId),
    );
    await this.save();
    if (failures.length) {
      throw new Error(`有角色的行动未能生成，重试只会补写缺失的人。\n${failures.join('\n')}`);
    }
    beat.phase = 'adjudication';
    await this.save();
  }

  private async runAdjudication(beat: Beat): Promise<void> {
    this.setProgress('adjudication', '导演正在裁定难度', '每个行动都将有明确的 DC 与风险。');
    await this.save();
    const externalEventBudget = Math.max(
      0,
      MAX_EXTERNAL_EVENTS -
        this.run.beats.flatMap((entry) => entry.externalEvents ?? []).length,
    );
    const prompt = buildAdjudicationPrompt({
      scenario: this.run.scenario,
      run: this.run,
      beat,
      externalEventBudget,
    });
    const bundle = await this.call(
      `gm:adjudication:b${beat.index + 1}`,
      thinkingForMode(this.run.settings.thinking, 'gm'),
      {
        ...prompt,
        maxTokens: 5000,
        temperature: 0.35,
        validate: (value) =>
          parseAdjudications(
            value,
            new Set(beat.actions.map((action) => action.id)),
          ),
      },
    );
    const drafts = bundle.adjudications;
    const byId = new Map(drafts.map((draft) => [draft.actionId, draft]));
    const adjudications: Adjudication[] = beat.actions.map((action) => {
      const draft = byId.get(action.id);
      if (draft) return { ...draft, actionId: action.id };
      return {
        actionId: action.id,
        difficultyLabel: difficultyLabelForDc(15),
        dc: 15,
        modifier: 0,
        reason: '导演未提供这条裁定，按标准难度处理。',
        risk: '行动失败会暴露意图，并让局势向不利方向移动。',
      };
    });
    beat.adjudications = adjudications;
    beat.externalEvents = this.resolveExternalEvents(beat, bundle.externalEvents);
    const missing = beat.actions.length - drafts.length;
    if (missing > 0) {
      this.log(`裁定遗漏 ${missing} 条，已按 DC 15 补齐。`);
    }
    beat.phase = 'reactions';
    await this.save();
  }

  private incomingActions(beat: Beat, targetId: string): ActionRecord[] {
    return beat.actions.filter(
      (action) => action.targetId === targetId && action.hostile !== false,
    );
  }

  private async runReactions(beat: Beat): Promise<void> {
    const targets = new Set(
      beat.actions
        .filter((action) => action.hostile !== false)
        .map((action) => action.targetId)
        .filter((id): id is string => Boolean(id))
        .filter((id) => !this.run.scenario.characters.find((entry) => entry.id === id)?.passive),
    );
    const existing = new Set(beat.reactions.map((reaction) => reaction.characterId));
    const pending = [...targets].filter((id) => !existing.has(id));
    if (!pending.length) {
      beat.phase = 'rolling';
      await this.save();
      return;
    }

    const actorStates: NonNullable<Run['progress']['actorStates']> = {};
    for (const character of this.run.scenario.characters) {
      actorStates[character.id] = targets.has(character.id)
        ? existing.has(character.id)
          ? 'done'
          : 'writing'
        : 'done';
    }
    this.setProgress(
      'reactions',
      `被卷入者正在回应 · ${pending.length} 人`,
      '他们可以选择继续原举动并承担分心，或放下原举动。',
      actorStates,
    );
    await this.save();

    const failures: string[] = [];
    await mapConcurrent(pending, config.llm.actionConcurrency, async (characterId) => {
      const definition = this.run.scenario.characters.find((entry) => entry.id === characterId);
      const runtime = this.run.characters[characterId];
      if (!definition || !runtime) return;
      const ownAction = beat.actions.find((action) => action.characterId === characterId) ?? null;
      const incoming = this.incomingActions(beat, characterId)
        .map((action) => {
          const actor = this.run.scenario.characters.find((entry) => entry.id === action.characterId);
          return actor ? { action, actor } : null;
        })
        .filter((entry): entry is { action: ActionRecord; actor: typeof definition } => Boolean(entry));
      const prompt = buildReactionPrompt({
        scenario: this.run.scenario,
        run: this.run,
        definition,
        runtime,
        beat,
        ownAction,
        incoming,
      });
      this.log(`回应生成：${definition.name}`);
      try {
        const draft = await this.call(
          `actor:reaction:${characterId}:b${beat.index + 1}`,
          thinkingForMode(this.run.settings.thinking, 'reaction'),
          {
            ...prompt,
            maxTokens: 4200,
            temperature: 0.8,
            validate: parseProposedReaction,
          },
        );
        const reaction: ReactionRecord = {
          id: newId('rxn'),
          characterId,
          incomingActionIds: incoming.map((entry) => entry.action.id),
          continueOriginal: draft.continueOriginal,
          summary: draft.summary,
          description: draft.description,
          dialogue: draft.dialogue,
          thought: draft.thought,
          ability: draft.ability,
          traitName: validTraitName(definition, draft.trait, draft.ability),
          stance: draft.stance,
          createdAt: nowIso(),
        };
        if (!beat.reactions.some((entry) => entry.characterId === characterId)) {
          beat.reactions.push(reaction);
        }
        this.run.progress.actorStates![characterId] = 'done';
        this.run.progress.detail = `${definition.name} 已经做出回应。`;
        await this.save();
      } catch (error) {
        failures.push(
          `${definition.name}：${error instanceof Error ? truncate(error.message, 240) : String(error)}`,
        );
        this.log('回应生成失败', { character: definition.name, error: String(error) });
      }
    });

    beat.reactions.sort(
      (a, b) =>
        this.run.scenario.characters.findIndex((entry) => entry.id === a.characterId) -
        this.run.scenario.characters.findIndex((entry) => entry.id === b.characterId),
    );
    await this.save();
    if (failures.length) {
      throw new Error(`有角色未能做出回应，重试只会补写缺失的人。\n${failures.join('\n')}`);
    }
    beat.phase = 'rolling';
    await this.save();
  }

  private async runRolls(beat: Beat): Promise<void> {
    this.setProgress('rolling', '骰子正在落下', '点数与特质、状态、分心惩罚已完成合计。');
    await this.save();

    const characters = Object.fromEntries(
      this.run.scenario.characters.map((definition) => [
        definition.id,
        { definition, runtime: this.run.characters[definition.id]! },
      ]),
    );
    const resolved = resolveChecks({
      seed: this.run.seed,
      beatIndex: beat.index,
      characters,
      actions: beat.actions,
      reactions: beat.reactions,
      adjudications: beat.adjudications,
    });
    beat.actions = resolved.actions;
    beat.reactions = resolved.reactions;
    beat.phase = 'resolution';
    this.setProgress('resolution', '导演正在收束这一刻', '叙事、状态变化与下一段时间正在成形。');
    await this.save();
  }

  private async runResolution(beat: Beat): Promise<void> {
    this.ensureDeadlineFact(beat.clock.minutes);
    const prompt = buildResolutionPrompt({
      scenario: this.run.scenario,
      run: this.run,
      beat,
      adjudications: beat.adjudications,
    });
    const draft = await this.call(
      `gm:resolution:b${beat.index + 1}`,
      thinkingForMode(this.run.settings.thinking, 'gm'),
      {
        ...prompt,
        maxTokens: 9000,
        temperature: 0.82,
        validate: (value) => {
          const draft = parseResolution(
            value,
            new Set(this.run.scenario.characters.map((character) => character.id)),
          );
          this.validateDeadlineResolution(beat, draft);
          return draft;
        },
      },
    );

    beat.narration = draft.narration;
    beat.outcomeNotes = draft.outcomeNotes;
    beat.nextTimeJump = draft.nextTimeJump;
    beat.stateChanges = draft.stateChanges;
    beat.ending = draft.ending;
    this.applyStateChanges(beat, draft.stateChanges);
    beat.phase = 'complete';
    beat.completedAt = nowIso();
    if (draft.ending) {
      this.run.ending = draft.ending;
      this.run.endedAt = nowIso();
    }
    this.setProgress('between', '这一刻已经落定');
    this.log(`第 ${beat.index + 1} 刻完成`, {
      timeJump: draft.nextTimeJump,
      ending: Boolean(draft.ending),
    });
    await this.save();
  }

  private resolveExternalEvents(
    beat: Beat,
    proposals: ExternalEventProposal[],
  ): ExternalEventResult[] {
    if (!proposals.length) return [];
    const used = this.run.beats.flatMap((entry) => entry.externalEvents ?? []).length;
    const remaining = Math.max(0, MAX_EXTERNAL_EVENTS - used);
    const accepted = proposals.slice(0, Math.min(1, remaining));
    const deadline = deadlineForRun(this.run);
    return accepted.map((proposal, index) => {
      const base = proposal.likelihood === 'routine' ? 8 : proposal.likelihood === 'unlikely' ? 18 : 13;
      // An event that would delay an established deadline is harder to pull off.
      const deadlinePenalty = deadline && isDelayFactText(proposal.fact) ? 5 : 0;
      const dc = base + deadlinePenalty;
      const natural = seededD20(this.run.seed, `external:${beat.index}:${index}`);
      const success = natural === 20 || (natural !== 1 && natural >= dc);
      if (success) {
        const fact = proposal.fact.trim();
        if (fact && !this.run.world.publicFacts.includes(fact)) {
          this.run.world.publicFacts = [...this.run.world.publicFacts, fact].slice(-30);
        }
      }
      this.log('外部事件检定', {
        description: proposal.description,
        likelihood: proposal.likelihood,
        d20: natural,
        dc,
        success,
      });
      return {
        id: newId('event'),
        description: proposal.description,
        likelihood: proposal.likelihood,
        fact: proposal.fact,
        reason: proposal.reason,
        dc,
        natural,
        success,
        createdAt: nowIso(),
      };
    });
  }

  /**
   * A fact in public state is not enough if the prose immediately overrides it.
   * After the deadline, a "still at the dock" resolution must either write the
   * departure or establish a new public delay fact; otherwise retry the call.
   */
  private validateDeadlineResolution(beat: Beat, draft: ResolutionDraft): void {
    const deadline = deadlineForRun(this.run);
    if (!deadline) return;
    const next = clockAfter(beat.clock.minutes, draft.nextTimeJump.elapsedMinutes);
    if (next.minutes < deadline.absoluteMinutes) return;
    const addedFacts = draft.stateChanges.world.factsAdd.join('\n');
    const addedDelay = draft.stateChanges.world.factsAdd.some((fact) => isDelayFactText(fact));
    if (hasDelayFact(this.run) || addedDelay) return;

    const stillTherePattern =
      /(船|渡轮|火车|列车|班车|末班|跳板|舱门|闸口|店门)[^。！？\n]{0,40}(没有离岸|没离岸|没有开|还没开|还没走|还没离|停在原地|没有动|没动|还停在|未开|未离|没有拉笛|没拉笛|还在等|还搭着|仍搭着|没有靠岸|没靠岸|未靠岸)/;
    if (next.minutes === deadline.absoluteMinutes && stillTherePattern.test(addedFacts)) {
      throw new Error(
        `public_facts_add 把 ${deadline.clock} 的期限对象写成仍未发生，却没有“晚点/停航/取消”的公开延迟事实。` +
          `这会冻结期限；请写它已经完成，或明确建立延迟事实。已写入的公开事实：${deadline.fact}`,
      );
    }
    if (next.minutes <= deadline.absoluteMinutes) return;

    const text = `${draft.narration}\n${draft.nextTimeJump.reason}\n${draft.nextTimeJump.label}`;
    if (!stillTherePattern.test(text)) return;
    throw new Error(
      `本刻时间会越过 ${deadline.clock} 的期限，但没有新的“晚点/停航/取消”公开事实；不能把已经到期的世界事件写成尚未发生。` +
        `请写它已经完成，或在 public_facts_add 里明确建立延迟事实。已写入的公开事实：${deadline.fact}`,
    );
  }

  /**
   * A hard world clock is not an ending condition. When the deadline is reached
   * and no delay has been established as a new public fact, write the world
   * fact that closes the option (e.g. "the last ferry has left"). The characters
   * still choose how to respond; the engine does not choose an ending.
   */
  private ensureDeadlineFact(currentMinutes: number): void {
    const deadline = deadlineForRun(this.run);
    if (!deadline || currentMinutes <= deadline.absoluteMinutes) return;
    if (hasDelayFact(this.run)) return;
    if (!this.run.world.publicFacts.includes(deadline.fact)) {
      this.run.world.publicFacts = [...this.run.world.publicFacts, deadline.fact].slice(-30);
      this.log('期限已到，写入公开事实', { deadline: deadline.clock, fact: deadline.fact });
    }
    this.run.world.flags.deadline_passed = true;
  }

  private applyStateChanges(
    beat: Beat,
    changes: NonNullable<Beat['stateChanges']>,
  ): void {
    for (const definition of this.run.scenario.characters) {
      const runtime = this.run.characters[definition.id]!;
      const change: CharacterStateChange | undefined = changes.characters.find(
        (entry) => entry.characterId === definition.id,
      );
      if (!change) {
        this.ensureMemory(beat, definition.id, null, '');
        continue;
      }
      for (const removeName of change.conditionsRemove) {
        runtime.conditions = runtime.conditions.filter(
          (condition) => condition.name !== removeName,
        );
      }
      for (const seed of change.conditionsAdd) {
        runtime.conditions = runtime.conditions.filter(
          (condition) => condition.name !== seed.name,
        );
        runtime.conditions.push({
          ...seed,
          id: newId('cond'),
          kind: seed.kind ?? 'other',
          sourceBeat: beat.index,
        });
      }
      for (const item of change.inventoryRemove) {
        runtime.inventory = runtime.inventory.filter((entry) => entry !== item);
      }
      for (const item of change.inventoryAdd) {
        if (item && !runtime.inventory.includes(item)) runtime.inventory.push(item);
      }
      runtime.stress = clamp(runtime.stress + change.stressDelta, 0, 10);
      this.ensureMemory(beat, definition.id, change.memory, change.privateNote);
    }

    const world = changes.world;
    const removed = new Set(world.factsRemove.map((fact) => fact.trim()));
    const facts = this.run.world.publicFacts.filter((fact) => !removed.has(fact.trim()));
    for (const fact of world.factsAdd) {
      const clean = fact.trim();
      if (clean && !facts.includes(clean)) facts.push(clean);
    }
    this.run.world.publicFacts = facts.slice(-30);
    this.run.world.flags = {
      ...this.run.world.flags,
      ...world.flagsSet,
    };
    if (world.pressure) this.run.world.pressure = world.pressure;
    if (world.sceneTitle) this.run.world.sceneTitle = world.sceneTitle;
    beat.stateChanges = changes;
  }

  private ensureMemory(
    beat: Beat,
    characterId: string,
    gmMemory: { summary: string; importance: number } | null,
    privateNote: string,
  ): void {
    const runtime = this.run.characters[characterId];
    if (!runtime) return;
    const definition = this.run.scenario.characters.find((entry) => entry.id === characterId);
    const own = beat.actions.find((action) => action.characterId === characterId);
    const resultText = own
      ? own.status === 'abandoned'
        ? `你原本想${own.summary}，但为了回应压力放下了它`
        : `你做了${own.summary}，效果是${own.outcome ? OUTCOME_META[own.outcome].label : '未完成'}`
      : definition?.passive
        ? '你在场，但没有主动行动'
        : '你目睹了这一刻';
    const fallbackSummary = truncate(
      `第 ${beat.index + 1} 刻「${beat.title}」：${resultText}。${beat.narration}`,
      190,
    );
    const summary = gmMemory?.summary?.trim() || fallbackSummary;
    const detailParts: string[] = [];
    if (gmMemory?.summary && beat.narration) detailParts.push(truncate(beat.narration, 280));
    if (privateNote) detailParts.push(`只有你知道：${privateNote}`);
    if (!gmMemory?.summary && own?.description) detailParts.unshift(`你当时的动作：${truncate(own.description, 180)}`);
    runtime.memories.push({
      id: newId('mem'),
      at: beat.clock.display,
      beatIndex: beat.index,
      summary,
      detail: detailParts.length ? detailParts.join(' ') : undefined,
      importance: gmMemory ? clamp(Math.round(gmMemory.importance), 1, 5) : 2,
      kind: privateNote ? 'observation' : 'event',
      source: gmMemory ? 'gm' : 'event',
    });
    // Keep the prompt bounded in long campaigns while preserving importance.
    if (runtime.memories.length > 30) {
      const sorted = [...runtime.memories].sort((a, b) => {
        if (a.kind === 'backstory' && b.kind !== 'backstory') return -1;
        if (b.kind === 'backstory' && a.kind !== 'backstory') return 1;
        return b.importance - a.importance;
      });
      const keep = new Set(sorted.slice(0, 26).map((memory) => memory.id));
      runtime.memories = runtime.memories.filter((memory) => keep.has(memory.id));
    }
  }
}
