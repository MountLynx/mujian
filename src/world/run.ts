import { config } from '../config.ts';
import type {
  CharacterDefinition,
  ConditionSeed,
} from '../types.ts';
import type {
  WorldActorRuntime,
  WorldClock,
  WorldDefinition,
  WorldFactionRuntime,
  WorldFact,
  WorldRegionRuntime,
  WorldRun,
  WorldRunSummary,
  WorldSignal,
  WorldThreadRuntime,
} from './types.ts';
import { formatClock, newId, nowIso, parseClock, randomSeed, clamp } from '../utils.ts';

export function worldClock(
  startLabel: string,
  startClock: string,
  elapsedMinutes: number,
): WorldClock {
  const startAbsolute = parseClock(startClock);
  const total = startAbsolute + Math.max(0, Math.round(elapsedMinutes));
  const day = Math.floor(total / 1440) + 1;
  const time = formatClock(total);
  return {
    elapsedMinutes: Math.max(0, Math.round(elapsedMinutes)),
    day,
    time,
    display: `${startLabel} · 第 ${day} 日 ${time}`,
  };
}

function entityTokensForAll(def: WorldDefinition): string[] {
  return [
    ...def.setting.factions.map((faction) => faction.id),
    ...def.setting.actors.map((actor) => actor.id),
  ];
}

function expandKnownBy(def: WorldDefinition, knownBy: string[]): string[] {
  const all = new Set([
    ...entityTokensForAll(def),
    ...def.setting.regions.map((region) => region.id),
  ]);
  const result = new Set<string>();
  for (const token of knownBy) {
    if (token === 'all' || token === 'world') {
      for (const id of entityTokensForAll(def)) result.add(id);
    } else if (all.has(token)) {
      result.add(token);
    }
  }
  if (!result.size) for (const id of entityTokensForAll(def)) result.add(id);
  return [...result];
}

function initialFacts(def: WorldDefinition): WorldFact[] {
  return def.setting.initialFacts.map((seed) => ({
    id: newId('fact'),
    text: seed.text,
    importance: seed.importance,
    knownBy: expandKnownBy(def, seed.knownBy),
    createdEpoch: -1,
    sourceEventId: null,
    tag: seed.tag ?? '初始事实',
    public: Boolean(seed.public || seed.knownBy.includes('all')),
    retiredAtEpoch: null,
  }));
}

function initialSignals(def: WorldDefinition, facts: WorldFact[]): WorldSignal[] {
  return def.setting.initialSignals
    .map((seed) => {
      const fact = facts[seed.factIndex];
      if (!fact) return null;
      const delay = clamp(Math.round(seed.delayMinutes), 0, 60 * 24 * 60);
      return {
        id: newId('sig'),
        fromEventId: 'world-seed',
        fromEntityId: seed.fromEntityId,
        toEntityIds: [...new Set(seed.toEntityIds)],
        channel: seed.channel,
        content: seed.content,
        factIds: [fact.id],
        createdAtEpoch: -1,
        arrivesAt: delay,
        status: delay === 0 ? 'delivered' : 'pending',
        deliveredAtEpoch: delay === 0 ? 0 : null,
      } satisfies WorldSignal;
    })
    .filter((signal): signal is WorldSignal => Boolean(signal));
}

function initialActors(def: WorldDefinition): Record<string, WorldActorRuntime> {
  const actors: Record<string, WorldActorRuntime> = {};
  for (const actor of def.setting.actors) {
    actors[actor.id] = {
      id: actor.id,
      regionId: actor.regionId,
      stress: 0,
      status: actor.spotlight ? '聚光角色' : '在场',
      conditions: (actor.conditions ?? []).map((condition) => ({
        name: condition.name,
        description: condition.description,
        modifier: condition.modifier,
        kind: condition.kind ?? 'other',
        abilities: condition.abilities ? [...condition.abilities] : undefined,
      })),
      flags: {},
      lastSeenEpoch: null,
    };
  }
  return actors;
}

function initialRegions(def: WorldDefinition): Record<string, WorldRegionRuntime> {
  return Object.fromEntries(
    def.setting.regions.map((region) => [
      region.id,
      {
        id: region.id,
        controllingFactionId: region.controllingFactionId,
        status: region.publicStatus,
        resources: { ...region.resources },
        flags: {},
      },
    ]),
  );
}

function initialFactions(def: WorldDefinition): Record<string, WorldFactionRuntime> {
  return Object.fromEntries(
    def.setting.factions.map((faction) => [
      faction.id,
      {
        id: faction.id,
        power: faction.power,
        legitimacy: faction.legitimacy,
        resources: { ...faction.resources },
        attitudes: { ...faction.attitudes },
        status: 'active',
        flags: {},
      },
    ]),
  );
}

function initialThreads(def: WorldDefinition): Record<string, WorldThreadRuntime> {
  return Object.fromEntries(
    def.setting.threads.map((thread) => [
      thread.id,
      {
        id: thread.id,
        tension: thread.tension,
        clockValue: thread.clock.value,
        status: thread.status,
        note: '',
        history: [],
      },
    ]),
  );
}

export interface CreateWorldOptions {
  seed?: string;
  maxEpochs?: number;
  thinking?: 'auto' | 'enabled' | 'disabled';
  autoEpochs?: number;
  /** Model label recorded on the world run. */
  model?: string;
}

export function createWorldRun(input: WorldDefinition, options: CreateWorldOptions = {}): WorldRun {
  const definition = structuredClone(input);
  const seed = (options.seed?.trim() || randomSeed()).slice(0, 64);
  const facts = initialFacts(definition);
  const signals = initialSignals(definition, facts);
  for (const signal of signals) {
    if (signal.status !== 'delivered') continue;
    for (const factId of signal.factIds) {
      const fact = facts.find((entry) => entry.id === factId);
      if (!fact) continue;
      for (const target of signal.toEntityIds) {
        if (!fact.knownBy.includes(target)) fact.knownBy.push(target);
      }
    }
  }
  const createdAt = nowIso();
  const maxEpochs = clamp(
    Math.round(options.maxEpochs ?? definition.rules.maxEpochs ?? 6),
    2,
    24,
  );
  return {
    version: 1,
    id: `world_${newId()}`,
    seed,
    status: 'ready',
    definition,
    settings: {
      maxEpochs,
      thinking: options.thinking ?? config.llm.thinking,
      model: options.model ?? config.llm.model,
      autoEpochs: clamp(Math.round(options.autoEpochs ?? 3), 1, 12),
    },
    createdAt,
    updatedAt: createdAt,
    error: null,
    elapsedMinutes: 0,
    clock: worldClock(definition.setting.startLabel, definition.setting.startClock, 0),
    epochIndex: 0,
    regions: initialRegions(definition),
    factions: initialFactions(definition),
    actors: initialActors(definition),
    threads: initialThreads(definition),
    facts,
    signals,
    events: [],
    epochs: [],
    sceneHooks: [],
    sceneRuns: [],
    progress: {
      phase: 'idle',
      label: '世界尚未开始运转',
      updatedAt: createdAt,
    },
    llm: {
      calls: 0,
      promptTokens: 0,
      completionTokens: 0,
      cachedTokens: 0,
      reasoningTokens: 0,
      totalTokens: 0,
      failures: 0,
    },
    lastTimeJump: null,
  };
}

export function worldRunSummary(run: WorldRun): WorldRunSummary {
  const currentEpoch = run.epochs.at(-1);
  return {
    id: run.id,
    title: run.definition.title,
    subtitle: run.definition.subtitle,
    status: run.status,
    epochCount: run.epochs.length,
    maxEpochs: run.settings.maxEpochs,
    regionCount: run.definition.setting.regions.length,
    actorCount: run.definition.setting.actors.length,
    openThreads: Object.values(run.threads).filter((thread) => thread.status === 'active').length,
    unsealedScenes: run.sceneRuns.filter(
      (scene) => scene.status !== 'completed' && (scene.beatCount ?? 0) > 0,
    ).length,
    pendingSignals: run.signals.filter((signal) => signal.status === 'pending').length,
    updatedAt: run.updatedAt,
    createdAt: run.createdAt,
    clock: run.clock.display,
    currentEpochTitle: currentEpoch?.title ?? null,
  };
}

export function actorDefinition(run: WorldRun, actorId: string): CharacterDefinition | null {
  return run.definition.setting.actors.find((actor) => actor.id === actorId) ?? null;
}

export function conditionSeedToRuntime(seed: ConditionSeed): ConditionSeed {
  return {
    ...seed,
    abilities: seed.abilities ? [...seed.abilities] : undefined,
    kind: seed.kind ?? 'other',
  };
}

/** Day display without the full date label, used for compact event cards. */
export function compactClock(clock: WorldClock): string {
  return `D${clock.day} ${clock.time}`;
}
