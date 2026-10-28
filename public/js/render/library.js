/* 世界库：预置世界摘要 + 世界项目列表 + 自定义世界手稿。 */

import { state } from '../state.js';
import { setAppHtml, escapeHtml, avatar, icon, attr } from '../dom.js';
import { worldProjectCard } from './home.js';
import { topbarPlain } from './shell.js';

export function renderWorldsLibrary() {
  const preset = state.worldPresets[0];
  const detail = preset ? state.worldPresetDetails[preset.id] : null;
  const projects = state.projects;
  const worldProjects = projects.filter((project) => project.kind === 'world' && !project.archived);
  const archived = projects.filter((project) => project.archived);
  const worlds = worldProjects.slice(0, 12);
  const overview = detail?.setting?.overview || preset?.subtitle || '';
  const disabled = Boolean(state.health) && !state.health.hasApiKey;
  setAppHtml(
    `${topbarPlain()}
    <main class="page worlds-page">
      <div class="page-head">
        <div>
          <h1>世界项目</h1>
          <p>每条世界线和它长出的聚焦场景是一个完整的故事文件夹：可以整体备份、归档或删除。建场不调用模型，第一次推进纪元时世界导演才开始工作。</p>
        </div>
      </div>

      <div class="worlds-layout">
        <section class="worlds-main">
          ${
            preset
              ? `<section class="world-preset panel">
                  <div class="world-preset__body">
                    <span class="tag tag--gold">${escapeHtml(preset.kicker)}</span>
                    <h2>${escapeHtml(preset.title)}</h2>
                    <p class="world-preset__sub">${escapeHtml(preset.subtitle)}</p>
                    <p class="world-preset__overview">${escapeHtml(overview)}</p>
                    <div class="world-preset__meta">
                      <span class="tag">${preset.regionNames.length} 个区域</span>
                      <span class="tag">${preset.factionNames.length} 个势力</span>
                      <span class="tag">${preset.actorNames.length} 名具名角色</span>
                      <span class="tag">最多 ${preset.maxEpochs} 个纪元</span>
                    </div>
                    <div class="world-preset__cast">${preset.actorNames.map((name) => `<span class="cast-chip">${avatar(name, 'sm')}${escapeHtml(name)}</span>`).join('')}</div>
                  </div>
                </section>`
              : '<div class="empty-state">还没有预置世界。可以在下方用手稿启动一个世界。</div>'
          }

          <section class="home-section">
            <header class="section-row">
              <h2>世界项目档案</h2>
              ${worlds.length ? `<span>${worldProjects.length} 个</span>` : ''}
            </header>
            ${worlds.length
              ? `<div class="project-list">${worlds.map((project) => worldProjectCard(project, state.runs)).join('')}</div>`
              : '<div class="empty-state empty-state--slim"><p>还没有世界项目。在右侧设置好后启动预置世界即可。</p></div>'}
          </section>

          ${
            archived.length
              ? `<details class="archived-fold" data-key="archived-projects">
                  <summary>已归档 <i>${archived.length}</i></summary>
                  <div class="archived-fold__body">
                    ${archived
                      .map(
                        (project) => `<div class="archived-row">
                          <a href="#world/${encodeURIComponent(project.id)}">${escapeHtml(project.title)}</a>
                          <span class="archived-row__meta">${project.kind === 'world' ? `世界项目 · 纪元 ${project.epochCount} / ${project.maxEpochs || '?'}` : `短篇 · ${project.beats} 刻`}</span>
                          <button class="btn btn--ghost btn--sm" data-act="unarchive-project" data-id="${attr(project.id)}">恢复</button>
                        </div>`,
                      )
                      .join('')}
                  </div>
                </details>`
              : ''
          }

          <details class="world-custom" data-key="world-custom-editor">
            <summary>${icon('feather', 14)} 高级：从世界手稿启动另一个世界 <i>JSON</i></summary>
            <div class="world-custom__body">
              <p>世界手稿包含 setting.regions / factions / actors / threads、initialFacts 与 initialSignals。可以先载入预置底本再改。</p>
              <div class="editor-toolbar">
                <button class="btn btn--ghost btn--sm" data-act="load-world-template">载入三城底本</button>
                <button class="btn btn--quiet btn--sm" data-act="clear-world-template">清空</button>
                <span class="editor-toolbar__spacer"></span>
                <button class="btn btn--secondary btn--sm" data-act="start-custom-world" ${disabled ? 'disabled' : ''}>用这份手稿启动</button>
              </div>
              <textarea id="world-json-editor" class="textarea textarea--code" spellcheck="false" placeholder="在这里粘贴世界 JSON 手稿……">${escapeHtml(state.worldJsonEditor || '')}</textarea>
              <div id="world-editor-message" class="editor-message" ${state.worldEditorMessage ? '' : 'hidden'}>${state.worldEditorMessage ? escapeHtml(state.worldEditorMessage) : ''}</div>
            </div>
          </details>
        </section>

        <aside class="worlds-aside">
          ${disabled ? '<div class="api-warning">服务端还没有配置 DeepSeek API Key。可以查看世界线，但无法推进纪元。</div>' : ''}
          <section class="panel side-panel">
            <div class="side-panel__head"><h2>建立世界线</h2></div>
            <div class="settings-grid">
              <div class="form-field">
                <label for="world-setting-epochs">世界最多纪元 <span>2–12</span></label>
                <input id="world-setting-epochs" class="input" type="number" min="2" max="12" value="${preset?.maxEpochs || 6}" />
              </div>
              <div class="form-field">
                <label for="world-setting-seed">世界种子 <span>留空则随机</span></label>
                <div class="seed-row">
                  <input id="world-setting-seed" class="input" type="text" maxlength="64" placeholder="例如 tide-01" autocomplete="off" />
                  <button class="btn btn--ghost btn--sm" data-act="random-world-seed" title="随机种子">${icon('dice', 15)}</button>
                </div>
              </div>
              <div class="form-field">
                <label for="world-setting-thinking">推理模式</label>
                <select id="world-setting-thinking" class="select">
                  <option value="auto" ${(state.health?.thinking || 'auto') === 'auto' ? 'selected' : ''}>自动 · 导演思考</option>
                  <option value="enabled" ${state.health?.thinking === 'enabled' ? 'selected' : ''}>全部开启</option>
                  <option value="disabled" ${state.health?.thinking === 'disabled' ? 'selected' : ''}>全部关闭</option>
                </select>
              </div>
            </div>
            <button class="btn btn--primary btn--wide side-panel__cta" data-act="start-world" ${disabled || !preset ? 'disabled' : ''}>${icon('globe', 14)} 启动《${escapeHtml(preset?.title || '世界')}》</button>
            <p class="side-note">世界线独立于局部剧本；一个纪元的时长由事件决定。</p>
          </section>
        </aside>
      </div>
    </main>`,
    { scrollTop: true },
  );
}
