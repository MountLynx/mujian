import assert from 'node:assert/strict';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { RunStore } from '../src/engine/store.ts';
import { WorldStore } from '../src/world/store.ts';
import { ProjectStore } from '../src/projects/store.ts';
import { migrateProjects } from '../src/projects/migrate.ts';
import { ProjectsLayout, type StoreDirs } from '../src/projects/layout.ts';
import { worldRunSummary } from '../src/world/run.ts';
import type { Run } from '../src/types.ts';
import type { WorldRun } from '../src/world/types.ts';

/* ---- 夹具 ---- */

function tempRoot(): { root: string; dirs: StoreDirs } {
  const root = fsSync.mkdtempSync(path.join(os.tmpdir(), 'mes-projects-'));
  return {
    root,
    dirs: {
      projectsDir: path.join(root, 'projects'),
      legacyRunsDir: path.join(root, 'runs'),
      legacyWorldsDir: path.join(root, 'worlds'),
    },
  };
}

let seq = 0;

function makeRun(overrides: Partial<Run> = {}): Run {
  seq += 1;
  const now = new Date(Date.now() + seq * 1000).toISOString();
  return {
    version: 1,
    id: `run_t${String(seq).padStart(10, '0')}`,
    seed: 'seed',
    status: 'paused',
    scenario: {
      id: 'scene',
      title: `测试场景 ${seq}`,
      subtitle: '短篇副标题',
      kicker: '测试',
      world: {} as Run['scenario']['world'],
      characters: [{ id: 'a', name: '甲' }] as Run['scenario']['characters'],
      rules: { maxBeats: 4 },
    },
    settings: { maxBeats: 4, thinking: 'auto', model: 'fake', autoLimit: 4 },
    createdAt: now,
    updatedAt: now,
    clock: {} as Run['clock'],
    world: {} as Run['world'],
    characters: {},
    beats: [
      { id: 'b1', index: 0, phase: 'complete', title: '第一刻' },
      { id: 'b2', index: 1, phase: 'complete', title: '第二刻' },
    ] as Run['beats'],
    progress: {} as Run['progress'],
    llm: {} as Run['llm'],
    ending: null,
    error: null,
    worldLink: undefined,
    ...overrides,
  } as Run;
}

function makeWorld(overrides: Partial<WorldRun> = {}): WorldRun {
  seq += 1;
  const now = new Date(Date.now() + seq * 1000).toISOString();
  return {
    version: 1,
    id: `world_t${String(seq).padStart(9, '0')}`,
    seed: 'seed',
    status: 'paused',
    definition: {
      id: 'preset',
      title: `世界 ${seq}`,
      subtitle: '',
      kicker: '归潮历 73 年',
      setting: {
        threads: [],
        regions: [],
        factions: [],
        actors: [],
        initialFacts: [],
        initialSignals: [],
      },
      rules: { maxEpochs: 4, defaultAdvanceMinutes: 60, sceneMaxBeats: 3, spotlightPolicy: '' },
    } as unknown as WorldRun['definition'],
    settings: { maxEpochs: 4, thinking: 'auto', model: 'fake', autoEpochs: 3 },
    createdAt: now,
    updatedAt: now,
    error: null,
    elapsedMinutes: 0,
    clock: { elapsedMinutes: 0, day: 1, time: '22:00', display: '测试 · 第 1 日 22:00' },
    epochIndex: 0,
    regions: {},
    factions: {},
    actors: {},
    threads: {
      thread_a: { id: 'thread_a', tension: 3, clockValue: 2, status: 'active', note: '', history: [] },
      thread_b: { id: 'thread_b', tension: 1, clockValue: 1, status: 'resolved', note: '', history: [] },
    },
    facts: [],
    signals: [
      { id: 'sig1', status: 'pending' },
      { id: 'sig2', status: 'delivered' },
    ] as WorldRun['signals'],
    events: [],
    epochs: [{ index: 0, title: '第一纪元' }] as WorldRun['epochs'],
    sceneHooks: [],
    sceneRuns: [
      { hookId: 'h1', runId: 'run_x1', status: 'created', runStatus: 'paused', beatCount: 2, addedAt: now },
      { hookId: 'h2', runId: 'run_x2', status: 'completed', beatCount: 3, addedAt: now },
      { hookId: 'h3', runId: 'run_x3', status: 'created', runStatus: 'ready', beatCount: 0, addedAt: now },
    ],
    progress: {} as WorldRun['progress'],
    llm: {} as WorldRun['llm'],
    lastTimeJump: null,
    ...overrides,
  } as WorldRun;
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 新布局模式要求 projects/ 存在且非空；测试里先落一份清单再使用各 store，
 * 保证模式判定为 projects（判定只做一次）。
 */
async function seedProjectsMode(dirs: StoreDirs, seed: {
  id: string;
  kind: 'world' | 'short';
  title: string;
}): Promise<void> {
  const projects = new ProjectStore(new ProjectsLayout(dirs));
  await projects.ensureManifest({
    id: seed.id,
    kind: seed.kind,
    title: seed.title,
    kicker: '',
    status: 'unknown',
    updatedAt: new Date().toISOString(),
  });
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

/* ---- 迁移 ---- */

test('迁移：世界线归位、聚焦场景回归世界、独立推演成短篇、旧目录改名备份', async () => {
  const { root, dirs } = tempRoot();
  const world = makeWorld();
  const scene = makeRun({ worldLink: { worldId: world.id, worldTitle: world.definition.title, hookId: 'h1', eventId: 'e', regionId: 'r' } });
  const short = makeRun();
  await writeJson(path.join(dirs.legacyWorldsDir, `${world.id}.json`), world);
  await writeJson(path.join(dirs.legacyRunsDir, `${scene.id}.json`), scene);
  await writeJson(path.join(dirs.legacyRunsDir, `${short.id}.json`), short);

  const report = await migrateProjects(dirs);
  assert.equal(report.worlds, 1);
  assert.equal(report.scenesRehomed, 1);
  assert.equal(report.shorts, 1);
  assert.ok(report.backupDir);

  assert.equal(await exists(path.join(dirs.projectsDir, world.id, 'world.json')), true);
  assert.equal(await exists(path.join(dirs.projectsDir, world.id, 'runs', `${scene.id}.json`)), true);
  assert.equal(await exists(path.join(dirs.projectsDir, short.id, 'run.json')), true);

  const manifest = JSON.parse(
    await fs.readFile(path.join(dirs.projectsDir, world.id, 'project.json'), 'utf8'),
  );
  assert.equal(manifest.kind, 'world');
  assert.equal(manifest.title, world.definition.title);
  assert.equal(manifest.archived, false);
  assert.deepEqual(
    manifest.entries.map((entry: { id: string }) => entry.id),
    [scene.id],
  );

  const shortManifest = JSON.parse(
    await fs.readFile(path.join(dirs.projectsDir, short.id, 'project.json'), 'utf8'),
  );
  assert.equal(shortManifest.kind, 'short');
  assert.equal(shortManifest.title, short.scenario.title);

  // 旧目录应已改名到备份里
  assert.equal(await exists(dirs.legacyRunsDir), false);
  assert.equal(await exists(dirs.legacyWorldsDir), false);
  assert.equal(await exists(path.join(report.backupDir!, 'runs', `${short.id}.json`)), true);
  assert.equal(await exists(path.join(report.backupDir!, 'worlds', `${world.id}.json`)), true);
  assert.ok(root);
});

test('迁移：幂等重跑——目标已存在则跳过且不重复登记 entries', async () => {
  const { dirs } = tempRoot();
  const world = makeWorld();
  const scene = makeRun({ worldLink: { worldId: world.id, worldTitle: world.definition.title, hookId: 'h1', eventId: 'e', regionId: 'r' } });
  await writeJson(path.join(dirs.legacyWorldsDir, `${world.id}.json`), world);
  await writeJson(path.join(dirs.legacyRunsDir, `${scene.id}.json`), scene);

  await migrateProjects(dirs);
  // 重跑：旧目录已经改名走，不应报任何迁移量，也不应炸
  const second = await migrateProjects(dirs);
  assert.equal(second.worlds, 0);
  assert.equal(second.scenesRehomed, 0);
  assert.equal(second.shorts, 0);

  const manifest = JSON.parse(
    await fs.readFile(path.join(dirs.projectsDir, world.id, 'project.json'), 'utf8'),
  );
  assert.equal(manifest.entries.length, 1);
});

test('迁移：部分完成的布局可以续迁（占位清单升级为世界本体信息）', async () => {
  const { dirs } = tempRoot();
  const world = makeWorld();
  // 场景先落位（模拟上次迁移中途失败）：清单由场景 run 生成，标题是占位
  const scene = makeRun({ worldLink: { worldId: world.id, worldTitle: world.definition.title, hookId: 'h1', eventId: 'e', regionId: 'r' } });
  const projects = new ProjectStore(new ProjectsLayout(dirs));
  await projects.ensureManifest({
    id: world.id,
    kind: 'world',
    title: world.definition.title,
    kicker: '',
    status: 'unknown',
    updatedAt: scene.updatedAt,
    entry: { id: scene.id, kind: 'run', addedAt: scene.createdAt },
  });
  await writeJson(path.join(dirs.legacyWorldsDir, `${world.id}.json`), world);
  await writeJson(path.join(dirs.legacyRunsDir, `${scene.id}.json`), scene);

  const report = await migrateProjects(dirs);
  assert.equal(report.worlds, 1);
  assert.equal(report.scenesRehomed, 1, '场景目标已存在，应计入跳过');

  const manifest = JSON.parse(
    await fs.readFile(path.join(dirs.projectsDir, world.id, 'project.json'), 'utf8'),
  );
  assert.equal(manifest.entries.length, 1, 'entries 不应重复');
});

test('迁移：写入失败时中止且旧目录保持原位', async () => {
  const { dirs } = tempRoot();
  const world = makeWorld();
  await writeJson(path.join(dirs.legacyWorldsDir, `${world.id}.json`), world);
  // 让清单的落点变成一个目录，写入必然失败
  await fs.mkdir(path.join(dirs.projectsDir, world.id, 'project.json'), { recursive: true });
  await assert.rejects(() => migrateProjects(dirs));
  assert.equal(await exists(dirs.legacyWorldsDir), true, '失败时旧目录不能被改名');
});

test('迁移状态：旧布局有数据 → needed；迁移后 → false', async () => {
  const { dirs } = tempRoot();
  const world = makeWorld();
  await writeJson(path.join(dirs.legacyWorldsDir, `${world.id}.json`), world);
  await writeJson(path.join(dirs.legacyRunsDir, 'run_empty.json'), { id: 'run_empty' });

  const before = await new ProjectStore(new ProjectsLayout(dirs)).migrationStatus();
  assert.deepEqual(before, { needed: true, worlds: 1, runs: 1 });

  await migrateProjects(dirs);
  // 迁移后 projects 非空 → 新布局模式
  const after = await new ProjectStore(new ProjectsLayout(dirs)).migrationStatus();
  assert.deepEqual(after, { needed: false, worlds: 0, runs: 0 });
});

/* ---- RunStore / WorldStore 新布局 ---- */

test('新布局：world → 场景 → 短篇的 save/load/list 往返与清单登记', async () => {
  const { dirs } = tempRoot();
  const layout = new ProjectsLayout(dirs);
  const runStore = new RunStore(layout);
  const worldStore = new WorldStore(layout);

  const world = makeWorld();
  await seedProjectsMode(dirs, { id: world.id, kind: 'world', title: world.definition.title });
  await worldStore.save(world);
  assert.equal(await exists(path.join(dirs.projectsDir, world.id, 'world.json')), true);
  const manifest = JSON.parse(
    await fs.readFile(path.join(dirs.projectsDir, world.id, 'project.json'), 'utf8'),
  );
  assert.equal(manifest.status, world.status, 'world save 应刷新清单 status');

  const scene = makeRun({ worldLink: { worldId: world.id, worldTitle: world.definition.title, hookId: 'h1', eventId: 'e', regionId: 'r' } });
  await runStore.save(scene);
  const loadedScene = await runStore.load(scene.id);
  assert.ok(loadedScene);
  assert.equal(loadedScene.id, scene.id);

  const short = makeRun();
  await runStore.save(short);
  assert.equal(await exists(path.join(dirs.projectsDir, short.id, 'run.json')), true);
  const loadedShort = await runStore.load(short.id);
  assert.ok(loadedShort);

  const summaries = await runStore.list();
  assert.equal(summaries.length, 2);
  const shortSummary = summaries.find((item) => item.id === short.id)!;
  assert.equal(shortSummary.maxBeats, 4);
  assert.equal(shortSummary.beats, 2);

  assert.equal(await runStore.load('run_missing'), null, '索引 miss → null');

  // ensureManifest 幂等：重复 save 不重复登记
  await runStore.save(scene);
  const manifestAgain = JSON.parse(
    await fs.readFile(path.join(dirs.projectsDir, world.id, 'project.json'), 'utf8'),
  );
  assert.equal(manifestAgain.entries.length, 1);
  // run save 会刷新世界项目的 updatedAt
  assert.equal(manifestAgain.updatedAt, scene.updatedAt);
});

test('旧布局：无 projects 目录时保持原扁平路径读写', async () => {
  const { dirs } = tempRoot();
  const runStore = new RunStore(new ProjectsLayout(dirs));
  const run = makeRun();
  await runStore.save(run);
  assert.equal(await exists(path.join(dirs.legacyRunsDir, `${run.id}.json`)), true);
  assert.equal(await exists(dirs.projectsDir), false, '旧布局模式不应创建 projects 目录');
  const loaded = await runStore.load(run.id);
  assert.ok(loaded);
  const summaries = await runStore.list();
  assert.equal(summaries.length, 1);
});

/* ---- ProjectStore ---- */

test('ProjectStore：总览统计（读时计算）', async () => {
  const { dirs } = tempRoot();
  const layout = new ProjectsLayout(dirs);
  const runStore = new RunStore(layout);
  const worldStore = new WorldStore(layout);

  const world = makeWorld();
  await seedProjectsMode(dirs, { id: world.id, kind: 'world', title: world.definition.title });
  await worldStore.save(world);
  const scene = makeRun({ worldLink: { worldId: world.id, worldTitle: world.definition.title, hookId: 'h1', eventId: 'e', regionId: 'r' } });
  await runStore.save(scene);
  const short = makeRun();
  await runStore.save(short);

  const projects = await new ProjectStore(layout).list();
  assert.equal(projects.length, 2);
  const worldSummary = projects.find((project) => project.id === world.id)!;
  assert.equal(worldSummary.kind, 'world');
  assert.equal(worldSummary.epochCount, 1);
  assert.equal(worldSummary.maxEpochs, 4);
  assert.equal(worldSummary.openThreads, 1, '只有 active 线程计入开放线程');
  assert.equal(worldSummary.unsealedScenes, 1, 'beatCount>0 且未收束的场景数');
  assert.equal(worldSummary.pendingSignals, 1);
  assert.equal(worldSummary.lastActivityTitle, '第一纪元');
  assert.equal(worldSummary.sceneEntries.length, 1);
  assert.equal(worldSummary.sceneEntries[0].id, scene.id);

  const shortSummary = projects.find((project) => project.id === short.id)!;
  assert.equal(shortSummary.kind, 'short');
  assert.equal(shortSummary.beats, 2);
  assert.equal(shortSummary.maxBeats, 4);
  assert.equal(shortSummary.currentBeatTitle, '第二刻');
});

test('ProjectStore：归档与恢复', async () => {
  const { dirs } = tempRoot();
  const layout = new ProjectsLayout(dirs);
  const store = new ProjectStore(layout);
  const world = makeWorld();
  await seedProjectsMode(dirs, { id: world.id, kind: 'world', title: world.definition.title });
  await new WorldStore(layout).save(world);

  await store.setArchived(world.id, true);
  let projects = await store.list();
  assert.equal(projects[0].archived, true);

  await store.setArchived(world.id, false);
  projects = await store.list();
  assert.equal(projects[0].archived, false);
});

test('ProjectStore：世界项目级联删除（含场景数返回与索引清理）', async () => {
  const { dirs } = tempRoot();
  const layout = new ProjectsLayout(dirs);
  const runStore = new RunStore(layout);
  const projectStore = new ProjectStore(layout);
  const world = makeWorld();
  await seedProjectsMode(dirs, { id: world.id, kind: 'world', title: world.definition.title });
  await new WorldStore(layout).save(world);
  const sceneA = makeRun({ worldLink: { worldId: world.id, worldTitle: world.definition.title, hookId: 'h1', eventId: 'e', regionId: 'r' } });
  const sceneB = makeRun({ worldLink: { worldId: world.id, worldTitle: world.definition.title, hookId: 'h2', eventId: 'e', regionId: 'r' } });
  await runStore.save(sceneA);
  await runStore.save(sceneB);
  // 预热索引
  assert.ok(await runStore.load(sceneA.id));

  const result = await projectStore.delete(world.id);
  assert.equal(result.deletedScenes, 2);
  assert.equal(await exists(path.join(dirs.projectsDir, world.id)), false);
  assert.equal(await runStore.load(sceneA.id), null, '级联删除后场景读取应为 null');
  assert.equal(await runStore.load(sceneB.id), null);
  assert.equal(await new WorldStore(layout).load(world.id), null);
});

test('ProjectStore：短篇项目删除', async () => {
  const { dirs } = tempRoot();
  const layout = new ProjectsLayout(dirs);
  const runStore = new RunStore(layout);
  const projectStore = new ProjectStore(layout);
  const short = makeRun();
  await seedProjectsMode(dirs, { id: short.id, kind: 'short', title: short.scenario.title });
  await runStore.save(short);

  const result = await projectStore.delete(short.id);
  assert.equal(result.deletedScenes, 0);
  assert.equal(await exists(path.join(dirs.projectsDir, short.id)), false);
  assert.equal(await runStore.load(short.id), null);
});

/* ---- summary 扩展字段 ---- */

test('worldRunSummary：openThreads / unsealedScenes / pendingSignals', () => {
  const world = makeWorld();
  const summary = worldRunSummary(world);
  assert.equal(summary.openThreads, 1);
  assert.equal(summary.unsealedScenes, 1);
  assert.equal(summary.pendingSignals, 1);
  assert.equal(summary.epochCount, 1);
});
