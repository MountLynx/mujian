import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { hasLlmCredentials, config, type LlmProvider } from './config.ts';
import { createLanguageModel } from './llm/client.ts';
import { ProseWorkflow } from './prose/workflow.ts';
import { getPresetScenario } from './engine/scenario.ts';
import { createRun } from './engine/run.ts';
import { RunEngine } from './engine/engine.ts';
import { RunStore } from './engine/store.ts';
import { assertServerNotRunning, migrateProjects } from './projects/migrate.ts';
import { defaultDirs } from './projects/layout.ts';
import { renderMarkdown } from './render/markdown.ts';
import type { ThinkingMode } from './types.ts';
import { OUTCOME_META } from './types.ts';

const { values } = parseArgs({
  options: {
    scenario: { type: 'string', short: 's', default: 'fog-harbor' },
    beats: { type: 'string', short: 'b' },
    seed: { type: 'string' },
    thinking: { type: 'string', default: config.llm.thinking },
    provider: { type: 'string' },
    model: { type: 'string' },
    effort: { type: 'string' },
    maxBeats: { type: 'string' },
    resume: { type: 'string' },
    'out-json': { type: 'string' },
    'out-md': { type: 'string' },
    'prose-out': { type: 'string' },
    'prose-only': { type: 'boolean', default: false },
    pov: { type: 'string' },
    person: { type: 'string' },
    protagonist: { type: 'string' },
    style: { type: 'string' },
    'prose-length': { type: 'string' },
    'migrate-projects': { type: 'boolean', default: false },
    quiet: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
  allowPositionals: false,
});

if (values.help) {
  console.log(`幕间 CLI

用法：
  node src/cli.ts --scenario fog-harbor --beats 3
  node src/cli.ts --resume run_xxxx --beats 1
  node src/cli.ts --migrate-projects

参数：
  --scenario, -s   预置剧本 id（默认 fog-harbor）
  --beats, -b      本次连续推演的时刻数（默认取剧本 maxBeats）
  --maxBeats       本场总幕数上限
  --seed           固定骰点种子
  --thinking       auto | enabled | disabled（DeepSeek 用；MiniMax 固定 effort）
  --provider       deepseek | minimax（默认读 LLM_PROVIDER）
  --model          模型名（默认读对应 provider 的 .env）
  --effort         low | medium | high | xhigh | max（MiniMax，默认 max）
  --out-json       另存 run JSON 的路径
  --out-md         输出 Markdown 战报的路径
  --resume         继续一个已有的 run
  --migrate-projects  把 data/runs + data/worlds 迁移到 data/projects 项目布局（需先停止服务）
  --quiet          不打印每次模型调用的耗时
`);
  process.exit(0);
}

if (values['migrate-projects']) {
  try {
    await assertServerNotRunning();
    console.log('▸ 迁移到项目布局（data/projects）…');
    const report = await migrateProjects(defaultDirs(), (message) => console.log(message));
    console.log('\n▸ 迁移报告');
    console.log(`  世界项目：${report.worlds}`);
    console.log(`  归位聚焦场景：${report.scenesRehomed}`);
    console.log(`  短篇：${report.shorts}`);
    if (report.skipped.length) {
      console.log(`  跳过：\n${report.skipped.map((item) => `    - ${item}`).join('\n')}`);
    }
    console.log(`  旧数据备份：${report.backupDir ?? '（没有需要备份的旧目录）'}`);
    console.log('\n重启服务后即进入项目布局。');
  } catch (error) {
    console.error(`✕ 迁移中止：${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
  process.exit(0);
}

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function thinking(value: string | undefined): ThinkingMode {
  return value === 'enabled' || value === 'disabled' ? value : 'auto';
}

function providerFor(value: string | undefined): LlmProvider {
  if (value === 'minimax' || value === 'deepseek') return value;
  return config.llm.provider;
}

const provider = providerFor(values.provider);
const modelName =
  (values.model ?? '').trim() ||
  (provider === 'minimax' ? config.llm.minimax.model : config.llm.deepseek.model);
const effort = (values.effort ?? '').trim() || config.llm.minimax.effort;

const store = new RunStore();
let run;
let storePath = '';

if (values.resume) {
  run = await store.load(values.resume);
  if (!run) {
    console.error(`找不到 run：${values.resume}`);
    process.exit(1);
  }
  if (run.status === 'running') {
    run.status = 'paused';
    run.error = '上一次进程在执行中断开；可从当前阶段继续。';
  }
  if (run.play && !run.play.recapAt) {
    console.error('这一场是扮演模式：需要 Web 界面里的玩家输入，CLI 不能代替你宣告。');
    console.error(`可以在 http://127.0.0.1:4386/#run/${run.id} 继续；复盘之后才能用 --prose-only。`);
    process.exit(1);
  }
  if (run.play?.recapAt && !values['prose-only']) {
    console.error('这一场已经复盘并结束；只有 --prose-only 可以继续使用它的记录。');
    process.exit(1);
  }
} else {
  if (!hasLlmCredentials(provider)) {
    console.error(
      `缺少 ${provider === 'minimax' ? 'MINIMAX_API_KEY' : 'DEEPSEEK_API_KEY'}。请在 .env 中配置，或用 --provider 切换。`,
    );
    process.exit(1);
  }
  const scenario = await getPresetScenario(values.scenario);
  if (!scenario) {
    console.error(`找不到预置剧本：${values.scenario}`);
    process.exit(1);
  }
  run = createRun(scenario, {
    seed: values.seed,
    thinking: thinking(values.thinking),
    maxBeats: positiveInt(values.maxBeats, scenario.rules.maxBeats),
    autoLimit: positiveInt(values.beats, scenario.rules.maxBeats),
    model: modelName,
  });
  await store.save(run);
}

const beatsToRun = positiveInt(values.beats, run.settings.autoLimit);
const languageModel = createLanguageModel({ provider, model: modelName, effort });
storePath = await store.pathFor(run.id);
console.log(`\n▸ 幕间 / ${run.scenario.title}`);
console.log(`  run: ${run.id}`);
console.log(`  provider: ${provider} · model: ${languageModel.model}${provider === 'minimax' ? ` · effort: ${effort}` : ''} · thinking: ${run.settings.thinking}`);
if (values.resume && run.settings.model && run.settings.model !== languageModel.model) {
  console.log(`  ! 该 run 记录模型为 ${run.settings.model}，本次使用 ${languageModel.model}；跨模型续跑会混合文风。`);
}
console.log(`  已有 ${run.beats.filter((beat) => beat.phase === 'complete').length} 个完成时刻，本轮计划 ${beatsToRun} 刻\n`);

const engine = new RunEngine(run, languageModel, {
  persist: async (state) => {
    await store.save(state);
  },
  log: values.quiet
    ? () => {}
    : (message, detail) => {
        const suffix =
          detail && typeof detail === 'object'
            ? ` ${JSON.stringify(detail)}`
            : detail
              ? ` ${String(detail)}`
              : '';
        console.log(`  · ${message}${suffix}`);
      },
});

const proseOnly = Boolean(values['prose-only']);
if (proseOnly && !values['prose-out']) {
  console.error('--prose-only 需要同时指定 --prose-out。');
  process.exit(1);
}
if (proseOnly && !values.resume) {
  console.error('--prose-only 需要配合 --resume <run_id> 使用。');
  process.exit(1);
}

let executed = 0;
try {
  while (!proseOnly && executed < beatsToRun && !run.ending) {
    await engine.advanceOne();
    executed += 1;
    const current = run.beats.at(-1);
    if (current?.phase === 'complete') {
      console.log(`\n━━ 第 ${current.index + 1} 刻 · ${current.clock.display}｜${current.title} ━━\n`);
      console.log(current.narration);
      console.log('');
      for (const action of current.actions) {
        const name = run.scenario.characters.find((character) => character.id === action.characterId)?.name;
        const target = action.targetId
          ? ` → ${run.scenario.characters.find((character) => character.id === action.targetId)?.name}`
          : '';
        const result =
          action.status === 'abandoned'
            ? '放下原举动'
            : action.outcome
              ? OUTCOME_META[action.outcome].label
              : '未结算';
        console.log(
          `  ${name}｜${action.summary}${target}  [${result}]${action.roll ? `  d20=${action.roll.natural} 总计=${action.roll.total}` : ''}`,
        );
      }
      if (current.nextTimeJump) {
        console.log(
          `\n  ↳ 时间推进 ${current.nextTimeJump.elapsedMinutes} 分钟：${current.nextTimeJump.reason}`,
        );
      }
      console.log('');
    }
    if (run.status === 'error') {
      throw new Error(run.error ?? '推演中断');
    }
    if (run.beats.filter((beat) => beat.phase === 'complete').length >= run.settings.maxBeats) {
      console.log(`已抵达本场设定的 ${run.settings.maxBeats} 个时刻。可以继续用 --resume ${run.id} 推进。`);
      break;
    }
  }
} catch (error) {
  console.error(`\n✕ 推演中断：${error instanceof Error ? error.message : String(error)}`);
  console.error(`  已完成 ${run.beats.filter((beat) => beat.phase === 'complete').length} 刻。状态与断点已保存在 ${storePath}`);
  console.error(`  重试：node src/cli.ts --resume ${run.id} --beats 1`);
  process.exitCode = 1;
}

if (!run.ending) {
  run.status = run.status === 'error' ? 'error' : 'paused';
} else {
  run.status = 'ended';
}
run.progress = { phase: 'idle', label: run.ending ? '故事已经收束' : '等待继续', updatedAt: new Date().toISOString() };
await store.save(run);

const outJson = values['out-json'];
if (outJson) {
  await fs.mkdir(path.dirname(path.resolve(outJson)), { recursive: true });
  await fs.writeFile(path.resolve(outJson), JSON.stringify(run, null, 2), 'utf8');
}
const outMd = values['out-md'];
if (outMd) {
  await fs.mkdir(path.dirname(path.resolve(outMd)), { recursive: true });
  await fs.writeFile(path.resolve(outMd), renderMarkdown(run, { includeBackstage: true }), 'utf8');
}

const proseOut = values['prose-out'];
if (proseOut) {
  const pov = (values.pov ?? '').trim();
  if (pov && pov !== 'omniscient' && !run.characters[pov]) {
    console.error(`POV 角色不存在：${pov}`);
    process.exitCode = 1;
  } else {
    const lengthValue = values['prose-length'];
    const length = lengthValue === 'short' || lengthValue === 'long' ? lengthValue : 'medium';
    console.log('\n▸ 文字创作工作流（大纲 → 正文）…');
    const workflow = new ProseWorkflow(run, languageModel);
    const prose = await workflow.generate({
      pov: pov || undefined,
      person: values.person === 'first' ? 'first' : 'third',
      protagonist: (values.protagonist ?? '').trim() || undefined,
      style: (values.style ?? '').trim() || undefined,
      length,
    });
    await fs.mkdir(path.dirname(path.resolve(proseOut)), { recursive: true });
    await fs.writeFile(path.resolve(proseOut), prose.markdown, 'utf8');
    console.log(`  正文：${path.resolve(proseOut)}`);
    console.log(
      `  收束点：第 ${prose.outline.endingBeatIndex + 1} 刻（${prose.outline.endingReason || '未说明理由'}）`,
    );
    console.log(`  创作 LLM：${prose.usage.calls} 次调用 / ${prose.usage.totalTokens} tokens`);
  }
}

console.log(`\n▸ 结果`);
console.log(`  完成时刻：${run.beats.filter((beat) => beat.phase === 'complete').length}`);
console.log(`  LLM：${run.llm.calls} 次调用 / ${run.llm.totalTokens} tokens（reasoning ${run.llm.reasoningTokens}）`);
console.log(`  run JSON：${storePath}`);
if (outMd) console.log(`  Markdown：${path.resolve(outMd)}`);
console.log('');
