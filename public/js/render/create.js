/* 新建推演页：预置剧本 / 自定义手稿 + 推演设置。功能与 v0.2 一致，去掉营销文案。 */

import { state } from '../state.js';
import { setAppHtml, escapeHtml, attr, avatar, icon, iconMarkSvg } from '../dom.js';
import { topbarPlain } from './shell.js';
import { blankScenarioTemplate } from '../logic/create.js';

function playCastCardHtml(character) {
  const passive = Boolean(character.passive);
  const selected = state.create.play.characterId === character.id && !passive;
  return `<button class="play-cast-card ${selected ? 'is-selected' : ''} ${passive ? 'is-passive' : ''}"
      data-act="select-play-character" data-character="${attr(character.id)}"
      ${passive ? 'disabled title="被动角色不主动行动，不能被玩家扮演"' : ''}>
    <span class="play-cast-card__head">${avatar(character, 'sm')}<b>${escapeHtml(character.name || character.id)}</b>${passive ? '<i class="tag">被动</i>' : ''}</span>
    <span class="play-cast-card__title">${escapeHtml(character.title || '')}</span>
    <span class="play-cast-card__profile">${escapeHtml(character.publicProfile || '')}</span>
  </button>`;
}

/** 角色选择列表（可单独刷新，不重建整页）。 */
export function playCastListHtml() {
  const play = state.create.play;
  if (play.loading && !play.cast.length) {
    return '<p class="side-empty">正在读取可扮演的角色……</p>';
  }
  if (play.castError) {
    return `<p class="editor-message editor-message--error">${escapeHtml(play.castError)}</p>`;
  }
  if (!play.cast.length) {
    return `<p class="side-empty">${state.create.mode === 'preset' ? '这个剧本没有可扮演的角色。' : '手稿里还没有可读的角色。检查 JSON 后再试。'}</p>`;
  }
  return play.cast.map(playCastCardHtml).join('');
}

/** 只更新游玩方式相关的 DOM，保留用户在设置里填的值。 */
export function refreshPlayChooserDom() {
  const enabled = state.create.play.enabled;
  document.querySelectorAll('[data-act="set-play-mode"]').forEach((button) => {
    const on = (button.dataset.mode === 'play') === enabled;
    button.classList.toggle('is-active', on);
    button.setAttribute('aria-selected', String(on));
  });
  const panel = document.querySelector('#play-cast-panel');
  if (panel) panel.hidden = !enabled;
  const list = document.querySelector('#play-cast');
  if (list) list.innerHTML = playCastListHtml();
  const startButton = document.querySelector('[data-act="start-create"]');
  if (startButton && !startButton.classList.contains('is-loading')) {
    const character = state.create.play.cast.find(
      (entry) => entry.id === state.create.play.characterId,
    );
    startButton.innerHTML = enabled
      ? character
        ? `以 ${escapeHtml(character.name)} 的身份入戏`
        : '选择你要扮演的角色'
      : state.create.mode === 'preset'
        ? '以这个剧本开局'
        : '用这份手稿开局';
    const apiMissing = Boolean(state.health && !state.health.hasApiKey);
    startButton.disabled = apiMissing || (enabled && (!character || state.create.play.loading));
  }
  const hint = document.querySelector('.create-submit__hint');
  if (hint) {
    hint.textContent = enabled
      ? '建场不需要立即推进；第一幕会先等你宣告。你只会看到这个角色能感知到的信息。'
      : state.create.mode === 'preset'
        ? '建场不会立即消耗 token；你可以在推演页逐刻推进。'
        : '建场前会校验手稿，不会立即消耗 token。';
  }
}

function playSetupHtml() {
  const enabled = state.create.play.enabled;
  return `
  <section class="panel side-panel play-setup">
    <div class="side-panel__head"><h2>游玩方式</h2></div>
    <div class="mode-switch" role="tablist" aria-label="游玩方式">
      <button class="mode-option ${enabled ? '' : 'is-active'}" data-act="set-play-mode" data-mode="spectate" role="tab" aria-selected="${!enabled}">
        <b>推演模式</b>
        <span>所有角色由 AI 扮演。你可以旁观，并查看全部幕后信息。</span>
      </button>
      <button class="mode-option ${enabled ? 'is-active' : ''}" data-act="set-play-mode" data-mode="play" role="tab" aria-selected="${enabled}">
        <b>扮演模式</b>
        <span>你接手其中一人。只看自己知道的，故事结束后才能复盘全部真相。</span>
      </button>
    </div>
    <div id="play-cast-panel" class="play-cast-panel" ${enabled ? '' : 'hidden'}>
      <p class="side-note">选择你要扮演的角色。别人的秘密、内心和检定，在复盘之前都不会交给你。</p>
      <div id="play-cast" class="play-cast">${enabled ? playCastListHtml() : ''}</div>
      <p class="play-privacy">${icon('eye', 12)} 你拿到的是这个角色的可知信息：公开处境、自己的私密线索与角色卡、公开事实、自己的检定。他人的 effect、内心、检定与导演幕后注属于未知。</p>
    </div>
  </section>`;
}

export function renderCreatePage() {
  const presets = state.scenarios;
  if (!state.create.presetId && presets.length) {
    state.create.presetId = presets[0].id;
  }
  if (!state.create.editorText) {
    state.create.editorText = JSON.stringify(blankScenarioTemplate(), null, 2);
  }
  const selectedPreset = presets.find((preset) => preset.id === state.create.presetId) || presets[0];
  const settingsDisabled = Boolean(state.health) && !state.health.hasApiKey;
  setAppHtml(
    `${topbarPlain()}
    <main class="page create-page">
      <div class="page-head">
        <div>
          <h1>新建推演</h1>
          <p>预置剧本已写好开场与秘密；也可以把自己的世界写进手稿，让导演从这些缝隙里长出戏。</p>
        </div>
      </div>

      <div class="create-layout">
        <section class="create-main">
          <div class="create-tabs" role="tablist" aria-label="剧本来源">
            <button class="create-tab ${state.create.mode === 'preset' ? 'is-active' : ''}" data-act="create-tab" data-mode="preset" role="tab" aria-selected="${state.create.mode === 'preset'}">预置剧本</button>
            <button class="create-tab ${state.create.mode === 'custom' ? 'is-active' : ''}" data-act="create-tab" data-mode="custom" role="tab" aria-selected="${state.create.mode === 'custom'}">自定义手稿</button>
          </div>
          <div class="create-body">
            <div class="create-panel" data-panel="preset" role="tabpanel" ${state.create.mode !== 'preset' ? 'hidden' : ''}>
              ${
                presets.length
                  ? `<div class="preset-choice">
                      ${presets
                        .map(
                          (preset) => `<button class="preset-choice-card ${preset.id === state.create.presetId ? 'is-selected' : ''}" data-act="select-preset" data-preset="${attr(preset.id)}">
                            <span class="preset-choice-card__icon">${iconMarkSvg()}</span>
                            <h3>${escapeHtml(preset.title)}</h3>
                            <p>${escapeHtml(preset.subtitle)}</p>
                            <div class="preset-choice-card__meta">
                              <span class="tag">${preset.characterNames.length} 位角色</span>
                              <span class="tag">最多 ${preset.maxBeats} 刻</span>
                              <span class="tag">${escapeHtml(preset.kicker)}</span>
                            </div>
                          </button>`,
                        )
                        .join('')}
                      <button class="preset-choice-card preset-choice-card--custom" data-act="create-tab" data-mode="custom">
                        <span class="preset-choice-card__icon">${icon('feather', 20)}</span>
                        <h3>写自己的手稿</h3>
                        <p>从空白模板开始，填入世界、场所与角色。</p>
                        <div class="preset-choice-card__meta"><span class="tag">JSON 手稿</span><span class="tag">2–6 位角色</span></div>
                      </button>
                    </div>
                    ${
                      selectedPreset
                        ? `<div class="preset-detail panel">
                            <h4>本场地点</h4>
                            <p class="preset-detail__location">${escapeHtml(selectedPreset.location)}</p>
                            <div class="preset-detail__cast">${selectedPreset.characterNames.map((name) => `<span class="cast-chip">${avatar(name, 'sm')}${escapeHtml(name)}</span>`).join('')}</div>
                          </div>`
                        : ''
                    }`
                  : '<div class="empty-state">没有找到预置剧本。请使用自定义手稿。</div>'
              }
            </div>

            <div class="create-panel" data-panel="custom" role="tabpanel" ${state.create.mode !== 'custom' ? 'hidden' : ''}>
              <div class="editor-toolbar">
                <button class="btn btn--ghost btn--sm" data-act="load-preset-template">载入预置底本</button>
                <button class="btn btn--ghost btn--sm" data-act="blank-template">空白模板</button>
                <button class="btn btn--ghost btn--sm" data-act="import-json">${icon('upload', 12)} 导入 JSON</button>
                <input class="file-input" id="json-file" type="file" accept="application/json,.json" />
                <span class="editor-toolbar__spacer"></span>
                <button class="btn btn--quiet btn--sm" data-act="validate-json">${icon('check', 12)} 检查手稿</button>
              </div>
              <textarea id="custom-editor" class="textarea textarea--code" spellcheck="false" aria-label="自定义剧本 JSON">${escapeHtml(state.create.editorText)}</textarea>
              <div id="editor-message" class="editor-message ${state.create.editorMessage?.type === 'error' ? 'editor-message--error' : state.create.editorMessage?.type === 'ok' ? 'editor-message--ok' : ''}" ${state.create.editorMessage ? '' : 'hidden'}>${state.create.editorMessage ? escapeHtml(state.create.editorMessage.text) : ''}</div>
              <p class="editor-note">world 描述世界与场所；characters 至少两位。traits 参与检定，memories 只对该角色可见。完整字段见 docs/SCENARIO.md。</p>
            </div>
          </div>
        </section>

        <aside class="create-aside">
          ${settingsDisabled ? '<div class="api-warning">服务端还没有配置 DeepSeek API Key。可以建场浏览，但无法推进。请在 .env 中设置 DEEPSEEK_API_KEY。</div>' : ''}
          ${playSetupHtml()}
          <section class="panel side-panel">
            <div class="side-panel__head"><h2>推演设置</h2></div>
            <p class="side-note">只影响这一次推演；手稿本身不会被改写。</p>
            <div class="settings-grid">
              <div class="form-field">
                <label for="setting-max-beats">本场最多时刻 <span>2–12</span></label>
                <input id="setting-max-beats" class="input" type="number" min="2" max="12" value="${selectedPreset?.maxBeats || 4}" />
              </div>
              <div class="form-field">
                <label for="setting-seed">骰点种子 <span>留空则随机</span></label>
                <div class="seed-row">
                  <input id="setting-seed" class="input" type="text" maxlength="64" placeholder="例如 fog-01" autocomplete="off" />
                  <button class="btn btn--ghost btn--sm" data-act="random-seed" title="随机种子">${icon('dice', 15)}</button>
                </div>
              </div>
              <div class="form-field">
                <label for="setting-thinking">推理模式</label>
                <select id="setting-thinking" class="select">
                  <option value="auto" ${(state.health?.thinking || 'auto') === 'auto' ? 'selected' : ''}>自动 · 导演思考，角色快速行动</option>
                  <option value="enabled" ${state.health?.thinking === 'enabled' ? 'selected' : ''}>全部开启 · 更慢，更有层次</option>
                  <option value="disabled" ${state.health?.thinking === 'disabled' ? 'selected' : ''}>全部关闭 · 更快，更直接</option>
                </select>
              </div>
            </div>
          </section>

          <section class="panel side-panel">
            <button class="btn btn--primary btn--wide" data-act="start-create" ${settingsDisabled ? 'disabled' : ''}>${state.create.mode === 'preset' ? '以这个剧本开局' : '用这份手稿开局'}</button>
            <span class="create-submit__hint side-note">${state.create.mode === 'preset' ? '建场不会立即消耗 token；你可以在推演页逐刻推进。' : '建场前会校验手稿，不会立即消耗 token。'}</span>
            <span id="create-error" class="editor-message editor-message--error" hidden></span>
          </section>
        </aside>
      </div>
    </main>`,
    { scrollTop: true },
  );
  refreshPlayChooserDom();
}
