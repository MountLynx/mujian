import type {
  CharacterDefinition,
  ConditionSeed,
  MemorySeed,
  RelationshipDefinition,
  Scenario,
} from '../types.ts';
import type { WorldActorDefinition, WorldRun, WorldSceneHook } from './types.ts';
import { newId, nowIso } from '../utils.ts';

function uniqueBy<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = key(item);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function actorConditions(run: WorldRun, actorId: string): ConditionSeed[] {
  return (run.actors[actorId]?.conditions ?? []).map((condition) => ({
    ...condition,
    kind: condition.kind ?? 'other',
    abilities: condition.abilities ? [...condition.abilities] : undefined,
  }));
}

function knowledgeForActor(run: WorldRun, actorId: string): string[] {
  return run.facts
    .filter((fact) => fact.retiredAtEpoch === null && fact.knownBy.includes(actorId))
    .sort((a, b) => b.createdEpoch - a.createdEpoch || b.importance - a.importance)
    .map((fact) => fact.text);
}

function buildCharacter(
  run: WorldRun,
  actor: WorldActorDefinition,
  participantIds: string[],
  hook: WorldSceneHook,
): CharacterDefinition {
  const facts = knowledgeForActor(run, actor.id);
  const memorySeeds: MemorySeed[] = [
    ...actor.memories,
    { summary: `世界层的当前目标：${actor.agenda}`, importance: 4 },
    ...facts.map((text) => ({ summary: `[世界已知] ${text}`, importance: 3 })),
  ];
  const relationships: RelationshipDefinition[] = actor.relationships
    .filter((relationship) => participantIds.includes(relationship.targetId))
    .map((relationship) => ({
      targetId: relationship.targetId,
      label: relationship.label,
      attitude: relationship.attitude,
    }));
  return {
    id: actor.id,
    name: actor.name,
    title: actor.title,
    age: actor.age,
    pronouns: actor.pronouns,
    publicProfile: actor.publicProfile,
    appearance: actor.appearance,
    personality: actor.personality,
    desire: actor.desire,
    fear: actor.fear,
    secret: actor.secret,
    abilities: { ...actor.abilities },
    traits: actor.traits.map((trait) => ({ ...trait })),
    possessions: [...actor.possessions],
    relationships,
    memories: uniqueBy(memorySeeds, (memory) => memory.summary).slice(0, 24),
    conditions: actorConditions(run, actor.id),
  };
}

export function buildWorldScene(run: WorldRun, hook: WorldSceneHook): Scenario {
  const world = run.definition;
  const region = world.setting.regions.find((entry) => entry.id === hook.regionId);
  if (!region) throw new Error('聚焦场景的区域不存在。');
  const participants = hook.participantIds
    .map((id) => world.setting.actors.find((actor) => actor.id === id) ?? null)
    .filter((actor): actor is WorldActorDefinition => Boolean(actor) && run.actors[actor!.id]?.regionId === hook.regionId);
  if (participants.length < 2) throw new Error('聚焦场景至少需要两名同区域角色。');
  const participantIds = participants.map((actor) => actor.id);
  const sourceEvent = run.events.find((event) => event.id === hook.sourceEventId);
  const sharedFacts = run.facts
    .filter(
      (fact) =>
        fact.retiredAtEpoch === null &&
        (fact.public || participantIds.every((id) => fact.knownBy.includes(id))),
    )
    .sort((a, b) => b.importance - a.importance)
    .slice(0, 12)
    .map((fact) => fact.text);
  const activeThreads = world.setting.threads
    .filter((thread) => run.threads[thread.id]?.status === 'active')
    .map((thread) => {
      const runtime = run.threads[thread.id]!;
      return `${thread.title}：${runtime.clockValue}/${thread.clock.max} ${thread.clock.unit}`;
    });
  const legalContext = [
    `这是《${world.title}》世界中的一个聚焦场景，发生在第 ${run.clock.day} 日 ${run.clock.time}。`,
    sourceEvent ? `世界层事件：${sourceEvent.title}。${sourceEvent.summary}` : '',
    '本场景只处理局部问题；世界级战争的最终胜负、城市的真正献祭或最终结局不能由本场景提前宣布。',
  ]
    .filter(Boolean)
    .join('\n');
  return {
    id: `world-${world.id}-${newId('scene')}`,
    title: hook.title,
    subtitle: hook.question,
    kicker: `世界聚焦 · ${region.name}`,
    isPreset: false,
    createdAt: nowIso(),
    world: {
      title: hook.title,
      era: world.setting.era,
      tone: world.setting.tone,
      setting: [
        world.setting.overview,
        world.setting.geography,
        `【区域】${region.name}：${region.description}`,
        `【世界硬规则】\n${world.setting.hardRules.map((rule) => `- ${rule}`).join('\n')}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
      location: `${region.name}（${region.kind}）${region.landmarks?.length ? `｜地标：${region.landmarks.join('、')}` : ''}`,
      dateLabel: `${world.setting.startLabel} · 第 ${run.clock.day} 日`,
      startClock: run.clock.time,
      premise: `${hook.question}\n${hook.stakes}`,
      opening: hook.publicBrief,
      directorNotes: [
        '这是一个嵌套在世界推演中的聚焦场景。世界层已经有自己的事件、势力和时钟；本场景只需要把注意力集中在眼前的人与选择上。',
        '不要让角色在本场景里突然获得世界层未公开的真相。让已知信息、地位、资源与关系决定他们的困难。',
        '场景结束后，世界层会吸收它的余波；但本场景不能直接宣布哪座城最终被抹去。',
        hook.stakes ? `本场 stakes：${hook.stakes}` : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
      hiddenCanon: legalContext,
      initialFacts: uniqueBy(
        [...sharedFacts, sourceEvent?.publicNarrative ?? ''].filter(Boolean),
        (fact) => fact,
      ),
      countdown: activeThreads.join('｜') || world.setting.startLabel,
    },
    rules: {
      maxBeats: Math.min(world.rules.sceneMaxBeats, 5),
      difficultyGuidance:
        '这是世界层压力下的局部场景。按照当前处境、角色能力、地方阻力和情感代价给 DC，不要因为世界级危机就把普通行动全部抬高。',
    },
    characters: participants.map((actor) => buildCharacter(run, actor, participantIds, hook)),
  };
}
