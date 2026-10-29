# 介绍视频工具链

> 状态：**已安装并验证（2026-10-29）；102 秒介绍片已产出。** 不参与应用运行时。
> 关联：[`PLAY.md`](PLAY.md)（视频里演示的扮演模式）、[`../video/README.md`](../video/README.md)（成片与分镜）。

## 已安装

| 工具 | 版本 / 位置 | 用途 |
|---|---|---|
| ffmpeg / ffprobe | `@ffmpeg-installer` / `@ffprobe-installer`（项目 devDependencies） | 编码、混音、字幕、探测 |
| Playwright | 1.64.1（项目 devDependencies） | 真浏览器截屏、录屏、E2E |
| Playwright Chromium | `~/.cache/ms-playwright/chromium-1248` + headless shell | 录制真实 UI |
| Playwright FFmpeg | `~/.cache/ms-playwright/ffmpeg-1013` | Playwright `recordVideo` 后端 |
| Remotion | 4.0.539（`remotion` + `@remotion/cli`） | 程序化视频、标题卡、字幕、转场 |
| Remotion Chrome | `node_modules/.remotion/chrome-headless-shell` | Remotion 渲染 |
| edge-tts | 7.3.1，venv `~/.venvs/tts` | 中文旁白 |
| CJK fonts | SimSun / Microsoft YaHei / SimHei（系统已有 7 条） | 浏览器与字幕字体 |
| libasound | Ubuntu 24.04 包解压到 `~/.local/lib/chromium` | Playwright Chromium 运行库 |

包装脚本：

- `~/.local/bin/ffmpeg` · `~/.local/bin/ffprobe`：从项目依赖解析二进制。
- `~/.local/bin/edge-tts`：指向 TTS venv。
- `~/.local/bin/chromium-env`：设置 `LD_LIBRARY_PATH` 后执行命令；Playwright 需要它。
- `tools/remotion-chrome.sh`：Remotion 的 Chrome 包装脚本，见下文沙箱适配。

`pnpm-workspace.yaml` 里放行 ffmpeg/ffprobe/esbuild 的 postinstall；如果全新安装仍提示 `ERR_PNPM_IGNORED_BUILDS`，执行一次 `pnpm approve-builds --all`。

## 沙箱适配（重要）

这个执行环境有两个限制：

1. **Chromium 缺 `libasound.so.2`。** 不能 `sudo apt-get`，所以从 Ubuntu 包解压到用户目录：
   ```bash
   mkdir -p ~/.local/lib/chromium
   apt-get download libasound2t64
   dpkg-deb -x libasound2t64_*.deb ~/.local/lib/chromium
   ```
   之后用 `chromium-env <command>` 运行 Playwright。
2. **端口 3000–3xxx 与 Chrome 的 `--remote-debugging-port=0` 在这个沙箱里不可连接。**
   - Remotion 默认在 `localhost:3000` 起 bundle server → 改用 `--port=4200`（或任意空闲 4xxx）。
   - Remotion 默认让 Chrome 用随机调试端口 → `tools/remotion-chrome.sh` 把 `--remote-debugging-port=0` 重写成确定的空闲端口，并补上 `--remote-allow-origins=*`。

因此 Remotion 渲染命令固定为：

```bash
cd /home/xingy/programming/novel
chromium-env pnpm exec remotion render <entry> <composition> <out.mp4> \
  --codec=h264 \
  --concurrency=1 \
  --port=4200 \
  --browser-executable "$PWD/tools/remotion-chrome.sh"
```

已用最小 composition 验证 640×360 / 30fps / H.264；正式片用同一链路输出 1920×1080 / 30fps / 102s。

## 常用命令

```bash
# 1) 中文旁白
edge-tts --voice zh-CN-XiaoxiaoNeural \
  --text "骰子落下之前，故事尚有另一种可能。" \
  --write-media /tmp/voice.mp3

# 2) 真实 UI 录屏（Playwright recordVideo）
chromium-env node --input-type=module - <<'EOF'
import { chromium } from 'playwright';
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1920, height: 1080 },
  recordVideo: { dir: '/tmp/ui-clips', size: { width: 1920, height: 1080 } },
});
const page = await context.newPage();
await page.goto('http://127.0.0.1:4386/#run/<run_id>');
await page.waitForTimeout(4000);
await context.close();
await browser.close();
EOF

# 3) 混音 / 编码 / 字幕
ffmpeg -i /tmp/remotion.mp4 -i /tmp/voice.mp3 \
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p \
  -c:a aac -b:a 160k -shortest intro.mp4

# 4) 探测
ffprobe -hide_banner -show_entries stream=codec_name,width,height,r_frame_rate \
  -show_entries format=duration -of default=nw=1 intro.mp4
```

## 尚未安装 / 可选

- **Noto Serif SC / Noto Sans SC**：系统已有 SimSun、YaHei、SimHei，应用与截图可正常渲染；如果要做更统一的品牌字形，再把 Noto CJK 放进 `~/.local/share/fonts` 并 `fc-cache -f`。
- **系统版 ffmpeg 7.x**：npm 的 ffmpeg 4.1 已支持 H.264/AAC、libass、drawtext、zoompan、concat；缺少 `xfade`。转场可以放在 Remotion 里做。若需要更新版本，可另行下载静态构建到 `~/.local/opt/ffmpeg`；当前未安装。
- **背景音乐（BGM 版）**：正式成片使用 [`幕间.mp3`](../video/幕间.mp3)（3:04），按 102 秒截断、片尾 3 秒淡出；占位垫 [`bgm-placeholder.wav`](../video/public/audio/bgm-placeholder.wav) 保留为 fallback。
- **音效（SFX 版）**：无 BGM，8 个稀疏音效；cue 表与设计见 [`../video/SFX.md`](../video/SFX.md)。
- **音效**：骰子、纸张、潮声等可选音效还没有加；需要时再补。

## 为什么选 Remotion + Playwright

- Remotion 用 React/CSS 做标题卡、局部放大、字幕和转场，和项目的设计 token 同源，改文案/改镜头可重跑。
- Playwright 用真实 Chromium 录制实际应用，保留玻璃、字体、动画与交互的真实感。
- ffmpeg 负责最终混音、字幕与横竖版；edge-tts 提供中文旁白，必要时可换真人录音。
- 整条链路不依赖手工剪辑软件，也不依赖公网素材。
