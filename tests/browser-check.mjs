/* 真浏览器验证（项目总览版）：首页总览 / 世界页场景带 / 线程抽屉 / 归档区，
   双主题 + 移动端，收集控制台错误并截图。
   用法：先起服务（PORT=4499 node src/server.ts），再
   PLAYWRIGHT_MODULE=<playwright>/index.mjs node tests/browser-check.mjs
   无头 Chromium 可能需要系统音频库；WSL 上可用 LD_LIBRARY_PATH 指向桩库。 */

const playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(playwrightModule);

const BASE = process.env.BASE || 'http://127.0.0.1:4499';
const OUT = process.env.OUT || '/tmp/mes-shots-projects';
const RUN_ID = process.env.RUN_ID || 'run_7de4361132db';
const WORLD_ID = process.env.WORLD_ID || 'world_012eb4df7754';

const pages = [
  ['home', '/#home'],
  ['short', `/#run/${RUN_ID}`],
  ['world', `/#world/${WORLD_ID}`],
  ['worlds', '/#worlds'],
  ['create', '/#new'],
];

const errors = [];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

async function collect(theme, viewport, tag) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1.5 });
  await ctx.addInitScript((theme) => {
    try {
      localStorage.setItem('mes.theme', theme);
    } catch {}
  }, theme);
  const page = await ctx.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`[console][${tag}] ${page.url()} ${msg.text()}`);
  });
  page.on('pageerror', (err) => errors.push(`[pageerror][${tag}] ${page.url()} ${err.message}`));

  for (const [name, path] of pages) {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: name === 'home' || name === 'world' });
  }

  // 世界页交互：线程抽屉
  await page.goto(`${BASE}/#world/${WORLD_ID}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(900);
  const thread = page.locator('[data-act="open-world-thread"]').first();
  if (await thread.count()) {
    await thread.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/${tag}-thread-drawer.png` });
    const drawerText = await page.locator('.drawer').innerText();
    if (!drawerText.includes('线程档案')) errors.push(`[${tag}] 线程抽屉未渲染`);
    if (!drawerText.includes('逐纪元笔记')) errors.push(`[${tag}] 线程抽屉缺少逐纪元笔记`);
    await page.keyboard.press('Escape');
  } else {
    errors.push(`[${tag}] 世界页没有线程入口`);
  }

  // 世界页交互：删除确认弹窗（不确认）；按钮在世界引擎记录折叠里，先展开
  await page.goto(`${BASE}/#world/${WORLD_ID}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(900);
  await page.locator('details.side-fold[data-key="world-engine-fold"] summary').click();
  await page.waitForTimeout(300);
  await page.locator('[data-act="confirm-delete-world"]').first().click();
  await page.waitForTimeout(400);
  const modalText = await page.locator('.modal').innerText();
  if (!modalText.includes('个聚焦场景')) errors.push(`[${tag}] 删除弹窗未明示级联场景数`);
  if (!modalText.includes('导出战报')) errors.push(`[${tag}] 删除弹窗缺少导出提示`);
  await page.screenshot({ path: `${OUT}/${tag}-delete-modal.png` });
  await page.keyboard.press('Escape');

  // 首页交互：归档 → 折叠区出现 → 恢复
  await page.goto(`${BASE}/#home`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(900);
  const archiveBtn = page.locator('[data-act="archive-project"]').first();
  if (await archiveBtn.count()) {
    await archiveBtn.click();
    await page.waitForTimeout(600);
    const fold = page.locator('details.archived-fold');
    if (!(await fold.count())) errors.push(`[${tag}] 归档后未出现归档折叠区`);
    await page.locator('details.archived-fold summary').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/${tag}-archived.png` });
    await page.locator('[data-act="unarchive-project"]').first().click();
    await page.waitForTimeout(600);
    if (await page.locator('details.archived-fold').count()) errors.push(`[${tag}] 恢复后归档区未消失`);
  } else {
    errors.push(`[${tag}] 项目卡缺少归档按钮`);
  }

  await ctx.close();
}

import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });

await collect('dark', { width: 1440, height: 960 }, 'dark');
await collect('light', { width: 1440, height: 960 }, 'light');
await collect('dark', { width: 414, height: 896 }, 'mobile');

await browser.close();
if (errors.length) {
  console.error(`\n${errors.length} 项问题：`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log('\n浏览器验证通过：双主题 + 移动端 + 交互，控制台零错误。');
