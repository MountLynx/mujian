# 从推演到正文 · 文字创作工作流

推演层负责**情节如何发生**：谁做了什么、想要什么效果、点数落在哪里、谁回应、世界承认了什么事实。它不负责视角、人称、文体和“这一段读起来像谁写的”。

这些交给一个独立的**文字创作工作流**。它读取已经完成的 run，不修改推演结果，分两步：

1. **大纲**：把每个推演时刻整理成一个场景，标出视角、关键意象、转折；
2. **正文**：按指定 POV、人称、文体写出一篇可读的短篇。

```text
Run（deed / effect / 回应 / 状态 / 事实 / 时间）
        │
        ▼
prose:outline  场景大纲（POV、意象、转折）
        │
        ▼
prose:draft    正文（限知视角 / 文体 / 篇幅）
```

---

## 1.5 结尾选择：从材料里选，而不是提前规定

大纲步骤会先读完全部推演时刻，然后选择一个 `ending_beat_index`：

- 它是**本场问题第一次得到回答**的那一拍；
- 回答可以是落空、错过、沉默、僵持、离开或失败，不要求“成功”；
- 后面的时刻是**未采用的延续**，正文不会使用；
- 选中的回答必须**没有被后面的相反行动推翻**；如果后面的时刻又迈步、又收回、又改口，就选最后一次回答。
- 大纲不能发明材料里没有的结局。选择是编辑判断，可能选最后一刻，也可能选一个较早但稳定的回答；run 本身仍保留完整材料。

这不是 `endingCondition`，也不是幕形。推演层可以继续过生成，甚至跑到 `maxBeats`；正文工作流只在事后选择“这个故事已经说到哪里为止”。选择理由会写进 `ending_reason`，CLI 会打印“收束点：第 N 刻（理由）”，可以审计。

同一个 run 可以用不同 POV 或文体重新选择结尾；结尾不是由场景条件预先决定的。

---

## 1. 信息边界

- `--pov <character_id>`：**限知视角**。工作流只拿到这个人物自己的秘密、欲望、恐惧、记忆、私密状态、私密线索，以及公开发生的事；其他人物的秘密、内心、私密状态和“想要的效果”不会进入提示词。
- `--pov omniscient`（默认）：全知视角。工作流可以看到所有人物材料，但提示词要求“秘密由场景和行动揭示，不要由旁白一次性倾倒”。
- `--protagonist`：叙事焦点人物；默认同 POV。
- `--person first`：第一人称；`third`（默认）：第三人称有限。
- `--style`：文体提示，例如“冷峻克制”“日轻吐槽”“网文爽文”“散文诗”。
- `--prose-length`：`short | medium | long`。

推演层的 `deed / effect` 区分会被保留：

- deed 已经发生：话已经说出口、手已经伸出去、东西已经递出；
- effect 按检定结果落地或落空：落空不等于 deed 没发生。

---

## 2. CLI

先跑一场推演：

```bash
node src/cli.ts --scenario genre-vigil --beats 3 --seed vigil-01 \
  --provider deepseek --model deepseek-flash \
  --out-md examples/genre-tests/vigil.md
```

再对已有 run 生成正文（不推进推演）：

```bash
node src/cli.ts --resume <run_id> --prose-only \
  --provider deepseek --model deepseek-flash \
  --pov zhou_ning --person first \
  --style '克制、具体的家庭现实主义，短句，少解释' \
  --prose-length medium \
  --prose-out examples/genre-tests/vigil-prose.md
```

也可以在一次推演结束后直接生成：

```bash
node src/cli.ts --scenario genre-vigil --beats 3 \
  --provider deepseek --model deepseek-flash \
  --pov zhou_ning --person first \
  --prose-out examples/genre-tests/vigil-prose.md
```

`--prose-out` 会触发两次 LLM 调用：`prose:outline` 与 `prose:draft`。它们与推演调用分开计费，不改变 run 的骰点、状态或时间。

也可以走 HTTP：

```bash
curl -X POST http://127.0.0.1:4386/api/runs/<run_id>/prose \
  -H 'Content-Type: application/json' \
  -d '{"pov":"zhou_ning","person":"first","style":"克制、具体","length":"medium"}'
```

返回 `{ title, markdown, outline, usage }`。

---

## 3. 输出

正文是 Markdown：

```markdown
# 标题

正文段落……

*最后一个画面*
```

工作流不会输出“大成功 / DC / 检定 / 回合 / 玩家”等系统词；也不会替人物增加记录里没有的重大决定、承诺或反转。

---

## 4. 为什么放在推演之后

视角和文体是**作者选择**，不是世界状态。把它们塞进推演提示词，会让每个角色的行动都被“文风”绑架，也会让限知视角在全员内心戏里失效。

分开之后：

- 推演可以保持群像、客观、可审计；
- 正文可以选择一个人的视角，把其他人的内心留在门外；
- 同一场 run 可以用不同 POV、人称、文体生成不同版本；
- 改文风不需要重掷骰子。

---

## 5. 当前边界

- 工作流是两步：大纲 + 正文；还没有做逐场景重写、连续性审校和多轮润色。
- 限知视角只能使用该人物知道的信息；如果推演记录本身把某个秘密公开了，正文会按公开事实处理。
- 正文不会反向修改 run；它是一份新的创作产物。
- 长篇小说需要分章、分场景调度；当前版本面向一场 run（通常 3–12 刻）的短篇。
- MiniMax 的 `effort=max` 在长正文上也可能过度思考；实测中 resolution 的 JSON 会耗尽 thinking 预算。建议正文工作流使用 `effort=high` 或 `xhigh`。
