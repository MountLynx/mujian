import type {
  ActionRecord,
  Beat,
  CharacterDefinition,
  CharacterRuntime,
  Condition,
  ReactionRecord,
  Run,
} from '../types.ts';
import { OUTCOME_META } from '../types.ts';
import { truncate } from '../utils.ts';

export interface ProseOptions {
  /** Character id for third/first limited, or `omniscient`. */
  pov?: string;
  person?: 'first' | 'third';
  protagonist?: string;
  style?: string;
  length?: 'short' | 'medium' | 'long';
}

export interface ProseOutlineScene {
  beatIndex: number;
  title: string;
  summary: string;
  pov: string;
  keyImages: string[];
  turn: string;
}

export interface ProseOutline {
  title: string;
  /** 0-based beat index selected as the story's last beat. */
  endingBeatIndex: number;
  endingReason: string;
  scenes: ProseOutlineScene[];
  ending: string;
}

export interface ProseDraft {
  title: string;
  body: string;
  finalImage: string;
}

const LENGTH_GUIDE: Record<NonNullable<ProseOptions['length']>, string> = {
  short: '1200–2000 个汉字，2–3 个场景，克制，不解释所有事',
  medium: '2500–4000 个汉字，按推演时刻分场，允许停顿与留白',
  long: '5000–8000 个汉字，完整展开每个时刻，但仍不要替人物做新决定',
};

function characterById(run: Run, id: string): CharacterDefinition | undefined {
  return run.scenario.characters.find((character) => character.id === id);
}

function conditionText(condition: Condition): string {
  return `${condition.name}（${condition.modifier >= 0 ? '+' : ''}${condition.modifier}，${condition.visibility ?? (condition.kind === 'emotion' ? 'private' : 'public')}）`;
}

function actionEffect(action: ActionRecord): string {
  return action.effect || action.goalProgress || action.summary;
}

function responseText(response: ReactionRecord, includeSummary: boolean): string {
  const head = includeSummary ? `${response.summary}（${response.stance}）` : '';
  return `${head}${response.description ? `${head ? '：' : ''}${response.description}` : ''}${response.dialogue ? ` “${response.dialogue}”` : ''}`;
}

function privateBlock(run: Run, pov: CharacterDefinition | undefined): string {
  if (!pov) {
    // Omniscient mode: the author may see everything, but the prose prompt is
    // told not to dump secrets without a scene reason.
    return run.scenario.characters
      .map((character) => {
        const runtime = run.characters[character.id]!;
        return `- ${character.name}：欲望「${character.desire}」；恐惧「${character.fear}」；秘密「${character.secret}」；状态 ${runtime.conditions.map(conditionText).join('、') || '无'}；记忆 ${runtime.memories.slice(-3).map((memory) => memory.summary).join('；') || '无'}`;
      })
      .join('\n');
  }
  const runtime = run.characters[pov.id]!;
  return [
    `- 视角人物：${pov.name}（${pov.title}）`,
    `- 公开形象：${pov.publicProfile}`,
    `- 性格：${pov.personality}`,
    `- 欲望：${pov.desire}`,
    `- 恐惧：${pov.fear}`,
    `- 只有他知道的秘密：${pov.secret}`,
    `- 当前状态：${runtime.conditions.map(conditionText).join('、') || '无'}；紧张 ${runtime.stress}/10`,
    `- 记忆：${runtime.memories.slice(-8).map((memory) => memory.summary).join('；') || '无'}`,
  ].join('\n');
}

function visibleToPov(run: Run, pov: CharacterDefinition | undefined, characterId: string): boolean {
  return !pov || pov.id === characterId;
}

export function buildStorySpine(run: Run, options: ProseOptions = {}, endBeatIndex?: number): {
  spine: string;
  pov: CharacterDefinition | undefined;
} {
  const povId = options.pov && options.pov !== 'omniscient' ? options.pov : undefined;
  const pov = povId ? characterById(run, povId) : undefined;
  const protagonist =
    (options.protagonist ? characterById(run, options.protagonist) : undefined) ?? pov;
  const allComplete = run.beats.filter((beat) => beat.phase === 'complete');
  const beats =
    endBeatIndex === undefined
      ? allComplete
      : allComplete.filter((beat) => beat.index <= endBeatIndex);
  const lines: string[] = [];
  lines.push(`【故事】${run.scenario.title}${run.scenario.subtitle ? `——${run.scenario.subtitle}` : ''}`);
  lines.push(`【世界与场所】${run.scenario.world.setting}\n${run.scenario.world.location}`);
  lines.push(`【调性】${run.scenario.world.tone}`);
  lines.push(
    `【人物】${run.scenario.characters
      .map((character) => `${character.name}（${character.title}${character.passive ? '，被动/不主动行动' : ''}）`)
      .join('、')}`,
  );
  lines.push(
    `【创作约束】POV=${pov ? `${pov.name}（第三人称有限/第一人称可选）` : '全知'}；主角=${protagonist?.name ?? '群像'}；文体=${options.style ?? run.scenario.world.tone}；篇幅=${LENGTH_GUIDE[options.length ?? 'medium']}。`,
  );
  lines.push(`\n【视角人物可用的私人信息】\n${privateBlock(run, pov)}`);

  for (const beat of beats) {
    lines.push(`\n## 第 ${beat.index + 1} 刻 · ${beat.clock.display}｜${beat.title}`);
    lines.push(`公开处境：${beat.publicBrief}`);
    const povCue = pov ? beat.privateCues.find((cue) => cue.characterId === pov.id)?.cue : undefined;
    if (povCue) lines.push(`视角人物独有线索：${povCue}`);
    if (beat.pressure) lines.push(`当时的压力：${beat.pressure}`);
    if (beat.sceneQuestion) lines.push(`悬着的问题：${beat.sceneQuestion}`);
    for (const action of beat.actions) {
      const actor = characterById(run, action.characterId);
      const target = action.targetId ? characterById(run, action.targetId) : null;
      const outcome = action.outcome ? OUTCOME_META[action.outcome].label : '未结算';
      const isSelf = Boolean(pov && pov.id === action.characterId);
      const thought =
        isSelf && action.thought ? `｜${pov!.name}的内心：${action.thought}` : '';
      // A limited POV can observe the deed, dialogue and result, but not
      // another character's intended effect or system hostility flag.
      const effectText = isSelf || !pov ? `｜想要的效果：${actionEffect(action)}` : '';
      const hostilityText = (isSelf || !pov) && action.hostile ? '（敌意）' : '';
      const actionLabel = isSelf || !pov ? `${action.summary}｜` : '';
      lines.push(
        `- ${actor?.name ?? action.characterId} 的举动：${actionLabel}deed：${action.deed || action.description}${effectText}｜结果：${outcome}${target ? `｜指向：${target.name}${hostilityText}` : ''}${action.dialogue ? `｜台词：“${action.dialogue}”` : ''}${thought}`,
      );
    }
    for (const response of beat.reactions) {
      const actor = characterById(run, response.characterId);
      const isSelf = Boolean(pov && pov.id === response.characterId);
      const thought =
        isSelf && response.thought ? `｜${pov!.name}的内心：${response.thought}` : '';
      lines.push(`- ${actor?.name ?? response.characterId} 的回应：${responseText(response, isSelf || !pov)}${thought}`);
    }
    for (const change of beat.stateChanges?.characters ?? []) {
      if (!visibleToPov(run, pov, change.characterId)) continue;
      const pieces: string[] = [];
      if (change.stressDelta) pieces.push(`紧张 ${change.stressDelta > 0 ? '+' : ''}${change.stressDelta}`);
      if (change.conditionsAdd.length) pieces.push(`状态 ${change.conditionsAdd.map((condition) => condition.name).join('、')}`);
      if (change.conditionsRemove.length) pieces.push(`解除 ${change.conditionsRemove.join('、')}`);
      if (change.privateNote) pieces.push(`独知：${change.privateNote}`);
      if (change.memory) pieces.push(`记住：${change.memory.summary}`);
      if (pieces.length) lines.push(`- ${characterById(run, change.characterId)?.name ?? change.characterId}：${pieces.join('；')}`);
    }
    if (beat.stateChanges?.world.factsAdd.length) {
      lines.push(`- 新公开事实：${beat.stateChanges.world.factsAdd.join('；')}`);
    }
    if (beat.nextTimeJump) {
      lines.push(
        `- 时间推进：${beat.nextTimeJump.elapsedMinutes} 分钟；${beat.nextTimeJump.label}；${beat.nextTimeJump.reason}`,
      );
    }
  }
  const lastComplete = allComplete.at(-1)?.index ?? -1;
  if (run.ending && (endBeatIndex === undefined || endBeatIndex >= lastComplete)) {
    lines.push(`\n## 推演终章\n${run.ending.headline}\n${run.ending.epilogue}`);
    if (run.ending.finalImage) lines.push(`最后画面：${run.ending.finalImage}`);
  }
  return { spine: lines.join('\n'), pov };
}

export function buildOutlinePrompt(run: Run, options: ProseOptions = {}): {
  system: string;
  user: string;
  schemaHint: string;
} {
  const { spine, pov } = buildStorySpine(run, options);
  const firstComplete = run.beats.find((beat) => beat.phase === 'complete');
  const anchor = firstComplete?.sceneQuestion?.trim() || run.scenario.world.premise;
  const schema = `{
  "title": "故事标题，可沿用或重起",
  "ending_beat_index": 4,
  "ending_reason": "为什么在这里收束：本场问题在这个时刻得到了什么回答，而不是作者想让它怎么结束",
  "scenes": [
    {
      "beat_index": 0,
      "title": "场景标题",
      "summary": "这个场景发生什么，1-2 句",
      "pov": "视角人物或'全知'",
      "key_images": ["2-4 个可触的意象/物件"],
      "turn": "这个场景的转折或没有落地的东西，1 句"
    }
  ],
  "ending": "结尾停在什么画面上，1 句"
}`;
  const system = `你是小说结构编辑。你要根据一份“世界推演记录”整理故事大纲，而不是续写或改写推演结果。

【本场问题锚点】${anchor}

【铁律】
1. 不新增记录里没有的重大事件、真相或人物决定；可以补足感官细节与场景调度。
2. 每个场景对应一个推演时刻；不要把多个时刻压成一句摘要。
3. **不要改写锚点问题，也不要用后面的新问题替代它。** 后面时刻的 sceneQuestion 可能已经漂移；以锚点为准。
4. **先读完全部时刻，再选择结束点。** 选择锚点问题第一次得到回答的那一拍——回答可以是落空、错过、沉默、僵持、离开或失败。**但选中的回答必须在后面的时刻没有被相反行动推翻。** 如果后面的时刻又迈步、又收回、又改口，说明这一拍不是最终回答；选最后一次回答，或选回答稳定后不再被推翻的那一拍，不要把被推翻的中间态当结局。不要因为后面的时刻更“完整”就选一个更晚的重复；后面的时刻是未采用的延续，可以不写进正文。
5. 结尾理由必须引用锚点问题，不能换问题。不要发明一个材料里没有的结局。
6. 视角：${pov ? `限知视角，只能使用 ${pov.name} 能感知和知道的信息；其他人的秘密与内心不能进入大纲。` : '全知视角，但只在场景需要时揭示秘密，不要一次倾倒。'}
7. 主角：${options.protagonist ? characterById(run, options.protagonist)?.name ?? options.protagonist : pov?.name ?? '群像'}；文体：${options.style ?? run.scenario.world.tone}；篇幅：${LENGTH_GUIDE[options.length ?? 'medium']}。
8. 只输出严格 JSON，不要 Markdown 围栏。

【输出结构】
${schema}`;
  return { system, user: spine, schemaHint: schema };
}

export function buildDraftPrompt(run: Run, options: ProseOptions = {}, outline?: ProseOutline): {
  system: string;
  user: string;
  schemaHint: string;
} {
  const endBeatIndex = outline?.endingBeatIndex;
  const { spine, pov } = buildStorySpine(run, options, endBeatIndex);
  const selected = endBeatIndex === undefined ? '' : `第 ${endBeatIndex + 1} 刻`;
  const schema = `{
  "title": "故事标题",
  "body": "Markdown 正文，分段，使用场景分隔；不要写标题重复、不要写系统术语",
  "final_image": "最后一个画面，1 句"
}`;
  const system = `你是小说作者。你要把一份“世界推演记录”和一份大纲写成可读的短篇小说。

【写作铁律】
1. 视角：${pov ? `限知视角（${pov.name}）。只能写 ${pov.name} 能看见、听见、知道、怀疑或回忆的东西；不要进入其他人物的内心，不要泄露其他人的秘密。${options.person === 'first' ? '使用第一人称。' : '使用第三人称有限视角。'}` : '全知视角；但秘密要由场景和行动揭示，不要由旁白一次性说明。'}
2. 主角：${options.protagonist ? characterById(run, options.protagonist)?.name ?? options.protagonist : pov?.name ?? '群像'}；文体：${options.style ?? run.scenario.world.tone}；篇幅：${LENGTH_GUIDE[options.length ?? 'medium']}。
3. **deed 已经发生，effect 按记录的结果落地或落空。** 不要把“落空”写成“什么都没发生”：话已经说出口、手已经伸出去、东西已经递出；只是没有被接住、被岔开或被误解。
4. 可以复用记录里的台词，也可以润色；不要给人物增加记录里没有的重大决定、承诺、坦白或反转。
5. 不要写“大成功/DC/检定/系统/回合/玩家”等术语；不要列清单；用场景、动作、对白和留白。
6. 每个推演时刻至少有一段自己的场景，不要流水账；允许时间跳跃和未解释的空白。
7. **只写到${selected || '所选结束点'}为止。** 后面的时刻即使材料里有，也是未采用的延续，不要写进正文；不要把后面才发生的事提前写进结尾。
8. 只输出严格 JSON，不要 Markdown 围栏。

【输出结构】
${schema}`;
  const outlineBlock = outline
    ? `\n\n【大纲】\n${JSON.stringify(outline, null, 2)}\n\n【已选结束点】第 ${outline.endingBeatIndex + 1} 刻。只使用这一刻及之前的材料；后面的时刻不要写。\n收束理由：${outline.endingReason || '（未说明）'}`
    : '';
  return { system, user: `${spine}${outlineBlock}`, schemaHint: schema };
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} 必须是一个对象`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} 不能为空`);
  return value.trim();
}

export function parseProseOutline(value: unknown): ProseOutline {
  const root = object(value, '大纲');
  const scenesRaw = Array.isArray(root.scenes) ? root.scenes : [];
  const scenes: ProseOutlineScene[] = scenesRaw.map((item, index) => {
    const scene = object(item, `场景 ${index + 1}`);
    return {
      beatIndex: Number(scene.beat_index ?? index),
      title: text(scene.title, `场景 ${index + 1} 标题`),
      summary: text(scene.summary, `场景 ${index + 1} 摘要`),
      pov: typeof scene.pov === 'string' ? scene.pov : '',
      keyImages: Array.isArray(scene.key_images)
        ? scene.key_images.filter((entry): entry is string => typeof entry === 'string')
        : [],
      turn: typeof scene.turn === 'string' ? scene.turn : '',
    };
  });
  if (!scenes.length) throw new Error('大纲至少需要一个场景');
  const maxIndex = Math.max(...scenes.map((scene) => scene.beatIndex));
  const rawEnding = Number(root.ending_beat_index);
  const endingBeatIndex = Number.isFinite(rawEnding)
    ? Math.max(0, Math.min(Math.round(rawEnding), maxIndex))
    : maxIndex;
  return {
    title: text(root.title, '大纲标题'),
    endingBeatIndex,
    endingReason: typeof root.ending_reason === 'string' ? root.ending_reason : '',
    scenes,
    ending: typeof root.ending === 'string' ? root.ending : '',
  };
}

export function parseProseDraft(value: unknown): ProseDraft {
  const root = object(value, '正文');
  return {
    title: text(root.title, '正文标题'),
    body: text(root.body, '正文'),
    finalImage: typeof root.final_image === 'string' ? root.final_image : '',
  };
}

export function renderProseMarkdown(result: { outline: ProseOutline; draft: ProseDraft }): string {
  const { outline, draft } = result;
  return [
    `# ${draft.title || outline.title}`,
    '',
    draft.body,
    draft.finalImage ? `\n*${draft.finalImage}*` : '',
    '',
  ].join('\n');
}
