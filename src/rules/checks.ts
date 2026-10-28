import type {
  ActionRecord,
  ActionRoll,
  Adjudication,
  AbilityKey,
  CharacterDefinition,
  CharacterRuntime,
  Condition,
  DiceCheck,
  OutcomeTier,
  ReactionRecord,
  ReactionRoll,
  TraitDefinition,
} from '../types.ts';
import { ABILITY_META, OUTCOME_META } from '../types.ts';
import { clamp, seededD20 } from '../utils.ts';

export const MULTITASK_PENALTY = -2;
export const CROWD_PENALTY_PER_EXTRA = -1;
export const CRITICAL_MARGIN = 10;
export const FALLBACK_DC = 15;

export interface CharacterCheckData {
  definition: CharacterDefinition;
  runtime: CharacterRuntime;
}

export interface ResolutionOutcome {
  actions: ActionRecord[];
  reactions: ReactionRecord[];
  checks: ActionRoll[];
}

interface CheckParts {
  natural: number;
  abilityValue: number;
  traitName: string | null;
  traitBonus: number;
  conditionBonus: number;
  conditionNotes: string[];
  situationalBonus: number;
  penalty: number;
  penaltyNotes: string[];
  total: number;
}

function matchingTrait(
  def: CharacterDefinition,
  traitName: string | null,
  ability: AbilityKey,
): { name: string | null; bonus: number } {
  if (!traitName) return { name: null, bonus: 0 };
  const trait = def.traits.find((item) => item.name === traitName);
  if (!trait) return { name: null, bonus: 0 };
  if (trait.ability && trait.ability !== ability) return { name: null, bonus: 0 };
  return { name: trait.name, bonus: clamp(trait.bonus, -2, 4) };
}

function conditionTotal(
  conditions: Condition[],
  ability: AbilityKey,
): { bonus: number; notes: string[] } {
  let bonus = 0;
  const notes: string[] = [];
  for (const condition of conditions) {
    if (condition.abilities?.length && !condition.abilities.includes(ability)) continue;
    if (!condition.modifier) continue;
    bonus += condition.modifier;
    notes.push(`${condition.name} ${condition.modifier > 0 ? '+' : ''}${condition.modifier}`);
  }
  return { bonus: clamp(bonus, -8, 8), notes };
}

function buildCheckParts(params: {
  seed: string;
  rollLabel: string;
  character: CharacterCheckData;
  ability: AbilityKey;
  traitName: string | null;
  situationalBonus?: number;
  penalty?: number;
  penaltyNotes?: string[];
}): CheckParts {
  const { seed, rollLabel, character, ability } = params;
  const natural = seededD20(seed, rollLabel);
  const abilityValue = clamp(Number(character.definition.abilities[ability] ?? 5), 1, 10);
  const trait = matchingTrait(character.definition, params.traitName, ability);
  const conditions = conditionTotal(character.runtime.conditions, ability);
  const situationalBonus = clamp(params.situationalBonus ?? 0, -3, 3);
  const penalty = params.penalty ?? 0;
  const total =
    natural +
    abilityValue +
    trait.bonus +
    conditions.bonus +
    situationalBonus +
    penalty;
  return {
    natural,
    abilityValue,
    traitName: trait.name,
    traitBonus: trait.bonus,
    conditionBonus: conditions.bonus,
    conditionNotes: conditions.notes,
    situationalBonus,
    penalty,
    penaltyNotes: params.penaltyNotes ?? [],
    total,
  };
}

export function tierFor(total: number, target: number, natural: number): {
  tier: OutcomeTier;
  margin: number;
  criticalByNatural20: boolean;
} {
  const margin = total - target;
  const criticalByNatural20 = natural === 20;
  if (criticalByNatural20 || margin >= CRITICAL_MARGIN) {
    return { tier: 'critical_success', margin, criticalByNatural20 };
  }
  if (margin >= 0) return { tier: 'success', margin, criticalByNatural20 };
  return { tier: 'soft_failure', margin, criticalByNatural20 };
}

/**
 * Resolve all declared actions and the reactions they provoked.
 *
 * Core rule (from the brief):
 * - A character-targeted action grants the target an extra reaction.
 * - If the target continues its originally declared action, *both of the
 *   target's actions* take a multitask penalty.
 * - If it abandons its original action, the reaction is unpenalized and the
 *   original action never happens.
 *
 * Reactions against multiple incoming actions are rolled once, with a crowd
 * penalty; the same reaction total opposes every incoming action.
 */
export function resolveChecks(params: {
  seed: string;
  beatIndex: number;
  characters: Record<string, CharacterCheckData>;
  actions: ActionRecord[];
  reactions: ReactionRecord[];
  adjudications: Adjudication[];
}): ResolutionOutcome {
  const { seed, beatIndex, characters, adjudications } = params;
  const adjudicationMap = new Map(adjudications.map((item) => [item.actionId, item]));

  const incomingByTarget = new Map<string, ActionRecord[]>();
  for (const action of params.actions) {
    // Non-hostile target actions do not enter a contested response round; the
    // target's own deed is their answer. `undefined` is treated as hostile for
    // old action records.
    if (!action.targetId || action.hostile === false) continue;
    const list = incomingByTarget.get(action.targetId) ?? [];
    list.push(action);
    incomingByTarget.set(action.targetId, list);
  }

  const actions: ActionRecord[] = params.actions.map((action) => ({
    ...action,
    roll: undefined,
    outcome: null as OutcomeTier | null,
    outcomeNote: '',
    penalties: 0,
    penaltyNotes: [...action.penaltyNotes],
  }));
  const actionById = new Map(actions.map((action) => [action.id, action]));

  const reactions: ReactionRecord[] = params.reactions.map((reaction) => ({
    ...reaction,
    roll: undefined,
  }));
  const reactionCharMap = new Map(
    reactions.map((reaction) => [reaction.characterId, reaction]),
  );

  // 1. Decide cancellations and roll reactions first. The target's choice matters
  //    mechanically to its own original action, not to the incoming actor's roll.
  for (const reaction of reactions) {
    const charge = characters[reaction.characterId];
    if (!charge) continue;
    const incoming = incomingByTarget.get(reaction.characterId) ?? [];
    const penalties: string[] = [];
    let penalty = 0;

    if (reaction.continueOriginal) {
      penalty += MULTITASK_PENALTY;
      penalties.push(`分心兼顾原举动 ${MULTITASK_PENALTY}`);
    } else {
      const own = actions.find((action) => action.characterId === reaction.characterId);
      if (own) {
        own.status = 'abandoned';
        own.outcomeNote = '为回应压力而放下了原本的举动。';
      }
    }

    const crowd = Math.max(0, incoming.length - 1) * CROWD_PENALTY_PER_EXTRA;
    if (crowd !== 0) {
      penalty += crowd;
      penalties.push(`同时承受 ${incoming.length} 个压力 ${crowd}`);
    }

    const parts = buildCheckParts({
      seed,
      rollLabel: `reaction:${beatIndex}:${reaction.characterId}`,
      character: charge,
      ability: reaction.ability,
      traitName: reaction.traitName,
      penalty,
      penaltyNotes: penalties,
    });
    const incomingTotals: Record<string, number> = {};

    const roll: ReactionRoll = {
      natural: parts.natural,
      ability: reaction.ability,
      abilityValue: parts.abilityValue,
      traitName: parts.traitName,
      traitBonus: parts.traitBonus,
      conditionBonus: parts.conditionBonus,
      conditionNotes: parts.conditionNotes,
      situationalBonus: parts.situationalBonus,
      penalty: parts.penalty,
      penaltyNotes: parts.penaltyNotes,
      total: parts.total,
      incomingTotals,
    };
    reaction.roll = roll;
    reactionCharMap.set(reaction.characterId, reaction);

    // The incoming actor's scores are computed later; store a placeholder count.
    for (const action of incoming) incomingTotals[action.id] = 0;
  }

  // 2. Mark the original actions of interrupted characters, then apply the
  //    multitask penalty to a surviving original action.
  for (const action of actions) {
    if (action.status === 'abandoned') continue;
    const ownReaction = reactionCharMap.get(action.characterId);
    if (ownReaction?.continueOriginal) {
      action.penalties += MULTITASK_PENALTY;
      action.penaltyNotes.push(`分心回应 ${MULTITASK_PENALTY}`);
    }
  }

  // 3. Resolve remaining actions.
  for (const action of actions) {
    if (action.status === 'abandoned') {
      action.outcome = null;
      action.roll = undefined;
      continue;
    }
    const charge = characters[action.characterId];
    if (!charge) throw new Error(`Missing character state for ${action.characterId}`);
    const adjudication = adjudicationMap.get(action.id);
    const situational = clamp(adjudication?.modifier ?? 0, -3, 3);
    const parts = buildCheckParts({
      seed,
      rollLabel: `action:${beatIndex}:${action.characterId}`,
      character: charge,
      ability: action.ability,
      traitName: action.traitName,
      situationalBonus: situational,
      penalty: action.penalties,
      penaltyNotes: action.penaltyNotes,
    });

    const incoming = action.targetId ? reactionCharMap.get(action.targetId) : undefined;
    let targetScore: number;
    let dc: number | null = null;
    let opponentTotal: number | null = null;

    if (incoming?.roll) {
      targetScore = incoming.roll.total;
      opponentTotal = incoming.roll.total;
      incoming.roll.incomingTotals![action.id] = parts.total;
    } else {
      // A character-targeted action should always have a reaction. Fall back to
      // the adjudicated DC rather than silently making attacks auto-succeed.
      dc = clamp(adjudication?.dc ?? FALLBACK_DC, 5, 30);
      targetScore = dc;
    }

    const { tier, margin, criticalByNatural20 } = tierFor(
      parts.total,
      targetScore,
      parts.natural,
    );
    const roll: ActionRoll = {
      natural: parts.natural,
      ability: action.ability,
      abilityValue: parts.abilityValue,
      traitName: parts.traitName,
      traitBonus: parts.traitBonus,
      conditionBonus: parts.conditionBonus,
      conditionNotes: parts.conditionNotes,
      situationalBonus: parts.situationalBonus,
      penalty: parts.penalty,
      penaltyNotes: parts.penaltyNotes,
      total: parts.total,
      dc,
      opponentTotal,
      margin,
      tier,
      criticalByNatural20,
    };

    action.roll = roll;
    action.outcome = tier;
    action.status = 'resolved';
    action.penalties = parts.penalty;
    action.penaltyNotes = parts.penaltyNotes;
    if (!adjudication && !incoming) {
      action.outcomeNote = '导演未提供难度，按标准难度 15 裁定。';
    }
  }

  // Preserve declared order in outputs, with abandoned actions visible.
  const orderedActions = params.actions.map((source) => actionById.get(source.id)!);
  const orderedReactions = params.reactions.map((source) => reactionCharMap.get(source.characterId)!);
  return {
    actions: orderedActions,
    reactions: orderedReactions,
    checks: orderedActions.flatMap((action) => (action.roll ? [action.roll] : [])),
  };
}

export function checkModifierSummary(check: DiceCheck): string[] {
  const parts = [
    `d20 ${check.natural}`,
    `${ABILITY_META[check.ability].label} +${check.abilityValue}`,
  ];
  if (check.traitName) parts.push(`${check.traitName} +${check.traitBonus}`);
  if (check.conditionBonus) parts.push(`状态 ${check.conditionBonus > 0 ? '+' : ''}${check.conditionBonus}`);
  if (check.situationalBonus) {
    parts.push(`裁定 ${check.situationalBonus > 0 ? '+' : ''}${check.situationalBonus}`);
  }
  if (check.penalty) parts.push(`惩罚 ${check.penalty}`);
  return parts;
}

export function outcomeLabel(tier: OutcomeTier | null | undefined): string {
  return tier ? OUTCOME_META[tier].label : '未执行';
}

export function validateTraitChoice(
  def: CharacterDefinition,
  traitName: string | null,
  ability: AbilityKey,
): TraitDefinition | null {
  if (!traitName) return null;
  const trait = def.traits.find((item) => item.name === traitName) ?? null;
  if (!trait) return null;
  if (trait.ability && trait.ability !== ability) return null;
  return trait;
}
