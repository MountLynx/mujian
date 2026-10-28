import type {
  CharacterDefinition,
  ConditionSeed,
} from '../types.ts';

/**
 * The world layer is intentionally event-sourced. A "world epoch" is an
 * observation slice, an "event bundle" is a causal adjudication unit, and a
 * "scene" is only a camera. These are different things.
 */

export type WorldEntityKind = 'world' | 'region' | 'faction' | 'actor';

export interface WorldClock {
  /** Minutes elapsed since the world started. */
  elapsedMinutes: number;
  /** 1-based in-world day. */
  day: number;
  /** HH:MM. */
  time: string;
  /** Full human-readable clock. */
  display: string;
}

export interface WorldRegionDefinition {
  id: string;
  name: string;
  kind: string;
  description: string;
  controllingFactionId: string | null;
  publicStatus: string;
  resources: Record<string, number>;
  connections: WorldConnectionDefinition[];
  landmarks?: string[];
}

export interface WorldConnectionDefinition {
  to: string;
  travelMinutes: number;
  mode: string;
  risk?: string;
}

export interface WorldFactionDefinition {
  id: string;
  name: string;
  description: string;
  goal: string;
  secret: string;
  power: number;
  legitimacy: number;
  resources: Record<string, number>;
  attitudes: Record<string, number>;
  leaderActorId: string | null;
  sigil?: string;
  color?: string;
}

export interface WorldActorDefinition extends CharacterDefinition {
  regionId: string;
  factionId: string | null;
  spotlight: boolean;
  agenda: string;
  worldTags: string[];
}

export interface WorldThreadDefinition {
  id: string;
  title: string;
  question: string;
  stakes: string;
  tension: number;
  clock: {
    value: number;
    max: number;
    unit: string;
    label: string;
    onFill: string;
  };
  involvedFactionIds: string[];
  involvedRegionIds: string[];
  status: WorldThreadStatus;
}

export type WorldThreadStatus = 'active' | 'resolved' | 'failed';

export interface WorldFactSeed {
  text: string;
  importance: number;
  /** Actor / faction ids. Use "all" for common knowledge. */
  knownBy: string[];
  /** Whether the author intends this as universal public lore. */
  public?: boolean;
  /** Optional author label. */
  tag?: string;
}

export interface WorldSignalSeed {
  fromEntityId: string;
  toEntityIds: string[];
  channel: string;
  content: string;
  delayMinutes: number;
  /** Index in world.setting.initialFacts. */
  factIndex: number;
}

export interface WorldSetting {
  era: string;
  tone: string;
  overview: string;
  geography: string;
  hiddenCanon: string;
  directorNotes: string;
  startLabel: string;
  startClock: string;
  hardRules: string[];
  spotlightRegionId: string;
  regions: WorldRegionDefinition[];
  factions: WorldFactionDefinition[];
  actors: WorldActorDefinition[];
  threads: WorldThreadDefinition[];
  initialFacts: WorldFactSeed[];
  initialSignals: WorldSignalSeed[];
}

export interface WorldRules {
  maxEpochs: number;
  defaultAdvanceMinutes: number;
  sceneMaxBeats: number;
  /** Guidance for what the world GM may resolve offscreen. */
  spotlightPolicy: string;
}

export interface WorldDefinition {
  id: string;
  title: string;
  subtitle: string;
  kicker: string;
  isPreset?: boolean;
  setting: WorldSetting;
  rules: WorldRules;
  createdAt?: string;
}

export interface WorldActorRuntime {
  id: string;
  regionId: string;
  stress: number;
  status: string;
  conditions: ConditionSeed[];
  flags: Record<string, string | number | boolean>;
  lastSeenEpoch: number | null;
}

export interface WorldRegionRuntime {
  id: string;
  controllingFactionId: string | null;
  status: string;
  resources: Record<string, number>;
  flags: Record<string, string | number | boolean>;
}

export interface WorldFactionRuntime {
  id: string;
  power: number;
  legitimacy: number;
  resources: Record<string, number>;
  attitudes: Record<string, number>;
  status: string;
  flags: Record<string, string | number | boolean>;
}

export interface WorldThreadRuntime {
  id: string;
  tension: number;
  clockValue: number;
  status: WorldThreadStatus;
  note: string;
  history: Array<{ epochIndex: number; note: string }>;
}

export interface WorldFact {
  id: string;
  text: string;
  importance: number;
  knownBy: string[];
  createdEpoch: number;
  sourceEventId: string | null;
  tag: string;
  /** Public facts are shown to all in the author-facing world digest. */
  public: boolean;
  /** Facts are never hard-deleted; retiring preserves knowledge history. */
  retiredAtEpoch: number | null;
}

export interface WorldSignal {
  id: string;
  fromEventId: string;
  fromEntityId: string;
  toEntityIds: string[];
  channel: string;
  content: string;
  factIds: string[];
  createdAtEpoch: number;
  /** Absolute elapsed minutes from world start. */
  arrivesAt: number;
  status: 'pending' | 'delivered';
  deliveredAtEpoch: number | null;
}

export interface WorldEpoch {
  index: number;
  clock: WorldClock;
  advanceMinutes: number;
  advanceReason: string;
  title: string;
  summary: string;
  eventIds: string[];
  deliveryEventIds: string[];
  sceneHookId: string | null;
  createdAt: string;
}

export interface WorldEventEffectBundle {
  factIdsAdded: string[];
  factIdsRemoved: string[];
  regionChanges: WorldRegionChange[];
  factionChanges: WorldFactionChange[];
  actorChanges: WorldActorChange[];
  threadChanges: WorldThreadChange[];
}

export interface WorldRegionChange {
  regionId: string;
  status?: string;
  controllingFactionId?: string | null;
  resourceDeltas: Record<string, number>;
}

export interface WorldFactionChange {
  factionId: string;
  powerDelta: number;
  legitimacyDelta: number;
  resourceDeltas: Record<string, number>;
  attitudeDeltas: Record<string, number>;
  status?: string;
}

export interface WorldActorChange {
  actorId: string;
  regionId?: string;
  status?: string;
  stressDelta: number;
  conditionsAdd: ConditionSeed[];
  conditionsRemove: string[];
  flagsSet: Record<string, string | number | boolean>;
}

export interface WorldThreadChange {
  threadId: string;
  tensionDelta: number;
  clockDelta: number;
  status?: WorldThreadStatus;
  note: string;
}

export type WorldEventKind = 'event' | 'parent' | 'signal' | 'scene';

export interface WorldEvent {
  id: string;
  epochIndex: number;
  /** Absolute elapsed minutes. */
  at: number;
  clock: WorldClock;
  localId: string;
  parentId: string | null;
  childIds: string[];
  kind: WorldEventKind;
  title: string;
  regionId: string | null;
  actorIds: string[];
  factionIds: string[];
  summary: string;
  publicNarrative: string;
  visibility: 'public' | 'secret' | 'mixed';
  effects: WorldEventEffectBundle;
  signalIds: string[];
  sceneHookId: string | null;
  createdAt: string;
}

export interface WorldSceneHook {
  id: string;
  epochIndex: number;
  sourceEventId: string;
  regionId: string;
  title: string;
  question: string;
  stakes: string;
  publicBrief: string;
  participantIds: string[];
  privateCues: Array<{ actorId: string; cue: string }>;
  status: 'offered' | 'scene_created' | 'completed';
  runId: string | null;
  createdAt: string;
}

export type WorldStatus = 'ready' | 'running' | 'paused' | 'error' | 'ended';

export interface WorldRun {
  version: 1;
  id: string;
  seed: string;
  status: WorldStatus;
  definition: WorldDefinition;
  settings: {
    maxEpochs: number;
    thinking: 'auto' | 'enabled' | 'disabled';
    model: string;
    autoEpochs: number;
  };
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  error: string | null;
  elapsedMinutes: number;
  clock: WorldClock;
  epochIndex: number;
  regions: Record<string, WorldRegionRuntime>;
  factions: Record<string, WorldFactionRuntime>;
  actors: Record<string, WorldActorRuntime>;
  threads: Record<string, WorldThreadRuntime>;
  facts: WorldFact[];
  signals: WorldSignal[];
  events: WorldEvent[];
  epochs: WorldEpoch[];
  sceneHooks: WorldSceneHook[];
  /** Linked local scene runs, if any. */
  sceneRuns: Array<{
    hookId: string;
    runId: string;
    status: 'created' | 'completed';
    runStatus?: import('../types.ts').RunStatus;
    beatCount?: number;
    summary?: string;
    completedAt?: string;
    addedAt: string;
  }>;
  progress: WorldProgress;
  llm: WorldLlmUsage;
  lastTimeJump: {
    minutes: number;
    label: string;
    reason: string;
  } | null;
}

export interface WorldProgress {
  phase: 'idle' | 'opening' | 'planning' | 'applying' | 'chronicling';
  label: string;
  detail?: string;
  updatedAt: string;
}

export interface WorldLlmUsage {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  failures: number;
}

export interface WorldRunSummary {
  id: string;
  title: string;
  subtitle: string;
  status: WorldStatus;
  epochCount: number;
  maxEpochs: number;
  regionCount: number;
  actorCount: number;
  /** status==='active' 的线程数（读时计算）。 */
  openThreads: number;
  /** 已推演但尚未收束的聚焦场景数（读时计算）。 */
  unsealedScenes: number;
  /** 仍在路上的信号数（读时计算）。 */
  pendingSignals: number;
  updatedAt: string;
  createdAt: string;
  clock: string;
  currentEpochTitle: string | null;
}

export interface WorldPresetSummary {
  id: string;
  title: string;
  subtitle: string;
  kicker: string;
  regionNames: string[];
  factionNames: string[];
  actorNames: string[];
  maxEpochs: number;
  isPreset: boolean;
}

/** LLM-facing draft shapes. */

export interface WorldDraftFact {
  text: string;
  importance: number;
  knownBy: string[];
  public: boolean;
  tag: string;
}

export interface WorldDraftRegionChange {
  regionId: string;
  status?: string;
  controllingFactionId?: string | null;
  resourceDeltas: Record<string, number>;
}

export interface WorldDraftFactionChange {
  factionId: string;
  powerDelta: number;
  legitimacyDelta: number;
  resourceDeltas: Record<string, number>;
  attitudeDeltas: Record<string, number>;
  status?: string;
}

export interface WorldDraftActorChange {
  actorId: string;
  regionId?: string;
  status?: string;
  stressDelta: number;
  conditionsAdd: ConditionSeed[];
  conditionsRemove: string[];
  flagsSet: Record<string, string | number | boolean>;
}

export interface WorldDraftThreadChange {
  threadId: string;
  tensionDelta: number;
  clockDelta: number;
  status?: WorldThreadStatus;
  note: string;
}

export interface WorldDraftSignal {
  toEntityIds: string[];
  channel: string;
  content: string;
  delayMinutes: number;
  factIndices: number[];
}

export interface WorldDraftEvent {
  localId: string;
  parentLocalId: string | null;
  title: string;
  regionId: string | null;
  actorIds: string[];
  factionIds: string[];
  summary: string;
  publicNarrative: string;
  visibility: 'public' | 'secret' | 'mixed';
  facts: WorldDraftFact[];
  removeFactIds: string[];
  regionChanges: WorldDraftRegionChange[];
  factionChanges: WorldDraftFactionChange[];
  actorChanges: WorldDraftActorChange[];
  threadChanges: WorldDraftThreadChange[];
  signals: WorldDraftSignal[];
}

export interface WorldDraftScene {
  eventLocalId: string | null;
  regionId: string;
  title: string;
  question: string;
  stakes: string;
  publicBrief: string;
  participantIds: string[];
  privateCues: Array<{ actorId: string; cue: string }>;
}

export interface WorldEpochDraft {
  advanceMinutes: number;
  advanceReason: string;
  epochTitle: string;
  worldSummary: string;
  events: WorldDraftEvent[];
  scene: WorldDraftScene | null;
}

/** A cached, author-facing knowledge view. */
export interface WorldKnowledgeEntry {
  factId: string;
  text: string;
  known: boolean;
  sourceEventId: string | null;
}

/** Scene conversion result. */
export interface WorldSceneDraft {
  hook: WorldSceneHook;
  scenario: import('../types.ts').Scenario;
  knowledgeSnapshot: Record<string, string[]>;
}
