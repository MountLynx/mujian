import type {
  ActionRecord,
  Beat,
  CharacterDefinition,
  Condition,
  ConditionSeed,
  ExternalEventResult,
  ReactionRecord,
  Run,
} from '../types.ts';
import { isPlayRun, playRevealed } from './play.ts';

/**
 * The only authority on what a human player may see. This runs on the server
 * before the run is serialized, so hiding information in the UI is not the
 * security boundary — this is.
 *
 * The player's information envelope mirrors a character prompt:
 *   - public situation, own private cue, own sheet/memories, public facts;
 *   - own deed/effect/dialogue/thought/roll;
 *   - other characters' observable deeds and spoken words;
 *   - nothing else: no secrets, intent, thoughts, DCs, rolls, private cues,
 *     GM notes, or failed external events.
 */

function isPublicCondition(condition: Condition): boolean {
  return (
    (condition.visibility ?? (condition.kind === 'emotion' ? 'private' : 'public')) === 'public'
  );
}

function isPublicSeed(seed: ConditionSeed): boolean {
  return (seed.visibility ?? (seed.kind === 'emotion' ? 'private' : 'public')) === 'public';
}

/** An action as an observer could perceive it: deed and dialogue, no intent. */
function observableAction(action: ActionRecord, options: { revealEffect: boolean }): ActionRecord {
  const deed = action.deed || action.description;
  return {
    id: action.id,
    characterId: action.characterId,
    category: '其他',
    summary: '',
    deed,
    effect: options.revealEffect ? action.effect || action.goalProgress : '',
    hostile: false,
    description: deed,
    dialogue: action.dialogue,
    thought: '',
    goalProgress: '',
    stakes: '',
    ability: 'will',
    traitName: null,
    targetId: action.targetId,
    targetLabel: action.targetLabel,
    status: action.status,
    penalties: 0,
    penaltyNotes: [],
    createdAt: action.createdAt,
  };
}

/** A reaction as an observer could perceive it: stance, description, words. */
function observableReaction(reaction: ReactionRecord): ReactionRecord {
  return {
    id: reaction.id,
    characterId: reaction.characterId,
    incomingActionIds: [],
    continueOriginal: false,
    summary: '',
    description: reaction.description,
    dialogue: reaction.dialogue,
    thought: '',
    ability: 'will',
    traitName: null,
    stance: reaction.stance,
    createdAt: reaction.createdAt,
  };
}

function observableEvent(event: ExternalEventResult): ExternalEventResult {
  return {
    id: event.id,
    description: event.description,
    likelihood: 'routine',
    fact: event.fact,
    reason: '',
    dc: 0,
    natural: 0,
    success: true,
    createdAt: event.createdAt,
  };
}

function blankCharacter(character: CharacterDefinition): void {
  character.personality = '';
  character.desire = '';
  character.fear = '';
  character.secret = '';
  character.relationships = [];
  character.memories = [];
  character.traits = [];
  character.possessions = [];
  character.conditions = [];
  character.abilities = {
    physique: 0,
    agility: 0,
    perception: 0,
    intellect: 0,
    will: 0,
    presence: 0,
  };
}

function redactBeat(run: Run, beat: Beat, playerId: string): void {
  const complete = beat.phase === 'complete';
  const awaitingReaction = beat.phase === 'player_reaction';
  const ownAction = beat.actions.find((action) => action.characterId === playerId) ?? null;
  const incoming = awaitingReaction
    ? beat.actions.filter(
        (action) =>
          action.characterId !== playerId &&
          action.targetId === playerId &&
          action.hostile !== false,
      )
    : [];
  const visibleOthers = complete
    ? beat.actions.filter(
        (action) => action.characterId !== playerId && action.status !== 'abandoned',
      )
    : incoming;
  const visibleIds = new Set<string>(visibleOthers.map((action) => action.id));
  if (ownAction) visibleIds.add(ownAction.id);
  const revealEffect = !complete;

  beat.actions = beat.actions
    .filter((action) => visibleIds.has(action.id))
    .map((action) =>
      action.characterId === playerId
        ? action
        : observableAction(action, { revealEffect }),
    );

  beat.reactions = complete
    ? beat.reactions.map((reaction) =>
        reaction.characterId === playerId ? reaction : observableReaction(reaction),
      )
    : beat.reactions.filter((reaction) => reaction.characterId === playerId);
  // The player's own reaction roll is visible, but the opponents' action totals
  // inside it are not character knowledge. The UI does not need them.
  for (const reaction of beat.reactions) {
    if (reaction.characterId === playerId && reaction.roll) {
      reaction.roll = { ...reaction.roll, incomingTotals: {} };
    }
  }

  const ownActionIds = new Set(ownAction ? [ownAction.id] : []);
  beat.adjudications = complete
    ? beat.adjudications
        .filter((adjudication) => ownActionIds.has(adjudication.actionId))
        // The number is enough to learn the mechanic; the judgement prose may
        // mention backstage causes, so it stays behind the recap.
        .map((adjudication) => ({ ...adjudication, reason: '', risk: '' }))
    : [];

  beat.externalEvents = complete
    ? (beat.externalEvents ?? []).filter((event) => event.success).map(observableEvent)
    : [];

  beat.privateCues = beat.privateCues.filter((cue) => cue.characterId === playerId);
  beat.gmNote = '';
  beat.outcomeNotes = [];

  if (!complete || !beat.stateChanges) {
    beat.stateChanges = null;
    return;
  }
  beat.stateChanges = {
    characters: beat.stateChanges.characters.map((change) =>
      change.characterId === playerId
        ? change
        : {
            characterId: change.characterId,
            stressDelta: 0,
            conditionsAdd: change.conditionsAdd.filter(isPublicSeed),
            conditionsRemove: [],
            inventoryAdd: [],
            inventoryRemove: [],
            privateNote: '',
            memory: null,
          },
    ),
    world: {
      factsAdd: beat.stateChanges.world.factsAdd,
      factsRemove: beat.stateChanges.world.factsRemove,
      flagsSet: {},
      pressure: beat.stateChanges.world.pressure,
      sceneTitle: beat.stateChanges.world.sceneTitle,
    },
  };
}

/**
 * Return the player-safe view of a run. When the run is not a play run, or the
 * recap has been unlocked, the original object is returned untouched.
 */
export function redactRunForPlayer(run: Run): Run {
  if (!isPlayRun(run) || playRevealed(run)) return run;
  const playerId = run.play!.characterId;
  const view = structuredClone(run);

  // Scenario-level backstage material.
  view.scenario.world.hiddenCanon = undefined;
  view.scenario.world.directorNotes = '';
  view.scenario.rules.difficultyGuidance = undefined;
  // The seed lets a player pre-compute deterministic d20 labels; it is not
  // character knowledge either. It becomes visible with the recap.
  view.seed = '';
  for (const character of view.scenario.characters) {
    if (character.id === playerId) continue;
    blankCharacter(character);
  }

  // Runtime state that belongs to other characters alone.
  for (const [characterId, runtime] of Object.entries(view.characters)) {
    runtime.flags = {};
    if (characterId === playerId) continue;
    runtime.conditions = runtime.conditions.filter(isPublicCondition);
    runtime.stress = 0;
    runtime.memories = [];
    runtime.inventory = [];
  }
  view.world.flags = {};

  for (const beat of view.beats) redactBeat(view, beat, playerId);
  return view;
}
