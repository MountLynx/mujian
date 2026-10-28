import {
  ABILITY_KEYS,
  type AbilityKey,
  type ActionCategory,
  type AdjudicationDraft,
  type BeatOpeningDraft,
  type CharacterStateChange,
  type ConditionSeed,
  type Ending,
  type ExternalEventProposal,
  type OutcomeNote,
  type PrivateCue,
  type ProposedAction,
  type ProposedReaction,
  type ResolutionDraft,
  type TimeJump,
  type WorldStateChange,
} from '../types.ts';
import { ABILITY_META } from '../types.ts';
import { asNumber, asString, asStringArray, clamp } from '../utils.ts';

type Raw = Record<string, unknown>;

function object(value: unknown, label: string): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是一个对象`);
  }
  return value as Raw;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} 必须是数组`);
  return value;
}

function text(value: unknown, label: string, opts: { optional?: boolean } = {}): string {
  const result = asString(value);
  if (!result && !opts.optional) throw new Error(`${label} 不能为空`);
  return result;
}

function bool(value: unknown, label: string): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '是' || value === '继续') return true;
  if (value === 'false' || value === '否' || value === '放弃') return false;
  throw new Error(`${label} 必须是布尔值`);
}

function ability(value: unknown, fallback: AbilityKey = 'will'): AbilityKey {
  const key = asString(value).toLowerCase();
  if ((ABILITY_KEYS as readonly string[]).includes(key)) return key as AbilityKey;
  for (const [abilityKey, meta] of Object.entries(ABILITY_META)) {
    if (value === meta.label || key === meta.label) return abilityKey as AbilityKey;
  }
  return fallback;
}

const CATEGORIES: ActionCategory[] = ['调查', '交涉', '行动', '战斗', '技术', '观察', '其他'];

function category(value: unknown): ActionCategory {
  const raw = asString(value);
  if (CATEGORIES.includes(raw as ActionCategory)) return raw as ActionCategory;
  if (/战|攻|击|夺|抢|制伏|开火/.test(raw)) return '战斗';
  if (/说|谈|劝|问|询|骗|唬|安慰|说服/.test(raw)) return '交涉';
  if (/查|搜|读|听|看|观察|监视|搜索/.test(raw)) return '调查';
  if (/修|拆|接|操作|医|疗|开锁|技术/.test(raw)) return '技术';
  if (/潜|跑|躲|闪|移|爬|跳/.test(raw)) return '行动';
  return '其他';
}

export function parseProposedAction(
  value: unknown,
  characterIds: Set<string>,
  selfId: string,
): ProposedAction {
  const root = object(value, '角色输出');
  const action = object(root.action ?? value, '行动');
  const targetRaw = asString(action.target_id ?? action.targetId);
  const targetId =
    targetRaw && characterIds.has(targetRaw) && targetRaw !== selfId ? targetRaw : null;
  const deed = text(action.deed ?? action.description, 'deed');
  const effect = text(
    action.effect ?? action.intent ?? action.goal_progress ?? action.goalProgress,
    'effect',
    { optional: true },
  ) || deed;
  const rawHostile = action.hostile ?? action.isHostile ?? action.is_hostile;
  const hostile = rawHostile === true || rawHostile === 'true' || rawHostile === '是';
  return {
    thought: text(root.thought, 'thought', { optional: true }),
    category: category(action.category),
    summary: text(action.summary, 'summary'),
    deed,
    effect,
    hostile,
    ability: ability(action.ability),
    trait: asString(action.trait ?? action.trait_name ?? action.traitName) || null,
    targetId,
    dialogue: text(action.dialogue, 'dialogue', { optional: true }),
    goalProgress: text(action.goal_progress ?? action.goalProgress, 'goal_progress', { optional: true }),
    stakes: text(action.stakes, 'stakes', { optional: true }),
  };
}

export function parseProposedReaction(value: unknown): ProposedReaction {
  const root = object(value, '回应输出');
  const reaction = object(root.reaction ?? root, '回应');
  return {
    thought: text(root.thought, 'thought', { optional: true }),
    continueOriginal: bool(root.continue_original ?? root.continueOriginal, 'continue_original'),
    stance: text(reaction.stance, 'stance', { optional: true }) || '随机应变',
    summary: text(reaction.summary, 'summary'),
    description: text(reaction.description, 'description'),
    ability: ability(reaction.ability),
    trait: asString(reaction.trait ?? reaction.trait_name ?? reaction.traitName) || null,
    dialogue: text(reaction.dialogue, 'dialogue', { optional: true }),
  };
}

export function parseBeatOpening(
  value: unknown,
  characterIds: Set<string>,
): BeatOpeningDraft {
  const root = object(value, '开场输出');
  const cueRaw = Array.isArray(root.private_cues) ? root.private_cues : [];
  const privateCues: PrivateCue[] = [];
  for (const item of cueRaw) {
    if (!item || typeof item !== 'object') continue;
    const cue = item as Raw;
    const characterId = asString(cue.character_id ?? cue.characterId);
    const content = asString(cue.cue);
    if (!characterIds.has(characterId) || !content) continue;
    privateCues.push({ characterId, cue: content });
  }
  return {
    title: text(root.title, 'title').slice(0, 40),
    publicBrief: text(root.public_brief ?? root.publicBrief, 'public_brief'),
    privateCues,
    pressure: text(root.pressure, 'pressure', { optional: true }),
    sceneQuestion: text(root.scene_question ?? root.sceneQuestion, 'scene_question', { optional: true }),
    gmNote: text(root.gm_note ?? root.gmNote, 'gm_note', { optional: true }),
  };
}

export function difficultyLabelForDc(dc: number): string {
  if (dc <= 10) return '轻而易举';
  if (dc <= 12) return '容易';
  if (dc <= 15) return '标准';
  if (dc <= 18) return '困难';
  if (dc <= 21) return '艰巨';
  if (dc <= 24) return '几近不可能';
  return '超出常理';
}

export interface AdjudicationDraftBundle {
  adjudications: AdjudicationDraft[];
  externalEvents: ExternalEventProposal[];
}

export function parseAdjudications(
  value: unknown,
  actionIds: Set<string>,
): AdjudicationDraftBundle {
  const root = object(value, '裁定输出');
  const list = array(root.adjudications, 'adjudications');
  const result: AdjudicationDraft[] = [];
  const seen = new Set<string>();
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Raw;
    const actionId = asString(raw.action_id ?? raw.actionId);
    if (!actionIds.has(actionId) || seen.has(actionId)) continue;
    const dc = Math.round(clamp(asNumber(raw.dc, 15), 5, 30));
    const modifier = Math.round(clamp(asNumber(raw.modifier, 0), -3, 3));
    result.push({
      actionId,
      difficultyLabel: asString(raw.difficulty_label ?? raw.difficultyLabel, difficultyLabelForDc(dc)),
      dc,
      modifier,
      reason: asString(raw.reason, '导演未说明裁定依据。'),
      risk: asString(raw.risk, '导演未说明风险。'),
    });
    seen.add(actionId);
  }
  if (!result.length) throw new Error('adjudications 中没有可识别的 action_id');
  const rawEvents = Array.isArray(root.external_events ?? root.externalEvents)
    ? (root.external_events ?? root.externalEvents) as unknown[]
    : [];
  const externalEvents: ExternalEventProposal[] = [];
  for (const item of rawEvents.slice(0, 1)) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Raw;
    const description = asString(raw.description).trim();
    const fact = asString(raw.fact).trim();
    if (!description || !fact) continue;
    const rawLikelihood = asString(raw.likelihood);
    const likelihood =
      rawLikelihood === 'routine' || rawLikelihood === 'possible' || rawLikelihood === 'unlikely'
        ? rawLikelihood
        : 'possible';
    externalEvents.push({
      description,
      likelihood,
      fact,
      reason: asString(raw.reason, '独立于角色行动的客观变化。'),
    });
  }
  return { adjudications: result, externalEvents };
}

function parseConditionSeeds(value: unknown): ConditionSeed[] {
  if (!Array.isArray(value)) return [];
  const conditions: ConditionSeed[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Raw;
    const name = asString(raw.name);
    if (!name) continue;
    const abilitiesRaw = Array.isArray(raw.abilities) ? raw.abilities : [];
    const abilities = abilitiesRaw
      .map((entry) => ability(entry))
      .filter((entry, index, arr) => arr.indexOf(entry) === index);
    const rawKind = asString(raw.kind);
    const kind = ['injury', 'emotion', 'boon', 'other'].includes(rawKind)
      ? (rawKind as ConditionSeed['kind'])
      : 'other';
    const visibilityRaw = asString(raw.visibility);
    const visibility =
      visibilityRaw === 'public' || visibilityRaw === 'private'
        ? visibilityRaw
        : kind === 'emotion'
          ? 'private'
          : 'public';
    conditions.push({
      name,
      description: asString(raw.description),
      modifier: Math.round(clamp(asNumber(raw.modifier, 0), -4, 4)),
      kind,
      visibility,
      ...(abilities.length ? { abilities } : {}),
    });
  }
  return conditions;
}

function parseCharacterChanges(
  value: unknown,
  characterIds: Set<string>,
): CharacterStateChange[] {
  if (!Array.isArray(value)) return [];
  const changes: CharacterStateChange[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Raw;
    const characterId = asString(raw.character_id ?? raw.characterId);
    if (!characterIds.has(characterId)) continue;
    const memoryRaw = raw.memory;
    let memory: CharacterStateChange['memory'] = null;
    if (memoryRaw && typeof memoryRaw === 'object') {
      const mem = memoryRaw as Raw;
      const summary = asString(mem.summary);
      if (summary) {
        memory = {
          summary,
          importance: Math.round(clamp(asNumber(mem.importance, 2), 1, 5)),
        };
      }
    }
    changes.push({
      characterId,
      stressDelta: Math.round(clamp(asNumber(raw.stress_delta ?? raw.stressDelta, 0), -5, 5)),
      conditionsAdd: parseConditionSeeds(raw.conditions_add ?? raw.conditionsAdd),
      conditionsRemove: asStringArray(raw.conditions_remove ?? raw.conditionsRemove).slice(0, 4),
      inventoryAdd: asStringArray(raw.inventory_add ?? raw.inventoryAdd).slice(0, 3),
      inventoryRemove: asStringArray(raw.inventory_remove ?? raw.inventoryRemove).slice(0, 3),
      privateNote: asString(raw.private_note ?? raw.privateNote),
      memory,
    });
  }
  return changes;
}

function parseWorldChange(value: unknown): WorldStateChange {
  const raw = value && typeof value === 'object' ? (value as Raw) : {};
  const flagsRaw = raw.flags_set ?? raw.flagsSet;
  const flagsSet: Record<string, string | number | boolean> = {};
  if (flagsRaw && typeof flagsRaw === 'object' && !Array.isArray(flagsRaw)) {
    for (const [key, entry] of Object.entries(flagsRaw as Raw)) {
      if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
        flagsSet[key.slice(0, 60)] = typeof entry === 'string' ? entry.slice(0, 500) : entry;
      }
    }
  }
  return {
    factsAdd: asStringArray(raw.public_facts_add ?? raw.factsAdd).slice(0, 3),
    factsRemove: asStringArray(raw.public_facts_remove ?? raw.factsRemove).slice(0, 2),
    flagsSet,
    pressure: asString(raw.pressure),
    sceneTitle: asString(raw.scene_title ?? raw.sceneTitle),
  };
}

function parseTimeJump(value: unknown): TimeJump {
  const raw = object(value, 'next_time_jump');
  const elapsedMinutes = Math.round(
    clamp(asNumber(raw.elapsed_minutes ?? raw.elapsedMinutes, 8), 1, 360),
  );
  return {
    elapsedMinutes,
    label: text(raw.label, 'next_time_jump.label', { optional: true }) || `约 ${elapsedMinutes} 分钟后`,
    reason: text(raw.reason, 'next_time_jump.reason', { optional: true }) || '事件的余波推动时间向前。',
  };
}

function parseEnding(value: unknown): Ending | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Raw;
  const headline = asString(raw.headline);
  const epilogue = asString(raw.epilogue);
  if (!headline || !epilogue) return null;
  return {
    headline,
    epilogue,
    finalImage: asString(raw.final_image ?? raw.finalImage) || undefined,
  };
}

export function parseResolution(
  value: unknown,
  characterIds: Set<string>,
): ResolutionDraft {
  const root = object(value, '收束输出');
  const stateChangesRaw = object(root.state_changes ?? root.stateChanges, 'state_changes');
  const notesRaw = Array.isArray(root.outcome_notes ?? root.outcomeNotes)
    ? (root.outcome_notes ?? root.outcomeNotes) as unknown[]
    : [];
  const outcomeNotes: OutcomeNote[] = [];
  for (const item of notesRaw) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Raw;
    const characterId = asString(raw.character_id ?? raw.characterId);
    const note = asString(raw.note);
    if (characterIds.has(characterId) && note) {
      outcomeNotes.push({ characterId, note });
    }
  }
  return {
    narration: text(root.narration, 'narration'),
    outcomeNotes,
    stateChanges: {
      characters: parseCharacterChanges(
        stateChangesRaw.characters,
        characterIds,
      ),
      world: parseWorldChange(stateChangesRaw.world),
    },
    nextTimeJump: parseTimeJump(root.next_time_jump ?? root.nextTimeJump),
    ending: parseEnding(root.ending),
  };
}
