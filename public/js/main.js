/* 启动、hash 路由、全局事件委托（data-act 派发）。
   动作名与 v0.2 保持一致；主题切换与「剧作家视角」同时作用于推演页与世界页。 */

import { state } from './state.js';
import { api } from './api.js';
import { toast, setAppHtml, modalLayer, latestComplete, clearRegions } from './dom.js';
import { renderErrorPage } from './render/shell.js';
import { renderHome } from './render/home.js';
import { renderCreatePage } from './render/create.js';
import { renderWorldsLibrary } from './render/library.js';
import { renderRunPage } from './render/run.js';
import { renderWorldPage } from './render/world.js';
import {
  openRulebook,
  closeOverlay,
  openCharacterDrawer,
  openWorldEvent,
  openWorldActor,
  openWorldFaction,
  openWorldThreadDrawer,
  openWorldFactsModal,
  openWorldOverview,
  openConfirmDelete,
  openConfirmDeleteWorld,
} from './render/drawers.js';
import {
  loadRun,
  stopPolling,
  advanceRun,
  stopRun,
  deleteRun,
  sealRunScene,
  selectBeat,
} from './logic/run.js';
import {
  loadWorldsLibrary,
  loadWorld,
  stopWorldPolling,
  advanceWorld,
  stopWorld,
  startWorldScene,
  sealWorldScene,
  deleteWorld,
  archiveProject,
  unarchiveProject,
  startWorldFromPreset,
  startCustomWorld,
  loadWorldTemplate,
} from './logic/world.js';
import {
  loadCreatePage,
  startCreate,
  switchCreateMode,
  blankScenarioTemplate,
  loadPresetTemplate,
  importJsonFile,
  validateEditor,
  updateEditorMessage,
} from './logic/create.js';

/* ---- 数据加载 ---- */

async function loadBaseData() {
  const results = await Promise.allSettled([
    api('/api/health'),
    api('/api/scenarios'),
    api('/api/runs'),
    api('/api/world-presets'),
    api('/api/worlds'),
    api('/api/projects'),
  ]);
  if (results[0].status === 'fulfilled') state.health = results[0].value;
  if (results[1].status === 'fulfilled') state.scenarios = results[1].value.scenarios || [];
  if (results[2].status === 'fulfilled') state.runs = results[2].value.runs || [];
  if (results[3].status === 'fulfilled') state.worldPresets = results[3].value.presets || [];
  if (results[4].status === 'fulfilled') state.worlds = results[4].value.worlds || [];
  if (results[5].status === 'fulfilled') state.projects = results[5].value.projects || [];
}

async function loadHome() {
  state.view = 'home';
  document.title = '幕间 · Mise-en-scène';
  await loadBaseData();
  if (!state.health) {
    state.health = { hasApiKey: false, model: 'DEEPSEEK', thinking: 'auto' };
  }
  renderHome();
}

/* ---- 主题 ---- */

function rerenderCurrent({ force = false } = {}) {
  if (force) clearRegions();
  switch (state.view) {
    case 'run':
      renderRunPage({ full: force });
      break;
    case 'world':
      renderWorldPage({ full: force });
      break;
    case 'new':
      renderCreatePage();
      break;
    case 'worlds':
      renderWorldsLibrary();
      break;
    default:
      renderHome();
  }
}

/* ---- 路由 ---- */

function parseRoute() {
  const raw = window.location.hash.replace(/^#/, '') || 'home';
  const [path, queryString] = raw.split('?');
  const params = new URLSearchParams(queryString || '');
  if (path.startsWith('run/')) {
    return { name: 'run', id: decodeURIComponent(path.slice(4)) };
  }
  if (path === 'new') {
    return { name: 'new', preset: params.get('preset'), custom: params.get('custom') === '1' };
  }
  if (path === 'worlds') return { name: 'worlds' };
  if (path.startsWith('world/')) {
    return { name: 'world', id: decodeURIComponent(path.slice(6)) };
  }
  return { name: 'home' };
}

async function route() {
  state.routeToken += 1;
  stopPolling();
  stopWorldPolling();
  closeOverlay();
  const routeInfo = parseRoute();
  if (routeInfo.name === 'run') {
    await loadRun(routeInfo.id);
    return;
  }
  if (routeInfo.name === 'new') {
    if (routeInfo.preset) state.create.presetId = routeInfo.preset;
    if (routeInfo.custom) state.create.mode = 'custom';
    await loadCreatePage();
    return;
  }
  if (routeInfo.name === 'worlds') {
    await loadWorldsLibrary();
    return;
  }
  if (routeInfo.name === 'world') {
    await loadWorld(routeInfo.id);
    return;
  }
  await loadHome();
}

/* ---- 事件委托 ---- */

const NATIVE_ANCHOR_ACTS = ['go-home', 'close-overlay'];
const NO_PREVENT_ACTS = ['open-character', 'select-beat', 'create-tab', 'select-preset'];

async function handleClick(event) {
  const trigger = event.target.closest('[data-act]');
  if (!trigger) return;
  const act = trigger.dataset.act;
  if (!act) return;
  if (trigger.tagName === 'A' && !NATIVE_ANCHOR_ACTS.includes(act)) {
    // 原生锚点（下载、#run/... 导航）保持默认行为。
    return;
  }
  if (!NO_PREVENT_ACTS.includes(act)) {
    event.preventDefault();
  }
  const button = trigger;

  switch (act) {
    case 'go-home':
      event.preventDefault();
      if (state.view === 'home') window.scrollTo({ top: 0, behavior: 'smooth' });
      else location.hash = '#home';
      break;
    case 'open-rules':
      event.preventDefault();
      openRulebook();
      break;
    case 'toggle-theme': {
      const root = document.documentElement;
      const next = root.dataset.theme === 'light' ? 'dark' : 'light';
      root.dataset.theme = next;
      try {
        localStorage.setItem('mes.theme', next);
      } catch {
        /* 隐私模式下无法持久化，主题仍即时生效 */
      }
      rerenderCurrent({ force: true });
      break;
    }
    case 'close-overlay':
      event.preventDefault();
      closeOverlay();
      break;
    case 'open-character':
      event.preventDefault();
      event.stopPropagation();
      openCharacterDrawer(trigger.dataset.character);
      break;
    case 'reveal-secret': {
      event.preventDefault();
      const secret = trigger.closest('.inner-item')?.querySelector('.secret-blur');
      if (!secret) break;
      const revealed = secret.classList.toggle('is-revealed');
      trigger.textContent = revealed ? '掩上' : '揭示';
      break;
    }
    case 'toggle-god':
      event.preventDefault();
      state.godView = !state.godView;
      rerenderCurrent();
      break;
    case 'advance-one':
      event.preventDefault();
      await advanceRun('one');
      break;
    case 'advance-auto':
      event.preventDefault();
      await advanceRun('auto');
      break;
    case 'stop-run':
      event.preventDefault();
      await stopRun();
      break;
    case 'select-beat':
      event.preventDefault();
      selectBeat(trigger.dataset.beat);
      break;
    case 'goto-latest':
      event.preventDefault();
      selectBeat(latestComplete(state.currentRun)?.id);
      break;
    case 'create-tab':
      event.preventDefault();
      switchCreateMode(trigger.dataset.mode);
      break;
    case 'select-preset': {
      event.preventDefault();
      state.create.presetId = trigger.dataset.preset;
      document.querySelectorAll('.preset-choice-card[data-preset]').forEach((card) => {
        card.classList.toggle('is-selected', card.dataset.preset === state.create.presetId);
      });
      const preset = state.scenarios.find((item) => item.id === state.create.presetId);
      const maxBeatsNode = document.querySelector('#setting-max-beats');
      if (preset && maxBeatsNode) maxBeatsNode.value = String(preset.maxBeats);
      break;
    }
    case 'load-preset-template':
      event.preventDefault();
      await loadPresetTemplate();
      break;
    case 'blank-template': {
      event.preventDefault();
      const text = JSON.stringify(blankScenarioTemplate(), null, 2);
      const editor = document.querySelector('#custom-editor');
      if (editor) editor.value = text;
      state.create.editorText = text;
      switchCreateMode('custom');
      updateEditorMessage('ok', '空白模板已载入。至少填入两位角色、他们各自想要的东西，以及他们不肯说出口的秘密。');
      break;
    }
    case 'import-json':
      event.preventDefault();
      document.querySelector('#json-file')?.click();
      break;
    case 'validate-json':
      event.preventDefault();
      validateEditor();
      break;
    case 'random-seed': {
      event.preventDefault();
      const node = document.querySelector('#setting-seed');
      const values = new Uint32Array(2);
      crypto.getRandomValues(values);
      if (node) {
        node.value = `${values[0].toString(16)}${values[1].toString(16)}`.slice(0, 10);
      }
      break;
    }
    case 'start-create':
      event.preventDefault();
      await startCreate(button);
      break;
    case 'start-world':
      event.preventDefault();
      await startWorldFromPreset(button);
      break;
    case 'start-custom-world':
      event.preventDefault();
      await startCustomWorld(button);
      break;
    case 'load-world-template':
      event.preventDefault();
      await loadWorldTemplate();
      break;
    case 'clear-world-template':
      event.preventDefault();
      state.worldJsonEditor = '';
      state.worldEditorMessage = null;
      {
        const editor = document.querySelector('#world-json-editor');
        if (editor) editor.value = '';
        const message = document.querySelector('#world-editor-message');
        if (message) message.hidden = true;
      }
      break;
    case 'random-world-seed': {
      event.preventDefault();
      const node = document.querySelector('#world-setting-seed');
      const values = new Uint32Array(2);
      crypto.getRandomValues(values);
      if (node) node.value = `${values[0].toString(16)}${values[1].toString(16)}`.slice(0, 10);
      break;
    }
    case 'advance-world-one':
      event.preventDefault();
      await advanceWorld('one');
      break;
    case 'advance-world-auto':
      event.preventDefault();
      await advanceWorld('auto');
      break;
    case 'stop-world':
      event.preventDefault();
      await stopWorld();
      break;
    case 'jump-world-epoch': {
      event.preventDefault();
      const epochIndex = String(trigger.dataset.epoch ?? '');
      const target = document.getElementById(`world-epoch-${epochIndex}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
    case 'open-world-actor':
      event.preventDefault();
      event.stopPropagation();
      openWorldActor(trigger.dataset.actor);
      break;
    case 'open-world-faction':
      event.preventDefault();
      event.stopPropagation();
      openWorldFaction(trigger.dataset.faction);
      break;
    case 'open-world-event':
      event.preventDefault();
      event.stopPropagation();
      openWorldEvent(trigger.dataset.event);
      break;
    case 'open-world-facts':
      event.preventDefault();
      openWorldFactsModal();
      break;
    case 'open-world-overview':
      event.preventDefault();
      openWorldOverview();
      break;
    case 'open-world-thread':
      event.preventDefault();
      event.stopPropagation();
      openWorldThreadDrawer(trigger.dataset.thread);
      break;
    case 'scroll-world-scenes': {
      event.preventDefault();
      document.getElementById('world-scenes-band')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      break;
    }
    case 'archive-project':
      event.preventDefault();
      await archiveProject(trigger.dataset.id);
      break;
    case 'unarchive-project':
      event.preventDefault();
      await unarchiveProject(trigger.dataset.id);
      break;
    case 'start-world-scene':
      event.preventDefault();
      await startWorldScene(trigger.dataset.world, trigger.dataset.hook, button);
      break;
    case 'seal-world-scene':
      event.preventDefault();
      await sealWorldScene(trigger.dataset.world, trigger.dataset.run, button);
      break;
    case 'seal-run-scene':
      event.preventDefault();
      await sealRunScene(trigger);
      break;
    case 'confirm-delete-world':
      event.preventDefault();
      openConfirmDeleteWorld();
      break;
    case 'delete-world-confirm':
      event.preventDefault();
      await deleteWorld();
      break;
    case 'confirm-delete':
      event.preventDefault();
      openConfirmDelete();
      break;
    case 'delete-run-confirm':
      event.preventDefault();
      await deleteRun();
      break;
    default:
      break;
  }
}

function handleInput(event) {
  if (event.target.id === 'custom-editor') {
    state.create.editorText = event.target.value;
  }
  if (event.target.id === 'world-json-editor') {
    state.worldJsonEditor = event.target.value;
  }
}

function handleChange(event) {
  if (event.target.id === 'json-file') {
    importJsonFile(event.target.files?.[0]);
    event.target.value = '';
  }
}

function handleKeydown(event) {
  if (event.key === 'Escape' && !modalLayer.hidden) {
    closeOverlay();
  }
}

/* ---- 启动 ---- */

async function init() {
  document.addEventListener('click', (event) => {
    handleClick(event).catch((error) => {
      console.error(error);
      toast(error.message || '发生了一个错误。', 'error');
    });
  });
  document.addEventListener('input', handleInput);
  document.addEventListener('change', handleChange);
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('hashchange', () => {
    route().catch((error) => {
      console.error(error);
      renderErrorPage('潮声断了。', error.message || '页面加载失败。', 'ERROR');
    });
  });
  await loadBaseData();
  if (!state.health) state.health = { hasApiKey: false, model: 'DEEPSEEK', thinking: 'auto' };
  if (!state.create.presetId && state.scenarios.length) state.create.presetId = state.scenarios[0].id;
  if (!state.activeWorldPresetId && state.worldPresets.length) {
    state.activeWorldPresetId = state.worldPresets[0].id;
  }
  const routeInfo = parseRoute();
  if (routeInfo.preset) state.create.presetId = routeInfo.preset;
  if (routeInfo.custom) state.create.mode = 'custom';
  await route();
}

init().catch((error) => {
  console.error(error);
  setAppHtml(
    `<main class="page"><div class="error-page"><h1>潮声断了。</h1><p>${String(error.message || '应用初始化失败。')}</p></div></main>`,
    { scrollTop: true },
  );
});
