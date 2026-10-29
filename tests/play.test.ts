import assert from 'node:assert/strict';
import test from 'node:test';
import type { Scenario } from '../src/types.ts';
import type {
  JsonCallOptions as CallOptions,
  JsonCallResult,
  LanguageModel as Model,
} from '../src/llm/client.ts';
import { createRun } from '../src/engine/run.ts';
import { RunEngine } from '../src/engine/engine.ts';
import {
  createPlayConfig,
  playAwaiting,
  PlayInputError,
  submitPlayerAction,
  submitPlayerReaction,
  unlockRecap,
} from '../src/engine/play.ts';
import { redactRunForPlayer } from '../src/engine/playerView.ts';

/* ------------------------------------------------------------------------- */
/* 测试剧本                                                                   */
/* ------------------------------------------------------------------------- */

function scenario(): Scenario {
  const character = (
    id: string,
    name: string,
    secret: string,
    memories: string[],
  ) => ({
    id,
    name,
    title: `${name}的身份`,
    publicProfile: `${name}的公开资料`,
    personality: `${name}的性格：只在导演提示里出现。`,
    desire: `${name}想拿到真相。`,
    fear: `${name}害怕被抛下。`,
    secret,
    abilities: {
      physique: 5,
      agility: 6,
      perception: 7,
      intellect: 6,
      will: 6,
      presence: 5,
    },
    traits: [
      { name: `${name}的专长`, description: '测试特质', bonus: 2, ability: 'perception' as const },
    ],
    possessions: [`${name}的物件`],
    relationships: [],
    memories: memories.map((summary) => ({ summary, importance: 3 })),
    conditions: [],
  });
  return {
    id: 'play-test',
    title: '测试场景',
    subtitle: '扮演模式自动化测试',
    kicker: '测试',
    world: {
      title: '测试场景',
      era: '测试',
      tone: '克制',
      setting: '一个封闭的测试房间。',
      location: '测试房间',
      dateLabel: '测试日',
      startClock: '22:00',
      premise: '测试冲突',
      opening: '测试开场：一封信被放在桌上。',
      directorNotes: 'DIRECTOR_NOTES_MARKER 测试导演笔记',
      hiddenCanon: 'HIDDEN_CANON_MARKER 导演才知道的真相。',
      initialFacts: ['测试事实一'],
      countdown: '一小时后',
    },
    characters: [
      character('a', '甲', 'A_SECRET_MARKER 只有甲知道。', ['甲的旧事']),
      character('b', '乙', 'B_SECRET_MARKER 只有乙知道。', ['乙的旧事']),
      character('c', '丙', 'C_SECRET_MARKER 只有丙知道。', ['丙的旧事']),
    ],
    rules: { maxBeats: 3 },
  };
}

/* ------------------------------------------------------------------------- */
/* 假模型                                                                     */
/* ------------------------------------------------------------------------- */

class FakeModel implements Model {
  readonly model = 'fake';
  calls: Array<{ label: string; user: string }> = [];
  /** b 的举动是否指向玩家 a；用于两个方向的测试。 */
  hostileTargetOfB: 'a' | 'c' | null = 'a';

  async callJson<T>(options: CallOptions<T>): Promise<JsonCallResult<T>> {
    this.calls.push({ label: options.label, user: options.user });
    const payload = this.payload(options.label, options.user);
    const data = options.validate(payload);
    return {
      data,
      content: JSON.stringify(payload),
      reasoning: '',
      usage: {
        calls: 1,
        promptTokens: 10,
        completionTokens: 5,
        cachedTokens: 0,
        reasoningTokens: 0,
        totalTokens: 15,
        failures: 0,
      },
      latencyMs: 1,
      thinking: false,
    };
  }

  private payload(label: string, user: string): unknown {
    if (label.startsWith('gm:opening')) {
      return {
        title: '信与灯',
        public_brief: '测试开场：一封信被放在桌上，窗外开始下雨。',
        private_cues: [
          { character_id: 'a', cue: 'A_CUE_MARKER 甲看见封蜡的颜色。' },
          { character_id: 'b', cue: 'B_CUE_MARKER 乙听见门外有脚步。' },
          { character_id: 'c', cue: 'C_CUE_MARKER 丙注意到盐。' },
        ],
        pressure: '信正在被雨水打湿。',
        scene_question: '谁会先伸手？',
        gm_note: 'GM_NOTE_MARKER 测试导演注。',
      };
    }
    if (label.includes(':action:')) {
      if (label.includes(':b:')) {
        const target = this.hostileTargetOfB;
        return {
          thought: 'B_THOUGHT_MARKER 他以为我会退。',
          category: '行动',
          summary: 'B_SUMMARY 按住信',
          deed: 'B_DEED 乙不退反进，把手按在信上。',
          effect: 'B_EFFECT 在任何人伸手之前控制住信。',
          hostile: Boolean(target),
          ability: 'perception',
          trait: null,
          target_id: target,
          dialogue: 'B_DIALOGUE 别动。',
          goal_progress: 'B_GOAL 抢先控制信件。',
          stakes: 'B_STAKES 被拦住。',
        };
      }
      return {
        thought: 'C_THOUGHT_MARKER 先看他们的手。',
        category: '观察',
        summary: 'C_SUMMARY 退后观察',
        deed: 'C_DEED 丙向后退半步，把门口留在视线里。',
        effect: 'C_EFFECT 保留退路。',
        hostile: false,
        ability: 'perception',
        trait: null,
        target_id: null,
        dialogue: '',
        goal_progress: 'C_GOAL 保留退路。',
        stakes: 'C_STAKES 失去先机。',
      };
    }
    if (label.startsWith('gm:adjudication')) {
      const ids = [...user.matchAll(/### action_id: ([\w-]+)/g)].map((match) => match[1]!);
      return {
        adjudications: ids.map((actionId) => ({
          action_id: actionId,
          difficulty_label: '标准',
          dc: 15,
          modifier: 0,
          reason: '测试裁定',
          risk: '测试风险',
        })),
        external_events: [],
        fairness_note: '测试。',
      };
    }
    if (label.includes(':reaction:')) {
      if (label.includes(':b:')) {
        return {
          thought: 'B_REACTION_THOUGHT 我不会退。',
          continue_original: false,
          stance: '挡回',
          summary: 'B_REACTION 挡回甲的手',
          description: 'B_REACTION_DESC 乙侧身挡开，把信护在身后。',
          ability: 'will',
          trait: null,
          dialogue: 'B_REACTION_DIALOGUE 先听我说完。',
        };
      }
      return {
        thought: 'C_REACTION_THOUGHT 不值得冒险。',
        continue_original: true,
        stance: '退让',
        summary: 'C_REACTION 让到门边',
        description: 'C_REACTION_DESC 丙让到门边。',
        ability: 'agility',
        trait: null,
        dialogue: '',
      };
    }
    if (label.startsWith('gm:resolution')) {
      return {
        narration:
          '雨声压低了每个人的呼吸。信被按在桌上，封蜡裂开，里面是一小截黑色的灯芯。没有人先开口。',
        outcome_notes: [
          { character_id: 'a', note: 'OUTCOME_NOTE_A 甲看见了灯芯。' },
          { character_id: 'b', note: 'OUTCOME_NOTE_B 乙控制住了信。' },
          { character_id: 'c', note: 'OUTCOME_NOTE_C 丙保留了退路。' },
        ],
        state_changes: {
          characters: [
            {
              character_id: 'a',
              stress_delta: 1,
              conditions_add: [
                {
                  name: '手在抖',
                  description: 'A_PRIVATE_CONDITION 只有甲知道的手抖。',
                  modifier: -1,
                  kind: 'emotion',
                  visibility: 'private',
                  abilities: ['will'],
                },
              ],
              conditions_remove: [],
              inventory_add: [],
              inventory_remove: [],
              private_note: 'A_PRIVATE_NOTE 甲认出灯芯的纹路。',
              memory: { summary: 'A_MEMORY 信里是灯芯。', importance: 4 },
            },
            {
              character_id: 'b',
              stress_delta: 2,
              conditions_add: [
                {
                  name: '按住信',
                  description: 'B_PRIVATE_CONDITION 乙的掌心压着封蜡。',
                  modifier: -1,
                  kind: 'emotion',
                  visibility: 'private',
                },
              ],
              conditions_remove: [],
              inventory_add: ['B_INVENTORY 黑色灯芯'],
              inventory_remove: [],
              private_note: 'B_PRIVATE_NOTE 乙知道是谁寄的。',
              memory: { summary: 'B_MEMORY 我拆开了信。', importance: 3 },
            },
            {
              character_id: 'c',
              stress_delta: 0,
              conditions_add: [],
              conditions_remove: [],
              inventory_add: [],
              inventory_remove: [],
              private_note: 'C_PRIVATE_NOTE 丙看见了门缝。',
              memory: { summary: 'C_MEMORY 他们都没看门口。', importance: 2 },
            },
          ],
          world: {
            public_facts_add: ['信封里装的是一截黑色灯芯。'],
            public_facts_remove: [],
            flags_set: { SECRET_FLAG: true },
            pressure: '灯芯出现了，而门外有人在听。',
            scene_title: '裂开的封蜡',
          },
        },
        next_time_jump: {
          elapsed_minutes: 7,
          label: '封蜡裂开后的第七分钟',
          reason: '争执与拆信耗去七分钟。',
        },
        ending: null,
      };
    }
    throw new Error(`unexpected label ${label}`);
  }
}

function playRun(model = new FakeModel()) {
  const run = createRun(scenario(), { seed: 'play-test-seed', maxBeats: 3 });
  run.play = createPlayConfig(run.scenario, 'a');
  return { run, model, engine: new RunEngine(run, model) };
}

function playerActionInput(overrides: Record<string, unknown> = {}) {
  return {
    summary: '按住信',
    deed: '甲把手按在信上，抬头看向乙。',
    effect: '在任何人伸手之前控制住信。',
    dialogue: '先别碰它。',
    thought: 'PLAYER_THOUGHT 我必须先拿到它。',
    ability: 'perception',
    trait: '甲的专长',
    targetId: 'b',
    hostile: false,
    category: '行动',
    stakes: '被乙抢先。',
    ...overrides,
  };
}

function leakScan(value: unknown, markers: string[]): string[] {
  const text = JSON.stringify(value);
  return markers.filter((marker) => text.includes(marker));
}

/* ------------------------------------------------------------------------- */
/* 测试                                                                       */
/* ------------------------------------------------------------------------- */

test('扮演模式：开场后等待玩家宣告，其他人尚未行动', async () => {
  const { run, model, engine } = playRun();
  await engine.advanceOne();

  assert.equal(run.status, 'awaiting');
  assert.equal(playAwaiting(run), 'action');
  assert.equal(run.beats.length, 1);
  assert.equal(run.beats[0]!.phase, 'player_action');
  assert.equal(run.beats[0]!.actions.length, 0);
  assert.ok(
    model.calls.every((call) => !call.label.includes(':action:')),
    '玩家宣告之前不应生成任何角色举动',
  );

  const view = redactRunForPlayer(run);
  assert.deepEqual(
    leakScan(view, [
      'HIDDEN_CANON_MARKER',
      'DIRECTOR_NOTES_MARKER',
      'B_SECRET_MARKER',
      'C_SECRET_MARKER',
      'B_CUE_MARKER',
      'C_CUE_MARKER',
      'GM_NOTE_MARKER',
    ]),
    [],
  );
  assert.ok(JSON.stringify(view).includes('A_CUE_MARKER'), '自己的私密线索必须可见');
  assert.ok(JSON.stringify(view).includes('A_SECRET_MARKER'), '自己的秘密必须可见');
});

test('扮演模式：玩家宣告 → AI 举动 → 敌意回应等待 → 结算 → 复盘', async () => {
  const { run, model, engine } = playRun();
  await engine.advanceOne();
  submitPlayerAction(run, playerActionInput());
  assert.equal(playAwaiting(run), null);
  assert.equal(run.beats[0]!.phase, 'actions');

  await engine.advanceOne();
  assert.equal(run.status, 'awaiting');
  assert.equal(playAwaiting(run), 'reaction');
  assert.equal(run.beats[0]!.phase, 'player_reaction');
  const actionCalls = model.calls.filter((call) => call.label.startsWith('actor:action:'));
  assert.deepEqual(
    actionCalls.map((call) => call.label),
    ['actor:action:b:b1', 'actor:action:c:b1'],
  );
  assert.ok(
    model.calls.every((call) => !call.label.startsWith('actor:reaction:a')),
    '玩家自己不应被 AI 生成回应',
  );

  // 等待回应时，玩家可以看到指向自己的敌意举动详情，但看不到不相关的举动。
  const beforeReaction = redactRunForPlayer(run);
  const waitingBeat = beforeReaction.beats.at(-1)!;
  assert.equal(waitingBeat.actions.length, 2);
  const incoming = waitingBeat.actions.find((action) => action.characterId === 'b')!;
  assert.equal(incoming.effect, 'B_EFFECT 在任何人伸手之前控制住信。');
  assert.equal(incoming.dialogue, 'B_DIALOGUE 别动。');
  assert.ok(!waitingBeat.actions.some((action) => action.characterId === 'c'));

  submitPlayerReaction(run, {
    summary: '挡回去',
    description: '甲没有松手，反而把信按住，正面迎上乙。',
    dialogue: '那你先说完。',
    thought: 'PLAYER_REACTION_THOUGHT 我不会让。',
    ability: 'will',
    trait: null,
    continueOriginal: true,
    stance: '不退',
  });
  await engine.advanceOne();

  const beat = run.beats[0]!;
  assert.equal(beat.phase, 'complete');
  assert.equal(run.status, 'ready');
  assert.equal(beat.actions.length, 3);
  const own = beat.actions.find((action) => action.characterId === 'a')!;
  assert.equal(own.generatedBy, 'player');
  assert.ok(own.roll, '玩家举动必须有检定');
  assert.equal(own.penaltyNotes.length, 1);
  assert.match(own.penaltyNotes[0]!, /分心/);
  const ownReaction = beat.reactions.find((reaction) => reaction.characterId === 'a')!;
  assert.ok(ownReaction.roll, '玩家回应必须有检定');
  assert.equal(ownReaction.roll.penalty, -2);
  assert.equal(beat.narration.includes('封蜡裂开'), true);

  // 收官后的玩家视图：自己的全部信息 + 他人的可见 deed/台词，不含他人内幕。
  const view = redactRunForPlayer(run);
  assert.equal(view.seed, '', '复盘前不应泄露骰点种子');
  assert.equal(view.scenario.rules.difficultyGuidance, undefined);
  for (const runtime of Object.values(view.characters)) {
    assert.deepEqual(runtime.flags, {}, '复盘前不应泄露任何角色的 flags');
  }
  const viewBeat = view.beats[0]!;
  const ownView = viewBeat.actions.find((action) => action.characterId === 'a')!;
  assert.ok(ownView.roll, '自己的检定可见');
  const bView = viewBeat.actions.find((action) => action.characterId === 'b')!;
  assert.equal(bView.deed, 'B_DEED 乙不退反进，把手按在信上。');
  assert.equal(bView.effect, '');
  assert.equal(bView.thought, '');
  assert.equal(bView.roll, undefined);
  const ownReactionView = viewBeat.reactions.find((reaction) => reaction.characterId === 'a')!;
  assert.deepEqual(ownReactionView.roll!.incomingTotals, {}, '玩家回应里不应带出他人的举动总值');
  assert.equal(viewBeat.privateCues.length, 1);
  assert.equal(viewBeat.privateCues[0]!.characterId, 'a');
  assert.equal(viewBeat.gmNote, '');
  assert.equal(viewBeat.outcomeNotes.length, 0);
  assert.deepEqual(
    leakScan(view, [
      'B_SECRET_MARKER',
      'C_SECRET_MARKER',
      'B_CUE_MARKER',
      'C_CUE_MARKER',
      'GM_NOTE_MARKER',
      'B_THOUGHT_MARKER',
      'C_THOUGHT_MARKER',
      'B_EFFECT',
      'C_EFFECT',
      'B_PRIVATE_NOTE',
      'C_PRIVATE_NOTE',
      'B_PRIVATE_CONDITION',
      'C_PRIVATE_CONDITION',
      'B_MEMORY',
      'C_MEMORY',
      'B_INVENTORY',
      'OUTCOME_NOTE_A',
      'OUTCOME_NOTE_B',
      'OUTCOME_NOTE_C',
      'SECRET_FLAG',
    ]),
    [],
  );
  assert.ok(JSON.stringify(view).includes('PLAYER_THOUGHT'), '自己的内心可见');
  assert.ok(JSON.stringify(view).includes('A_PRIVATE_NOTE'), '自己的私密笔记可见');
  assert.ok(JSON.stringify(view).includes('信封里装的是一截黑色灯芯。'), '公开事实可见');

  // 未复盘时导出/全量数据仍由调用方拦截；复盘后视图变成全量。
  unlockRecap(run);
  assert.equal(run.status, 'ended');
  assert.equal(JSON.stringify(redactRunForPlayer(run)), JSON.stringify(run));
});

test('扮演模式：玩家敌意举动会触发 AI 目标的回应，且回应提示词能看到玩家的 deed/effect', async () => {
  const model = new FakeModel();
  model.hostileTargetOfB = null;
  const { run, engine } = playRun(model);
  await engine.advanceOne();
  submitPlayerAction(
    run,
    playerActionInput({
      targetId: 'b',
      hostile: true,
      summary: '按住乙的手',
      deed: 'PLAYER_HOSTILE_DEED 甲抓住乙的手腕，把它压回桌面。',
      effect: 'PLAYER_HOSTILE_EFFECT 阻止乙拆信。',
      dialogue: 'PLAYER_HOSTILE_DIALOGUE 别碰。',
      ability: 'physique',
      trait: null,
    }),
  );
  await engine.advanceOne();

  const beat = run.beats[0]!;
  assert.equal(beat.phase, 'complete');
  assert.equal(playAwaiting(run), null);
  const bReactionCall = model.calls.find((call) => call.label === 'actor:reaction:b:b1');
  assert.ok(bReactionCall, 'AI 角色乙必须获得回应机会');
  assert.ok(bReactionCall.user.includes('PLAYER_HOSTILE_DEED'));
  assert.ok(bReactionCall.user.includes('PLAYER_HOSTILE_EFFECT'));
  assert.ok(bReactionCall.user.includes('PLAYER_HOSTILE_DIALOGUE'));
  assert.ok(!bReactionCall.user.includes('PLAYER_THOUGHT'), '玩家内心不能出现在 AI 提示词里');
  assert.ok(!bReactionCall.user.includes('A_SECRET_MARKER'));
  assert.ok(!bReactionCall.user.includes('C_SECRET_MARKER'));
  const reaction = beat.reactions.find((entry) => entry.characterId === 'b');
  assert.ok(reaction?.roll);
});

test('扮演模式：输入校验拒绝越界与非法特质', async () => {
  const { run, engine } = playRun();
  await engine.advanceOne();
  assert.throws(
    () => submitPlayerAction(run, playerActionInput({ targetId: 'a' })),
    PlayInputError,
  );
  assert.throws(
    () => submitPlayerAction(run, playerActionInput({ ability: 'physique' })),
    PlayInputError,
  );
  assert.throws(
    () => submitPlayerAction(run, playerActionInput({ deed: '' })),
    PlayInputError,
  );
  // 未到阶段时不能回应
  assert.throws(() => submitPlayerReaction(run, { description: 'x', ability: 'will' }), PlayInputError);
  assert.equal(run.beats[0]!.actions.length, 0);
});

test('扮演模式：被动角色不能被玩家选择', () => {
  const input = scenario();
  input.characters[0]!.passive = true;
  assert.throws(() => createPlayConfig(input, 'a'), PlayInputError);
  assert.throws(() => createPlayConfig(input, 'nobody'), PlayInputError);
});

test('扮演模式：玩家引用不存在的目标会被拒绝', async () => {
  const { run, engine } = playRun();
  await engine.advanceOne();
  assert.throws(
    () => submitPlayerAction(run, playerActionInput({ targetId: 'nobody' })),
    PlayInputError,
  );
});

test('扮演模式：空标题会从长文本截取，而不是拒绝提交', async () => {
  const { run, engine } = playRun();
  await engine.advanceOne();
  const longDeed =
    '我把守灯日志翻到十七年前那一页，摊在灯台上，让所有人都能看见那行被墨水盖住的名字，然后退半步，等他自己走过来看。';
  const action = submitPlayerAction(
    run,
    playerActionInput({ summary: '', deed: longDeed, targetId: null }),
  );
  assert.ok(action.summary.length > 0 && action.summary.length <= 24, action.summary);
  assert.ok(longDeed.startsWith(action.summary));
  await engine.advanceOne();
  assert.equal(run.status, 'awaiting');
  assert.equal(playAwaiting(run), 'reaction');
  const longDescription =
    '我没有抽回手，反而把日志压得更紧，迎着他的目光站直，把刚才那句话一字一字地说完，让在场所有人都听见。';
  const reaction = submitPlayerReaction(run, {
    description: longDescription,
    ability: 'will',
    continueOriginal: true,
  });
  assert.ok(reaction.summary.length > 0 && reaction.summary.length <= 24, reaction.summary);
  assert.ok(longDescription.startsWith(reaction.summary));
});
