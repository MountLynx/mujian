/* DOM 工具：转义、头像、图标、toast，以及「区域渲染器」。
   区域渲染器是本次重构的核心：签名不变就不碰 DOM，轮询期间页面保持静止。 */

import { state, STATUS_LABELS, ABILITY_LABELS } from './state.js';

export const app = document.querySelector('#app');
export const modalLayer = document.querySelector('#modal-layer');
export const toastLayer = document.querySelector('#toast-layer');

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function attr(value) {
  return escapeHtml(value);
}

export function paragraphHtml(text) {
  return String(text ?? '')
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('');
}

export function truncateText(text, max) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…` : value;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function hueFor(id) {
  return 154 + (hashString(id) % 64);
}

export function initials(name) {
  return [...String(name ?? '？')].slice(0, 1).join('');
}

export function avatar(characterOrName, size = '') {
  const name = typeof characterOrName === 'string' ? characterOrName : characterOrName.name;
  const id = typeof characterOrName === 'string' ? characterOrName : characterOrName.id;
  const cls = ['avatar', size ? `avatar--${size}` : ''].filter(Boolean).join(' ');
  return `<span class="${cls}" style="--hue:${hueFor(id || name)}" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
}

export function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

/** 「3 小时前」式的相对时间；未来时间返回「n 后」。 */
export function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  const minutes = Math.round(Math.abs(diff) / 60000);
  if (minutes < 1) return '刚刚';
  let value;
  if (minutes < 60) value = `${minutes} 分钟`;
  else if (minutes < 1440) value = `${Math.round(minutes / 60)} 小时`;
  else value = `${Math.round(minutes / 1440)} 天`;
  return diff >= 0 ? `${value}前` : `${value}后`;
}

export function shortId(id) {
  return String(id ?? '').replace(/^run_|^world_/, '').slice(0, 8);
}

export function completeBeats(run) {
  return (run?.beats ?? []).filter((beat) => beat.phase === 'complete');
}

export function latestComplete(run) {
  return completeBeats(run).at(-1) ?? null;
}

export function currentPartial(run) {
  const last = run?.beats?.at(-1);
  return last && last.phase !== 'complete' ? last : null;
}

export function findCharacter(run, id) {
  return run?.scenario?.characters?.find((character) => character.id === id) || null;
}

export function characterName(run, id) {
  return findCharacter(run, id)?.name || id;
}

export function isRunning(run) {
  return state.active || run?.status === 'running' || state.pendingAdvance;
}

/* ---- 扮演模式 ---- */

export function isPlayRun(run) {
  return Boolean(run?.play?.characterId);
}

export function playRevealed(run) {
  return !isPlayRun(run) || Boolean(run.play.recapAt);
}

export function playCharacterId(run) {
  return run?.play?.characterId || null;
}

export function playCharacter(run) {
  return playCharacterId(run) ? findCharacter(run, playCharacterId(run)) : null;
}

/** 'action' | 'reaction' | null */
export function playAwaiting(run) {
  if (!isPlayRun(run)) return null;
  const last = run?.beats?.at(-1);
  if (!last) return null;
  if (last.phase === 'player_action') return 'action';
  if (last.phase === 'player_reaction') return 'reaction';
  return null;
}

/** 玩家视角下，角色的全部内幕是否对该玩家隐藏。 */
export function playHidesCharacter(run, characterId) {
  return isPlayRun(run) && !playRevealed(run) && characterId !== playCharacterId(run);
}

export function statusPill(status, customLabel) {
  const label = customLabel || STATUS_LABELS[status] || status;
  return `<span class="status-pill status-pill--${attr(status)}">${escapeHtml(label)}</span>`;
}

export function runStatusLabel(run, active = false, beatCount = null) {
  if (active || run.status === 'running') return '推演中';
  if (run.status === 'awaiting') {
    const last = run.beats?.at(-1);
    if (last?.phase === 'player_reaction') return '轮到你回应';
    return '轮到你行动';
  }
  if (run.status === 'ready') {
    const count = beatCount ?? completeBeats(run).length;
    return count > 0 ? '待续' : '待开场';
  }
  if (run.status === 'paused') return '已暂停';
  return STATUS_LABELS[run.status] || run.status;
}

export function abilityLabel(key) {
  return ABILITY_LABELS[key] || key;
}

export function icon(name, size = 16, extraClass = '') {
  const paths = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 18l-6-6 6-6"/>',
    play: '<path d="M8 5.5v13l10.5-6.5z"/>',
    pause: '<path d="M9 5v14M15 5v14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    download: '<path d="M12 4v11M8 11l4 4 4-4M5 19h14"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 1.5"/>',
    dice: '<path d="M12 2.7 21 8v8l-9 5.3L3 16V8z"/><path d="M3 8l9 5 9-5M12 13v8.3"/>',
    eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.6"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
    refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    upload: '<path d="M12 16V5M8 9l4-4 4 4M5 19h14"/>',
    bolt: '<path d="M13 2 5 14h6l-1 8 8-12h-6z"/>',
    feather: '<path d="M20 4c-4.5 0-11 3-13 12l-3 5M8 17c4 0 9-2 10-7M8 13h5"/>',
    dots: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
    map: '<path d="M9 18l-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z"/><path d="M9 3v15M15 6v15"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.7 3 2.7 15 0 18M12 3c-2.7 3-2.7 15 0 18"/>',
    layers: '<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 12 9 5 9-5M3 16l9 5 9-5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.1.1l1.4-1.4a5 5 0 0 0-7-7L10 6"/><path d="M14 11a5 5 0 0 0-7.1-.1L5.5 12.3a5 5 0 0 0 7 7L14 18"/>',
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 5.5V21M8 7h8M8 11h6"/>',
  };
  return `<svg class="icon ${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;
}

export function iconMarkSvg() {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 4 58 20v24L32 60 6 44V20Z"/><path d="M32 4v56M6 20l52 24M58 20 6 44"/><circle cx="32" cy="32" r="2.2" fill="currentColor" stroke="none"/></svg>`;
}

export function setBusyButton(button, busy, label = '正在推进') {
  if (!button) return;
  button.classList.toggle('is-loading', Boolean(busy));
  if (busy) {
    button.dataset.previousText = button.innerHTML;
    button.innerHTML = label;
  } else if (button.dataset.previousText) {
    button.innerHTML = button.dataset.previousText;
    delete button.dataset.previousText;
  }
}

export function toast(message, type = '') {
  const node = document.createElement('div');
  node.className = `toast ${type ? `toast--${type}` : ''}`;
  node.textContent = message;
  toastLayer.appendChild(node);
  setTimeout(() => {
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 250);
  }, type === 'error' ? 5200 : 3600);
}

/* --------------------------------------------------------------------------
   整页渲染 / 区域渲染
   -------------------------------------------------------------------------- */

const regionSignatures = new Map();

function reopenDetails(root, keys) {
  for (const key of keys) {
    const el = root.querySelector(`details[data-key="${CSS.escape(key)}"]`);
    if (el) el.open = true;
  }
}

export function clearRegions() {
  regionSignatures.clear();
}

export function setAppHtml(html, options = {}) {
  const { scrollTop = false } = options;
  clearRegions();
  const openKeys = [...app.querySelectorAll('details[data-key][open]')].map((el) => el.dataset.key);
  app.innerHTML = html;
  reopenDetails(app, openKeys);
  if (scrollTop) window.scrollTo({ top: 0, behavior: 'instant' });
}

/**
 * 把 html 写进 `[data-region="name"]` 容器。signature 与上次相同则跳过，
 * 轮询期间未变化的区域不会发生任何 DOM 变动。
 */
export function setRegion(name, html, signature) {
  const el = app.querySelector(`[data-region="${name}"]`);
  if (!el) return;
  if (signature !== undefined && regionSignatures.get(name) === signature) return;
  regionSignatures.set(name, signature);
  const openKeys = [...el.querySelectorAll('details[data-key][open]')].map((node) => node.dataset.key);
  el.innerHTML = html;
  reopenDetails(el, openKeys);
}
