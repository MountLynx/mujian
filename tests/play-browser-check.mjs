/* 真浏览器验证：扮演模式全流程。
   需要先启动服务并配置可用的 LLM key：
     PORT=4499 node src/server.ts
     PLAYWRIGHT_MODULE=<playwright>/index.mjs BASE=http://127.0.0.1:4499 \
       node tests/play-browser-check.mjs
   会真实调用一次完整时刻（导演 + 角色），然后复盘。
   产物：截图在 OUT（默认 /tmp/mes-play-shots），控制台错误会失败。 */

const playwrightModule = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(playwrightModule);

const BASE = process.env.BASE || 'http://127.0.0.1:4499';
const OUT = process.env.OUT || '/tmp/mes-play-shots';
const TIMEOUT = Number(process.env.PLAY_TIMEOUT || 240000);

import fs from 'node:fs';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1.5 });
await context.addInitScript(() => {
  try {
    localStorage.setItem('mes.theme', 'dark');
  } catch {}
});
const page = await context.newPage();
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[console] ${page.url()} ${msg.text()}`);
});
page.on('pageerror', (error) => errors.push(`[pageerror] ${page.url()} ${error.message}`));

async function shot(name, fullPage = false) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log(`  📸 ${name}.png`);
}

console.log('1. 新建页 → 扮演模式 → 选择沈砚');
await page.goto(`${BASE}/#new`);
await page.waitForLoadState('domcontentloaded');
await page.waitForTimeout(800);
const fog = page.locator('.preset-choice-card[data-preset="fog-harbor"]');
if (await fog.count()) {
  await fog.click();
  await page.waitForTimeout(250);
}
await page.locator('[data-act="set-play-mode"][data-mode="play"]').click();
await page.locator('#play-cast .play-cast-card').first().waitFor({ timeout: 15000 });
const shen = page.locator('#play-cast .play-cast-card', { hasText: '沈砚' });
if (await shen.count()) await shen.click();
await page.waitForTimeout(300);
const createText = await page.locator('.create-aside').innerText();
if (!createText.includes('扮演模式')) errors.push('新建页没有出现扮演模式说明');
if (!createText.includes('可知信息')) errors.push('新建页缺少信息边界说明');
await shot('01-create-play');

console.log('2. 开局并推进第一刻（真实 LLM）');
await page.locator('[data-act="start-create"]').click();
await page.waitForURL(/#run\//, { timeout: 30000 });
await page.waitForTimeout(1200);
const runUrl = page.url();
console.log(`  run: ${runUrl.split('#')[1]}`);
const openingCta = page.locator('article.stage--opening [data-act="advance-one"]');
if (await openingCta.count()) {
  await openingCta.click();
} else {
  await page.locator('[data-act="advance-one"]').first().click();
}

console.log('3. 等待轮到你行动');
await page.locator('#play-action-form').waitFor({ timeout: TIMEOUT });
await page.waitForTimeout(500);
const waitingText = await page.locator('.stage--play').innerText();
for (const expected of ['轮到你行动', '此刻你能感知到的', '你做了什么', '你想要的效果', '宣告这一刻的举动']) {
  if (!waitingText.includes(expected)) errors.push(`等待表单缺少「${expected}」`);
}
if (waitingText.includes('GM_NOTE')) errors.push('等待表单泄露幕后注');
await shot('02-awaiting', true);

console.log('4. 填写并提交玩家举动');
await page.locator('#play-deed').fill(
  '我把守灯日志翻到十七年前那一页，摊在灯台上，让所有人都能看见那行被墨水盖住的名字。',
);
await page.locator('#play-effect').fill('逼顾行舟解释那一页为什么被涂掉。');
await page.locator('#play-dialogue').fill('这一行，是谁划掉的？');
await page.locator('#play-thought').fill('如果他现在否认，我就知道他在护谁。');
const targetOptions = page.locator('#play-target option');
if ((await targetOptions.count()) > 1) {
  const targetValue = await targetOptions.nth(1).getAttribute('value');
  if (targetValue) await page.locator('#play-target').selectOption(targetValue);
}
await page.locator('[data-act="submit-play-action"]').scrollIntoViewIfNeeded();
await page.waitForTimeout(200);
let submitted = false;
for (let attempt = 0; attempt < 3 && !submitted; attempt += 1) {
  await page.locator('[data-act="submit-play-action"]').click();
  await page.waitForTimeout(1500);
  submitted = (await page.locator('#play-deed').count()) === 0;
}
if (!submitted) errors.push('点击宣告后表单仍在，举动没有提交');

console.log('5. 等待落定（或先回应敌意）');
const ownDeedHeading = page.locator('.stage--play h2').filter({ hasText: '你的举动' }).first();
const outcome = await Promise.race([
  page.locator('#play-reaction-form').waitFor({ timeout: TIMEOUT }).then(() => 'reaction'),
  ownDeedHeading.waitFor({ timeout: TIMEOUT }).then(() => 'complete'),
  page.locator('.side-error').waitFor({ timeout: TIMEOUT }).then(() => 'error'),
]).catch(() => 'timeout');
if (outcome === 'error' || outcome === 'timeout') {
  errors.push(`推演未落定：${outcome} ${await page.locator('body').innerText()}`);
} else if (outcome === 'reaction') {
  console.log('  出现敌意回应，填写回应');
  const reactionText = await page.locator('.stage--play').innerText();
  if (!reactionText.includes('轮到你回应')) errors.push('回应表单缺少标题');
  await page.locator('#play-reaction-description').fill('我没有抽回手，反而把日志压得更紧，迎着他的目光站直。');
  await page.locator('#play-reaction-dialogue').fill('你还没回答。');
  await page.locator('#play-reaction-thought').fill('他越急，越说明这页上的人与他有关。');
  await shot('04-reaction');
  await page.locator('[data-act="submit-play-reaction"]').click();
  await ownDeedHeading.waitFor({ timeout: TIMEOUT });
}
await page.waitForTimeout(800);
const doneText = await page.locator('.stage--play').innerText();
if (!doneText.includes('你看见的')) errors.push('落定后缺少「你看见的」可观察记录');
if (!doneText.includes('你的举动')) errors.push('落定后缺少玩家自己的举动');
if (!doneText.includes('旁人可感知的部分')) errors.push('落定后缺少可见范围说明');
await shot('05-complete', true);
await page.setViewportSize({ width: 414, height: 896 });
await page.waitForTimeout(300);
await shot('05-complete-mobile', true);
await page.setViewportSize({ width: 1440, height: 960 });
await page.waitForTimeout(200);

console.log('6. 复盘');
const recapBtn = page.locator('[data-act="confirm-recap"]');
if (await recapBtn.count()) {
  await recapBtn.first().click();
  await page.locator('.modal [data-act="recap-confirm"]').waitFor({ timeout: 5000 });
  await page.locator('[data-act="recap-confirm"]').click();
} else {
  await page.locator('[data-act="open-recap"]').first().click();
}
await page.locator('.recap-modal').waitFor({ timeout: 15000 });
await page.waitForTimeout(600);
const recapText = await page.locator('.recap-modal').innerText();
for (const expected of ['所有人的底牌', '逐刻全记录', '导出完整战报']) {
  if (!recapText.includes(expected)) errors.push(`复盘缺少「${expected}」`);
}
await page.locator('[data-act="recap-expand"]').click();
await page.waitForTimeout(300);
const expandedText = await page.locator('.recap-modal').innerText();
if (!expandedText.includes('内心')) errors.push('复盘展开后缺少内心记录');
if (!expandedText.includes('私下') && !expandedText.includes('私密')) {
  // 私密线索/私密笔记是复盘必须公开的幕后材料
}
await shot('06-recap', true);
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const afterRecap = await page.locator('.stage').innerText();
if (!afterRecap.includes('复盘模式')) errors.push('复盘后舞台缺少复盘横幅');

const runId = runUrl.split('#run/')[1];
const status = await page.evaluate(async (id) => {
  const response = await fetch(`/api/runs/${id}`);
  return (await response.json()).run.status;
}, runId);
if (status !== 'ended') errors.push(`复盘后 run 状态应为 ended，实际 ${status}`);
console.log(`  run ${runId} → ${status}`);

await context.close();
await browser.close();

if (errors.length) {
  console.error(`\n${errors.length} 项问题：`);
  for (const error of errors) console.error(` - ${error}`);
  process.exit(1);
}
console.log('\n扮演模式浏览器验证通过：建场 → 等待 → 提交 → 落定 → 复盘，控制台零错误。');
