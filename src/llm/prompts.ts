import type {
  ActionRecord,
  Adjudication,
  Beat,
  CharacterDefinition,
  CharacterRuntime,
  ClockState,
  Condition,
  Run,
  Scenario,
  TimeJump,
} from '../types.ts';
import { ABILITY_KEYS, ABILITY_META, OUTCOME_META } from '../types.ts';
import { checkModifierSummary } from '../rules/checks.ts';
import { clamp, truncate } from '../utils.ts';

const ACTION_SCHEMA = `{
  "thought": "内心盘算，1-2 句；只有你自己知道",
  "category": "调查|交涉|行动|战斗|技术|观察|其他",
  "summary": "8-20 字的举动标题",
  "deed": "你具体做了什么，1-3 句，现在时；写出可被旁观者感知的动作或台词",
  "effect": "你希望这个举动达成什么、被怎样接住，1 句；它不一定发生",
  "ability": "physique|agility|perception|intellect|will|presence",
  "trait": "你使用的一项特质名；不用则为 null",
  "target_id": "你把举动直接递向的其他角色 id；没有则 null",
  "hostile": false,
  "dialogue": "你说出口的话；可空字符串",
  "goal_progress": "这个举动如何推进你的欲望，1 句",
  "stakes": "如果效果没有落地，你最可能失去什么，1 句"
}`;

const RESPONSE_SCHEMA = `{
  "thought": "内心盘算，1-2 句；只有你自己知道",
  "continue_original": true,
  "stance": "两到六个字，例如：接住、挡回、岔开、退半步、反问、沉默、把话推回去",
  "summary": "8-20 字的回应标题",
  "description": "你如何回应递到面前的压力，1-3 句；可包含对多个人的应对",
  "ability": "physique|agility|perception|intellect|will|presence",
  "trait": "你使用的一项特质名；不用则为 null",
  "dialogue": "你脱口而出的话；可空字符串"
}`;

const OPENING_SCHEMA = `{
  "title": "4-8 个字的本刻标题",
  "public_brief": "所有在场者都能感知到的处境，150-320 字",
  "private_cues": [
    {"character_id": "角色 id", "cue": "只给这个角色的一条感官/记忆/直觉线索，1-3 句"}
  ],
  "pressure": "此刻最重、会促使人物行动的东西，1 句；可以是危险、期限，也可以是沉默与未说出口的话",
  "scene_question": "本刻悬在空中的问题，1 句",
  "gm_note": "给导演组的幕后短注，1 句，不会展示给角色"
}`;

const ADJUDICATION_SCHEMA = `{
  "adjudications": [
    {
      "action_id": "举动 id，必须原样返回",
      "difficulty_label": "轻而易举|容易|标准|困难|艰巨|几近不可能",
      "dc": 15,
      "modifier": 0,
      "reason": "为什么这个效果是这个难度，1 句",
      "risk": "效果没有落地时最具体的后果，1 句"
    }
  ],
  "external_events": [
    {
      "description": "不是任何角色举动引起的客观变化，例如天气、班次、机械故障、第三方到来",
      "likelihood": "routine|possible|unlikely",
      "fact": "如果发生，才写入的公开事实",
      "reason": "为什么它独立于角色行动、且不是为了拖延剧情"
    }
  ],
  "fairness_note": "本刻裁定尺度的一句话说明"
}`;

const RESOLUTION_SCHEMA = `{
  "narration": "本刻的公开叙事，3-6 段，350-750 个汉字",
  "outcome_notes": [
    {"character_id": "角色 id", "note": "这个人的举动与效果具体造成了什么，1 句"}
  ],
  "state_changes": {
    "characters": [
      {
        "character_id": "角色 id",
        "stress_delta": 0,
        "conditions_add": [
          {
            "name": "状态名",
            "description": "具体影响",
            "modifier": -2,
            "kind": "injury|emotion|boon|other",
            "visibility": "public|private",
            "abilities": ["agility"]
          }
        ],
        "conditions_remove": ["旧状态名"],
        "inventory_add": ["新获得的物件；可空数组"],
        "inventory_remove": ["失去或交出的物件；可空数组"],
        "private_note": "只有此人知道的新信息或感受；没有则空字符串",
        "memory": {"summary": "此人会记住的一句话", "importance": 3}
      }
    ],
    "world": {
      "public_facts_add": ["新的公开事实，最多 2 条"],
      "public_facts_remove": ["已失效的公开事实，最多 2 条"],
      "flags_set": {"key": "value"},
      "pressure": "下一时刻开场时仍有效的东西，1 句",
      "scene_title": "下一时刻的场景小标题，4-8 字"
    }
  },
  "next_time_jump": {
    "elapsed_minutes": 8,
    "label": "事件的余波如何标记这段间隔，例如：灯灭后的第七分钟",
    "reason": "为什么时间推进了这么久；必须由事件/举动导致"
  },
  "ending": null
}`;

interface CharacterPromptData {
  definition: CharacterDefinition;
  runtime: CharacterRuntime;
}

function characterById(scenario: Scenario, id: string): CharacterDefinition | undefined {
  return scenario.characters.find((character) => character.id === id);
}

function namesFor(scenario: Scenario): string {
  return scenario.characters
    .map((character) => `${character.name}（${character.id}${character.passive ? '，被动' : ''}）`)
    .join('、');
}

function clockLine(clock: ClockState, index: number): string {
  return `${clock.dateLabel} ${clock.display} · 第 ${index + 1} 刻`;
}

function abilityLine(): string {
  return ABILITY_KEYS.map((key) => `${key}=${ABILITY_META[key].label}`).join('，');
}

function actionDeed(action: ActionRecord): string {
  return action.deed || action.description;
}

function actionEffect(action: ActionRecord): string {
  return action.effect || action.goalProgress || action.summary;
}

function isPublicCondition(condition: Condition): boolean {
  return (condition.visibility ?? (condition.kind === 'emotion' ? 'private' : 'public')) === 'public';
}

function conditionLine(condition: Condition): string {
  const scope = condition.abilities?.length
    ? `，只影响${condition.abilities.map((ability) => ABILITY_META[ability].label).join('、')}`
    : '';
  const visibility = isPublicCondition(condition) ? '公开' : '私密';
  return `- ${condition.name}（${condition.modifier >= 0 ? '+' : ''}${condition.modifier}${scope}，${visibility}）：${condition.description}`;
}

function worldBlock(scenario: Scenario, forDirector: boolean): string {
  const world = scenario.world;
  return [
    `【剧本】《${scenario.title}》${scenario.subtitle ? `——${scenario.subtitle}` : ''}`,
    `【时代与调性】${world.era}｜${world.tone}`,
    `【世界】${world.setting}`,
    `【场所】${world.location}`,
    forDirector && world.hiddenCanon ? `【导演级真相（角色不可知）】\n${world.hiddenCanon}` : '',
    forDirector && world.directorNotes ? `【导演笔记】\n${world.directorNotes}` : '',
    world.countdown ? `【倒计时/期限】${world.countdown}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function publicCards(scenario: Scenario, characters: CharacterRuntime[], selfId?: string): string {
  return scenario.characters
    .filter((character) => character.id !== selfId)
    .map((character) => {
      const runtime = characters.find((entry) => entry.id === character.id);
      const visible = (runtime?.conditions ?? []).filter(isPublicCondition);
      const conditions = visible.length
        ? `｜可见状态：${visible.map((condition) => condition.name).join('、')}`
        : '';
      const passive = character.passive ? '｜被动角色（本轮不主动行动）' : '';
      return `- ${character.name}（id: ${character.id}）｜${character.title}${passive}${conditions}\n  ${truncate(character.publicProfile, 180)}`;
    })
    .join('\n');
}

function memoryBlock(character: CharacterPromptData, query: string, limit = 12): string {
  const memories = character.runtime.memories;
  if (!memories.length) return '（没有可调用的记忆。）';
  const tokens = [...new Set(query.toLowerCase().match(/[\p{Script=Han}]{2,4}|[a-z0-9]{2,}/gu) ?? [])]
    .filter((token) => token.length >= 2)
    .slice(0, 24);
  const scored = memories.map((memory, index) => {
    const text = `${memory.summary} ${memory.detail ?? ''}`.toLowerCase();
    const lexical = tokens.reduce((sum, token) => sum + (text.includes(token) ? 3 : 0), 0);
    const backstory = memory.kind === 'backstory' ? 3 : 0;
    const recency = (index / Math.max(1, memories.length - 1)) * 3;
    return { memory, index, score: lexical + backstory + memory.importance * 2 + recency };
  });
  const selected = scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map(({ memory }) =>
      `- [${memory.kind === 'backstory' ? '旧事' : memory.kind === 'secret' ? '隐秘' : memory.kind === 'observation' ? '独见' : '经历'}] ${memory.summary}${memory.detail ? `／${memory.detail}` : ''}`,
    );
  return selected.join('\n');
}

function selfSheet(character: CharacterPromptData, relationshipBlock: string): string {
  const def = character.definition;
  const runtime = character.runtime;
  const abilities = ABILITY_KEYS.map(
    (key) => `${ABILITY_META[key].label} ${def.abilities[key]}/10（${key}）`,
  ).join('｜');
  const traits = def.traits.length
    ? def.traits
        .map(
          (trait) =>
            `- ${trait.name}（+${trait.bonus}${trait.ability ? `，限${ABILITY_META[trait.ability].label}` : '，任意检定'}）：${trait.description}`,
        )
        .join('\n')
    : '（无机械特质）';
  const conditions = runtime.conditions.length
    ? runtime.conditions.map(conditionLine).join('\n')
    : '（没有异常状态）';
  return [
    `【身份】${def.name}｜${def.title}${def.age ? `｜${def.age} 岁` : ''}${def.pronouns ? `｜${def.pronouns}` : ''}`,
    `【公开形象】${def.publicProfile}`,
    def.appearance ? `【外貌】${def.appearance}` : '',
    `【性格】${def.personality}`,
    `【欲望】${def.desire}`,
    `【恐惧】${def.fear}`,
    `【只有你知道的秘密】${def.secret}`,
    `【能力】${abilities}`,
    `【特质】\n${traits}`,
    `【当前状态】紧张 ${runtime.stress}/10\n${conditions}`,
    `【随身物】${runtime.inventory.length ? runtime.inventory.join('、') : '（空空如也）'}`,
    `【你的人际关系】\n${relationshipBlock || '（没有特别信任或戒备的人）'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function relationshipsBlock(scenario: Scenario, character: CharacterDefinition): string {
  if (!character.relationships.length) return '';
  return character.relationships
    .map((relationship) => {
      const target = characterById(scenario, relationship.targetId);
      return `- 对 ${target?.name ?? relationship.targetId}（id: ${relationship.targetId}，${relationship.label}）：${relationship.attitude}`;
    })
    .join('\n');
}

function recentHistory(run: Run, currentIndex: number, selfId?: string): string {
  const complete = run.beats.filter((beat) => beat.phase === 'complete' && beat.index < currentIndex);
  if (!complete.length) return '（这是第一刻，此前没有已发生的事件。）';
  return complete
    .slice(-3)
    .map((beat) => {
      const own = selfId ? beat.actions.find((action) => action.characterId === selfId) : null;
      const ownLine = own
        ? `\n  ↳ 你当时的举动：${own.summary}（${own.status === 'abandoned' ? '被放下' : own.outcome ? OUTCOME_META[own.outcome].label : '未完成'}）`
        : '';
      const jump = beat.nextTimeJump
        ? `\n  ↳ 随后时间推进：${beat.nextTimeJump.elapsedMinutes} 分钟（${beat.nextTimeJump.reason}）`
        : '';
      return `第 ${beat.index + 1} 刻 ${beat.clock.display}｜${beat.title}\n${truncate(beat.narration, 720)}${ownLine}${jump}`;
    })
    .join('\n\n');
}

function publicSituation(run: Run, beat: Beat, cueFor?: string): string {
  return [
    `【此刻】${clockLine(beat.clock, beat.index)}`,
    `【在场者】${run.scenario.characters.map((character) => `${character.name}${character.passive ? '（被动）' : ''}`).join('、')}`,
    `【所有人可见的处境】\n${beat.publicBrief}`,
    run.world.publicFacts.length
      ? `【已确认的公开事实】\n${run.world.publicFacts.map((fact) => `- ${fact}`).join('\n')}`
      : '',
    beat.pressure || run.world.pressure ? `【当下的压力】${beat.pressure || run.world.pressure}` : '',
    beat.sceneQuestion ? `【悬而未决】${beat.sceneQuestion}` : '',
    cueFor ? `【只有你此刻注意到的】${cueFor}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function directorHistoryForOpening(run: Run, index: number, jump: TimeJump | null): string {
  const complete = run.beats.filter((beat) => beat.phase === 'complete');
  if (!complete.length) {
    return [
      '这是本场第一刻。不要重写开场；以剧本提供的【开场】为既定事实，补足可感知的细节与给每人的私密线索。',
      `【开场】\n${run.scenario.world.opening}`,
    ].join('\n\n');
  }
  const last = complete[complete.length - 1]!;
  const previous = complete.slice(-2, -1)[0];
  return [
    `【上一刻的公开叙事】第 ${last.index + 1} 刻 · ${last.title}\n${truncate(last.narration, 1400)}`,
    previous ? `【更早之前】第 ${previous.index + 1} 刻：${truncate(previous.narration, 450)}` : '',
    jump ? `【时间如何来到此刻】${jump.reason}；${jump.label}（${jump.elapsedMinutes} 分钟）` : '',
    `【进入第 ${index + 1} 刻时，人物们已知的公开事实】\n${run.world.publicFacts.map((fact) => `- ${fact}`).join('\n') || '（暂无）'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function buildOpeningPrompt(params: {
  scenario: Scenario;
  run: Run;
  index: number;
  clock: ClockState;
  jump: TimeJump | null;
}): { system: string; user: string; schemaHint: string } {
  const { scenario, run, index, clock, jump } = params;
  const system = `你是一位擅长人物潜台词、日常细节与克制的叙事导演，正在主持《${scenario.title}》。你负责世界、天气、物件、沉默与后果，不扮演人物，也不替人物做决定。

【导演的铁律】
1. 只把“已经发生的事”当作事实；不要改写人物的选择、骰子结果或前一幕的结局。
2. 公开处境只能包含所有在场者都能看见、听见、闻到或推理出的信息。人物的私密线索只写给该人物；绝不要把他人的秘密、内心或系统信息塞进公开描写。
3. 私密线索是人物自己的感官、记忆或直觉，可以主观、可以误读，但必须和此刻的处境有关。不要命令他必须做什么。被动角色可以只给一条处境/感官线索，不要给她一个待执行的举动。
4. 你不推进人物的行动，只负责布置一个值得停留的瞬间。压力可以来自危险、期限，也可以来自沉默、礼数、物件和未说出口的话。
5. 时间不是固定轮次。此刻的时间由上一刻的事件决定；不要写“过了十分钟”之类的任意跳时，时间已经由系统推进。不要与已建立的时刻冲突。
6. 不写空泛的抒情和重复前情。给具体可触的细节，让秘密有可能通过举动被验证，而不是由旁白直接宣布。
7. 所有人物仍在【场所】范围内；无人可以无故瞬移或离场。保留人物间的可交流性。
8. 你只输出严格的 JSON 对象，不输出 Markdown 代码围栏、解释或额外文本。所有角色 id 必须来自下列名单：${namesFor(scenario)}。

【输出字段】
${OPENING_SCHEMA}

private_cues 必须覆盖所有在场角色，每人的线索不同；可以短。不要在同一条线索里泄露另一个角色的秘密。gm_note 只供导演组看。`;

  const characters = scenario.characters
    .map((character) => {
      const runtime = run.characters[character.id]!;
      const visible = runtime.conditions.length
        ? runtime.conditions
            .map((condition) => `${condition.name}${isPublicCondition(condition) ? '' : '（私密）'}`)
            .join('、')
        : '无异常';
      return `- ${character.name}（id: ${character.id}）｜${character.title}${character.passive ? '｜被动角色' : ''}｜状态：${visible}\n  公开形象：${truncate(character.publicProfile, 220)}\n  他的欲望（只有导演知道）：${character.desire}\n  他的秘密（只有导演知道）：${truncate(character.secret, 260)}`;
    })
    .join('\n');

  const user = `${worldBlock(scenario, true)}

【本刻要处理的时间】
系统已将时间推进到：${clock.dateLabel} ${clock.display}（第 ${index + 1} 刻）
${jump ? `上一刻结束时的时间推进：${jump.elapsedMinutes} 分钟｜${jump.label}｜${jump.reason}` : '这是开场时刻。'}

【最近发生】
${directorHistoryForOpening(run, index, jump)}

【全场人物与导演所知】
${characters}

【当前世界状态】
- 公开事实：${run.world.publicFacts.length ? run.world.publicFacts.map((fact) => `「${fact}」`).join('；') : '暂无'}
- 当前压力：${run.world.pressure || '尚未建立'}
- 场景：${run.world.sceneTitle || scenario.world.location}
- 规则难度尺度：${scenario.rules.difficultyGuidance ?? '日常阻力 5–8，情感/关系阻力 10–15，重大决定 16–20。'}

请以导演身份取景，输出 JSON。`;

  return { system, user, schemaHint: OPENING_SCHEMA };
}

export function buildActionPrompt(params: {
  scenario: Scenario;
  run: Run;
  definition: CharacterDefinition;
  runtime: CharacterRuntime;
  beat: Beat;
}): { system: string; user: string; schemaHint: string } {
  const { scenario, run, definition, runtime, beat } = params;
  const privateCue = beat.privateCues.find((cue) => cue.characterId === definition.id)?.cue ?? '';
  const own = { definition, runtime } satisfies CharacterPromptData;
  const others = scenario.characters.filter((character) => character.id !== definition.id);
  const system = `你现在只以《${scenario.title}》中的人物「${definition.name}」存在。你不是全知叙述者，也不能决定这个举动会不会被接住。

【举动的铁律】
1. 只使用本提示中列出的信息、你的记忆和感官。绝不引用其他人物的秘密、内心、系统裁定或未公开的事实。
2. 你要做出一个旁人能看见的举动：可以是一句话、一次沉默、一个递出去的东西、一次靠近或退开。deed 是你实际做的事；effect 是你希望它达成/被怎样接住的结果。effect 不一定发生，deed 会发生。
3. 保持人物一致性：你的性格、欲望、恐惧、秘密和关系会影响你，但你不必每次选“最正确”的答案。你可以犹豫、误判、逞强、临时改变主意。
4. 你看不到别人这一轮将要做什么；不要替他人安排动作或台词。你只能把话或动作直接递向一名其他角色；如果只是对物件、环境或空气，把 target_id 设为 null。
5. hostile 只有在你的举动意在强迫、伤害、夺取、逼到角落或欺骗对方时才为 true。请求、坦白、关心、帮助、礼物、询问和谈判都是 false。hostile=true 且指向一名主动角色时，对方会获得一次回应机会；hostile=false 时，对方不会进入单独的回应回合，他这一轮自己的举动就是他的回答。被动角色不会宣告举动，也不会获得回应机会；即使 hostile=true，效果也按 DC 结算。
6. 你可以在 thought 里打算隐瞒，但在 deed / dialogue 里只写可被感知的部分。
7. 你不能写出效果结果、骰点、成功或失败；把“发生什么”留给场景。
8. 从六项能力中选择一项作为这次举动主要依靠的方式；若使用特质，必须原样填写你角色卡上的特质名，否则填 null。不要为了数值最优扭曲人设。
9. 能力点不是抽象数字：高数值是你长期信任、习惯依赖的身体或心智方式；低数值是你的盲区，会让同一件事做得更吃力。让它们塑造你选择的方法、犹豫和代价，而不是只塑造成功率。
10. 只输出严格合法的 JSON，不要 Markdown 代码围栏，不要解释。角色 id 只能使用：${namesFor(scenario)}。

请给出“现在这一刻，你让旁人看见了什么”。`;

  const user = `${worldBlock(scenario, false)}

${publicSituation(run, beat, privateCue)}

【你之外的在场者】
${publicCards(scenario, Object.values(run.characters), definition.id)}

【你的全部可知信息】
${selfSheet(own, relationshipsBlock(scenario, definition))}

【记忆】
${memoryBlock(own, beat.publicBrief + privateCue + definition.desire, 14)}

【之前已经发生】
${recentHistory(run, beat.index, definition.id)}

【能力与特质的可用写法】
${abilityLine()}

【输出】
只输出以下结构的 JSON：
${ACTION_SCHEMA}

如果 target_id 指向 ${others.map((character) => `${character.name}=${character.id}${character.passive ? '（被动）' : ''}`).join('、')}：
- hostile=true 且对方是主动角色 → 对方会获得一次回应机会；这不是你能决定的；
- hostile=false → 对方不会进入单独的回应回合，他这一轮自己的举动就是回答；
- 对方是被动角色 → 不进入回应，效果按 DC 结算。`;

  return { system, user, schemaHint: ACTION_SCHEMA };
}

export function buildReactionPrompt(params: {
  scenario: Scenario;
  run: Run;
  definition: CharacterDefinition;
  runtime: CharacterRuntime;
  beat: Beat;
  ownAction: ActionRecord | null;
  incoming: Array<{ action: ActionRecord; actor: CharacterDefinition }>;
}): { system: string; user: string; schemaHint: string } {
  const { scenario, run, definition, runtime, beat, ownAction, incoming } = params;
  const privateCue = beat.privateCues.find((cue) => cue.characterId === definition.id)?.cue ?? '';
  const own = { definition, runtime };
  const incomingBlock = incoming
    .map(({ action, actor }) => {
      return [
        `- 来自 ${actor.name}（${actor.title}）：${action.summary}`,
        `  对方做了什么：${actionDeed(action)}`,
        `  对方想要的效果：${actionEffect(action)}`,
        action.dialogue ? `  对方开口：“${action.dialogue}”` : '',
        `  与你有关的方式：${action.targetId === definition.id ? '直接冲着你而来' : '波及到你'}`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');
  const originalBlock = ownAction
    ? `${ownAction.summary}\n${actionDeed(ownAction)}${ownAction.dialogue ? `\n你原本打算说：“${ownAction.dialogue}”` : ''}`
    : '（你原本没有别的举动。）';
  const system = `你现在只以《${scenario.title}》中的人物「${definition.name}」存在。你刚刚已经决定了一个举动，但在它真正发生前，有人正用强迫、夺取、伤害或欺骗的方式逼到你面前。你获得一次回应机会。

【回应的规则——必须理解】
- 你可以继续自己原来的举动（continue_original = true），同时回应对方。此时你一心二用：原举动和回应都会受到 -2 的分心惩罚。
- 你也可以放下原来的举动（continue_original = false）。原本的举动不会发生；你的回应不再受分心惩罚。
- 无论是否放下原举动，若同时有多个人向你施压，你的回应每多一人都会再 -1；这是被多人同时要求的压力，不是围攻。
- 回应只有一次，用来接住所有递到你面前的压力。这不是攻击，也不是额外的免费反击；若你描述把话推回去，它包含在这次回应的结果里。
- 选择要符合人物性格与眼前信息；可以接住、岔开、沉默、误解、反问、退半步、临时改主意，也可以配合或装傻。
- 你不决定成败。看不到他人在本轮的其他选择或骰子。
- 只输出严格合法 JSON，不要 Markdown 围栏，不要解释，不要泄露他人的秘密。`;

  const user = `${worldBlock(scenario, false)}

${publicSituation(run, beat, privateCue)}

【你原本在这一刻要做的事】
${originalBlock}

【此刻逼到你面前的】
${incomingBlock}

【你之外的在场者】
${publicCards(scenario, Object.values(run.characters), definition.id)}

【你的角色卡】
${selfSheet(own, relationshipsBlock(scenario, definition))}

【你的记忆】
${memoryBlock(own, incomingBlock + beat.publicBrief, 10)}

【此前发生】
${recentHistory(run, beat.index, definition.id)}

请做出回应选择，输出 JSON：
${RESPONSE_SCHEMA}

stance 用两到六个字写你的回应姿态，例如：接住、挡回、岔开、退半步、反问、沉默、把话推回去。
注意：continue_original 是布尔值，不是字符串。`;

  return { system, user, schemaHint: RESPONSE_SCHEMA };
}

export function buildAdjudicationPrompt(params: {
  scenario: Scenario;
  run: Run;
  beat: Beat;
  externalEventBudget?: number;
}): { system: string; user: string; schemaHint: string } {
  const { scenario, run, beat } = params;
  const externalEventBudget = clamp(params.externalEventBudget ?? 2, 0, 2);
  const actionLines = beat.actions
    .map((action) => {
      const actor = characterById(scenario, action.characterId);
      const target = action.targetId ? characterById(scenario, action.targetId) : null;
      return [
        `### action_id: ${action.id}`,
        `- 举动者：${actor?.name ?? action.characterId}（${actor?.title ?? '身份不明'}）`,
        `- 标题：${action.summary}`,
        `- 实际做了什么：${actionDeed(action)}`,
        `- 想要的效果：${actionEffect(action)}`,
        action.dialogue ? `- 台词：“${action.dialogue}”` : '',
        `- 使用能力：${ABILITY_META[action.ability].label}（${action.ability}）｜选填特质：${action.traitName ?? '无'}`,
        `- 指向：${target ? `${target.name}（${target.passive ? '被动角色，不进入回应回合；以 DC 判断效果' : action.hostile ? '敌意，将进入一次回应对抗' : '非敌意，不进入回应回合；以 DC 判断效果是否落地'}）` : '环境/物件/自身'}`,
        `- 声明风险：${action.stakes || '未声明'}`,
        `- 举动者当前状态：${run.characters[action.characterId]?.conditions.filter(isPublicCondition).map((condition) => condition.name).join('、') || '正常'}；紧张 ${run.characters[action.characterId]?.stress ?? 0}/10`,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
  const system = `你是《${scenario.title}》的叙事导演，现在只担任场景的“阻力判断者”。你不续写故事，不改变人物的意图，也不掷骰。你的任务是判断：这个举动想要的效果，在此时此地有多难落地，以及落空会带来什么具体后果。

【判断尺度】
- 日常动作（拿东西、倒水、坐下、递东西、开门、收拾桌面）：DC 5–8。它们几乎总是发生；失败只意味着一点延误、尴尬或物理小麻烦，不阻断场景。
- 有阻力的情感/关系动作（说真话、请求、拒绝、试探、安慰、逼近、把话递出去）：DC 10–15。难点不在“举动是否完成”，而在对方是否愿意接住、是否听进去、是否被岔开。
- 真正困难的决定（当众承认、改变关系、把秘密放到桌面上）：DC 16–20。
- 更大尺度的对抗（战斗、夺物、当众翻盘）可以到 20–25；按世界与阻力给，不要因为数值高就抬价。
- 不要给普通家务设置高风险。失败必须比成功更有意味，否则不要用高 DC 惩罚它。

【修正值】
modifier 取 -3 到 +3，只在有具体、未被能力值/特质/状态重复计算的利弊时使用。能不用就不用。它直接影响举动者的总分。

【针对人物的举动】
- hostile=true 的举动会由目标的回应检定对抗；你仍然要给一个 dc 供系统保留，但它不会直接决定结果。请按“如果对方不回应，这个效果有多难落地”来评。
- hostile=false 的举动不进入回应回合；dc 就是效果是否落地的难度。请按“对方这一轮会有自己的举动，这个效果要穿过多少阻力”来评。
- 不要把非敌意的请求、坦白、关心按“攻击”定价。

【外部事件（不是任何角色的举动）】
- 本刻最多提出 ${externalEventBudget} 条；没有就返回 []。本场总预算 2 条，不能用来频繁制造意外。
- 外部事件必须是独立于全部角色行动的客观变化：天气、班次、机械、第三方、事故、期限事件本身。它不能是某个 deed/effect 的直接结果，也不能是“为了让剧情继续/阻止收束”而临时加的新障碍。
- 如果它只是替角色制造新麻烦、让场景再拖一刻，不要提；如果本刻已经有足够压力，返回空数组。
- likelihood 只能填 routine / possible / unlikely，引擎映射为 d20 DC 8 / 13 / 18；如果事件会改变已公开的事实或期限，用 unlikely，并额外 +5。你不能直接给 DC。
- fact 是事件**发生后**才写入的公开事实；description 是事件本身；reason 用一句说明它为什么独立于角色行动。
- 不要在 resolution 里新增这类客观事实；外部事件只在这里提出，由系统掷骰后交给收束。

【风险】
risk 是一句具体的后果，例如“话被岔开，再开口更难”“对方把这句当成玩笑”“你暴露了不该露的纸角”“动作没达成，工具坏了”。不要写死亡，除非举动本身明确把人物置于致命危险；不要把“落空”写成灾难。

【必须返回所有举动】
以下每个 action_id 必须且只能出现一次。只返回 JSON，不要叙事，不要 Markdown。

${ADJUDICATION_SCHEMA}`;

  const user = `${worldBlock(scenario, true)}

【当前时刻】${clockLine(beat.clock, beat.index)}
【公开处境】${beat.publicBrief}
【压力】${beat.pressure}
【公开事实】${run.world.publicFacts.map((fact) => `- ${fact}`).join('\n') || '无'}

【全部已声明举动】
${actionLines}

【外部事件预算】${externalEventBudget} 条；本场总预算 2 条。
【人物能力速览】
${scenario.characters
  .map((character) => {
    const runtime = run.characters[character.id]!;
    return `- ${character.name}：体魄 ${character.abilities.physique}／敏捷 ${character.abilities.agility}／感知 ${character.abilities.perception}／智识 ${character.abilities.intellect}／意志 ${character.abilities.will}／风度 ${character.abilities.presence}；特质 ${character.traits.map((trait) => trait.name).join('、') || '无'}；状态 ${runtime.conditions.map((condition) => condition.name).join('、') || '正常'}`;
  })
  .join('\n')}

【难度额外指引】${scenario.rules.difficultyGuidance ?? '按上述统一尺度。'}

请逐条裁定并输出 JSON。`;

  return { system, user, schemaHint: ADJUDICATION_SCHEMA };
}

function formatRollForKeeper(action: ActionRecord): string {
  if (action.status === 'abandoned') {
    return `举动“${action.summary}”被放下（为回应压力而收住，未执行）。`;
  }
  if (!action.roll) return `举动“${action.summary}”没有有效骰点。`;
  const roll = action.roll;
  const checkNarrative =
    action.targetId && roll.opponentTotal !== null
      ? `对抗目标的回应总值 ${roll.opponentTotal}`
      : `对照 DC ${roll.dc}`;
  return [
    `举动“${action.summary}”（${action.characterId}）`,
    `效果检定：${checkModifierSummary(roll)} = 总计 ${roll.total}`,
    `目标：${checkNarrative}；差值 ${roll.margin! >= 0 ? '+' : ''}${roll.margin}；结果：**${OUTCOME_META[roll.tier].label}**${roll.criticalByNatural20 ? '（d20 自然 20）' : ''}`,
  ].join('｜');
}

export function buildResolutionPrompt(params: {
  scenario: Scenario;
  run: Run;
  beat: Beat;
  adjudications: Adjudication[];
}): { system: string; user: string; schemaHint: string } {
  const { scenario, run, beat, adjudications } = params;
  const adjudicationById = new Map(adjudications.map((item) => [item.actionId, item]));
  const actionBlock = beat.actions
    .map((action) => {
      const actor = characterById(scenario, action.characterId);
      const target = action.targetId ? characterById(scenario, action.targetId) : null;
      const adj = adjudicationById.get(action.id);
      const response = beat.reactions.find((entry) => entry.characterId === action.targetId);
      const responseLine = response?.roll
        ? `目标回应：${response.summary}（${response.stance}，结果总值 ${response.roll.total}${response.continueOriginal ? '，继续原举动，分心 -2' : '，放下原举动'}）`
        : '无目标回应';
      return [
        `- ${actor?.name ?? action.characterId} 的举动：${action.summary}`,
        `  实际做了什么：${actionDeed(action)}`,
        `  想要的效果：${actionEffect(action)}`,
        action.dialogue ? `  台词：“${action.dialogue}”` : '',
        target ? `  指向：${target.name}（${action.hostile ? '敌意' : '非敌意'}）` : '',
        adj ? `  难度：DC ${adj.dc}（${adj.difficultyLabel}），情境修正 ${adj.modifier >= 0 ? '+' : ''}${adj.modifier}` : '',
        `  ${responseLine}`,
        `  ${formatRollForKeeper(action)}`,
        action.outcomeNote ? `  机械备注：${action.outcomeNote}` : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
  const responseBlock = beat.reactions
    .map((response) => {
      const actor = characterById(scenario, response.characterId);
      return [
        `- ${actor?.name ?? response.characterId} 的回应：${response.summary}（${response.stance}）`,
        `  选择：${response.continueOriginal ? '继续原本的举动，承担分心惩罚' : '放下原本的举动，专心回应'}`,
        response.description ? `  具体：${response.description}` : '',
        response.dialogue ? `  台词：“${response.dialogue}”` : '',
        response.roll
          ? `  回应总值：${response.roll.total}｜${checkModifierSummary(response.roll).join('，')}${response.roll.penaltyNotes.length ? `｜惩罚：${response.roll.penaltyNotes.join('；')}` : ''}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');
  const externalBlock = (beat.externalEvents ?? [])
    .map(
      (event) =>
        `- ${event.description}：d20 ${event.natural} vs DC ${event.dc} → ${
          event.success ? '发生' : '未发生'
        }${event.success ? `；公开事实：“${event.fact}”` : '；没有发生，不要写成发生'}`,
    )
    .join('\n');
  const characterNotes = scenario.characters
    .map((character) => {
      const runtime = run.characters[character.id]!;
      const visible = runtime.conditions.filter(isPublicCondition);
      return `- ${character.name}（${character.id}）｜${character.title}${character.passive ? '｜被动角色' : ''}：${truncate(character.publicProfile, 200)}\n  可观察状态：${visible.map((condition) => condition.name).join('、') || '无异常'}`;
    })
    .join('\n');

  const system = `你是《${scenario.title}》的叙事导演，在收束阶段负责把已经发生的举动、话语和效果写成一场戏，并给出可追溯的状态后果。

**这一阶段的你被刻意限制在“外部视角”**：你拿不到任何人物的秘密、内心、未公开记忆，也拿不到世界的隐藏真相。你只能依据公开处境、已声明的举动、已声明的台词、检定结果与公开事实来写。你不知道的东西，叙事里的人也不能凭空知道。这不是惩罚，而是为了从结构上防止旁白替人物泄露秘密或替人物做决定。

【叙事铁律】
0. **人物只做了下列记录中已声明的事，只说了已声明的台词。** 未出现在记录里的关键决定、承诺、坦白、道歉、交还物件、拥抱、离场或反击，都没有发生。thought 只是导演理解动机的参考，绝不能被当成举动或台词。秘密只能通过已声明的举动、已声明的台词，或举动带来的可验证证据泄露。
1. **deed 与 effect 分开。** deed 是记录里实际发生的事，通常已经发生；effect 是这次想要达成的结果。检定只决定 effect 是否落地：**意外奏效**：效果落地，并有额外优势或揭示；**落地**：效果落地，通常伴随代价、暴露或消耗；**落空**：效果没有落地，但 deed 仍然发生了——话已经说出口、手已经伸出去、东西已经递出，只是没有被接住、被岔开、被误解或被挡回。不要因为 effect 落空就把 deed 抹掉，也不要因为 deed 发生就宣布 effect 成功。
2. 被放下的原举动绝对不要写成已执行；它应表现为被压力打断或自己收住。回应的选择要产生可见影响。
3. 敌意举动与目标回应对抗时，用分数差体现分寸；非敌意举动不进入回应回合，目标的这一轮举动就是回答。不要让旁白替任何一方宣布“赢了”；双方可以同时得到不同的东西。
4. 公开叙事只能包含在场者可感知的内容。人物的内心、秘密、未说出口的打算，只能通过表情、动作、台词或后果暗示；若要给某角色独有信息，放进 private_note / memory。**effect 是导演判断结果的参照，不等于公开信息**：如果人物没有通过 deed 或台词把意图露出来，不要用旁白替他宣布。不要把公开叙事写成全知视角的内心独白。
5. 必须处理所有已声明举动；把它们编织成同一个连续场景，不要逐条流水账。优先让举动互相影响，给动作留出因果。
6. 延续人物性格、物理空间和前文事实。可以引入环境变化，但不能凭空否定已有事件或让人瞬移。暴力、伤害与超自然现象要有代价。
7. 不要用旁白替人物做重大决定，也不要把尚未发生的转折提前写完。**如果本场的核心问题已经在本刻得到回答——包括以落空、错过、沉默、离开或失败回答——就让它成为结局，不要为了续集硬留钩子。** 核心问题尚未回答时，才保留至少一个未解决的问题给下一刻。某个效果落空时，只让它尝试过的痕迹留下，不要让人物凭空获得它没有取得的秘密。
8. 文风：${scenario.world.tone}。具体、克制、有感官细节；避免“仿佛时间静止”“命运的齿轮”等陈词。段落之间空行。
9. 时间推进是事件驱动的：根据这一轮真正消耗的时间选择 1–180 分钟，不要机械地每刻十分钟。用一句 label 和一句 reason 解释它。**不要无故越过本场期限${scenario.world.countdown ? `（${scenario.world.countdown}）` : ''}；如果越过了，必须在本刻写清一个可验证的延迟、停航或期限变更事实，并加入 public_facts；否则把时间停在期限之内。**
10. **外部事件已经由裁定阶段提出并掷骰。** 未发生的事件不能写成发生；发生的事件的 fact 已经在公开事实里。不要新增任何角色之外的原因（天气、班次、机械、第三方、事故）来制造新障碍或延迟收束；如果世界事件结算里没有发生，就是没有发生。
11. public_facts_add 只能写角色举动/回应直接造成的事实；外部事件由系统结算，不要在这里重复添加，也不要凭空制造新的客观变化。
12. 只输出严格 JSON，不要 Markdown 围栏或额外解释。以下角色 id 必须原样使用：${namesFor(scenario)}。

【状态变化规则】
- conditions 是会被下一次检定读取的状态，不是游戏 buff。优先写“话没落地”“手在抖”“鞋袜湿冷”“被按住的主动权”这类具体状态；避免“攻击力下降”。
- 每条状态必须给 visibility：**public**（旁人能看见，如受伤、湿透、手里拿着什么）或 **private**（只有本人知道的心情/判断）。emotion 默认 private，injury/physical 默认 public。
- 最多给每人新增 2 个，modifier 取 -4 到 +4，最好使用 -2、+2 这类清楚的值。若有 abilities，写明哪些能力受影响。
- 已有的旧状态要合理移除；不要让一个人背着五六个旧情绪进入下一场。
- stress_delta 取 -5 到 +5，只在情绪/压力确实改变时使用。
- memory 是这个人主观记住的一句话，不是全知事实；没有就填 null。
- public_facts_add 是本刻结束后所有人都能确认的新信息，最多 2 条；不要公开秘密，除非有举动使其曝光。
- flags_set 只用于后续确实需要追踪的事实，键名用 snake_case。
- 如果本刻已经回答了本场的核心问题——包括以落空、错过、沉默或离开回答——就填 ending；不要为了续集硬留钩子。核心问题尚未回答时，ending 必须是 null。第 1–3 刻通常不结束；但如果核心问题已经回答，也可以提前收束。

【输出结构】
${RESOLUTION_SCHEMA}

ending 非空时的格式：
{"headline":"一句收束标题","epilogue":"150-300 字的终章公开叙述","final_image":"最后一个画面，1 句"}`;

  const user = `${worldBlock(scenario, false)}

【当前时刻】${clockLine(beat.clock, beat.index)}
【公开处境】
${beat.publicBrief}

【公开事实】
${run.world.publicFacts.map((fact) => `- ${fact}`).join('\n') || '无'}

【公开人物卡（只能使用这些外在信息）】
${characterNotes}

【人物本刻的举动、效果与检定】
${actionBlock}

【敌意回应与分心】
${responseBlock || '（本刻没有敌意举动触发回应回合。）'}

【世界事件结算（已掷骰）】
${externalBlock || '（本刻没有外部事件。）'}

【导演现在要做的】
1. 写公开叙事，让每个 deed 发生，让 effect 的落地/落空按照检定结果呈现；不要把结果写成战报。
2. 给出状态变化、公开事实更新、下一时刻的压力。
3. 设计一个事件驱动的时间跳跃，并输出 ending（通常为 null）。
4. 保持已有秘密的张力，不要把还没被揭开的真相直接倾倒出来。

只输出请求的 JSON。`;

  return { system, user, schemaHint: RESOLUTION_SCHEMA };
}

export function formatAdjudicationSummary(adjudications: Adjudication[]): string {
  return adjudications
    .map(
      (adj) =>
        `- ${adj.actionId}: DC ${adj.dc} / 修正 ${adj.modifier >= 0 ? '+' : ''}${adj.modifier} / ${adj.reason} / 风险：${adj.risk}`,
    )
    .join('\n');
}
