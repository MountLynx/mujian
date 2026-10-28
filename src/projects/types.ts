import type { RunStatus } from '../types.ts';
import type { WorldStatus } from '../world/types.ts';

/**
 * 项目 = 可推进的故事容器 = 本地一个文件夹。
 * 清单（project.json）只存静态归属与展示元数据；进度统计读时计算，不落盘。
 */

export type ProjectKind = 'world' | 'short';

export interface ProjectManifestEntry {
  /** 场景 run id。 */
  id: string;
  kind: 'run';
  addedAt: string;
}

export interface ProjectManifest {
  version: 1;
  id: string;
  kind: ProjectKind;
  title: string;
  kicker: string;
  /** 镜像 world / run 的状态；由 store 在每次 save 时顺手刷新。 */
  status: WorldStatus | RunStatus | 'unknown';
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** 世界项目的聚焦场景归属；短篇的 run 本身就是项目内容，entries 为空。 */
  entries: ProjectManifestEntry[];
}

export interface ProjectSceneEntry {
  id: string;
  title: string | null;
  status: RunStatus;
  beats: number;
  maxBeats: number;
  updatedAt: string;
  addedAt: string;
}

interface ProjectSummaryBase {
  id: string;
  kind: ProjectKind;
  title: string;
  kicker: string;
  status: WorldStatus | RunStatus | 'unknown';
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorldProjectSummary extends ProjectSummaryBase {
  kind: 'world';
  epochCount: number;
  maxEpochs: number;
  openThreads: number;
  unsealedScenes: number;
  pendingSignals: number;
  sceneEntries: ProjectSceneEntry[];
  lastActivityTitle: string | null;
}

export interface ShortProjectSummary extends ProjectSummaryBase {
  kind: 'short';
  beats: number;
  maxBeats: number;
  currentBeatTitle: string | null;
}

export type ProjectSummary = WorldProjectSummary | ShortProjectSummary;

export interface MigrationStatus {
  needed: boolean;
  worlds: number;
  runs: number;
}
