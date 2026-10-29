import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ActionRecord,
  AbilityKey,
  CharacterDefinition,
  CharacterRuntime,
  ReactionRecord,
} from '../src/types.ts';
import { resolveChecks, tierFor, MULTITASK_PENALTY } from '../src/rules/checks.ts';
import { seededD20 } from '../src/utils.ts';

const abilities: Record<AbilityKey, number> = {
  physique: 5,
  agility: 6,
  perception: 7,
  intellect: 8,
  will: 4,
  presence: 5,
};

function character(id: string, overrides?: Partial<CharacterDefinition>): CharacterDefinition {
  return {
    id,
    name: id,
    title: '测试角色',
    publicProfile: '',
    personality: '',
    desire: '',
    fear: '',
    secret: '',
    abilities: { ...abilities },
    traits: [
      { name: '擅长观察', description: '', bonus: 2, ability: 'perception' },
      { name: '巧手', description: '', bonus: 1, ability: 'agility' },
    ],
    possessions: [],
    relationships: [],
    memories: [],
    conditions: [],
    ...overrides,
  };
}

function runtime(id: string, conditions: CharacterRuntime['conditions'] = []): CharacterRuntime {
  return { id, conditions, stress: 0, memories: [], inventory: [], flags: {} };
}

function action(overrides: Partial<ActionRecord> & { id: string; characterId: string }): ActionRecord {
  return {
    category: '调查',
    summary: '行动',
    description: '做一件事',
    dialogue: '',
    thought: '',
    goalProgress: '',
    stakes: '',
    ability: 'perception',
    traitName: null,
    targetId: null,
    status: 'declared',
    penalties: 0,
    penaltyNotes: [],
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function reaction(overrides: Partial<ReactionRecord> & { characterId: string }): ReactionRecord {
  return {
    id: `rxn-${overrides.characterId}`,
    incomingActionIds: [],
    continueOriginal: false,
    summary: '避开',
    description: '侧身躲开',
    dialogue: '',
    thought: '',
    ability: 'agility',
    traitName: '巧手',
    stance: '闪避',
    createdAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function setup() {
  const defs = {
    a: character('a'),
    b: character('b'),
    c: character('c'),
  };
  const chars = {
    a: { definition: defs.a, runtime: runtime('a') },
    b: { definition: defs.b, runtime: runtime('b') },
    c: { definition: defs.c, runtime: runtime('c') },
  };
  return { chars };
}

test('规则：同一 seed 与标签产生同一骰点，不同标签独立', () => {
  const first = seededD20('seed', 'action:0:a');
  const second = seededD20('seed', 'action:0:a');
  const other = seededD20('seed', 'action:0:b');
  assert.equal(first, second);
  assert.ok(first >= 1 && first <= 20);
  assert.ok(other >= 1 && other <= 20);
  assert.notEqual(`seed:${first}`, `seed2:${second}`);
});

test('规则：结果分为意外奏效/落地/落空，自然 20 自动奏效', () => {
  assert.equal(tierFor(20, 15, 17).tier, 'success');
  assert.equal(tierFor(25, 15, 10).tier, 'critical_success');
  assert.equal(tierFor(24, 15, 10).tier, 'success');
  assert.equal(tierFor(14, 15, 10).tier, 'soft_failure');
  assert.equal(tierFor(10, 25, 20).tier, 'critical_success');
  assert.equal(tierFor(10, 25, 20).criticalByNatural20, true);
});

test('规则：非对抗行动使用 DC、特质、状态与裁定修正', () => {
  const { chars } = setup();
  chars.a.runtime.conditions = [
    {
      id: 'cond',
      name: '手臂受伤',
      description: '',
      modifier: -2,
      kind: 'injury',
      abilities: ['agility'],
    },
  ];
  const result = resolveChecks({
    seed: 'fixed-seed',
    beatIndex: 0,
    characters: chars,
    actions: [
      action({
        id: 'a1',
        characterId: 'a',
        ability: 'perception',
        traitName: '擅长观察',
      }),
      action({
        id: 'a2',
        characterId: 'a',
        ability: 'agility',
        traitName: '巧手',
      }),
    ],
    reactions: [],
    adjudications: [
      {
        actionId: 'a1',
        difficultyLabel: '标准',
        dc: 15,
        modifier: 1,
        reason: '位置好',
        risk: '被发现',
      },
      {
        actionId: 'a2',
        difficultyLabel: '标准',
        dc: 15,
        modifier: 0,
        reason: '无明显利弊',
        risk: '滑倒',
      },
    ],
  });
  const [perception, agility] = result.actions;
  assert.equal(perception!.roll!.traitBonus, 2);
  assert.equal(perception!.roll!.situationalBonus, 1);
  assert.equal(perception!.roll!.margin, perception!.roll!.total - 15);
  assert.equal(agility!.roll!.traitBonus, 1);
  assert.equal(agility!.roll!.conditionBonus, -2);
});

test('规则：目标继续原举动时，原举动与回应各吃 -2；举动者不受罚', () => {
  const { chars } = setup();
  const actionA = action({
    id: 'a1',
    characterId: 'a',
    targetId: 'b',
    ability: 'perception',
    traitName: null,
  });
  const actionB = action({
    id: 'b1',
    characterId: 'b',
    targetId: 'c',
    ability: 'perception',
    traitName: null,
  });
  const result = resolveChecks({
    seed: 'seed-continue',
    beatIndex: 0,
    characters: chars,
    actions: [actionA, actionB],
    reactions: [
      reaction({ characterId: 'b', continueOriginal: true, ability: 'agility', traitName: '巧手' }),
      reaction({ characterId: 'c', continueOriginal: false, ability: 'agility', traitName: null }),
    ],
    adjudications: [
      { actionId: 'a1', difficultyLabel: '标准', dc: 15, modifier: 0, reason: '', risk: '' },
      { actionId: 'b1', difficultyLabel: '标准', dc: 15, modifier: 0, reason: '', risk: '' },
    ],
  });
  const a = result.actions.find((entry) => entry.id === 'a1')!;
  const b = result.actions.find((entry) => entry.id === 'b1')!;
  const bReaction = result.reactions.find((entry) => entry.characterId === 'b')!;
  assert.equal(result.reactions.find((entry) => entry.characterId === 'c')!.continueOriginal, false);
  assert.equal(a.penalties, 0, '行动者 A 不应因为目标分心而受罚');
  assert.equal(b.penalties, MULTITASK_PENALTY);
  assert.equal(bReaction.roll!.penalty, MULTITASK_PENALTY);
  assert.ok(bReaction.roll!.penaltyNotes.some((note) => note.includes('分心兼顾')));
  assert.equal(b.status, 'resolved');
  assert.equal(b.roll!.opponentTotal, result.reactions.find((entry) => entry.characterId === 'c')!.roll!.total);
});

test('规则：目标放下原举动后原举动取消且回应不受分心惩罚', () => {
  const { chars } = setup();
  const actionA = action({ id: 'a1', characterId: 'a', targetId: 'b' });
  const actionB = action({ id: 'b1', characterId: 'b', targetId: 'c' });
  const result = resolveChecks({
    seed: 'seed-abandon',
    beatIndex: 0,
    characters: chars,
    actions: [actionA, actionB],
    reactions: [
      reaction({ characterId: 'b', continueOriginal: false }),
      reaction({ characterId: 'c', continueOriginal: false }),
    ],
    adjudications: [
      { actionId: 'a1', difficultyLabel: '标准', dc: 15, modifier: 0, reason: '', risk: '' },
      { actionId: 'b1', difficultyLabel: '标准', dc: 15, modifier: 0, reason: '', risk: '' },
    ],
  });
  const a = result.actions.find((entry) => entry.id === 'a1')!;
  const b = result.actions.find((entry) => entry.id === 'b1')!;
  const bReaction = result.reactions.find((entry) => entry.characterId === 'b')!;
  assert.equal(b.status, 'abandoned');
  assert.equal(b.roll, undefined);
  assert.equal(bReaction.roll!.penalty, 0);
  assert.equal(a.penalties, 0);
  assert.equal(a.roll!.opponentTotal, bReaction.roll!.total);
});

test('规则：一个回应面对多名施压者时只掷一次，并承受施压惩罚', () => {
  const { chars } = setup();
  const incoming = [
    action({ id: 'a1', characterId: 'a', targetId: 'c' }),
    action({ id: 'b1', characterId: 'b', targetId: 'c' }),
  ];
  const result = resolveChecks({
    seed: 'seed-crowd',
    beatIndex: 1,
    characters: chars,
    actions: incoming,
    reactions: [reaction({ characterId: 'c', continueOriginal: false })],
    adjudications: [
      { actionId: 'a1', difficultyLabel: '标准', dc: 15, modifier: 0, reason: '', risk: '' },
      { actionId: 'b1', difficultyLabel: '标准', dc: 15, modifier: 0, reason: '', risk: '' },
    ],
  });
  const cReaction = result.reactions[0]!;
  assert.equal(result.reactions.length, 1);
  assert.equal(cReaction.roll!.penalty, -1);
  assert.ok(cReaction.roll!.penaltyNotes.some((note) => note.includes('同时承受')));
  const totals = result.actions.map((entry) => entry.roll!.opponentTotal);
  assert.equal(totals[0], cReaction.roll!.total);
  assert.equal(totals[1], cReaction.roll!.total);
  assert.equal(cReaction.roll!.incomingTotals!['a1']! > 0, true);
});

test('规则：非敌意指向不进入回应，effect 直接对 DC 结算', () => {
  const { chars } = setup();
  const result = resolveChecks({
    seed: 'seed-nonhostile',
    beatIndex: 0,
    characters: chars,
    actions: [
      action({
        id: 'a1',
        characterId: 'a',
        targetId: 'b',
        hostile: false,
        ability: 'presence',
      }),
    ],
    reactions: [],
    adjudications: [
      { actionId: 'a1', difficultyLabel: '标准', dc: 13, modifier: 0, reason: '坦白', risk: '没被接住' },
    ],
  });
  assert.equal(result.reactions.length, 0);
  assert.equal(result.actions[0]!.roll!.dc, 13);
  assert.equal(result.actions[0]!.roll!.opponentTotal, null);
});

test('规则：目标在回应别的敌意时，非敌意指向仍对 DC 结算', () => {
  const { chars } = setup();
  const result = resolveChecks({
    seed: 'seed-mixed-targets',
    beatIndex: 0,
    characters: chars,
    actions: [
      action({ id: 'hostile', characterId: 'a', targetId: 'b', hostile: true, ability: 'physique' }),
      action({ id: 'nonhostile', characterId: 'c', targetId: 'b', hostile: false, ability: 'presence' }),
    ],
    reactions: [
      reaction({ characterId: 'b', continueOriginal: false, ability: 'will', traitName: null }),
    ],
    adjudications: [
      { actionId: 'hostile', difficultyLabel: '标准', dc: 15, modifier: 0, reason: '敌意', risk: '被挡回' },
      { actionId: 'nonhostile', difficultyLabel: '容易', dc: 12, modifier: 0, reason: '非敌意', risk: '没被接住' },
    ],
  });
  const nonhostile = result.actions.find((entry) => entry.id === 'nonhostile')!;
  assert.equal(nonhostile.roll!.dc, 12);
  assert.equal(nonhostile.roll!.opponentTotal, null);
  const hostile = result.actions.find((entry) => entry.id === 'hostile')!;
  const reactionRoll = result.reactions.find((entry) => entry.characterId === 'b')!.roll!;
  assert.equal(hostile.roll!.opponentTotal, reactionRoll.total);
  assert.deepEqual(Object.keys(reactionRoll.incomingTotals!), ['hostile']);
});

test('规则：无裁定时按 DC 15 兜底，而不是自动成功', () => {
  const { chars } = setup();
  const result = resolveChecks({
    seed: 'fallback',
    beatIndex: 0,
    characters: chars,
    actions: [action({ id: 'solo', characterId: 'a' })],
    reactions: [],
    adjudications: [],
  });
  assert.equal(result.actions[0]!.roll!.dc, 15);
  assert.ok(result.actions[0]!.outcomeNote?.includes('标准难度'));
});
