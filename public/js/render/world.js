/* 世界页渲染：头卡 + 纪元导航 + 纪元事件线 + 折叠侧栏。五个区域按签名更新。 */

import { state, WORLD_RESOURCE_LABELS } from '../state.js';
import {
  app,
  setAppHtml,
  setRegion,
  escapeHtml,
  attr,
  avatar,
  icon,
  statusPill,
  relativeTime,
  truncateText,
  paragraphHtml,
} from '../dom.js';
import { topbarContext } from './shell.js';
import {
  worldStatusLabel,
  worldStatusFor,
  worldEntityName,
  worldRegion,
  worldFaction,
  worldActor,
  safeWorldColor,
  worldFactionColor,
  knownByWorld,
  formatArrival,
  formatWorldAdvance,
  isWorldRunning,
} from '../world-data.js';

/* ---- 故事层：场景带 ---- */

const SCENE_STAMPS = {
  running: '推演中',
  unsealed: '待收束',
  offered: '可开镜',
  sealed: '已收束',
  archived: '已归档',
};

function sceneBandSections(world) {
  const latestEpochIndex = world.epochs.at(-1)?.index ?? -1;
  const sections = { running: [], unsealed: [], offered: [], sealed: [], archived: [] };
  for (const hook of world.sceneHooks) {
    const sceneRun = world.sceneRuns.find((entry) => entry.hookId === hook.id);
    if (sceneRun?.status === 'completed') {
      sections.sealed.push({ hook, sceneRun, state: 'sealed' });
      continue;
    }
    if (sceneRun) {
      const inProgress = sceneRun.runStatus === 'running' || !(sceneRun.beatCount ?? 0);
      sections[inProgress ? 'running' : 'unsealed'].push({
        hook,
        sceneRun,
        state: inProgress ? 'running' : 'unsealed',
      });
      continue;
    }
    if (hook.epochIndex === latestEpochIndex && hook.status === 'offered') {
      sections.offered.push({ hook, sceneRun: null, state: 'offered' });
    } else {
      sections.archived.push({ hook, sceneRun: null, state: 'archived' });
    }
  }
  sections.sealed.sort((a, b) => String(b.sceneRun.completedAt || '').localeCompare(String(a.sceneRun.completedAt || '')));
  return sections;
}

function sceneCard(world, entry) {
  const { hook, sceneRun, state: cardState } = entry;
  const region = worldRegion(world, hook.regionId);
  const participants = hook.participantIds
    .map((id) => worldActor(world, id))
    .filter(Boolean)
    .slice(0, 4);
  const running = isWorldRunning(world);
  const actions = [];
  if (cardState === 'offered') {
    actions.push(
      `<button class="btn btn--secondary btn--sm" data-act="start-world-scene" data-world="${attr(world.id)}" data-hook="${attr(hook.id)}" ${running ? 'disabled' : ''}>${icon('play', 12)} 开镜</button>`,
    );
  }
  if (sceneRun) {
    actions.push(
      `<a class="btn btn--ghost btn--sm" href="#run/${encodeURIComponent(sceneRun.runId)}">${icon('arrow', 12)} 查看场景</a>`,
    );
  }
  if (cardState === 'unsealed') {
    actions.push(
      `<button class="btn btn--secondary btn--sm" data-act="seal-world-scene" data-world="${attr(world.id)}" data-run="${attr(sceneRun.runId)}" ${running ? 'disabled' : ''}>${icon('check', 12)} 收束</button>`,
    );
  }
  return `
  <article class="scene-card scene-card--${cardState}">
    <div class="scene-card__top">
      <span class="scene-card__stamp scene-card__stamp--${cardState}">${SCENE_STAMPS[cardState]}</span>
      <span class="scene-card__time">${relativeTime(sceneRun ? world.sceneRuns.find((item) => item.runId === sceneRun.runId)?.addedAt || hook.createdAt : hook.createdAt)}</span>
    </div>
    <h4>${escapeHtml(hook.title)}</h4>
    <p class="scene-card__meta">
      <span>${escapeHtml(region?.name || '未知区域')}</span>
      <span class="scene-card__cast">${participants.map((actor) => avatar(actor, 'sm')).join('')}</span>
      ${sceneRun ? `<span>${sceneRun.beatCount ?? 0} 刻</span>` : ''}
    </p>
    ${cardState === 'sealed' && sceneRun?.summary ? `<p class="scene-card__summary">${escapeHtml(truncateText(sceneRun.summary, 130))}</p>` : ''}
    ${cardState !== 'sealed' ? `<p class="scene-card__question">${escapeHtml(truncateText(hook.question, 90))}</p>` : ''}
    <div class="scene-card__actions">${actions.join('')}</div>
  </article>`;
}

function sceneBandGroup(world, label, entries, modifier) {
  if (!entries.length) return '';
  return `
  <div class="scene-band__group scene-band__group--${modifier}">
    <h3 class="scene-band__label">${label} <i>${entries.length}</i></h3>
    <div class="scene-band__cards">${entries.map((entry) => sceneCard(world, entry)).join('')}</div>
  </div>`;
}

export function worldScenesHtml(world) {
  const sections = sceneBandSections(world);
  const total =
    sections.running.length +
    sections.unsealed.length +
    sections.offered.length +
    sections.sealed.length +
    sections.archived.length;
  const notice = sections.unsealed.length
    ? `<button class="world-notice" data-act="scroll-world-scenes">${icon('bolt', 13)} ${sections.unsealed.length} 个场景已推演，余波尚未写回世界账本 →</button>`
    : '';
  if (!total) return notice;
  return `
  ${notice}
  <section class="scene-band" id="world-scenes-band" aria-label="聚焦场景带">
    <header class="scene-band__head">
      <h2>聚焦场景</h2>
      <span>镜头只落在值得看的地方</span>
    </header>
    ${sceneBandGroup(world, '推演中', sections.running, 'running')}
    ${sceneBandGroup(world, '待收束', sections.unsealed, 'unsealed')}
    ${sceneBandGroup(world, '可开镜', sections.offered, 'offered')}
    ${sceneBandGroup(world, '已收束', sections.sealed.slice(0, 6), 'sealed')}
    ${sceneBandGroup(world, '旧纪元契约', sections.archived, 'archived')}
  </section>`;
}

/* ---- 顶栏 ---- */

function topbarWorld(world, active) {
  const running = isWorldRunning(world);
  const label = worldStatusFor(world, running);
  const actions = `
    ${statusPill(running ? 'running' : world.status, label)}
    <button class="btn btn--quiet btn--hide-mobile ${state.godView ? 'is-active' : ''}" data-act="toggle-god" title="显示世界真相与未知事实">${icon('eye', 14)}<span class="btn__text">${state.godView ? '全知视角' : '剧作家视角'}</span></button>
    ${running
      ? `<button class="btn btn--ghost btn--sm" data-act="stop-world">${icon('pause', 13)} ${state.worldStopRequested ? '将在本纪元后暂停' : '请求暂停'}</button>`
      : world.status === 'error'
        ? `<button class="btn btn--primary btn--sm" data-act="advance-world-one">${icon('refresh', 13)} 重试本纪元</button>`
        : `<button class="btn btn--primary btn--sm" data-act="advance-world-one">${icon('play', 13)} ${world.epochs.length ? '推进一纪元' : '展开第一纪元'}</button>`}
    <a class="btn btn--quiet btn--icon" href="/api/worlds/${encodeURIComponent(world.id)}/export.md" download title="导出世界战报" aria-label="导出世界战报">${icon('download', 15)}</a>`;
  return topbarContext({
    backHref: '#worlds',
    backLabel: '回到世界库',
    kicker: `世界线 · ${escapeHtml(world.definition.kicker)} · ${escapeHtml(world.id.replace(/^world_/, '').slice(0, 8))}`,
    title: world.definition.title,
    actions,
  });
}

/* ---- 头卡 ---- */

function worldHeadHtml(world) {
  const last = world.epochs.at(-1);
  return `
  <section class="world-head">
    <div class="world-head__main">
      <h1>${escapeHtml(world.definition.title)}</h1>
      <p class="world-head__overview">${escapeHtml(truncateText(world.definition.setting.overview, 240))}
        <button class="text-link" data-act="open-world-overview">全文</button></p>
      <div class="world-head__meta">
        <span>${world.definition.setting.regions.length} 区域</span>
        <span>${world.definition.setting.factions.length} 势力</span>
        <span>${world.definition.setting.actors.length} 角色</span>
        <span>${world.epochs.length} / ${world.settings.maxEpochs} 纪元</span>
      </div>
    </div>
    <div class="world-head__clock">
      <span class="overline">世界时间</span>
      <b>${escapeHtml(world.clock.time)}</b>
      <span>${escapeHtml(world.definition.setting.startLabel)} · 第 ${world.clock.day} 日</span>
      <span class="world-head__epoch">${last ? `第 ${last.index + 1} 纪元 · ${escapeHtml(last.title)}` : '尚未展开'}</span>
    </div>
  </section>`;
}

/* ---- 纪元导航条 ---- */

function chronologyHtml(world) {
  const epochs = world.epochs;
  const latestIndex = epochs.at(-1)?.index ?? -1;
  const pending = world.signals.filter((signal) => signal.status === 'pending').length;
  const nodes = [];
  nodes.push(`<div class="chrono__start"><span class="chrono__dot"></span><b>${escapeHtml(world.definition.setting.startClock)}</b><small>起点</small></div>`);
  epochs.forEach((epoch) => {
    const hook = epoch.sceneHookId ? world.sceneHooks.find((entry) => entry.id === epoch.sceneHookId) : null;
    const eventCount = world.events.filter((event) => event.epochIndex === epoch.index && event.kind !== 'signal').length;
    const current = epoch.index === latestIndex;
    const hookLabel = hook
      ? hook.status === 'completed'
        ? '场景已收束'
        : epoch.index === latestIndex
          ? '可开镜'
          : '场景已归档'
      : '';
    nodes.push(
      `<span class="chrono__edge">${formatWorldAdvance(epoch.advanceMinutes)}</span>
      <button class="chrono__node ${current ? 'is-current' : ''}" data-act="jump-world-epoch" data-epoch="${epoch.index}" aria-label="跳到第 ${epoch.index + 1} 纪元：${attr(epoch.title)}">
        <span class="chrono__dot"></span>
        <b>${escapeHtml(epoch.title)}</b>
        <small>第 ${epoch.clock.day} 日 ${escapeHtml(epoch.clock.time)} · ${eventCount} 事件${hookLabel ? ` · ${hookLabel}` : ''}</small>
      </button>`,
    );
  });
  if (!epochs.length) {
    nodes.push(`<span class="chrono__edge">尚未开始</span>
      <div class="chrono__node chrono__node--ghost"><span class="chrono__dot"></span><b>等待第一纪元</b><small>世界尚未运转</small></div>`);
  } else if (isWorldRunning(world)) {
    nodes.push(`<span class="chrono__edge">正在推演</span>
      <div class="chrono__node chrono__node--live"><span class="pulse"></span><b>下一纪元</b><small>${escapeHtml(world.progress?.label || '世界导演正在计算')}</small></div>`);
  } else if (epochs.length < world.settings.maxEpochs) {
    nodes.push(`<span class="chrono__edge">下一段</span>
      <div class="chrono__node"><span class="chrono__dot"></span><b>等待推进</b><small>${escapeHtml(world.clock.display)}</small></div>`);
  }
  return `
  <section class="chrono" aria-label="世界时间线总览">
    <div class="chrono__track">${nodes.join('')}</div>
  </section>`;
}

/* ---- 事件卡（紧凑，详情在弹窗） ---- */

export function worldEventCard(world, event, options = {}) {
  const region = event.regionId ? worldRegion(world, event.regionId) : null;
  const isSignal = event.kind === 'signal';
  const isScene = event.kind === 'scene';
  const effectCount =
    event.effects.factIdsAdded.length +
    event.effects.regionChanges.length +
    event.effects.factionChanges.length +
    event.effects.actorChanges.length +
    event.effects.threadChanges.length;
  const effectBits = [];
  if (event.effects.factIdsAdded.length) effectBits.push(`${event.effects.factIdsAdded.length} 条事实`);
  if (effectCount - event.effects.factIdsAdded.length) effectBits.push(`${effectCount - event.effects.factIdsAdded.length} 项状态`);
  if (event.signalIds.length) effectBits.push(`${event.signalIds.length} 个信号`);
  return `
  <button class="wev ${isSignal ? 'wev--signal' : ''} ${isScene ? 'wev--scene' : ''} ${options.child ? 'wev--child' : ''}" data-act="open-world-event" data-event="${attr(event.id)}">
    <span class="wev__top">
      <em class="wev__kind">${isSignal ? '信号抵达' : isScene ? '聚焦余波' : escapeHtml(region?.name || '世界')}</em>
      <em class="wev__vis wev__vis--${attr(event.visibility)}">${event.visibility === 'public' ? '公开' : event.visibility === 'secret' ? '秘密' : '混合'}</em>
      <em class="wev__time">${escapeHtml(event.clock.time)}</em>
    </span>
    <h4>${escapeHtml(event.title)}</h4>
    <p>${escapeHtml(truncateText(event.summary, 110))}</p>
    ${effectBits.length ? `<span class="wev__effects">${effectBits.join(' · ')}</span>` : ''}
  </button>`;
}

/* ---- 聚焦场景契约 ---- */

export function worldSceneHook(world, hook, options = {}) {
  if (!hook) return '';
  const archived = Boolean(options.archived);
  const sceneRun = world.sceneRuns.find((entry) => entry.hookId === hook.id);
  const participants = hook.participantIds.map((id) => world.definition.setting.actors.find((actor) => actor.id === id)).filter(Boolean);
  const running = isWorldRunning(world);
  const complete = sceneRun?.status === 'completed';
  return `
  <section class="hook ${complete ? 'is-complete' : ''} ${archived ? 'is-archived' : ''}">
    <div class="hook__body">
      <div>
        <span class="hook__kind">${icon('feather', 12)} 聚焦场景 · ${escapeHtml(worldRegion(world, hook.regionId)?.name || hook.regionId)}${archived ? ' · 旧纪元' : ''}</span>
        <h3>${escapeHtml(hook.title)}</h3>
        <p class="hook__question">${escapeHtml(hook.question)}</p>
        <p class="hook__stakes">${escapeHtml(hook.stakes)}</p>
        <div class="hook__cast">${participants.map((actor) => `<span class="cast-chip">${avatar(actor, 'sm')}${escapeHtml(actor.name)}</span>`).join('')}</div>
      </div>
      <div class="hook__actions">
        ${complete
          ? `<span class="status-pill status-pill--ended">已收束</span>${sceneRun ? `<a class="text-link" href="#run/${encodeURIComponent(sceneRun.runId)}">查看场景</a>` : ''}`
          : sceneRun
            ? `<a class="btn btn--ghost btn--sm" href="#run/${encodeURIComponent(sceneRun.runId)}">${icon('arrow', 13)} 查看局部场景</a>
               ${sceneRun.beatCount ? `<button class="btn btn--secondary btn--sm" data-act="seal-world-scene" data-world="${attr(world.id)}" data-run="${attr(sceneRun.runId)}">${icon('check', 13)} 收束回世界</button>` : ''}`
            : archived
              ? '<span class="side-dim">已归档</span>'
              : `<button class="btn btn--secondary btn--sm" data-act="start-world-scene" data-world="${attr(world.id)}" data-hook="${attr(hook.id)}" ${running ? 'disabled' : ''}>${icon('play', 12)} 开镜</button>`}
      </div>
    </div>
    ${state.godView && hook.privateCues.length
      ? `<details class="fold fold--cues" data-key="world-cues-${attr(hook.id)}"><summary>私密线索 <i>剧作家可见</i></summary><div class="fold__body">${hook.privateCues.map((cue) => `<div class="cue"><span>${escapeHtml(worldEntityName(world, cue.actorId))}</span><p>${escapeHtml(cue.cue)}</p></div>`).join('')}</div></details>`
      : ''}
  </section>`;
}

/* ---- 纪元事件线 ---- */

function worldTimelineHtml(world) {
  if (!world.epochs.length) {
    return `
    <section class="panel world-empty-panel">
      <h2>世界还没有开始。</h2>
      <p>几个区域仍停在同一个时刻。展开第一纪元后，世界导演会在不同区域同时写下事件，并把消息放上它该走的路。</p>
      <button class="btn btn--primary" data-act="advance-world-one" ${isWorldRunning(world) ? 'disabled' : ''}>${icon('play', 14)} 展开第一纪元</button>
    </section>`;
  }
  const epochs = [...world.epochs].reverse();
  return `
  <div class="wtimeline">
    ${epochs
      .map((epoch) => {
        const deliveries = world.events.filter((event) => event.epochIndex === epoch.index && event.kind === 'signal');
        const roots = world.events.filter((event) => event.epochIndex === epoch.index && event.kind !== 'signal' && !event.parentId);
        const hook = epoch.sceneHookId ? world.sceneHooks.find((entry) => entry.id === epoch.sceneHookId) : null;
        return `
        <article class="wepoch ${epoch.index === world.epochs.length - 1 ? 'is-current' : ''}" id="world-epoch-${epoch.index}" data-world-epoch="${epoch.index}">
          <div class="wepoch__rail"><span>${String(epoch.index + 1).padStart(2, '0')}</span></div>
          <div class="wepoch__body">
            <header class="wepoch__header">
              <div>
                <span class="wepoch__time">${escapeHtml(epoch.clock.display)}</span>
                <h3>${escapeHtml(epoch.title)}</h3>
              </div>
              <span class="wepoch__jump">+${formatWorldAdvance(epoch.advanceMinutes)}</span>
            </header>
            <p class="wepoch__summary">${escapeHtml(truncateText(epoch.summary, 200))}</p>
            <p class="wepoch__reason">${icon('clock', 11)} ${escapeHtml(epoch.advanceReason)}</p>
            ${deliveries.length ? `<div class="wepoch__deliveries"><span class="wepoch__deliveries-label">${icon('link', 11)} 路上抵达</span>${deliveries.map((event) => worldEventCard(world, event)).join('')}</div>` : ''}
            <div class="wepoch__events">
              ${roots
                .map(
                  (event) => `<div class="wepoch__group ${event.childIds.length ? 'is-parent' : ''}">
                    ${worldEventCard(world, event)}
                    ${event.childIds.length ? `<div class="wepoch__children">${event.childIds.map((id) => world.events.find((entry) => entry.id === id)).filter(Boolean).map((child) => worldEventCard(world, child, { child: true })).join('')}</div>` : ''}
                  </div>`,
                )
                .join('') || '<p class="side-empty">这一纪元没有形成可见事件。</p>'}
            </div>
            ${hook ? worldSceneHook(world, hook, { archived: epoch.index !== world.epochs.at(-1)?.index }) : ''}
          </div>
        </article>`;
      })
      .join('')}
  </div>`;
}

/* ---- 侧栏 ---- */

function controlPanelHtml(world) {
  const running = isWorldRunning(world);
  const atMax = world.epochs.length >= world.settings.maxEpochs;
  const canStart = !state.health || state.health.hasApiKey;
  const last = world.epochs.at(-1);
  return `
  <section class="panel side-panel">
    <div class="side-panel__head"><h2>世界导演台</h2>${statusPill(running ? 'running' : world.status, worldStatusFor(world, running))}</div>
    <p class="side-panel__scene">${escapeHtml(last?.title || '等待第一声钟')}</p>
    ${running ? `<div class="live"><div class="live__line"><span class="pulse"></span>${escapeHtml(world.progress?.label || '世界导演正在计算')}</div>${world.progress?.detail ? `<div class="live__detail">${escapeHtml(world.progress.detail)}</div>` : ''}</div>` : ''}
    ${world.error ? `<div class="side-error">${escapeHtml(world.error)}</div>` : ''}
    <div class="side-panel__actions">
      ${running
        ? `<button class="btn btn--ghost btn--wide" data-act="stop-world" ${state.worldStopRequested ? 'disabled' : ''}>${icon('pause', 13)} ${state.worldStopRequested ? '将在本纪元后暂停' : '请求暂停'}</button>`
        : `<button class="btn btn--primary" data-act="advance-world-one" ${canStart ? '' : 'disabled'}>${icon('play', 13)} ${world.epochs.length ? '推进一纪元' : '展开第一纪元'}</button>
           <button class="btn btn--secondary" data-act="advance-world-auto" ${canStart && !atMax ? '' : 'disabled'} title="连推两个纪元">${icon('layers', 13)} 连推两纪</button>`}
    </div>
    <div class="side-note world-control__foot">
      <span>${world.epochs.length} / ${world.settings.maxEpochs} 纪元</span>
      <span>${world.llm.calls} 次调用 · ${world.llm.totalTokens.toLocaleString('zh-CN')} tokens</span>
    </div>
    <details class="side-fold" data-key="world-engine-fold">
      <summary>世界引擎记录</summary>
      <div class="side-fold__body">
        <p>seed：<span class="mono">${escapeHtml(world.seed)}</span></p>
        <p>model：${escapeHtml(world.settings.model)} · thinking：${escapeHtml(world.settings.thinking)}</p>
        <p>重试 ${world.llm.failures} 次</p>
        <p><button class="text-link side-danger" data-act="confirm-delete-world">${icon('trash', 12)} 删除这个世界</button></p>
      </div>
    </details>
  </section>`;
}

function threadsPanelHtml(world) {
  return `
  <section class="panel side-panel">
    <div class="side-panel__head"><h2>剧情线程</h2><span>${world.definition.setting.threads.length}</span></div>
    <div class="thread-list">
      ${world.definition.setting.threads
        .map((thread) => {
          const runtime = world.threads[thread.id];
          const ratio = Math.min(1, Math.max(0, (runtime?.clockValue ?? thread.clock.value) / thread.clock.max));
          return `<button class="thread ${runtime?.status === 'resolved' ? 'is-resolved' : runtime?.status === 'failed' ? 'is-failed' : ''}" data-act="open-world-thread" data-thread="${attr(thread.id)}" title="${attr(thread.clock.label)}：${attr(thread.clock.onFill)}">
            <div class="thread__top"><b>${escapeHtml(thread.title)}</b><span>${runtime?.clockValue ?? thread.clock.value}/${thread.clock.max} ${escapeHtml(thread.clock.unit)}</span></div>
            <div class="meter"><span style="width:${(ratio * 100).toFixed(0)}%"></span></div>
            <p>${escapeHtml(thread.question)}</p>
          </button>`;
        })
        .join('')}
    </div>
  </section>`;
}

function factionFoldHtml(world) {
  return `
  <details class="side-fold" data-key="world-factions">
    <summary>势力 <i>${world.definition.setting.factions.length}</i></summary>
    <div class="side-fold__body side-fold__body--list">
      ${world.definition.setting.factions
        .map((faction) => {
          const runtime = world.factions[faction.id];
          return `<button class="entity-row" data-act="open-world-faction" data-faction="${attr(faction.id)}">
            <span class="sigil" style="--faction-color:${attr(safeWorldColor(faction.color, '#9aae9f'))}">${escapeHtml(faction.sigil?.[0] || faction.name[0])}</span>
            <span class="entity-row__body">
              <span class="entity-row__name">${escapeHtml(faction.name)}</span>
              <span class="entity-row__meta">力量 ${runtime?.power ?? faction.power} · 合法 ${runtime?.legitimacy ?? faction.legitimacy}</span>
            </span>
          </button>`;
        })
        .join('')}
    </div>
  </details>`;
}

function actorFoldHtml(world) {
  return `
  <details class="side-fold" data-key="world-actors">
    <summary>具名角色 <i>${world.definition.setting.actors.length}</i></summary>
    <div class="side-fold__body side-fold__body--list">
      ${world.definition.setting.actors
        .map((actor) => {
          const runtime = world.actors[actor.id];
          const region = worldRegion(world, runtime?.regionId || actor.regionId);
          return `<button class="entity-row" data-act="open-world-actor" data-actor="${attr(actor.id)}">
            ${avatar(actor, 'sm')}
            <span class="entity-row__body">
              <span class="entity-row__name">${escapeHtml(actor.name)}${actor.spotlight ? '<i class="tag tag--gold">焦点</i>' : ''}</span>
              <span class="entity-row__meta">${escapeHtml(region?.name || '未知')} · ${escapeHtml(truncateText(actor.agenda, 26))}</span>
            </span>
          </button>`;
        })
        .join('')}
    </div>
  </details>`;
}

function signalFoldHtml(world) {
  const pending = world.signals.filter((signal) => signal.status === 'pending').sort((a, b) => a.arrivesAt - b.arrivesAt);
  return `
  <details class="side-fold" data-key="world-signals" ${pending.length ? 'open' : ''}>
    <summary>在途消息 <i>${pending.length}</i></summary>
    <div class="side-fold__body side-fold__body--list">
      ${pending.length
        ? pending
            .map(
              (signal) => `<div class="signal">
                <div class="signal__head"><span>${escapeHtml(signal.channel)}</span><b>${formatArrival(world, signal.arrivesAt)}</b></div>
                <p>${escapeHtml(truncateText(signal.content, 90))}</p>
                <small>→ ${escapeHtml(knownByWorld(world, signal.toEntityIds))}</small>
              </div>`,
            )
            .join('')
        : '<p class="side-empty">没有消息在路上。</p>'}
    </div>
  </details>`;
}

function factsFoldHtml(world) {
  const active = world.facts.filter((fact) => fact.retiredAtEpoch === null);
  const facts = state.godView
    ? [...active].sort((a, b) => b.createdEpoch - a.createdEpoch).slice(0, 6)
    : active.filter((fact) => fact.public).slice(-6).reverse();
  return `
  <details class="side-fold" data-key="world-facts">
    <summary>${state.godView ? '事实账本' : '公开事实'} <i>${state.godView ? active.length : facts.length}</i></summary>
    <div class="side-fold__body side-fold__body--list">
      ${facts.length
        ? facts
            .map(
              (fact) => `<div class="fact ${fact.public ? '' : 'fact--restricted'}">
                <p>${escapeHtml(truncateText(fact.text, 110))}</p>
                ${state.godView ? `<small>知道：${escapeHtml(knownByWorld(world, fact.knownBy))}</small>` : ''}
              </div>`,
            )
            .join('')
        : '<p class="side-empty">还没有公开事实。</p>'}
      <button class="text-link" data-act="open-world-facts">${icon('link', 12)} 打开完整账本</button>
    </div>
  </details>`;
}

/* ---- 页面装配 ---- */

export function renderWorldPage(options = {}) {
  const world = state.currentWorld;
  if (!world) return;
  const active = isWorldRunning(world);

  const skeletonExists = Boolean(app.querySelector('[data-region="world-main"]'));
  if (options.full || !skeletonExists) {
    setAppHtml(
      `<div data-region="world-topbar"></div>
      <main class="page world-page">
        <div data-region="world-head"></div>
        <div data-region="world-scenes"></div>
        <div data-region="world-chrono"></div>
        <div class="world-grid">
          <div class="world-maincol" data-region="world-main"></div>
          <aside class="world-sidecol" data-region="world-side"></aside>
        </div>
      </main>`,
      { scrollTop: Boolean(options.scrollTop) },
    );
  }

  const running = isWorldRunning(world);
  const pending = world.signals.filter((signal) => signal.status === 'pending').length;

  setRegion(
    'world-topbar',
    topbarWorld(world, active),
    [running ? 1 : 0, world.status, state.worldStopRequested ? 1 : 0, state.godView ? 1 : 0].join('|'),
  );
  setRegion('world-head', worldHeadHtml(world), [world.updatedAt, state.godView ? 1 : 0].join('|'));
  setRegion(
    'world-scenes',
    worldScenesHtml(world),
    [
      world.sceneRuns.map((sceneRun) => `${sceneRun.runId}:${sceneRun.status}:${sceneRun.runStatus || ''}:${sceneRun.beatCount || 0}`).join(','),
      world.sceneHooks.map((hook) => `${hook.id}:${hook.status}`).join(','),
      running ? 1 : 0,
      world.epochs.length,
    ].join('|'),
  );
  setRegion(
    'world-chrono',
    chronologyHtml(world),
    [
      world.epochs.map((epoch) => `${epoch.index}:${epoch.title}`).join(','),
      running ? 1 : 0,
      world.progress?.label || '',
      world.clock.time,
      pending,
    ].join('|'),
  );
  setRegion(
    'world-main',
    worldTimelineHtml(world),
    [
      world.epochs.length,
      world.events.length,
      world.sceneHooks.map((hook) => `${hook.id}:${hook.status}`).join(','),
      world.sceneRuns.map((sceneRun) => `${sceneRun.runId}:${sceneRun.status}:${sceneRun.beatCount || 0}`).join(','),
      state.godView ? 1 : 0,
    ].join('|'),
  );
  setRegion(
    'world-side',
    `${controlPanelHtml(world)}${threadsPanelHtml(world)}${factionFoldHtml(world)}${actorFoldHtml(world)}${signalFoldHtml(world)}${factsFoldHtml(world)}`,
    [
      world.updatedAt,
      running ? 1 : 0,
      state.worldStopRequested ? 1 : 0,
      state.godView ? 1 : 0,
      world.status,
      pending,
      world.llm.calls,
      world.progress?.label || '',
      world.progress?.detail || '',
      JSON.stringify(world.threads),
    ].join('|'),
  );
}
