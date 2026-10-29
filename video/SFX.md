# 音效设计（无 BGM 版）

> 102 秒成片，**没有 BGM、没有铺底 room tone**；只有 8 个稀疏音效。  
> 目标不是“每个切点都响”，而是让切换、点击和关键落点有触感；静音是设计的一部分。

## 音效表

| 时间 | 音效 | 事件 | 声音设计 |
|---|---|---|---|
| 0:06.0 | `whoosh` | 片头 → 00 / WHY | 0.78 秒过滤气流，低频 74→52 Hz 轻扫；像翻过一页 |
| 0:34.0 | `chime-arrival` | 在途信号抵达雾港 | 2.8 秒双音钟声（587/880 Hz），带高频泛音 |
| 0:38.3 | `die-tick` | 02 / TABLETOP 进入 | 两下干木头骰子声（0 与 75 ms），短、无混响拖尾 |
| 0:57.4 | `click` | Demo 点击“推进一刻” | 0.11 秒机械轻点，2.1 kHz 触点 + 微弱噪声 |
| 0:59.0 | `chime-result` | d20 裁定落定 | 2.2 秒双音钟声（659/988 Hz），比 arrival 更暖 |
| 1:11.0 | `page-turn` | 扮演表单 → 信息边界 | 0.55 秒两次纸张轻擦，无音乐性 |
| 1:22.0 | `modal` | 进入复盘 | 0.55 秒低频闷响 + 纸面噪声，像弹层落位 |
| 1:37.0 | `bell-outro` | 片尾 | 4.8 秒低音钟（147/220/294 Hz），长衰减收尾 |

**故意不响的切点**：0:12（Why 内部对比）、0:20（Why→World）、0:28（World 内部）、0:47（World→Focus）、0:56（Focus→Demo 的画面切换，只有按钮点击）、1:04（Demo→Play）、1:31（Play→Stats）。这些地方留白，避免“每切一次就响一下”。

## 文件

- 混音轨：[`public/audio/sfx-track.wav`](public/audio/sfx-track.wav) — 102 秒，48 kHz / 16-bit / stereo
- 单个音效：[`public/audio/sfx/`](public/audio/sfx/)
  - `whoosh.wav` · `chime-arrival.wav` · `die-tick.wav` · `click.wav`
  - `chime-result.wav` · `page-turn.wav` · `modal.wav` · `bell-outro.wav`
- 生成的音频：[`out/intro-16x9-sfx.mp4`](out/intro-16x9-sfx.mp4)
- 生成脚本：[`tools/make-sfx.mjs`](tools/make-sfx.mjs)

## 混音

- 全部音效为程序合成，不使用外部采样，无版权问题；
- 每个 one-shot 独立归一化，再按 cue 表混入 102 秒轨道；
- 总混音峰值 **-6.0 dBFS**，无削波；
- 成片中 AAC 平均码率约 37 kbps，是因为 102 秒里大部分是静音，AAC 把码率留给了瞬态，不是导出失败；
- 没有对白、没有 BGM，因此没有做 ducking 或响度压缩。

重新生成：

```bash
node video/tools/make-sfx.mjs
```

重新混入：

```bash
ffmpeg -y -i video/out/intro-16x9-silent.mp4 \
  -i video/public/audio/sfx-track.wav \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 320k -aac_coder twoloop -ar 48000 \
  -t 102 -movflags +faststart \
  video/out/intro-16x9-sfx.mp4
```

## 设计原则

- **少**：8 个 cue / 102 秒，平均 12.75 秒一个；不跟着每次转场走。
- **轻**：没有大鼓、riser、impact；最响的是点击和钟声，峰值仍留 6 dB 余量。
- **材质统一**：木头、纸、气流、钟声；不做科幻 UI 音，也不做游戏化提示音。
- **让文字先被看见**：音效只标记“动作发生了”，不抢文字阅读。
- **可替换**：单个 wav 可单独替换；cue 表在 `tools/make-sfx.mjs` 顶部，改时间/增益后重跑即可。

> BGM 版本仍然保留在 [`out/intro-16x9.mp4`](out/intro-16x9.mp4)；本文件只描述无 BGM 的 SFX 版本。
