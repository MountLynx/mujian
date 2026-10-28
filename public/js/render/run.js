/* 推演页渲染：叙事是第一层，机制收进折叠。四个区域按签名更新。 */

import { state, OUTCOME_LABELS, OUTCOME_CLASS, ABILITY_LABELS } from '../state.js';
import {
  app,
  setAppHtml,
  setRegion,
  escapeHtml,
  attr,
  paragraphHtml,
  avatar,
  icon,
  statusPill,
  runStatusLabel,
  shortId,
  completeBeats,
  latestComplete,
  currentPartial,
  findCharacter,
  characterName,
  isRunning,
} from '../dom.js';
import { topbarContext } from './shell.js';

/* ---- 顶栏 ---- */

function topbarRun(run, active) {
  const running = run.status === 'running' || active;
  const label = runStatusLabel(run, running);
  const worldLink = run.worldLink || null;
  const actions = `
    ${statusPill(running ? 'running' : run.status, label)}
    <button class="btn btn--quiet btn--hide-mobile ${state.godView ? 'is-active' : ''}" data-act="toggle-god" title="显示角色内心与私密线索">${icon('eye', 14)}<span class="btn__text">${state.godView ? '全知视角' : '剧作家视角'}</span></button>
    <button class="btn btn--quiet btn--hide-mobile" data-act="open-rules" title="推演规则">${icon('book', 14)}<span class="btn__text">规则</span></button>
    ${running
      ? `<button class="btn btn--ghost btn--sm" data-act="stop-run">${icon('pause', 13)} ${state.stopRequested ? '将在本刻后暂停' : '请求暂停'}</button>`
      : !run.ending
        ? `<button class="btn btn--primary btn--sm" data-act="advance-one" ${state.health && !state.health.hasApiKey ? 'disabled' : ''}>${icon('play', 12)} 推进一刻</button>`
        : ''}
    ${run.ending
      ? `<a class="btn btn--ghost btn--sm" href="/api/runs/${encodeURIComponent(run.id)}/export.md" download>${icon('download', 13)} 导出战报</a>`
      : `<a class="btn btn--quiet btn--icon" href="/api/runs/${encodeURIComponent(run.id)}/export.md" download title="导出战报" aria-label="导出战报">${icon('download', 15)}</a>`}`;
  return topbarContext({
    backHref: worldLink ? `#world/${encodeURIComponent(worldLink.worldId)}` : '#home',
    backLabel: worldLink ? '回到世界线' : '回到首页',
    kicker: worldLink
      ? `世界场景 · ${escapeHtml(worldLink.worldTitle)} · ${escapeHtml(shortId(run.id))}`
      : `${escapeHtml(run.scenario.kicker)} · ${escapeHtml(shortId(run.id))}`,
    title: run.scenario.title,
    actions,
  });
}

/* ---- 时刻导航 ---- */

function beatNavHtml(run) {
  const beats = completeBeats(run);
  const partial = currentPartial(run);
  const running = isRunning(run);
  if (!beats.length && !partial) return '';
  return `
  <div class="beatnav">
    <div class="beatnav__chips">
      ${beats
        .map(
          (beat) => `<button class="beat-chip ${state.selectedBeatId === beat.id ? 'is-active' : ''}" data-act="select-beat" data-beat="${attr(beat.id)}">
            <b>${String(beat.index + 1).padStart(2, '0')}</b>${escapeHtml(beat.clock.display)}
          </button>`,
        )
        .join('')}
      ${partial ? `<span class="beat-chip beat-chip--live"><span class="pulse"></span>第 ${partial.index + 1} 刻</span>` : ''}
      <span class="beatnav__count">${beats.length} / ${run.settings.maxBeats} 刻</span>
    </div>
    ${partial && running ? `<div class="beatnav__live"><span class="pulse"></span>${escapeHtml(run.progress?.label || '导演正在工作')}${run.progress?.detail ? `<i>${escapeHtml(run.progress.detail)}</i>` : ''}</div>` : ''}
  </div>`;
}

/* ---- 折叠与检定 ---- */

function renderRollFormula(check) {
  if (!check) return '';
  const parts = [
    `<span class="roll-part roll-part--dice">d20 ${check.natural}</span>`,
    `<span class="roll-part">${escapeHtml(ABILITY_LABELS[check.ability] || check.ability)} +${check.abilityValue}</span>`,
  ];
  if (check.traitName) {
    parts.push(`<span class="roll-part">${escapeHtml(check.traitName)} +${check.traitBonus}</span>`);
  }
  if (check.conditionBonus) {
    parts.push(`<span class="roll-part ${check.conditionBonus < 0 ? 'roll-part--neg' : ''}">状态 ${check.conditionBonus > 0 ? '+' : ''}${check.conditionBonus}</span>`);
  }
  if (check.situationalBonus) {
    parts.push(`<span class="roll-part ${check.situationalBonus < 0 ? 'roll-part--neg' : ''}">裁定 ${check.situationalBonus > 0 ? '+' : ''}${check.situationalBonus}</span>`);
  }
  if (check.penalty) {
    parts.push(`<span class="roll-part roll-part--neg">惩罚 ${check.penalty}</span>`);
  }
  parts.push(`<span class="roll-equals">=</span><span class="roll-total">${check.total}</span>`);
  const margin = check.margin;
  const targetLabel =
    check.opponentTotal !== undefined && check.opponentTotal !== null
      ? `回应总值 <b>${check.opponentTotal}</b>`
      : `对照 DC <b>${check.dc ?? '—'}</b>`;
  return `
    <div class="roll-formula">${parts.join('')}</div>
    <div class="roll-target">
      <span>${targetLabel}</span>
      ${margin !== undefined && margin !== null ? `<span class="roll-margin">差值 ${margin >= 0 ? '+' : ''}${margin}</span>` : ''}
      ${check.criticalByNatural20 ? '<span class="tag tag--gold">自然 20</span>' : ''}
      ${check.penaltyNotes?.length ? `<span class="roll-margin">${escapeHtml(check.penaltyNotes.join(' · '))}</span>` : ''}
    </div>`;
}

function privateCuesHtml(run, beat) {
  if (!state.godView) return '';
  return `
  <details class="fold fold--cues" data-key="cues-${attr(beat.id)}">
    <summary>${icon('eye', 13)} 私密线索 <i>仅剧作家可见</i></summary>
    <div class="fold__body">
      ${beat.gmNote ? `<div class="cue cue--gm"><span>导演幕后注</span><p>${escapeHtml(beat.gmNote)}</p></div>` : ''}
      ${beat.privateCues
        .map(
          (cue) => `<div class="cue"><span>${escapeHtml(characterName(run, cue.characterId))}</span><p>${escapeHtml(cue.cue)}</p></div>`,
        )
        .join('')}
    </div>
  </details>`;
}

/* ---- 行动行 ---- */

function actionRow(run, beat, action) {
  const character = findCharacter(run, action.characterId);
  const target = action.targetId ? findCharacter(run, action.targetId) : null;
  const abandoned = action.status === 'abandoned';
  const outcomeClass = abandoned ? 'off' : OUTCOME_CLASS[action.outcome] || 'unknown';
  const outcomeLabel = abandoned ? '放下原举动' : OUTCOME_LABELS[action.outcome] || '未结算';
  const hasRoll = Boolean(action.roll);
  const roll = action.roll;
  const adjudication = beat.adjudications?.find((entry) => entry.actionId === action.id);

  const metaParts = [];
  if (action.category) metaParts.push(escapeHtml(action.category));
  if (roll) {
    metaParts.push(`${escapeHtml(ABILITY_LABELS[roll.ability] || roll.ability)} ${roll.abilityValue}`);
    if (roll.traitName) metaParts.push(`${escapeHtml(roll.traitName)} +${roll.traitBonus}`);
    metaParts.push(target ? `回应 ${escapeHtml(target.name)}` : `DC ${roll.dc ?? '—'}`);
    if (roll.penalty) metaParts.push(`<span class="neg">分心 ${roll.penalty}</span>`);
  }

  const deed = action.deed || action.description || '';
  const effect = action.effect || action.goalProgress || '';

  const detailBits = [];
  if (metaParts.length) detailBits.push(`<div class="act__meta">${metaParts.map((part) => `<span>${part}</span>`).join('')}</div>`);
  if (hasRoll) {
    detailBits.push(renderRollFormula(roll));
    if (adjudication) {
      detailBits.push(
        `<p class="act__adj"><b>裁定</b> ${target ? `预判 DC ${adjudication.dc}（对抗中改以目标回应总值结算）` : `DC ${adjudication.dc}`}${adjudication.modifier ? ` / 情境修正 ${adjudication.modifier > 0 ? '+' : ''}${adjudication.modifier}` : ''} · ${escapeHtml(adjudication.reason)}　<i>落空后果：${escapeHtml(adjudication.risk)}</i></p>`,
      );
    }
  }
  if (!hasRoll && !abandoned && action.outcomeNote) detailBits.push(`<p class="act__note">${escapeHtml(action.outcomeNote)}</p>`);
  if (action.outcomeNote && !abandoned && hasRoll) detailBits.push(`<p class="act__note">${escapeHtml(action.outcomeNote)}</p>`);
  if (state.godView && action.thought) {
    detailBits.push(`<div class="thought"><span>内心 · 只有本人知道</span>${escapeHtml(action.thought)}</div>`);
  }
  if (state.godView && action.goalProgress) {
    detailBits.push(`<p class="act__note">动机：${escapeHtml(action.goalProgress)}${action.stakes ? `｜风险：${escapeHtml(action.stakes)}` : ''}</p>`);
  }

  return `
  <article class="act ${abandoned ? 'act--off' : ''}">
    <div class="act__head">
      <button class="avatar-button" data-act="open-character" data-character="${attr(character?.id || action.characterId)}" title="查看人物">${avatar(character || action.characterId)}</button>
      <div class="act__who">
        <button class="link-button" data-act="open-character" data-character="${attr(character?.id || action.characterId)}">${escapeHtml(character?.name || action.characterId)}</button>
        ${target ? `<span class="act__target">→ ${escapeHtml(target.name)}</span>` : ''}
      </div>
      <p class="act__intent">${escapeHtml(action.summary)}</p>
      <div class="act__verdict">
        <span class="verdict verdict--${outcomeClass}">${escapeHtml(outcomeLabel)}</span>
      </div>
    </div>
    <div class="act__narrative">
      ${deed ? `<p class="act__desc">${escapeHtml(deed)}</p>` : ''}
      ${effect ? `<p class="act__effect">想要的效果：${escapeHtml(effect)}</p>` : ''}
      ${action.dialogue ? `<p class="act__quote">${escapeHtml(action.dialogue)}</p>` : ''}
    </div>
    ${abandoned && action.outcomeNote ? `<p class="act__offnote">${escapeHtml(action.outcomeNote)}</p>` : ''}
    ${detailBits.length ? `<details class="fold" data-key="${attr(`roll-${beat.id}-${action.id}`)}"><summary>机制</summary><div class="fold__body">${detailBits.join('')}</div></details>` : ''}
  </article>`;
}

/* ---- 回应行 ---- */

function reactionRow(run, beat, reaction) {
  const character = findCharacter(run, reaction.characterId);
  const incomingNames = reaction.incomingActionIds
    .map((id) => {
      const action = beat.actions.find((entry) => entry.id === id);
      return action ? characterName(run, action.characterId) : null;
    })
    .filter(Boolean);
  const roll = reaction.roll;
  const detailBits = [`<p class="act__context">回应 ${escapeHtml(incomingNames.join('、') || '压力')}｜${reaction.continueOriginal ? '继续原举动，承受分心惩罚' : '放下原举动，专心回应'}</p>`];
  if (reaction.description) detailBits.push(`<p class="act__desc">${escapeHtml(reaction.description)}</p>`);
  if (reaction.dialogue) detailBits.push(`<p class="act__quote">${escapeHtml(reaction.dialogue)}</p>`);
  if (roll) detailBits.push(renderRollFormula(roll));
  if (state.godView && reaction.thought) {
    detailBits.push(`<div class="thought"><span>内心</span>${escapeHtml(reaction.thought)}</div>`);
  }
  return `
  <article class="act act--reaction">
    <div class="act__head">
      <button class="avatar-button" data-act="open-character" data-character="${attr(reaction.characterId)}">${avatar(character || reaction.characterId, 'sm')}</button>
      <div class="act__who">
        <button class="link-button" data-act="open-character" data-character="${attr(reaction.characterId)}">${escapeHtml(character?.name || reaction.characterId)}</button>
      </div>
      <div class="act__verdict">
        <span class="verdict ${reaction.continueOriginal ? 'verdict--keep' : 'verdict--drop'}">${reaction.continueOriginal ? '继续原举动' : '放下原举动'}</span>
      </div>
    </div>
    ${reaction.stance ? `<div class="act__meta"><span>${escapeHtml(reaction.stance)}</span></div>` : ''}
    <details class="fold" data-key="${attr(`react-${beat.id}-${reaction.characterId}`)}"><summary>机制</summary><div class="fold__body">${detailBits.join('')}</div></details>
  </article>`;
}

/* ---- 世界事件 ---- */

function externalEventsHtml(beat) {
  const events = beat.externalEvents || [];
  if (!events.length) return '';
  return `
  <section class="ledger ledger--world">
    <header class="section-row"><h2>世界事件</h2><span>${events.length}</span></header>
    <div class="act-list">
      ${events
        .map(
          (event) => `<article class="act">
        <div class="act__head">
          <div class="act__who"><b>${escapeHtml(event.description)}</b></div>
          <div class="act__verdict"><span class="verdict ${event.success ? 'verdict--keep' : 'verdict--drop'}">${event.success ? '发生' : '未发生'}</span></div>
        </div>
        <div class="act__meta"><span>d20 ${event.natural} vs DC ${event.dc}</span>${event.success ? `<span>${escapeHtml(event.fact)}</span>` : '<span>这次没有发生</span>'}</div>
      </article>`,
        )
        .join('')}
    </div>
  </section>`;
}

/* ---- 余波 ---- */

function aftermathHtml(run, beat) {
  const changes = beat.stateChanges;
  if (!changes) return '';
  const items = [];
  for (const change of changes.characters) {
    const pieces = [];
    if (change.stressDelta) pieces.push(`紧张 ${change.stressDelta > 0 ? '+' : ''}${change.stressDelta}`);
    if (change.conditionsAdd.length) pieces.push(`状态：${change.conditionsAdd.map((condition) => condition.name).join('、')}`);
    if (change.conditionsRemove.length) pieces.push(`解除：${change.conditionsRemove.join('、')}`);
    if (change.inventoryAdd.length) pieces.push(`获得：${change.inventoryAdd.join('、')}`);
    if (change.inventoryRemove.length) pieces.push(`失去：${change.inventoryRemove.join('、')}`);
    if (pieces.length) {
      items.push(`<div class="wave__item"><b>${escapeHtml(characterName(run, change.characterId))}</b><span>${escapeHtml(pieces.join('；'))}</span></div>`);
    }
  }
  for (const fact of changes.world.factsAdd) {
    items.push(`<div class="wave__item"><span>新事实：${escapeHtml(fact)}</span></div>`);
  }
  const hasContent = items.length || (state.godView && beat.outcomeNotes.length) || beat.nextTimeJump;
  if (!hasContent) {
    return `<section class="wave"><p class="side-empty">这一刻没有可观测的状态改变。有些代价只会迟一点显形。</p></section>`;
  }
  return `
  <section class="wave">
    <header class="section-row"><h2>余波</h2></header>
    ${items.length ? `<div class="wave__list">${items.join('')}</div>` : ''}
    ${state.godView && beat.outcomeNotes.length
      ? `<details class="fold" data-key="backstage-${attr(beat.id)}"><summary>幕后注 <i>仅剧作家可见</i></summary><div class="fold__body">${beat.outcomeNotes.map((note) => `<p class="act__note"><b>${escapeHtml(characterName(run, note.characterId))}</b>：${escapeHtml(note.note)}</p>`).join('')}</div></details>`
      : ''}
    ${beat.nextTimeJump
      ? `<div class="wave__time">${icon('clock', 14)}<span><b>时间推进 ${beat.nextTimeJump.elapsedMinutes} 分钟 · ${escapeHtml(beat.nextTimeJump.label)}</b>${escapeHtml(beat.nextTimeJump.reason)}</span></div>`
      : ''}
  </section>`;
}

function endingHtml(run) {
  if (!run.ending) return '';
  return `
  <section class="ending">
    <span class="tag tag--gold">终章</span>
    <h2>${escapeHtml(run.ending.headline)}</h2>
    <div class="prose prose--ending">${paragraphHtml(run.ending.epilogue)}</div>
    ${run.ending.finalImage ? `<p class="ending__image">${escapeHtml(run.ending.finalImage)}</p>` : ''}
    <div class="ending__actions">
      <a class="btn btn--ghost btn--sm" href="/api/runs/${encodeURIComponent(run.id)}/export.md" download>${icon('download', 13)} 导出战报</a>
      <a class="btn btn--quiet btn--sm" href="#home">回到首页</a>
    </div>
  </section>`;
}

/* ---- 舞台 ---- */

function stageHtml(run, beat) {
  const viewingOld = state.selectedBeatId !== latestComplete(run)?.id;
  const showEnding = beat.ending || (run.ending && state.selectedBeatId === beat.id);
  return `
  <article class="stage">
    <header class="moment">
      <div class="moment__meta">
        <span class="moment__index">第 ${beat.index + 1} 刻</span>
        <span class="moment__clock">${escapeHtml(beat.clock.display)} · ${escapeHtml(beat.clock.dateLabel)}</span>
        ${beat.timeJump ? `<span class="moment__jump">${icon('clock', 12)} 推进 ${beat.timeJump.elapsedMinutes} 分钟</span>` : ''}
      </div>
      <h1 class="moment__title">${escapeHtml(beat.title)}</h1>
      <p class="moment__reason">${beat.timeJump ? escapeHtml(beat.timeJump.reason) : `开场 · ${escapeHtml(run.scenario.world.location)}`}</p>
      ${beat.pressure ? `<p class="moment__pressure">${icon('bolt', 12)} ${escapeHtml(beat.pressure)}</p>` : ''}
      ${beat.sceneQuestion ? `<p class="scene-question">${escapeHtml(beat.sceneQuestion)}</p>` : ''}
    </header>
    <div class="prose">${paragraphHtml(beat.narration || '（这一刻还空着。）')}</div>
    ${privateCuesHtml(run, beat)}
    ${viewingOld ? `<button class="text-link stage__latest" data-act="goto-latest">${icon('arrow', 13)} 回到最新一刻</button>` : ''}

    <section class="ledger">
      <header class="section-row"><h2>举动</h2><span>${beat.actions.length}</span></header>
      <div class="act-list">${beat.actions.map((action) => actionRow(run, beat, action)).join('')}</div>
    </section>

    ${beat.reactions.length
      ? `<section class="ledger">
          <header class="section-row"><h2>回应</h2><span>${beat.reactions.length}</span></header>
          <div class="act-list">${beat.reactions.map((reaction) => reactionRow(run, beat, reaction)).join('')}</div>
        </section>`
      : ''}
    ${externalEventsHtml(beat)}
    ${aftermathHtml(run, beat)}
    ${showEnding ? endingHtml(run) : ''}
  </article>`;
}

/* ---- 开场（还没有完整时刻） ---- */

function openingHtml(run) {
  const running = isRunning(run);
  const partial = currentPartial(run);
  const canStart = !state.health || state.health.hasApiKey;
  return `
  <article class="stage stage--opening">
    <div class="moment__meta">
      <span class="moment__clock">${icon('clock', 12)} ${escapeHtml(run.scenario.kicker)} · ${escapeHtml(run.scenario.world.startClock)}</span>
    </div>
    <h1 class="moment__title">${escapeHtml(run.scenario.title)}</h1>
    <p class="opening__sub">${escapeHtml(run.scenario.subtitle)}</p>
    <div class="prose prose--opening">${paragraphHtml(run.scenario.world.opening)}</div>
    <div class="opening__cta">
      ${running
        ? `<span class="status-pill status-pill--running"><span class="pulse"></span>导演正在布置第一刻</span>`
        : `<button class="btn btn--primary" data-act="advance-one" ${canStart ? '' : 'disabled'}>${icon('play', 14)} 推开第一幕</button>
           <button class="btn btn--ghost" data-act="advance-auto" ${canStart ? '' : 'disabled'}>${icon('arrow', 14)} 连续推演三刻</button>`}
    </div>
    <div class="opening__cast">
      ${run.scenario.characters
        .map(
          (character) => `<button class="cast-chip" data-act="open-character" data-character="${attr(character.id)}" title="查看人物">
            ${avatar(character, 'sm')}<span><b>${escapeHtml(character.name)}</b><i>${escapeHtml(character.title)}</i></span>
          </button>`,
        )
        .join('')}
    </div>
    ${partial ? privateCuesHtml(run, partial) : ''}
  </article>`;
}

/* ---- 侧栏 ---- */

function controlPanelHtml(run) {
  const active = isRunning(run);
  const completed = completeBeats(run).length;
  const atLimit = completed >= run.settings.maxBeats;
  const canStart = !state.health || state.health.hasApiKey;
  const progressActorStates = run.progress?.actorStates || {};
  const phaseLabel = state.pendingAdvance && !active ? '正在请求导演' : run.progress?.label || (active ? '导演正在工作' : '等待下一时刻');
  return `
  <section class="panel side-panel">
    <div class="side-panel__head"><h2>导演台</h2>${statusPill(active ? 'running' : run.status, runStatusLabel(run, active))}</div>
    <p class="side-panel__scene">${escapeHtml(run.world.sceneTitle || run.scenario.world.title)}</p>
    ${active || (run.status === 'running' && !state.stopRequested)
      ? `<div class="live">
          <div class="live__line"><span class="pulse"></span>${escapeHtml(phaseLabel)}</div>
          ${run.progress?.detail ? `<div class="live__detail">${escapeHtml(run.progress.detail)}</div>` : ''}
          ${Object.keys(progressActorStates).length
            ? `<div class="live__actors">${Object.entries(progressActorStates).map(([id, status]) => `<span class="chip chip--${status}">${escapeHtml(characterName(run, id))}${status === 'done' ? ' 已选' : status === 'fallback' ? ' 兜底' : ' 思考中'}</span>`).join('')}</div>`
            : ''}
        </div>`
      : ''}
    ${run.status === 'error' ? `<div class="side-error">${escapeHtml(run.error || '这一刻中断了。')}</div>` : ''}
    <div class="side-panel__actions">
      ${active
        ? `<button class="btn btn--ghost btn--wide" data-act="stop-run" ${state.stopRequested ? 'disabled' : ''}>${icon('pause', 13)} ${state.stopRequested ? '将在本刻后暂停' : '请求暂停'}</button>`
        : run.ending
          ? `<a class="btn btn--ghost btn--wide" href="/api/runs/${encodeURIComponent(run.id)}/export.md" download>${icon('download', 13)} 导出本场</a>`
          : `<button class="btn btn--primary" data-act="advance-one" ${canStart ? '' : 'disabled'}>${icon('play', 13)} ${run.status === 'error' ? '从断点重试' : '推进一刻'}</button>
             <button class="btn btn--secondary" data-act="advance-auto" ${canStart && !atLimit ? '' : 'disabled'} title="连续推演三刻">${icon('arrow', 13)} 连推三刻</button>`}
    </div>
    ${!run.ending && !active
      ? `<p class="side-note">${atLimit ? '已达到本场预设时刻上限。仍可单步继续，或新建一场。' : '每次推进是一个完整的时刻：取景、宣告、回应、落定。'}</p>`
      : ''}
    ${run.worldLink
      ? `<div class="side-world">
          <span>${icon('globe', 12)} 世界聚焦 · ${escapeHtml(run.worldLink.worldTitle)}</span>
          <div class="side-world__links">
            <a class="text-link" href="#world/${encodeURIComponent(run.worldLink.worldId)}">回到世界线</a>
            ${run.worldSceneSealed ? '<span class="side-dim">场景已收束</span>' : completed && !active ? `<button class="text-link" data-act="seal-run-scene" data-run="${attr(run.id)}" data-world="${attr(run.worldLink.worldId)}">${icon('check', 11)} 收束场景</button>` : ''}
          </div>
        </div>`
      : ''}
    <details class="side-fold" data-key="engine-fold">
      <summary>引擎记录 <i>${run.llm.calls} 次调用</i></summary>
      <div class="side-fold__body">
        <p>seed：<span class="mono">${escapeHtml(run.seed)}</span></p>
        <p>model：${escapeHtml(run.settings.model)} · thinking：${escapeHtml(run.settings.thinking)}</p>
        <p>tokens：${run.llm.totalTokens.toLocaleString('zh-CN')}（reasoning ${run.llm.reasoningTokens.toLocaleString('zh-CN')}）</p>
        <p><button class="text-link side-danger" data-act="confirm-delete">${icon('trash', 12)} 删除这一场</button></p>
      </div>
    </details>
  </section>`;
}

function castPanelHtml(run) {
  const latest = latestComplete(run);
  return `
  <section class="panel side-panel">
    <div class="side-panel__head"><h2>卡司</h2><span>${run.scenario.characters.length}</span></div>
    <div class="cast-list">
      ${run.scenario.characters
        .map((character) => {
          const runtime = run.characters[character.id];
          const stress = runtime?.stress ?? 0;
          const conditions = runtime?.conditions ?? [];
          const acting = latest?.actions.find((entry) => entry.characterId === character.id);
          return `<button class="cast-row" data-act="open-character" data-character="${attr(character.id)}">
            ${avatar(character, 'sm')}
            <span class="cast-row__body">
              <span class="cast-row__name">${escapeHtml(character.name)}${acting ? '' : '<i>未行动</i>'}</span>
              <span class="cast-row__title">${escapeHtml(character.title)}</span>
            </span>
            <span class="cast-row__stress" title="紧张 ${stress}/10">
              <span class="meter"><span style="width:${stress * 10}%"></span></span>
            </span>
            ${conditions.length ? `<span class="cast-row__cond">${conditions.slice(0, 2).map((condition) => `<em class="${condition.modifier > 0 ? 'is-boon' : ''}">${escapeHtml(condition.name)}</em>`).join('')}</span>` : ''}
          </button>`;
        })
        .join('')}
    </div>
  </section>`;
}

function factsPanelHtml(run) {
  const latest = latestComplete(run);
  const newFacts = new Set(latest?.stateChanges?.world?.factsAdd || []);
  const facts = run.world.publicFacts.slice(-9);
  return `
  <section class="panel side-panel">
    <div class="side-panel__head"><h2>已知事实</h2><span class="side-dim">公开记录</span></div>
    <div class="fact-list">
      ${facts.length
        ? facts.map((fact) => `<div class="fact ${newFacts.has(fact) ? 'fact--new' : ''}">${escapeHtml(fact)}</div>`).join('')
        : '<p class="side-empty">还没有公共事实被确认。</p>'}
    </div>
    ${run.world.flags && Object.keys(run.world.flags).length && state.godView
      ? `<details class="side-fold" data-key="world-flags"><summary>世界状态 flags</summary><div class="side-fold__body"><pre class="flags-pre">${escapeHtml(JSON.stringify(run.world.flags, null, 2))}</pre></div></details>`
      : ''}
  </section>`;
}

/* ---- 页面装配（区域渲染） ---- */

export function renderRunPage(options = {}) {
  const run = state.currentRun;
  if (!run) return;
  const beats = completeBeats(run);
  const selected = beats.find((beat) => beat.id === state.selectedBeatId) || latestComplete(run);
  if (selected) {
    state.selectedBeatId = selected.id;
    state.lastLatestBeatId = latestComplete(run)?.id || null;
  }
  const active = isRunning(run);

  const skeletonExists = Boolean(app.querySelector('[data-region="run-stage"]'));
  if (options.full || !skeletonExists) {
    setAppHtml(
      `<div data-region="run-topbar"></div>
      <main class="page run-page">
        <div class="run-grid">
          <div class="run-main">
            <div data-region="run-beatnav"></div>
            <div data-region="run-stage"></div>
          </div>
          <aside class="run-side" data-region="run-side"></aside>
        </div>
      </main>`,
      { scrollTop: Boolean(options.scrollTop) },
    );
  }

  const running = run.status === 'running' || active;
  setRegion(
    'run-topbar',
    topbarRun(run, active),
    [
      running ? 1 : 0,
      run.status,
      run.ending ? 1 : 0,
      state.stopRequested ? 1 : 0,
      state.godView ? 1 : 0,
      run.worldLink?.worldId || '',
    ].join('|'),
  );
  setRegion(
    'run-beatnav',
    beatNavHtml(run),
    [
      beats.map((beat) => beat.id).join(','),
      state.selectedBeatId,
      currentPartial(run)?.index ?? '-',
      running ? 1 : 0,
      run.progress?.label || '',
      run.progress?.detail || '',
    ].join('|'),
  );
  setRegion(
    'run-stage',
    selected ? stageHtml(run, selected) : openingHtml(run),
    [
      beats.length,
      state.selectedBeatId,
      state.godView ? 1 : 0,
      run.ending ? 1 : 0,
      running ? 1 : 0,
    ].join('|'),
  );
  setRegion(
    'run-side',
    `${controlPanelHtml(run)}${castPanelHtml(run)}${factsPanelHtml(run)}`,
    [
      run.updatedAt,
      running ? 1 : 0,
      state.stopRequested ? 1 : 0,
      state.pendingAdvance ? 1 : 0,
      state.godView ? 1 : 0,
      run.status,
      run.llm.calls,
      run.worldSceneSealed ? 1 : 0,
      run.progress?.label || '',
      run.progress?.detail || '',
      Object.keys(run.progress?.actorStates || {}).length,
    ].join('|'),
  );

  if (options.scrollToStage) {
    document.querySelector('[data-region="run-stage"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
