/* 全站唯一的两套顶栏 + 启动屏 + 错误页。 */

import { state } from '../state.js';
import { escapeHtml, attr, icon, iconMarkSvg, statusPill, setAppHtml } from '../dom.js';

function brandHtml() {
  return `
    <a class="brand" href="#home" aria-label="回到首页">
      <span class="brand__mark">${iconMarkSvg()}</span>
      <span class="brand__text">幕间</span>
    </a>`;
}

function themeToggleHtml() {
  const light = document.documentElement.dataset.theme === 'light';
  return `<button class="btn btn--quiet btn--icon" data-act="toggle-theme" title="${light ? '切换到暗色' : '切换到亮色'}" aria-label="切换主题">${icon(light ? 'moon' : 'sun', 15)}</button>`;
}

export function topbarPlain() {
  const online = state.health?.hasApiKey;
  const active = (state.health?.activeRuns || 0) + (state.health?.activeWorlds || 0);
  const view = state.view;
  return `
  <header class="topbar">
    <div class="topbar__inner">
      ${brandHtml()}
      <nav class="topbar__nav" aria-label="主导航">
        <a class="nav-link ${view === 'home' ? 'is-active' : ''}" href="#home">剧目</a>
        <a class="nav-link ${view === 'worlds' ? 'is-active' : ''}" href="#worlds">世界线</a>
        <a class="nav-link ${view === 'new' ? 'is-active' : ''}" href="#new">新建推演</a>
        <button class="nav-link" data-act="open-rules">推演规则</button>
      </nav>
      <div class="topbar__status">
        <span class="status-dot ${online ? (active ? 'status-dot--busy' : '') : 'status-dot--off'}"></span>
        <span class="topbar__status-text">${online ? (active ? `${active} 场进行中` : '导演就位') : '需要 API KEY'}</span>
        ${themeToggleHtml()}
      </div>
    </div>
  </header>`;
}

/**
 * 推演页 / 世界页的上下文顶栏。
 * actions: 已经拼好的按钮组 html（含状态 pill）。
 */
export function topbarContext({ backHref, backLabel, kicker, title, actions }) {
  return `
  <header class="topbar topbar--context">
    <div class="topbar__inner">
      <div class="topbar__context">
        <a class="back-button" href="${attr(backHref)}" aria-label="${attr(backLabel)}">${icon('back', 16)}</a>
        <div class="topbar__heading">
          <div class="topbar__kicker">${kicker}</div>
          <div class="topbar__title">${escapeHtml(title)}</div>
        </div>
      </div>
      <div class="topbar__actions">${actions}${themeToggleHtml()}</div>
    </div>
  </header>`;
}

export function bootScreen(text = '潮声正在就位') {
  return `<div class="boot"><div class="boot__mark">${iconMarkSvg()}</div><p>${escapeHtml(text)}</p></div>`;
}

export function renderErrorPage(title, message, code = '404') {
  setAppHtml(
    `${topbarPlain()}
    <main class="page">
      <div class="error-page">
        <span class="error-code">${escapeHtml(code)}</span>
        <h1>${escapeHtml(title)}</h1>
        <p>${escapeHtml(message)}</p>
        <a class="btn btn--ghost" href="#home">${icon('back', 14)} 回到首页</a>
      </div>
    </main>`,
    { scrollTop: true },
  );
}
