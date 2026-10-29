# 《幕间》介绍片

- **画幅**：16:9 / 1920×1080
- **帧率**：30 fps
- **时长**：102 秒（1:42）
- **形式**：无旁白，文字为主；真实 UI 截图 + 一段模拟操作演示
- **Composition**：`Intro`（`video/src/index.ts`）
- **成片**（`out/` 是本机生成目录，已加入 `.gitignore`）：
  - [`out/intro-16x9.mp4`](out/intro-16x9.mp4) — BGM 版，使用 [`幕间.mp3`](幕间.mp3)，102 秒，片尾 3 秒淡出
  - [`out/intro-16x9-sfx.mp4`](out/intro-16x9-sfx.mp4) — 无 BGM，仅 8 个稀疏音效（见 [`SFX.md`](SFX.md)）
  - [`out/intro-16x9-silent.mp4`](out/intro-16x9-silent.mp4) — 无音轨母版
  - [`out/cover.jpg`](out/cover.jpg) · [`out/cover-1280.jpg`](out/cover-1280.jpg) — 封面
  - [`out/stills/contact-final.jpg`](out/stills/contact-final.jpg) — 分镜接触表
- **BGM 版**：源文件 [`幕间.mp3`](幕间.mp3)（3:04）；成片取前 102 秒并做 3 秒淡出；另存 [`幕间-102s.mp3`](幕间-102s.mp3)。
- **SFX 版**：无 BGM，8 个稀疏音效；混音轨 [`public/audio/sfx-track.wav`](public/audio/sfx-track.wav)，设计与 cue 表见 [`SFX.md`](SFX.md)。
- **备用**：占位氛围垫 [`public/audio/bgm-placeholder.wav`](public/audio/bgm-placeholder.wav)；生成提示词 [`BGM-PROMPT.md`](BGM-PROMPT.md)。

## 分镜

| 时间 | 章节 | 屏幕文字 / 内容 | 视觉 |
|---|---|---|---|
| 0:00–0:06 | 片头 | 幕间 / 骰子落下之前，故事尚有另一种可能。 | 暗场、金色几何标记 |
| 0:06–0:20 | 00 / WHY | 不是让 AI 续写小说；一份真相，还是每个人一份？ | 三层支柱；全知叙述 vs 每个人一份世界的对比 |
| 0:20–0:38 | 01 / WORLD | 世界在镜头之外运行；消息不会瞬间抵达。 | 世界层 / 聚焦场景 / 时间线；在途信号从白塔抵达雾港 |
| 0:38–0:47 | 02 / TABLETOP | 掷一颗 d20，加你这个人。 | 六项属性点、d20 公式、`d20 3 + 意志 8 + 守势 +2 = 13 vs DC 13` |
| 0:47–0:56 | 03 / SCENE | 每个人只依据自己知道的事行动。 | 真实行动卡、deed/effect、三种结果 |
| 0:56–1:04 | 04 / DEMO | 点一下，推进一个时刻。 | 模拟导演台：光标点击“推进一刻”，行动卡出现，d20 13 / DC 13 落定 |
| 1:04–1:22 | 05 / PLAY | 现在，其中一个人可以是你；你只拿到这个角色能知道的信息。 | 扮演模式表单；公开资料 vs 只有你知道 |
| 1:22–1:31 | 06 / RECAP | 故事结束后，才看见全部真相。 | 复盘弹层、底牌与逐刻记录 |
| 1:31–1:37 | 07 / SYSTEM | 世界留下可审计的因果。人物留下自己的选择。 | 4 个系统数字 |
| 1:37–1:42 | 片尾 | 幕间 / MAKE A CHOICE. KEEP THE CONSEQUENCE. | 暗场、金色几何标记 |

## 跑团机制：d20 + 属性点

在模拟操作之前，新增了 **02 / TABLETOP** 段落，把这套裁定讲清楚：

1. **d20**：1–20 的运气；
2. **属性点**：体魄 / 敏捷 / 感知 / 智识 / 意志 / 风度，写在这个人身上；
3. **特质 / 状态**：这一刻的处境修正，例如“守势 +2”；
4. 合计对 **DC**（或敌意行动的**回应总值**）；
5. 结果分为意外奏效 / 落地 / 落空。

段落用阿岚的人物卡做例子：`d20 3 + 意志 8 + 守势 +2 = 13` 对 `DC 13`，右下角标“本次检定”的是意志 8。随后 Focus 的行动卡与 Demo 都沿用同样的结构，因此观众不会在操作演示里第一次见到这条公式。

## 模拟操作演示

`src/scenes/Demo.tsx` 里是一段**代码构建的模拟导演台**，不是实时录屏：光标移动、按钮按下、加载、行动卡出现、d20 高亮、裁定浮层都由 Remotion 帧驱动，因此可以精确控制节奏，也不会受网络或真实数据影响。

演示内容：

1. 光标移到“推进一刻”，点击；
2. 按钮进入“推进中…”，时间线从“取景”走到“宣告”；
3. 行动卡出现：阿婆 → 林生，deed / effect / 对话 / d20 公式；
4. d20 高亮，裁定浮层显示 `d20 3 + 意志 8 + 2 = 13`、`DC 13`、`落地`；
5. 最后收束为“一个时刻结束，世界继续向前”。

## 节奏

- 每个场景在内容出现后再留约 2–5 秒即切，去掉原先 8–12 秒的空停；观众想读细节可以自己暂停；
- 场景间淡入淡出保持 6–8 帧，但真正压缩的是**场景停留时间**；
- Why / World / Focus 内部用快速切；Play 的表单 → 信息边界也压到 8 帧；
- 全片 102 秒，不为了对齐 60/90/120 秒而加停顿。

## 渲染

在普通桌面环境（有系统 Chromium / Remotion 浏览器）可直接：

```bash
pnpm exec remotion render video/src/index.ts Intro video/out/intro-16x9-silent.mp4 \
  --public-dir=video/public \
  --codec=h264 \
  --crf=18 \
  --image-format=jpeg --jpeg-quality=95
```

在**当前沙箱**里，端口 3000–3xxx 与 Remotion 的随机 CDP 端口不可连接，需先 bundle 到静态目录，用 4xxx 端口服务，并让 Chrome 走固定调试端口：

```bash
# 1) 打包（含 video/public 资源）
rm -rf /tmp/video-bundle
pnpm exec remotion bundle video/src/index.ts \
  --out-dir /tmp/video-bundle \
  --public-dir video/public

# 2) 起一个 4xxx 静态服务（后台）
python3 -m http.server 4200 --bind 127.0.0.1 --directory /tmp/video-bundle

# 3) 渲染；必须带 Chrome 包装脚本
chromium-env pnpm exec remotion render http://127.0.0.1:4200 Intro \
  video/out/intro-16x9-silent.mp4 \
  --codec=h264 --crf=18 --image-format=jpeg --jpeg-quality=95 --concurrency=4 \
  --browser-executable "$PWD/tools/remotion-chrome.sh"
```

> 4200 是当前验证可用的端口；如果换环境/端口被占用，选一个 4xxx 空闲端口即可。不要用 3000。

## 配乐（BGM 版）

正式 BGM 是用户提供的 [`幕间.mp3`](幕间.mp3)（3:04）。成片只取前 **102 秒**，在 **99–102 秒**做 3 秒淡出；没有做循环、压缩或均衡。

```bash
# 1) 生成 102 秒、片尾 3 秒淡出的 BGM
ffmpeg -y -i video/幕间.mp3 -t 102 \
  -af "afade=t=out:st=99:d=3" \
  -c:a libmp3lame -b:a 160k \
  video/幕间-102s.mp3

# 2) 直接混入无音轨母版（视频流复制）
ffmpeg -y -i video/out/intro-16x9-silent.mp4 -i video/幕间.mp3 \
  -map 0:v:0 -map 1:a:0 \
  -c:v copy -c:a aac -b:a 192k -ar 48000 \
  -t 102 -af "afade=t=out:st=99:d=3" \
  -movflags +faststart \
  video/out/intro-16x9.mp4
```

备用占位轨是 102 秒的程序化氛围垫，只作为无版权 fallback；BGM 版不使用它。生成提示词见 [`BGM-PROMPT.md`](BGM-PROMPT.md)。

## 音效（SFX 版）

无 BGM、无铺底 room tone；102 秒里只有 8 个音效：0:06 转场 whoosh、0:34 信号抵达钟声、0:38 骰子木头声、0:57 Demo 点击、0:59 裁定钟声、1:11 纸张翻页、1:22 复盘弹层、1:37 片尾低钟。0:12 / 0:20 / 0:28 / 0:47 / 0:56 / 1:04 / 1:31 故意留白。

- 音效表与设计说明：[`SFX.md`](SFX.md)
- 单个音效：[`public/audio/sfx/`](public/audio/sfx/)
- 混音轨：[`public/audio/sfx-track.wav`](public/audio/sfx-track.wav)
- 生成脚本：[`tools/make-sfx.mjs`](tools/make-sfx.mjs)
- 成片：[`out/intro-16x9-sfx.mp4`](out/intro-16x9-sfx.mp4)

## 素材

- `public/screens/`：从真实应用在 1920×1080 下截取；`run-action-card.png`、`play-form-card.png`、`public-drawer-card.png`、`own-drawer-card.png` 是 UI 特写裁切。
- 截图对应的运行：`run_01f2f9fe9b3c`（普通推进）、`run_310626230463`（扮演完成、未复盘）、`run_fcbf52c00927`（扮演模式等待行动）、`run_4dfeaef4d540`（已复盘）。
- 重新截图时保持 16:9 / 1920×1080，并保留深色主题；否则卡片比例会变。

## 说明

- 片中文字就是字幕，不再额外烧录 SRT；这样字号、换行和节奏可控。
- 没有真人出镜、没有旁白；信息密度集中在「世界层 → 聚焦层 → 跑团裁定 → 扮演 → 复盘」。
- 占位 BGM 是程序化氛围垫，不建议直接作为发布版；用提示词生成后替换即可。
- 片尾没有放外链，避免出现未上线的地址；需要的话在 `Outro.tsx` 里加一行 `Micro` 即可。
