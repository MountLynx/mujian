import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.ts';
import type { Run } from '../types.ts';
import type { WorldRun } from '../world/types.ts';
import { writeJsonAtomic } from '../utils.ts';
import { ProjectStore, type ManifestSeed } from './store.ts';
import { defaultDirs, ProjectsLayout, type StoreDirs } from './layout.ts';

export interface MigrationReport {
  /** 迁移的世界项目数（含已存在的）。 */
  worlds: number;
  /** 归位到世界项目的聚焦场景数。 */
  scenesRehomed: number;
  /** 成为短篇的独立推演数。 */
  shorts: number;
  skipped: string[];
  /** 旧目录备份位置；无旧数据时为 null。 */
  backupDir: string | null;
}

/**
 * 服务在运行时拒绝迁移，避免写队列与迁移互相踩文件。
 * 通过探测本机健康端点实现；探测失败视为服务未运行。
 */
export async function assertServerNotRunning(
  host: string = config.host,
  port: number = config.port,
): Promise<void> {
  try {
    const response = await fetch(`http://${host}:${port}/api/health`, {
      signal: AbortSignal.timeout(900),
    });
    if (response.ok) {
      throw new Error(`服务正在运行（http://${host}:${port}）。请先停止服务再执行迁移。`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('服务正在运行')) throw error;
    /* 连不上 = 没有服务在跑 */
  }
}

/**
 * CLI 手动迁移：data/worlds + data/runs → data/projects 项目布局。
 * 幂等：已迁移的文件按目标存在即跳过；任一步失败则中止且不改名旧目录。
 */
export async function migrateProjects(
  dirs: StoreDirs = defaultDirs(),
  log: (message: string) => void = () => {},
): Promise<MigrationReport> {
  const projects = new ProjectStore(new ProjectsLayout(dirs));
  const report: MigrationReport = { worlds: 0, scenesRehomed: 0, shorts: 0, skipped: [], backupDir: null };

  /* 1. 世界线 → projects/<worldId>/world.json */
  for (const file of await listJsonFiles(dirs.legacyWorldsDir)) {
    let world: WorldRun;
    try {
      world = JSON.parse(await fs.readFile(file, 'utf8')) as WorldRun;
    } catch {
      report.skipped.push(`${path.basename(file)}：不是合法 JSON`);
      continue;
    }
    const worldId = world.id || path.basename(file, '.json');
    await projects.ensureManifest({
      id: worldId,
      kind: 'world',
      title: world.definition?.title ?? worldId,
      kicker: world.definition?.kicker ?? '',
      status: world.status ?? 'unknown',
      updatedAt: world.updatedAt,
    });
    const dest = projects.layout.worldFile(worldId);
    if (await exists(dest)) {
      report.worlds += 1;
      report.skipped.push(`${worldId}：目标已存在，跳过`);
      continue;
    }
    await fs.mkdir(projects.layout.worldRunsDir(worldId), { recursive: true });
    await writeJsonAtomic(dest, world);
    report.worlds += 1;
    log(`  · 世界线 ${worldId}《${world.definition?.title ?? ''}》→ projects/${worldId}/`);
  }

  /* 2. 推演 → 世界项目 runs/ 或短篇项目 */
  for (const file of await listJsonFiles(dirs.legacyRunsDir)) {
    let run: Run;
    try {
      run = JSON.parse(await fs.readFile(file, 'utf8')) as Run;
    } catch {
      report.skipped.push(`${path.basename(file)}：不是合法 JSON`);
      continue;
    }
    const runId = run.id || path.basename(file, '.json');
    const worldId = run.worldLink?.worldId;
    if (worldId) {
      const dest = projects.layout.worldSceneRunFile(worldId, runId);
      const seed: ManifestSeed = {
        id: worldId,
        kind: 'world',
        title: run.worldLink?.worldTitle ?? worldId,
        kicker: '',
        status: 'unknown',
        updatedAt: run.updatedAt,
        entry: { id: runId, kind: 'run', addedAt: run.createdAt },
      };
      if (await exists(dest)) {
        report.scenesRehomed += 1;
        report.skipped.push(`${runId}：目标已存在，跳过`);
        await projects.ensureManifest(seed);
        continue;
      }
      await fs.mkdir(projects.layout.worldRunsDir(worldId), { recursive: true });
      await writeJsonAtomic(dest, run);
      await projects.ensureManifest(seed);
      report.scenesRehomed += 1;
      log(`  · 聚焦场景 ${runId} → projects/${worldId}/runs/`);
    } else {
      const dest = projects.layout.shortRunFile(runId);
      if (await exists(dest)) {
        report.shorts += 1;
        report.skipped.push(`${runId}：目标已存在，跳过`);
        continue;
      }
      await fs.mkdir(projects.layout.projectDir(runId), { recursive: true });
      await writeJsonAtomic(dest, run);
      await projects.ensureManifest({
        id: runId,
        kind: 'short',
        title: run.scenario?.title ?? runId,
        kicker: run.scenario?.kicker ?? '',
        status: run.status ?? 'unknown',
        updatedAt: run.updatedAt,
      });
      report.shorts += 1;
      log(`  · 短篇 ${runId}《${run.scenario?.title ?? ''}》→ projects/${runId}/`);
    }
  }

  /* 3. 全部成功后旧目录改名备份（不删除）；失败路径不会走到这里。 */
  const hadLegacy =
    (await exists(dirs.legacyRunsDir)) || (await exists(dirs.legacyWorldsDir));
  if (hadLegacy) {
    const backupDir = `${path.dirname(dirs.legacyRunsDir)}/legacy-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}`;
    await fs.mkdir(backupDir, { recursive: true });
    if (await exists(dirs.legacyRunsDir)) {
      await fs.rename(dirs.legacyRunsDir, path.join(backupDir, 'runs'));
    }
    if (await exists(dirs.legacyWorldsDir)) {
      await fs.rename(dirs.legacyWorldsDir, path.join(backupDir, 'worlds'));
    }
    report.backupDir = backupDir;
  }
  return report;
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !entry.name.endsWith('.tmp'))
      .map((entry) => path.join(dir, entry.name))
      .sort();
  } catch {
    return [];
  }
}

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}
