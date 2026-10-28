# 幕间前端系统性重构设计（v0.3 UI）

> 2026-10 确定并实施。旧版前端完整备份于 `backup/public-v0.2-frontend/`，可整体回滚。

## 0. 目标与非目标

**目标**

1. 去演示化：首页从营销落地页改为工作台；删除插画海报、机制四联卡、英文铭牌与口号。
2. 降密度：渐进披露。叙事是唯一的第一层；机制细节（骰式、裁定、内心）折叠。
3. 统一壳与渲染架构：两套顶栏走全站；轮询从「整页 innerHTML 重写」改为「区域级签名渲染」。
4. 双主题：暗（默认，品牌气质收敛版）+ 亮（暖纸墨水），全站 CSS 变量化。

**非目标**：不改后端/引擎/CLI/API；不增删任何现有能力；逻辑层行为（轮询签名、建场校验、信息隔离展示）原样移植。

## 1. 技术方案（零构建原生栈）

### 1.1 目录

```
public/
  index.html          # 内联主题引导（防闪烁）+ 4 个 <link> + <script type="module" src="/js/main.js">
  css/tokens.css      # 双主题 token（:root 暗色默认 + [data-theme="light"] 覆盖）
  css/base.css        # reset、排版、通用工具类
  css/components.css  # 按钮/徽章/卡片/头像/表单/toast/弹窗/抽屉
  css/views.css       # 顶栏/首页/新建/世界库/推演页/世界页
  js/main.js          # 启动、事件委托（data-act 派发）、hash 路由、loadHome
  js/state.js         # 集中状态 + 常量/标签
  js/api.js           # fetch 封装
  js/dom.js           # escape/avatar/icon/toast/区域渲染器
  js/logic/run.js     # loadRun/poll/advance/stop/delete/seal/selectBeat
  js/logic/world.js   # 世界加载/推进/暂停/开镜/收束/删除/世界库
  js/logic/create.js  # 建场、手稿校验、模板、导入
  js/render/shell.js  # 顶栏（通用 + 上下文）、boot、错误页
  js/render/home.js create.js library.js run.js world.js drawers.js
```

依赖单向：`main → logic → render → dom/state`，无环。事件动作名（data-act）与 v0.2 完全一致。

### 1.2 渲染与轮询

- 推演页拆 4 个区域：`run-topbar / run-beatnav / run-stage / run-side`；世界页拆 5 个：`world-topbar / world-head / world-chrono / world-main / world-side`。
- 每个区域由数据派生签名字符串；`setRegion(name, html, signature)` 签名不变则跳过 DOM 写入。轮询期间页面静止，`<details>` 展开态与滚动位置天然保留；`data-key` 保持机制仅作兜底。
- 首页/新建/世界库无轮询，进入路由时整页渲染一次。

### 1.3 双主题

- `<html data-theme="dark|light">`；组件层禁止硬编码色值。
- 暗色（默认）：`#0b1215` 底、`#e2e8e5` 墨、金 `#c9a76b` 只做强调。
- 亮色：`#f4f1ea` 纸底、`#22292c` 墨、金压深 `#8a6a35`。
- 顶栏日/月切换，`localStorage('mes.theme')` 持久化，首帧内联脚本防白闪；头像用 `--avatar-l` 适配两主题。

## 2. 信息架构

### 2.1 顶栏
- 通用顶栏（首页/新建/世界库）：品牌 · 剧目 / 世界线 / 新建推演 / 推演规则 · 状态点 + 主题切换。
- 上下文顶栏（推演/世界）：← · 标题+kicker · 状态 pill · 剧作家视角 · 规则 · 主行动 · 导出。

### 2.2 首页 → 工作台
一行 tagline + [新建推演][进入世界线] + 继续链接；「继续推演」最近 8 场卡片；「世界线」最近 4 条卡片。删除 hero 插画、机制介绍、剧目海报、世界地图 feature、口号 footer。机制说明在「推演规则」弹窗。

### 2.3 推演页
主栏：时刻 chips（吸顶）→ 场景头（第 N 刻·时钟·标题·时间跳跃）→ 叙事正文 → 此刻之问 → 行动账本 → 回应 → 余波 → 终场卡。
行动行默认可见：头像 名字→目标｜意图一句｜结果章｜总分/DC｜一行机制摘要；「详情」折叠：描述、台词、完整骰式、导演裁定、结果注记；剧作家视角追加内心/动机。回应行同构。余波单行条目。删除底部「时间线」面板。
侧栏：导演台（进度/按钮/世界场景链接/引擎折叠）→ 卡司（紧凑行）→ 已知事实。

### 2.4 世界页
头卡（概述截断 ≤3 行，可开弹窗看全文）+ 世界时钟；纪元导航条；纪元块（摘要截断 + 推进理由 + 事件紧凑卡 + 聚焦场景契约卡）；侧栏：导演台 → 线程 → 折叠组（势力/角色/在途消息/事实），`data-key` 保持开合。

### 2.5 新建页 / 世界库
功能全保留；删营销文案与 help-card；预置选择卡瘦身为文本卡。

### 2.6 抽屉与弹窗
全部保留，换 token 皮肤；英文小标改中文。

## 3. 视觉规范
- 衬线：标题/叙事；无衬线：UI；mono：数字。叙事 17px/1.9，正文 15，辅助 12.5。
- 间距 4px 基线；圆角 6/10；阴影仅浮层。
- 结果章语义色：意外奏效=金、落地=青绿、落空=赭、放下=灰；彩色只出现在章与徽章。
- 动效仅保留必要过渡；`prefers-reduced-motion` 全量关停。

## 4. 验证
- `pnpm test` + `pnpm typecheck` 回归基线。
- 浏览器：5 视图 × 1440/390 × 双主题；轮询期间展开态保持；控制台零 error；截图重生成并同步 README。
- 检核规则：组件 CSS 禁止 `#hex`/`rgb()`（token 文件除外）。
