import assert from 'node:assert/strict';
import test from 'node:test';
import type { Beat, Run, Scenario } from '../src/types.ts';
import type { JsonCallOptions, JsonCallResult, LanguageModel } from '../src/llm/client.ts';
import { createRun } from '../src/engine/run.ts';
import { ProseWorkflow } from '../src/prose/workflow.ts';
import { buildDraftPrompt, parseProseDraft, parseProseOutline } from '../src/prose/prompts.ts';

function scenario(): Scenario {
  const character = (id: string, name: string, secret: string) => ({
    id,
    name,
    title: `${name}的身份`,
    publicProfile: `${name}的公开资料`,
    personality: `${name}性格内向。`,
    desire: `${name}想留下。`,
    fear: `${name}害怕被抛下。`,
    secret,
    abilities: { physique: 5, agility: 5, perception: 6, intellect: 6, will: 6, presence: 5 },
    traits: [],
    possessions: [],
    relationships: [],
    memories: [{ summary: `${name}的旧事`, importance: 3 }],
    conditions: [],
  });
  return {
    id: 'prose-scene',
    title: '测试小说',
    subtitle: '一句副标题',
    kicker: '测试',
    world: {
      title: '测试小说',
      era: '当代',
      tone: '克制',
      setting: '一间有窗的屋子。',
      location: '屋内',
      dateLabel: '今夜',
      startClock: '22:00',
      premise: '两个人在等一个电话',
      opening: '灯亮着。',
      directorNotes: '',
      initialFacts: ['灯亮着'],
    },
    characters: [character('a', '甲', 'A_SECRET_MARKER'), character('b', '乙', 'B_SECRET_MARKER')],
    rules: { maxBeats: 3 },
  };
}

function completedBeat(run: Run): Beat {
  return {
    id: 'beat-1',
    index: 0,
    title: '电话响之前',
    phase: 'complete',
    clock: run.clock,
    timeJump: null,
    publicBrief: '甲坐在窗边，乙站在门口。电话还没有响。',
    privateCues: [
      { characterId: 'a', cue: '甲听见楼道里有脚步。' },
      { characterId: 'b', cue: '乙看见桌上有一张旧照片。' },
    ],
    pressure: '电话随时会响。',
    sceneQuestion: '谁会先接？',
    gmNote: '导演注',
    actions: [
      {
        id: 'act-a',
        characterId: 'a',
        category: '交涉',
        summary: '让乙坐下',
        deed: '甲拍了拍身边的椅子。',
        effect: '乙愿意坐下来。',
        hostile: false,
        description: '甲拍了拍身边的椅子。',
        dialogue: '坐一会儿吧。',
        thought: 'A_THOUGHT_MARKER',
        goalProgress: '让乙留下',
        stakes: '乙还是走了',
        ability: 'presence',
        traitName: null,
        targetId: 'b',
        status: 'resolved',
        outcome: 'success',
        penalties: 0,
        penaltyNotes: [],
        createdAt: new Date(0).toISOString(),
      },
      {
        id: 'act-b',
        characterId: 'b',
        category: '观察',
        summary: '看窗外',
        deed: '乙没有坐下，转头看窗外。',
        effect: '确认楼下有没有车。',
        hostile: false,
        description: '乙没有坐下，转头看窗外。',
        dialogue: '',
        thought: 'B_THOUGHT_MARKER',
        goalProgress: '确认退路',
        stakes: '错过电话',
        ability: 'perception',
        traitName: null,
        targetId: null,
        status: 'resolved',
        outcome: 'soft_failure',
        penalties: 0,
        penaltyNotes: [],
        createdAt: new Date(0).toISOString(),
      },
    ],
    adjudications: [
      { actionId: 'act-a', difficultyLabel: '标准', dc: 12, modifier: 0, reason: '旧关系', risk: '乙不坐' },
      { actionId: 'act-b', difficultyLabel: '标准', dc: 10, modifier: 0, reason: '窗外很暗', risk: '看不清' },
    ],
    reactions: [
      {
        id: 'rxn-b',
        characterId: 'b',
        incomingActionIds: ['act-a'],
        continueOriginal: false,
        summary: 'B_RESPONSE_SUMMARY',
        description: '乙侧过身，避开那只手。',
        dialogue: '',
        thought: 'B_RESPONSE_THOUGHT',
        ability: 'agility',
        traitName: null,
        stance: '避开',
        createdAt: new Date(0).toISOString(),
      },
    ],
    narration: '甲拍了拍椅子，乙没有坐。',
    outcomeNotes: [],
    stateChanges: {
      characters: [
        {
          characterId: 'a',
          stressDelta: 1,
          conditionsAdd: [
            { name: '话没落地', description: '乙没有回应', modifier: -2, kind: 'emotion', visibility: 'private' },
          ],
          conditionsRemove: [],
          inventoryAdd: [],
          inventoryRemove: [],
          privateNote: 'A_PRIVATE_NOTE_MARKER',
          memory: { summary: '乙没有坐下。', importance: 3 },
        },
        {
          characterId: 'b',
          stressDelta: 0,
          conditionsAdd: [],
          conditionsRemove: [],
          inventoryAdd: [],
          inventoryRemove: [],
          privateNote: 'B_PRIVATE_NOTE_MARKER',
          memory: { summary: '窗外没有车。', importance: 2 },
        },
      ],
      world: {
        factsAdd: ['电话还没有响。'],
        factsRemove: [],
        flagsSet: {},
        pressure: '电话随时会响。',
        sceneTitle: '电话响之前',
      },
    },
    nextTimeJump: { elapsedMinutes: 5, label: '五分钟后', reason: '两个人坐着没动。' },
    ending: null,
    createdAt: new Date(0).toISOString(),
    completedAt: new Date(0).toISOString(),
  };
}

class FakeProseModel implements LanguageModel {
  readonly model = 'fake-prose';
  calls: Array<{ label: string; user: string }> = [];

  async callJson<T>(options: JsonCallOptions<T>): Promise<JsonCallResult<T>> {
    this.calls.push({ label: options.label, user: options.user });
    const payload =
      options.label === 'prose:outline'
        ? {
            title: '电话响之前',
            ending_beat_index: 0,
            ending_reason: '椅子已经问过，乙没有坐；再写只会重复。',
            scenes: [
              {
                beat_index: 0,
                title: '椅子',
                summary: '甲让乙坐下，乙没有坐。',
                pov: '甲',
                key_images: ['椅子', '窗'],
                turn: '乙没有回应',
              },
            ],
            ending: '两个人等电话。',
          }
        : {
            title: '电话响之前',
            body: '甲拍了拍身边的椅子。乙没有坐下。\\n\\n电话还没有响。',
            final_image: '窗外没有车。',
          };
    return {
      data: options.validate(payload),
      content: JSON.stringify(payload),
      reasoning: '',
      usage: {
        calls: 1,
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 0,
        totalTokens: 150,
        failures: 0,
      },
      latencyMs: 1,
      thinking: false,
    };
  }
}

test('正文工作流：POV 只看到自己的秘密与内心', () => {
  const run = createRun(scenario(), { seed: 'prose-seed', maxBeats: 3, thinking: 'disabled' });
  run.beats.push(completedBeat(run));
  const { user } = buildDraftPrompt(run, { pov: 'a', person: 'first', style: '克制' });
  assert.ok(user.includes('A_SECRET_MARKER'));
  assert.ok(user.includes('A_THOUGHT_MARKER'));
  assert.ok(user.includes('A_PRIVATE_NOTE_MARKER'));
  assert.ok(user.includes('甲听见楼道里有脚步'));
  assert.equal(user.includes('B_SECRET_MARKER'), false);
  assert.equal(user.includes('B_THOUGHT_MARKER'), false);
  assert.equal(user.includes('B_RESPONSE_SUMMARY'), false);
  assert.equal(user.includes('B_RESPONSE_THOUGHT'), false);
  assert.ok(user.includes('乙侧过身，避开那只手。'));
  assert.equal(user.includes('确认楼下有没有车'), false, '他人想要的效果是私密的');
  assert.equal(user.includes('B_PRIVATE_NOTE_MARKER'), false);
  assert.ok(user.includes('甲拍了拍身边的椅子'), '乙能看见甲的 deed');
  assert.ok(user.includes('坐一会儿吧。'), '乙能听见甲的台词');
});

test('正文工作流：大纲 → 正文，保留标题与最后画面', async () => {
  const run = createRun(scenario(), { seed: 'prose-seed-2', maxBeats: 3, thinking: 'disabled' });
  run.beats.push(completedBeat(run));
  const fake = new FakeProseModel();
  const workflow = new ProseWorkflow(run, fake);
  const result = await workflow.generate({ pov: 'a', person: 'first' });
  assert.equal(result.outline.title, '电话响之前');
  assert.equal(result.outline.endingBeatIndex, 0);
  assert.ok(result.outline.endingReason.includes('椅子'));
  assert.equal(result.draft.title, '电话响之前');
  assert.ok(result.markdown.includes('甲拍了拍身边的椅子'));
  assert.ok(result.markdown.includes('窗外没有车。'));
  assert.equal(result.usage.calls, 2);
  assert.equal(result.usage.totalTokens, 300);
  assert.deepEqual(fake.calls.map((call) => call.label), ['prose:outline', 'prose:draft']);
});

test('正文工作流：只使用大纲选中的结束点之前的材料', () => {
  const run = createRun(scenario(), { seed: 'prose-seed-3', maxBeats: 3, thinking: 'disabled' });
  const first = completedBeat(run);
  run.beats.push(first);
  const second = completedBeat(run);
  second.id = 'beat-2';
  second.index = 1;
  second.title = '第二刻';
  second.actions = second.actions.map((action) => ({
    ...action,
    id: `${action.id}-2`,
    deed: 'SECOND_BEAT_DEED',
    description: 'SECOND_BEAT_DEED',
  }));
  run.beats.push(second);

  const prompt = buildDraftPrompt(run, { pov: 'a' }, {
    title: '电话响之前',
    endingBeatIndex: 0,
    endingReason: '第一刻已经回答了问题。',
    scenes: [],
    ending: '',
  });
  assert.ok(prompt.user.includes('甲拍了拍身边的椅子'));
  assert.ok(prompt.user.includes('【已选结束点】第 1 刻'));
  assert.equal(prompt.user.includes('SECOND_BEAT_DEED'), false, '后面的时刻不应进入正文材料');
});

test('正文工作流：结构校验', () => {
  assert.throws(() => parseProseOutline({ title: 'x', scenes: [] }), /至少需要一个场景/);
  assert.deepEqual(
    parseProseDraft({ title: 'x', body: '正文', final_image: '画面' }),
    { title: 'x', body: '正文', finalImage: '画面' },
  );
});
