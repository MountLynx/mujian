import fs from 'node:fs/promises';
import type { WorldRun, WorldRunSummary } from './types.ts';
import { worldRunSummary } from './run.ts';
import { WriteQueues, writeJsonAtomic } from '../utils.ts';
import { ProjectStore, type ManifestSeed } from '../projects/store.ts';
import { ProjectsLayout } from '../projects/layout.ts';

/**
 * Atomic, serialized persistence for world runs.
 *
 * 新布局下 world 写入 projects/<id>/world.json，并在每次 save 时刷新项目清单；
 * 旧布局保持 data/worlds/<id>.json。模式在实例首次使用时确定一次。
 */
export class WorldStore {
  private writeQueues = new WriteQueues();
  readonly layout: ProjectsLayout;
  readonly projects: ProjectStore;

  constructor(layout: ProjectsLayout = new ProjectsLayout()) {
    this.layout = layout;
    this.projects = new ProjectStore(layout);
  }

  async ensure(): Promise<void> {
    if ((await this.layout.mode()) === 'projects') return;
    await fs.mkdir(this.layout.dirs.legacyWorldsDir, { recursive: true });
  }

  private fileFor(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error('非法 world id');
    return this.layout.legacyWorldFile(id);
  }

  async save(run: WorldRun): Promise<void> {
    if ((await this.layout.mode()) === 'legacy') {
      await fs.mkdir(this.layout.dirs.legacyWorldsDir, { recursive: true });
      const file = this.fileFor(run.id);
      await this.writeQueues.run(run.id, () => writeJsonAtomic(file, run));
      return;
    }
    const file = this.layout.worldFile(run.id);
    await this.writeQueues.run(run.id, async () => {
      const seed: ManifestSeed = {
        id: run.id,
        kind: 'world',
        title: run.definition.title,
        kicker: run.definition.kicker,
        status: run.status,
        updatedAt: run.updatedAt,
      };
      await this.projects.ensureManifest(seed);
      await writeJsonAtomic(file, run);
      await this.projects.touchForWorld(run);
    });
  }

  async load(id: string): Promise<WorldRun | null> {
    const file =
      (await this.layout.mode()) === 'projects' ? this.layout.worldFile(id) : this.fileFor(id);
    try {
      const raw = await fs.readFile(file, 'utf8');
      return JSON.parse(raw) as WorldRun;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async list(): Promise<WorldRunSummary[]> {
    if ((await this.layout.mode()) === 'projects') {
      const result: WorldRunSummary[] = [];
      for (const file of await this.layout.scanWorldFiles()) {
        try {
          const run = JSON.parse(await fs.readFile(file, 'utf8')) as WorldRun;
          result.push(worldRunSummary(run));
        } catch {
          /* skip damaged worlds */
        }
      }
      return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    await this.ensure();
    const entries = await fs.readdir(this.layout.dirs.legacyWorldsDir, { withFileTypes: true });
    const result: WorldRunSummary[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      try {
        const run = JSON.parse(
          await fs.readFile(
            `${this.layout.dirs.legacyWorldsDir}/${entry.name}`,
            'utf8',
          ),
        ) as WorldRun;
        result.push(worldRunSummary(run));
      } catch {
        /* skip damaged worlds */
      }
    }
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async delete(id: string): Promise<void> {
    const file =
      (await this.layout.mode()) === 'projects' ? this.layout.worldFile(id) : this.fileFor(id);
    try {
      await fs.unlink(file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}
