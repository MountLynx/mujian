import assert from 'node:assert/strict';
import test from 'node:test';
import type { Scenario } from '../src/types.ts';
import type { JsonCallOptions as CallOptions, JsonCallResult, LanguageModel as Model } from '../src/llm/client.ts';
import { createRun } from '../src/engine/run.ts';
import { RunEngine } from '../src/engine/engine.ts';

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
    personality: `${name}性格坚毅但也多疑。`,
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
    id: 'test-scene',
    title: '测试场景',
    subtitle: '用于自动化测试',
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
      directorNotes: '测试导演笔记',
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

class FakeModel implements Model {
  readonly model = 'fake';
  calls: Array<{ label: string; user: string }> = [];

  async callJson<T>(options: CallOptions<T>): Promise<JsonCallResult<T>> {
    this.calls.push({ label: options.label, user: options.user });
    const payload = fakePayload(options.label, options.user);
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
      latencyMs: 2,
      thinking: false,
    };
  }
}

function fakePayload(label: string, user: string): unknown {
  if (label.startsWith('gm:opening')) {
    return {
      title: '信与灯',
      public_brief: '测试开场：一封信被放在桌上，窗外开始下雨。',
      private_cues: [
        { character_id: 'a', cue: '甲看见封蜡的颜色，想起一件旧事。' },
        { character_id: 'b', cue: '乙听见门外有脚步停在原地。' },
        { character_id: 'c', cue: '丙注意到信纸边缘有一小块盐。' },
      ],
      pressure: '信正在被雨水打湿。',
      scene_question: '谁会先伸手？',
      gm_note: '测试导演注。',
    };
  }
  if (label.includes(':action:')) {
    if (label.includes(':a:')) {
      return {
        thought: '我必须先拿到它。',
        category: '行动',
        summary: '把信按在桌上',
        deed: '甲伸手把信压在桌面，抬头看向乙。',
        effect: '在乙伸手之前控制住信。',
        hostile: true,
        ability: 'perception',
        trait: '甲的专长',
        target_id: 'b',
        dialogue: '别动。',
        goal_progress: '抢先控制信件。',
        stakes: '被乙夺走。',
      };
    }
    if (label.includes(':b:')) {
      return {
        thought: '他以为我会退。',
        category: '交涉',
        summary: '揭开信上的封蜡',
        deed: '乙不退反进，伸手去拆信上的封蜡。',
        effect: '把选择推给丙。',
        hostile: true,
        ability: 'perception',
        trait: null,
        target_id: 'c',
        dialogue: '你更想让它被谁读到？',
        goal_progress: '把选择推给丙。',
        stakes: '被甲拦住。',
      };
    }
    return {
      thought: '先看他们的手。',
      category: '观察',
      summary: '退后观察两人的动作',
      deed: '丙向后退半步，把门口留在自己的视线里。',
      effect: '保留退路。',
      hostile: false,
      ability: 'perception',
      trait: null,
      target_id: null,
      dialogue: '',
      goal_progress: '保留退路。',
      stakes: '失去先机。',
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
      external_events: [
        {
          description: '测试中的外部天气',
          likelihood: 'routine',
          fact: 'EXTERNAL_EVENT_FACT',
          reason: '测试独立事件',
        },
      ],
      fairness_note: '测试。',
    };
  }
  if (label.includes(':reaction:')) {
    if (label.includes(':b:')) {
      return {
        thought: '两件事我都要做。',
        continue_original: true,
        stance: '硬扛',
        summary: '顶着甲拆信',
        description: '乙用肩膀顶开甲的手，继续去摸封蜡。',
        ability: 'will',
        trait: null,
        dialogue: '我还没说完。',
      };
    }
    return {
      thought: '不值得冒这个险。',
      continue_original: false,
      stance: '退让',
      summary: '收回手，让到门边',
      description: '丙放弃观察，退到门边观察乙的动作。',
      ability: 'agility',
      trait: null,
      dialogue: '你们继续。',
    };
  }
  if (label.startsWith('gm:resolution')) {
    return {
      narration: '甲把信按在桌上，乙却顶着甲的手去拆封蜡。丙放弃了原本的观察，退到门边。雨声压低了每个人的呼吸，封蜡裂开，里面不是信纸，而是一小截黑色的灯芯。',
      outcome_notes: [
        { character_id: 'a', note: '甲的手按住了信，但没有阻止乙。' },
        { character_id: 'b', note: '乙看见了灯芯。' },
        { character_id: 'c', note: '丙保留了退路。' },
      ],
      state_changes: {
        characters: [
          {
            character_id: 'a',
            stress_delta: 1,
            conditions_add: [
              { name: '被架住', description: '甲的主动权被削弱。', modifier: -1, kind: 'emotion', abilities: ['will'] },
            ],
            conditions_remove: [],
            inventory_add: [],
            inventory_remove: [],
            private_note: '甲认出这截灯芯的纹路。',
            memory: { summary: '信里不是纸，是灯芯。', importance: 4 },
          },
          {
            character_id: 'b',
            stress_delta: 0,
            conditions_add: [],
            conditions_remove: [],
            inventory_add: ['黑色灯芯'],
            inventory_remove: [],
            private_note: '',
            memory: { summary: '我拆开了信。', importance: 3 },
          },
          {
            character_id: 'c',
            stress_delta: 0,
            conditions_add: [],
            conditions_remove: [],
            inventory_add: [],
            inventory_remove: [],
            private_note: '',
            memory: { summary: '他们都没看门口。', importance: 2 },
          },
        ],
        world: {
          public_facts_add: ['信封里装的是一截黑色灯芯。'],
          public_facts_remove: [],
          flags_set: { letter_opened: true },
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
  throw new Error(`FakeModel 未识别标签：${label}`);
}

test('编排：一整个时刻从取景到落定，回应与放下规则生效', async () => {
  const run = createRun(scenario(), { seed: 'engine-test-seed', maxBeats: 3, thinking: 'disabled' });
  const fake = new FakeModel();
  const engine = new RunEngine(run, fake);
  const result = await engine.advanceOne();

  assert.equal(result.status, 'ready');
  assert.equal(result.beats.length, 1);
  const beat = result.beats[0]!;
  assert.equal(beat.phase, 'complete');
  assert.equal(beat.title, '信与灯');
  assert.equal(beat.actions.length, 3);
  assert.equal(beat.reactions.length, 2);
  assert.equal(beat.adjudications.length, 3);
  assert.equal(beat.privateCues.length, 3);
  assert.equal(beat.externalEvents?.length, 1);
  const external = beat.externalEvents![0]!;
  assert.equal(external.likelihood, 'routine');
  assert.equal(external.dc, 8);
  assert.ok(external.natural >= 1 && external.natural <= 20);
  assert.equal(
    result.world.publicFacts.includes('EXTERNAL_EVENT_FACT'),
    external.success,
    '只有外部事件检定成功时，fact 才进入公开事实',
  );

  const actionA = beat.actions.find((action) => action.characterId === 'a')!;
  const actionB = beat.actions.find((action) => action.characterId === 'b')!;
  const actionC = beat.actions.find((action) => action.characterId === 'c')!;
  assert.equal(actionA.targetId, 'b');
  assert.ok(actionA.roll);
  assert.equal(actionA.roll.traitName, '甲的专长');
  assert.equal(actionB.penalties, -2, '继续原行动的乙，其行动应吃多任务罚');
  assert.equal(actionC.status, 'abandoned');
  assert.equal(actionC.roll, undefined);

  const reactionB = beat.reactions.find((reaction) => reaction.characterId === 'b')!;
  const reactionC = beat.reactions.find((reaction) => reaction.characterId === 'c')!;
  assert.equal(reactionB.continueOriginal, true);
  assert.ok(reactionB.roll);
  assert.equal(reactionB.roll.penalty, -2);
  assert.equal(reactionC.continueOriginal, false);
  assert.equal(reactionC.roll?.penalty, 0);

  const changeB = beat.stateChanges!.characters.find((change) => change.characterId === 'b')!;
  assert.deepEqual(changeB.inventoryAdd, ['黑色灯芯']);
  assert.equal(result.characters.b!.inventory.includes('黑色灯芯'), true);
  assert.equal(result.characters.a!.stress, 1);
  assert.equal(result.characters.a!.conditions[0]!.name, '被架住');
  assert.equal(result.characters.a!.memories.length, 2);
  assert.equal(result.world.publicFacts.includes('信封里装的是一截黑色灯芯。'), true);
  assert.equal(result.world.flags.letter_opened, true);
  assert.equal(beat.nextTimeJump!.elapsedMinutes, 7);
  assert.equal(result.llm.calls, 8);
  assert.equal(result.llm.totalTokens, 120);

  // The next beat must be opened after the event-driven jump.
  const nextEngine = new RunEngine(result, fake);
  await nextEngine.advanceOne();
  assert.equal(result.beats.length, 2);
  assert.equal(result.beats[1]!.clock.display, '22:07');
});

test('编排：被动角色不宣告举动，也不进入回应回合', async () => {
  const input = scenario();
  input.characters[2]!.passive = true;
  const run = createRun(input, { seed: 'passive-seed', maxBeats: 3, thinking: 'disabled' });
  const fake = new FakeModel();
  const engine = new RunEngine(run, fake);
  const result = await engine.advanceOne();
  const beat = result.beats[0]!;

  assert.equal(beat.actions.length, 2);
  assert.equal(beat.actions.some((action) => action.characterId === 'c'), false);
  assert.equal(beat.reactions.some((reaction) => reaction.characterId === 'c'), false);
  assert.equal(fake.calls.some((call) => call.label === 'actor:action:c:b1'), false);
  assert.equal(fake.calls.some((call) => call.label === 'actor:reaction:c:b1'), false);
  assert.equal(beat.reactions.length, 1);
  assert.equal(beat.reactions[0]!.characterId, 'b');
});

test('信息隔离：角色举动提示词不包含导演真相或其他人的秘密', async () => {
  const run = createRun(scenario(), { seed: 'isolation-seed', maxBeats: 3, thinking: 'disabled' });
  const fake = new FakeModel();
  const engine = new RunEngine(run, fake);
  await engine.advanceOne();

  const opening = fake.calls.find((call) => call.label === 'gm:opening:b1')!;
  assert.ok(opening.user.includes('HIDDEN_CANON_MARKER'));

  const actionA = fake.calls.find((call) => call.label === 'actor:action:a:b1')!;
  assert.ok(actionA.user.includes('A_SECRET_MARKER'));
  assert.equal(actionA.user.includes('B_SECRET_MARKER'), false);
  assert.equal(actionA.user.includes('C_SECRET_MARKER'), false);
  assert.equal(actionA.user.includes('HIDDEN_CANON_MARKER'), false);

  const reactionB = fake.calls.find((call) => call.label === 'actor:reaction:b:b1')!;
  assert.ok(reactionB.user.includes('B_SECRET_MARKER'));
  assert.equal(reactionB.user.includes('A_SECRET_MARKER'), false);
  assert.equal(reactionB.user.includes('我必须先拿到它。'), false, '回应提示词不应泄露举动者内心');
  assert.ok(reactionB.user.includes('别动。'), '可被感知的台词应当可见');

  const resolution = fake.calls.find((call) => call.label === 'gm:resolution:b1')!;
  assert.equal(resolution.user.includes('HIDDEN_CANON_MARKER'), false, '公开叙事者不应拿到导演真相');
  assert.equal(resolution.user.includes('A_SECRET_MARKER'), false, '公开叙事者不应拿到角色秘密');
  assert.equal(resolution.user.includes('B_SECRET_MARKER'), false);
  assert.equal(resolution.user.includes('我必须先拿到它。'), false, '公开叙事者不应拿到角色内心');
  assert.equal(resolution.user.includes('甲看见封蜡的颜色'), false, '私密线索不应进入公开叙事');
  assert.equal(resolution.user.includes('测试导演注。'), false, '导演幕后注不应进入公开叙事');
  assert.ok(resolution.user.includes('别动。'), '已声明的台词仍然是公开材料');
  assert.ok(resolution.user.includes('把信按在桌上'), '已声明的行动仍然是公开材料');

  const adjudication = fake.calls.find((call) => call.label === 'gm:adjudication:b1')!;
  assert.ok(adjudication.user.includes('HIDDEN_CANON_MARKER'), '裁定者需要完整世界上下文');
});
