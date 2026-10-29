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
  isPlayRun,
  playRevealed,
  playAwaiting,
  playCharacter,
  playCharacterId,
  playHidesCharacter,
} from '../dom.js';
import { topbarContext } from './shell.js';

const ABILITY_KEYS = ['physique', 'agility', 'perception', 'intellect', 'will', 'presence'];
const ACTION_CATEGORIES = ['调查', '交涉', '行动', '战斗', '技术', '观察', '其他'];

/* ---- 扮演模式小工具 ---- */

function playerName(run) {
  return playCharacter(run)?.name || '你';
}

function resolvedAbility(character) {
  if (!character) return 'will';
  return [...ABILITY_KEYS].sort(
    (a, b) => (character.abilities?.[b] ?? 0) - (character.abilities?.[a] ?? 0),
  )[0];
}

function abilityRadiosHtml(character, name, selected) {
  const chosen = selected || resolvedAbility(character);
  return ABILITY_KEYS.map(
    (key) => `<label class="ability-choice ${chosen === key ? 'is-checked' : ''}">
      <input type="radio" name="${attr(name)}" value="${attr(key)}" ${chosen === key ? 'checked' : ''} />
      <span class="ability-choice__label">${escapeHtml(ABILITY_LABELS[key])}</span>
      <b>${character?.abilities?.[key] ?? 0}</b>
    </label>`,
  ).join('');
}

function traitOptionsHtml(character, selected = null) {
  const traits = character?.traits || [];
  const defaultAbility = resolvedAbility(character);
  return [
    `<option value="">不使用特质</option>`,
    ...traits.map((trait) => {
      const disabled = Boolean(trait.ability && trait.ability !== defaultAbility);
      return `<option value="${attr(trait.name)}" data-ability="${attr(trait.ability || '')}" ${trait.name === selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escapeHtml(trait.name)}（+${trait.bonus}${trait.ability ? ` · ${escapeHtml(ABILITY_LABELS[trait.ability] || trait.ability)}` : ' · 任意'}）</option>`;
    }),
  ].join('');
}

function targetOptionsHtml(run, playerId) {
  return [
    `<option value="">不对着某个人</option>`,
    ...run.scenario.characters
      .filter((character) => character.id !== playerId)
      .map(
        (character) =>
          `<option value="${attr(character.id)}">${escapeHtml(character.name)}（${escapeHtml(character.title)}${character.passive ? ' · 被动' : ''}）</option>`,
      ),
  ].join('');
}

function playSheetSummaryHtml(run) {
  const character = playCharacter(run);
  if (!character) return '';
  const runtime = run.characters?.[character.id];
  const conditions = (runtime?.conditions || [])
    .map(
      (condition) =>
        `<span class="play-state ${condition.modifier < 0 ? 'is-neg' : ''}">${escapeHtml(condition.name)} ${condition.modifier > 0 ? '+' : ''}${condition.modifier}</span>`,
    )
    .join('');
  return `<div class="play-sheet">
    <div class="play-sheet__stats">${ABILITY_KEYS.map((key) => `<span>${escapeHtml(ABILITY_LABELS[key])} <b>${character.abilities?.[key] ?? 0}</b></span>`).join('')}</div>
    <div class="play-sheet__line"><span>紧张 ${runtime?.stress ?? 0}/10</span>${conditions || '<span class="side-dim">没有异常状态</span>'}</div>
    <div class="play-sheet__line"><span>随身物</span><span class="side-dim">${(runtime?.inventory || []).map((item) => escapeHtml(item)).join('、') || '空无一物'}</span></div>
  </div>`;
}

/* ---- 顶栏 ---- */

function topbarRun(run, active) {
  const running = run.status === 'running' || active;
  const label = runStatusLabel(run, running);
  const worldLink = run.worldLink || null;
  const play = isPlayRun(run);
  const recapUnlocked = Boolean(play && run.play?.recapAt);
  const showWorldLink = Boolean(worldLink) && (!play || recapUnlocked);
  const awaiting = playAwaiting(run);
  const canGod = !play || recapUnlocked;
  const player = playCharacter(run);
  const recapReady = play && !recapUnlocked && Boolean(run.ending);
  const advanceButton = running
    ? `<button class="btn btn--ghost btn--sm" data-act="stop-run">${icon('pause', 13)} ${state.stopRequested ? '将在本刻后暂停' : '请求暂停'}</button>`
    : recapReady
      ? `<button class="btn btn--primary btn--sm" data-act="confirm-recap">${icon('eye', 12)} 打开复盘</button>`
      : run.ending || recapUnlocked
        ? ''
        : awaiting
          ? `<button class="btn btn--primary btn--sm" data-act="focus-play-form">${icon('play', 12)} ${awaiting === 'reaction' ? '去回应' : '去宣告'}</button>`
          : `<button class="btn btn--primary btn--sm" data-act="advance-one" ${state.health && !state.health.hasApiKey ? 'disabled' : ''}>${icon('play', 12)} 推进一刻</button>`;
  const actions = `
    ${play ? `<span class="play-identity" title="你在这场里扮演的角色">${avatar(player || playerName(run), 'sm')}<span>${recapUnlocked ? '复盘' : '扮演'} · ${escapeHtml(player?.name || playerName(run))}</span></span>` : ''}
    ${statusPill(awaiting ? 'awaiting' : running ? 'running' : run.status, label)}
    ${canGod ? `<button class="btn btn--quiet btn--hide-mobile ${state.godView ? 'is-active' : ''}" data-act="toggle-god" title="显示角色内心与私密线索">${icon('eye', 14)}<span class="btn__text">${state.godView ? '全知视角' : '剧作家视角'}</span></button>` : ''}
    <button class="btn btn--quiet btn--hide-mobile" data-act="open-rules" title="推演规则">${icon('book', 14)}<span class="btn__text">规则</span></button>
    ${advanceButton}
    ${recapUnlocked || (!play && run.ending)
      ? `<a class="btn btn--ghost btn--sm" href="/api/runs/${encodeURIComponent(run.id)}/export.md" download>${icon('download', 13)} 导出战报</a>`
      : play
        ? ''
        : `<a class="btn btn--quiet btn--icon" href="/api/runs/${encodeURIComponent(run.id)}/export.md" download title="导出战报" aria-label="导出战报">${icon('download', 15)}</a>`}`;
  return topbarContext({
    backHref: showWorldLink ? `#world/${encodeURIComponent(worldLink.worldId)}` : '#home',
    backLabel: showWorldLink ? '回到世界线' : '回到首页',
    kicker: showWorldLink
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
  const awaiting = playAwaiting(run);
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
      ${partial ? `<span class="beat-chip beat-chip--live"><span class="pulse"></span>${awaiting ? `轮到你${awaiting === 'reaction' ? '回应' : '行动'}` : `第 ${partial.index + 1} 刻`}</span>` : ''}
      <span class="beatnav__count">${beats.length} / ${run.settings.maxBeats} 刻</span>
    </div>
    ${partial && running ? `<div class="beatnav__live"><span class="pulse"></span>${escapeHtml(run.progress?.label || '导演正在工作')}${run.progress?.detail ? `<i>${escapeHtml(run.progress.detail)}</i>` : ''}</div>` : ''}
    ${partial && awaiting && !running ? `<div class="beatnav__live"><span class="pulse"></span>${awaiting === 'reaction' ? '有敌意举动指向你，等你回应' : '等你宣告这一刻的举动'}<i>其他人的选择在落定前不可见。</i></div>` : ''}
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

function actionRow(run, beat, action, options = {}) {
  const showThought = options.showThought ?? state.godView;
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
      const reason = adjudication.reason
        ? ` · ${escapeHtml(adjudication.reason)}`
        : '';
      const risk = adjudication.risk
        ? `　<i>落空后果：${escapeHtml(adjudication.risk)}</i>`
        : '';
      detailBits.push(
        `<p class="act__adj"><b>裁定</b> ${target ? `预判 DC ${adjudication.dc}（对抗中改以目标回应总值结算）` : `DC ${adjudication.dc}`}${adjudication.modifier ? ` / 情境修正 ${adjudication.modifier > 0 ? '+' : ''}${adjudication.modifier}` : ''}${reason}${risk}</p>`,
      );
    }
  }
  if (!hasRoll && !abandoned && action.outcomeNote) detailBits.push(`<p class="act__note">${escapeHtml(action.outcomeNote)}</p>`);
  if (action.outcomeNote && !abandoned && hasRoll) detailBits.push(`<p class="act__note">${escapeHtml(action.outcomeNote)}</p>`);
  if (showThought && action.thought) {
    detailBits.push(`<div class="thought"><span>内心 · 只有本人知道</span>${escapeHtml(action.thought)}</div>`);
  }
  if (showThought && action.goalProgress) {
    detailBits.push(`<p class="act__note">动机：${escapeHtml(action.goalProgress)}${action.stakes ? `｜风险：${escapeHtml(action.stakes)}` : ''}</p>`);
  } else if (showThought && action.stakes) {
    detailBits.push(`<p class="act__note">风险：${escapeHtml(action.stakes)}</p>`);
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

function reactionRow(run, beat, reaction, options = {}) {
  const showThought = options.showThought ?? state.godView;
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
  if (showThought && reaction.thought) {
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

/* ---- 扮演模式：玩家视角 ---- */

function observedActionCard(run, action) {
  const character = findCharacter(run, action.characterId);
  const target = action.targetId ? findCharacter(run, action.targetId) : null;
  return `<article class="act act--observed">
    <div class="act__head">
      <button class="avatar-button" data-act="open-character" data-character="${attr(character?.id || action.characterId)}" title="查看人物">${avatar(character || action.characterId, 'sm')}</button>
      <div class="act__who">
        <button class="link-button" data-act="open-character" data-character="${attr(character?.id || action.characterId)}">${escapeHtml(character?.name || action.characterId)}</button>
        ${target ? `<span class="act__target">→ ${escapeHtml(target.name)}</span>` : ''}
      </div>
      <span class="observed-tag">你看见的</span>
    </div>
    <p class="act__desc">${escapeHtml(action.deed || action.description || '')}</p>
    ${action.dialogue ? `<p class="act__quote">${escapeHtml(action.dialogue)}</p>` : ''}
  </article>`;
}

function observedReactionCard(run, reaction) {
  const character = findCharacter(run, reaction.characterId);
  return `<article class="act act--observed act--reaction">
    <div class="act__head">
      <button class="avatar-button" data-act="open-character" data-character="${attr(reaction.characterId)}">${avatar(character || reaction.characterId, 'sm')}</button>
      <div class="act__who">
        <button class="link-button" data-act="open-character" data-character="${attr(reaction.characterId)}">${escapeHtml(character?.name || reaction.characterId)}</button>
        ${reaction.stance ? `<span class="act__target">${escapeHtml(reaction.stance)}</span>` : ''}
      </div>
      <span class="observed-tag">你看见的</span>
    </div>
    ${reaction.description ? `<p class="act__desc">${escapeHtml(reaction.description)}</p>` : ''}
    ${reaction.dialogue ? `<p class="act__quote">${escapeHtml(reaction.dialogue)}</p>` : ''}
  </article>`;
}

function playExternalEventsHtml(beat) {
  const events = (beat.externalEvents || []).filter((event) => event.success);
  if (!events.length) return '';
  return `<section class="ledger ledger--world">
    <header class="section-row"><h2>世界发生了什么</h2><span>${events.length}</span></header>
    <div class="act-list">
      ${events
        .map(
          (event) => `<article class="act act--observed">
        <div class="act__head"><div class="act__who"><b>${escapeHtml(event.description)}</b></div><span class="observed-tag">客观发生</span></div>
        ${event.fact ? `<p class="act__desc">${escapeHtml(event.fact)}</p>` : ''}
      </article>`,
        )
        .join('')}
    </div>
  </section>`;
}

function playAftermathHtml(run, beat) {
  const changes = beat.stateChanges;
  if (!changes) return '';
  const playerId = playCharacterId(run);
  const own = changes.characters.find((change) => change.characterId === playerId);
  const observed = [];
  for (const change of changes.characters) {
    if (change.characterId === playerId) continue;
    for (const condition of change.conditionsAdd || []) {
      observed.push(
        `<div class="wave__item"><b>${escapeHtml(characterName(run, change.characterId))}</b><span>你注意到：${escapeHtml(condition.name)}</span></div>`,
      );
    }
  }
  const items = [];
  if (own) {
    const pieces = [];
    if (own.stressDelta) pieces.push(`紧张 ${own.stressDelta > 0 ? '+' : ''}${own.stressDelta}`);
    if (own.conditionsAdd.length) pieces.push(`状态：${own.conditionsAdd.map((condition) => condition.name).join('、')}`);
    if (own.conditionsRemove.length) pieces.push(`解除：${own.conditionsRemove.join('、')}`);
    if (own.inventoryAdd.length) pieces.push(`获得：${own.inventoryAdd.join('、')}`);
    if (own.inventoryRemove.length) pieces.push(`失去：${own.inventoryRemove.join('、')}`);
    if (pieces.length) {
      items.push(`<div class="wave__item wave__item--own"><b>你</b><span>${escapeHtml(pieces.join('；'))}</span></div>`);
    }
  }
  for (const fact of changes.world.factsAdd || []) {
    items.push(`<div class="wave__item"><span>新事实：${escapeHtml(fact)}</span></div>`);
  }
  items.push(...observed);
  if (!items.length && !beat.nextTimeJump) {
    return `<section class="wave"><p class="side-empty">这一刻没有可观测的状态改变。有些代价只会迟一点显形。</p></section>`;
  }
  return `<section class="wave">
    <header class="section-row"><h2>余波</h2></header>
    ${items.length ? `<div class="wave__list">${items.join('')}</div>` : ''}
    ${beat.nextTimeJump ? `<div class="wave__time">${icon('clock', 14)}<span><b>时间推进 ${beat.nextTimeJump.elapsedMinutes} 分钟 · ${escapeHtml(beat.nextTimeJump.label)}</b>${escapeHtml(beat.nextTimeJump.reason)}</span></div>` : ''}
  </section>`;
}

function recapBannerHtml(run) {
  if (!isPlayRun(run) || !playRevealed(run)) return '';
  return `<section class="recap-banner">
    <div class="recap-banner__head"><span class="tag tag--gold">复盘模式</span><b>全部幕后信息已解锁</b></div>
    <p>你现在能看到所有人的秘密、内心、effect、检定与导演幕后注。本场已经结束。</p>
    <button class="btn btn--ghost btn--sm" data-act="open-recap">${icon('eye', 13)} 打开完整复盘</button>
  </section>`;
}

function playRecapCtaHtml(run) {
  if (!isPlayRun(run) || playRevealed(run)) return '';
  return `<section class="play-recap-cta">
    <h3>${run.ending ? '故事已经收束。' : '此刻可以落幕。'}</h3>
    <p>复盘会公开全部幕后信息：所有人的秘密、欲望、内心、effect 与检定结果。复盘之后本场结束，不能继续推进。</p>
    <button class="btn btn--secondary btn--sm" data-act="confirm-recap">${icon('eye', 13)} ${run.ending ? '打开复盘' : '结束本场并复盘'}</button>
  </section>`;
}

function playEndingHtml(run) {
  if (!run.ending) return '';
  return `<section class="ending">
    <span class="tag tag--gold">终章</span>
    <h2>${escapeHtml(run.ending.headline)}</h2>
    <div class="prose prose--ending">${paragraphHtml(run.ending.epilogue)}</div>
    ${run.ending.finalImage ? `<p class="ending__image">${escapeHtml(run.ending.finalImage)}</p>` : ''}
    ${playRecapCtaHtml(run)}
  </section>`;
}

function playBriefHtml(run, beat) {
  const cues = (beat.privateCues || []).filter(
    (cue) => cue.characterId === playCharacterId(run),
  );
  const facts = (run.world.publicFacts || []).slice(-8);
  return `<div class="play-brief">
    <div class="play-brief__block">
      <h3>此刻你能感知到的</h3>
      <div class="prose prose--brief">${paragraphHtml(beat.publicBrief || '（这一刻还没有公开的处境。）')}</div>
    </div>
    ${cues.length
      ? `<div class="cue cue--own"><span>只有你此刻注意到的</span>${cues.map((cue) => `<p>${escapeHtml(cue.cue)}</p>`).join('')}</div>`
      : ''}
    ${facts.length
      ? `<details class="fold fold--facts" data-key="play-facts-${attr(beat.id)}"><summary>你能确认的公开事实 <i>${facts.length}</i></summary><div class="fold__body">${facts.map((fact) => `<p class="fact">${escapeHtml(fact)}</p>`).join('')}</div></details>`
      : ''}
  </div>`;
}

function playActionFormHtml(run) {
  const character = playCharacter(run);
  return `<form class="play-form" id="play-action-form" autocomplete="off">
    <div class="play-form__head">
      <span class="tag tag--gold">轮到你行动</span>
      <h3>${escapeHtml(character?.name || '你')}，这一刻你做什么？</h3>
      <p>deed 是旁人能看见的动作或台词；effect 是你希望它达成什么。检定只决定 effect 是否落地，deed 仍会发生。</p>
    </div>
    <div class="form-field">
      <label for="play-deed">你做了什么 <span>必填 · 1–3 句，现在时</span></label>
      <textarea id="play-deed" class="textarea" rows="4" maxlength="1200" placeholder="例如：我把茶杯放回桌面，指尖停在杯沿上，问她昨晚到底去了哪里。"></textarea>
    </div>
    <div class="form-field">
      <label for="play-effect">你想要的效果 <span>必填 · 它不一定发生</span></label>
      <textarea id="play-effect" class="textarea" rows="2" maxlength="600" placeholder="例如：让她在其他人面前给出一个无法收回的答案。"></textarea>
    </div>
    <div class="play-form__grid">
      <div class="form-field">
        <label for="play-summary">举动标题 <span>留空则截取第一句</span></label>
        <input id="play-summary" class="input" type="text" maxlength="40" placeholder="例如：把问题放回桌面" />
      </div>
      <div class="form-field">
        <label for="play-category">分类</label>
        <select id="play-category" class="select">${ACTION_CATEGORIES.map((category) => `<option value="${attr(category)}" ${category === '其他' ? 'selected' : ''}>${escapeHtml(category)}</option>`).join('')}</select>
      </div>
      <div class="form-field">
        <label for="play-target">指向谁 <span>可选</span></label>
        <select id="play-target" class="select">${targetOptionsHtml(run, character?.id)}</select>
      </div>
      <div class="form-field">
        <label>主要依靠 <span>六项能力</span></label>
        <div class="ability-picker">${abilityRadiosHtml(character, 'play-ability')}</div>
      </div>
      <div class="form-field">
        <label for="play-trait">使用特质 <span>可不用</span></label>
        <select id="play-trait" class="select">${traitOptionsHtml(character)}</select>
      </div>
      <div class="form-field">
        <label for="play-stakes">代价与风险 <span>可选</span></label>
        <input id="play-stakes" class="input" type="text" maxlength="600" placeholder="如果效果落空，你最可能失去什么？" />
      </div>
    </div>
    <div class="form-field">
      <label for="play-dialogue">说出口的话 <span>可选 · 会被所有人听见</span></label>
      <textarea id="play-dialogue" class="textarea" rows="2" maxlength="1200" placeholder="“……”"></textarea>
    </div>
    <div class="form-field">
      <label for="play-thought">内心盘算 <span>可选 · 只有你知道，复盘时公开</span></label>
      <textarea id="play-thought" class="textarea" rows="2" maxlength="1200" placeholder="你真正在盘算什么？"></textarea>
    </div>
    <label class="check-row" for="play-hostile">
      <input type="checkbox" id="play-hostile" />
      <span><b>这是敌意举动</b>：强迫、伤害、夺取、逼到角落或欺骗。只有指向某个角色时才触发对方的回应机会。请求、坦白、关心和谈判不是敌意。</span>
    </label>
    <p class="play-form__privacy">${icon('eye', 12)} 你写下的内容只按规则进入引擎：deed、台词与公开后果会出现在叙事里；effect 只用来判断结果；thought 只属于你。</p>
    <div class="play-form__actions">
      <button class="btn btn--primary" data-act="submit-play-action">宣告这一刻的举动</button>
      <span class="side-dim">其余角色会在你宣告之后各自行动。你看不见他们的选择。Ctrl / ⌘ + Enter 也可以交表。</span>
    </div>
  </form>`;
}

function playReactionFormHtml(run, beat) {
  const character = playCharacter(run);
  const playerId = character?.id;
  const incoming = (beat.actions || []).filter(
    (action) => action.characterId !== playerId && action.targetId === playerId,
  );
  const ownAction = (beat.actions || []).find((action) => action.characterId === playerId);
  const incomingHtml = incoming
    .map((action) => {
      const actor = findCharacter(run, action.characterId);
      return `<article class="act act--incoming">
      <div class="act__head">
        ${avatar(actor || action.characterId, 'sm')}
        <div class="act__who"><b>${escapeHtml(actor?.name || action.characterId)}</b>${actor ? `<span class="act__target">${escapeHtml(actor.title)}</span>` : ''}</div>
        <span class="verdict verdict--softfail">冲着你来</span>
      </div>
      <p class="act__desc">${escapeHtml(action.deed || action.description || '')}</p>
      ${action.effect ? `<p class="act__effect">他想要的效果：${escapeHtml(action.effect)}</p>` : ''}
      ${action.dialogue ? `<p class="act__quote">${escapeHtml(action.dialogue)}</p>` : ''}
    </article>`;
    })
    .join('');
  return `<form class="play-form" id="play-reaction-form" autocomplete="off">
    <div class="play-form__head">
      <span class="tag tag--gold">轮到你回应</span>
      <h3>有人把敌意递到你面前</h3>
      <p>你只有一次回应，用来接住所有指向你的压力。回应只掷一次；若同时有多人向你施压，每多一人再 −1。</p>
    </div>
    ${incomingHtml || '<p class="side-empty">（这一轮没有指向你的敌意举动。刷新看看。）</p>'}
    <fieldset class="play-choice-group">
      <legend>你原本这一刻要做的事</legend>
      <p class="play-original">${ownAction ? `<b>${escapeHtml(ownAction.deed || ownAction.description || '')}</b>${ownAction.dialogue ? `<span class="act__quote">${escapeHtml(ownAction.dialogue)}</span>` : ''}` : '（你这一刻没有原本的举动。）'}</p>
      <label class="check-row"><input type="radio" name="play-continue" value="continue" checked />
        <span><b>继续原举动</b>，同时回应。两件事都承受 −2 分心。</span></label>
      <label class="check-row"><input type="radio" name="play-continue" value="abandon" />
        <span><b>放下原举动</b>，专心回应。原本的举动不会发生，回应不再受分心惩罚。</span></label>
    </fieldset>
    <div class="form-field">
      <label for="play-reaction-description">你如何回应 <span>必填 · 1–3 句</span></label>
      <textarea id="play-reaction-description" class="textarea" rows="3" maxlength="1200" placeholder="例如：我没有松手，反而把信按得更紧，正面迎上他的目光。"></textarea>
    </div>
    <div class="play-form__grid">
      <div class="form-field">
        <label for="play-reaction-summary">回应标题 <span>留空则截取第一句</span></label>
        <input id="play-reaction-summary" class="input" type="text" maxlength="40" placeholder="例如：不退" />
      </div>
      <div class="form-field">
        <label for="play-reaction-stance">回应姿态 <span>2–6 字</span></label>
        <input id="play-reaction-stance" class="input" type="text" maxlength="12" placeholder="接住／挡回／岔开／退半步" />
      </div>
      <div class="form-field">
        <label>主要依靠 <span>六项能力</span></label>
        <div class="ability-picker">${abilityRadiosHtml(character, 'play-reaction-ability')}</div>
      </div>
      <div class="form-field">
        <label for="play-reaction-trait">使用特质 <span>可不用</span></label>
        <select id="play-reaction-trait" class="select">${traitOptionsHtml(character)}</select>
      </div>
    </div>
    <div class="form-field">
      <label for="play-reaction-dialogue">说出口的话 <span>可选</span></label>
      <textarea id="play-reaction-dialogue" class="textarea" rows="2" maxlength="1200"></textarea>
    </div>
    <div class="form-field">
      <label for="play-reaction-thought">内心盘算 <span>只有你知道，复盘时公开</span></label>
      <textarea id="play-reaction-thought" class="textarea" rows="2" maxlength="1200"></textarea>
    </div>
    <div class="play-form__actions">
      <button class="btn btn--primary" data-act="submit-play-reaction">做出回应</button>
      <span class="side-dim">回应不需要掷骰以外的额外宣告；骰点由引擎在你提交后落下。Ctrl / ⌘ + Enter 也可以交表。</span>
    </div>
  </form>`;
}

function momentHeaderHtml(run, beat, reasonFallback = '') {
  return `<header class="moment">
    <div class="moment__meta">
      <span class="moment__index">第 ${beat.index + 1} 刻</span>
      <span class="moment__clock">${escapeHtml(beat.clock.display)} · ${escapeHtml(beat.clock.dateLabel)}</span>
      ${beat.timeJump ? `<span class="moment__jump">${icon('clock', 12)} 推进 ${beat.timeJump.elapsedMinutes} 分钟</span>` : ''}
    </div>
    <h1 class="moment__title">${escapeHtml(beat.title || '未命名的时刻')}</h1>
    <p class="moment__reason">${beat.timeJump ? escapeHtml(beat.timeJump.reason) : escapeHtml(reasonFallback || `开场 · ${run.scenario.world.location}`)}</p>
    ${beat.pressure ? `<p class="moment__pressure">${icon('bolt', 12)} ${escapeHtml(beat.pressure)}</p>` : ''}
    ${beat.sceneQuestion ? `<p class="scene-question">${escapeHtml(beat.sceneQuestion)}</p>` : ''}
  </header>`;
}

function playWaitStageHtml(run, beat, kind) {
  const character = playCharacter(run);
  return `<article class="stage stage--play">
    ${momentHeaderHtml(run, beat)}
    <section class="play-turn">
      <div class="play-turn__head">
        <span class="tag tag--gold">${kind === 'reaction' ? '轮到你回应' : '轮到你行动'}</span>
        <h2>你是 ${escapeHtml(character?.name || '你')}</h2>
        <p>${escapeHtml(character?.title || '')}</p>
      </div>
      ${playBriefHtml(run, beat)}
      <details class="fold play-sheet-fold" data-key="play-sheet-${attr(beat.id)}">
        <summary>你的角色卡速览 <i>能力 / 状态 / 随身物</i></summary>
        <div class="fold__body">
          ${playSheetSummaryHtml(run)}
          <button class="text-link" data-act="open-character" data-character="${attr(character?.id || '')}">打开完整角色卡 →</button>
        </div>
      </details>
      ${kind === 'reaction' ? playReactionFormHtml(run, beat) : playActionFormHtml(run)}
    </section>
  </article>`;
}

function playRunningStageHtml(run, beat) {
  const character = playCharacter(run);
  const ownAction = (beat.actions || []).find((action) => action.characterId === character?.id);
  return `<article class="stage stage--play">
    ${momentHeaderHtml(run, beat)}
    ${playBriefHtml(run, beat)}
    ${ownAction
      ? `<section class="ledger"><header class="section-row"><h2>你已经宣告</h2></header><div class="act-list">${actionRow(run, beat, ownAction, { showThought: true })}</div></section>`
      : ''}
    <div class="play-waiting">
      <span class="pulse"></span>
      <div>
        <b>${escapeHtml(run.progress?.label || '其他人正在行动')}</b>
        ${run.progress?.detail ? `<span>${escapeHtml(run.progress.detail)}</span>` : ''}
        <i>你只能看着此刻继续；其他人的选择会在落定后以可感知的方式出现。</i>
      </div>
    </div>
  </article>`;
}

function playStageHtml(run, beat, options = {}) {
  const playerId = playCharacterId(run);
  const ownAction = (beat.actions || []).find((action) => action.characterId === playerId);
  const ownReaction = (beat.reactions || []).find((reaction) => reaction.characterId === playerId);
  const observedActions = (beat.actions || []).filter(
    (action) => action.characterId !== playerId && action.status !== 'abandoned',
  );
  const observedReactions = (beat.reactions || []).filter(
    (reaction) => reaction.characterId !== playerId,
  );
  const ownCues = (beat.privateCues || []).filter((cue) => cue.characterId === playerId);
  const awaiting = options.awaiting || null;
  return `<article class="stage stage--play">
    ${options.viewingOld && awaiting
      ? `<button class="play-return text-link" data-act="goto-play-now">${icon('arrow', 13)} 轮到你${awaiting === 'reaction' ? '回应' : '行动'} · 回到此刻</button>`
      : ''}
    ${momentHeaderHtml(run, beat)}
    <div class="prose">${paragraphHtml(beat.narration || '（这一刻还空着。）')}</div>
    ${ownCues.length
      ? `<details class="fold fold--own-cue" data-key="own-cue-${attr(beat.id)}">
          <summary>${icon('eye', 13)} 你此刻注意到的 <i>只有你知道</i></summary>
          <div class="fold__body">${ownCues.map((cue) => `<div class="cue cue--own"><span>你的私密线索</span><p>${escapeHtml(cue.cue)}</p></div>`).join('')}</div>
        </details>`
      : ''}
    ${ownAction
      ? `<section class="ledger">
          <header class="section-row"><h2>你的举动</h2><span>${escapeHtml(playerName(run))}</span></header>
          <div class="act-list">${actionRow(run, beat, ownAction, { showThought: true })}</div>
        </section>`
      : ''}
    ${ownReaction
      ? `<section class="ledger">
          <header class="section-row"><h2>你的回应</h2><span>${escapeHtml(playerName(run))}</span></header>
          <div class="act-list">${reactionRow(run, beat, ownReaction, { showThought: true })}</div>
        </section>`
      : ''}
    ${observedActions.length || observedReactions.length
      ? `<section class="ledger ledger--observed">
          <header class="section-row"><h2>你看见的</h2><span>旁人可感知的部分</span></header>
          <p class="observed-note">你只知道他们做了什么、说了什么。他们想要的效果、内心与检定不在你的可知范围内。</p>
          <div class="act-list">
            ${observedActions.map((action) => observedActionCard(run, action)).join('')}
            ${observedReactions.map((reaction) => observedReactionCard(run, reaction)).join('')}
          </div>
        </section>`
      : ''}
    ${playExternalEventsHtml(beat)}
    ${playAftermathHtml(run, beat)}
    ${beat.ending ? playEndingHtml(run) : ''}
    ${!beat.ending && beat === latestComplete(run) && run.ending ? playEndingHtml(run) : ''}
  </article>`;
}

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
    ${recapBannerHtml(run)}
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
  const play = isPlayRun(run) && !playRevealed(run);
  const character = play ? playCharacter(run) : null;
  return `
  <article class="stage stage--opening">
    <div class="moment__meta">
      <span class="moment__clock">${icon('clock', 12)} ${escapeHtml(run.scenario.kicker)} · ${escapeHtml(run.scenario.world.startClock)}</span>
    </div>
    <h1 class="moment__title">${escapeHtml(run.scenario.title)}</h1>
    <p class="opening__sub">${escapeHtml(run.scenario.subtitle)}</p>
    ${play && character
      ? `<section class="play-cast-banner">
          ${avatar(character, 'lg')}
          <div>
            <span class="tag tag--gold">扮演模式</span>
            <h2>你是 ${escapeHtml(character.name)}</h2>
            <p>${escapeHtml(character.title)}｜${escapeHtml(character.publicProfile)}</p>
            <p class="play-cast-banner__note">${icon('eye', 12)} 你只会看到${escapeHtml(character.name)}能感知到的信息。故事结束后复盘，才会公开所有人的秘密、内心与检定。</p>
          </div>
        </section>`
      : ''}
    <div class="prose prose--opening">${paragraphHtml(run.scenario.world.opening)}</div>
    <div class="opening__cta">
      ${running
        ? `<span class="status-pill status-pill--running"><span class="pulse"></span>导演正在布置第一刻</span>`
        : `<button class="btn btn--primary" data-act="advance-one" ${canStart ? '' : 'disabled'}>${icon('play', 14)} ${play && character ? `以 ${escapeHtml(character.name)} 的身份推开第一幕` : '推开第一幕'}</button>
           ${play ? '' : `<button class="btn btn--ghost" data-act="advance-auto" ${canStart ? '' : 'disabled'}>${icon('arrow', 14)} 连续推演三刻</button>`}`}
    </div>
    <div class="opening__cast">
      ${run.scenario.characters
        .map(
          (character) => `<button class="cast-chip" data-act="open-character" data-character="${attr(character.id)}" title="查看人物">
            ${avatar(character, 'sm')}<span><b>${escapeHtml(character.name)}</b><i>${escapeHtml(character.title)}${character.id === playCharacterId(run) ? ' · 你' : ''}</i></span>
          </button>`,
        )
        .join('')}
    </div>
    ${partial ? privateCuesHtml(run, partial) : ''}
    ${!play ? recapBannerHtml(run) : ''}
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
  const play = isPlayRun(run);
  const recapUnlocked = Boolean(play && run.play?.recapAt);
  const awaiting = playAwaiting(run);
  const player = playCharacter(run);
  const activeAction = active
    ? `<button class="btn btn--ghost btn--wide" data-act="stop-run" ${state.stopRequested ? 'disabled' : ''}>${icon('pause', 13)} ${state.stopRequested ? '将在本刻后暂停' : '请求暂停'}</button>`
    : '';
  const playEndedAction = `<a class="btn btn--ghost btn--wide" href="/api/runs/${encodeURIComponent(run.id)}/export.md" download>${icon('download', 13)} 导出本场</a>`;
  const advanceAction = `<button class="btn btn--primary" data-act="advance-one" ${canStart ? '' : 'disabled'}>${icon('play', 13)} ${run.status === 'error' ? '从断点重试' : '推进一刻'}</button>`;
  const autoAction = `<button class="btn btn--secondary" data-act="advance-auto" ${canStart && !atLimit ? '' : 'disabled'} title="连续推演三刻">${icon('arrow', 13)} 连推三刻</button>`;
  const availableAction = awaiting
    ? `<button class="btn btn--primary btn--wide" data-act="focus-play-form">${icon('play', 13)} 轮到你${awaiting === 'reaction' ? '回应' : '宣告'}</button>`
    : play
      ? recapUnlocked
        ? `<button class="btn btn--ghost btn--wide" data-act="open-recap">${icon('eye', 13)} 打开完整复盘</button>
           ${playEndedAction}`
        : run.ending
          ? `<button class="btn btn--primary" data-act="confirm-recap">${icon('eye', 13)} 打开复盘</button>`
          : `${advanceAction}`
      : run.ending
        ? playEndedAction
        : `${advanceAction}${autoAction}`;
  const recapAction =
    play && !recapUnlocked && !active && !awaiting && !run.ending && completed > 0
      ? `<button class="btn btn--quiet btn--wide" data-act="confirm-recap">${icon('eye', 12)} 结束本场并复盘</button>`
      : '';
  return `
  <section class="panel side-panel">
    <div class="side-panel__head"><h2>${play ? '你的这一刻' : '导演台'}</h2>${statusPill(awaiting ? 'awaiting' : active ? 'running' : run.status, runStatusLabel(run, active))}</div>
    ${play && player
      ? `<div class="play-side-identity">${avatar(player, 'sm')}<span><b>${escapeHtml(player.name)}</b><i>${recapUnlocked ? '本场已复盘' : '你的角色'}</i></span></div>`
      : ''}
    <p class="side-panel__scene">${escapeHtml(run.world.sceneTitle || run.scenario.world.title)}</p>
    ${awaiting
      ? `<div class="play-turn-hint"><span class="tag tag--gold">轮到你</span><p>${awaiting === 'reaction' ? '有敌意举动指向你。完成回应后，骰子才会落下。' : '宣告你的 deed 与 effect。其他角色的选择在落定前对你不可见。'}</p></div>`
      : ''}
    ${active || (run.status === 'running' && !state.stopRequested)
      ? `<div class="live">
          <div class="live__line"><span class="pulse"></span>${escapeHtml(phaseLabel)}</div>
          ${run.progress?.detail ? `<div class="live__detail">${escapeHtml(run.progress.detail)}</div>` : ''}
          ${Object.keys(progressActorStates).length
            ? `<div class="live__actors">${Object.entries(progressActorStates).map(([id, status]) => `<span class="chip chip--${status}">${escapeHtml(characterName(run, id))}${status === 'done' ? ' 已选' : status === 'fallback' ? ' 兜底' : id === playCharacterId(run) ? ' 等你' : ' 思考中'}</span>`).join('')}</div>`
            : ''}
        </div>`
      : ''}
    ${run.status === 'error' ? `<div class="side-error">${escapeHtml(run.error || '这一刻中断了。')}</div>` : ''}
    <div class="side-panel__actions">
      ${active ? activeAction : availableAction}
      ${recapAction}
    </div>
    ${!run.ending && !active && !awaiting
      ? `<p class="side-note">${play
          ? (atLimit ? '已达到本场预设时刻上限。仍可继续，或结束本场并复盘。' : '每次推进是一个完整的时刻：取景、宣告、回应、落定。其他角色由 AI 扮演。')
          : (atLimit ? '已达到本场预设时刻上限。仍可单步继续，或新建一场。' : '每次推进是一个完整的时刻：取景、宣告、回应、落定。')}</p>`
      : ''}
    ${run.worldLink && (!play || recapUnlocked)
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
        <p>seed：${play && !recapUnlocked ? '<span class="side-dim">复盘后公开</span>' : `<span class="mono">${escapeHtml(run.seed)}</span>`}</p>
        <p>model：${escapeHtml(run.settings.model)} · thinking：${escapeHtml(run.settings.thinking)}</p>
        <p>tokens：${run.llm.totalTokens.toLocaleString('zh-CN')}（reasoning ${run.llm.reasoningTokens.toLocaleString('zh-CN')}）</p>
        <p><button class="text-link side-danger" data-act="confirm-delete">${icon('trash', 12)} 删除这一场</button></p>
      </div>
    </details>
  </section>`;
}

function castPanelHtml(run) {
  const latest = latestComplete(run);
  const play = isPlayRun(run);
  const playerId = playCharacterId(run);
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
          const hidden = playHidesCharacter(run, character.id);
          const isPlayer = character.id === playerId;
          return `<button class="cast-row ${isPlayer ? 'cast-row--you' : ''}" data-act="open-character" data-character="${attr(character.id)}">
            ${avatar(character, 'sm')}
            <span class="cast-row__body">
              <span class="cast-row__name">${escapeHtml(character.name)}${isPlayer ? '<i>你</i>' : acting || play ? '' : '<i>未行动</i>'}</span>
              <span class="cast-row__title">${escapeHtml(character.title)}</span>
            </span>
            ${hidden
              ? '<span class="cast-row__hidden" title="在复盘前，你只能看到公开信息">公开</span>'
              : `<span class="cast-row__stress" title="紧张 ${stress}/10">
                  <span class="meter"><span style="width:${stress * 10}%"></span></span>
                </span>
                ${conditions.length ? `<span class="cast-row__cond">${conditions.slice(0, 2).map((condition) => `<em class="${condition.modifier > 0 ? 'is-boon' : ''}">${escapeHtml(condition.name)}</em>`).join('')}</span>` : ''}`}
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
  const partial = currentPartial(run);
  const play = isPlayRun(run);
  const revealed = playRevealed(run);
  const awaiting = play ? playAwaiting(run) : null;
  let selected = state.selectedBeatId
    ? beats.find((beat) => beat.id === state.selectedBeatId) || null
    : null;
  const waitForPlayer = Boolean(play && !revealed && awaiting);
  const watchingLivePlay = Boolean(play && !revealed && partial && !state.selectedBeatId);
  if (!selected && !waitForPlayer && !watchingLivePlay) selected = latestComplete(run);
  state.lastLatestBeatId = latestComplete(run)?.id || null;
  if (selected && !(waitForPlayer && state.selectedBeatId === null)) {
    state.selectedBeatId = selected.id;
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
  let stage;
  if (play && !revealed) {
    if (waitForPlayer && !state.selectedBeatId && partial) {
      stage = playWaitStageHtml(run, partial, awaiting);
    } else if (waitForPlayer && selected) {
      stage = playStageHtml(run, selected, { awaiting, viewingOld: true });
    } else if (selected) {
      stage = playStageHtml(run, selected);
    } else if (partial && running) {
      stage = playRunningStageHtml(run, partial);
    } else if (partial) {
      const phaseKind =
        awaiting ||
        (partial.phase === 'player_action'
          ? 'action'
          : partial.phase === 'player_reaction'
            ? 'reaction'
            : null);
      stage = phaseKind
        ? playWaitStageHtml(run, partial, phaseKind)
        : playRunningStageHtml(run, partial);
    } else {
      stage = openingHtml(run);
    }
  } else {
    stage = selected ? stageHtml(run, selected) : openingHtml(run);
  }

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
      playCharacterId(run) || '',
      awaiting || '',
      revealed ? 1 : 0,
    ].join('|'),
  );
  setRegion(
    'run-beatnav',
    beatNavHtml(run),
    [
      beats.map((beat) => beat.id).join(','),
      state.selectedBeatId,
      partial?.index ?? '-',
      partial?.phase || '',
      running ? 1 : 0,
      awaiting || '',
      run.progress?.label || '',
      run.progress?.detail || '',
    ].join('|'),
  );
  setRegion(
    'run-stage',
    stage,
    [
      beats.length,
      state.selectedBeatId,
      state.godView ? 1 : 0,
      run.ending ? 1 : 0,
      running ? 1 : 0,
      partial?.phase || '',
      awaiting || '',
      revealed ? 1 : 0,
      run.error || '',
      run.progress?.label || '',
      run.progress?.detail || '',
      run.status,
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
      beats.length,
      awaiting || '',
      revealed ? 1 : 0,
      play ? 1 : 0,
    ].join('|'),
  );

  if (options.scrollToStage) {
    document.querySelector('[data-region="run-stage"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}
