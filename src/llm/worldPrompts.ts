import type {
  WorldActorDefinition,
  WorldDefinition,
  WorldEvent,
  WorldFactionDefinition,
  WorldFact,
  WorldRegionDefinition,
  WorldRun,
  WorldSignal,
  WorldThreadDefinition,
} from '../world/types.ts';
import { compactClock } from '../world/run.ts';
import { truncate } from '../utils.ts';

const WORLD_SCHEMA = `{
  "advance_minutes": 180,
  "advance_reason": "为什么时间推进这么久；必须由事件与进程推动",
  "epoch_title": "4-8 个字的纪元标题",
  "world_summary": "从世界全知视角概括这一刻，2-4 句，仅供导演组/作者看",
  "events": [
    {
      "local_id": "e1",
      "parent_local_id": null,
      "title": "4-10 字的事件标题",
      "region_id": "区域 id 或 null",
      "actor_ids": ["具名角色 id"],
      "faction_ids": ["势力 id"],
      "summary": "客观发生了什么，1-2 句",
      "public_narrative": "如果这事件被看见/听见，局外人会得到怎样的公开版本，1-2 句",
      "visibility": "public|secret|mixed",
      "facts": [
        {
          "text": "世界真相层新增/揭示的一条具体事实",
          "importance": 3,
          "known_by": ["actor_id 或 faction_id"],
          "public": false,
          "tag": "事实标签"
        }
      ],
      "remove_fact_ids": ["要标记为失效的已有 fact id"],
      "region_changes": [
        {
          "region_id": "区域 id",
          "status": "新的公开状态",
          "controlling_faction_id": "势力 id 或不填",
          "resource_deltas": {"stability": -5}
        }
      ],
      "faction_changes": [
        {
          "faction_id": "势力 id",
          "power_delta": 0,
          "legitimacy_delta": 0,
          "resource_deltas": {"fleets": -1},
          "attitude_deltas": {"other_faction_id": -10},
          "status": "新的状态"
        }
      ],
      "actor_changes": [
        {
          "actor_id": "角色 id",
          "region_id": "新区域 id",
          "status": "新状态",
          "stress_delta": 1,
          "conditions_add": [
            {"name": "状态名", "description": "具体影响", "modifier": -2, "kind": "injury|emotion|boon|other", "abilities": ["agility"]}
          ],
          "conditions_remove": ["旧状态名"],
          "flags_set": {"key": "value"}
        }
      ],
      "thread_changes": [
        {
          "thread_id": "线程 id",
          "tension_delta": 1,
          "clock_delta": -1,
          "status": "active|resolved|failed",
          "note": "线程如何变化"
        }
      ],
      "signals": [
        {
          "to_entity_ids": ["faction_id 或 actor_id"],
          "channel": "快船/信使/潮汐镜/广播",
          "content": "送达的内容或密信摘要",
          "delay_minutes": 720,
          "fact_indices": [0]
        }
      ]
    }
  ],
  "scene": {
    "event_local_id": "e2",
    "region_id": "聚焦区域 id",
    "title": "4-10 字的场景标题",
    "question": "这一场真正悬着的问题",
    "stakes": "玩家角色为什么现在必须做点什么",
    "public_brief": "场景开始时，所有参与者能感知到的公开处境，120-260 字",
    "participant_ids": ["2-4 名同一区域的角色 id"],
    "private_cues": [
      {"actor_id": "角色 id", "cue": "只给这个角色的感官/记忆线索；不得让他知道未公开事实"}
    ]
  }
}`;

function worldBlock(world: WorldDefinition): string {
  const s = world.setting;
  return [
    `【世界】《${world.title}》${world.subtitle ? `——${world.subtitle}` : ''}`,
    `【纪元】${s.era}｜${s.tone}`,
    `【概述】${s.overview}`,
    s.geography ? `【地理】${s.geography}` : '',
    `【硬规则】\n${s.hardRules.map((rule) => `- ${rule}`).join('\n')}`,
    `【导演级真相（角色不可知，事件必须与之相容）】\n${s.hiddenCanon}`,
    `【导演笔记】\n${s.directorNotes}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function knownByLabel(run: WorldRun, ids: string[]): string {
  const names = new Map([
    ...run.definition.setting.factions.map((faction) => [faction.id, faction.name] as const),
    ...run.definition.setting.actors.map((actor) => [actor.id, actor.name] as const),
  ]);
  if (!ids.length) return '无人知道';
  const allActors = run.definition.setting.actors.map((actor) => actor.id);
  const allFactions = run.definition.setting.factions.map((faction) => faction.id);
  const all = [...allActors, ...allFactions];
  if (all.every((id) => ids.includes(id))) return '所有势力与具名角色';
  return ids.map((id) => names.get(id) ?? id).join('、');
}

function regionsBlock(run: WorldRun): string {
  return run.definition.setting.regions
    .map((region: WorldRegionDefinition) => {
      const rt = run.regions[region.id];
      const connections = region.connections
        .map((conn) => `${conn.mode}到${run.definition.setting.regions.find((r) => r.id === conn.to)?.name ?? conn.to} ${conn.travelMinutes} 分钟`)
        .join('；');
      return `### ${region.name}（id: ${region.id}）｜${region.kind}
- 状态：${rt?.status || region.publicStatus}｜控制：${region.controllingFactionId ? run.definition.setting.factions.find((f) => f.id === region.controllingFactionId)?.name ?? region.controllingFactionId : '无明确控制'}
- 资源：${Object.entries(rt?.resources ?? region.resources).map(([key, value]) => `${key} ${Math.round(value)}`).join(' / ')}
- 说明：${truncate(region.description, 260)}
- 交通：${connections || '无已知路线'}`;
    })
    .join('\n\n');
}

function factionsBlock(run: WorldRun): string {
  return run.definition.setting.factions
    .map((faction: WorldFactionDefinition) => {
      const rt = run.factions[faction.id];
      const leader = faction.leaderActorId
        ? run.definition.setting.actors.find((actor) => actor.id === faction.leaderActorId)?.name
        : null;
      const attitudes = Object.entries(rt?.attitudes ?? faction.attitudes)
        .map(([id, value]) => `${run.definition.setting.factions.find((f) => f.id === id)?.name ?? id} ${value > 0 ? '+' : ''}${value}`)
        .join('，') || '无明显倾向';
      return `### ${faction.name}（id: ${faction.id}）
- 目标：${faction.goal}
- 秘密：${faction.secret}
- 力量 ${rt?.power ?? faction.power}/10｜合法性 ${rt?.legitimacy ?? faction.legitimacy}/10｜状态：${rt?.status || 'active'}
- 资源：${Object.entries(rt?.resources ?? faction.resources).map(([key, value]) => `${key} ${Math.round(value)}`).join(' / ') || '未知'}
- 领导人：${leader ?? '无具名领袖'}｜态度：${attitudes}`;
    })
    .join('\n\n');
}

function actorsBlock(run: WorldRun): string {
  return run.definition.setting.actors
    .map((actor: WorldActorDefinition) => {
      const rt = run.actors[actor.id];
      const region = run.definition.setting.regions.find((r) => r.id === rt?.regionId);
      const faction = actor.factionId
        ? run.definition.setting.factions.find((f) => f.id === actor.factionId)?.name
        : '无归属';
      return `### ${actor.name}（id: ${actor.id}）｜${actor.title}${actor.spotlight ? '｜⭐聚光角色' : ''}
- 所在：${region?.name ?? actor.regionId}｜势力：${faction}｜状态：${rt?.status || '在场'}
- 公开形象：${truncate(actor.publicProfile, 160)}
- 当前目标：${actor.agenda}
- 内心欲望：${actor.desire}｜恐惧：${actor.fear}
- 秘密：${truncate(actor.secret, 220)}
- 状态：紧张 ${rt?.stress ?? 0}/10；${(rt?.conditions ?? []).map((c) => c.name).join('、') || '无异常'}；位置 ${region?.name ?? rt?.regionId}`;
    })
    .join('\n\n');
}

function threadsBlock(run: WorldRun): string {
  return run.definition.setting.threads
    .map((thread: WorldThreadDefinition) => {
      const rt = run.threads[thread.id];
      return `### ${thread.title}（id: ${thread.id}）｜${rt?.status || thread.status}
- 问题：${thread.question}
- 代价：${thread.stakes}
- 紧张 ${rt?.tension ?? thread.tension}/10｜时钟 ${rt?.clockValue ?? thread.clock.value}/${thread.clock.max} ${thread.clock.unit}（${thread.clock.label}）
- 满格后果：${thread.clock.onFill}
- 最近：${rt?.note || '尚无新变化'}`;
    })
    .join('\n\n');
}

function factsBlock(run: WorldRun): string {
  const active = run.facts.filter((fact) => fact.retiredAtEpoch === null);
  const retired = run.facts.filter((fact) => fact.retiredAtEpoch !== null);
  const sorted = [...active].sort((a, b) => b.createdEpoch - a.createdEpoch || b.importance - a.importance);
  const selected = sorted.slice(0, 34);
  const lines = selected.map(
    (fact: WorldFact) =>
      `- [${fact.id}]${fact.public ? ' [公开]' : ''} ${truncate(fact.text, 360)}｜知道：${knownByLabel(run, fact.knownBy)}｜来源：${fact.sourceEventId ?? '世界初始'}${fact.importance >= 4 ? `｜重要度 ${fact.importance}` : ''}`,
  );
  if (retired.length) {
    lines.push(
      ...retired.slice(-4).map(
        (fact) => `- [${fact.id}] [已失效，但有人仍可能记得] ${truncate(fact.text, 220)}`,
      ),
    );
  }
  return lines.join('\n') || '（还没有记录事实。）';
}

function signalsBlock(run: WorldRun): string {
  const pending = run.signals.filter((signal) => signal.status === 'pending').sort((a, b) => a.arrivesAt - b.arrivesAt);
  if (!pending.length) return '（没有尚未抵达的信号。）';
  const names = new Map([
    ...run.definition.setting.factions.map((faction) => [faction.id, faction.name] as const),
    ...run.definition.setting.actors.map((actor) => [actor.id, actor.name] as const),
  ]);
  return pending
    .slice(0, 12)
    .map(
      (signal: WorldSignal) =>
        `- ${signal.id}｜${names.get(signal.fromEntityId) ?? signal.fromEntityId} → ${signal.toEntityIds.map((id) => names.get(id) ?? id).join('、')}｜${signal.channel}｜将在世界开始后 ${signal.arrivesAt} 分钟抵达｜内容摘要：${truncate(signal.content, 220)}｜携带事实：${signal.factIds.join('、')}`,
    )
    .join('\n');
}


function completedScenesBlock(run: WorldRun): string {
  const completed = run.sceneRuns.filter((scene) => scene.status === 'completed' && scene.summary);
  if (!completed.length) return '（本世界还没有完成的聚焦场景。）';
  return completed
    .slice(-3)
    .map((scene) => {
      const hook = run.sceneHooks.find((entry) => entry.id === scene.hookId);
      return `- ${hook?.title ?? scene.hookId}：${truncate(scene.summary ?? '', 650)}`;
    })
    .join('\n');
}

function recentBlock(run: WorldRun): string {
  if (!run.epochs.length) return '（这是世界的第一个纪元。）';
  const epochs = run.epochs.slice(-2);
  return epochs
    .map((epoch) => {
      const events = run.events.filter((event) => event.epochIndex === epoch.index && event.kind !== 'signal');
      return `## 第 ${epoch.index + 1} 纪元 · ${epoch.clock.time}｜${epoch.title}
- 推进：${epoch.advanceMinutes} 分钟；${epoch.advanceReason}
- 概括：${epoch.summary}
- 事件：${events.map((event) => `${event.title}${event.regionId ? `（${run.definition.setting.regions.find((r) => r.id === event.regionId)?.name ?? event.regionId}）` : ''}`).join('；') || '无'}`;
    })
    .join('\n\n');
}

function entityIdIndex(run: WorldRun): string {
  return [
    `区域：${run.definition.setting.regions.map((r) => `${r.id}=${r.name}`).join('、')}`,
    `势力：${run.definition.setting.factions.map((f) => `${f.id}=${f.name}`).join('、')}`,
    `角色：${run.definition.setting.actors.map((a) => `${a.id}=${a.name}`).join('、')}`,
    `线程：${run.definition.setting.threads.map((t) => `${t.id}=${t.title}`).join('、')}`,
  ].join('\n');
}

export function worldSchemaHint(): string {
  return WORLD_SCHEMA;
}

export function buildWorldEpochPrompt(params: {
  run: WorldRun;
  dueSignals: WorldSignal[];
}): { system: string; user: string; schemaHint: string } {
  const { run, dueSignals } = params;
  const world = run.definition;
  const spotlightRegion = world.setting.regions.find((r) => r.id === world.setting.spotlightRegionId);
  const system = `你是《${world.title}》的世界导演（World Keeper）。你负责世界层的因果、时间、区域、势力、剧情线程与信息传播，不负责替局部角色掷骰或写全篇文学叙事。聚焦场景会由下一层引擎处理。

【世界导演的铁律】
1. 世界时间由事件驱动。每次推进给出 advance_minutes 与 advance_reason，范围 5–10080 分钟；不要机械地使用固定长度。一个纪元可以只有几分钟，也可以是几天。
2. 每个纪元生成 2–3 个 **顶层事件束**，至少跨两个区域；可以额外带 1–2 个子事件。顶层事件之间必须能独立结算。
3. 如果两个事件在同一时刻直接争夺同一个区域控制权、同一个势力资源、同一个具名角色或同一个线程，它们必须被合并到同一个父事件（parent_local_id），作为联合裁决束；不能当作两个独立事件分别结算。父事件可以只负责协调，子事件负责局部效果。
4. 信息不会因为“在同一纪元”就自动传播。事实的 known_by 只能列出真实目击者/直接接收者/已经知道的实体。跨区域消息必须通过 signal，并给出延迟；不要提前把接收者加进 known_by。信号只用于“接收者尚未知道”的知识：如果 fact 的 known_by 已经包含接收者，就不要再发信号；如果消息在本纪元已经当面/通过公开诏令送达，用 known_by 记录它，不要重复排一个延迟信号。
5. 每一条新事实必须是具体的、可被后续使用/验证的变化或揭示，而不是重复已有背景。不要把所有事实标成 public 或“所有角色”；public 只用于真正全城/全势力范围内公开、且在本纪元结束前确实会传达到各方的事件。地方性事件只给目击者、当事人和通过 signal 获得消息的人。
6. 线程的 clock.value 是**朝 onFill 推进的压力进度**，不是剩余时间。clock_delta 为正表示压力增加，为负只用于撤销/缓解已经发生的变化；不要把倒计时写成递减的剩余值。若压力钟被推到 max，必须在本纪元或紧接着的后果中处理 onFill，而不是继续当作普通背景。
7. 聚光角色（⭐）的重大个人选择不要在世界层直接写定。你可以决定他们所在的位置、外部处境、可知信息和别人造成的后果；真正的“他们现在要怎么做”留给 scene。若一个事件必须以他们的选择收场，应该把它写成外部压力/未决局面，而不是替他们宣布决定。
8. 世界层不需要每个细节都有台前镜头。远方发生的政治、舰队、灾变可以只给出结果和后果；不要写长对白，不要写小说段落。summary 与 public_narrative 保持短而具体。
9. 尊重硬规则、交通耗时、人物位置、势力资源和已有事实。不要让角色瞬移，不要让消息隔空抵达，不要让死者复活，不要凭空出现此前没有的军队或资源（如果出现，必须是事件本身说明的增援/新来源）。
10. 每个纪元提供一个聚焦场景候选（scene）：在聚光区域，并从同一区域选 2–4 名具名角色。这个场景只是把世界层的外部变化变成局部选择，不是替世界事件重新结算。若没有合适场景，scene 可以为 null。
11. 只输出严格 JSON，不输出 Markdown 或额外解释。所有 id 只能来自给定的实体 id 列表。

【输出结构】
${WORLD_SCHEMA}

【本纪元的戏剧任务】
- 让世界比上一刻更紧：推进至少一条线程，或让一条旧事实产生新的后果。
- 至少制造一处知识差：某人不知道某件会改变其利益的事，或一条消息正在路上。
- 至少一个事件不能由聚光角色完全控制；世界自己在动。
- 场景候选应围绕一个还没有答案的局部问题，而不是重复已经发生的结果；场景发生的时间、地点必须与当前世界时钟一致，不要写“今夜”却把时间推进到第二天上午。`;

  const user = `${worldBlock(world)}

【当前世界时间】${run.clock.display}（世界开始后 ${run.elapsedMinutes} 分钟，第 ${run.epochIndex + 1} 个纪元即将开始）
【聚焦区域】${spotlightRegion?.name ?? world.setting.spotlightRegionId}（id: ${world.setting.spotlightRegionId}）
【本纪元可用 max_epochs】${run.settings.maxEpochs}

【区域与交通】
${regionsBlock(run)}

【势力】
${factionsBlock(run)}

【具名角色】
${actorsBlock(run)}

【剧情线程】
${threadsBlock(run)}

【事实账本（括号内为 fact id；知道者已按真实传播记录）】
${factsBlock(run)}

【正在路上的信号】
${signalsBlock(run)}

${dueSignals.length ? `【如果本纪元推进足够久，将在此纪元抵达的信号】\n${dueSignals.map((signal) => `- ${signal.content}`).join('\n')}` : ''}

【最近世界史】
${recentBlock(run)}

【最近完成的聚焦场景（已作为世界事实进入账本）】
${completedScenesBlock(run)}

【实体 id 一览】
${entityIdIndex(run)}

【导演笔记】
${world.setting.directorNotes || '保持世界因果与信息差。'}
${world.rules.spotlightPolicy ? `【聚光政策】${world.rules.spotlightPolicy}` : ''}

请推进一个世界纪元，只输出 JSON。`;

  return { system, user, schemaHint: WORLD_SCHEMA };
}

export function formatEventForNarration(run: WorldRun, event: WorldEvent): string {
  const region = run.definition.setting.regions.find((r) => r.id === event.regionId);
  const names = new Map([
    ...run.definition.setting.actors.map((actor) => [actor.id, actor.name] as const),
    ...run.definition.setting.factions.map((faction) => [faction.id, faction.name] as const),
  ]);
  return [
    `${compactClock(event.clock)}｜${event.title}（${region?.name ?? '世界'}）`,
    event.summary,
    event.actorIds.length ? `参与者：${event.actorIds.map((id) => names.get(id) ?? id).join('、')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
