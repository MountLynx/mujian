import type {
  ConditionSeed,
} from '../types.ts';
import type {
  WorldDraftActorChange,
  WorldDraftEvent,
  WorldDraftFact,
  WorldDraftFactionChange,
  WorldDraftRegionChange,
  WorldDraftScene,
  WorldDraftSignal,
  WorldDraftThreadChange,
  WorldEpochDraft,
  WorldEvent,
  WorldRun,
  WorldThreadStatus,
} from '../world/types.ts';
import { asNumber, asString, asStringArray, clamp } from '../utils.ts';

type Raw = Record<string, unknown>;

function object(value: unknown, label: string): Raw {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是一个对象`);
  }
  return value as Raw;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown, fallback = ''): string {
  return asString(value, fallback);
}

function number(value: unknown, fallback: number): number {
  return asNumber(value, fallback);
}

function bool(value: unknown): boolean {
  return value === true || value === 'true' || value === '是';
}

function numericMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, number> = {};
  for (const [key, entry] of Object.entries(value as Raw)) {
    const n = Number(entry);
    if (Number.isFinite(n)) result[key.slice(0, 48)] = n;
  }
  return result;
}

function statusOf(value: unknown): WorldThreadStatus | undefined {
  const raw = str(value);
  return raw === 'active' || raw === 'resolved' || raw === 'failed' ? raw : undefined;
}

function knownEntities(run: WorldRun): Set<string> {
  return new Set([
    ...run.definition.setting.actors.map((actor) => actor.id),
    ...run.definition.setting.factions.map((faction) => faction.id),
  ]);
}

function parseFacts(value: unknown): WorldDraftFact[] {
  return array(value)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Raw;
      const text = str(raw.text);
      if (!text) return null;
      const knownBy = asStringArray(raw.known_by ?? raw.knownBy);
      return {
        text,
        importance: Math.round(clamp(number(raw.importance, 2), 1, 5)),
        knownBy: knownBy.length ? knownBy : [],
        public: bool(raw.public),
        tag: str(raw.tag, '事件事实'),
      } satisfies WorldDraftFact;
    })
    .filter((entry): entry is WorldDraftFact => Boolean(entry));
}

function parseRegionChanges(value: unknown, run: WorldRun): WorldDraftRegionChange[] {
  const regionIds = new Set(run.definition.setting.regions.map((region) => region.id));
  const factionIds = new Set(run.definition.setting.factions.map((faction) => faction.id));
  const result: WorldDraftRegionChange[] = [];
  for (const entry of array(value)) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Raw;
    const regionId = str(raw.region_id ?? raw.regionId);
    if (!regionIds.has(regionId)) continue;
    const controlRaw = raw.controlling_faction_id ?? raw.controllingFactionId;
    let controllingFactionId: string | null | undefined;
    if (controlRaw === null) controllingFactionId = null;
    else if (typeof controlRaw === 'string' && controlRaw) {
      controllingFactionId = factionIds.has(controlRaw) ? controlRaw : undefined;
    }
    const change: WorldDraftRegionChange = {
      regionId,
      resourceDeltas: numericMap(raw.resource_deltas ?? raw.resourceDeltas),
    };
    const status = str(raw.status);
    if (status) change.status = status;
    if (controllingFactionId !== undefined) change.controllingFactionId = controllingFactionId;
    result.push(change);
  }
  return result;
}

function parseFactionChanges(value: unknown, run: WorldRun): WorldDraftFactionChange[] {
  const factionIds = new Set(run.definition.setting.factions.map((faction) => faction.id));
  const result: WorldDraftFactionChange[] = [];
  for (const entry of array(value)) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Raw;
    const factionId = str(raw.faction_id ?? raw.factionId);
    if (!factionIds.has(factionId)) continue;
    const attitudeDeltas: Record<string, number> = {};
    for (const [id, delta] of Object.entries(numericMap(raw.attitude_deltas ?? raw.attitudeDeltas))) {
      if (factionIds.has(id)) attitudeDeltas[id] = delta;
    }
    const change: WorldDraftFactionChange = {
      factionId,
      powerDelta: Math.round(clamp(number(raw.power_delta ?? raw.powerDelta, 0), -10, 10)),
      legitimacyDelta: Math.round(
        clamp(number(raw.legitimacy_delta ?? raw.legitimacyDelta, 0), -10, 10),
      ),
      resourceDeltas: numericMap(raw.resource_deltas ?? raw.resourceDeltas),
      attitudeDeltas,
    };
    const status = str(raw.status);
    if (status) change.status = status;
    result.push(change);
  }
  return result;
}

function scalarFlagMap(value: unknown): Record<string, string | number | boolean> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, string | number | boolean> = {};
  for (const [key, entry] of Object.entries(value as Raw)) {
    if (typeof entry === 'string' || typeof entry === 'number' || typeof entry === 'boolean') {
      result[key.slice(0, 48)] = entry;
    }
  }
  return result;
}

function parseActorChanges(value: unknown, run: WorldRun): WorldDraftActorChange[] {
  const actorIds = new Set(run.definition.setting.actors.map((actor) => actor.id));
  const regionIds = new Set(run.definition.setting.regions.map((region) => region.id));
  const result: WorldDraftActorChange[] = [];
  for (const entry of array(value)) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Raw;
    const actorId = str(raw.actor_id ?? raw.actorId);
    if (!actorIds.has(actorId)) continue;
    const conditions: ConditionSeed[] = [];
    for (const rawCondition of array(raw.conditions_add ?? raw.conditionsAdd)) {
      if (!rawCondition || typeof rawCondition !== 'object') continue;
      const condition = rawCondition as Raw;
      const name = str(condition.name);
      if (!name) continue;
      const abilities = asStringArray(condition.abilities).filter((ability) =>
        ABILITY_KEYS.includes(ability as (typeof ABILITY_KEYS)[number]),
      ) as Array<(typeof ABILITY_KEYS)[number]>;
      const rawKind = str(condition.kind);
      conditions.push({
        name,
        description: str(condition.description),
        modifier: Math.round(clamp(number(condition.modifier, 0), -4, 4)),
        kind: ['injury', 'emotion', 'boon', 'other'].includes(rawKind)
          ? (rawKind as 'injury' | 'emotion' | 'boon' | 'other')
          : 'other',
        ...(abilities.length ? { abilities } : {}),
      });
    }
    const regionId = str(raw.region_id ?? raw.regionId);
    const change: WorldDraftActorChange = {
      actorId,
      stressDelta: Math.round(clamp(number(raw.stress_delta ?? raw.stressDelta, 0), -5, 5)),
      conditionsAdd: conditions,
      conditionsRemove: asStringArray(raw.conditions_remove ?? raw.conditionsRemove),
      flagsSet: scalarFlagMap(raw.flags_set ?? raw.flagsSet),
    };
    if (regionIds.has(regionId)) change.regionId = regionId;
    const status = str(raw.status);
    if (status) change.status = status;
    result.push(change);
  }
  return result;
}

function parseThreadChanges(value: unknown, run: WorldRun): WorldDraftThreadChange[] {
  const threadIds = new Set(run.definition.setting.threads.map((thread) => thread.id));
  const result: WorldDraftThreadChange[] = [];
  for (const entry of array(value)) {
    if (!entry || typeof entry !== 'object') continue;
    const raw = entry as Raw;
    const threadId = str(raw.thread_id ?? raw.threadId);
    if (!threadIds.has(threadId)) continue;
    const change: WorldDraftThreadChange = {
      threadId,
      tensionDelta: Math.round(clamp(number(raw.tension_delta ?? raw.tensionDelta, 0), -10, 10)),
      clockDelta: Math.round(clamp(number(raw.clock_delta ?? raw.clockDelta, 0), -999, 999)),
      note: str(raw.note),
    };
    const status = statusOf(raw.status);
    if (status) change.status = status;
    result.push(change);
  }
  return result;
}

function parseSignals(
  value: unknown,
  factCount: number,
  run: WorldRun,
): WorldDraftSignal[] {
  const valid = knownEntities(run);
  return array(value)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const raw = entry as Raw;
      const toEntityIds = asStringArray(raw.to_entity_ids ?? raw.toEntityIds).filter((id) =>
        valid.has(id),
      );
      if (!toEntityIds.length) return null;
      const indices = array(raw.fact_indices ?? raw.factIndices)
        .map((index) => Math.round(Number(index)))
        .filter((index) => Number.isFinite(index) && index >= 0 && index < factCount);
      return {
        toEntityIds,
        channel: str(raw.channel, '未知渠道'),
        content: str(raw.content, '一段没有署名的消息。'),
        delayMinutes: Math.round(clamp(number(raw.delay_minutes ?? raw.delayMinutes, 120), 0, 60 * 24 * 30)),
        factIndices: [...new Set(indices)],
      } satisfies WorldDraftSignal;
    })
    .filter((entry): entry is WorldDraftSignal => Boolean(entry));
}

function parseEvent(value: unknown, index: number, run: WorldRun): WorldDraftEvent | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Raw;
  const regionIds = new Set(run.definition.setting.regions.map((region) => region.id));
  const actorIds = new Set(run.definition.setting.actors.map((actor) => actor.id));
  const factionIds = new Set(run.definition.setting.factions.map((faction) => faction.id));
  const localId = str(raw.local_id ?? raw.localId, `e${index + 1}`).slice(0, 60) || `e${index + 1}`;
  const parent = str(raw.parent_local_id ?? raw.parentLocalId) || null;
  const facts = parseFacts(raw.facts);
  return {
    localId,
    parentLocalId: parent,
    title: str(raw.title, `事件 ${index + 1}`).slice(0, 80),
    regionId: regionIds.has(str(raw.region_id ?? raw.regionId)) ? str(raw.region_id ?? raw.regionId) : null,
    actorIds: asStringArray(raw.actor_ids ?? raw.actorIds).filter((id) => actorIds.has(id)),
    factionIds: asStringArray(raw.faction_ids ?? raw.factionIds).filter((id) => factionIds.has(id)),
    summary: str(raw.summary, '一件没有被记录清楚的事。'),
    publicNarrative: str(raw.public_narrative ?? raw.publicNarrative, ''),
    visibility: ['public', 'secret', 'mixed'].includes(str(raw.visibility))
      ? (str(raw.visibility) as 'public' | 'secret' | 'mixed')
      : 'mixed',
    facts,
    removeFactIds: asStringArray(raw.remove_fact_ids ?? raw.removeFactIds),
    regionChanges: parseRegionChanges(raw.region_changes ?? raw.regionChanges, run),
    factionChanges: parseFactionChanges(raw.faction_changes ?? raw.factionChanges, run),
    actorChanges: parseActorChanges(raw.actor_changes ?? raw.actorChanges, run),
    threadChanges: parseThreadChanges(raw.thread_changes ?? raw.threadChanges, run),
    signals: parseSignals(raw.signals, facts.length, run),
  };
}

function rootOf(localId: string, events: Map<string, WorldDraftEvent>): string {
  let current = localId;
  const seen = new Set<string>();
  for (let i = 0; i < 32; i += 1) {
    if (seen.has(current)) throw new Error(`事件父子关系出现循环：${[...seen, current].join(' → ')}`);
    seen.add(current);
    const event = events.get(current);
    if (!event || !event.parentLocalId) return current;
    current = event.parentLocalId;
  }
  return current;
}

const ABILITY_KEYS = ['physique', 'agility', 'perception', 'intellect', 'will', 'presence'] as const;

function writeSignatures(event: WorldDraftEvent): Set<string> {
  const out = new Set<string>();
  for (const change of event.regionChanges) {
    if (change.status !== undefined) out.add(`region:${change.regionId}:status`);
    if (change.controllingFactionId !== undefined) out.add(`region:${change.regionId}:control`);
    for (const key of Object.keys(change.resourceDeltas)) {
      if (change.resourceDeltas[key]) out.add(`region:${change.regionId}:resource:${key}`);
    }
  }
  for (const change of event.factionChanges) {
    if (change.status !== undefined) out.add(`faction:${change.factionId}:status`);
    if (change.powerDelta) out.add(`faction:${change.factionId}:power`);
    if (change.legitimacyDelta) out.add(`faction:${change.factionId}:legitimacy`);
    for (const [key, value] of Object.entries(change.resourceDeltas)) {
      if (value) out.add(`faction:${change.factionId}:resource:${key}`);
    }
    for (const [id, value] of Object.entries(change.attitudeDeltas)) {
      if (value) out.add(`faction:${change.factionId}:attitude:${id}`);
    }
  }
  for (const change of event.actorChanges) {
    if (change.regionId) out.add(`actor:${change.actorId}:region`);
    if (change.status !== undefined) out.add(`actor:${change.actorId}:status`);
    if (change.stressDelta) out.add(`actor:${change.actorId}:stress`);
    if (change.conditionsAdd.length) out.add(`actor:${change.actorId}:conditions`);
    if (change.conditionsRemove.length) out.add(`actor:${change.actorId}:conditions`);
    for (const key of Object.keys(change.flagsSet)) out.add(`actor:${change.actorId}:flag:${key}`);
  }
  for (const change of event.threadChanges) {
    out.add(`thread:${change.threadId}`);
  }
  return out;
}

function validateNoUncoordinatedConflicts(events: WorldDraftEvent[]): void {
  const map = new Map(events.map((event) => [event.localId, event]));
  for (const event of events) {
    if (event.parentLocalId && !map.has(event.parentLocalId)) {
      throw new Error(`事件 ${event.localId} 的 parent_local_id 不存在`);
    }
  }
  const roots = new Map(events.map((event) => [event.localId, rootOf(event.localId, map)]));
  const signatures = new Map(events.map((event) => [event.localId, writeSignatures(event)]));
  for (let i = 0; i < events.length; i += 1) {
    for (let j = i + 1; j < events.length; j += 1) {
      const a = events[i]!;
      const b = events[j]!;
      if (roots.get(a.localId) === roots.get(b.localId)) continue;
      const overlap = [...signatures.get(a.localId)!].filter((key) =>
        signatures.get(b.localId)!.has(key),
      );
      if (overlap.length) {
        throw new Error(
          `同时事件的写集冲突：${a.localId} 与 ${b.localId} 争用 ${overlap.join('、')}。` +
            '它们必须通过 parent_local_id 合并到同一个父事件做联合裁决，或改成不同时间/不同目标。',
        );
      }
    }
  }
}

function parseScene(value: unknown, run: WorldRun): WorldDraftScene | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Raw;
  const validRegions = new Set(run.definition.setting.regions.map((region) => region.id));
  const validActors = new Set(run.definition.setting.actors.map((actor) => actor.id));
  const regionId = str(raw.region_id ?? raw.regionId);
  if (!validRegions.has(regionId)) return null;
  const participantIds = asStringArray(raw.participant_ids ?? raw.participantIds).filter((id) => {
    if (!validActors.has(id)) return false;
    return run.actors[id]?.regionId === regionId;
  });
  const uniqueParticipants = [...new Set(participantIds)].slice(0, 4);
  if (uniqueParticipants.length < 2) return null;
  const privateCuesRaw = array(raw.private_cues ?? raw.privateCues);
  const privateCues = privateCuesRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const cue = entry as Raw;
      const actorId = str(cue.actor_id ?? cue.actorId);
      const text = str(cue.cue);
      return uniqueParticipants.includes(actorId) && text ? { actorId, cue: text } : null;
    })
    .filter((entry): entry is { actorId: string; cue: string } => Boolean(entry));
  return {
    eventLocalId: str(raw.event_local_id ?? raw.eventLocalId) || null,
    regionId,
    title: str(raw.title, '聚焦场景').slice(0, 80),
    question: str(raw.question, '这一刻，谁会先做出选择？'),
    stakes: str(raw.stakes, ''),
    publicBrief: str(raw.public_brief ?? raw.publicBrief, ''),
    participantIds: uniqueParticipants,
    privateCues,
  };
}

export function parseWorldEpochDraft(value: unknown, run: WorldRun): WorldEpochDraft {
  const root = object(value, '世界纪元');
  const eventsRaw = array(root.events);
  if (!eventsRaw.length) throw new Error('events 不能为空：世界纪元至少需要一个事件');
  const events = eventsRaw
    .slice(0, 8)
    .map((entry, index) => parseEvent(entry, index, run))
    .filter((entry): entry is WorldDraftEvent => Boolean(entry));
  if (!events.length) throw new Error('没有可识别的事件');
  // Ensure local ids are unique.
  const seen = new Set<string>();
  for (const event of events) {
    let candidate = event.localId;
    let suffix = 2;
    while (seen.has(candidate)) candidate = `${event.localId}-${suffix++}`;
    event.localId = candidate;
    seen.add(candidate);
  }
  for (const event of events) {
    if (event.parentLocalId && event.parentLocalId === event.localId) event.parentLocalId = null;
  }
  validateNoUncoordinatedConflicts(events);
  const scene = parseScene(root.scene, run);
  return {
    advanceMinutes: Math.round(clamp(number(root.advance_minutes ?? root.advanceMinutes, 180), 5, 60 * 24 * 7)),
    advanceReason: str(root.advance_reason ?? root.advanceReason, '世界在沉默中向前移动。'),
    epochTitle: str(root.epoch_title ?? root.epochTitle, '无人命名的一刻').slice(0, 80),
    worldSummary: str(root.world_summary ?? root.worldSummary, '世界发生了变化。'),
    events,
    scene,
  };
}

/** Re-parse applied event effects for the UI/debug without trusting unknown LLM fields. */
export function eventEffectText(event: WorldEvent): string {
  const pieces: string[] = [];
  if (event.effects.factIdsAdded.length) pieces.push(`${event.effects.factIdsAdded.length} 条新事实`);
  for (const change of event.effects.regionChanges) pieces.push(`区域 ${change.regionId}`);
  for (const change of event.effects.factionChanges) pieces.push(`势力 ${change.factionId}`);
  for (const change of event.effects.actorChanges) pieces.push(`角色 ${change.actorId}`);
  for (const change of event.effects.threadChanges) pieces.push(`线程 ${change.threadId}`);
  return pieces.join(' · ');
}
