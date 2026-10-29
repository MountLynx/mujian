# BGM 生成提示词

> 用途：为《幕间》**102 秒（1:42）**、16:9、纯文字／UI 截图／模拟操作演示的介绍片生成一条**无旁白、不抢字**的器乐 BGM。
> 说明：这是给音乐生成模型的提示词，不是最终音频。**当前正式成片已使用 [`幕间.mp3`](幕间.mp3)**；本文件保留作再生成/替换参考。

## 1. 短提示词（Suno / Udio / 风格输入框）

```text
Instrumental cinematic ambient neoclassical underscore, 68 BPM, D minor, 4/4, felt piano, low cello drone, warm analog synth pad, distant celesta, soft sub pulse, tape hiss and room tone, mysterious, intimate, restrained, quietly hopeful, like a lighthouse logbook in fog, sparse arrangement, long plate reverb, no drums, no vocals, no choir, no epic trailer build, no EDM, 102 seconds (1:42), loopable, composed as a bed for on-screen Chinese typography, -1 dBTP, wide but gentle stereo.
```

风格标签（Suno / Udio 的 style 字段可直接用）：

```text
ambient, neoclassical, cinematic minimalism, dark academic, felt piano, low cello, analog synth pad, distant celesta, tape hiss, 68 BPM, D minor, instrumental, sparse, intimate, quietly hopeful, no drums, no vocals, no epic build
```

中文短版（如果模型支持中文输入）：

```text
纯器乐，氛围电影配乐 / 新古典 / 暗黑学院风格，68 BPM，D 小调，4/4。毛毡钢琴、低音大提琴长音、温暖的模拟合成器铺底、远处的钢片琴、极轻的 sub pulse、磁带底噪与房间底噪。情绪神秘、亲密、克制、隐约有希望，像雾里的一本灯塔日志。编曲稀疏，长板式混响，无鼓组、无人声、无合唱、无史诗预告片式爆发、无 EDM。102 秒（1:42），可循环，给中文文字画面做底，-1 dBTP，立体声宽但柔和。
```

## 2. 详细提示词（支持长描述的模型 / 人工编曲 brief）

```text
Write a 102-second instrumental cue for a text-driven product film about a two-layer LLM narrative engine and a tabletop-inspired d20 mechanic. The visual language is dark teal, warm gold, Chinese serif typography, slow zooms of a quiet lighthouse-like interface, and a short simulated interface demo. The music must feel like a logbook found in fog: intimate, tactile, restrained, with a quiet sense of agency rather than epic scale.

Genre: ambient neoclassical / cinematic minimalism / dark academic underscore.
Tempo: 68 BPM, 4/4. Key: D minor, with modal movement through F major, Bb major and G minor, resolving to D at the end.
Instrumentation: close-miked felt piano (slightly detuned, pedal noise audible), low cello and string drone, warm analog synth pad, distant celesta or music box, soft sub pulse (not a drum kit), tape hiss, room tone, a very quiet wooden tick like a die touching a table. No lead vocal, no choir, no spoken word.

Structure (approximate; keep transitions smooth, no hard drops):
- 0:00–0:06 — Intro: low D drone, tape hiss, one felt piano note in the distance. Almost no rhythm.
- 0:06–0:20 — "Why": the drone holds; a faint string harmonic. No pulse for the first half; around 0:12 a soft 68 BPM pulse begins as the comparison panels enter. Leave space for the opening text.
- 0:20–0:38 — "World / signal": slow cello line, analog pad, distant bell; a soft pulse. Around 0:29 the signal starts moving; at 0:34 it arrives: a small open chord and a short bloom, then release. No percussion fill.
- 0:38–0:47 — "Tabletop d20": the most legible "rule" moment. A single clear piano note and a wooden die tick introduce the d20; a soft pulse under the attribute card; at 0:40 a small lift as d20 + attribute + trait resolves to 13 vs DC 13. Intimate, like a rule being explained at the table; no fanfare.
- 0:47–0:56 — "Focus / deed + effect": intimate piano motif (D–F–A), sparse left-hand bass; low pulse; one or two wooden ticks; small harmonic tension as the action card is explained.
- 0:56–1:04 — "Demo": interface ticks, cursor click, a steady but quiet pulse. Around 0:59 the roll resolves: a warm, small lift, then settle. This is the most "hands-on" part, but still restrained.
- 1:04–1:22 — "Play": warmer and more hopeful; add a gentle high pad and a second piano voice; pulse steadier but still soft. At around 1:11 the high pad pulls back as the information boundary appears; intimate, slightly unresolved.
- 1:22–1:31 — "Recap": release the pulse; open chord, reverse cymbal or shimmer, piano single notes, wide reverb; the emotional payoff without triumph.
- 1:31–1:37 — "System / stats": a quiet pulse returns under low strings and piano; steady and resolved, not triumphant.
- 1:37–1:42 — Outro: piano motif resolves to D; long tail; fade to silence at 1:42.

Production: intimate close piano, wide but uncluttered stereo field, low mono bass, long plate/hall reverb with clear transients, subtle tape saturation, no harsh highs, no sidechain pumping. Leave space in 200–800 Hz and 2–4 kHz for on-screen text and UI sounds. Target -18 LUFS integrated, -1 dBTP true peak; no clipping. The cue should loop cleanly at 102 seconds if possible. Instrumental only. No vocals, no lyrics, no choir, no spoken word.
```

## 3. 负向提示词（Negative prompt）

```text
vocals, lyrics, choir, spoken word, rap, epic trailer drums, big taiko hits, EDM, four-on-the-floor, dubstep, loud risers, sudden drops, jazz saxophone, distorted electric guitar, pop song structure, busy lead melody, harsh cymbals, aggressive compression, clipping, copyrighted melody, recognizable film theme, horror stingers, jump-scare, upbeat corporate ukulele, whimsical comedy.
```

## 4. 与画面同步的结构表

| 时间 | 画面 | 音乐动作 |
|---|---|---|
| 0:00–0:06 | 片头：幕间 logo + “骰子落下之前…” | 低频 drone + 磁带底噪；一记远处钢琴；无节奏 |
| 0:06–0:20 | 不是续写小说 → 全知叙述 vs 每个人一份世界 | Drone 保持；弦乐泛音；0:12 起 68 BPM 软脉冲；对比面板进入时极轻的和声移动 |
| 0:20–0:38 | 世界层示意图 → 在途信号抵达雾港 | 大提琴长音、模拟 pad；0:29 信号开始移动；0:34 抵达，小开放和弦 + bloom，随后释放 |
| 0:38–0:47 | **跑团机制：d20 + 属性点 + 特质/状态 vs DC** | 一记清楚的钢琴单音 + 木头骰子 tick；属性卡下方轻脉冲；0:40 公式落定，小幅上扬，不凯旋 |
| 0:47–0:56 | 聚焦层 deed/effect + 三种结果 | 钢琴动机 D–F–A；木头轻响；低脉冲；阅读卡片时不抢戏 |
| 0:56–1:04 | 模拟操作：推进一刻 → 行动卡 + d20 13 / DC 13 | 界面木头 tick；钢琴轻脉冲；0:59 骰点落定，暖而小的一次上扬 |
| 1:04–1:22 | 扮演模式表单 → 公开资料 vs 只有你知道 | 更暖；第二钢琴声部与高 pad；1:11 后高 pad 退后，脉冲变软，亲密、略未解决 |
| 1:22–1:31 | 复盘：全部真相公开 | 释放脉冲；开放和弦 / 反向镲；宽混响；情绪落点，不凯旋 |
| 1:31–1:37 | 系统数字：可审计的因果 | 脉冲轻轻回归；低弦 + 钢琴；稳定收束 |
| 1:37–1:42 | 尾卡：MAKE A CHOICE | 钢琴动机回到 D；长尾；1:42 淡出 |

> 如果最终时长在 95–110 秒之间，把结构按比例伸缩即可；关键是不在文字出现时加入新旋律或强拍。旁白不存在，音乐可以比常规预告片更安静，留出阅读空间。

## 5. 生成参数建议

- **Suno / Udio**：`Instrumental` 打开；风格权重中等；怪诞度低；时长优先 102–120 秒；生成 2–3 个版本选最不抢字的一条。若平台单次上限 2 分钟，直接生成 102 秒即可。
- **Stable Audio / MusicGen**：BPM 68；key D minor；以 30–51 秒为单位生成 2 段（0–51 / 51–102），交叉淡化 2 秒；或直接生成 120 秒后裁到 102 秒。
- **Lyria / 其他**：把“详细提示词”整段作为描述；要求 instrumental、no vocals、no drums。
- **后期**：如果生成结果有鼓或高频太亮，用 ffmpeg 做低通/压缩/侧链不必；更简单是换一条。最终混音建议 `-18 LUFS` 左右，片尾淡出 3 秒。

## 6. 换轨命令

生成 `bgm.wav` 或 `bgm.mp3` 后：

```bash
# 用视频原音轨（若有）替换为 BGM，视频流直接复制
ffmpeg -i video/out/intro-16x9-silent.mp4 -i bgm.wav \
  -map 0:v:0 -map 1:a:0 -c:v copy -c:a aac -b:a 192k -shortest \
  video/out/intro-16x9.mp4

# 若 BGM 比画面长，裁到画面长度；若短，补静音或循环
ffprobe -v error -show_entries format=duration -of csv=p=0 video/out/intro-16x9-silent.mp4
```
