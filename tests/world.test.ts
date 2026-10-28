import assert from 'node:assert/strict';
import test from 'node:test';
import { getWorldPreset } from '../src/world/definition.ts';
import { createWorldRun } from '../src/world/run.ts';
import { WorldEngine } from '../src/world/engine.ts';
import { buildWorldScene } from '../src/world/scene.ts';
import { parseWorldEpochDraft } from '../src/llm/worldParsers.ts';
import type { JsonCallOptions as CallOptions, JsonCallResult, LanguageModel } from '../src/llm/client.ts';

const firstDraft = {
  advance_minutes: 120,
  advance_reason: '白塔钟声、铁湾升火与灯塔异变同时传到各自的岸上，世界在子夜跨过了第一道门槛。',
  epoch_title: '潮汐镜同时亮起',
  world_summary:
    '白塔宣布归潮进入仪式期；铁湾舰队在夜色中离港；雾港旧码头收到一口刻着长明号名字的铜钟。三座城各自以为自己在处理不同的事。',
  events: [
    {
      local_id: 'e0',
      parent_local_id: null,
      title: '三塔镜誓',
      region_id: null,
      actor_ids: [],
      faction_ids: ['tide_council'],
      summary: '白塔同时通过三面潮汐镜发出仪式召集，但只有两端的守镜人知道完整的句子。',
      public_narrative: '潮汐镜在同一个心跳里亮过一瞬，岸边的人只看见白塔方向的钟光。',
      visibility: 'mixed',
      facts: [],
      remove_fact_ids: [],
      region_changes: [],
      faction_changes: [],
      actor_changes: [],
      thread_changes: [],
      signals: [],
    },
    {
      local_id: 'e1',
      parent_local_id: 'e0',
      title: '白塔定钟',
      region_id: 'white_tower',
      actor_ids: ['yan_wujiu'],
      faction_ids: ['tide_council'],
      summary: '晏无咎宣布大归潮七日后正式开始，并将三城名字登记提前。',
      public_narrative: '白塔的归潮钟提前鸣响，全城开始登记名字。',
      visibility: 'public',
      facts: [
        {
          text: '白塔宣布大归潮将在七日后正式开始，三城须在钟响前完成名字登记。',
          importance: 4,
          known_by: ['tide_council', 'yan_wujiu', 'fog_league'],
          public: false,
          tag: '白塔宣告',
        },
      ],
      remove_fact_ids: [],
      region_changes: [
        { region_id: 'white_tower', status: '归潮仪式进入倒计时，镜厅封闭。', resource_deltas: { stability: -3, influence: 2 } },
      ],
      faction_changes: [
        { faction_id: 'tide_council', power_delta: 0, legitimacy_delta: 1, resource_deltas: { influence: 3 }, attitude_deltas: { iron_command: -5 } },
      ],
      actor_changes: [],
      thread_changes: [
        { thread_id: 'tide_crisis', tension_delta: 1, clock_delta: -1, status: 'active', note: '倒计时开始。' },
      ],
      signals: [],
    },
    {
      local_id: 'e2',
      parent_local_id: 'e0',
      title: '铁湾升火',
      region_id: 'iron_bay',
      actor_ids: ['huo_ting'],
      faction_ids: ['iron_command'],
      summary: '铁湾舰队在夜色中离港。军府只把它称作护港演习。',
      public_narrative: '铁湾港口的一号船坞在夜里排出一整条煤烟，几艘吃水很深的军舰驶入黑潮。',
      visibility: 'mixed',
      facts: [
        {
          text: '铁湾舰队主力已离港，预计三日后抵达雾港外海；军府对外称这是一次护港演习。',
          importance: 4,
          known_by: ['iron_command', 'huo_ting'],
          public: false,
          tag: '舰队动向',
        },
      ],
      remove_fact_ids: [],
      region_changes: [
        { region_id: 'iron_bay', status: '全港灯火管制，一号船坞空出一半泊位。', resource_deltas: { stability: -2, food: -4 } },
      ],
      faction_changes: [
        { faction_id: 'iron_command', power_delta: 0, legitimacy_delta: 0, resource_deltas: { supplies: -4 }, attitude_deltas: { tide_council: -3 } },
      ],
      actor_changes: [],
      thread_changes: [
        { thread_id: 'iron_fleet', tension_delta: 1, clock_delta: -6, status: 'active', note: '舰队已离开铁湾。' },
      ],
      signals: [
        {
          to_entity_ids: ['fog_league'],
          channel: '军需官的加密快船',
          content: '铁湾舰队已离港，预计三日后抵达雾港外海。这不是演习。',
          delay_minutes: 1440,
          fact_indices: [0],
        },
      ],
    },
    {
      local_id: 'e3',
      parent_local_id: null,
      title: '铜钟里的半页纸',
      region_id: 'fog_harbor',
      actor_ids: ['shen_yan', 'gu_xingzhou', 'lin_xiaoman'],
      faction_ids: ['fog_league'],
      summary: '雾港旧码头打捞上一口刻着长明号船名的铜钟；钟腹塞着半页被盐浸透的仪式纸。',
      public_narrative: '旧码头的起重机吊起一口黑色铜钟，钟身上的船名被海锈蚀去了一半。围观的人听见钟腹里有什么东西在纸里响。',
      visibility: 'mixed',
      facts: [
        {
          text: '雾港旧码头捞起一口刻有“长明号”的铜钟，钟腹藏着半页仪式纸；纸上的名字尚未被辨认。',
          importance: 4,
          known_by: ['shen_yan', 'gu_xingzhou', 'lin_xiaoman', 'fog_league'],
          public: false,
          tag: '铜钟打捞',
        },
      ],
      remove_fact_ids: [],
      region_changes: [
        { region_id: 'fog_harbor', status: '旧码头被围观者挤满，商会临时封港。', resource_deltas: { stability: -4, trade: -2 } },
      ],
      faction_changes: [],
      actor_changes: [
        { actor_id: 'lin_xiaoman', stress_delta: 1, conditions_add: [{ name: '船名的回响', description: '她听见铜钟里像有人在敲磁带。', modifier: -1, kind: 'emotion', abilities: ['will'] }], conditions_remove: [], flags_set: {} },
      ],
      thread_changes: [
        { thread_id: 'true_name_page', tension_delta: 1, clock_delta: 1, status: 'active', note: '发现了与长明号有关的仪式残页。' },
      ],
      signals: [],
    },
  ],
  scene: {
    event_local_id: 'e3',
    region_id: 'fog_harbor',
    title: '钟腹里的盐',
    question: '谁会当场打开铜钟？打开之后，这半页纸该由谁保管？',
    stakes: '舰队已经在路上，铜钟里的纸可能是唯一能改写归潮次序的东西。',
    public_brief:
      '旧码头的雨越来越密。黑色铜钟被吊在栈桥上方，钟腹里塞着半页盐渍纸。顾行舟想把铜钟带回港务局，林小满已经把录音机举起来，沈砚站在钟下，手心里全是盐。苏合的人正从码头两端围过来。',
    participant_ids: ['shen_yan', 'gu_xingzhou', 'lin_xiaoman', 'su_he'],
    private_cues: [
      { actor_id: 'shen_yan', cue: '铜钟内壁的回声和寂照灯塔底下的旧潮汐镜一模一样。' },
      { actor_id: 'gu_xingzhou', cue: '你认得铜钟上的海锈：和十七年前长明号船壳上的锈是同一种。' },
      { actor_id: 'lin_xiaoman', cue: '录音机在铜钟开始晃动后自己转了一格，磁带里出现极轻的第三下敲击。' },
      { actor_id: 'su_he', cue: '你已经算过：这口钟如果卖给铁湾，足够买下两条快船。' },
    ],
  },
};

const secondDraft = {
  advance_minutes: 900,
  advance_reason: '铜钟被吊上岸、信使继续上路、白塔完成第一轮名字登记，世界在雨后推进了十五个小时。',
  epoch_title: '钟声之后',
  world_summary:
    '白塔的名字登记引发港城不安；铁湾的加密快船将舰队消息送进雾港商会；铜钟被临时封存，但那半页仪式纸已经不在钟腹里了。',
  events: [
    {
      local_id: 'f4',
      parent_local_id: null,
      title: '封存的钟',
      region_id: 'fog_harbor',
      actor_ids: ['shen_yan', 'gu_xingzhou', 'su_he'],
      faction_ids: ['fog_league'],
      summary: '商会封存铜钟，但钟腹里的半页纸在封条贴上之前已经消失。',
      public_narrative: '旧码头的铜钟被盖上商会的蜡封，围观者被赶开。有人说看见沈砚的手套上沾着新鲜的盐。',
      visibility: 'mixed',
      facts: [
        {
          text: '长明号铜钟被雾港商会封存，但钟腹里的半页仪式纸已经不见。',
          importance: 4,
          known_by: ['shen_yan', 'gu_xingzhou', 'su_he', 'fog_league'],
          public: false,
          tag: '铜钟封存',
        },
      ],
      remove_fact_ids: [],
      region_changes: [],
      faction_changes: [],
      actor_changes: [],
      thread_changes: [
        { thread_id: 'true_name_page', tension_delta: 1, clock_delta: 1, status: 'active', note: '纸已经从铜钟里消失。' },
      ],
      signals: [],
    },
  ],
  scene: null,
};

class FakeWorldModel implements LanguageModel {
  readonly model = 'fake-world';
  calls: Array<{ label: string; user: string }> = [];
  private count = 0;

  async callJson<T>(options: CallOptions<T>): Promise<JsonCallResult<T>> {
    this.calls.push({ label: options.label, user: options.user });
    const raw = this.count++ === 0 ? firstDraft : secondDraft;
    const data = options.validate(raw);
    return {
      data,
      content: JSON.stringify(raw),
      reasoning: '',
      usage: {
        calls: 1,
        promptTokens: 100,
        completionTokens: 50,
        cachedTokens: 0,
        reasoningTokens: 10,
        totalTokens: 150,
        failures: 0,
      },
      latencyMs: 3,
      thinking: false,
    };
  }
}

async function makeRun() {
  const preset = await getWorldPreset('three-tides');
  assert.ok(preset);
  return createWorldRun(preset, {
    seed: 'world-test-seed',
    maxEpochs: 4,
    thinking: 'disabled',
  });
}

test('世界：初始事实、即时潮汐镜与延迟信号', async () => {
  const run = await makeRun();
  assert.equal(run.actors.shen_yan!.regionId, 'fog_harbor');
  assert.equal(run.facts.length, 15);
  const fleetFact = run.facts.find((fact) => fact.tag === '铁湾军令')!;
  assert.equal(fleetFact.knownBy.includes('fog_league'), false);
  const mirrorFact = run.facts.find((fact) => fact.tag === '白塔密令')!;
  assert.equal(mirrorFact.knownBy.includes('shen_yan'), true, '零延迟的潮汐镜应在开局送达');
  assert.equal(run.signals.filter((signal) => signal.status === 'pending').length, 1);
  assert.equal(run.clock.day, 1);
  assert.equal(run.clock.time, '22:40');
});

test('世界：父事件、并发独立事件、知识延迟与场景契约', async () => {
  const run = await makeRun();
  const fake = new FakeWorldModel();
  const engine = new WorldEngine(run, fake);
  await engine.advanceEpoch();

  assert.equal(run.status, 'ready');
  assert.equal(run.epochs.length, 1);
  assert.equal(run.clock.time, '00:40');
  assert.equal(run.epochs[0]!.title, '潮汐镜同时亮起');
  assert.equal(run.events.length, 4);
  const parent = run.events.find((event) => event.localId === 'e0')!;
  const white = run.events.find((event) => event.localId === 'e1')!;
  const iron = run.events.find((event) => event.localId === 'e2')!;
  const fog = run.events.find((event) => event.localId === 'e3')!;
  assert.equal(parent.kind, 'parent');
  assert.equal(white.parentId, parent.id);
  assert.equal(iron.parentId, parent.id);
  assert.deepEqual(parent.childIds.sort(), [white.id, iron.id].sort());
  assert.equal(fog.parentId, null);

  assert.equal(run.epochs[0]!.eventIds.length, 4);
  assert.equal(run.sceneHooks.length, 1);
  const hook = run.sceneHooks[0]!;
  assert.equal(hook.title, '钟腹里的盐');
  assert.equal(hook.participantIds.length, 4);
  assert.equal(hook.sourceEventId, fog.id);
  assert.equal(fog.sceneHookId, hook.id);
  assert.equal(run.epochs[0]!.sceneHookId, hook.id);

  const ironFleetFact = run.facts.find((fact) => fact.text.includes('铁湾舰队主力'))!;
  assert.equal(ironFleetFact.knownBy.includes('fog_league'), false, '消息还在路上');
  assert.equal(run.signals.filter((signal) => signal.status === 'pending').length, 2);
  const newSignal = run.signals.find((signal) => signal.fromEventId === iron.id)!;
  assert.equal(newSignal.toEntityIds.includes('fog_league'), true);
  assert.equal(newSignal.arrivesAt, 1560);

  // The prompt intentionally sees the whole truth and all known-by sets.
  assert.ok(fake.calls[0]!.user.includes('隐藏真相') || fake.calls[0]!.user.includes('真正的归潮次序'));
  assert.ok(fake.calls[0]!.user.includes('铁湾舰队'));

  // Advance past the seeded 720-minute signal; it should arrive in epoch 2.
  await engine.advanceEpoch();
  assert.equal(run.epochs.length, 2);
  assert.equal(run.clock.time, '15:40');
  const fleetFact = run.facts.find((fact) => fact.tag === '铁湾军令')!;
  assert.equal(fleetFact.knownBy.includes('fog_league'), true);
  assert.equal(run.epochs[1]!.deliveryEventIds.length >= 1, true);
  assert.equal(run.signals.find((signal) => signal.id === newSignal.id)?.status, 'pending');
  assert.equal(run.llm.calls, 2);
  assert.equal(run.llm.totalTokens, 300);
});

test('世界：同一资源上的独立并发事件会被拒绝合并', async () => {
  const run = await makeRun();
  const baseEvent = {
    parent_local_id: null as string | null,
    region_id: 'white_tower',
    actor_ids: [],
    faction_ids: [],
    summary: '测试事件',
    public_narrative: '测试公开版本',
    visibility: 'mixed',
    facts: [],
    remove_fact_ids: [],
    faction_changes: [],
    actor_changes: [],
    thread_changes: [],
    signals: [],
  };
  const raw = {
    advance_minutes: 60,
    advance_reason: '测试',
    epoch_title: '测试冲突',
    world_summary: '测试',
    events: [
      {
        ...baseEvent,
        local_id: 'a',
        title: '甲写状态',
        region_changes: [{ region_id: 'white_tower', status: 'A', resource_deltas: {} }],
      },
      {
        ...baseEvent,
        local_id: 'b',
        title: '乙写状态',
        region_changes: [{ region_id: 'white_tower', status: 'B', resource_deltas: {} }],
      },
    ],
    scene: null,
  };
  assert.throws(
    () => parseWorldEpochDraft(raw, run),
    /写集冲突/,
    '两个独立事件不能同时以不同方式改写同一区域状态',
  );

  const coordinated = structuredClone(raw);
  coordinated.events[1]!.parent_local_id = 'a';
  assert.doesNotThrow(() => parseWorldEpochDraft(coordinated, run));
});


test('世界：聚焦场景只把每个角色已知的事实带进局部引擎', async () => {
  const run = await makeRun();
  const fake = new FakeWorldModel();
  const engine = new WorldEngine(run, fake);
  await engine.advanceEpoch();
  const hook = run.sceneHooks[0]!;
  const scenario = buildWorldScene(run, hook);
  assert.equal(scenario.characters.length, 4);
  assert.equal(scenario.world.startClock, '00:40');
  assert.equal(scenario.rules.maxBeats, 3);
  assert.match(scenario.world.premise, /谁会当场打开铜钟/);
  assert.ok(scenario.world.initialFacts.some((fact) => fact.includes('旧码头的起重机')));

  const shen = scenario.characters.find((character) => character.id === 'shen_yan')!;
  const su = scenario.characters.find((character) => character.id === 'su_he')!;
  const lin = scenario.characters.find((character) => character.id === 'lin_xiaoman')!;
  const shenText = shen.memories.map((memory) => memory.summary).join('\n');
  const suText = su.memories.map((memory) => memory.summary).join('\n');
  assert.match(shenText, /铜钟/);
  assert.doesNotMatch(suText, /铜钟/);
  assert.doesNotMatch(shenText, /铁湾舰队主力/);
  assert.doesNotMatch(suText, /铁湾舰队主力/);
  assert.doesNotMatch(shenText, /铜钟内壁的回声和寂照灯塔底下/);
  assert.equal(shen.relationships.some((relationship) => relationship.targetId === 'su_he'), false);
  assert.equal(shen.relationships.length, 2);
  assert.ok(shen.relationships.every((relationship) => hook.participantIds.includes(relationship.targetId)));
  assert.match(scenario.world.hiddenCanon ?? '', /不能|不得|只处理/);
  assert.equal(lin.conditions?.[0]?.name, '船名的回响');
});

test('世界：已知目标的信号被丢弃，纯内容信号保留', async () => {
  const run = await makeRun();
  const model: LanguageModel = {
    model: 'fake-signal',
    async callJson<T>(options: CallOptions<T>): Promise<JsonCallResult<T>> {
      const raw = {
        advance_minutes: 10,
        advance_reason: '测试信号。',
        epoch_title: '测试信号',
        world_summary: '一条已知消息与一条口信同时出现。',
        events: [
          {
            local_id: 'a',
            parent_local_id: null,
            title: '纸上的消息',
            region_id: 'fog_harbor',
            actor_ids: ['shen_yan'],
            faction_ids: ['fog_league'],
            summary: '一条已经贴在灯室门上的消息。',
            public_narrative: '灯室门上多了一张纸。',
            visibility: 'mixed',
            facts: [
              {
                text: '灯室门上贴着一张写着“第七码”的纸。',
                importance: 3,
                known_by: ['shen_yan'],
                public: false,
                tag: '测试事实',
              },
            ],
            remove_fact_ids: [],
            region_changes: [],
            faction_changes: [],
            actor_changes: [],
            thread_changes: [],
            signals: [
              {
                to_entity_ids: ['shen_yan'],
                channel: '重复的耳语',
                content: '有人把同一件事又说了一遍。',
                delay_minutes: 30,
                fact_indices: [0],
              },
              {
                to_entity_ids: ['gu_xingzhou'],
                channel: '没有附件的口信',
                content: '顾稽核，灯下有人在等你。',
                delay_minutes: 30,
                fact_indices: [],
              },
            ],
          },
        ],
        scene: null,
      };
      return {
        data: options.validate(raw),
        content: JSON.stringify(raw),
        reasoning: '',
        usage: {
          calls: 1,
          promptTokens: 1,
          completionTokens: 1,
          cachedTokens: 0,
          reasoningTokens: 0,
          totalTokens: 2,
          failures: 0,
        },
        latencyMs: 1,
        thinking: false,
      };
    },
  };
  const engine = new WorldEngine(run, model);
  await engine.advanceEpoch();
  assert.equal(run.signals.some((signal) => signal.channel === '重复的耳语'), false);
  const contentOnly = run.signals.find((signal) => signal.channel === '没有附件的口信');
  assert.ok(contentOnly);
  assert.equal(contentOnly.toEntityIds.includes('gu_xingzhou'), true);
  assert.equal(contentOnly.status, 'pending');
});
