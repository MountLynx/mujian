/* 世界层逻辑：世界库加载、世界加载/轮询、纪元推进、暂停、开镜/收束、删除。 */

import { state } from '../state.js';
import { api } from '../api.js';
import { toast, setAppHtml, setBusyButton } from '../dom.js';
import { renderErrorPage, bootScreen } from '../render/shell.js';
import { renderHome } from '../render/home.js';
import { renderWorldPage } from '../render/world.js';
import { renderWorldsLibrary } from '../render/library.js';
import { closeOverlay } from '../render/drawers.js';
import { isWorldRunning } from '../world-data.js';
import { stopPolling } from './run.js';

/* ---- 世界库 ---- */

export async function loadWorldsLibrary() {
  state.view = 'worlds';
  document.title = '世界项目 · 幕间';
  stopPolling();
  state.currentWorld = null;
  try {
    const [health, presetsData, worldsData, runsData, projectsData] = await Promise.all([
      api('/api/health'),
      api('/api/world-presets'),
      api('/api/worlds'),
      api('/api/runs'),
      api('/api/projects'),
    ]);
    state.health = health;
    state.worldPresets = presetsData.presets || [];
    state.worlds = worldsData.worlds || [];
    state.runs = runsData.runs || [];
    state.projects = projectsData.projects || [];
    if (!state.activeWorldPresetId && state.worldPresets[0]) {
      state.activeWorldPresetId = state.worldPresets[0].id;
    }
    if (state.activeWorldPresetId && !state.worldPresetDetails[state.activeWorldPresetId]) {
      try {
        const detail = await api(`/api/world-presets/${encodeURIComponent(state.activeWorldPresetId)}`);
        state.worldPresetDetails[state.activeWorldPresetId] = detail.worldPreset;
      } catch {
        /* 预置详情不可用也不阻塞 */
      }
    }
  } catch (error) {
    renderErrorPage('世界线暂时不可读。', error.message || '无法加载世界库。', 'WORLD');
    return;
  }
  renderWorldsLibrary();
}

export async function startWorldFromPreset(button) {
  if (state.busyAction) return;
  const presetId = state.activeWorldPresetId || state.worldPresets[0]?.id;
  if (!presetId) return;
  const maxEpochs = Math.max(2, Math.min(12, Number(document.querySelector('#world-setting-epochs')?.value) || 6));
  const seed = document.querySelector('#world-setting-seed')?.value?.trim() || undefined;
  const thinking = document.querySelector('#world-setting-thinking')?.value || 'auto';
  state.busyAction = true;
  setBusyButton(button, true, '正在展开世界');
  try {
    const data = await api('/api/worlds', {
      method: 'POST',
      body: JSON.stringify({ presetId, maxEpochs, seed, thinking }),
    });
    toast('世界已展开。第一纪元的钟还没有敲。', 'success');
    location.hash = `#world/${encodeURIComponent(data.world.id)}`;
  } catch (error) {
    toast(error.message || '世界建立失败。', 'error');
    setBusyButton(button, false);
  } finally {
    state.busyAction = false;
  }
}

export async function startCustomWorld(button) {
  if (state.busyAction) return;
  const editor = document.querySelector('#world-json-editor');
  const message = document.querySelector('#world-editor-message');
  const raw = editor?.value || state.worldJsonEditor || '';
  try {
    const world = JSON.parse(raw);
    const maxEpochs = Math.max(2, Math.min(12, Number(document.querySelector('#world-setting-epochs')?.value) || 6));
    const seed = document.querySelector('#world-setting-seed')?.value?.trim() || undefined;
    const thinking = document.querySelector('#world-setting-thinking')?.value || 'auto';
    state.busyAction = true;
    setBusyButton(button, true, '正在展开世界');
    const data = await api('/api/worlds', {
      method: 'POST',
      body: JSON.stringify({ world, maxEpochs, seed, thinking }),
    });
    toast('世界已展开。', 'success');
    location.hash = `#world/${encodeURIComponent(data.world.id)}`;
  } catch (error) {
    if (message) {
      message.hidden = false;
      message.className = 'editor-message editor-message--error';
      message.textContent = error.message || '世界手稿无效。';
    }
    toast(error.message || '世界建立失败。', 'error');
    setBusyButton(button, false);
  } finally {
    state.busyAction = false;
  }
}

export async function loadWorldTemplate() {
  const presetId = state.activeWorldPresetId || state.worldPresets[0]?.id;
  if (!presetId) return;
  try {
    let detail = state.worldPresetDetails[presetId];
    if (!detail) {
      const data = await api(`/api/world-presets/${encodeURIComponent(presetId)}`);
      detail = data.worldPreset;
      state.worldPresetDetails[presetId] = detail;
    }
    state.worldJsonEditor = JSON.stringify(detail, null, 2);
    const editor = document.querySelector('#world-json-editor');
    if (editor) editor.value = state.worldJsonEditor;
  } catch (error) {
    toast(error.message || '载入世界底本失败。', 'error');
  }
}

/* ---- 单条世界线 ---- */

export async function loadWorld(id) {
  state.view = 'world';
  state.currentWorld = null;
  stopWorldPolling();
  closeOverlay();
  setAppHtml(bootScreen('潮汐正在归位'), { scrollTop: true });
  const token = state.routeToken;
  try {
    const data = await api(`/api/worlds/${encodeURIComponent(id)}`);
    if (token !== state.routeToken) return;
    state.currentWorld = data.world;
    state.worldActive = Boolean(data.active);
    state.worldPending = false;
    state.worldStopRequested = false;
    document.title = `${data.world.definition.title} · 世界线 · 幕间`;
    renderWorldPage({ full: true, scrollTop: true });
    if (state.worldActive || data.world.status === 'running') scheduleWorldPoll(id, token);
  } catch (error) {
    if (token !== state.routeToken) return;
    renderErrorPage('这条世界线暂时不可读。', error.message || '世界可能已经沉没。', 'WORLD');
  }
}

export function stopWorldPolling() {
  if (state.worldPollTimer) {
    clearTimeout(state.worldPollTimer);
    state.worldPollTimer = null;
  }
}

function scheduleWorldPoll(id, token, delay = 1100) {
  stopWorldPolling();
  state.worldPollTimer = setTimeout(() => pollWorld(id, token), delay);
}

async function pollWorld(id, token) {
  if (state.view !== 'world' || state.currentWorld?.id !== id || token !== state.routeToken) return;
  if (state.worldPollBusy) {
    scheduleWorldPoll(id, token, 500);
    return;
  }
  state.worldPollBusy = true;
  try {
    const data = await api(`/api/worlds/${encodeURIComponent(id)}`);
    if (state.view !== 'world' || state.currentWorld?.id !== id || token !== state.routeToken) return;
    state.currentWorld = data.world;
    state.worldActive = Boolean(data.active);
    renderWorldPage();
    if (state.worldActive || data.world.status === 'running') {
      scheduleWorldPoll(id, token);
    }
  } catch (error) {
    if (error.status === 404) {
      renderErrorPage('这条世界线已经沉没。', '它可能被删除了，或暂时不可读取。', 'WORLD');
      return;
    }
    toast(error.message || '读取世界状态失败。', 'error');
    scheduleWorldPoll(id, token, 2500);
  } finally {
    state.worldPollBusy = false;
  }
}

export async function advanceWorld(mode = 'one') {
  if (state.busyAction || !state.currentWorld) return;
  if (state.health && !state.health.hasApiKey) {
    toast('服务端未配置 DeepSeek API Key，无法推进。', 'error');
    return;
  }
  const world = state.currentWorld;
  if (isWorldRunning(world)) return;
  if (mode === 'auto' && world.epochs.length >= world.settings.maxEpochs) {
    toast('世界已达到预设纪元上限。仍可单步推进，或新建一条世界线。', 'error');
    return;
  }
  state.busyAction = true;
  state.worldActive = true;
  state.worldPending = true;
  state.worldStopRequested = false;
  renderWorldPage();
  try {
    await api(`/api/worlds/${encodeURIComponent(world.id)}/advance`, {
      method: 'POST',
      body: JSON.stringify({ mode, epochs: mode === 'auto' ? 2 : 1 }),
    });
    state.worldActive = true;
    const token = state.routeToken;
    scheduleWorldPoll(world.id, token, 350);
    setTimeout(() => {
      if (state.worldPending) {
        state.worldPending = false;
        renderWorldPage();
        scheduleWorldPoll(world.id, token, 700);
      }
    }, 1500);
    toast(mode === 'auto' ? '世界导演接手。它会连推两个纪元。' : '世界导演开始计算下一个纪元。');
  } catch (error) {
    state.worldPending = false;
    state.worldActive = false;
    renderWorldPage();
    toast(error.message || '无法推进世界纪元。', 'error');
  } finally {
    state.busyAction = false;
  }
}

export async function stopWorld() {
  if (!state.currentWorld || state.worldStopRequested) return;
  state.worldStopRequested = true;
  try {
    await api(`/api/worlds/${encodeURIComponent(state.currentWorld.id)}/stop`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    renderWorldPage();
    toast('收到。当前纪元会收束完，随后暂停。');
  } catch (error) {
    state.worldStopRequested = false;
    toast(error.message || '暂停失败。', 'error');
  }
}

export async function startWorldScene(worldId, hookId, button) {
  if (state.busyAction) return;
  state.busyAction = true;
  setBusyButton(button, true, '正在开镜');
  try {
    const data = await api(`/api/worlds/${encodeURIComponent(worldId)}/scenes`, {
      method: 'POST',
      body: JSON.stringify({ hookId }),
    });
    toast('聚焦场景已开镜。角色只带着他们知道的东西入场。', 'success');
    location.hash = `#run/${encodeURIComponent(data.run.id)}`;
  } catch (error) {
    if (error.status === 409 && error.runId) {
      location.hash = `#run/${encodeURIComponent(error.runId)}`;
    } else {
      toast(error.message || '无法开镜。', 'error');
    }
    setBusyButton(button, false);
  } finally {
    state.busyAction = false;
  }
}

export async function sealWorldScene(worldId, runId, button) {
  if (state.busyAction) return;
  state.busyAction = true;
  setBusyButton(button, true, '正在收束');
  try {
    await api(`/api/worlds/${encodeURIComponent(worldId)}/scenes/${encodeURIComponent(runId)}/seal`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    toast('场景余波已经写回世界账本。', 'success');
    const token = state.routeToken;
    const data = await api(`/api/worlds/${encodeURIComponent(worldId)}`);
    if (token !== state.routeToken) return;
    state.currentWorld = data.world;
    state.worldActive = Boolean(data.active);
    renderWorldPage();
  } catch (error) {
    toast(error.message || '无法收束场景。', 'error');
    setBusyButton(button, false);
  } finally {
    state.busyAction = false;
  }
}

export async function deleteWorld() {
  if (!state.currentWorld) return;
  const worldId = state.currentWorld.id;
  try {
    // 新布局走项目级联删除；旧布局（无清单）回退到世界端点。
    try {
      await api(`/api/projects/${encodeURIComponent(worldId)}`, { method: 'DELETE' });
    } catch (error) {
      if (error.status !== 404) throw error;
      await api(`/api/worlds/${encodeURIComponent(worldId)}`, { method: 'DELETE' });
    }
    closeOverlay();
    state.currentWorld = null;
    toast('世界项目已经沉入档案之外。');
    location.hash = '#worlds';
  } catch (error) {
    toast(error.message || '删除世界项目失败。', 'error');
  }
}

export async function archiveProject(projectId) {
  if (!projectId) return;
  try {
    await api(`/api/projects/${encodeURIComponent(projectId)}/archive`, { method: 'POST', body: JSON.stringify({}) });
    state.projects = state.projects.map((project) =>
      project.id === projectId ? { ...project, archived: true } : project,
    );
    renderHome();
    toast('项目已归档。随时可以在首页底部恢复。');
  } catch (error) {
    toast(error.message || '归档失败。', 'error');
  }
}

export async function unarchiveProject(projectId) {
  if (!projectId) return;
  try {
    await api(`/api/projects/${encodeURIComponent(projectId)}/unarchive`, { method: 'POST', body: JSON.stringify({}) });
    state.projects = state.projects.map((project) =>
      project.id === projectId ? { ...project, archived: false } : project,
    );
    renderHome();
    toast('项目已恢复到总览。');
  } catch (error) {
    toast(error.message || '恢复失败。', 'error');
  }
}
