/* 扮演模式：把玩家的举动/回应交给服务端，并在复盘时请求全量数据。 */

import { state } from '../state.js';
import { api } from '../api.js';
import { toast, setBusyButton, playAwaiting, latestComplete } from '../dom.js';
import { renderRunPage } from '../render/run.js';
import { resumePolling } from './run.js';
import { openConfirmRecap, openRecap } from '../render/drawers.js';

function field(id) {
  return document.querySelector(id)?.value?.trim() || '';
}

function checkedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`)?.value || '';
}

function abilityValue(name) {
  return checkedValue(name) || '';
}

function fail(message) {
  toast(message, 'error');
  return false;
}

export function preventPlayFormSubmit(event) {
  if (!event.target?.matches?.('.play-form')) return;
  event.preventDefault();
}

/* ---- 玩家宣告举动 ---- */

export async function submitPlayAction(button) {
  const run = state.currentRun;
  if (!run || state.busyAction) return;
  const payload = {
    summary: field('#play-summary'),
    deed: field('#play-deed'),
    effect: field('#play-effect'),
    dialogue: field('#play-dialogue'),
    thought: field('#play-thought'),
    stakes: field('#play-stakes'),
    category: field('#play-category') || '其他',
    targetId: field('#play-target') || null,
    trait: field('#play-trait') || null,
    hostile: Boolean(document.querySelector('#play-hostile')?.checked),
    ability: abilityValue('play-ability'),
  };
  if (!payload.deed) return fail('先写下你做了什么。');
  if (!payload.effect) return fail('再写下你想要的效果：它不一定发生，但会决定检定。');
  if (!payload.ability) return fail('选择一项主要依靠的能力。');
  state.busyAction = true;
  setBusyButton(button, true, '正在封存举动');
  try {
    const data = await api(`/api/runs/${encodeURIComponent(run.id)}/play/action`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.run) state.currentRun = data.run;
    state.active = true;
    state.pendingAdvance = true;
    state.selectedBeatId = null;
    state.followLatest = true;
    renderRunPage({ scrollToStage: true });
    resumePolling(run.id);
    toast('你的举动已经封存。其余角色开始各自行动。');
  } catch (error) {
    toast(error.message || '无法宣告这个举动。', 'error');
    setBusyButton(button, false);
  } finally {
    state.busyAction = false;
  }
}

/* ---- 玩家回应敌意 ---- */

export async function submitPlayReaction(button) {
  const run = state.currentRun;
  if (!run || state.busyAction) return;
  const payload = {
    summary: field('#play-reaction-summary'),
    stance: field('#play-reaction-stance'),
    description: field('#play-reaction-description'),
    dialogue: field('#play-reaction-dialogue'),
    thought: field('#play-reaction-thought'),
    trait: field('#play-reaction-trait') || null,
    ability: abilityValue('play-reaction-ability'),
    continueOriginal: checkedValue('play-continue') !== 'abandon',
  };
  if (!payload.description) return fail('写下你如何回应。');
  if (!payload.ability) return fail('选择一项主要依靠的能力。');
  state.busyAction = true;
  setBusyButton(button, true, '正在封存回应');
  try {
    const data = await api(`/api/runs/${encodeURIComponent(run.id)}/play/reaction`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (data.run) state.currentRun = data.run;
    state.active = true;
    state.pendingAdvance = true;
    state.selectedBeatId = null;
    state.followLatest = true;
    renderRunPage({ scrollToStage: true });
    resumePolling(run.id);
    toast('回应已经落下。骰子开始结算这一刻。');
  } catch (error) {
    toast(error.message || '无法提交这个回应。', 'error');
    setBusyButton(button, false);
  } finally {
    state.busyAction = false;
  }
}

/* ---- 复盘 ---- */

export function confirmRecap() {
  if (!state.currentRun) return;
  openConfirmRecap();
}

export async function unlockRecap(button) {
  const run = state.currentRun;
  if (!run || state.busyAction) return;
  state.busyAction = true;
  setBusyButton(button, true, '正在打开复盘');
  try {
    const data = await api(`/api/runs/${encodeURIComponent(run.id)}/recap`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    state.currentRun = data.run;
    state.active = false;
    state.pendingAdvance = false;
    state.stopRequested = false;
    state.selectedBeatId = latestComplete(data.run)?.id || null;
    state.followLatest = true;
    state.godView = true;
    renderRunPage({ full: true });
    toast('复盘已开启：所有人的秘密、内心与检定都已公开。', 'success');
    openRecap();
  } catch (error) {
    toast(error.message || '无法打开复盘。', 'error');
    setBusyButton(button, false);
  } finally {
    state.busyAction = false;
  }
}

/* ---- 交互动画与滚动 ---- */

export function focusPlayForm() {
  const form =
    document.querySelector('#play-action-form') || document.querySelector('#play-reaction-form');
  if (form) {
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  gotoPlayNow();
}

export function gotoPlayNow() {
  if (!state.currentRun) return;
  state.selectedBeatId = null;
  state.followLatest = true;
  renderRunPage({ scrollToStage: true });
}

export function handlePlayAbilityChange(event) {
  const input = event.target;
  if (input?.name !== 'play-ability' && input?.name !== 'play-reaction-ability') return;
  const form = input.closest?.('.play-form');
  if (!form) return;
  form.querySelectorAll('.ability-choice').forEach((label) => {
    const radio = label.querySelector('input');
    label.classList.toggle('is-checked', Boolean(radio?.checked));
  });
  const traitSelect = form.querySelector('select[id$="-trait"]');
  if (!traitSelect) return;
  [...(traitSelect.options || [])].forEach((option) => {
    const required = option.dataset?.ability;
    option.disabled = Boolean(required && required !== input.value);
  });
  const selected = traitSelect.options?.[traitSelect.selectedIndex];
  if (selected?.disabled) traitSelect.value = '';
}

/** 玩法提示：Ctrl/Cmd + Enter 交表。 */
export function handlePlayKeydown(event) {
  if (state.modalOpen) return;
  if (event.key !== 'Enter' || !(event.metaKey || event.ctrlKey)) return;
  if (document.querySelector('#play-action-form')) {
    document.querySelector('[data-act="submit-play-action"]')?.click();
  } else if (document.querySelector('#play-reaction-form')) {
    document.querySelector('[data-act="submit-play-reaction"]')?.click();
  }
}

export function playTurnFor(run = state.currentRun) {
  return playAwaiting(run);
}
