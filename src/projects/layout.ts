import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.ts';

export type LayoutMode = 'legacy' | 'projects';

export interface StoreDirs {
  projectsDir: string;
  legacyRunsDir: string;
  legacyWorldsDir: string;
}

export function defaultDirs(): StoreDirs {
  return {
    projectsDir: config.projectsDir,
    legacyRunsDir: config.runsDir,
    legacyWorldsDir: config.worldRunsDir,
  };
}

export interface RunFileInfo {
  runId: string;
  file: string;
}

/**
 * 项目布局的唯一定义处 + runId→路径内存索引。
 *
 * 模式在实例首次使用时确定一次：projects/ 存在且非空 → 新布局；
 * 否则旧布局（data/runs、data/worlds 双读，写入仍落旧布局）。运行中不切换。
 */
export class ProjectsLayout {
  readonly dirs: StoreDirs;
  private modePromise: Promise<LayoutMode> | null = null;
  private runPaths = new Map<string, string>();
  private indexPromise: Promise<void> | null = null;

  constructor(dirs: StoreDirs = defaultDirs()) {
    this.dirs = dirs;
  }

  async mode(): Promise<LayoutMode> {
    this.modePromise ??= (async () => {
      try {
        const entries = await fs.readdir(this.dirs.projectsDir, { withFileTypes: true });
        return entries.length > 0 ? 'projects' : 'legacy';
      } catch {
        return 'legacy';
      }
    })();
    return this.modePromise;
  }

  /* ---- 项目内路径 ---- */

  private assertId(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`非法项目 id：${id}`);
    return id;
  }

  projectDir(id: string): string {
    return path.join(this.dirs.projectsDir, this.assertId(id));
  }

  manifestFile(id: string): string {
    return path.join(this.projectDir(id), 'project.json');
  }

  worldFile(id: string): string {
    return path.join(this.projectDir(id), 'world.json');
  }

  worldRunsDir(id: string): string {
    return path.join(this.projectDir(id), 'runs');
  }

  worldSceneRunFile(worldId: string, runId: string): string {
    return path.join(this.worldRunsDir(worldId), `${this.assertId(runId)}.json`);
  }

  shortRunFile(runId: string): string {
    return path.join(this.projectDir(runId), 'run.json');
  }

  /* ---- 旧布局路径 ---- */

  legacyRunFile(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`非法 run id：${id}`);
    return path.join(this.dirs.legacyRunsDir, `${id}.json`);
  }

  legacyWorldFile(id: string): string {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`非法 world id：${id}`);
    return path.join(this.dirs.legacyWorldsDir, `${id}.json`);
  }

  /* ---- runId 索引 ---- */

  registerRun(runId: string, file: string): void {
    this.runPaths.set(runId, file);
  }

  forgetRun(runId: string): void {
    this.runPaths.delete(runId);
  }

  forgetProject(projectId: string): void {
    const prefix = this.projectDir(projectId) + path.sep;
    for (const [runId, file] of this.runPaths) {
      if (file.startsWith(prefix)) this.runPaths.delete(runId);
    }
  }

  runPath(runId: string): string | null {
    return this.runPaths.get(runId) ?? null;
  }

  /** 扫描 projects 下的世界场景与短篇 run 文件，一次建立索引。 */
  buildIndex(): Promise<void> {
    this.indexPromise ??= (async () => {
      for (const entry of await this.scanRunFiles()) this.registerRun(entry.runId, entry.file);
    })();
    return this.indexPromise;
  }

  /** 列出新布局下全部 run 文件（世界场景 + 短篇）。 */
  async scanRunFiles(): Promise<RunFileInfo[]> {
    const files: RunFileInfo[] = [];
    let projectEntries;
    try {
      projectEntries = await fs.readdir(this.dirs.projectsDir, { withFileTypes: true });
    } catch {
      return files;
    }
    for (const project of projectEntries) {
      if (!project.isDirectory()) continue;
      const projectId = project.name;
      try {
        const shortFile = this.shortRunFile(projectId);
        await fs.access(shortFile);
        files.push({ runId: projectId, file: shortFile });
      } catch {
        /* 不是短篇项目 */
      }
      const runsDir = this.worldRunsDir(projectId);
      let runEntries;
      try {
        runEntries = await fs.readdir(runsDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of runEntries) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        files.push({ runId: path.basename(entry.name, '.json'), file: path.join(runsDir, entry.name) });
      }
    }
    return files;
  }

  /** 列出新布局下全部 world.json 文件。 */
  async scanWorldFiles(): Promise<string[]> {
    const files: string[] = [];
    let projectEntries;
    try {
      projectEntries = await fs.readdir(this.dirs.projectsDir, { withFileTypes: true });
    } catch {
      return files;
    }
    for (const project of projectEntries) {
      if (!project.isDirectory()) continue;
      const file = this.worldFile(project.name);
      try {
        await fs.access(file);
        files.push(file);
      } catch {
        /* 不是世界项目 */
      }
    }
    return files;
  }
}
