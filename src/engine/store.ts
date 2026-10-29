import fs from 'node:fs/promises';
import path from 'node:path';
import type { Run, RunSummary } from '../types.ts';
import { nowIso, WriteQueues, writeJsonAtomic } from '../utils.ts';
import { ProjectStore } from '../projects/store.ts';
import { ProjectsLayout } from '../projects/layout.ts';

/**
 * File-backed run store. Writes are atomic and serialized per run so the web UI
 * can poll while the engine is mid-beat without ever reading half a file.
 *
 * 新布局（data/projects）下，带 worldLink 的场景写入 projects/<worldId>/runs/，
 * 独立推演（短篇）写入 projects/<runId>/run.json；读取经 runId→路径内存索引。
 * 旧布局（data/runs）下保持原扁平路径；模式在实例首次使用时确定一次。
 */
export class RunStore {
  private writeQueues = new WriteQueues();
  readonly layout: ProjectsLayout;
  readonly projects: ProjectStore;

  constructor(layout: ProjectsLayout = new ProjectsLayout()) {
    this.layout = layout;
    this.projects = new ProjectStore(layout);
  }

  async ensure(): Promise<void> {
    if ((await this.layout.mode()) === 'projects') {
      await this.layout.buildIndex();
      return;
    }
    await fs.mkdir(this.layout.dirs.legacyRunsDir, { recursive: true });
  }

  /** run 文件的实际落盘位置（CLI 展示用）。 */
  async pathFor(id: string): Promise<string> {
    if ((await this.layout.mode()) === 'projects') {
      await this.layout.buildIndex();
      return this.layout.runPath(id) ?? this.layout.shortRunFile(id);
    }
    return this.layout.legacyRunFile(id);
  }

  private legacyFileFor(id: string): string {
    return this.layout.legacyRunFile(id);
  }

  async save(run: Run): Promise<void> {
    if ((await this.layout.mode()) === 'legacy') {
      await fs.mkdir(this.layout.dirs.legacyRunsDir, { recursive: true });
      const file = this.legacyFileFor(run.id);
      await this.writeQueues.run(run.id, () => writeJsonAtomic(file, run));
      return;
    }
    await this.layout.buildIndex();
    const file = this.fileFor(run);
    await this.writeQueues.run(run.id, async () => {
      await this.ensureManifestFor(run);
      await writeJsonAtomic(file, run);
      this.layout.registerRun(run.id, file);
      await this.projects.touchForRun(run);
    });
  }

  private fileFor(run: Run): string {
    const worldId = run.worldLink?.worldId;
    if (worldId) return this.layout.worldSceneRunFile(worldId, run.id);
    return this.layout.shortRunFile(run.id);
  }

  private async ensureManifestFor(run: Run): Promise<void> {
    const worldId = run.worldLink?.worldId;
    if (worldId) {
      await this.projects.ensureManifest({
        id: worldId,
        kind: 'world',
        title: run.worldLink?.worldTitle ?? worldId,
        kicker: '',
        status: 'unknown',
        updatedAt: run.updatedAt,
        entry: { id: run.id, kind: 'run', addedAt: run.createdAt },
      });
      return;
    }
    await this.projects.ensureManifest({
      id: run.id,
      kind: 'short',
      title: run.scenario.title,
      kicker: run.scenario.kicker,
      status: run.status,
      updatedAt: run.updatedAt,
    });
  }

  async load(id: string): Promise<Run | null> {
    if ((await this.layout.mode()) === 'legacy') {
      return this.legacyLoad(this.legacyFileFor(id));
    }
    await this.layout.buildIndex();
    const file = this.layout.runPath(id);
    if (!file) return null;
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as Run;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.layout.forgetRun(id);
        return null;
      }
      throw error;
    }
  }

  private async legacyLoad(file: string): Promise<Run | null> {
    try {
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw) as Run;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async list(): Promise<RunSummary[]> {
    const summaries: RunSummary[] = [];
    if ((await this.layout.mode()) === 'legacy') {
      await fs.mkdir(this.layout.dirs.legacyRunsDir, { recursive: true });
      const entries = await fs.readdir(this.layout.dirs.legacyRunsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        try {
          const run = JSON.parse(
            await fs.readFile(path.join(this.layout.dirs.legacyRunsDir, entry.name), 'utf8'),
          ) as Run;
          summaries.push(this.summarize(run));
        } catch {
          /* Skip a damaged run rather than breaking the whole library. */
        }
      }
      return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    await this.layout.buildIndex();
    for (const info of await this.layout.scanRunFiles()) {
      try {
        const run = JSON.parse(await fs.readFile(info.file, 'utf8')) as Run;
        this.layout.registerRun(info.runId, info.file);
        summaries.push(this.summarize(run));
      } catch {
        /* Skip a damaged run rather than breaking the whole library. */
      }
    }
    return summaries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  private summarize(run: Run): RunSummary {
    const last = run.beats[run.beats.length - 1];
    return {
      id: run.id,
      title: run.scenario.title,
      subtitle: run.scenario.subtitle,
      status: run.status,
      beats: run.beats.filter((beat) => beat.phase === 'complete').length,
      maxBeats: run.settings.maxBeats,
      characterNames: run.scenario.characters.map((character) => character.name),
      updatedAt: run.updatedAt,
      createdAt: run.createdAt,
      currentBeatTitle: last?.title || null,
      ...(run.worldLink
        ? { worldId: run.worldLink.worldId, worldTitle: run.worldLink.worldTitle }
        : {}),
      ...(run.play?.characterId
        ? {
            playCharacterName:
              run.scenario.characters.find(
                (character) => character.id === run.play!.characterId,
              )?.name ?? run.play.characterId,
          }
        : {}),
    };
  }

  async delete(id: string): Promise<void> {
    if ((await this.layout.mode()) === 'legacy') {
      try {
        await fs.unlink(this.legacyFileFor(id));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      return;
    }
    await this.layout.buildIndex();
    const file = this.layout.runPath(id);
    if (!file) return;
    if (file === this.layout.shortRunFile(id)) {
      // 短篇：run 即项目内容，删除整个项目文件夹。
      await fs.rm(this.layout.projectDir(id), { recursive: true, force: true });
    } else {
      await fs.rm(file, { force: true });
      // 从所属世界项目的清单里摘掉这条归属（尽力而为）。
      const worldId = this.worldIdFor(file);
      if (worldId) await this.projects.removeEntry(worldId, id);
    }
    this.layout.forgetRun(id);
  }

  private worldIdFor(file: string): string | null {
    const relative = path.relative(this.layout.dirs.projectsDir, file);
    const worldId = relative.split(path.sep)[0];
    return worldId && worldId.startsWith('world_') ? worldId : null;
  }

  touch(run: Run): void {
    run.updatedAt = nowIso();
  }
}
