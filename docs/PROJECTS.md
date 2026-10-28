# 故事项目管理设计（PROJECTS）

> 状态：**已实施（2026-10-27）。** 本文保留为设计与实施依据；实际落地按 §8 顺序完成。
> 关联：[`FRONTEND-REDESIGN.md`](FRONTEND-REDESIGN.md)（v0.3 前端重构，已实施）。

## 0. 要解决的问题

现状是"两个平铺目录 + 一堆 JSON"：`data/runs/` 混放独立推演与世界场景，`data/worlds/` 是世界线。由此：

- 一个世界的故事（世界线 + 它的聚焦场景）在磁盘上没有整体形态，无法整体复制/备份/删除；
- 删除世界后场景成为孤儿，归属关系只存在于 run 内部的 `worldLink` 字段里；
- 首页把所有 run 平铺混排，回答不了"我有哪几个故事、各自进展如何、今天从哪个继续"；
- 世界内的场景生命周期（开镜/推演/待收束/已收束）散落在纪元时间线里，忘记收束没有任何提醒；
- 线程（主线）的逐纪元演变笔记（`thread.history`）数据存在但从未展示。

目标：把"项目"做成**后端与本地文件的一等概念**，前端在其上做项目总览与故事层。不新增推进/收束逻辑，不改 run/world 内部 JSON schema。

## 1. 概念模型与决策记录

**项目 = 可推进的故事容器 = 本地一个文件夹。** 分两类：

| 类型 | kind | 项目 id | 内容 |
|---|---|---|---|
| 世界项目 | `world` | 沿用 `world_*` | `world.json` + 其全部聚焦场景 run |
| 短篇 | `short` | 沿用该 run 的 `run_*` id | 单个 run |

已定决策（2026-10 评审）：

1. **每项目一个文件夹**（而非平铺 + 索引清单）——资源管理器所见即所得；
2. **CLI 手动迁移**（服务不自动动数据）；旧文件备份不删；
3. **删除世界项目级联删除**其全部聚焦场景（确认弹窗明示数量）；
4. **显式归档态**（清单 `archived` 标志，总览折叠区）；
5. 独立推演定名**「短篇」**，不可认领到世界（保持收束模型纯净）；
6. 项目 id 沿用现有 id——旧链接 `#run/<id>`、CLI `--resume <run_id>` 全部继续有效。

## 2. 本地文件布局

```
data/
  projects/
    world_012eb4df7754/            # 世界项目
      project.json                 # 项目清单（schema 见 §2.1）
      world.json                   # WorldRun 快照（原 data/worlds/<id>.json，内容不变）
      runs/
        run_08fd0b79254e.json      # 该世界的聚焦场景（原散落在 data/runs/）
    run_7de4361132db/              # 短篇项目
      project.json
      run.json                     # Run 快照（原 data/runs/<id>.json，内容不变）
```

### 2.1 `project.json` 清单 schema

```json
{
  "version": 1,
  "id": "world_012eb4df7754",
  "kind": "world",
  "title": "归潮王座：三城之夜",
  "kicker": "归潮历 73 年 · 霜月十七日",
  "status": "paused",
  "archived": false,
  "createdAt": "2026-10-26T22:20:00.000Z",
  "updatedAt": "2026-10-27T00:11:00.000Z",
  "entries": [
    { "id": "run_08fd0b79254e", "kind": "run", "addedAt": "2026-10-26T23:40:00.000Z" }
  ]
}
```

原则：**清单只存静态归属与展示元数据**。进度统计（开放线程、待收束场景等）一律读时计算，不落盘，避免失真。`status`/`updatedAt` 在世界或 run 每次 `save` 时由 store 顺手刷新（幂等、便宜）。

## 3. 存储层改造

约束：`RunStore.load(id) / save(run)` 的对外签名**不变**（CLI `src/cli.ts` 与引擎 `src/engine/*` 直接调用）；服务端 16 处 store 调用点不改语义。

### 3.1 模式判定

- `config` += `projectsDir: path.resolve(process.cwd(), 'data', 'projects')`。
- 进程启动时确定一次：`projects/` 存在且非空 → **新布局模式**；否则 **旧布局模式**（`data/runs`、`data/worlds` 双读，写入仍落旧布局）。运行中不切换模式；迁移命令完成后重启即进入新布局。

### 3.2 RunStore

- `save(run)` 写入路径推导：
  - `run.worldLink` 存在 → `projects/<worldLink.worldId>/runs/<run.id>.json`；
  - 否则 → `projects/<run.id>/run.json`；
  - 写前确保所在项目的 `project.json` 存在（缺失则按 run 内容生成，幂等），并刷新清单 `updatedAt`；原子写（tmp + rename）与 per-run 写队列沿用。
- `load(id)`：经 **runId→路径内存索引** 解析（`Map<runId, path>`）。索引在启动时扫描 `projects/*/runs/*.json` 与 `projects/*/run.json` 一次建立；`save`/新场景创建时登记；项目删除时清除。索引 miss → 返回 null（404 语义不变）。
- `list()`：扫描 run 文件聚合（保持现有 `RunSummary` 全部字段），新增 `maxBeats`。
- 旧布局模式下：`load/list/save` 走原扁平路径（原实现），不写清单。

### 3.3 WorldStore

- `load(id)` → `projects/<id>/world.json`；`save` 同路径并刷新清单；`list()` 读各项目 `world.json`（新布局）/ 旧目录（旧布局）。

### 3.4 ProjectStore（新，`src/projects/store.ts`）

- `list(): Promise<ProjectSummary[]>`——聚合清单，读时统计：
  - 世界项目：`epochCount/maxEpochs`、`openThreads`（threads runtime `status==='active'` 数）、`unsealedScenes`（sceneRuns 中 `status!=='completed'` 且 `beatCount>0` 数）、`pendingSignals`、`sceneEntries`（清单 entries + 各 run 的 status/beats 摘要）、`lastActivityTitle`（当前纪元标题）；
  - 短篇：`beats/maxBeats`、`currentBeatTitle`。
- `delete(id)`——世界项目：整目录删除（含 `runs/` 全部场景，即级联；返回删除的场景数）；短篇：删单文件夹。同时清除 runId 索引。
- `setArchived(id, archived)`——只改清单 `archived` 字段。
- `ensureManifest(dir, seed)`——供 RunStore 首写时生成清单。

## 4. 迁移（CLI 手动）

`node src/cli.ts --migrate-projects`：

1. 校验服务未在运行（尝试锁文件或提示）；
2. 逐个 `data/worlds/*.json` → `projects/<worldId>/`（写 `world.json` + 生成清单）；
3. 扫描 `data/runs/*.json`：`worldLink.worldId` 匹配已迁世界 → 移入 `projects/<worldId>/runs/` 并登记该清单 `entries`；其余 → `projects/<runId>/run.json`（清单 kind=`short`）；
4. 全部成功后旧目录改名 `data/legacy-<时间戳>/`（备份，不删除）；任一步失败则中止且不改名（已写入的新文件保留，重跑幂等跳过）；
5. 打印迁移报告：项目数、场景归位数、跳过项。

服务端配合：`/api/health` += `migration: { needed: boolean, worlds: number, runs: number }`；前端首页在 `needed` 时显示提示条「检测到旧布局数据（n 条世界线 · m 条推演）。运行 `node src/cli.ts --migrate-projects` 完成迁移 →」。旧布局期间一切功能照常（双读）。

## 5. API

新增：

```text
GET    /api/projects                    项目列表（清单 + 读时统计 + archived）
POST   /api/projects/:id/archive        归档
POST   /api/projects/:id/unarchive      恢复
DELETE /api/projects/:id                级联删除（响应含 deletedScenes 数）
```

保留不变（内部走新 store，响应只增字段）：`/api/runs`（RunSummary += `maxBeats`）、`/api/worlds`（WorldRunSummary += `openThreads` / `unsealedScenes` / `pendingSignals`）、`/api/runs/:id`、`/api/worlds/:id`、开镜/收束/推进等全部现有端点。`/api/health` += `migration`。

## 6. 前端设计（零构建模块结构不变）

### 6.1 首页 → 项目总览

- 头部统计行：「X 个世界项目 · Y 个短篇 · Z 项待办」（待办 = 待收束场景 + 中断项目）+ 新建入口 + 迁移提示条（如需）。
- **「世界项目」组**（每世界一张横向项目卡）：
  - 上行：标题 · kicker · 状态 pill · 归档小按钮（…菜单或图标）；
  - 指标行：纪元 n/m · 开放线程 n · 在途消息 n · 最近动态（`lastActivityTitle` + 时钟 + 相对时间）；
  - 待办徽标：`unsealedScenes>0` → 「n 个场景待收束」；`status==='error'` → 「中断」；
  - 场景行（`/api/runs` 按 `worldId` 过滤，≤4 条 + 溢出计数）：状态点 + 场景标题（即 hook 标题，`server.ts` buildWorldScene 已映射）+ n/max 刻 + 相对时间，点击直达推演页；
  - 组尾：「新建世界线 →」。
- **「短篇」组**：现有 run 卡网格（过滤掉带 `worldId` 的），卡加 n/max 刻进度。
- **「已归档」折叠区**（`<details data-key>`）：归档项目卡 + 恢复按钮。
- 数据仅用 `/api/projects` + `/api/runs`，零额外请求。

### 6.2 世界页「故事层」

- **场景带**（新区域 `world-scenes`，位于导航条之上、纪元线之上），分区顺序：推演中 → 待收束 → 可开镜（最新纪元 `offered` hook）→ 已收束（最近若干）。卡 = hook 标题、区域、参与者头像、刻数、状态章；操作复用现有 API（开镜 / `#run/:id` / 收束）；旧纪元 hook 标「已归档」不可开镜；已收束卡展示 `sceneRuns.summary`。
- **收束提醒**：待收束 >0 时头部下渲染提示条「n 个场景已推演，余波尚未写回世界账本 →」，点击滚动到场景带。
- **线程档案抽屉**（新 `data-act="open-world-thread"`）：问题、赌注、压力钟 + 紧张、状态、**逐纪元笔记**（`thread.history` 倒序，现成数据）、**关联事件**（`events[].effects.threadChanges.threadId` 反查，正序，点击开既有事件弹窗）、涉及势力/区域 chips。
- 区域签名：`world-scenes` 独立于 `world-main`（签名 = sceneRuns 状态/beatCount + hooks 状态 + running）。

### 6.3 删除确认改造

删除世界项目的确认弹窗改为明示「将同时删除 n 个聚焦场景，不可恢复；可先导出战报」，走 `DELETE /api/projects/:id`。

### 6.4 落点与工具

- `js/render/home.js`：分组 + 共享 `worldProjectCard` 渲染；`js/render/library.js` 复用（世界库页改「世界项目」，保留建线设置与手稿编辑器）；
- `js/render/world.js`：`world-scenes` 区域 + 提醒条 + 线程行 `data-act`；
- `js/render/drawers.js`：`openWorldThreadDrawer`；
- `js/main.js`：handleClick 增 `open-world-thread` / 归档 / 恢复 case；
- `js/dom.js` += `relativeTime(iso)`（「3 小时前」）；
- `css/views.css` += 项目卡 / 场景带 / 提醒条 / 归档区样式（双主题 token）。

## 7. 数据流示例（现有数据迁移后）

```
data/projects/world_012eb4df7754/        ← 《归潮王座》世界项目
  project.json   （entries: [run_08fd0b79254e]）
  world.json     （2/4 纪元 · 9 事件 · 3 待办之一：1 场景待收束）
  runs/run_08fd0b79254e.json             ← 《长明号点名》聚焦场景
data/projects/run_7de4361132db/          ← 《雾港》短篇
```

首页总览据此渲染：世界项目卡显示 2/4 纪元、1 个待收束徽标、场景行《长明号点名》；短篇组显示《雾港》3 刻。

## 8. 实施顺序（动工时）

1. `config.projectsDir` + 三 store 改造 + runId 索引（§3）；
2. `--migrate-projects` 命令 + 迁移单测（§4）；
3. `/api/projects`、archive/unarchive、级联删除、`health.migration`（§5）；
4. summary 扩展字段（store + `src/types.ts` / `src/world/types.ts`）+ 测试断言；
5. 前端：项目总览 → 世界页故事层 → 归档区 / 迁移提示 / 删除弹窗（§6）；
6. 验证与文档同步（§9）。

## 9. 验证计划

- `pnpm test` + `pnpm typecheck`；新增单测：
  - 迁移：临时目录构造旧布局 → 迁移 → 断言文件位置/清单内容/场景归属/幂等重跑/旧目录改名；
  - RunStore 新布局：load/save/list 往返、索引 miss→null、ensureManifest 幂等；
  - ProjectStore：级联删除（返回场景数、索引清理）、归档/恢复；
  - world/engine 既有测试适配新布局（tmp projectsDir）+ summary 新字段断言。
- 无头渲染冒烟（沿用 `/tmp` 里那套 DOM 桩思路，落为 `tests/ui-smoke` 或脚本）：首页分组断言、场景带分区断言、线程抽屉断言、归档区断言。
- Playwright：在 data 副本上演练迁移后走全流程（总览 → 世界页 → 场景带 → 收束提醒 → 线程抽屉 → 归档），双主题截图 + 控制台零错误。
- README：快速开始加迁移一行、数据目录结构更新、「界面」段更新；本文档状态改为「已实施」。

## 10. 边界与未来专项

- 不改引擎推进/收束逻辑；run/world 内部 JSON schema 完全不变（只换存放位置与归属）。
- 短篇不可认领到世界（世界归属必须有 hook/收束链路支撑）。
- 归档只是标志位，不影响任何推进能力。
- **未来专项**：跨世界共享角色/正典（实体链接、正典同步）需要引擎级新概念；项目级导入/导出（打包文件夹为 zip）；项目重命名（清单与世界/run 标题双向同步）。
