import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, hasLlmCredentials } from './config.ts';
import { createLanguageModel } from './llm/client.ts';
import { RunStore } from './engine/store.ts';
import { createRun } from './engine/run.ts';
import { RunEngine } from './engine/engine.ts';
import {
  createPlayConfig,
  playAwaiting,
  PlayInputError,
  submitPlayerAction,
  submitPlayerReaction,
  unlockRecap,
} from './engine/play.ts';
import { redactRunForPlayer } from './engine/playerView.ts';
import { WorldStore } from './world/store.ts';
import { createWorldRun } from './world/run.ts';
import { WorldEngine } from './world/engine.ts';
import { buildWorldScene } from './world/scene.ts';
import { ProjectStore } from './projects/store.ts';
import { ProjectsLayout } from './projects/layout.ts';
import {
  getWorldPreset,
  loadWorldPresets,
  normalizeWorld,
  WorldValidationError,
  worldPresetSummary,
} from './world/definition.ts';
import { renderWorldMarkdown } from './render/worldMarkdown.ts';
import {
  getPresetScenario,
  loadPresetScenarios,
  normalizeScenario,
  ScenarioValidationError,
  scenarioSummary,
} from './engine/scenario.ts';
import { renderMarkdown } from './render/markdown.ts';
import { ProseWorkflow } from './prose/workflow.ts';
import type { Run, ThinkingMode } from './types.ts';
import { clamp, newId, nowIso, truncate } from './utils.ts';

const layout = new ProjectsLayout();
const store = new RunStore(layout);
const worldStore = new WorldStore(layout);
const projectStore = new ProjectStore(layout);
const model = createLanguageModel();
const missingKeyName = config.llm.provider === 'minimax' ? 'MINIMAX_API_KEY' : 'DEEPSEEK_API_KEY';
const activeJobs = new Map<
  string,
  { stopRequested: boolean; mode: 'one' | 'auto'; startedAt: string }
>();
const activeWorldJobs = new Map<
  string,
  { stopRequested: boolean; mode: 'one' | 'auto'; startedAt: string }
>();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(data);
}

function sendText(
  res: http.ServerResponse,
  status: number,
  body: string,
  contentType = 'text/plain; charset=utf-8',
  extraHeaders: Record<string, string> = {},
): void {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(body);
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 2_000_000) throw new Error('请求体过大');
    chunks.push(buffer);
  }
  if (!size) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new Error('请求体必须是合法 JSON');
  }
}

function thinking(value: unknown, fallback: ThinkingMode): ThinkingMode {
  return value === 'auto' || value === 'enabled' || value === 'disabled' ? value : fallback;
}

/** Play mode may be requested as `play: { characterId }` or a flat field. */
function requestedPlayCharacterId(body: Record<string, unknown>): unknown {
  const play = body.play;
  if (play && typeof play === 'object' && !Array.isArray(play)) {
    const record = play as Record<string, unknown>;
    return record.characterId ?? record.playerCharacterId;
  }
  return body.playCharacterId;
}

function playRequested(body: Record<string, unknown>): boolean {
  return (body.play !== undefined && body.play !== null) || typeof body.playerCharacterId === 'string';
}

async function loadRun(id: string): Promise<Run | null> {
  return store.load(id);
}

type DeleteProjectResult =
  | { ok: true; deletedScenes: number }
  | { error: string; status: number };

/** 项目级联删除（世界项目含全部聚焦场景）；运行中的世界/场景会拒绝删除。 */
async function deleteProjectWithGuards(projectId: string): Promise<DeleteProjectResult> {
  const manifest = await projectStore.readManifest(projectId);
  if (!manifest) return { error: '找不到这个项目。', status: 404 };
  if (manifest.kind === 'world') {
    if (activeWorldJobs.has(projectId)) return { error: '世界正在推演，无法删除。', status: 409 };
    if (manifest.entries.some((entry) => activeJobs.has(entry.id))) {
      return { error: '该项目有聚焦场景正在推演，无法删除。', status: 409 };
    }
  } else if (activeJobs.has(projectId)) {
    return { error: '推演正在进行，无法删除。', status: 409 };
  }
  const { deletedScenes } = await projectStore.delete(projectId);
  return { ok: true, deletedScenes };
}

function progressRunning(run: Run, label: string): void {
  run.status = 'running';
  run.error = null;
  run.progress = {
    phase: 'between',
    label,
    updatedAt: nowIso(),
  };
}

function startJob(
  initial: Run,
  mode: 'one' | 'auto',
  requestedBeats: number,
): { started: boolean; reason?: string } {
  if (activeJobs.has(initial.id)) return { started: false, reason: '这一场已经在推演中。' };
  if (initial.ending) return { started: false, reason: '这一场已经结束。' };
  if (initial.play?.recapAt) return { started: false, reason: '这一场已经复盘并结束。' };
  if (initial.play && mode === 'auto') {
    return { started: false, reason: '扮演模式需要你逐刻宣告，不能连续推演。' };
  }
  if (playAwaiting(initial)) {
    return { started: false, reason: '轮到你输入，请先完成你的举动或回应。' };
  }
  if (mode === 'auto' && initial.beats.filter((beat) => beat.phase === 'complete').length >= initial.settings.maxBeats) {
    return { started: false, reason: '已经达到本场设定的时刻上限，可以单步继续或新建一场。' };
  }
  activeJobs.set(initial.id, {
    stopRequested: false,
    mode,
    startedAt: nowIso(),
  });

  void (async () => {
    const run = initial;
    const job = activeJobs.get(run.id)!;
    const engine = new RunEngine(run, model, {
      persist: (state) => store.save(state),
      log: (message, detail) => console.log(`[${run.id}] ${message}`, detail ?? ''),
    });
    let completedThisRequest = 0;
    try {
      progressRunning(run, mode === 'one' ? '正在推进一刻' : '连续推演中');
      await store.save(run);

      while (!job.stopRequested) {
        const completedTotal = run.beats.filter((beat) => beat.phase === 'complete').length;
        if (run.ending) break;
        if (completedThisRequest >= requestedBeats) break;
        if (mode === 'auto' && completedTotal >= run.settings.maxBeats) break;
        if (mode === 'one' && completedThisRequest >= 1) break;

        await engine.advanceOne();
        completedThisRequest += 1;

        if (run.status === 'awaiting') break;
        if (run.status === 'error') break;
        if (run.ending) break;
        if (job.stopRequested) break;
        if (completedThisRequest >= requestedBeats) break;

        progressRunning(run, '准备下一时刻');
        await store.save(run);
      }

      if (run.status !== 'ended' && run.status !== 'error' && run.status !== 'awaiting') {
        if (mode === 'auto') {
          run.status = 'paused';
          const reachedLimit =
            run.beats.filter((beat) => beat.phase === 'complete').length >= run.settings.maxBeats;
          run.progress = {
            phase: 'idle',
            label: job.stopRequested
              ? '已在本刻结束后暂停'
              : reachedLimit
                ? '已抵达本场设定的时刻上限'
                : '本轮连续推演结束',
            updatedAt: nowIso(),
          };
        } else {
          run.status = 'ready';
          run.progress = { phase: 'idle', label: '等待下一时刻', updatedAt: nowIso() };
        }
        await store.save(run);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${run.id}] 推演失败`, message);
      if (run.status !== 'error') {
        run.status = 'error';
        run.error = message.slice(0, 1200);
        run.progress = { phase: 'idle', label: '本刻中断，可从断点重试', updatedAt: nowIso() };
        await store.save(run).catch((saveError) => console.error('保存失败', saveError));
      }
    } finally {
      activeJobs.delete(run.id);
    }
  })();

  return { started: true };
}


function startWorldJob(
  initial: import('./world/types.ts').WorldRun,
  mode: 'one' | 'auto',
  requestedEpochs: number,
): { started: boolean; reason?: string } {
  if (activeWorldJobs.has(initial.id)) return { started: false, reason: '这个世界已经在推演中。' };
  if (initial.status === 'ended') return { started: false, reason: '这个世界已经结束。' };
  if (mode === 'auto' && initial.epochs.length >= initial.settings.maxEpochs) {
    return { started: false, reason: '已经达到本世界的预设纪元上限，可以单步继续。' };
  }
  activeWorldJobs.set(initial.id, {
    stopRequested: false,
    mode,
    startedAt: nowIso(),
  });

  void (async () => {
    const run = initial;
    const job = activeWorldJobs.get(run.id)!;
    const engine = new WorldEngine(run, model, {
      persist: (state) => worldStore.save(state),
      log: (message, detail) => console.log(`[${run.id}] ${message}`, detail ?? ''),
    });
    let completedThisRequest = 0;
    try {
      run.status = 'running';
      run.error = null;
      run.progress = {
        phase: 'planning',
        label: mode === 'one' ? '世界正在推进一个纪元' : '世界正在连续运转',
        updatedAt: nowIso(),
      };
      await worldStore.save(run);
      while (!job.stopRequested) {
        if (run.epochs.length >= run.settings.maxEpochs && mode === 'auto') break;
        if (completedThisRequest >= requestedEpochs) break;
        await engine.advanceEpoch();
        completedThisRequest += 1;
        if (run.error) break;
        if (job.stopRequested) break;
        if (completedThisRequest >= requestedEpochs) break;
        if (mode === 'auto' && run.epochs.length >= run.settings.maxEpochs) break;
        run.status = 'running';
        run.progress = {
          phase: 'planning',
          label: '准备下一纪元',
          detail: '世界在继续呼吸。',
          updatedAt: nowIso(),
        };
        await worldStore.save(run);
      }
      if (!run.error) {
        if (mode === 'auto') {
          run.status = 'paused';
          const atLimit = run.epochs.length >= run.settings.maxEpochs;
          run.progress = {
            phase: 'idle',
            label: job.stopRequested
              ? '已在本纪元结束后暂停'
              : atLimit
                ? '已抵达本世界设定的纪元上限'
                : '本轮推演结束',
            updatedAt: nowIso(),
          };
        } else {
          run.status = 'ready';
          run.progress = { phase: 'idle', label: '世界等待下一纪元', updatedAt: nowIso() };
        }
        await worldStore.save(run);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${run.id}] world epoch failed`, message);
      if (run.status !== 'error') {
        run.status = 'error';
        run.error = message.slice(0, 1600);
        run.progress = { phase: 'idle', label: '这一纪元中断，可从断点重试', updatedAt: nowIso() };
        await worldStore.save(run).catch((saveError) => console.error('save world failed', saveError));
      }
    } finally {
      activeWorldJobs.delete(run.id);
    }
  })();

  return { started: true };
}

async function recoverInterruptedWorlds(): Promise<void> {
  const summaries = await worldStore.list();
  for (const summary of summaries) {
    if (summary.status !== 'running') continue;
    const run = await worldStore.load(summary.id);
    if (!run) continue;
    run.status = 'paused';
    run.error = '服务在当前纪元中途重启，世界已停在断点。可以继续。';
    run.progress = { phase: 'idle', label: '服务重启，等待继续', updatedAt: nowIso() };
    await worldStore.save(run);
  }
}

async function recoverInterruptedRuns(): Promise<void> {
  const summaries = await store.list();
  for (const summary of summaries) {
    if (summary.status !== 'running') continue;
    const run = await store.load(summary.id);
    if (!run) continue;
    run.status = 'paused';
    run.error = '服务在当前时刻中途重启，推演已停在断点。可以继续。';
    run.progress = { phase: 'idle', label: '服务重启，等待继续', updatedAt: nowIso() };
    await store.save(run);
  }
}


async function syncWorldSceneRuns(world: import('./world/types.ts').WorldRun): Promise<void> {
  let dirty = false;
  for (const scene of world.sceneRuns) {
    if (scene.status === 'completed') continue;
    const run = await store.load(scene.runId);
    if (!run) continue;
    const beats = run.beats.filter((beat) => beat.phase === 'complete').length;
    if (scene.runStatus !== run.status) {
      scene.runStatus = run.status;
      dirty = true;
    }
    if (scene.beatCount !== beats) {
      scene.beatCount = beats;
      dirty = true;
    }
  }
  if (dirty) {
    world.updatedAt = nowIso();
    await worldStore.save(world);
  }
}

async function sealWorldScene(world: import('./world/types.ts').WorldRun, runId: string) {
  const scene = world.sceneRuns.find((entry) => entry.runId === runId);
  if (!scene) throw new Error('这个本地场景不属于当前世界。');
  const run = await store.load(runId);
  if (!run) throw new Error('找不到这个本地场景。');
  const hook = world.sceneHooks.find((entry) => entry.id === scene.hookId);
  if (!hook) throw new Error('找不到对应的世界场景契约。');
  if (scene.status === 'completed') {
    if (!run.worldSceneSealed) {
      run.worldSceneSealed = true;
      await store.save(run);
    }
    return scene;
  }
  const complete = run.beats.filter((beat) => beat.phase === 'complete');
  if (!complete.length) throw new Error('本地场景还没有完成的时刻，无法收束。');
  const selected = complete.slice(-2);
  const summary = selected
    .map((beat) => `【第 ${beat.index + 1} 刻】${beat.narration || beat.title}`)
    .join('\n')
    .slice(0, 1600);
  scene.status = 'completed';
  scene.summary = summary;
  scene.completedAt = nowIso();
  scene.beatCount = complete.length;
  scene.runStatus = run.status;
  hook.status = 'completed';

  const epochIndex = Math.max(0, world.epochs.length - 1);
  world.updatedAt = nowIso();
  const compactSummary = truncate(summary, 720);
  const fact = {
    id: newId('fact'),
    text: `聚焦场景「${hook.title}」的公开结局：${compactSummary}`,
    importance: 4,
    knownBy: [...new Set(hook.participantIds)],
    createdEpoch: epochIndex,
    sourceEventId: null as string | null,
    tag: '聚焦场景',
    public: false,
    retiredAtEpoch: null,
  };
  const sceneEvent: import('./world/types.ts').WorldEvent = {
    id: newId('wevt'),
    epochIndex,
    at: world.elapsedMinutes,
    clock: world.clock,
    localId: `scene-${run.id}`,
    parentId: null,
    childIds: [],
    kind: 'scene',
    title: hook.title,
    regionId: hook.regionId,
    actorIds: [...hook.participantIds],
    factionIds: hook.participantIds
      .map((id) => world.definition.setting.actors.find((actor) => actor.id === id)?.factionId)
      .filter((id): id is string => Boolean(id)),
    summary: `聚焦场景结束：${compactSummary}`,
    publicNarrative: hook.publicBrief,
    visibility: 'mixed',
    effects: {
      factIdsAdded: [fact.id],
      factIdsRemoved: [],
      regionChanges: [],
      factionChanges: [],
      actorChanges: [],
      threadChanges: [],
    },
    signalIds: [],
    sceneHookId: hook.id,
    createdAt: nowIso(),
  };
  fact.sourceEventId = sceneEvent.id;
  world.facts.push(fact);
  world.events.push(sceneEvent);
  const epoch = world.epochs[epochIndex];
  if (epoch) epoch.eventIds.push(sceneEvent.id);
  run.worldSceneSealed = true;
  await store.save(run);
  await worldStore.save(world);
  return scene;
}

async function serveStatic(urlPath: string, res: http.ServerResponse): Promise<boolean> {
  let relative = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
  if (relative.includes('..')) return false;
  if (!relative || relative.endsWith('/')) relative = `${relative}index.html`;
  const filePath = path.resolve(config.publicDir, relative);
  if (!filePath.startsWith(config.publicDir + path.sep) && filePath !== config.publicDir) return false;
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
    });
    res.end(data);
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  const method = req.method ?? 'GET';
  let pathname = '/';
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    sendJson(res, 400, { error: '非法请求路径。' });
    return;
  }
  try {
    if (pathname.startsWith('/api/')) {
      if (method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
          ok: true,
          version: config.version,
          provider: config.llm.provider,
          model: config.llm.model,
          effort: config.llm.effort || undefined,
          thinking: config.llm.thinking,
          hasApiKey: hasLlmCredentials(),
          activeRuns: activeJobs.size,
          activeWorlds: activeWorldJobs.size,
          migration: await projectStore.migrationStatus(),
        });
        return;
      }

      if (method === 'GET' && pathname === '/api/projects') {
        sendJson(res, 200, { projects: await projectStore.list() });
        return;
      }

      const projectArchiveMatch = pathname.match(
        /^\/api\/projects\/([a-zA-Z0-9_-]+)\/(archive|unarchive)$/,
      );
      if (projectArchiveMatch && method === 'POST') {
        try {
          await projectStore.setArchived(projectArchiveMatch[1]!, projectArchiveMatch[2] === 'archive');
          sendJson(res, 200, { ok: true });
        } catch (error) {
          sendJson(res, 404, { error: error instanceof Error ? error.message : '找不到这个项目。' });
        }
        return;
      }

      const projectMatch = pathname.match(/^\/api\/projects\/([a-zA-Z0-9_-]+)$/);
      if (projectMatch && method === 'DELETE') {
        const result = await deleteProjectWithGuards(projectMatch[1]!);
        if ('ok' in result) sendJson(res, 200, result);
        else sendJson(res, result.status, { error: result.error });
        return;
      }

      if (method === 'GET' && pathname === '/api/scenarios') {
        const scenarios = await loadPresetScenarios();
        sendJson(res, 200, { scenarios: scenarios.map(scenarioSummary) });
        return;
      }

      const scenarioCastMatch = pathname.match(/^\/api\/scenarios\/([a-zA-Z0-9_-]+)\/cast$/);
      if (method === 'GET' && scenarioCastMatch) {
        const scenario = await getPresetScenario(scenarioCastMatch[1]!);
        if (!scenario) {
          sendJson(res, 404, { error: '找不到这个预置剧本。' });
          return;
        }
        // Play-mode setup must not read the preset's secrets just to pick a role.
        sendJson(res, 200, {
          id: scenario.id,
          title: scenario.title,
          subtitle: scenario.subtitle,
          kicker: scenario.kicker,
          location: scenario.world.location,
          cast: scenario.characters.map((character) => ({
            id: character.id,
            name: character.name,
            title: character.title,
            age: character.age,
            pronouns: character.pronouns,
            publicProfile: character.publicProfile,
            appearance: character.appearance,
            passive: Boolean(character.passive),
          })),
        });
        return;
      }

      const scenarioMatch = pathname.match(/^\/api\/scenarios\/([a-zA-Z0-9_-]+)$/);
      if (method === 'GET' && scenarioMatch) {
        const scenario = await getPresetScenario(scenarioMatch[1]!);
        if (!scenario) {
          sendJson(res, 404, { error: '找不到这个预置剧本。' });
          return;
        }
        sendJson(res, 200, { scenario });
        return;
      }


      if (method === 'GET' && pathname === '/api/world-presets') {
        const presets = await loadWorldPresets();
        sendJson(res, 200, { presets: presets.map(worldPresetSummary) });
        return;
      }

      const worldPresetMatch = pathname.match(/^\/api\/world-presets\/([a-zA-Z0-9_-]+)$/);
      if (method === 'GET' && worldPresetMatch) {
        const preset = await getWorldPreset(worldPresetMatch[1]!);
        if (!preset) {
          sendJson(res, 404, { error: '找不到这个世界预置。' });
          return;
        }
        sendJson(res, 200, { worldPreset: preset });
        return;
      }

      if (pathname === '/api/worlds' && method === 'GET') {
        sendJson(res, 200, { worlds: await worldStore.list() });
        return;
      }

      if (pathname === '/api/worlds' && method === 'POST') {
        const body = (await readJson(req)) as Record<string, unknown>;
        if (!body || typeof body !== 'object') {
          sendJson(res, 400, { error: '请求体必须是一个对象。' });
          return;
        }
        let definition;
        if (typeof body.presetId === 'string' && body.presetId) {
          definition = await getWorldPreset(body.presetId);
          if (!definition) {
            sendJson(res, 404, { error: '找不到这个世界预置。' });
            return;
          }
        } else if (body.world) {
          try {
            definition = normalizeWorld(body.world);
          } catch (error) {
            if (error instanceof WorldValidationError) {
              sendJson(res, 400, { error: error.message, issues: error.issues });
              return;
            }
            throw error;
          }
        } else {
          sendJson(res, 400, { error: '需要 presetId 或 world。' });
          return;
        }
        const run = createWorldRun(definition, {
          seed: typeof body.seed === 'string' ? body.seed : undefined,
          maxEpochs:
            typeof body.maxEpochs === 'number' || typeof body.maxEpochs === 'string'
              ? clamp(Number(body.maxEpochs) || definition.rules.maxEpochs, 2, 24)
              : definition.rules.maxEpochs,
          thinking: thinking(body.thinking, config.llm.thinking),
          autoEpochs:
            typeof body.autoEpochs === 'number' || typeof body.autoEpochs === 'string'
              ? clamp(Number(body.autoEpochs) || 3, 1, 12)
              : 3,
        });
        await worldStore.save(run);
        console.log(`[world] created ${run.id} ${run.definition.title}`);
        sendJson(res, 201, { world: run, active: false });
        return;
      }

      const worldMatch = pathname.match(/^\/api\/worlds\/([a-zA-Z0-9_-]+)$/);
      if (worldMatch && method === 'GET') {
        const world = await worldStore.load(worldMatch[1]!);
        if (!world) {
          sendJson(res, 404, { error: '找不到这个世界。' });
          return;
        }
        if (!activeWorldJobs.has(world.id)) await syncWorldSceneRuns(world);
        sendJson(res, 200, { world, active: activeWorldJobs.has(world.id) });
        return;
      }

      if (worldMatch && method === 'DELETE') {
        if (activeWorldJobs.has(worldMatch[1]!)) {
          sendJson(res, 409, { error: '世界正在推演，无法删除。' });
          return;
        }
        if ((await layout.mode()) === 'projects') {
          const result = await deleteProjectWithGuards(worldMatch[1]!);
          if ('ok' in result) sendJson(res, 200, { ok: true, deletedScenes: result.deletedScenes });
          else sendJson(res, result.status, { error: result.error });
        } else {
          await worldStore.delete(worldMatch[1]!);
          sendJson(res, 200, { ok: true });
        }
        return;
      }


      const worldSceneMatch = pathname.match(/^\/api\/worlds\/([a-zA-Z0-9_-]+)\/scenes$/);
      if (worldSceneMatch && method === 'POST') {
        const world = await worldStore.load(worldSceneMatch[1]!);
        if (!world) {
          sendJson(res, 404, { error: '找不到这个世界。' });
          return;
        }
        if (activeWorldJobs.has(world.id)) {
          sendJson(res, 409, { error: '世界导演正在推进纪元，暂时不能开镜。' });
          return;
        }
        const body = (await readJson(req)) as Record<string, unknown>;
        const hookId = typeof body.hookId === 'string' ? body.hookId : '';
        const hook = world.sceneHooks.find((entry) => entry.id === hookId);
        if (!hook) {
          sendJson(res, 404, { error: '找不到这个聚焦场景。' });
          return;
        }
        if (hook.runId) {
          const existing = await store.load(hook.runId);
          if (existing) {
            sendJson(res, 409, { error: '这个聚焦场景已经开镜。', runId: existing.id });
            return;
          }
        }
        const latestEpoch = world.epochs.at(-1)?.index ?? -1;
        if (hook.epochIndex !== latestEpoch) {
          sendJson(res, 409, { error: '这个聚焦场景属于旧纪元，已经归档；请从当前纪元的场景契约开镜。' });
          return;
        }
        let scenario;
        try {
          scenario = buildWorldScene(world, hook);
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : '无法生成场景。' });
          return;
        }
        const run = createRun(scenario, {
          seed: `${world.seed}:${hook.id}`,
          maxBeats: scenario.rules.maxBeats,
          thinking: world.settings.thinking,
          autoLimit: scenario.rules.maxBeats,
        });
        if (playRequested(body)) {
          try {
            run.play = createPlayConfig(run.scenario, requestedPlayCharacterId(body));
          } catch (error) {
            if (error instanceof PlayInputError) {
              sendJson(res, 400, { error: error.message });
              return;
            }
            throw error;
          }
        }
        run.worldLink = {
          worldId: world.id,
          worldTitle: world.definition.title,
          hookId: hook.id,
          eventId: hook.sourceEventId,
          regionId: hook.regionId,
        };
        await store.save(run);
        hook.status = 'scene_created';
        hook.runId = run.id;
        world.updatedAt = nowIso();
        world.sceneRuns.push({
          hookId: hook.id,
          runId: run.id,
          status: 'created',
          runStatus: run.status,
          beatCount: 0,
          addedAt: nowIso(),
        });
        await worldStore.save(world);
        sendJson(res, 201, {
          run: redactRunForPlayer(run),
          world,
          sceneRun: world.sceneRuns.at(-1),
        });
        return;
      }

      const worldSceneSealMatch = pathname.match(/^\/api\/worlds\/([a-zA-Z0-9_-]+)\/scenes\/([a-zA-Z0-9_-]+)\/seal$/);
      if (worldSceneSealMatch && method === 'POST') {
        const world = await worldStore.load(worldSceneSealMatch[1]!);
        if (!world) {
          sendJson(res, 404, { error: '找不到这个世界。' });
          return;
        }
        if (activeWorldJobs.has(world.id)) {
          sendJson(res, 409, { error: '世界导演正在推进纪元，暂时不能收束场景。' });
          return;
        }
        try {
          const scene = await sealWorldScene(world, worldSceneSealMatch[2]!);
          sendJson(res, 200, { ok: true, world, scene });
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : '无法收束场景。' });
        }
        return;
      }

      const worldAdvanceMatch = pathname.match(/^\/api\/worlds\/([a-zA-Z0-9_-]+)\/advance$/);
      if (worldAdvanceMatch && method === 'POST') {
        if (!hasLlmCredentials()) {
          sendJson(res, 503, { error: `服务端未配置 ${missingKeyName}。` });
          return;
        }
        const world = await worldStore.load(worldAdvanceMatch[1]!);
        if (!world) {
          sendJson(res, 404, { error: '找不到这个世界。' });
          return;
        }
        if (activeWorldJobs.has(world.id)) {
          sendJson(res, 409, { error: '这个世界已经在推演中。' });
          return;
        }
        const body = (await readJson(req)) as Record<string, unknown>;
        const mode = body.mode === 'auto' ? 'auto' : 'one';
        const requested = clamp(
          Number.isFinite(Number(body.epochs)) ? Number(body.epochs) : 1,
          1,
          12,
        );
        const result = startWorldJob(world, mode, requested);
        if (!result.started) {
          sendJson(res, 409, { error: result.reason ?? '无法开始世界推演。' });
          return;
        }
        sendJson(res, 202, { ok: true, active: true, mode, requestedEpochs: requested });
        return;
      }

      const worldStopMatch = pathname.match(/^\/api\/worlds\/([a-zA-Z0-9_-]+)\/stop$/);
      if (worldStopMatch && method === 'POST') {
        const job = activeWorldJobs.get(worldStopMatch[1]!);
        if (!job) {
          sendJson(res, 409, { error: '当前没有正在运行的世界。' });
          return;
        }
        job.stopRequested = true;
        const world = await worldStore.load(worldStopMatch[1]!);
        if (world && world.status === 'running') {
          world.progress = {
            ...world.progress,
            detail: '已收到暂停请求，将在本纪元结束后停下。',
            updatedAt: nowIso(),
          };
          await worldStore.save(world);
        }
        sendJson(res, 200, { ok: true, stopping: true });
        return;
      }

      const worldExportMatch = pathname.match(/^\/api\/worlds\/([a-zA-Z0-9_-]+)\/export\.(md|json)$/);
      if (worldExportMatch && method === 'GET') {
        const world = await worldStore.load(worldExportMatch[1]!);
        if (!world) {
          sendJson(res, 404, { error: '找不到这个世界。' });
          return;
        }
        const filename = `${world.id}.${worldExportMatch[2] === 'md' ? 'md' : 'json'}`;
        if (worldExportMatch[2] === 'md') {
          sendText(
            res,
            200,
            renderWorldMarkdown(world),
            'text/markdown; charset=utf-8',
            { 'Content-Disposition': `attachment; filename="${filename}"` },
          );
        } else {
          sendText(res, 200, JSON.stringify(world, null, 2), 'application/json; charset=utf-8', {
            'Content-Disposition': `attachment; filename="${filename}"`,
          });
        }
        return;
      }

      if (pathname === '/api/runs' && method === 'GET') {
        sendJson(res, 200, { runs: await store.list() });
        return;
      }

      if (pathname === '/api/runs' && method === 'POST') {
        const body = (await readJson(req)) as Record<string, unknown>;
        if (!body || typeof body !== 'object') {
          sendJson(res, 400, { error: '请求体必须是一个对象。' });
          return;
        }
        let scenario;
        if (typeof body.presetId === 'string' && body.presetId) {
          const preset = await getPresetScenario(body.presetId);
          if (!preset) {
            sendJson(res, 404, { error: '找不到这个预置剧本。' });
            return;
          }
          scenario = preset;
        } else if (body.scenario) {
          try {
            scenario = normalizeScenario(body.scenario);
          } catch (error) {
            if (error instanceof ScenarioValidationError) {
              sendJson(res, 400, { error: error.message, issues: error.issues });
              return;
            }
            throw error;
          }
        } else {
          sendJson(res, 400, { error: '需要 presetId 或 scenario。' });
          return;
        }

        const maxBeats =
          typeof body.maxBeats === 'number' || typeof body.maxBeats === 'string'
            ? clamp(Number(body.maxBeats) || scenario.rules.maxBeats, 2, 12)
            : scenario.rules.maxBeats;
        const run = createRun(scenario, {
          seed: typeof body.seed === 'string' ? body.seed : undefined,
          maxBeats,
          thinking: thinking(body.thinking, config.llm.thinking),
          autoLimit: maxBeats,
        });
        if (playRequested(body)) {
          try {
            run.play = createPlayConfig(run.scenario, requestedPlayCharacterId(body));
          } catch (error) {
            if (error instanceof PlayInputError) {
              sendJson(res, 400, { error: error.message });
              return;
            }
            throw error;
          }
        }
        await store.save(run);
        console.log(`[run] created ${run.id} ${run.scenario.title}${run.play ? `（扮演 ${run.play.characterId}）` : ''}`);
        sendJson(res, 201, { run: redactRunForPlayer(run), active: false });
        return;
      }

      const runMatch = pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)$/);
      if (runMatch && method === 'GET') {
        const run = await loadRun(runMatch[1]!);
        if (!run) {
          sendJson(res, 404, { error: '找不到这一场推演。' });
          return;
        }
        sendJson(res, 200, {
          run: redactRunForPlayer(run),
          active: activeJobs.has(run.id),
        });
        return;
      }

      if (runMatch && method === 'DELETE') {
        if (activeJobs.has(runMatch[1]!)) {
          sendJson(res, 409, { error: '推演正在进行，无法删除。' });
          return;
        }
        await store.delete(runMatch[1]!);
        sendJson(res, 200, { ok: true });
        return;
      }

      const advanceMatch = pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)\/advance$/);
      if (advanceMatch && method === 'POST') {
        if (!hasLlmCredentials()) {
          sendJson(res, 503, { error: `服务端未配置 ${missingKeyName}。` });
          return;
        }
        const run = await loadRun(advanceMatch[1]!);
        if (!run) {
          sendJson(res, 404, { error: '找不到这一场推演。' });
          return;
        }
        if (activeJobs.has(run.id)) {
          sendJson(res, 409, { error: '这一场已经在推演中。' });
          return;
        }
        if (playAwaiting(run)) {
          sendJson(res, 409, { error: '轮到你输入：请先完成你的举动或回应。' });
          return;
        }
        if (run.play?.recapAt) {
          sendJson(res, 409, { error: '本场已经复盘并结束，不能继续推进。' });
          return;
        }
        const body = (await readJson(req)) as Record<string, unknown>;
        const mode = body.mode === 'auto' ? 'auto' : 'one';
        if (run.play && mode === 'auto') {
          sendJson(res, 400, { error: '扮演模式需要你逐刻宣告，不能连续推演。' });
          return;
        }
        const requested = clamp(
          Number.isFinite(Number(body.beats)) ? Number(body.beats) : 1,
          1,
          12,
        );
        const result = startJob(run, mode, requested);
        if (!result.started) {
          sendJson(res, 409, { error: result.reason ?? '无法开始推演。' });
          return;
        }
        sendJson(res, 202, {
          ok: true,
          active: true,
          mode,
          requestedBeats: requested,
        });
        return;
      }

      const stopMatch = pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)\/stop$/);
      if (stopMatch && method === 'POST') {
        const job = activeJobs.get(stopMatch[1]!);
        if (!job) {
          sendJson(res, 409, { error: '当前没有正在进行的推演。' });
          return;
        }
        job.stopRequested = true;
        const run = await loadRun(stopMatch[1]!);
        if (run && run.status === 'running') {
          run.progress = {
            ...run.progress,
            detail: '已收到暂停请求，将在本刻结束后停下。',
            updatedAt: nowIso(),
          };
          await store.save(run);
        }
        sendJson(res, 200, { ok: true, stopping: true });
        return;
      }

      const playActionMatch = pathname.match(
        /^\/api\/runs\/([a-zA-Z0-9_-]+)\/play\/(action|reaction)$/,
      );
      if (playActionMatch && method === 'POST') {
        if (!hasLlmCredentials()) {
          sendJson(res, 503, { error: `服务端未配置 ${missingKeyName}。` });
          return;
        }
        const run = await loadRun(playActionMatch[1]!);
        if (!run) {
          sendJson(res, 404, { error: '找不到这一场推演。' });
          return;
        }
        if (!run.play) {
          sendJson(res, 409, { error: '这一场不是扮演模式。' });
          return;
        }
        if (activeJobs.has(run.id)) {
          sendJson(res, 409, { error: '这一场已经在推演中。' });
          return;
        }
        if (run.play.recapAt) {
          sendJson(res, 409, { error: '本场已经复盘并结束。' });
          return;
        }
        const kind = playActionMatch[2] === 'reaction' ? 'reaction' : 'action';
        if (playAwaiting(run) !== kind) {
          sendJson(res, 409, {
            error:
              kind === 'action'
                ? '现在不是宣告举动的时候。'
                : '现在没有需要你回应的敌意举动。',
          });
          return;
        }
        const body = await readJson(req);
        try {
          if (kind === 'action') submitPlayerAction(run, body);
          else submitPlayerReaction(run, body);
        } catch (error) {
          if (error instanceof PlayInputError) {
            sendJson(res, error.status, { error: error.message });
            return;
          }
          throw error;
        }
        run.updatedAt = nowIso();
        await store.save(run);
        const started = startJob(run, 'one', 1);
        if (!started.started) {
          sendJson(res, 409, { error: started.reason ?? '无法继续推演。' });
          return;
        }
        sendJson(res, 202, {
          ok: true,
          active: true,
          run: redactRunForPlayer(run),
        });
        return;
      }

      const recapMatch = pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)\/recap$/);
      if (recapMatch && method === 'POST') {
        const run = await loadRun(recapMatch[1]!);
        if (!run) {
          sendJson(res, 404, { error: '找不到这一场推演。' });
          return;
        }
        if (!run.play) {
          sendJson(res, 409, { error: '这一场不是扮演模式。' });
          return;
        }
        if (activeJobs.has(run.id)) {
          sendJson(res, 409, { error: '这一刻还没有落定，无法复盘。' });
          return;
        }
        try {
          unlockRecap(run);
        } catch (error) {
          if (error instanceof PlayInputError) {
            sendJson(res, error.status, { error: error.message });
            return;
          }
          throw error;
        }
        await store.save(run);
        console.log(`[run] recap unlocked ${run.id}`);
        sendJson(res, 200, { ok: true, run });
        return;
      }

      const proseMatch = pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)\/prose$/);
      if (proseMatch && method === 'POST') {
        const run = await loadRun(proseMatch[1]!);
        if (!run) {
          sendJson(res, 404, { error: '找不到这一场推演。' });
          return;
        }
        if (run.play && !run.play.recapAt) {
          sendJson(res, 403, { error: '复盘之前，玩家只能使用自己可知的信息，不能生成全知正文。' });
          return;
        }
        const body = (await readJson(req)) as Record<string, unknown>;
        const person = body.person === 'first' ? 'first' : 'third';
        const length = body.length === 'short' || body.length === 'long' ? body.length : 'medium';
        const workflow = new ProseWorkflow(run, model);
        const result = await workflow.generate({
          pov: typeof body.pov === 'string' ? body.pov : undefined,
          person,
          protagonist: typeof body.protagonist === 'string' ? body.protagonist : undefined,
          style: typeof body.style === 'string' ? body.style : undefined,
          length,
        });
        sendJson(res, 200, {
          ok: true,
          title: result.draft.title,
          markdown: result.markdown,
          outline: result.outline,
          usage: result.usage,
        });
        return;
      }

      const exportMatch = pathname.match(/^\/api\/runs\/([a-zA-Z0-9_-]+)\/export\.(md|json)$/);
      if (exportMatch && method === 'GET') {
        const run = await loadRun(exportMatch[1]!);
        if (!run) {
          sendJson(res, 404, { error: '找不到这一场推演。' });
          return;
        }
        if (run.play && !run.play.recapAt) {
          sendJson(res, 403, { error: '复盘之前不能导出完整战报：它包含你还不知道的信息。' });
          return;
        }
        const filename = `${run.id}.${exportMatch[2] === 'md' ? 'md' : 'json'}`;
        if (exportMatch[2] === 'md') {
          sendText(
            res,
            200,
            renderMarkdown(run, { includeBackstage: true }),
            'text/markdown; charset=utf-8',
            { 'Content-Disposition': `attachment; filename="${filename}"` },
          );
        } else {
          sendText(res, 200, JSON.stringify(run, null, 2), 'application/json; charset=utf-8', {
            'Content-Disposition': `attachment; filename="${filename}"`,
          });
        }
        return;
      }

      sendJson(res, 404, { error: '未知 API。' });
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }
    const served = await serveStatic(pathname, res);
    if (!served) {
      if (pathname === '/') {
        sendText(res, 500, '前端文件缺失。', 'text/plain; charset=utf-8');
      } else {
        sendJson(res, 404, { error: 'Not found' });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '服务器内部错误';
    const status = /请求体|非法请求路径/.test(message) ? 400 : 500;
    if (status >= 500) console.error('[server]', error);
    if (!res.headersSent) {
      sendJson(res, status, { error: message });
    } else {
      res.end();
    }
  }
});

await recoverInterruptedRuns();
await recoverInterruptedWorlds();
await store.ensure();
await worldStore.ensure();
const storageLabel =
  (await layout.mode()) === 'projects'
    ? config.projectsDir
    : `${config.runsDir}（旧布局，可运行 node src/cli.ts --migrate-projects 迁移）`;
server.listen(config.port, config.host, () => {
  console.log(`\n幕间 · Mise-en-scène`);
  console.log(`  http://${config.host}:${config.port}`);
  console.log(`  model: ${config.llm.model} · api key: ${hasLlmCredentials() ? '已配置' : '缺失'}`);
  console.log(`  runs: ${storageLabel}\n`);
});

process.on('SIGINT', () => {
  console.log('\n收到退出信号，关闭服务器。');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3000).unref();
});
