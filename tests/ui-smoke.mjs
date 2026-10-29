/* 无头渲染冒烟测试：桩掉 DOM，用 data/ 里的真实快照渲染所有视图。
   任何引用错误、字段拼错、循环依赖问题都会在这里爆出来。
   运行：node tests/ui-smoke.mjs（旧布局或项目布局均可）。 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

/* ---- 半真实 DOM 桩：能表达 data-region 容器层级 ---- */

const allElements = new Set();

function fakeEl() {
  const el = {
    innerHTML: '',
    hidden: false,
    dataset: {},
    style: {},
    textContent: '',
    className: '',
    value: '',
    open: false,
    _children: new Map(),
    querySelector(sel) {
      const region = sel.match(/\[data-region="([^"]+)"\]/);
      if (region) {
        const key = region[1];
        if (!el._children.has(key)) el._children.set(key, fakeEl());
        return el._children.get(key);
      }
      if (!el._children.has(`sel:${sel}`)) el._children.set(`sel:${sel}`, fakeEl());
      return el._children.get(`sel:${sel}`);
    },
    querySelectorAll() {
      return [];
    },
    appendChild() {},
    scrollIntoView() {},
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
  };
  allElements.add(el);
  return el;
}

/* setAppHtml / setRegion 之后，从所有已创建元素收集渲染产物。 */
function renderedHtml() {
  let out = '';
  for (const el of allElements) out += el.innerHTML;
  return out;
}

function resetRegionsOn(el, html) {
  el._children = new Map();
  for (const match of html.matchAll(/data-region="([^"]+)"/g)) {
    el._children.set(match[1], fakeEl());
  }
}

const appEl = fakeEl();
const modalEl = fakeEl();
const toastEl = fakeEl();

globalThis.document = {
  querySelector(sel) {
    if (sel === '#app') return appEl;
    if (sel === '#modal-layer') return modalEl;
    if (sel === '#toast-layer') return toastEl;
    if (sel === 'html') return { dataset: { theme: 'dark' } };
    if (sel === 'body') return { style: {} };
    return fakeEl();
  },
  querySelectorAll: () => [],
  getElementById: () => fakeEl(),
  addEventListener: () => {},
  createElement: () => fakeEl(),
  documentElement: { dataset: { theme: 'dark' } },
  body: { style: {} },
  title: '',
};

globalThis.window = {
  scrollY: 0,
  scrollTo: () => {},
  addEventListener: () => {},
  location: { hash: '' },
};

globalThis.location = globalThis.window.location;
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.requestAnimationFrame = (fn) => fn();
globalThis.CSS = { escape: (s) => s };

Object.defineProperty(appEl, 'innerHTML', {
  get() {
    return appEl._html ?? '';
  },
  set(value) {
    appEl._html = value;
    resetRegionsOn(appEl, value);
  },
});

const { state } = await import(join(root, 'public/js/state.js'));

/* ---- 数据：兼容旧布局（data/runs + data/worlds）与项目布局（data/projects） ---- */

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function loadRunsAndWorlds() {
  const runs = [];
  const worlds = [];
  if (existsSync(join(root, 'data/projects'))) {
    for (const project of readdirSync(join(root, 'data/projects'))) {
      const worldFile = join(root, 'data/projects', project, 'world.json');
      const shortFile = join(root, 'data/projects', project, 'run.json');
      if (existsSync(worldFile)) worlds.push(readJson(worldFile));
      if (existsSync(shortFile)) runs.push(readJson(shortFile));
      const runsDir = join(root, 'data/projects', project, 'runs');
      if (existsSync(runsDir)) {
        for (const file of readdirSync(runsDir)) {
          if (file.endsWith('.json')) runs.push(readJson(join(runsDir, file)));
        }
      }
    }
  }
  if (existsSync(join(root, 'data/worlds'))) {
    for (const file of readdirSync(join(root, 'data/worlds'))) {
      if (file.endsWith('.json')) worlds.push(readJson(join(root, 'data/worlds', file)));
    }
  }
  if (existsSync(join(root, 'data/runs'))) {
    for (const file of readdirSync(join(root, 'data/runs'))) {
      if (file.endsWith('.json')) runs.push(readJson(join(root, 'data/runs', file)));
    }
  }
  return { runs, worlds };
}

const { runs: runSnapshots, worlds: worldSnapshots } = loadRunsAndWorlds();
if (!runSnapshots.length || !worldSnapshots.length) {
  console.error('data/ 里没有可用的 run 或 world 快照，冒烟测试需要至少一条数据。');
  process.exit(1);
}
const run =
  runSnapshots.find(
    (snapshot) =>
      !snapshot.worldLink &&
      (snapshot.status === 'paused' || snapshot.status === 'ready') &&
      (snapshot.beats ?? []).some((beat) => beat.phase === 'complete'),
  ) ?? runSnapshots[0];
const world = worldSnapshots[0];

function runSummary(snapshot) {
  return {
    id: snapshot.id,
    title: snapshot.scenario.title,
    subtitle: snapshot.scenario.subtitle,
    status: snapshot.status,
    beats: (snapshot.beats ?? []).filter((beat) => beat.phase === 'complete').length,
    maxBeats: snapshot.settings?.maxBeats ?? 4,
    characterNames: (snapshot.scenario.characters ?? []).map((character) => character.name),
    updatedAt: snapshot.updatedAt ?? new Date().toISOString(),
    createdAt: snapshot.createdAt ?? snapshot.updatedAt,
    currentBeatTitle: snapshot.beats?.at(-1)?.title ?? null,
    ...(snapshot.worldLink
      ? { worldId: snapshot.worldLink.worldId, worldTitle: snapshot.worldLink.worldTitle }
      : {}),
  };
}

function projectSummaries(snapshots) {
  const projects = [];
  for (const snapshot of snapshots.worlds) {
    projects.push({
      id: snapshot.id,
      kind: 'world',
      title: snapshot.definition.title,
      kicker: snapshot.definition.kicker,
      status: snapshot.status,
      archived: false,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      epochCount: (snapshot.epochs ?? []).length,
      maxEpochs: snapshot.settings?.maxEpochs ?? 4,
      openThreads: Object.values(snapshot.threads ?? {}).filter((thread) => thread.status === 'active').length,
      unsealedScenes: (snapshot.sceneRuns ?? []).filter(
        (scene) => scene.status !== 'completed' && (scene.beatCount ?? 0) > 0,
      ).length,
      pendingSignals: (snapshot.signals ?? []).filter((signal) => signal.status === 'pending').length,
      sceneEntries: [],
      lastActivityTitle: snapshot.epochs?.at(-1)?.title ?? null,
    });
  }
  for (const snapshot of snapshots.runs) {
    if (snapshot.worldLink) continue;
    projects.push({
      id: snapshot.id,
      kind: 'short',
      title: snapshot.scenario.title,
      kicker: snapshot.scenario.kicker,
      status: snapshot.status,
      archived: false,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      beats: (snapshot.beats ?? []).filter((beat) => beat.phase === 'complete').length,
      maxBeats: snapshot.settings?.maxBeats ?? 4,
      currentBeatTitle: snapshot.beats?.at(-1)?.title ?? null,
    });
  }
  return projects;
}

const snapshots = { runs: runSnapshots, worlds: worldSnapshots };
state.runs = runSnapshots.map(runSummary);
state.projects = projectSummaries(snapshots);
state.scenarios = [
  {
    id: 'fog-harbor',
    title: run.scenario.title,
    subtitle: run.scenario.subtitle,
    kicker: run.scenario.kicker,
    location: run.scenario.world?.location ?? '',
    characterNames: (run.scenario.characters ?? []).map((c) => c.name),
    maxBeats: run.settings?.maxBeats ?? 4,
  },
];
state.worldPresets = [
  {
    id: 'three-tides',
    title: world.definition.title,
    subtitle: world.definition.subtitle,
    kicker: world.definition.kicker,
    regionNames: (world.definition?.setting?.regions ?? []).map((r) => r.name),
    factionNames: (world.definition?.setting?.factions ?? []).map((f) => f.name),
    actorNames: (world.definition?.setting?.actors ?? []).map((a) => a.name),
    maxEpochs: world.settings?.maxEpochs ?? 4,
  },
];
state.health = { hasApiKey: true, model: 'deepseek-flash', thinking: 'auto', migration: { needed: false, worlds: 0, runs: 0 } };

let failures = 0;
function step(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`✗ ${name}: ${error.stack}`);
  }
}

/* ---- 推演页 ---- */

const runRender = await import(join(root, 'public/js/render/run.js'));
state.currentRun = run;
state.active = false;
state.selectedBeatId = null;

step('推演页 · 开场形态', () => {
  const freshRun = { ...run, beats: [] };
  state.currentRun = freshRun;
  state.selectedBeatId = null;
  runRender.renderRunPage({ full: true, scrollTop: true });
  if (!renderedHtml().includes('推开第一幕')) throw new Error('缺少开场 CTA');
  state.currentRun = run;
});

step('推演页 · 时刻形态（完整数据）', () => {
  state.selectedBeatId = (run.beats ?? []).filter((b) => b.phase === 'complete').at(-1)?.id ?? null;
  runRender.renderRunPage();
  const html = renderedHtml();
  if (!html.includes('推进一刻')) throw new Error('缺少推进按钮');
  if (!html.includes('<h2>举动</h2>')) throw new Error('缺少举动账本');
  if (html.includes('data-act="open-recap"') || html.includes('打开完整复盘')) {
    throw new Error('非扮演场不应出现复盘入口');
  }
});

for (const god of [true, false]) {
  step(`推演页 · 剧作家视角=${god}`, () => {
    state.godView = god;
    runRender.renderRunPage();
  });
}
state.godView = false;

/* ---- 世界页 ---- */

const worldRender = await import(join(root, 'public/js/render/world.js'));
state.currentWorld = world;
state.worldActive = false;

step('世界页 · 完整渲染', () => {
  worldRender.renderWorldPage({ full: true, scrollTop: true });
  if (!renderedHtml().includes('世界导演台')) throw new Error('缺少导演台');
});

step('世界页 · 剧作家视角', () => {
  state.godView = true;
  worldRender.renderWorldPage();
  state.godView = false;
});

step('世界页 · 场景带分区（已收束 / 旧纪元契约）', () => {
  const html = appEl._children.get('world-scenes')?.innerHTML || '';
  if (!html.includes('scene-band')) throw new Error('缺少场景带');
  if (!html.includes('已收束')) throw new Error('缺少已收束分区');
  if (!html.includes('旧纪元契约')) throw new Error('缺少旧纪元分区');
  const latestEpochIndex = (world.epochs?.length ?? 1) - 1;
  const oldHook = (world.sceneHooks ?? []).find((hook) => hook.epochIndex < latestEpochIndex);
  if (oldHook && !html.includes(oldHook.title)) throw new Error('旧纪元契约未渲染');
});

step('世界页 · 场景带分区（推演中 / 待收束 / 可开镜 / 提醒条）', () => {
  // 构造一份覆盖全部分区的世界：running / unsealed / offered / sealed
  const latestEpochIndex = (world.epochs?.length ?? 1) - 1;
  const hasLatestOffered = (world.sceneHooks ?? []).some(
    (hook) => hook.epochIndex === latestEpochIndex && hook.status === 'offered',
  );
  const synthetic = {
    ...world,
    sceneHooks: [...(world.sceneHooks ?? [])],
    sceneRuns: [
      { hookId: 'hook_smoke_running', runId: 'run_smoke_running', status: 'created', runStatus: 'running', beatCount: 1, addedAt: world.updatedAt },
      { hookId: 'hook_smoke_unsealed', runId: 'run_smoke_unsealed', status: 'created', runStatus: 'paused', beatCount: 2, addedAt: world.updatedAt },
      ...(world.sceneRuns ?? []),
    ],
  };
  if (!hasLatestOffered) {
    synthetic.sceneHooks.push({
      id: 'hook_smoke_new',
      epochIndex: latestEpochIndex,
      sourceEventId: 'evt',
      regionId: world.definition.setting.regions[0]?.id ?? 'r',
      title: '冒烟·新契约',
      question: '谁先动手？',
      stakes: '全城的名字。',
      publicBrief: '',
      participantIds: [world.definition.setting.actors[0]?.id].filter(Boolean),
      privateCues: [],
      status: 'offered',
      runId: null,
      createdAt: world.updatedAt,
    });
  }
  if (!synthetic.sceneHooks.some((hook) => hook.id === 'hook_smoke_running')) {
    synthetic.sceneHooks.push(
      { id: 'hook_smoke_running', epochIndex: latestEpochIndex, sourceEventId: 'evt', regionId: world.definition.setting.regions[0]?.id ?? 'r', title: '冒烟·推演中', question: 'q', stakes: 's', publicBrief: '', participantIds: [], privateCues: [], status: 'scene_created', runId: 'run_smoke_running', createdAt: world.updatedAt },
      { id: 'hook_smoke_unsealed', epochIndex: latestEpochIndex, sourceEventId: 'evt', regionId: world.definition.setting.regions[0]?.id ?? 'r', title: '冒烟·待收束', question: 'q', stakes: 's', publicBrief: '', participantIds: [], privateCues: [], status: 'scene_created', runId: 'run_smoke_unsealed', createdAt: world.updatedAt },
    );
  }
  state.currentWorld = synthetic;
  worldRender.renderWorldPage({ full: true });
  const html = appEl._children.get('world-scenes')?.innerHTML || '';
  if (!html.includes('推演中')) throw new Error('缺少推演中分区');
  if (!html.includes('待收束')) throw new Error('缺少待收束分区');
  if (!html.includes('余波尚未写回世界账本')) throw new Error('缺少收束提醒条');
  if (latestEpochIndex >= 0 && !html.includes('可开镜')) throw new Error('缺少可开镜分区');
  state.currentWorld = world;
});

step('世界页 · 区域签名：轮询不重写未变化的场景带', () => {
  worldRender.renderWorldPage({ full: true });
  const scenesRegion = appEl._children.get('world-scenes');
  const before = scenesRegion.innerHTML;
  worldRender.renderWorldPage();
  if (scenesRegion.innerHTML !== before) throw new Error('未变化区域被重写');
});

/* ---- 线程抽屉 ---- */

const drawers = await import(join(root, 'public/js/render/drawers.js'));

step('线程档案抽屉', () => {
  const threadEntry = Object.entries(world.threads ?? {})[0];
  if (!threadEntry) throw new Error('数据里没有线程');
  const [threadId, runtime] = threadEntry;
  drawers.openWorldThreadDrawer(threadId);
  const html = modalEl.innerHTML;
  if (!html.includes('线程档案')) throw new Error('抽屉未渲染');
  if (!html.includes('问题与赌注')) throw new Error('缺少问题与赌注块');
  if ((runtime.history ?? []).length && !html.includes('逐纪元笔记')) throw new Error('缺少逐纪元笔记');
  const related = (world.events ?? []).filter((event) =>
    (event.effects?.threadChanges ?? []).some((change) => change.threadId === threadId),
  );
  if (related.length && !html.includes('关联事件')) throw new Error('缺少关联事件块');
});

/* ---- 角色档案 / 规则书 / 世界弹窗 ---- */

step('角色档案抽屉', () => {
  drawers.openCharacterDrawer(run.scenario.characters[0].id);
  if (!modalEl.innerHTML.includes('人物档案')) throw new Error('抽屉未渲染');
  if (!modalEl.innerHTML.includes('秘密')) throw new Error('缺少秘密块');
});

step('规则书', () => drawers.openRulebook());
step('世界角色档案', () => drawers.openWorldActor(world.definition.setting.actors[0].id));
step('世界势力档案', () => drawers.openWorldFaction(world.definition.setting.factions[0].id));
step('世界事件档案', () => {
  const event = world.events?.[0];
  if (event) drawers.openWorldEvent(event.id);
});
step('事实账本', () => drawers.openWorldFactsModal());
step('世界概述', () => drawers.openWorldOverview());

step('删除世界项目弹窗 · 明示级联场景数', () => {
  drawers.openConfirmDeleteWorld();
  const html = modalEl.innerHTML;
  if (!html.includes('个聚焦场景')) throw new Error('缺少级联场景数说明');
  if (!html.includes('导出战报')) throw new Error('缺少导出提示');
});

/* ---- 首页项目总览 ---- */

const homeRender = await import(join(root, 'public/js/render/home.js'));

step('首页 · 项目总览分组', () => {
  state.view = 'home';
  homeRender.renderHome();
  const html = renderedHtml();
  if (!html.includes('世界项目')) throw new Error('缺少世界项目组');
  if (!html.includes('短篇')) throw new Error('缺少短篇组');
  if (!html.includes('个世界项目')) throw new Error('缺少统计行');
  if (!html.includes('项待办')) throw new Error('缺少待办统计');
  if (!html.includes('纪元')) throw new Error('项目卡缺少纪元指标');
  if (!html.includes('开放线程')) throw new Error('项目卡缺少线程指标');
});

step('首页 · 世界项目卡场景行与徽标', () => {
  const html = renderedHtml();
  const sceneRun = (world.sceneRuns ?? []).find((scene) => scene.status !== 'completed' && (scene.beatCount ?? 0) > 0);
  if (sceneRun && !html.includes('个场景待收束')) throw new Error('待收束徽标缺失');
  const worldScene = state.runs.find((item) => item.worldId === world.id);
  if (worldScene && !html.includes(worldScene.title)) throw new Error('场景行未渲染');
});

step('首页 · 迁移提示条', () => {
  state.health = { ...state.health, migration: { needed: true, worlds: 1, runs: 1 } };
  homeRender.renderHome();
  if (!renderedHtml().includes('--migrate-projects')) throw new Error('缺少迁移命令提示');
  state.health = { ...state.health, migration: { needed: false, worlds: 0, runs: 0 } };
});

step('首页 · 已归档折叠区', () => {
  state.projects = state.projects.map((project) => ({ ...project, archived: true }));
  homeRender.renderHome();
  const html = renderedHtml();
  if (!html.includes('已归档')) throw new Error('缺少归档区');
  if (!html.includes('unarchive-project')) throw new Error('缺少恢复按钮');
  state.projects = state.projects.map((project) => ({ ...project, archived: false }));
});

/* ---- 新建 / 世界库 ---- */

const createRender = await import(join(root, 'public/js/render/create.js'));
step('新建页', () => {
  createRender.renderCreatePage();
  if (!renderedHtml().includes('预置剧本')) throw new Error('缺少预置 tab');
});

const libraryRender = await import(join(root, 'public/js/render/library.js'));
step('世界库 · 世界项目档案', () => {
  libraryRender.renderWorldsLibrary();
  const html = renderedHtml();
  if (!html.includes('世界项目')) throw new Error('缺少世界项目区块');
});

/* ---- 渐进披露与冗余移除的验收 ---- */

step('渐进披露结构成立', () => {
  state.selectedBeatId = (run.beats ?? []).filter((b) => b.phase === 'complete').at(-1)?.id ?? null;
  runRender.renderRunPage({ full: true });
  const html = renderedHtml();
  if (!html.includes('class="fold"')) throw new Error('行动详情折叠缺失');
  if (!html.includes('verdict--')) throw new Error('结果章缺失');
  if (html.includes('timeline-panel')) throw new Error('仍渲染了底部时间线');
  const narr = html.indexOf('class="prose"');
  const firstFold = html.indexOf('class="fold"');
  if (narr === -1 || firstFold === -1 || narr > firstFold) throw new Error('叙事不在折叠之前');
});

step('区域签名：轮询不重写未变化区域', () => {
  runRender.renderRunPage({ full: true });
  const stageRegion = appEl._children.get('run-stage');
  const before = stageRegion.innerHTML;
  // 模拟一次完全相同数据的轮询
  runRender.renderRunPage();
  if (stageRegion.innerHTML !== before) throw new Error('未变化区域被重写');
  // 选中另一刻后应重写
  const beats = (run.beats ?? []).filter((b) => b.phase === 'complete');
  if (beats.length > 1) {
    state.selectedBeatId = beats[0].id;
    runRender.renderRunPage();
    if (stageRegion.innerHTML === before) throw new Error('切换时刻后舞台未更新');
  }
});


/* ---- 扮演模式 ---- */

const { redactRunForPlayer } = await import(join(root, 'src/engine/playerView.ts'));

function currentViewHtml() {
  let out = appEl.innerHTML;
  for (const child of appEl._children.values()) out += child.innerHTML;
  return out;
}

function playFixture({ awaiting = false, recap = false } = {}) {
  const base = structuredClone(run);
  const complete = base.beats.filter((beat) => beat.phase === 'complete');
  const player = base.scenario.characters[0];
  const other = base.scenario.characters[1];
  base.scenario.world.hiddenCanon = 'HIDDEN_CANON_MARKER';
  base.scenario.world.directorNotes = 'DIRECTOR_NOTES_MARKER';
  player.secret = 'PLAYER_SECRET_MARKER';
  other.secret = 'OTHER_SECRET_MARKER';
  other.personality = 'OTHER_PERSONALITY_MARKER';
  other.desire = 'OTHER_DESIRE_MARKER';
  const now = new Date().toISOString();
  base.play = {
    characterId: player.id,
    awaiting: awaiting ? 'action' : null,
    recapAt: recap ? now : null,
    createdAt: now,
  };
  base.status = awaiting ? 'awaiting' : recap ? 'ended' : 'ready';
  base.beats = complete.slice(-1);
  if (awaiting) {
    const lastClock = base.beats.at(-1)?.clock || base.clock;
    base.beats.push({
      id: 'beat_play_partial',
      index: base.beats.length,
      title: '等你的一刻',
      phase: 'player_action',
      clock: { ...lastClock },
      timeJump: null,
      publicBrief: 'PUBLIC_BRIEF_MARKER 此刻所有人都能看见的处境。',
      privateCues: [
        { characterId: player.id, cue: 'PLAYER_CUE_MARKER 只有你注意到的细节。' },
        { characterId: other.id, cue: 'OTHER_CUE_MARKER 别人的私密线索。' },
      ],
      pressure: '压力标记',
      sceneQuestion: '问句标记',
      gmNote: 'GM_NOTE_MARKER',
      actions: [],
      adjudications: [],
      reactions: [],
      externalEvents: [],
      narration: '',
      outcomeNotes: [],
      stateChanges: null,
      nextTimeJump: null,
      ending: null,
      createdAt: now,
    });
  }
  return { base, player, other };
}

step('扮演模式 · 等待宣告的玩家视图', () => {
  const { base } = playFixture({ awaiting: true });
  const view = redactRunForPlayer(base);
  const text = JSON.stringify(view);
  for (const marker of [
    'OTHER_SECRET_MARKER',
    'OTHER_CUE_MARKER',
    'GM_NOTE_MARKER',
    'HIDDEN_CANON_MARKER',
    'DIRECTOR_NOTES_MARKER',
    'OTHER_PERSONALITY_MARKER',
  ]) {
    if (text.includes(marker)) throw new Error(`玩家视图泄露了 ${marker}`);
  }
  if (!text.includes('PLAYER_CUE_MARKER')) throw new Error('玩家视图缺少自己的私密线索');
  state.currentRun = view;
  state.active = false;
  state.selectedBeatId = null;
  state.godView = false;
  runRender.renderRunPage({ full: true, scrollTop: false });
  const html = currentViewHtml();
  if (!html.includes('轮到你行动')) throw new Error('缺少轮到你行动提示');
  if (!html.includes('PUBLIC_BRIEF_MARKER')) throw new Error('缺少公开处境');
  if (!html.includes('PLAYER_CUE_MARKER')) throw new Error('缺少自己的私密线索');
  if (html.includes('OTHER_CUE_MARKER') || html.includes('GM_NOTE_MARKER')) {
    throw new Error('扮演模式页面泄露了未知信息');
  }
  if (html.includes('data-act="toggle-god"')) throw new Error('扮演模式不应显示全知开关');
  if (!html.includes('宣告这一刻的举动')) throw new Error('缺少宣告按钮');
  if (!html.includes('play-action-form')) throw new Error('缺少举动表单');
});

step('扮演模式 · 角色档案的信息边界', () => {
  const { base, player, other } = playFixture({ awaiting: true });
  const view = redactRunForPlayer(base);
  state.currentRun = view;
  drawers.openCharacterDrawer(other.id);
  if (modalEl.innerHTML.includes('OTHER_SECRET_MARKER')) throw new Error('他人档案泄露秘密');
  if (!modalEl.innerHTML.includes('公开资料')) throw new Error('他人档案未降级为公开资料');
  drawers.openCharacterDrawer(player.id);
  if (!modalEl.innerHTML.includes('PLAYER_SECRET_MARKER')) throw new Error('玩家自己的秘密应可见');
  if (!modalEl.innerHTML.includes('只有你知道')) throw new Error('玩家档案缺少私密标记');
});

step('扮演模式 · 等待敌意回应的玩家视图', () => {
  const { base, player, other } = playFixture({ awaiting: true });
  const beat = base.beats.at(-1);
  const now = new Date().toISOString();
  beat.phase = 'player_reaction';
  base.play.awaiting = 'reaction';
  beat.actions = [
    {
      id: 'act_player',
      characterId: player.id,
      category: '调查',
      summary: '把日志摊开',
      deed: '我把守灯日志摊在灯台上。',
      effect: '逼他解释那一页。',
      hostile: false,
      description: '我把守灯日志摊在灯台上。',
      dialogue: '这一行是谁划掉的？',
      thought: 'PLAYER_THOUGHT_FOR_REACTION',
      goalProgress: '',
      stakes: '',
      ability: 'perception',
      traitName: null,
      targetId: other.id,
      targetLabel: other.name,
      status: 'declared',
      penalties: 0,
      penaltyNotes: [],
      generatedBy: 'player',
      createdAt: now,
    },
    {
      id: 'act_other',
      characterId: other.id,
      category: '战斗',
      summary: 'INCOMING_SUMMARY_MARKER',
      deed: 'INCOMING_DEED_MARKER 我按住她的手腕，去掰她手里的钥匙。',
      effect: 'INCOMING_EFFECT_MARKER 夺走总钥匙。',
      hostile: true,
      description: 'INCOMING_DEED_MARKER 我按住她的手腕，去掰她手里的钥匙。',
      dialogue: 'INCOMING_DIALOGUE_MARKER 把钥匙给我。',
      thought: 'INCOMING_THOUGHT_MARKER',
      goalProgress: '',
      stakes: '',
      ability: 'physique',
      traitName: null,
      targetId: player.id,
      targetLabel: player.name,
      status: 'declared',
      penalties: 0,
      penaltyNotes: [],
      generatedBy: 'llm',
      createdAt: now,
    },
  ];
  const view = redactRunForPlayer(base);
  const viewBeat = view.beats.at(-1);
  if (viewBeat.actions.length !== 2) throw new Error('等待回应时应保留自己的举动与指向自己的敌意举动');
  if (viewBeat.actions.some((entry) => entry.thought === 'INCOMING_THOUGHT_MARKER')) {
    throw new Error('等待回应时泄露了对方内心');
  }
  state.currentRun = view;
  state.active = false;
  state.selectedBeatId = null;
  state.godView = false;
  runRender.renderRunPage({ full: true });
  const html = currentViewHtml();
  for (const expected of ['轮到你回应', 'play-reaction-form', '继续原举动', '放下原举动', 'INCOMING_DEED_MARKER', 'INCOMING_EFFECT_MARKER', 'INCOMING_DIALOGUE_MARKER']) {
    if (!html.includes(expected)) throw new Error(`回应视图缺少「${expected}」`);
  }
  if (html.includes('INCOMING_THOUGHT_MARKER') || html.includes('INCOMING_SUMMARY_MARKER')) {
    throw new Error('回应视图泄露了敌意举动的内心或意图标题');
  }
});

step('扮演模式 · 落定后的可见记录', () => {
  const { base } = playFixture({ awaiting: false });
  const view = redactRunForPlayer(base);
  state.currentRun = view;
  state.active = false;
  state.godView = false;
  state.selectedBeatId = view.beats.at(-1)?.id || null;
  runRender.renderRunPage({ full: true });
  const html = currentViewHtml();
  if (html.includes('OTHER_SECRET_MARKER')) throw new Error('落定视图泄露他人秘密');
  if (html.includes('OTHER_PERSONALITY_MARKER')) throw new Error('落定视图泄露他人性格');
  if (!html.includes('你看见的')) throw new Error('缺少他人可观察记录');
  if (!html.includes('旁人可感知的部分')) throw new Error('缺少可见范围说明');
  if (!html.includes('你的举动')) throw new Error('缺少玩家自己的举动');
});

step('扮演模式 · 复盘解锁全部信息', () => {
  const { base } = playFixture({ recap: true });
  const view = redactRunForPlayer(base);
  if (!view.play?.recapAt) throw new Error('复盘标记缺失');
  state.currentRun = view;
  state.selectedBeatId = view.beats.at(-1)?.id || null;
  state.godView = true;
  runRender.renderRunPage({ full: true });
  const recapHtml = currentViewHtml();
  if (!recapHtml.includes('复盘模式')) throw new Error('缺少复盘模式横幅');
  if (recapHtml.includes('data-act="advance-one"')) throw new Error('复盘后仍显示推进按钮');
  if (recapHtml.includes('/export.md') === false) throw new Error('复盘后缺少导出入口');
  drawers.openRecap();
  const html = modalEl.innerHTML;
  if (!html.includes('OTHER_SECRET_MARKER')) throw new Error('复盘未公开他人秘密');
  if (!html.includes('HIDDEN_CANON_MARKER')) throw new Error('复盘未公开导演级真相');
  if (!html.includes('逐刻全记录')) throw new Error('复盘缺少逐刻记录');
  if (!html.includes('导出完整战报')) throw new Error('复盘缺少导出入口');
});

step('新建页 · 扮演模式角色选择', () => {
  const { player, other } = playFixture({ awaiting: false });
  state.view = 'new';
  state.create.mode = 'preset';
  state.create.play.enabled = true;
  state.create.play.loading = false;
  state.create.play.castError = null;
  state.create.play.cast = [
    {
      id: player.id,
      name: player.name,
      title: player.title,
      publicProfile: player.publicProfile,
      passive: false,
    },
    {
      id: other.id,
      name: other.name,
      title: other.title,
      publicProfile: other.publicProfile,
      passive: false,
    },
  ];
  state.create.play.characterId = player.id;
  createRender.renderCreatePage();
  const html = currentViewHtml();
  if (!html.includes('扮演模式')) throw new Error('缺少扮演模式选项');
  if (!html.includes('play-cast-card')) throw new Error('缺少角色选择卡');
  if (!html.includes(player.name) || !html.includes(other.name)) throw new Error('角色选择缺少角色');
  if (!html.includes('你拿到的是这个角色的可知信息')) throw new Error('缺少信息边界说明');
});

console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
process.exit(failures ? 1 : 0);
