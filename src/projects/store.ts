import fs from 'node:fs/promises';
import path from 'node:path';
import type { Run } from '../types.ts';
import type { WorldRun } from '../world/types.ts';
import { nowIso, WriteQueues, writeJsonAtomic } from '../utils.ts';
import { ProjectsLayout, type RunFileInfo, type StoreDirs } from './layout.ts';
import type {
  MigrationStatus,
  ProjectManifest,
  ProjectManifestEntry,
  ProjectSceneEntry,
  ProjectSummary,
} from './types.ts';

/** RunStore 首写时生成清单所需的种子信息。 */
export interface ManifestSeed {
  id: string;
  kind: 'world' | 'short';
  title: string;
  kicker: string;
  status: ProjectManifest['status'];
  updatedAt: string;
  /** 世界项目的场景归属（短篇不传）。 */
  entry?: ProjectManifestEntry;
}

/**
 * 项目清单的读写与项目级操作。
 * 进度统计（开放线程、待收束场景等）一律读时计算，不落盘。
 */
export class ProjectStore {
  readonly layout: ProjectsLayout;
  private writeQueues = new WriteQueues();

  constructor(layout: ProjectsLayout = new ProjectsLayout()) {
    this.layout = layout;
  }

  /* ---- 清单 ---- */

  async readManifest(projectId: string): Promise<ProjectManifest | null> {
    try {
      const raw = await fs.readFile(this.layout.manifestFile(projectId), 'utf8');
      return JSON.parse(raw) as ProjectManifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  /**
   * 确保项目清单存在；已存在则幂等返回（世界项目会补登缺失的 entries）。
   * 供 RunStore / WorldStore 首写时调用。
   */
  async ensureManifest(seed: ManifestSeed): Promise<ProjectManifest> {
    const entry = seed.entry;
    return this.writeQueues.run(`manifest:${seed.id}`, async () => {
      const existing = await this.readManifest(seed.id);
      if (existing) {
        let dirty = false;
        if (entry && !existing.entries.some((item) => item.id === entry.id)) {
          existing.entries.push(entry);
          dirty = true;
        }
        // 清单可能由场景 run 先生成（占位标题、未知状态）；世界本体到位后补全。
        if (seed.kind === 'world' && existing.kind === 'world') {
          if ((!existing.title || existing.title === existing.id) && seed.title) {
            existing.title = seed.title;
            dirty = true;
          }
          if (!existing.kicker && seed.kicker) {
            existing.kicker = seed.kicker;
            dirty = true;
          }
          if (existing.status === 'unknown' && seed.status !== 'unknown') {
            existing.status = seed.status;
            dirty = true;
          }
        }
        if (dirty) await writeJsonAtomic(this.layout.manifestFile(seed.id), existing);
        return existing;
      }
      const manifest: ProjectManifest = {
        version: 1,
        id: seed.id,
        kind: seed.kind,
        title: seed.title,
        kicker: seed.kicker,
        status: seed.status,
        archived: false,
        createdAt: seed.updatedAt || nowIso(),
        updatedAt: seed.updatedAt || nowIso(),
        entries: entry ? [entry] : [],
      };
      await fs.mkdir(this.layout.projectDir(seed.id), { recursive: true });
      if (seed.kind === 'world') await fs.mkdir(this.layout.worldRunsDir(seed.id), { recursive: true });
      await writeJsonAtomic(this.layout.manifestFile(seed.id), manifest);
      return manifest;
    });
  }

  /** run 每次 save 时顺手刷新：短篇刷 status+updatedAt，世界项目刷 updatedAt 并补登 entries。 */
  async touchForRun(run: Run): Promise<void> {
    const worldId = run.worldLink?.worldId;
    if (worldId) {
      await this.writeQueues.run(`manifest:${worldId}`, async () => {
        const manifest = await this.readManifest(worldId);
        if (!manifest) return;
        manifest.updatedAt = run.updatedAt;
        if (!manifest.entries.some((entry) => entry.id === run.id)) {
          manifest.entries.push({ id: run.id, kind: 'run', addedAt: run.createdAt });
        }
        await writeJsonAtomic(this.layout.manifestFile(worldId), manifest);
      });
      return;
    }
    await this.writeQueues.run(`manifest:${run.id}`, async () => {
      const manifest = await this.readManifest(run.id);
      if (!manifest) return;
      manifest.status = run.status;
      manifest.updatedAt = run.updatedAt;
      await writeJsonAtomic(this.layout.manifestFile(run.id), manifest);
    });
  }

  /** world 每次 save 时顺手刷新清单 status + updatedAt。 */
  async touchForWorld(world: WorldRun): Promise<void> {
    await this.writeQueues.run(`manifest:${world.id}`, async () => {
      const manifest = await this.readManifest(world.id);
      if (!manifest) return;
      manifest.status = world.status;
      manifest.updatedAt = world.updatedAt;
      await writeJsonAtomic(this.layout.manifestFile(world.id), manifest);
    });
  }

  /* ---- 项目级操作 ---- */

  async setArchived(projectId: string, archived: boolean): Promise<ProjectManifest> {
    return this.writeQueues.run(`manifest:${projectId}`, async () => {
      const manifest = await this.readManifest(projectId);
      if (!manifest) throw new Error('找不到这个项目。');
      manifest.archived = archived;
      await writeJsonAtomic(this.layout.manifestFile(projectId), manifest);
      return manifest;
    });
  }

  /** 从世界项目清单里摘掉一条场景归属（run 被单独删除时）。 */
  async removeEntry(projectId: string, runId: string): Promise<void> {
    await this.writeQueues.run(`manifest:${projectId}`, async () => {
      const manifest = await this.readManifest(projectId);
      if (!manifest) return;
      const next = manifest.entries.filter((entry) => entry.id !== runId);
      if (next.length === manifest.entries.length) return;
      manifest.entries = next;
      await writeJsonAtomic(this.layout.manifestFile(projectId), manifest);
    });
  }

  /**
   * 删除项目。世界项目整目录删除（含 runs/ 全部聚焦场景，即级联）；
   * 短篇删单文件夹。返回删除的场景数，并清除 runId 索引。
   */
  async delete(projectId: string): Promise<{ deletedScenes: number }> {
    const dir = this.layout.projectDir(projectId);
    const runsDir = this.layout.worldRunsDir(projectId);
    let deletedScenes = 0;
    try {
      const entries = await fs.readdir(runsDir, { withFileTypes: true });
      deletedScenes = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).length;
    } catch {
      /* 没有场景目录 */
    }
    await fs.rm(dir, { recursive: true, force: true });
    this.layout.forgetProject(projectId);
    return { deletedScenes };
  }

  /* ---- 总览 ---- */

  async list(): Promise<ProjectSummary[]> {
    let projectEntries;
    try {
      projectEntries = await fs.readdir(this.layout.dirs.projectsDir, { withFileTypes: true });
    } catch {
      return [];
    }
    const summaries: ProjectSummary[] = [];
    for (const entry of projectEntries) {
      if (!entry.isDirectory()) continue;
      try {
        summaries.push(await this.summarize(entry.name));
      } catch {
        /* 跳过损坏的项目，不打断整个总览 */
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private async summarize(projectId: string): Promise<ProjectSummary> {
    const manifest = await this.readManifest(projectId);
    if (!manifest) throw new Error(`项目缺少清单：${projectId}`);
    if (manifest.kind === 'short') {
      const run = await this.readRun(this.layout.shortRunFile(projectId));
      const complete = run ? run.beats.filter((beat) => beat.phase === 'complete') : [];
      const last = complete.at(-1);
      return {
        id: manifest.id,
        kind: 'short',
        title: run?.scenario.title ?? manifest.title,
        kicker: run?.scenario.kicker ?? manifest.kicker,
        status: run?.status ?? manifest.status,
        archived: manifest.archived,
        createdAt: manifest.createdAt,
        updatedAt: run?.updatedAt ?? manifest.updatedAt,
        beats: complete.length,
        maxBeats: run?.settings.maxBeats ?? 0,
        currentBeatTitle: last?.title ?? null,
      };
    }
    const world = await this.readWorld(this.layout.worldFile(projectId));
    const sceneEntries: ProjectSceneEntry[] = [];
    for (const entry of manifest.entries) {
      const file = await this.resolveSceneRunFile(projectId, entry.id);
      if (!file) continue;
      const run = await this.readRun(file);
      if (!run) continue;
      sceneEntries.push({
        id: run.id,
        title: run.scenario.title,
        status: run.status,
        beats: run.beats.filter((beat) => beat.phase === 'complete').length,
        maxBeats: run.settings.maxBeats,
        updatedAt: run.updatedAt,
        addedAt: entry.addedAt,
      });
    }
    sceneEntries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return {
      id: manifest.id,
      kind: 'world',
      title: world?.definition.title ?? manifest.title,
      kicker: world?.definition.kicker ?? manifest.kicker,
      status: world?.status ?? manifest.status,
      archived: manifest.archived,
      createdAt: manifest.createdAt,
      updatedAt: world?.updatedAt ?? manifest.updatedAt,
      epochCount: world?.epochs.length ?? 0,
      maxEpochs: world?.settings.maxEpochs ?? 0,
      openThreads: world
        ? Object.values(world.threads).filter((thread) => thread.status === 'active').length
        : 0,
      unsealedScenes: world
        ? world.sceneRuns.filter((scene) => scene.status !== 'completed' && (scene.beatCount ?? 0) > 0)
            .length
        : 0,
      pendingSignals: world ? world.signals.filter((signal) => signal.status === 'pending').length : 0,
      sceneEntries,
      lastActivityTitle: world?.epochs.at(-1)?.title ?? null,
    };
  }

  private async resolveSceneRunFile(projectId: string, runId: string): Promise<string | null> {
    const file = this.layout.worldSceneRunFile(projectId, runId);
    try {
      await fs.access(file);
      return file;
    } catch {
      return null;
    }
  }

  private async readRun(file: string): Promise<Run | null> {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as Run;
    } catch {
      return null;
    }
  }

  private async readWorld(file: string): Promise<WorldRun | null> {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as WorldRun;
    } catch {
      return null;
    }
  }

  /* ---- 迁移状态（/api/health） ---- */

  async migrationStatus(): Promise<MigrationStatus> {
    if ((await this.layout.mode()) === 'projects') {
      return { needed: false, worlds: 0, runs: 0 };
    }
    const worlds = await countJsonFiles(this.layout.dirs.legacyWorldsDir);
    const runs = await countJsonFiles(this.layout.dirs.legacyRunsDir);
    return { needed: worlds + runs > 0, worlds, runs };
  }
}

async function countJsonFiles(dir: string): Promise<number> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).length;
  } catch {
    return 0;
  }
}

export type { RunFileInfo, StoreDirs };
