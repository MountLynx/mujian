import {
  ABILITY_KEYS,
  type AbilityKey,
  type ActionCategory,
  type ActionRecord,
  type Beat,
  type CharacterDefinition,
  type PlayAwaiting,
  type PlayConfig,
  type ReactionRecord,
  type Run,
  type Scenario,
} from '../types.ts';
import { newId, nowIso } from '../utils.ts';
import { validateTraitChoice } from '../rules/checks.ts';

/** A player submission that the engine cannot accept; surfaced as HTTP 400/409. */
export class PlayInputError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'PlayInputError';
    this.status = status;
  }
}

const CATEGORIES: ActionCategory[] = ['调查', '交涉', '行动', '战斗', '技术', '观察', '其他'];

function clipped(value: unknown, label: string, max: number, options: { required?: boolean } = {}): string {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text && options.required) throw new PlayInputError(`${label}不能为空。`);
  if (text.length > max) throw new PlayInputError(`${label}最多 ${max} 个字。`);
  return text;
}

/** A title is a convenience, not player input: derive it without rejecting long text. */
function derivedTitle(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return [...clean].slice(0, max).join('');
}

function boolean(value: unknown): boolean {
  return value === true || value === 'true' || value === 'on' || value === 1 || value === '1';
}

function ability(value: unknown): AbilityKey {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if ((ABILITY_KEYS as readonly string[]).includes(key)) return key as AbilityKey;
  throw new PlayInputError('请选择一项能力（体魄/敏捷/感知/智识/意志/风度）。');
}

function category(value: unknown): ActionCategory {
  const key = typeof value === 'string' ? value.trim() : '';
  return CATEGORIES.includes(key as ActionCategory) ? (key as ActionCategory) : '其他';
}

function traitName(
  definition: CharacterDefinition,
  value: unknown,
  usedAbility: AbilityKey,
): string | null {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name) return null;
  const trait = validateTraitChoice(definition, name, usedAbility);
  if (!trait) {
    throw new PlayInputError('这个特质不存在，或只能用于另一项能力。');
  }
  return trait.name;
}

export function isPlayRun(run: Run): boolean {
  return Boolean(run.play?.characterId);
}

export function playerCharacterId(run: Run): string | null {
  return run.play?.characterId ?? null;
}

export function playRevealed(run: Run): boolean {
  return !isPlayRun(run) || Boolean(run.play?.recapAt);
}

/** Which player input the persisted run is waiting for, if any. */
export function playAwaiting(run: Run): PlayAwaiting | null {
  if (!isPlayRun(run)) return null;
  const beat = run.beats.at(-1);
  if (!beat) return null;
  if (beat.phase === 'player_action') return 'action';
  if (beat.phase === 'player_reaction') return 'reaction';
  return null;
}

export function currentPlayBeat(run: Run): Beat | null {
  const beat = run.beats.at(-1);
  if (!beat || beat.phase === 'complete') return null;
  return beat;
}

export function playerCharacter(run: Run): CharacterDefinition | null {
  const id = playerCharacterId(run);
  return id ? (run.scenario.characters.find((character) => character.id === id) ?? null) : null;
}

/** Validate a requested player character against the scenario. */
export function resolvePlayCharacter(
  scenario: Scenario,
  characterId: unknown,
): CharacterDefinition {
  const id = typeof characterId === 'string' ? characterId.trim() : '';
  if (!id) throw new PlayInputError('扮演模式需要选择一个你要扮演的角色。');
  const character = scenario.characters.find((entry) => entry.id === id);
  if (!character) throw new PlayInputError('这个角色不在本场剧本里。');
  if (character.passive) throw new PlayInputError('被动角色不主动行动，不能被玩家扮演。');
  return character;
}

export function createPlayConfig(scenario: Scenario, characterId: unknown): PlayConfig {
  const character = resolvePlayCharacter(scenario, characterId);
  return {
    characterId: character.id,
    awaiting: null,
    recapAt: null,
    createdAt: nowIso(),
  };
}

function requireBeat(run: Run, phase: Beat['phase'], message: string): Beat {
  if (!isPlayRun(run)) throw new PlayInputError('这一场不是扮演模式。', 409);
  const beat = run.beats.at(-1);
  if (!beat || beat.phase !== phase) throw new PlayInputError(message, 409);
  return beat;
}

/**
 * Store the human's declared deed/effect. The engine treats it exactly like an
 * AI action record; the only difference is `generatedBy: 'player'`.
 */
export function submitPlayerAction(run: Run, input: unknown): ActionRecord {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const playerId = run.play!.characterId;
  const definition = run.scenario.characters.find((character) => character.id === playerId);
  if (!definition) throw new PlayInputError('找不到你要扮演的角色。', 409);
  const beat = requireBeat(run, 'player_action', '现在不是宣告举动的时候。');

  const deed = clipped(body.deed, '你做了什么', 1200, { required: true });
  const effect = clipped(body.effect, '你想要的效果', 600, { required: true });
  const summary = clipped(body.summary, '举动标题', 40) || derivedTitle(deed, 24);
  const dialogue = clipped(body.dialogue, '台词', 1200);
  const thought = clipped(body.thought, '内心盘算', 1200);
  const stakes = clipped(body.stakes, '风险', 600);
  const chosenAbility = ability(body.ability);
  const chosenTrait = traitName(definition, body.trait, chosenAbility);
  const rawTarget = typeof body.targetId === 'string' ? body.targetId.trim() : '';
  if (rawTarget === playerId) throw new PlayInputError('不能把这个举动指向你自己。');
  const target = rawTarget
    ? run.scenario.characters.find((character) => character.id === rawTarget)
    : null;
  if (rawTarget && !target) throw new PlayInputError('这个目标不在本场里。');
  if (beat.actions.some((action) => action.characterId === playerId)) {
    throw new PlayInputError('你这一刻的举动已经宣告过了。', 409);
  }

  const action: ActionRecord = {
    id: newId('act'),
    characterId: playerId,
    category: category(body.category),
    summary,
    deed,
    effect,
    hostile: Boolean(target) && boolean(body.hostile),
    description: deed,
    dialogue,
    thought,
    goalProgress: '',
    stakes,
    ability: chosenAbility,
    traitName: chosenTrait,
    targetId: target?.id ?? null,
    targetLabel: target?.name,
    status: 'declared',
    penalties: 0,
    penaltyNotes: [],
    generatedBy: 'player',
    createdAt: nowIso(),
  };
  beat.actions.push(action);
  beat.actions.sort(
    (a, b) =>
      run.scenario.characters.findIndex((entry) => entry.id === a.characterId) -
      run.scenario.characters.findIndex((entry) => entry.id === b.characterId),
  );
  beat.phase = 'actions';
  run.play!.awaiting = null;
  run.status = 'ready';
  run.error = null;
  run.progress = {
    phase: 'idle',
    label: '你的举动已经宣告',
    detail: '其余角色正在各自决定他们要做什么。',
    updatedAt: nowIso(),
  };
  return action;
}

/** Store the human's response to one or more hostile actions. */
export function submitPlayerReaction(run: Run, input: unknown): ReactionRecord {
  const body = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const playerId = run.play!.characterId;
  const definition = run.scenario.characters.find((character) => character.id === playerId);
  if (!definition) throw new PlayInputError('找不到你要扮演的角色。', 409);
  const beat = requireBeat(run, 'player_reaction', '现在不是回应的时候。');

  const description = clipped(body.description, '你的回应', 1200, { required: true });
  const summary = clipped(body.summary, '回应标题', 40) || derivedTitle(description, 24);
  const stance = clipped(body.stance, '回应姿态', 12) || '随机应变';
  const dialogue = clipped(body.dialogue, '台词', 1200);
  const thought = clipped(body.thought, '内心盘算', 1200);
  const chosenAbility = ability(body.ability);
  const chosenTrait = traitName(definition, body.trait, chosenAbility);
  if (beat.reactions.some((reaction) => reaction.characterId === playerId)) {
    throw new PlayInputError('你这一刻的回应已经做出了。', 409);
  }
  const incoming = beat.actions.filter(
    (action) => action.targetId === playerId && action.hostile !== false,
  );

  const reaction: ReactionRecord = {
    id: newId('rxn'),
    characterId: playerId,
    incomingActionIds: incoming.map((action) => action.id),
    continueOriginal: boolean(body.continueOriginal),
    summary,
    description,
    dialogue,
    thought,
    ability: chosenAbility,
    traitName: chosenTrait,
    stance,
    createdAt: nowIso(),
  };
  beat.reactions.push(reaction);
  beat.reactions.sort(
    (a, b) =>
      run.scenario.characters.findIndex((entry) => entry.id === a.characterId) -
      run.scenario.characters.findIndex((entry) => entry.id === b.characterId),
  );
  beat.phase = 'reactions';
  run.play!.awaiting = null;
  run.status = 'ready';
  run.error = null;
  run.progress = {
    phase: 'idle',
    label: '你的回应已经落下',
    detail: '骰子正在结算。',
    updatedAt: nowIso(),
  };
  return reaction;
}

/**
 * Reveal the complete record and close the play session. This is a one-way
 * operation: once the player has seen backstage data, continuing would be
 * both unfair and incoherent.
 */
export function unlockRecap(run: Run): void {
  if (!isPlayRun(run)) throw new PlayInputError('这一场不是扮演模式。', 409);
  if (run.play!.recapAt) return;
  if (run.status === 'running' || playAwaiting(run)) {
    throw new PlayInputError('这一刻还没有落定，无法复盘。', 409);
  }
  if (!run.beats.some((beat) => beat.phase === 'complete')) {
    throw new PlayInputError('还没有完成的时刻，无法复盘。', 409);
  }
  const at = nowIso();
  run.play!.recapAt = at;
  run.play!.awaiting = null;
  run.status = 'ended';
  run.error = null;
  run.endedAt ??= at;
  run.updatedAt = at;
  run.progress = {
    phase: 'idle',
    label: '复盘已开启',
    detail: '全部幕后信息已经公开。这场故事到此结束。',
    updatedAt: at,
  };
}
