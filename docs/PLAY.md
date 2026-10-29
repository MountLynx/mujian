# 扮演模式（PLAY）

> 状态：**已实施（2026-10-28）。** 同一条角色引擎上，把一名主动角色换给真人玩家；信息边界由服务端裁切，复盘时一次性公开全部幕后信息。
> 关联：[`ARCHITECTURE.md`](ARCHITECTURE.md)、[`RULES.md`](RULES.md)、[`../GLOSSARY.md`](../GLOSSARY.md)、[`adr/0001-play-mode-info-boundary.md`](adr/0001-play-mode-info-boundary.md)。

## 0. 一句话

推演模式里所有主动角色由角色 LLM 扮演；扮演模式里恰好一名主动角色由真人玩家控制。运行方式、deed/effect、DC、敌意回应与骰点规则完全相同，区别只有两点：**玩家角色的输入来自人**，**玩家只能拿到这个角色能知道的信息**。

## 1. 概念与术语

| 术语 | 含义 |
|---|---|
| 玩家角色 | 扮演模式中被玩家控制的角色。角色卡、私密线索、记忆与自己的检定对玩家完全可见。 |
| 可知信息 | 公开处境、本人私密线索、本人角色卡与记忆、公开事实、本人举动与回应。 |
| 他者可见记录 | 他人 deed、台词、公开状态与事实、叙事。 |
| 机制内幕 | DC、骰点、结果分级、裁定理由、外部事件概率与检定、状态修正。 |
| 复盘 | 故事结束后解除信息边界；一次性公开全部记录，并把本场置为结束。 |

完整定义见 [`../GLOSSARY.md`](../GLOSSARY.md)。

## 2. 信息边界

扮演模式下，服务端返回给浏览器的 run 是裁切过的。前端只渲染这份数据；导出、全知正文与完整 JSON 在复盘前一律拒绝。

| 内容 | 玩家可见？ | 说明 |
|---|---|---|
| 场景公开处境、压力、悬问、公开事实、叙事 | 是 | 所有在场者可感知 |
| 自己的角色卡、秘密、欲望、恐惧、记忆、关系 | 是 | 就是本人 |
| 自己的 deed/effect/台词/内心/骰点/DC | 是 | 自己的机制与内心 |
| 自己的私密线索、私密状态、私密笔记 | 是 | 只属于本人 |
| 他人的公开资料、可见状态、deed、台词、回应 | 是 | 可被观察 |
| 他人的秘密、欲望、恐惧、性格、记忆、关系、能力、特质 | 否 | 复盘才公开 |
| 他人的 effect（想达成什么）、thought（内心）、goalProgress、stakes | 否 | 意图不可观察 |
| 他人的骰点、DC、裁定理由、结果分级 | 否 | 机制内幕 |
| 他人的私密线索、私密状态、私密笔记、随身物、flags | 否 | 角色私有 |
| `gm_note`、`outcome_notes`、外部事件失败项、`hiddenCanon`、`directorNotes` | 否 | 导演幕后 |
| 他人的 abandoned 举动 | 否 | 没发生，也无从看见 |

**例外：敌意回应。** 当有敌意举动指向玩家时，引擎会暂停并把指向玩家的举动（deed、effect、台词）交给玩家，因为规则要求目标在骰子落下前决定是否继续原举动。这与 AI 角色的回应提示词拿到的是同一份信息。

**复盘之后**：`recapAt` 写入后，服务端不再裁切；同一条 `GET /api/runs/:id` 返回完整 run，导出与正文也解锁。复盘会把 run 置为 `ended`，不能继续推进。

## 3. 状态机

新增的状态与阶段：

```text
RunStatus += awaiting
BeatPhase += player_action | player_reaction
Run.play = {
  characterId, awaiting: 'action'|'reaction'|null, recapAt, createdAt
}
```

一刻的完整流程（P 为玩家角色）：

```text
opening
  └─ 若是扮演模式且本刻还没有玩家的举动
       → player_action（等待输入，run.status = awaiting）
玩家提交 deed/effect（POST /api/runs/:id/play/action）
  → actions（AI 角色生成举动，玩家举动已在记录中）
  → adjudication
  → reactions
       ├─ 无指向玩家的敌意 → rolling
       └─ 有指向玩家的敌意 → player_reaction（等待输入）
玩家提交回应（POST /api/runs/:id/play/reaction）
  → reactions → rolling → resolution → complete
```

顺序上的两个决定：

1. **玩家先宣告，AI 再宣告。** 玩家不会看到其他人的选择，也不会被“其他人已经做了什么”影响；AI 的行动提示词同样看不到玩家的举动。只有敌意回应阶段会拿到指向自己的那份记录。
2. **玩家回应前不掷骰。** `player_reaction` 阶段不会进入 `runRolls`；回应提交后才统一结算原举动、分心惩罚、对抗和多目标压力。

## 4. 服务端裁切

实现在 `src/engine/playerView.ts` 的 `redactRunForPlayer(run)`：

- `scenario.world.hiddenCanon` / `directorNotes` 清空；
- 其他角色的 secret/desire/fear/personality/relationships/memories/traits/possessions/conditions 清空，abilities 归零；
- 其他角色的运行时记忆、随身物、flags、紧张值清空，状态只保留 public；
- 每个时刻：`gmNote` 清空，私密线索只留玩家自己的，`outcomeNotes` 清空；
- 举动：
  - 玩家自己的举动完整保留；
  - 完成时刻的他人举动保留 deed/台词/目标，“想要的效果”、内心、能力、特质、骰点、结果、裁定全部清空；
  - abandoned 的他人举动整条移除；
  - 等待回应时，指向玩家的敌意举动额外保留 effect 与台词。
- 回应：自己的完整；他人的只保留姿态、描述与台词，去掉内心、骰点、`continueOriginal` 与 incoming 关联；
- 裁定：只留玩家自己行动的 DC 与难度，理由/风险清空；
- 外部事件：只保留成功的；失败项、DC、d20、概率与理由不返回；
- 状态变化：他人只保留 public 状态；私密笔记、记忆、物品变化、flags 全部清空；
- `run.world.flags` 与所有运行时 `character.flags` 清空；
- `seed` 与 `rules.difficultyGuidance` 也隐藏：前者能让玩家预先推算确定性骰点，后者是作者侧难度注记。两者都在复盘时恢复。

这套裁切是**数据边界**，不是渲染约定：即使直接 `curl` 也拿不到复盘前不该见的内容。测试用结构断言 + 从完整 run 提取隐藏文本再反向扫描，防止新字段无意泄露。

## 5. HTTP API

```text
POST /api/runs
  body: { presetId | scenario, maxBeats, seed, thinking,
          play: { characterId } }
  创建扮演场。创建响应同样已裁切。

GET  /api/runs/:id
  扮演模式且未复盘：返回裁切后的 run。
  已复盘 / 非扮演：完整 run。

POST /api/runs/:id/play/action
  body: { deed, effect, ability, dialogue?, thought?, stakes?,
          summary?, category?, trait?, targetId?, hostile? }
  仅在 beat.phase = player_action 时接受。写入玩家举动并启动后续推演。

POST /api/runs/:id/play/reaction
  body: { continueOriginal, description, ability,
          summary?, stance?, dialogue?, thought?, trait? }
  仅在 beat.phase = player_reaction 时接受。

POST /api/runs/:id/recap
  解除裁切，把 run 置为 ended。等待输入或推演中拒绝。

GET  /api/scenarios/:id/cast
  预置剧本的公开角色卡，供扮演建场选人；不返回秘密。

POST /api/worlds/:id/scenes
  body: { hookId, play?: { characterId } }
  从世界场景契约开镜时，可选择让玩家接手其中一名参与者。
```

`POST /api/runs/:id/advance` 在等待玩家输入时返回 409；扮演模式不接受 `mode: "auto"`。复盘后拒绝继续推进。`/export.*`、`/prose` 在复盘前返回 403。

## 6. 前端

- **新建页**：游玩方式切换到「扮演模式」后，从预置剧本的 `/cast` 或自定义手稿的角色列表选择角色。预置剧本不会为了选人而下载完整秘密。
- **等待宣告**：舞台显示公开处境、自己的私密线索、自己的角色卡速览与宣告表单（deed/effect/能力/特质/目标/敌意/台词/内心）。
- **等待回应**：列出指向自己的敌意举动的 deed/effect/台词，选择继续或放下原举动，填写回应。
- **落定后**：公开叙事、自己的举动与回应（含骰点和结果）、他人的可观察 deed/台词与公开余波。界面明确标注“你看见的”“旁人可感知的部分”。
- **复盘**：终章或侧栏进入复盘确认；确认后自动打开完整复盘弹窗（所有人的底牌、剧本背后、逐刻全记录、导出完整战报）。同时舞台恢复完整数据与全知视角。

## 7. 验证

```bash
pnpm typecheck
pnpm test          # 含 tests/play.test.ts：等待、提交、回应、裁切与复盘
pnpm test:ui       # 含扮演模式等待视图 / 档案边界 / 落定视图 / 复盘 / 新建页
```

自动化测试用假模型覆盖了两个方向：

- 玩家被敌意指向 → `player_reaction` 暂停 → 提交回应 → 放下/继续原举动与分心惩罚；
- 玩家敌意指向 AI → AI 目标的回应提示词包含玩家的 deed/effect/台词，但不含玩家内心或他人秘密。

真实 LLM 的端到端记录、完整战报与浏览器截图见本文 §8。

## 8. 实测记录（2026-10-28）

真实模型：DeepSeek `deepseek-flash`，`LLM_THINKING=auto`；服务 `PORT=4499`，旧数据布局。每场只推进 1 刻，完整走通"建场 → 等待 → 提交 → 裁定 → 落定 → 复盘"。

| run | 玩法 | 调用 | tokens | 结果 |
|---|---|---|---:|---|
| [`run_4dfeaef4d540`](../examples/play-mode/mine-reaction.json) | 《最后一根火柴》：扮演阿岚；老周持撬棍威逼 | 4 | 12,786 | 玩家继续原举动（−2 分心），回应 23 对抗老周 27，威逼落地；玩家原举动 20 vs DC 15 仍落地 |
| [`run_b240bce41b3a`](../examples/play-mode/play-action.json) | 扮演沈砚；真浏览器从新建页开局 | 6 | 29,132 | 玩家举动落地（21 vs DC 14）；外部涌浪 d20 1 未发生；复盘成功 |
| [`run_4fe42c1658e2`](../examples/play-mode/play-reaction.json) | 扮演沈砚；顾行舟敌意指向玩家 | 6 | 26,420 | 玩家继续原举动（−2 分心），回应 19 对抗顾行舟 8，敌意落空；玩家原举动仍落地 |

> `play-reaction` 这一局产生于下面第 2 条规则修复之前：林小满的非敌意举动当时被错误地和沈砚的回应总值对抗。快照保留为实测记录，不代表当前规则；当前规则见 `src/rules/checks.ts` 与回归测试。`mine-reaction` 产生于修复之后，是当前规则的干净示例；同源手稿已收录为预置剧本 [`content/scenarios/last-match.json`](../content/scenarios/last-match.json)。

浏览器验证（`tests/play-browser-check.mjs` + 针对性反应测试）：

```bash
# 终端 A
PORT=4499 node src/server.ts
# 终端 B：需要 Playwright；会真实调用一次完整时刻
PLAYWRIGHT_MODULE=<playwright>/index.mjs BASE=http://127.0.0.1:4499 \
  node tests/play-browser-check.mjs
```

- 新建页切换扮演模式、选择沈砚、开局；等待表单出现；填写并提交；落定后看到"你的举动 / 你看见的 / 旁人可感知的部分"；确认复盘、弹窗公开所有人的底牌与逐刻记录；桌面与移动端截图；控制台零错误。
- 反应表单真实跑通：顾行舟的敌意举动以"冲着你来"卡片出现，包含 deed/effect/台词；继续/放下原举动选择生效；提交后骰点结算，玩家回应 19、原举动 −2 后仍 21 vs DC 14。
- 复盘前 `export.md` / `export.json` / `prose` 全部 403；复盘后导出解锁；复盘后继续推进 409。

截图：[等待宣告](screenshots/play-awaiting.png) · [回应敌意](screenshots/play-reaction.png) · [复盘底牌](screenshots/play-recap.png)。

裁切验证：

- 结构断言：其他角色的 secret/desire/fear/personality/relationships/memories/traits/abilities 清空；运行时记忆/随身物/flags/紧张值清空；gmNote、outcomeNotes、他人私密线索、他人 effect/thought/骰点/DC、失败外部事件、world flags 均不在响应里；`seed` 与 `difficultyGuidance` 也隐藏到复盘。
- 文本反向扫描：从完整 run 提取 117 条隐藏文本，在玩家视图中只命中 1 条——顾行舟的 deed 里当众使用了"军用防水手电"。这是一条合法的可观察信息，不是泄露。

实测暴露并修掉的两个问题：

1. **长 deed/description 在标题留空时被误拒。** 旧实现把正文截成标题时沿用了"标题最多 24 字"的校验，导致长文本提交得到 400。改为 `derivedTitle()` 截取，并加回归测试。
2. **目标在回应别的敌意时，非敌意指向仍被拿去和回应总值对抗。** 真实反应局里，林小满的非敌意举动指向正在回应顾行舟的沈砚，却被错误地和沈砚的回应 19 对抗。`resolveChecks` 现在只在 `hostile !== false` 时才读取目标回应；非敌意指向继续对 DC 结算。已加规则回归测试。

## 9. 已知边界

- 剧本文件本身（`content/scenarios/*.json`）与 `GET /api/scenarios/:id` 仍然面向作者/调试；扮演模式的 UI 走 `/cast`，不主动拉取秘密。这是本地单用户工具的取舍，不是权限系统。
- 世界层的作者视图没有按玩家裁切；从扮演场景跳回世界线可能看到世界幕后资料。因此未复盘的扮演场隐藏了“回到世界线”入口。需要更严格隔离时，应把世界视图也纳入同一套裁切。
- 回放/重试：复盘后不能继续推进；想继续这个故事，请另起一场。
