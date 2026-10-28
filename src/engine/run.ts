import { config } from '../config.ts';
import type {
  CharacterRuntime,
  Condition,
  Run,
  RunSummary,
  Scenario,
  ThinkingMode,
} from '../types.ts';
import { clockAfter, formatClock, newId, nowIso, parseClock, randomSeed, clamp } from '../utils.ts';

export interface CreateRunOptions {
  seed?: string;
  maxBeats?: number;
  thinking?: ThinkingMode;
  autoLimit?: number;
  /** Model label recorded on the run (the actual client is injected separately). */
  model?: string;
}

function runtimeForCharacter(
  scenario: Scenario,
  characterId: string,
): CharacterRuntime {
  const character = scenario.characters.find((entry) => entry.id === characterId)!;
  const conditions: Condition[] = (character.conditions ?? []).map((condition) => ({
    ...condition,
    id: newId('cond'),
    kind: condition.kind ?? 'other',
    sourceBeat: undefined,
    ...(condition.abilities ? { abilities: [...condition.abilities] } : {}),
  }));
  return {
    id: characterId,
    conditions,
    stress: 0,
    memories: character.memories.map((memory) => ({
      id: newId('mem'),
      at: scenario.world.dateLabel,
      beatIndex: null,
      summary: memory.summary,
      detail: memory.detail,
      importance: clamp(Math.round(memory.importance), 1, 5),
      kind: 'backstory',
      source: 'scenario',
    })),
    inventory: [...character.possessions],
    flags: {},
  };
}

export function createRun(
  inputScenario: Scenario,
  options: CreateRunOptions = {},
): Run {
  const scenario = structuredClone(inputScenario);
  const seed = (options.seed?.trim() || randomSeed()).slice(0, 64);
  const startMinutes = parseClock(scenario.world.startClock);
  const maxBeats = clamp(
    Math.round(options.maxBeats ?? scenario.rules.maxBeats ?? 5),
    2,
    12,
  );
  const characters: Record<string, CharacterRuntime> = {};
  for (const character of scenario.characters) {
    characters[character.id] = runtimeForCharacter(scenario, character.id);
  }
  const createdAt = nowIso();
  return {
    version: 1,
    id: `run_${newId()}`,
    seed,
    status: 'ready',
    scenario,
    settings: {
      maxBeats,
      autoLimit: clamp(Math.round(options.autoLimit ?? maxBeats), 1, 24),
      thinking: options.thinking ?? config.llm.thinking,
      model: options.model ?? config.llm.model,
    },
    createdAt,
    updatedAt: createdAt,
    clock: {
      minutes: startMinutes,
      display: formatClock(startMinutes),
      dateLabel: scenario.world.dateLabel,
    },
    world: {
      publicFacts: [...scenario.world.initialFacts],
      flags: {},
      pressure: scenario.world.countdown ?? scenario.world.premise,
      sceneTitle: scenario.world.title,
    },
    characters,
    beats: [],
    progress: {
      phase: 'idle',
      label: '等待开场',
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
    ending: null,
    error: null,
  };
}

export interface RunDeadline {
  absoluteMinutes: number;
  clock: string;
  fact: string;
}

const DELAY_FACT_PATTERN = /晚点|延迟|推迟|停航|停运|取消|改期|滞留|未开|不开|故障|错过/i;

/** Used by the resolution validator; a delay must be public, not just narrated. */
export function isDelayFactText(value: string): boolean {
  return DELAY_FACT_PATTERN.test(value);
}

function clockFromText(value: string | undefined): { hours: number; minutes: number } | null {
  const match = value?.match(/(\d{1,2})[:：](\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

/**
 * Return the first occurrence of this scene's hard deadline after the scene
 * started. The deadline is a world clock, not an ending condition: it only says
 * when an option closes, not what the characters do about it.
 */
export function deadlineForRun(run: Run): RunDeadline | null {
  const explicit = run.scenario.world.deadlineClock;
  const parsed = clockFromText(explicit) ?? clockFromText(run.scenario.world.countdown);
  if (!parsed) return null;
  const deadlineMinutes = parsed.hours * 60 + parsed.minutes;
  const sceneStart = run.beats[0]?.clock.minutes ?? run.clock.minutes;
  const dayBase = Math.floor(sceneStart / 1440) * 1440;
  let absoluteMinutes = dayBase + deadlineMinutes;
  if (absoluteMinutes < sceneStart) absoluteMinutes += 1440;
  return {
    absoluteMinutes,
    clock: formatClock(deadlineMinutes),
    fact:
      run.scenario.world.deadlineFact?.trim() ||
      `截止时间已到：${run.scenario.world.countdown?.trim() || formatClock(deadlineMinutes)}。`,
  };
}

/**
 * A delay must be established as a *new public fact* (or an explicit flag)
 * before the deadline; a passing mention in the initial facts is not enough.
 */
export function hasDelayFact(run: Run): boolean {
  if (run.world.flags.deadline_delayed === true) return true;
  const initial = new Set(run.scenario.world.initialFacts.map((fact) => fact.trim()));
  return run.world.publicFacts.some(
    (fact) => !initial.has(fact.trim()) && DELAY_FACT_PATTERN.test(fact),
  );
}

export function clockForNextBeat(run: Run): {
  clock: Run['clock'];
  jump: Run['beats'][number]['nextTimeJump'];
} {
  const last = run.beats.filter((beat) => beat.phase === 'complete').at(-1);
  if (!last) {
    return { clock: run.clock, jump: null };
  }
  if (!last.nextTimeJump) {
    return { clock: last.clock, jump: null };
  }
  const next = clockAfter(last.clock.minutes, last.nextTimeJump.elapsedMinutes);
  return {
    clock: {
      minutes: next.minutes,
      display: next.display,
      dateLabel: run.scenario.world.dateLabel,
    },
    jump: last.nextTimeJump,
  };
}

export function runSummary(run: Run): RunSummary {
  const last = run.beats.at(-1);
  return {
    id: run.id,
    title: run.scenario.title,
    subtitle: run.scenario.subtitle,
    status: run.status,
    beats: run.beats.filter((beat) => beat.phase === 'complete').length,
    maxBeats: run.settings.maxBeats,
    characterNames: run.scenario.characters.map((character) => character.name),
    updatedAt: run.updatedAt,
    createdAt: run.createdAt,
    currentBeatTitle: last?.title || null,
  };
}
