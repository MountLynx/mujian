/* 首页：项目总览。世界项目卡 + 短篇组 + 已归档折叠区，一行 tagline 保留气质。 */

import { state, STATUS_LABELS } from '../state.js';
import {
  setAppHtml,
  escapeHtml,
  attr,
  icon,
  iconMarkSvg,
  formatDate,
  relativeTime,
  statusPill,
  runStatusLabel,
} from '../dom.js';
import { worldStatusLabel } from '../world-data.js';
import { topbarPlain } from './shell.js';

/* ---- 状态小点（场景行） ---- */

function sceneDot(status) {
  return `<i class="scene-dot scene-dot--${attr(status)}" title="${escapeHtml(STATUS_LABELS[status] || status)}"></i>`;
}

/* ---- 世界项目卡（首页与世界库共享） ---- */

export function worldProjectCard(project, runs = []) {
  const statusLabel = worldStatusLabel(project.status, project.status === 'running', project.epochCount, project.maxEpochs);
  const scenes = runs
    .filter((run) => run.worldId === project.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const visible = scenes.slice(0, 4);
  const overflow = scenes.length - visible.length;
  const badges = [];
  if (project.unsealedScenes > 0) badges.push(`<span class="project-card__badge project-card__badge--todo">${icon('check', 12)} ${project.unsealedScenes} 个场景待收束</span>`);
  if (project.status === 'error') badges.push(`<span class="project-card__badge project-card__badge--error">${icon('bolt', 12)} 中断</span>`);
  return `
  <article class="project-card" data-project="${attr(project.id)}">
    <div class="project-card__head">
      <div class="project-card__heading">
        <h3><a href="#world/${encodeURIComponent(project.id)}">${escapeHtml(project.title)}</a></h3>
        ${project.kicker ? `<span class="project-card__kicker">${escapeHtml(project.kicker)}</span>` : ''}
      </div>
      <div class="project-card__tools">
        ${statusPill(project.status, statusLabel)}
        <button class="btn btn--quiet btn--icon" data-act="archive-project" data-id="${attr(project.id)}" title="归档这个项目" aria-label="归档这个项目">${icon('book', 14)}</button>
      </div>
    </div>
    <div class="project-card__metrics">
      <span>纪元 ${project.epochCount} / ${project.maxEpochs || '?'}</span>
      <span>开放线程 ${project.openThreads}</span>
      <span>在途消息 ${project.pendingSignals}</span>
      ${project.lastActivityTitle ? `<span class="project-card__activity">最近动态：${escapeHtml(project.lastActivityTitle)} · ${relativeTime(project.updatedAt)}</span>` : ''}
    </div>
    ${badges.length ? `<div class="project-card__badges">${badges.join('')}</div>` : ''}
    ${
      visible.length
        ? `<div class="project-card__scenes">${visible
            .map(
              (run) => `<a class="scene-row" href="#run/${encodeURIComponent(run.id)}">
                ${sceneDot(run.status)}
                <b>${escapeHtml(run.title)}</b>
                <span class="scene-row__meta">${run.beats} / ${run.maxBeats ?? '?'} 刻</span>
                <span class="scene-row__time">${relativeTime(run.updatedAt)}</span>
              </a>`,
            )
            .join('')}
          ${overflow > 0 ? `<a class="scene-row scene-row--more" href="#world/${encodeURIComponent(project.id)}"><span></span>还有 ${overflow} 场场景 →</a>` : ''}
        </div>`
        : ''
    }
  </article>`;
}

/* ---- 短篇卡（复用 v0.2 run 卡 + 刻度进度） ---- */

function runCard(run) {
  return `
  <a class="run-card" href="#run/${encodeURIComponent(run.id)}">
    <div class="run-card__top">
      ${statusPill(run.status, runStatusLabel({ status: run.status, beats: [] }, false, run.beats))}
      <span class="run-card__time">${formatDate(run.updatedAt)}</span>
    </div>
    <h3 class="run-card__title">${escapeHtml(run.title)}</h3>
    <p class="run-card__sub">${escapeHtml(run.currentBeatTitle ? `最近一幕：${run.currentBeatTitle}` : run.subtitle || '')}</p>
    <div class="run-card__foot">
      <span>${run.beats} / ${run.maxBeats ?? '?'} 刻</span>
      <span class="run-card__go">${icon('arrow', 14)}</span>
    </div>
  </a>`;
}

/* ---- 已归档折叠区 ---- */

function archivedHtml(projects) {
  const worlds = projects.filter((project) => project.kind === 'world');
  const shorts = projects.filter((project) => project.kind === 'short');
  return `
  <details class="archived-fold" data-key="archived-projects">
    <summary>已归档 <i>${projects.length}</i></summary>
    <div class="archived-fold__body">
      ${worlds
        .map(
          (project) => `<div class="archived-row">
            <a href="#world/${encodeURIComponent(project.id)}">${escapeHtml(project.title)}</a>
            <span class="archived-row__meta">世界项目 · 纪元 ${project.epochCount} / ${project.maxEpochs || '?'}</span>
            <button class="btn btn--ghost btn--sm" data-act="unarchive-project" data-id="${attr(project.id)}">恢复</button>
          </div>`,
        )
        .join('')}
      ${shorts
        .map(
          (project) => `<div class="archived-row">
            <a href="#run/${encodeURIComponent(project.id)}">${escapeHtml(project.title)}</a>
            <span class="archived-row__meta">短篇 · ${project.beats} 刻</span>
            <button class="btn btn--ghost btn--sm" data-act="unarchive-project" data-id="${attr(project.id)}">恢复</button>
          </div>`,
        )
        .join('')}
    </div>
  </details>`;
}

/* ---- 页面装配 ---- */

export function renderHome() {
  const archived = state.projects.filter((project) => project.archived);
  const worldProjects = state.projects.filter((project) => project.kind === 'world' && !project.archived);
  const shortProjects = state.projects.filter((project) => project.kind === 'short' && !project.archived);
  const archivedIds = new Set(archived.map((project) => project.id));
  const shorts = state.runs.filter((run) => !run.worldId && !archivedIds.has(run.id));
  const todos =
    state.projects.reduce((sum, project) => sum + (project.unsealedScenes || 0), 0) +
    state.projects.filter((project) => project.status === 'error').length;
  const migration = state.health?.migration;
  const latest = state.runs[0];
  const online = Boolean(state.health?.hasApiKey);

  setAppHtml(
    `${topbarPlain()}
    <main class="page home-page">
      <section class="home-head">
        <div class="home-head__title">
          <span class="brand__mark home-head__mark">${iconMarkSvg()}</span>
          <h1>幕间</h1>
          <p>骰子落下之前，故事尚有另一种可能。</p>
        </div>
        <div class="home-head__stats">
          <span><b>${worldProjects.length}</b> 个世界项目</span>
          <span><b>${shortProjects.length}</b> 个短篇</span>
          <span><b>${todos}</b> 项待办</span>
        </div>
        <div class="home-head__actions">
          <a class="btn btn--primary" href="#new">${icon('feather', 14)} 新建推演</a>
          <a class="btn btn--ghost" href="#worlds">${icon('globe', 14)} 进入世界线</a>
          ${latest ? `<a class="text-link" href="#run/${encodeURIComponent(latest.id)}">继续《${escapeHtml(latest.title)}》</a>` : ''}
        </div>
        ${
          migration?.needed
            ? `<p class="home-head__warn home-head__migrate">${icon('info', 13)} 检测到旧布局数据（${migration.worlds} 条世界线 · ${migration.runs} 条推演）。运行 <code>node src/cli.ts --migrate-projects</code> 完成迁移 →</p>`
            : ''
        }
        ${online ? '' : `<p class="home-head__warn">${icon('info', 13)} 服务端还没有配置 DeepSeek API Key：可以浏览与建场，推进需要先在 .env 里填好密钥。</p>`}
      </section>

      <section class="home-section">
        <header class="section-row">
          <h2>世界项目</h2>
          <a class="text-link" href="#worlds">世界库 →</a>
        </header>
        ${
          worldProjects.length
            ? `<div class="project-list">${worldProjects.map((project) => worldProjectCard(project, state.runs)).join('')}</div>`
            : `<div class="empty-state empty-state--slim">
                <p>还没有世界项目。一条世界线，加上它长出的聚焦场景，就是一个故事。</p>
                <a class="btn btn--ghost" href="#worlds">${icon('globe', 14)} 新建世界线 →</a>
              </div>`
        }
      </section>

      <section class="home-section">
        <header class="section-row">
          <h2>短篇</h2>
          <a class="text-link" href="#new">另起一幕 →</a>
        </header>
        ${
          shorts.length
            ? `<div class="home-grid">${shorts.slice(0, 8).map(runCard).join('')}
              <a class="new-card" href="#new"><span>＋</span><b>另起一幕</b><i>从预置剧本，或一份自己的手稿开始。</i></a>
            </div>`
            : `<div class="empty-state">
                <p>还没有留下手记。</p>
                <a class="btn btn--primary" href="#new">${icon('feather', 14)} 开始第一场</a>
              </div>`
        }
      </section>

      ${archived.length ? archivedHtml(archived) : ''}

      <footer class="colophon">
        <span>幕间 · Mise-en-scène</span>
        <span>本地叙事推演引擎 · ${escapeHtml(state.health?.model || 'DeepSeek')}</span>
      </footer>
    </main>`,
    { scrollTop: true },
  );
}
