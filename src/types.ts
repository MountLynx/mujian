/**
 * Domain model for 幕间 / Mise-en-scène.
 *
 * The engine deliberately keeps a strict boundary between:
 *   - definitions: what a character *is* (sheet, secrets, backstory)
 *   - runtime:     what has happened to them in this run
 *   - beat records: the auditable trail of perception → intent → reaction → dice → narration
 */

export const ABILITY_KEYS = [
  'physique',
  'agility',
  'perception',
  'intellect',
  'will',
  'presence',
] as const;

export type AbilityKey = (typeof ABILITY_KEYS)[number];

export const ABILITY_META: Record<
  AbilityKey,
  { label: string; glyph: string; description: string }
> = {
  physique: { label: '体魄', glyph: '体', description: '力量、耐力、承受伤害与强行突破。' },
  agility: { label: '敏捷', glyph: '敏', description: '速度、平衡、隐匿、闪避与手上功夫。' },
  perception: { label: '感知', glyph: '感', description: '观察、听觉、直觉、追踪与分辨细微异常。' },
  intellect: { label: '智识', glyph: '智', description: '推理、知识、机械、医疗与拆解复杂问题。' },
  will: { label: '意志', glyph: '志', description: '坚持、抵抗恐惧与操纵、承受代价、兑现承诺。' },
  presence: { label: '风度', glyph: '风', description: '说服、威慑、共情、表演与影响他人。' },
};

export const OUTCOME_META = {
  critical_success: {
    label: '意外奏效',
    short: '奏效',
    description: '效果落地，并获得额外优势、揭示或关系位移。',
  },
  success: {
    label: '落地',
    short: '落地',
    description: '效果落地，通常伴随代价、暴露或关系消耗。',
  },
  soft_failure: {
    label: '落空',
    short: '落空',
    description: '效果没有落地；话被岔开、动作被挡回或被误解，但举动本身仍然发生。',
  },
} as const;

export type OutcomeTier = keyof typeof OUTCOME_META;
export type ActionStatus = 'declared' | 'abandoned' | 'resolved';

/** A character sheet supplied by the scenario author. */
export interface CharacterDefinition {
  id: string;
  name: string;
  title: string;
  age?: string;
  pronouns?: string;
  publicProfile: string;
  appearance?: string;
  personality: string;
  desire: string;
  fear: string;
  secret: string;
  abilities: Record<AbilityKey, number>;
  traits: TraitDefinition[];
  possessions: string[];
  relationships: RelationshipDefinition[];
  memories: MemorySeed[];
  conditions?: ConditionSeed[];
  /** Passive characters are present but never declare actions or responses. */
  passive?: boolean;
}

export interface TraitDefinition {
  name: string;
  description: string;
  /** Mechanical bonus applied only when the player selects this trait on a check. */
  bonus: number;
  /** If set, the trait can only be selected on checks using this ability. */
  ability?: AbilityKey | null;
}

export interface RelationshipDefinition {
  targetId: string;
  label: string;
  /** A short subjective stance, e.g. “我欠她一次，但我不信她。” */
  attitude: string;
}

export interface MemorySeed {
  summary: string;
  detail?: string;
  importance: number;
}

export interface ConditionSeed {
  name: string;
  description: string;
  modifier: number;
  kind?: ConditionKind;
  abilities?: AbilityKey[];
  /**
   * Public conditions are visible to other characters and to the resolution
   * narrator; private conditions belong to the character alone.
   */
  visibility?: 'public' | 'private';
}

export type ConditionKind = 'injury' | 'emotion' | 'boon' | 'other';

export interface Condition extends ConditionSeed {
  id: string;
  kind: ConditionKind;
  sourceBeat?: number;
}

export type MemoryKind = 'backstory' | 'event' | 'secret' | 'observation';

export interface RuntimeMemory {
  id: string;
  at: string;
  beatIndex: number | null;
  summary: string;
  detail?: string;
  importance: number;
  kind: MemoryKind;
  /** Creator-facing metadata; not exposed to this character's prompt unless public. */
  source?: 'scenario' | 'event' | 'gm';
}

export interface CharacterRuntime {
  id: string;
  conditions: Condition[];
  stress: number;
  memories: RuntimeMemory[];
  inventory: string[];
  /** Free-form plot flags known to the engine (e.g. "holds_logbook": true). */
  flags: Record<string, string | number | boolean>;
}

export interface ScenarioWorld {
  title: string;
  era: string;
  tone: string;
  setting: string;
  location: string;
  dateLabel: string;
  startClock: string;
  premise: string;
  opening: string;
  directorNotes: string;
  /** GM-only canon the resolution should protect, not railroad. */
  hiddenCanon?: string;
  initialFacts: string[];
  countdown?: string;
  /** Structured hard deadline clock (HH:MM). Falls back to the first HH:MM in countdown. */
  deadlineClock?: string;
  /** Public world fact written when the deadline is reached and no delay fact exists. */
  deadlineFact?: string;
}

export interface ScenarioRules {
  maxBeats: number;
  /** Director guidance for the difficulty scale, surfaced to the adjudicator. */
  difficultyGuidance?: string;
}

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  kicker: string;
  world: ScenarioWorld;
  characters: CharacterDefinition[];
  rules: ScenarioRules;
  isPreset?: boolean;
  createdAt?: string;
}

export interface ScenarioSummary {
  id: string;
  title: string;
  subtitle: string;
  kicker: string;
  characterNames: string[];
  location: string;
  maxBeats: number;
  isPreset: boolean;
}

export interface ClockState {
  /** Absolute minute count since midnight, used to compute event-driven jumps. */
  minutes: number;
  display: string;
  dateLabel: string;
}

export interface TimeJump {
  elapsedMinutes: number;
  /** A narrative way of naming the interval, e.g. “雨停后的第九分钟”. */
  label: string;
  reason: string;
}

/** Mechanical sub-components of one d20 check. */
export interface DiceCheck {
  natural: number;
  ability: AbilityKey;
  abilityValue: number;
  traitName: string | null;
  traitBonus: number;
  conditionBonus: number;
  conditionNotes: string[];
  situationalBonus: number;
  penalty: number;
  penaltyNotes: string[];
  total: number;
  /** Threshold for an uncontested check. */
  dc?: number | null;
  /** Reaction total for a contested check. */
  opponentTotal?: number | null;
  margin?: number | null;
  criticalByNatural20?: boolean;
}

export interface ActionRoll extends DiceCheck {
  tier: OutcomeTier;
}

export interface ReactionRoll extends DiceCheck {
  /** One contested comparison for each incoming action. */
  incomingTotals?: Record<string, number>;
}

export interface Adjudication {
  actionId: string;
  difficultyLabel: string;
  dc: number;
  modifier: number;
  reason: string;
  risk: string;
}

export type ActionCategory =
  | '调查'
  | '交涉'
  | '行动'
  | '战斗'
  | '技术'
  | '观察'
  | '其他';

export interface ActionRecord {
  id: string;
  characterId: string;
  category: ActionCategory;
  summary: string;
  /** The visible deed. For records produced before the split, this equals `description`. */
  deed?: string;
  /** The effect the character wants the deed to have; the check resolves this, not the deed. */
  effect?: string;
  /** True only for force, harm, seizure, cornering or deception. */
  hostile?: boolean;
  /** Legacy display alias for `deed`; kept so old run snapshots still render. */
  description: string;
  dialogue: string;
  thought: string;
  goalProgress: string;
  stakes: string;
  ability: AbilityKey;
  traitName: string | null;
  targetId: string | null;
  targetLabel?: string;
  status: ActionStatus;
  roll?: ActionRoll;
  outcome?: OutcomeTier | null;
  outcomeNote?: string;
  penalties: number;
  penaltyNotes: string[];
  /** The engine can transparently mark a rare deterministic fallback. */
  generatedBy?: 'llm' | 'fallback' | 'player';
  createdAt: string;
}

export interface ReactionRecord {
  id: string;
  characterId: string;
  incomingActionIds: string[];
  continueOriginal: boolean;
  summary: string;
  description: string;
  dialogue: string;
  thought: string;
  ability: AbilityKey;
  traitName: string | null;
  stance: string;
  roll?: ReactionRoll;
  createdAt: string;
}

export interface PrivateCue {
  characterId: string;
  cue: string;
}

export type BeatPhase =
  | 'opening'
  | 'actions'
  | 'adjudication'
  | 'reactions'
  | 'rolling'
  | 'resolution'
  | 'complete'
  /** Play mode only: the engine is waiting for the human to declare a deed. */
  | 'player_action'
  /** Play mode only: the engine is waiting for the human to answer a hostile action. */
  | 'player_reaction';

export interface OutcomeNote {
  characterId: string;
  note: string;
}

export interface CharacterStateChange {
  characterId: string;
  stressDelta: number;
  conditionsAdd: ConditionSeed[];
  conditionsRemove: string[];
  inventoryAdd: string[];
  inventoryRemove: string[];
  privateNote: string;
  memory: { summary: string; importance: number } | null;
}

export interface WorldStateChange {
  factsAdd: string[];
  factsRemove: string[];
  flagsSet: Record<string, string | number | boolean>;
  pressure: string;
  sceneTitle: string;
}

export type ExternalEventLikelihood = 'routine' | 'possible' | 'unlikely';

/** A director-proposed objective change not caused by any character action. */
export interface ExternalEventProposal {
  description: string;
  likelihood: ExternalEventLikelihood;
  /** Public fact written only if the event check succeeds. */
  fact: string;
  reason: string;
}

export interface ExternalEventResult extends ExternalEventProposal {
  id: string;
  dc: number;
  natural: number;
  success: boolean;
  createdAt: string;
}

export interface Beat {
  id: string;
  index: number;
  title: string;
  phase: BeatPhase;
  clock: ClockState;
  timeJump: TimeJump | null;
  publicBrief: string;
  privateCues: PrivateCue[];
  pressure: string;
  sceneQuestion: string;
  /** Private director note: not shown to the characters. */
  gmNote: string;
  actions: ActionRecord[];
  adjudications: Adjudication[];
  reactions: ReactionRecord[];
  /** Director-initiated external changes, already checked with a d20. */
  externalEvents?: ExternalEventResult[];
  narration: string;
  outcomeNotes: OutcomeNote[];
  stateChanges: {
    characters: CharacterStateChange[];
    world: WorldStateChange;
  } | null;
  nextTimeJump: TimeJump | null;
  ending: Ending | null;
  createdAt: string;
  completedAt?: string;
}

export interface Ending {
  headline: string;
  epilogue: string;
  finalImage?: string;
}

export interface Progress {
  phase:
    | 'idle'
    | 'opening'
    | 'actions'
    | 'adjudication'
    | 'reactions'
    | 'rolling'
    | 'resolution'
    | 'between';
  label: string;
  detail?: string;
  actorStates?: Record<string, 'writing' | 'done' | 'fallback'>;
  updatedAt: string;
}

export interface LlmUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  failures: number;
}

export type ThinkingMode = 'auto' | 'enabled' | 'disabled';

export interface RunSettings {
  maxBeats: number;
  thinking: ThinkingMode;
  model: string;
  /** Hard cap for one automatic run; can be extended by another request. */
  autoLimit: number;
}

export interface WorldState {
  publicFacts: string[];
  flags: Record<string, string | number | boolean>;
  pressure: string;
  sceneTitle: string;
}

export type RunStatus = 'ready' | 'running' | 'paused' | 'ended' | 'error' | 'awaiting';

/** Play mode only: what kind of input the engine is waiting for. */
export type PlayAwaiting = 'action' | 'reaction';

/**
 * Present when a human plays one character of an otherwise AI-run scene.
 * The engine pauses at `awaiting`, and the server redacts the run until `recapAt`.
 */
export interface PlayConfig {
  characterId: string;
  awaiting: PlayAwaiting | null;
  /** Set when the full record has been unlocked for recap; recap ends the run. */
  recapAt: string | null;
  createdAt: string;
}

export interface WorldLink {
  worldId: string;
  worldTitle: string;
  hookId: string;
  eventId: string;
  regionId: string;
}

export interface Run {
  version: 1;
  id: string;
  seed: string;
  status: RunStatus;
  scenario: Scenario;
  settings: RunSettings;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  clock: ClockState;
  world: WorldState;
  characters: Record<string, CharacterRuntime>;
  beats: Beat[];
  progress: Progress;
  llm: LlmUsage;
  ending: Ending | null;
  error: string | null;
  /** Present when this local scene was opened from a world epoch. */
  worldLink?: WorldLink | null;
  /** Set once the scene's outcome has been sealed back into the world ledger. */
  worldSceneSealed?: boolean;
  /** Present when one of the characters is played by the human user. */
  play?: PlayConfig | null;
}

export interface RunSummary {
  id: string;
  title: string;
  subtitle: string;
  status: RunStatus;
  beats: number;
  maxBeats: number;
  characterNames: string[];
  updatedAt: string;
  createdAt: string;
  currentBeatTitle: string | null;
  worldId?: string;
  worldTitle?: string;
  /** Set for 扮演模式 summaries, so the home card can name the player's role. */
  playCharacterName?: string;
}

/** LLM-facing action proposal schema. */
export interface ProposedAction {
  thought: string;
  category: ActionCategory;
  summary: string;
  deed: string;
  effect: string;
  hostile: boolean;
  ability: AbilityKey;
  trait: string | null;
  targetId: string | null;
  dialogue: string;
  goalProgress: string;
  stakes: string;
}

export interface ProposedReaction {
  thought: string;
  continueOriginal: boolean;
  stance: string;
  summary: string;
  description: string;
  ability: AbilityKey;
  trait: string | null;
  dialogue: string;
}

export interface BeatOpeningDraft {
  title: string;
  publicBrief: string;
  privateCues: PrivateCue[];
  pressure: string;
  sceneQuestion: string;
  gmNote: string;
}

export interface AdjudicationDraft {
  actionId: string;
  difficultyLabel: string;
  dc: number;
  modifier: number;
  reason: string;
  risk: string;
}

export interface ResolutionDraft {
  narration: string;
  outcomeNotes: OutcomeNote[];
  stateChanges: {
    characters: CharacterStateChange[];
    world: WorldStateChange;
  };
  nextTimeJump: TimeJump;
  ending: Ending | null;
}

export interface MemoryRetrievalResult {
  memories: RuntimeMemory[];
  reasoning: string;
}
