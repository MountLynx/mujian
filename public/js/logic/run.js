/* 推演页逻辑：加载、轮询、推进、暂停、删除、收束。
   与 v0.2 行为一致，只有渲染调用改为「区域渲染」。 */

import { state } from '../state.js';
import { api } from '../api.js';
import {
  app,
  toast,
  setAppHtml,
  setBusyButton,
  completeBeats,
  latestComplete,
  isRunning,
  isPlayRun,
  playAwaiting,
  playRevealed,
} from '../dom.js';
import { renderErrorPage, bootScreen } from '../render/shell.js';
import { renderRunPage } from '../render/run.js';
import { closeOverlay } from '../render/drawers.js';

export async function loadRun(id) {
  state.view = 'run';
  stopPolling();
  closeOverlay();
  setAppHtml(bootScreen('正在潜入这一场'), { scrollTop: true });
  const token = state.routeToken;
  try {
    const data = await api(`/api/runs/${encodeURIComponent(id)}`);
    if (token !== state.routeToken) return;
    state.currentRun = data.run;
    state.active = Boolean(data.active);
    state.followLatest = true;
    state.lastLatestBeatId = latestComplete(data.run)?.id || null;
    const awaiting = playAwaiting(data.run);
    state.selectedBeatId = awaiting ? null : latestComplete(data.run)?.id || null;
    state.pendingAdvance = false;
    state.stopRequested = false;
    if (isPlayRun(data.run)) state.godView = playRevealed(data.run);
    document.title = `${data.run.scenario.title} · 幕间`;
    renderRunPage({ full: true, scrollTop: true });
    if (state.active || data.run.status === 'running') schedulePoll(id, token);
  } catch (error) {
    if (token !== state.routeToken) return;
    if (error.status === 404) {
      renderErrorPage('这一场已经沉入雾里。', '它可能被删除了，或者链接并不指向一场存在的推演。', '404');
    } else {
      renderErrorPage('潜航失败。', error.message || '无法加载这一场推演。', 'ERROR');
    }
  }
}

export function stopPolling() {
  if (state.pollTimer) {
    clearTimeout(state.pollTimer);
    state.pollTimer = null;
  }
}

function schedulePoll(id, token, delay = 1100) {
  stopPolling();
  state.pollTimer = setTimeout(() => pollRun(id, token), delay);
}

/** 玩家提交举动/回应后，服务端已开始下一段推演。 */
export function resumePolling(id, delay = 350) {
  schedulePoll(id, state.routeToken, delay);
}

async function pollRun(id, token) {
  if (state.view !== 'run' || state.currentRun?.id !== id || token !== state.routeToken) return;
  if (state.pollBusy) {
    schedulePoll(id, token, 500);
    return;
  }
  state.pollBusy = true;
  try {
    const data = await api(`/api/runs/${encodeURIComponent(id)}`);
    if (state.view !== 'run' || state.currentRun?.id !== id || token !== state.routeToken) return;
    const previousLatest = state.lastLatestBeatId;
    const newLatest = latestComplete(data.run)?.id || null;
    state.currentRun = data.run;
    state.active = Boolean(data.active);
    state.pendingAdvance = false;
    if (!data.active && data.run.status !== 'running') state.stopRequested = false;
    const awaiting = playAwaiting(data.run);
    if (awaiting) {
      state.selectedBeatId = null;
      state.followLatest = true;
    } else {
      const followedNewBeat = Boolean(
        newLatest && newLatest !== previousLatest && (state.followLatest || !state.selectedBeatId),
      );
      if (followedNewBeat) state.selectedBeatId = newLatest;
    }
    state.lastLatestBeatId = newLatest;
    renderRunPage({ scrollToStage: Boolean(newLatest && newLatest !== previousLatest) });
    if (data.active || data.run.status === 'running') {
      schedulePoll(id, token);
    }
  } catch (error) {
    if (error.status === 404) {
      renderErrorPage('这一场已经沉入雾里。', '它已经被删除，或暂时不可读取。', '404');
      return;
    }
    toast(error.message || '读取推演状态失败。', 'error');
    schedulePoll(id, token, 2500);
  } finally {
    state.pollBusy = false;
  }
}

export async function advanceRun(mode = 'one') {
  if (state.busyAction || !state.currentRun) return;
  if (state.health && !state.health.hasApiKey) {
    toast('服务端未配置 DeepSeek API Key，无法推进。', 'error');
    return;
  }
  const run = state.currentRun;
  if (run.ending) return;
  if (isRunning(run)) return;
  if (isPlayRun(run) && playAwaiting(run)) {
    toast('轮到你输入：先完成你的举动或回应。', 'error');
    return;
  }
  if (isPlayRun(run) && mode === 'auto') {
    toast('扮演模式需要你逐刻宣告，不能连续推演。', 'error');
    return;
  }
  const common = mode === 'auto' && completeBeats(run).length >= run.settings.maxBeats;
  if (common) {
    toast('已达到本场预设时刻上限，可以单步继续，或另起一场。', 'error');
    return;
  }
  state.busyAction = true;
  state.pendingAdvance = true;
  state.stopRequested = false;
  renderRunPage();
  try {
    await api(`/api/runs/${encodeURIComponent(run.id)}/advance`, {
      method: 'POST',
      body: JSON.stringify({ mode, beats: mode === 'auto' ? 3 : 1 }),
    });
    state.active = true;
    const token = state.routeToken;
    schedulePoll(run.id, token, 350);
    // 轮询会在服务端确认任务后清掉 pendingAdvance；这里是兜底。
    setTimeout(() => {
      if (state.pendingAdvance) {
        state.pendingAdvance = false;
        renderRunPage();
        schedulePoll(run.id, token, 700);
      }
    }, 1500);
    toast(mode === 'auto' ? '导演接手了。它会自行连推三刻，直到故事停下。' : '幕布重新升起。导演正在布置此刻。');
  } catch (error) {
    state.pendingAdvance = false;
    state.active = false;
    renderRunPage();
    toast(error.message || '无法推进这一刻。', 'error');
  } finally {
    state.busyAction = false;
  }
}

export async function stopRun() {
  if (!state.currentRun || state.stopRequested) return;
  state.stopRequested = true;
  try {
    await api(`/api/runs/${encodeURIComponent(state.currentRun.id)}/stop`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    renderRunPage();
    toast('收到。当前这一刻会收束完，随后暂停。');
  } catch (error) {
    state.stopRequested = false;
    toast(error.message || '暂停失败。', 'error');
  }
}

export async function deleteRun() {
  const run = state.currentRun;
  if (!run) return;
  try {
    await api(`/api/runs/${encodeURIComponent(run.id)}`, { method: 'DELETE' });
    closeOverlay();
    toast('这一场已经从剧目库中移走。');
    state.currentRun = null;
    location.hash = '#home';
  } catch (error) {
    toast(error.message || '删除失败。', 'error');
  }
}

export async function sealRunScene(button) {
  if (!state.currentRun?.worldLink || state.busyAction) return;
  const link = state.currentRun.worldLink;
  state.busyAction = true;
  setBusyButton(button, true, '正在收束');
  try {
    await api(`/api/worlds/${encodeURIComponent(link.worldId)}/scenes/${encodeURIComponent(state.currentRun.id)}/seal`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    toast('聚焦场景已经写回世界账本。', 'success');
    location.hash = `#world/${encodeURIComponent(link.worldId)}`;
  } catch (error) {
    toast(error.message || '无法收束场景。', 'error');
    setBusyButton(button, false);
  } finally {
    state.busyAction = false;
  }
}

export function selectBeat(beatId) {
  if (!state.currentRun) return;
  state.selectedBeatId = beatId;
  state.followLatest = beatId === latestComplete(state.currentRun)?.id;
  renderRunPage();
}
