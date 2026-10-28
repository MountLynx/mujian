import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.ts';
import {
  ABILITY_KEYS,
  type AbilityKey,
  type CharacterDefinition,
  type ConditionSeed,
  type MemorySeed,
  type RelationshipDefinition,
  type Scenario,
  type ScenarioSummary,
  type TraitDefinition,
} from '../types.ts';
import { asNumber, asString, asStringArray, clamp, newId } from '../utils.ts';

function normalizeClock(value: unknown): string | undefined {
  const raw = asString(value).trim().replace('：', ':');
  const match = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export class ScenarioValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`剧本配置不完整：${issues.join('；')}`);
    this.name = 'ScenarioValidationError';
    this.issues = issues;
  }
}

type Raw = Record<string, unknown>;

function rawObject(value: unknown, label: string, issues: string[]): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${label}必须是一个对象`);
    return {};
  }
  return value as Raw;
}

function requiredText(value: unknown, label: string, issues: string[]): string {
  const text = asString(value);
  if (!text) issues.push(`${label}不能为空`);
  return text;
}

function normalizeId(value: unknown, fallback: string): string {
  const raw = asString(value) || fallback;
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9_\-\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || fallback;
}

function normalizeAbilities(value: unknown): Record<AbilityKey, number> {
  const raw = value && typeof value === 'object' ? (value as Raw) : {};
  const result = {} as Record<AbilityKey, number>;
  for (const ability of ABILITY_KEYS) {
    result[ability] = Math.round(clamp(asNumber(raw[ability], 5), 1, 10));
  }
  return result;
}

function normalizeTraits(value: unknown): TraitDefinition[] {
  if (!Array.isArray(value)) return [];
  const traits: TraitDefinition[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      traits.push({ name: entry.trim(), description: '', bonus: 1, ability: null });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Raw;
    const name = asString(raw.name);
    if (!name) continue;
    const rawAbility = asString(raw.ability);
    const ability = (ABILITY_KEYS as readonly string[]).includes(rawAbility)
      ? (rawAbility as AbilityKey)
      : null;
    traits.push({
      name,
      description: asString(raw.description),
      bonus: Math.round(clamp(asNumber(raw.bonus, 1), -2, 4)),
      ability,
    });
  }
  return traits.slice(0, 8);
}

function normalizeMemories(value: unknown): MemorySeed[] {
  if (!Array.isArray(value)) return [];
  const memories: MemorySeed[] = [];
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) {
      memories.push({ summary: entry.trim(), importance: 2 });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Raw;
    const summary = asString(raw.summary);
    if (!summary) continue;
    memories.push({
      summary,
      detail: asString(raw.detail) || undefined,
      importance: Math.round(clamp(asNumber(raw.importance, 2), 1, 5)),
    });
  }
  return memories.slice(0, 12);
}

function normalizeConditions(value: unknown): ConditionSeed[] {
  if (!Array.isArray(value)) return [];
  const conditions: ConditionSeed[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Raw;
    const name = asString(raw.name);
    if (!name) continue;
    const modifier = Math.round(clamp(asNumber(raw.modifier, 0), -4, 4));
    const rawAbilities = Array.isArray(raw.abilities) ? raw.abilities : [];
    const abilities = rawAbilities
      .map((item) => asString(item))
      .filter((item): item is AbilityKey => (ABILITY_KEYS as readonly string[]).includes(item));
    const kindRaw = asString(raw.kind);
    const kind = ['injury', 'emotion', 'boon', 'other'].includes(kindRaw)
      ? (kindRaw as 'injury' | 'emotion' | 'boon' | 'other')
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
      modifier,
      kind,
      visibility,
      ...(abilities.length ? { abilities } : {}),
    });
  }
  return conditions;
}

export function normalizeCharacterDefinition(rawValue: unknown, index: number, issues: string[]): CharacterDefinition {
  const raw = rawObject(rawValue, `角色 ${index + 1}`, issues);
  const name = requiredText(raw.name, `角色 ${index + 1} 的名字`, issues);
  const id = normalizeId(raw.id, name ? `角色-${name}` : `character-${index + 1}`) || `character-${index + 1}`;
  const relationshipsRaw = Array.isArray(raw.relationships) ? raw.relationships : [];
  const relationships: RelationshipDefinition[] = [];
  for (const rel of relationshipsRaw) {
    if (!rel || typeof rel !== 'object') continue;
    const item = rel as Raw;
    const targetId = normalizeId(item.targetId, '');
    if (!targetId) continue;
    relationships.push({
      targetId,
      label: asString(item.label, '关系'),
      attitude: asString(item.attitude),
    });
  }
  return {
    id,
    name,
    title: asString(raw.title, '身份未明'),
    age: asString(raw.age) || undefined,
    pronouns: asString(raw.pronouns) || undefined,
    publicProfile: asString(raw.publicProfile, '关于此人的公开信息很少。'),
    appearance: asString(raw.appearance) || undefined,
    personality: requiredText(raw.personality, `${name || '角色'} 的性格`, issues),
    desire: requiredText(raw.desire, `${name || '角色'} 的欲望`, issues),
    fear: requiredText(raw.fear, `${name || '角色'} 的恐惧`, issues),
    secret: asString(raw.secret) || '有一个尚未被任何人知晓的秘密。',
    abilities: normalizeAbilities(raw.abilities),
    traits: normalizeTraits(raw.traits),
    possessions: asStringArray(raw.possessions).slice(0, 12),
    relationships,
    memories: normalizeMemories(raw.memories),
    conditions: normalizeConditions(raw.conditions),
    passive: raw.passive === true || undefined,
  };
}

export function normalizeScenario(input: unknown, opts: { id?: string } = {}): Scenario {
  const issues: string[] = [];
  const raw = rawObject(input, '剧本', issues);
  const title = requiredText(raw.title, '剧本标题', issues);
  const worldRaw = rawObject(raw.world, '世界观', issues);
  const charactersRaw = Array.isArray(raw.characters) ? raw.characters : [];
  if (charactersRaw.length < 2) issues.push('至少需要 2 名角色');
  if (charactersRaw.length > 6) issues.push('一个剧本最多支持 6 名角色');

  const characters = charactersRaw.map((entry, index) => normalizeCharacterDefinition(entry, index, issues));
  const seen = new Set<string>();
  for (const character of characters) {
    let candidate = character.id;
    let suffix = 2;
    while (seen.has(candidate)) {
      candidate = `${character.id}-${suffix++}`;
    }
    character.id = candidate;
    seen.add(candidate);
  }
  if (characters.length && characters.every((character) => character.passive)) {
    issues.push('至少需要一位主动角色；被动角色不能组成整场推演');
  }
  const ids = new Set(characters.map((character) => character.id));
  for (const character of characters) {
    character.relationships = character.relationships.filter((rel) => ids.has(rel.targetId));
    for (const memory of character.memories) {
      const text = `${memory.summary} ${memory.detail ?? ''}`;
      if (text.includes('{{') || text.includes('}}')) {
        issues.push(`${character.name} 的记忆里含有不被支持的模板标记`);
      }
    }
  }

  const worldTitle = asString(worldRaw.title, title);
  const startClock = asString(worldRaw.startClock, '22:40');
  if (!/^\d{1,2}[:：]\d{2}$/.test(startClock)) {
    issues.push('开场时间必须使用 HH:MM 格式');
  }

  const rulesRaw = raw.rules && typeof raw.rules === 'object' ? (raw.rules as Raw) : {};
  const maxBeats = Math.round(clamp(asNumber(rulesRaw.maxBeats, 5), 3, 12));

  const scenario: Scenario = {
    id: normalizeId(opts.id ?? raw.id, `scenario-${newId()}`),
    title,
    subtitle: asString(raw.subtitle),
    kicker: asString(raw.kicker, '一幕未写下的故事'),
    isPreset: Boolean(raw.isPreset),
    createdAt: asString(raw.createdAt) || undefined,
    world: {
      title: worldTitle,
      era: asString(worldRaw.era, '未指定时代'),
      tone: asString(worldRaw.tone, '克制、具体、有代价的叙事。'),
      setting: requiredText(worldRaw.setting, '世界与场所设定', issues),
      location: requiredText(worldRaw.location, '当前场景地点', issues),
      dateLabel: asString(worldRaw.dateLabel, '今日'),
      startClock,
      premise: requiredText(worldRaw.premise, '开场冲突', issues),
      opening: requiredText(worldRaw.opening, '开场描写', issues),
      directorNotes: asString(worldRaw.directorNotes),
      hiddenCanon: asString(worldRaw.hiddenCanon) || undefined,
      initialFacts: asStringArray(worldRaw.initialFacts).slice(0, 15),
      countdown: asString(worldRaw.countdown) || undefined,
      deadlineClock: normalizeClock(worldRaw.deadlineClock),
      deadlineFact: asString(worldRaw.deadlineFact) || undefined,
    },
    characters,
    rules: {
      maxBeats,
      difficultyGuidance: asString(rulesRaw.difficultyGuidance) || undefined,
    },
  };

  if (issues.length) throw new ScenarioValidationError(issues);
  return scenario;
}

export async function loadPresetScenarios(): Promise<Scenario[]> {
  const entries = await fs.readdir(config.scenariosDir, { withFileTypes: true });
  const scenarios: Scenario[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const fullPath = path.join(config.scenariosDir, entry.name);
    try {
      const raw = JSON.parse(await fs.readFile(fullPath, 'utf8'));
      const scenario = normalizeScenario(raw, { id: path.basename(entry.name, '.json') });
      scenario.isPreset = true;
      scenarios.push(scenario);
    } catch (error) {
      console.error(`[scenario] failed to load ${fullPath}:`, error);
    }
  }
  return scenarios.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}

export async function getPresetScenario(id: string): Promise<Scenario | null> {
  const scenarios = await loadPresetScenarios();
  return scenarios.find((scenario) => scenario.id === id) ?? null;
}

export function scenarioSummary(scenario: Scenario): ScenarioSummary {
  return {
    id: scenario.id,
    title: scenario.title,
    subtitle: scenario.subtitle,
    kicker: scenario.kicker,
    characterNames: scenario.characters.map((character) => character.name),
    location: scenario.world.location,
    maxBeats: scenario.rules.maxBeats,
    isPreset: Boolean(scenario.isPreset),
  };
}
