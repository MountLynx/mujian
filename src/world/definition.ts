import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.ts';
import { normalizeCharacterDefinition } from '../engine/scenario.ts';
import type {
  WorldActorDefinition,
  WorldConnectionDefinition,
  WorldDefinition,
  WorldFactSeed,
  WorldFactionDefinition,
  WorldPresetSummary,
  WorldRegionDefinition,
  WorldSignalSeed,
  WorldThreadDefinition,
} from './types.ts';
import { asNumber, asString, asStringArray, clamp, newId } from '../utils.ts';

export class WorldValidationError extends Error {
  issues: string[];
  constructor(issues: string[]) {
    super(`世界手稿不完整：${issues.join('；')}`);
    this.name = 'WorldValidationError';
    this.issues = issues;
  }
}

type Raw = Record<string, unknown>;

function obj(value: unknown, label: string, issues: string[]): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    issues.push(`${label}必须是一个对象`);
    return {};
  }
  return value as Raw;
}

function text(value: unknown, label: string, issues: string[], fallback = ''): string {
  const result = asString(value, fallback);
  if (!result) issues.push(`${label}不能为空`);
  return result;
}

function idFor(value: unknown, fallback: string): string {
  const raw = asString(value) || fallback;
  return (
    raw
      .toLowerCase()
      .replace(/[^a-z0-9_\-\u4e00-\u9fff]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 56) || fallback
  );
}

function numericRecord(value: unknown, fallback: Record<string, number> = {}): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...fallback };
  const out: Record<string, number> = { ...fallback };
  for (const [key, entry] of Object.entries(value as Raw)) {
    const n = Number(entry);
    if (Number.isFinite(n)) out[key.slice(0, 40)] = n;
  }
  return out;
}

function stringArray(value: unknown): string[] {
  return asStringArray(value).slice(0, 24);
}

function normalizeRegion(rawValue: unknown, index: number, issues: string[]): WorldRegionDefinition {
  const raw = obj(rawValue, `区域 ${index + 1}`, issues);
  const name = text(raw.name, `区域 ${index + 1} 的名字`, issues);
  const id = idFor(raw.id, name ? `region-${name}` : `region-${index + 1}`);
  const connectionsRaw = Array.isArray(raw.connections) ? raw.connections : [];
  const connections: WorldConnectionDefinition[] = [];
  for (const entry of connectionsRaw) {
    if (!entry || typeof entry !== 'object') continue;
    const conn = entry as Raw;
    const to = idFor(conn.to, '');
    if (!to) continue;
    connections.push({
      to,
      travelMinutes: Math.round(clamp(asNumber(conn.travelMinutes, 120), 1, 60 * 24 * 30)),
      mode: asString(conn.mode, '陆路'),
      risk: asString(conn.risk),
    });
  }
  return {
    id,
    name,
    kind: asString(raw.kind, '区域'),
    description: asString(raw.description, '一块尚未被记录的区域。'),
    controllingFactionId: asString(raw.controllingFactionId) || null,
    publicStatus: asString(raw.publicStatus, '局势不明。'),
    resources: numericRecord(raw.resources, { stability: 50 }),
    connections,
    landmarks: stringArray(raw.landmarks),
  };
}

function normalizeFaction(rawValue: unknown, index: number, issues: string[]): WorldFactionDefinition {
  const raw = obj(rawValue, `势力 ${index + 1}`, issues);
  const name = text(raw.name, `势力 ${index + 1} 的名字`, issues);
  const id = idFor(raw.id, name ? `faction-${name}` : `faction-${index + 1}`);
  return {
    id,
    name,
    description: asString(raw.description, '一个不太透明的权力集团。'),
    goal: text(raw.goal, `${name || '势力'} 的目标`, issues),
    secret: asString(raw.secret, '它有一件不想被知道的事。'),
    power: Math.round(clamp(asNumber(raw.power, 5), 0, 10)),
    legitimacy: Math.round(clamp(asNumber(raw.legitimacy, 5), 0, 10)),
    resources: numericRecord(raw.resources, { coin: 10, influence: 5 }),
    attitudes: numericRecord(raw.attitudes, {}),
    leaderActorId: asString(raw.leaderActorId) || null,
    sigil: asString(raw.sigil) || undefined,
    color: /^#[0-9a-fA-F]{3,8}$/.test(asString(raw.color)) ? asString(raw.color) : undefined,
  };
}

function normalizeThread(rawValue: unknown, index: number, issues: string[]): WorldThreadDefinition {
  const raw = obj(rawValue, `剧情线程 ${index + 1}`, issues);
  const title = text(raw.title, `线程 ${index + 1} 的标题`, issues);
  const id = idFor(raw.id, title ? `thread-${title}` : `thread-${index + 1}`);
  const clockRaw = obj(raw.clock, `线程 ${title || index + 1} 的时钟`, issues);
  const statusRaw = asString(raw.status, 'active');
  return {
    id,
    title,
    question: text(raw.question, `线程 ${title || index + 1} 的问题`, issues),
    stakes: asString(raw.stakes, '没有明确代价。'),
    tension: Math.round(clamp(asNumber(raw.tension, 4), 0, 10)),
    clock: {
      value: Math.round(clamp(asNumber(clockRaw.value, 3), 0, 999)),
      max: Math.round(clamp(asNumber(clockRaw.max, 6), 1, 999)),
      unit: asString(clockRaw.unit, '刻'),
      label: asString(clockRaw.label, '压力时钟'),
      onFill: asString(clockRaw.onFill, '时钟填满时，局势将不可逆地改变。'),
    },
    involvedFactionIds: stringArray(raw.involvedFactionIds),
    involvedRegionIds: stringArray(raw.involvedRegionIds),
    status: statusRaw === 'resolved' || statusRaw === 'failed' ? statusRaw : 'active',
  };
}

function normalizeFact(rawValue: unknown, index: number, issues: string[]): WorldFactSeed {
  const raw = obj(rawValue, `初始事实 ${index + 1}`, issues);
  return {
    text: text(raw.text, `初始事实 ${index + 1} 的内容`, issues),
    importance: Math.round(clamp(asNumber(raw.importance, 2), 1, 5)),
    knownBy: stringArray(raw.knownBy),
    public: Boolean(raw.public),
    tag: asString(raw.tag) || undefined,
  };
}

function normalizeSignal(rawValue: unknown, index: number, issues: string[]): WorldSignalSeed {
  const raw = obj(rawValue, `初始信号 ${index + 1}`, issues);
  return {
    fromEntityId: asString(raw.fromEntityId),
    toEntityIds: stringArray(raw.toEntityIds),
    channel: asString(raw.channel, '密使'),
    content: asString(raw.content, '一封密信。'),
    delayMinutes: Math.round(clamp(asNumber(raw.delayMinutes, 240), 0, 60 * 24 * 60)),
    factIndex: Math.round(asNumber(raw.factIndex, 0)),
  };
}

export function normalizeWorld(input: unknown, opts: { id?: string } = {}): WorldDefinition {
  const issues: string[] = [];
  const raw = obj(input, '世界', issues);
  const title = text(raw.title, '世界标题', issues);
  const settingRaw = obj(raw.setting, '世界设定', issues);
  const rulesRaw = raw.rules && typeof raw.rules === 'object' ? (raw.rules as Raw) : {};

  const regionsRaw = Array.isArray(settingRaw.regions) ? settingRaw.regions : [];
  const factionsRaw = Array.isArray(settingRaw.factions) ? settingRaw.factions : [];
  const actorsRaw = Array.isArray(settingRaw.actors) ? settingRaw.actors : [];
  const threadsRaw = Array.isArray(settingRaw.threads) ? settingRaw.threads : [];
  const factsRaw = Array.isArray(settingRaw.initialFacts) ? settingRaw.initialFacts : [];
  const signalsRaw = Array.isArray(settingRaw.initialSignals) ? settingRaw.initialSignals : [];

  if (regionsRaw.length < 2) issues.push('世界至少需要 2 个区域');
  if (regionsRaw.length > 12) issues.push('一个世界最多支持 12 个区域');
  if (factionsRaw.length < 1) issues.push('世界至少需要 1 个势力');
  if (actorsRaw.length < 2) issues.push('世界至少需要 2 名具名角色');
  if (actorsRaw.length > 10) issues.push('一个世界最多支持 10 名具名角色');
  if (threadsRaw.length < 1) issues.push('世界至少需要 1 条剧情线程');

  const regions = regionsRaw.map((entry, index) => normalizeRegion(entry, index, issues));
  const factions = factionsRaw.map((entry, index) => normalizeFaction(entry, index, issues));
  const threads = threadsRaw.map((entry, index) => normalizeThread(entry, index, issues));
  const facts = factsRaw.map((entry, index) => normalizeFact(entry, index, issues));
  const signals = signalsRaw.map((entry, index) => normalizeSignal(entry, index, issues));

  const regionIds = new Set<string>();
  for (const region of regions) {
    let candidate = region.id;
    let suffix = 2;
    while (regionIds.has(candidate)) candidate = `${region.id}-${suffix++}`;
    region.id = candidate;
    regionIds.add(candidate);
  }
  const factionIds = new Set<string>();
  for (const faction of factions) {
    let candidate = faction.id;
    let suffix = 2;
    while (factionIds.has(candidate)) candidate = `${faction.id}-${suffix++}`;
    faction.id = candidate;
    factionIds.add(candidate);
  }

  const actors: WorldActorDefinition[] = [];
  for (let index = 0; index < actorsRaw.length; index += 1) {
    const entry = obj(actorsRaw[index], `角色 ${index + 1}`, issues);
    const base = normalizeCharacterDefinition(entry, index, issues);
    const regionId = idFor(entry.regionId, '');
    const factionId = idFor(entry.factionId, '') || null;
    actors.push({
      ...base,
      regionId,
      factionId,
      spotlight: Boolean(entry.spotlight),
      agenda: asString(entry.agenda, base.desire),
      worldTags: stringArray(entry.worldTags),
    });
  }
  const actorIds = new Set<string>();
  for (const actor of actors) {
    let candidate = actor.id;
    let suffix = 2;
    while (actorIds.has(candidate)) candidate = `${actor.id}-${suffix++}`;
    actor.id = candidate;
    actorIds.add(candidate);
  }
  const allEntityIds = new Set([...regionIds, ...factionIds, ...actorIds]);
  for (const actor of actors) {
    if (!regionIds.has(actor.regionId)) issues.push(`${actor.name} 的区域不存在`);
    if (actor.factionId && !factionIds.has(actor.factionId)) issues.push(`${actor.name} 的势力不存在`);
    actor.relationships = actor.relationships.filter((rel) => actorIds.has(rel.targetId));
  }
  for (const faction of factions) {
    if (faction.leaderActorId && !actorIds.has(faction.leaderActorId)) {
      issues.push(`势力 ${faction.name} 的领袖 ${faction.leaderActorId} 不存在`);
    }
    faction.attitudes = Object.fromEntries(
      Object.entries(faction.attitudes).filter(([id]) => factionIds.has(id)),
    );
  }
  for (const thread of threads) {
    thread.involvedFactionIds = thread.involvedFactionIds.filter((id) => factionIds.has(id));
    thread.involvedRegionIds = thread.involvedRegionIds.filter((id) => regionIds.has(id));
  }
  for (const region of regions) {
    region.connections = region.connections.filter((conn) => regionIds.has(conn.to) && conn.to !== region.id);
    if (region.controllingFactionId && !factionIds.has(region.controllingFactionId)) {
      region.controllingFactionId = null;
    }
  }
  const knownTokens = new Set<string>(['all', 'world', ...allEntityIds]);
  for (const fact of facts) {
    fact.knownBy = fact.knownBy.filter((token) => knownTokens.has(token));
    if (!fact.knownBy.length) fact.knownBy = ['all'];
    if (fact.knownBy.includes('all')) fact.public = true;
  }
  for (const signal of signals) {
    if (!allEntityIds.has(signal.fromEntityId)) issues.push(`初始信号的发送者不存在：${signal.fromEntityId}`);
    signal.toEntityIds = signal.toEntityIds.filter((id) => allEntityIds.has(id));
    if (signal.toEntityIds.length === 0) issues.push('初始信号至少需要一个接收者');
    if (signal.factIndex < 0 || signal.factIndex >= facts.length) {
      issues.push(`初始信号引用了不存在的初始事实索引：${signal.factIndex}`);
    }
  }

  const startClock = asString(settingRaw.startClock, '18:00');
  if (!/^\d{1,2}[:：]\d{2}$/.test(startClock)) issues.push('世界开场时间必须使用 HH:MM 格式');
  const spotlightRegionIdRaw = asString(settingRaw.spotlightRegionId, regions[0]?.id ?? '');
  const spotlightRegionId = regionIds.has(spotlightRegionIdRaw)
    ? spotlightRegionIdRaw
    : regions.find((region) => actors.filter((actor) => actor.regionId === region.id).length >= 2)?.id ??
      regions[0]?.id ??
      '';
  if (!spotlightRegionId) issues.push('无法确定聚焦区域');

  const setting = {
    era: asString(settingRaw.era, '未指定纪元'),
    tone: asString(settingRaw.tone, '宏大、具体、有代价。'),
    overview: text(settingRaw.overview, '世界概述', issues),
    geography: asString(settingRaw.geography, ''),
    hiddenCanon: asString(settingRaw.hiddenCanon, ''),
    directorNotes: asString(settingRaw.directorNotes, ''),
    startLabel: asString(settingRaw.startLabel, '第一日'),
    startClock,
    hardRules: asStringArray(settingRaw.hardRules).slice(0, 15),
    spotlightRegionId,
    regions,
    factions,
    actors,
    threads,
    initialFacts: facts,
    initialSignals: signals,
  };

  const rules = {
    maxEpochs: Math.round(clamp(asNumber(rulesRaw.maxEpochs, 6), 2, 24)),
    defaultAdvanceMinutes: Math.round(clamp(asNumber(rulesRaw.defaultAdvanceMinutes, 180), 5, 60 * 24 * 7)),
    sceneMaxBeats: Math.round(clamp(asNumber(rulesRaw.sceneMaxBeats, 3), 2, 6)),
    spotlightPolicy: asString(
      rulesRaw.spotlightPolicy,
      '世界的宏大事件可以由导演直接推进；聚光角色的重大个人选择应留给聚焦场景。',
    ),
  };

  if (issues.length) throw new WorldValidationError(issues);
  const id = idFor(opts.id ?? raw.id, `world-${newId()}`);
  return {
    id,
    title,
    subtitle: asString(raw.subtitle),
    kicker: asString(raw.kicker, '世界正在运转'),
    isPreset: Boolean(raw.isPreset),
    setting,
    rules,
    createdAt: asString(raw.createdAt) || undefined,
  };
}

export async function loadWorldPresets(): Promise<WorldDefinition[]> {
  const entries = await fs.readdir(config.worldsDir, { withFileTypes: true });
  const worlds: WorldDefinition[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const full = path.join(config.worldsDir, entry.name);
    try {
      const raw = JSON.parse(await fs.readFile(full, 'utf8'));
      const world = normalizeWorld(raw, { id: path.basename(entry.name, '.json') });
      world.isPreset = true;
      worlds.push(world);
    } catch (error) {
      console.error(`[world] failed to load ${full}:`, error);
    }
  }
  return worlds.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
}

export async function getWorldPreset(id: string): Promise<WorldDefinition | null> {
  return (await loadWorldPresets()).find((world) => world.id === id) ?? null;
}

export function worldPresetSummary(world: WorldDefinition): WorldPresetSummary {
  return {
    id: world.id,
    title: world.title,
    subtitle: world.subtitle,
    kicker: world.kicker,
    regionNames: world.setting.regions.map((region) => region.name),
    factionNames: world.setting.factions.map((faction) => faction.name),
    actorNames: world.setting.actors.map((actor) => actor.name),
    maxEpochs: world.rules.maxEpochs,
    isPreset: Boolean(world.isPreset),
  };
}
