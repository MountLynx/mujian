import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getPresetScenario,
  normalizeScenario,
  ScenarioValidationError,
} from '../src/engine/scenario.ts';
import { parseClock, clockAfter } from '../src/utils.ts';
import { createRun, deadlineForRun, hasDelayFact } from '../src/engine/run.ts';

test('场景：雾港预置剧本完整且可载入', async () => {
  const scenario = await getPresetScenario('fog-harbor');
  assert.ok(scenario);
  assert.equal(scenario.characters.length, 4);
  assert.equal(scenario.isPreset, true);
  assert.ok(scenario.world.hiddenCanon?.includes('长明号'));
  for (const character of scenario.characters) {
    assert.ok(character.personality.length > 20);
    assert.ok(character.desire.length > 10);
    assert.ok(character.fear.length > 10);
    assert.ok(character.secret.length > 20);
    assert.ok(character.memories.length >= 4);
    assert.ok(character.traits.length >= 3);
    for (const value of Object.values(character.abilities)) {
      assert.ok(value >= 1 && value <= 10);
    }
    for (const relationship of character.relationships) {
      assert.ok(scenario.characters.some((entry) => entry.id === relationship.targetId));
    }
  }
});

test('场景：自定义手稿会被归一化，重复 id 得到修复', () => {
  const scenario = normalizeScenario({
    title: '测试公馆',
    characters: [
      {
        id: 'same',
        name: '甲',
        personality: '谨慎',
        desire: '离开',
        fear: '被困',
        abilities: { physique: 99, agility: -3 },
      },
      {
        id: 'same',
        name: '乙',
        personality: '冲动',
        desire: '真相',
        fear: '失去',
        traits: ['赌徒', { name: '夜眼', bonus: 9, ability: 'perception' }],
        memories: ['一个测试记忆'],
      },
    ],
    world: {
      setting: '一栋房子',
      location: '会客厅',
      premise: '有人失踪',
      opening: '门开了。',
      startClock: '21:15',
      initialFacts: ['门开着'],
    },
  });
  assert.ok(scenario.id.startsWith('scenario-'), '自动化 id 应存在');
  assert.notEqual(scenario.characters[0]!.id, scenario.characters[1]!.id);
  assert.equal(scenario.characters[0]!.abilities.physique, 10);
  assert.equal(scenario.characters[0]!.abilities.agility, 1);
  assert.equal(scenario.characters[1]!.traits[1]!.bonus, 4);
  assert.equal(scenario.characters[1]!.memories[0]!.summary, '一个测试记忆');
  assert.equal(scenario.rules.maxBeats, 5);
});

test('场景：日轻与网文实验手稿可载入', async () => {
  for (const id of ['genre-light-novel', 'genre-web-novel', 'genre-vigil']) {
    const scenario = await getPresetScenario(id);
    assert.ok(scenario, `${id} 应该存在`);
    assert.equal(scenario.rules.maxBeats, 4);
    assert.ok(scenario.characters.length >= 2);
    if (id === 'genre-vigil') assert.equal(scenario.characters.filter((character) => character.passive).length, 1);
  }
});

test('场景：被动角色与状态可见性会被归一化', () => {
  const base = {
    title: '被动测试',
    world: {
      setting: '一间屋子',
      location: '屋内',
      premise: '两个人坐着',
      opening: '灯亮着。',
    },
    characters: [
      { name: '甲', personality: '安静', desire: '留下', fear: '被赶走' },
      {
        name: '乙',
        personality: '昏睡',
        desire: '醒来',
        fear: '被留下',
        passive: true,
        conditions: [
          { name: '疲惫', description: '没有力气', modifier: -2, kind: 'emotion' },
          { name: '手受伤', description: '缠着绷带', modifier: -2, kind: 'injury' },
        ],
      },
    ],
  };
  const scenario = normalizeScenario(base);
  assert.equal(scenario.characters[1]!.passive, true);
  assert.equal(scenario.characters[1]!.conditions![0]!.visibility, 'private');
  assert.equal(scenario.characters[1]!.conditions![1]!.visibility, 'public');

  assert.throws(
    () =>
      normalizeScenario({
        ...base,
        characters: base.characters.map((character) => ({ ...character, passive: true })),
      }),
    (error) =>
      error instanceof ScenarioValidationError &&
      error.issues.some((issue) => issue.includes('主动角色')),
  );
});

test('场景：世界期限可以写成结构化时钟，并保留公开的到期事实', () => {
  const base = {
    title: '期限测试',
    world: {
      setting: '码头',
      location: '跳板',
      premise: '最后一班船要开了',
      opening: '雾很大。',
      countdown: '23:55 末班船开',
      deadlineClock: '23:55',
      deadlineFact: '末班船已经离岸。',
    },
    characters: [
      { name: '甲', personality: '安静', desire: '上船', fear: '错过' },
      { name: '乙', personality: '急躁', desire: '留下', fear: '被抛下' },
    ],
  };
  const scenario = normalizeScenario(base);
  assert.equal(scenario.world.deadlineClock, '23:55');
  assert.equal(scenario.world.deadlineFact, '末班船已经离岸。');
  const invalid = normalizeScenario({ ...base, world: { ...base.world, deadlineClock: '25:90' } });
  assert.equal(invalid.world.deadlineClock, undefined);
});

test('场景：缺少必填内容时给出可读错误', () => {
  assert.throws(
    () => normalizeScenario({ title: '空的' }),
    (error) => error instanceof ScenarioValidationError && error.issues.some((issue) => issue.includes('角色')),
  );
});

test('时钟：结构化期限只关闭选项，延迟必须成为新的公开事实', async () => {
  const scenario = await getPresetScenario('test-convergence-ferry');
  assert.ok(scenario);
  const run = createRun(scenario, { seed: 'deadline-test', maxBeats: 6, thinking: 'disabled' });
  const deadline = deadlineForRun(run);
  assert.equal(deadline?.clock, '23:55');
  assert.equal(deadline?.absoluteMinutes, 23 * 60 + 55);
  assert.equal(deadline?.fact, '末班渡轮在 23:55 离岸；渡口关闭到明早。');
  assert.equal(hasDelayFact(run), false);

  run.world.publicFacts.push('雾太大，末班渡轮晚点。');
  assert.equal(hasDelayFact(run), true);
});

test('时钟：起点与事件跳跃能跨午夜', () => {
  assert.equal(parseClock('22:40'), 22 * 60 + 40);
  assert.equal(parseClock('bad'), 22 * 60);
  const next = clockAfter(22 * 60 + 40, 90);
  assert.equal(next.display, '00:10 · 次日');
  assert.equal(next.minutes, 24 * 60 + 10);
});
