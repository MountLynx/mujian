# 幕间 · 架构

## 一句话

系统分两层：`世界层` 负责时间、区域/势力/线程、并发事件、事实与知识传播、场景调度；`聚焦层` 里，`导演 LLM` 负责局部处境与裁定，`角色 LLM` 只拿到自己的可知信息并宣告 deed/effect，`确定性规则层` 负责 DC 对比、对抗、惩罚、骰点和结果分级，`编排器` 负责阶段、重试、持久化与事件驱动时间。

```text
                ┌────────────────────────────┐
                │       导演 LLM (GM)        │
                │  取景 / 裁定 / 收束 / 记忆  │
                └───────────┬────────────────┘
                            │ 私密信息包
          ┌─────────────────┴─────────────────┐
          ▼                 ▼                 ▼
   角色 A LLM         角色 B LLM         角色 C LLM
   宣告 deed/effect    宣告 deed/effect    宣告 deed/effect
          └─────────────────┬─────────────────┘
                            ▼
                 ┌────────────────────┐
                 │ 敌意举动目标回应 LLM │
                 │ 继续 / 放下原举动    │
                 └──────────┬─────────┘
                            ▼
                 ┌────────────────────┐
                 │ 确定性检定规则层    │
                 │ d20 / DC / 对抗分级 │
                 └──────────┬─────────┘
                            ▼
                    导演收束 + 状态更新
```

---

## 一个时刻的调用顺序

以 N 名主动角色、T 名被敌意举动指向的角色为例：

1. `gm:opening` × 1：生成公开处境、每人私密线索、压力、悬问、幕后注。**拥有完整秘密与隐藏真相。**
2. `actor:action:{id}` × N：并行生成，彼此隔离。
3. `gm:adjudication` × 1：给每个 effect DC、情境修正、落空风险，并可提出 0–1 条 `external_events`；引擎随后用 d20 对它们做外部事件检定（无额外 LLM 调用）。**拥有完整秘密与隐藏真相。**
4. `actor:reaction:{id}` × T：并行生成，目标选择继续/放下原举动并描述回应。只有 hostile=true 的举动会进入这一步。
5. 本地结算：无 LLM 调用。外部事件 d20 检定、举动骰、回应骰、对抗、惩罚、意外奏效/落地/落空。deed 通常发生，检定决定 effect。
6. `gm:resolution` × 1：公开叙事、状态、事实、下一段时间跳跃、可选结局。它拿到已掷骰的外部事件结果，不能新增角色之外的原因。**被结构性地限制为外部视角：不做秘密人物卡，不给隐藏真相，不给角色内心或私密线索。**

总计 **N + T + 3** 次调用。全员互相指向时是 **2N + 3**。

角色举动与回应共享并发上限（默认 4）。被动角色不生成举动，也不进入回应。导演调用按顺序执行。

### 为什么收束阶段要“降权”

早期实现把全部秘密交给收束 LLM。它很容易为了让剧情往前走，让某个角色在旁白里突然坦白、改口或说出未声明的关键台词。这会破坏“角色只根据自己的信息行动”的核心。

因此，收束调用只拿公开材料：公开处境、已声明的 deed/effect/台词、回应、检定结果、公开事实、公开资料。结果：

- 它仍然能把骰点和选择的后果写清楚；
- 它无法泄露它从未见过的秘密；
- 它不能拿角色内心当动机说明；
- 它可能写得不那么“全知”，这恰恰是外视角叙事应有的样子。

秘密、真相和私密线索由下一轮的开场导演处理；那个调用可以看到全部信息，但只负责布置处境与给每人线索，不替角色说话。

---


---

## 世界层

世界层的完整对象模型、JSON schema、并发规则与场景桥见 [`WORLD.md`](WORLD.md)。这里只列它与局部引擎的边界。

```text
WorldRun
  ├─ definition snapshot
  ├─ clock / epochs
  ├─ regions + resources + control
  ├─ factions + power/legitimacy/attitudes
  ├─ actors + position/status/conditions
  ├─ threads + tension/pressure clocks
  ├─ facts + knownBy
  ├─ signals (pending/delivered)
  ├─ events (parent/child, signal, scene)
  ├─ sceneHooks
  └─ sceneRuns ──► local Run.worldLink
```

### 一个世界纪元的调用

1. 服务端创建 `WorldEngine` 后台任务，加载世界快照。
2. `world:epoch` × 1：世界导演拿到全部真相、区域/势力/角色状态、事实、待送达信号、线程和最近场景，输出结构化纪元草案与新的 `advance_minutes`。
3. 解析器校验 schema、实体 id、事实/信号索引、事件树和**独立事件写集冲突**；失败自动重试。
4. 引擎先送达所有 `arrivesAt <= 新时间` 的 pending signal（在应用本纪元新事件之前），再按父子深度应用区域/势力/角色/线程变化、事实和新信号。
5. 若草案带聚焦场景，引擎用同区域 2–4 人建立 `SceneHook`；否则用聚光区角色兜底。
6. 保存世界；UI 轮询看到新纪元。

世界导演只调用一次（重试除外）。它不直接替聚光角色做重大选择。

### 世界与局部的接口

`src/world/scene.ts` 的 `buildWorldScene()` 是唯一的桥：

- 世界事实 → 角色记忆（只取 `knownBy` 包含该角色的事实）；
- 共同已知/公开事实 → `scenario.world.initialFacts`；
- 事件公开叙事 → 开场；
- 场景契约的问题/stakes → `premise` 与导演注；
- 世界层最终真相**不**整体注入局部 GM，只给一条“不得提前宣布世界结局”的导演约束。

局部 run 完成后，`store` 里的 `worldSceneSealed` 标记与 `WorldRun.sceneRuns.status` 保持同步；收束时写入场景事实与 `scene` 事件。

### 世界状态机

```text
ready
  │  advance
  ▼
running ──► planning ──► applying ──► ready | paused | error
  │
  └─ stopRequested ──► 本纪元结束后 paused
```

世界推进与局部 run 推进是两套独立后台任务，各自用 `activeWorldJobs` / `activeJobs` 防止同一对象并发写。世界运行中禁止开镜/收束场景，避免写穿。

## 代码结构

```text
src/
  config.ts                 环境变量、路径、模型配置
  types.ts                  领域类型（角色、deed/effect、骰点、时刻、run）
  server.ts                 无框架 HTTP 服务、后台任务控制、静态文件
  cli.ts                    命令行推演与 Markdown 导出
  utils.ts                  seeded d20、时钟、JSON 提取、并发
  rules/
    checks.ts               核心规则：检定、对抗、多任务惩罚、结果分级
  engine/
    scenario.ts             预置加载、手稿归一化与错误信息
    run.ts                  run 初始化、时钟推进
    store.ts                原子 JSON 持久化、run 列表
    engine.ts               阶段编排、LLM 调用、状态应用、重试
  world/
    types.ts                世界领域类型、信号、事件、场景契约
    definition.ts           世界手稿归一化与预置加载
    run.ts                  世界线初始化、初始事实/信号
    engine.ts               纪元编排、事件应用、信号送达、场景兜底
    scene.ts                世界事实 → 局部 Scenario 的桥
    store.ts                世界线原子持久化
  llm/
    client.ts               DeepSeek（OpenAI 兼容）/ MiniMax（Anthropic 兼容）JSON 调用、重试、usage
    parsers.ts              每种输出的结构校验与容错
    prompts.ts              局部导演 / deed·effect / 裁定 / 敌意回应 / 收束提示词
    worldPrompts.ts         世界导演提示词
    worldParsers.ts         世界纪元 schema / 写集冲突校验
  render/
    markdown.ts             局部战报导出
    worldMarkdown.ts        世界战报导出
content/scenarios/
  fog-harbor.json           预置剧本
content/worlds/
  three-tides.json          预置世界
public/
  index.html / styles.css / app.js
tests/
  rules.test.ts             规则边界
  engine.test.ts            假模型下完整编排 + 信息隔离
  scenario.test.ts          手稿校验与时钟
  world.test.ts             世界纪元、并发、知识隔离、场景桥
```

运行时不依赖第三方包；Node 24 原生执行 `.ts`（type stripping），`typescript` 只用于类型检查。UI 用本地 Playwright 做过桌面/移动端与交互验证，但它不是运行依赖。

---

## 状态机与断点

```text
ready
  │
  └─ advance ──► running
                   │
                   ├─ opening
                   ├─ actions      (并行；部分结果可保存)
                   ├─ adjudication
                   ├─ reactions    (并行；部分结果可保存)
                   ├─ rolling      (纯函数，确定性)
                   ├─ resolution
                   ▼
                 ready | paused | ended | error
```

- `ensureBeat()`：如果最后一时段未完成则续做；完成则按时钟创建下一时段。
- 每个阶段结束都调用 `save()`；Web 端轮询因此能看到角色“思考中 / 已选”等进度。
- 角色行动失败不阻塞其他角色完成；`mapConcurrent` 内捕获错误，最后统一抛出一个可重试错误。重试会跳过已有行动。
- 回应阶段与行动阶段同理。
- 骰点阶段在 `phase === 'resolution'` 时不会重新掷骰。
- 错误保存在 run 的 `error` 字段，状态变为 `error`；再次推进从当前 phase 继续。
- 服务重启时，`recoverInterruptedRuns()` 将残留的 `running` run 标为 paused。

### 并发与写入

- 每个 run 同时只允许一个后台任务（`activeJobs` Map）。
- 文件写入先写同目录临时文件，再 `rename`，并在同一 run 内串行化。
- SSE 没有使用：UI 以 1.1 秒轮询 `/api/runs/:id`，足够观察阶段变化，也更容易从断线恢复。

---

## 信息隔离矩阵

| 信息 | 开场导演 | 裁定导演 | 公开叙事者 | 角色自己 | 其他角色 |
|---|---|---|---|---|---|
| 世界设定 / 场所 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 导演级 hiddenCanon / 导演笔记 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 自己的秘密 / 欲望 / 恐惧 | ✅ | ✅ | ❌ | ✅ | ❌ |
| 他人的秘密 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 角色记忆 | ✅ | ❌ | ❌ | ✅（按提示词截取） | ❌ |
| 公开事实 / 公开形象 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 本刻公开处境 | ✅ | ✅ | ✅ | ✅ | ✅ |
| 本刻私密线索 | ✅ | ❌ | ❌ | 只拿自己的 | ❌ |
| 各角色举动宣告（deed/effect） | 取景时尚未发生 | 全部 | 全部 | 只拿自己的；敌意指向时拿到对方 deed/台词 | 同左 |
| 内心 thought | — | 不需要 | ❌ | 自己 | ❌ |
| 本刻骰点 | — | 尚未产生 | ✅（作为结果约束） | ❌（行动时） | ❌（行动时） |
| 目标是否继续原举动 | — | — | ✅（结果） | 自己 | 举动者不参与该决定 |

角色提示词构建在 [`src/llm/prompts.ts`](../src/llm/prompts.ts)，信息隔离有自动化测试（`tests/engine.test.ts`）。

世界层的隔离矩阵更简单，但不是自动成立的：世界导演可见全部事实；角色/势力运行时只能通过 `knownBy` 看见事实；聚焦场景桥只复制该角色已知的事实；世界 UI 默认隐藏秘密，剧作家视角才显示未知。实现与测试在 [`src/world/scene.ts`](../src/world/scene.ts) 与 `tests/world.test.ts`。

---

## 导演的三个职责（不同调用，不同信息权限）

1. **取景**：拥有全部秘密，但只输出一个可感知的处境；给每人不同的私密线索，不替角色行动。
2. **裁定**：拥有全部秘密，看完全部宣告但不看骰点，给每个 effect 独立 DC 与情境修正。
3. **收束**：只拥有公开信息。严格遵守已结算结果，写公开叙事，更新可观察状态与事实，选择下一段时间跳跃。

收束提示词明确禁止为角色补充未声明的关键决定、坦白或承诺，也禁止把 `thought` 当成已发生的行为。**更重要的是，它拿不到秘密与内心，因此从结构上无法让角色在旁白里坦白自己从未说出口的事。** 这是权限设计，而不只是措辞请求。

---

## 收束的边界

`ending` 仍由 resolution 模型可选输出；引擎没有“本场问题已回答”的结构化状态，也没有幕形或 `endingCondition`。`maxBeats` 只负责让 run 停下，不负责让故事结束。

当前做的是两件不规定结局的事：

- **世界时钟**：`deadlineClock` / `deadlineFact` 到期后写入公开的世界事实（除非之前已经建立了新的延迟事实）。它关闭选项，不选择人物反应。
- **事后选择结尾**：`src/prose/` 的大纲步骤选择 `endingBeatIndex`，正文只使用到这一拍为止；后面的时刻是未采用的延续。

小场景实测（[`CONVERGENCE-TEST.md`](CONVERGENCE-TEST.md)）中，双人、单地点、单截止时间的场景在 6 刻内没有自己产生 `ending`；低复杂度能收窄场景，但不能单独产生收束。因此“推演自己停”仍不是当前能力；当前能力是“世界时钟不矛盾，故事可以由正文工作流事后收束”。

## 文字创作层

推演层结束时，run 里留下的是一份可审计的情节记录：deed/effect、回应、检定、状态、公开事实、时间跳跃。视角、人称、文体、有限视角与主角不进入推演提示词，而是由 `src/prose/` 的两步工作流处理：

```text
Run
 ├─ prose:outline   把每个时刻整理成场景，并选择 endingBeatIndex（POV / 意象 / 转折 / 收束点）
 └─ prose:draft     按 POV、人称、文体写正文
```

- `--pov <character_id>` 只把该人物自己的秘密、记忆、私密状态和私密线索交给正文工作流；别人物的秘密与内心不进入提示词。
- `--pov omniscient` 允许作者使用全部材料，但提示词要求秘密由场景与举动揭示。
- `--person first|third`、`--style`、`--prose-length` 控制文体与篇幅。
- 正文工作流不修改 run，不重掷骰子；同一场 run 可以用不同 POV/文体生成不同版本。

详见 [`PROSE.md`](PROSE.md)。

## HTTP API

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/api/health` | 模型、Key 是否配置、当前活动 run 数 |
| GET | `/api/scenarios` | 预置剧本摘要 |
| GET | `/api/scenarios/:id` | 完整预置剧本（手稿底本） |
| GET | `/api/runs` | run 列表摘要 |
| POST | `/api/runs` | `{presetId}` 或 `{scenario}`，可带 `maxBeats/seed/thinking` |
| GET | `/api/runs/:id` | `{run, active}` |
| DELETE | `/api/runs/:id` | 删除 run（活动任务不可删） |
| POST | `/api/runs/:id/advance` | `{mode:"one"|"auto", beats:number}`；异步 202 |
| POST | `/api/runs/:id/stop` | 请求在本刻结束后暂停 |
| GET | `/api/runs/:id/export.md` | 中文战报（含幕后附录） |
| GET | `/api/runs/:id/export.json` | 完整 run JSON |
| GET | `/api/world-presets` | 预置世界摘要 |
| GET | `/api/world-presets/:id` | 完整预置世界 |
| GET | `/api/worlds` | 世界线列表 |
| POST | `/api/worlds` | `{presetId}` 或 `{world}`，可带 `maxEpochs/seed/thinking` |
| GET | `/api/worlds/:id` | `{world, active}`；非运行中会同步关联场景状态 |
| DELETE | `/api/worlds/:id` | 删除未运行中的世界 |
| POST | `/api/worlds/:id/advance` | `{mode:"one"|"auto", epochs}`；异步启动 |
| POST | `/api/worlds/:id/stop` | 本纪元结束后暂停 |
| POST | `/api/worlds/:id/scenes` | `{hookId}`，从场景契约开镜 |
| POST | `/api/worlds/:id/scenes/:runId/seal` | 收束场景回世界 |
| GET | `/api/worlds/:id/export.md` | 世界战报 |
| GET | `/api/worlds/:id/export.json` | 完整世界快照 |

推演推进是异步的：HTTP 请求只负责启动后台任务，UI 通过轮询看进展，避免长连接超时。世界运行中不允许场景开镜/收束，防止世界写穿。

---

## 已知边界与可扩展点

- 一个局部 run 仍是一个封闭的一场景故事；跨地点、多场景与角色分开行动由世界层组织。世界层已经持久化区域、位置与交通时间，但还没有强制的图寻路器。
- 世界层没有独立的 LOD 角色日程/经济/战争模拟器；这些目前由世界导演提议、规则层校验。事实账本也只建模“真实事实 + 谁知道”，尚未把虚假信念/谣言做成独立对象。
- 聚焦场景的余波是软回写：场景摘要、参与者事实与 `scene` 事件进入世界，但局部骰点不会自动换算成区域资源/势力数值。
- DC 由导演 LLM 在宣告后给出。这是叙事导演的临场裁定；若需要完全确定性难度，可换成可配置规则表。
- 能力点固定，不随故事成长；目前成长通过状态、关系、记忆与信息优势体现。
- 当前结局由收束 LLM 自行判断并可选输出；引擎不用剧情模板强制结局。
- **叙事语义不保证逐字忠实。** 机械结果（deed/effect、目标、惩罚、骰点、等级、状态变化来源）是严格可审计的；收束叙事调用被剥夺秘密与内心，但仍可能对已声明的行动做文学化转述、补一个拿道具的舞台动作或写一句感叹。若需要“逐字只允许声明行为”，应再加一个结构化的行为段白名单校验层。
- 可往下一步：角色关系数值化、道具系统、多 NPC 参战、观众/人类玩家接管某个角色、SSE 实时流、存档分叉、叙事忠实度校验。
