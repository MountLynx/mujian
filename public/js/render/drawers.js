/* 抽屉与弹窗：角色档案、规则书、删除确认、世界角色/势力档案、事件档案、事实账本。
   内容与 v0.2 一致，皮肤走新 token。 */

import { state, ABILITY_LABELS, OUTCOME_LABELS, WORLD_RESOURCE_LABELS } from '../state.js';
import {
  modalLayer,
  escapeHtml,
  attr,
  avatar,
  icon,
  paragraphHtml,
  truncateText,
  completeBeats,
  latestComplete,
  findCharacter,
  characterName,
  isPlayRun,
  playRevealed,
  playCharacterId,
} from '../dom.js';
import { worldSceneHook } from './world.js';
import {
  worldActor,
  worldFaction,
  worldRegion,
  worldEntityName,
  worldThread,
  knownByWorld,
  formatArrival,
  safeWorldColor,
} from '../world-data.js';

function showModal(html) {
  modalLayer.innerHTML = html;
  modalLayer.hidden = false;
  document.body.style.overflow = 'hidden';
  state.modalOpen = true;
}

function conditionModifierText(condition) {
  const modifier = Number(condition.modifier || 0);
  return `<span class="${modifier < 0 ? 'neg' : 'pos'}">${modifier > 0 ? '+' : ''}${modifier}</span>`;
}

/* ---- 角色档案抽屉 ---- */

export function openCharacterDrawer(characterId) {
  const run = state.currentRun;
  if (!run) return;
  const character = findCharacter(run, characterId);
  const runtime = run.characters[characterId];
  if (!character || !runtime) return;
  state.drawerCharacterId = characterId;
  const selectedBeat =
    completeBeats(run).find((beat) => beat.id === state.selectedBeatId) || latestComplete(run);
  const action = selectedBeat?.actions.find((entry) => entry.characterId === characterId);
  const reaction = selectedBeat?.reactions.find((entry) => entry.characterId === characterId);
  const isPlayer = playCharacterId(run) === characterId;
  const hidden = isPlayRun(run) && !playRevealed(run) && !isPlayer;

  if (hidden) {
    const conditions = runtime.conditions || [];
    showModal(`
      <div class="drawer-backdrop" data-act="close-overlay"></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="${attr(character.name)} 的公开资料">
        <div class="drawer__head">
          <span class="drawer__head-label">公开资料</span>
          <button class="drawer__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
        </div>
        <div class="drawer__hero">
          <div class="drawer__identity">
            ${avatar(character, 'lg')}
            <div>
              <h2 class="drawer__name">${escapeHtml(character.name)}</h2>
              <div class="drawer__title">${escapeHtml(character.title)}${character.age ? ` · ${escapeHtml(character.age)} 岁` : ''}${character.pronouns ? ` · ${escapeHtml(character.pronouns)}` : ''}</div>
            </div>
          </div>
          <p class="drawer__profile">${escapeHtml(character.publicProfile)}</p>
          ${character.appearance ? `<p class="drawer__profile side-dim">${escapeHtml(character.appearance)}</p>` : ''}
        </div>
        <section class="drawer__section">
          <div class="drawer__section-head"><span>你能看到的</span></div>
          <div class="cond-list">${conditions.length ? conditions.map((condition) => `<div class="cond-row"><div class="cond-row__name"><span>${escapeHtml(condition.name)}</span></div><p>${escapeHtml(condition.description || '')}</p></div>`).join('') : '<div class="drawer-empty">没有可见的持续状态。</div>'}</div>
        </section>
        ${action || reaction
          ? `<section class="drawer__section">
              <div class="drawer__section-head"><span>最近一刻你看见的</span><span>${selectedBeat ? `第 ${selectedBeat.index + 1} 刻` : ''}</span></div>
              ${action ? `<div class="trait-row"><div class="trait-row__name"><span>他做了什么</span></div><p>${escapeHtml(action.deed || action.description || '')}</p>${action.dialogue ? `<p class="act__quote">${escapeHtml(action.dialogue)}</p>` : ''}</div>` : ''}
              ${reaction ? `<div class="trait-row" style="margin-top:8px"><div class="trait-row__name"><span>他的回应</span></div><p>${escapeHtml(reaction.description || '')}</p>${reaction.dialogue ? `<p class="act__quote">${escapeHtml(reaction.dialogue)}</p>` : ''}</div>` : ''}
            </section>`
          : ''}
        <section class="drawer__section">
          <div class="drawer__section-head"><span>幕后</span></div>
          <p class="side-note">${icon('eye', 12)} 你正在扮演 ${escapeHtml(characterName(run, playCharacterId(run)))}。这个人的欲望、恐惧、秘密、记忆与能力不在你的可知范围内。故事结束、打开复盘之后，才能看到全部。</p>
        </section>
      </aside>`);
    return;
  }

  const relationships = (character.relationships || [])
    .map((relationship) => {
      const target = findCharacter(run, relationship.targetId);
      if (!target) return '';
      return `<div class="rel-row">
        ${avatar(target, 'sm')}
        <div>
          <div class="rel-row__name">${escapeHtml(target.name)}<span>${escapeHtml(relationship.label)}</span></div>
          <p>${escapeHtml(relationship.attitude)}</p>
        </div>
      </div>`;
    })
    .join('');
  const memories = [...runtime.memories].reverse().slice(0, 14);
  const memoryRows = memories.length
    ? memories
        .map(
          (memory) => `<div class="memory-row">
        <div class="memory-row__meta">${memory.beatIndex === null ? '旧事' : `第 ${memory.beatIndex + 1} 刻`} / ${escapeHtml(String(memory.kind || '').toUpperCase())}</div>
        <p>${escapeHtml(memory.summary)}${memory.detail ? `<i class="side-dim">${escapeHtml(memory.detail)}</i>` : ''}</p>
      </div>`,
        )
        .join('')
    : '<div class="drawer-empty">记忆还没有潮水漫进来。</div>';
  const conditions = runtime.conditions.length
    ? runtime.conditions
        .map(
          (condition) => `<div class="cond-row">
        <div class="cond-row__name"><span>${escapeHtml(condition.name)}</span>${conditionModifierText(condition)}</div>
        <p>${escapeHtml(condition.description || '没有更多描述。')}</p>
      </div>`,
        )
        .join('')
    : '<div class="drawer-empty">没有持续中的状态。</div>';
  const traits = character.traits.length
    ? character.traits
        .map(
          (trait) => `<div class="trait-row">
        <div class="trait-row__name"><span>${escapeHtml(trait.name)}</span><b>+${trait.bonus}${trait.ability ? ` / ${escapeHtml(ABILITY_LABELS[trait.ability])}` : ''}</b></div>
        <p>${escapeHtml(trait.description)}</p>
      </div>`,
        )
        .join('')
    : '<div class="drawer-empty">没有机械特质。</div>';
  showModal(`
    <div class="drawer-backdrop" data-act="close-overlay"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="${attr(character.name)} 的角色档案">
      <div class="drawer__head">
        <span class="drawer__head-label">人物档案</span>
        <button class="drawer__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
      </div>
      <div class="drawer__hero">
        <div class="drawer__identity">
          ${avatar(character, 'lg')}
          <div>
            <h2 class="drawer__name">${escapeHtml(character.name)}</h2>
            <div class="drawer__title">${escapeHtml(character.title)}${character.age ? ` · ${escapeHtml(character.age)} 岁` : ''}${character.pronouns ? ` · ${escapeHtml(character.pronouns)}` : ''}</div>
          </div>
        </div>
        <p class="drawer__profile">${escapeHtml(character.publicProfile)}</p>
        ${(state.godView || isPlayer) && character.appearance ? `<p class="drawer__profile side-dim">${escapeHtml(character.appearance)}</p>` : ''}
      </div>

      <section class="drawer__section">
        <div class="drawer__section-head"><span>内在${isPlayer ? ' · 只有你知道' : ''}</span></div>
        <div class="inner-block">
          <div class="inner-item"><span>性格</span><p>${escapeHtml(character.personality)}</p></div>
          <div class="inner-item"><span>欲望</span><p>${escapeHtml(character.desire)}</p></div>
          <div class="inner-item"><span>恐惧</span><p>${escapeHtml(character.fear)}</p></div>
          ${isPlayer
            ? `<div class="inner-item"><span>秘密</span><p>${escapeHtml(character.secret)}</p></div>`
            : `<div class="inner-item"><span>秘密 <button class="secret-toggle" data-act="reveal-secret">揭示</button></span><p class="secret-blur">${escapeHtml(character.secret)}</p></div>`}
        </div>
      </section>

      <section class="drawer__section">
        <div class="drawer__section-head"><span>能力</span><span>紧张 ${runtime.stress}/10</span></div>
        <div class="attr-grid">
          ${Object.entries(character.abilities)
            .map(
              ([key, value]) => `<div class="attr-row">
            <span class="attr-row__label">${escapeHtml(ABILITY_LABELS[key])}</span>
            <span class="attr-row__pips">${Array.from({ length: 10 }, (_, index) => `<i class="${index < value ? 'is-on' : ''}"></i>`).join('')}</span>
            <span class="attr-row__value">${String(value).padStart(2, '0')}</span>
          </div>`,
            )
            .join('')}
        </div>
      </section>

      <section class="drawer__section">
        <div class="drawer__section-head"><span>特质</span></div>
        <div class="trait-list">${traits}</div>
      </section>

      <section class="drawer__section">
        <div class="drawer__section-head"><span>当前状态</span></div>
        <div class="cond-list">${conditions}</div>
      </section>

      <section class="drawer__section">
        <div class="drawer__section-head"><span>随身物</span></div>
        <div class="inv-list">${runtime.inventory.length ? runtime.inventory.map((item) => `<span class="inv-item">${escapeHtml(item)}</span>`).join('') : '<span class="drawer-empty">空无一物。</span>'}</div>
      </section>

      <section class="drawer__section">
        <div class="drawer__section-head"><span>记忆</span><span>${runtime.memories.length} 条</span></div>
        <div class="memory-list">${memoryRows}</div>
      </section>

      <section class="drawer__section">
        <div class="drawer__section-head"><span>关系</span></div>
        <div class="rel-list">${relationships || '<div class="drawer-empty">没有特别信任或戒备的人。</div>'}</div>
      </section>

      ${
        action || reaction
          ? `<section class="drawer__section">
        <div class="drawer__section-head"><span>最近一刻</span><span>${selectedBeat ? `第 ${selectedBeat.index + 1} 刻 · ${escapeHtml(selectedBeat.clock.display)}` : ''}</span></div>
        ${action ? `<div class="trait-row"><div class="trait-row__name"><span>${escapeHtml(action.summary)}</span><b>${escapeHtml(action.status === 'abandoned' ? '放下' : OUTCOME_LABELS[action.outcome] || '未结算')}</b></div><p>${escapeHtml(action.deed || action.description || '')}</p>${action.effect ? `<p class="side-dim">想要的效果：${escapeHtml(action.effect)}</p>` : ''}${action.roll ? `<p class="mono side-dim">d20 ${action.roll.natural} · 总计 ${action.roll.total}${action.roll.opponentTotal !== null && action.roll.opponentTotal !== undefined ? ` · 回应 ${action.roll.opponentTotal}` : ` · DC ${action.roll.dc}`}</p>` : ''}</div>` : ''}
        ${reaction ? `<div class="trait-row" style="margin-top:8px"><div class="trait-row__name"><span>${escapeHtml(reaction.summary)}</span><b>${reaction.continueOriginal ? '继续原行动' : '放弃原行动'}</b></div><p>${escapeHtml(reaction.description)}</p></div>` : ''}
      </section>`
          : ''
      }
    </aside>`);
}

/* ---- 规则书 ---- */

export function openRulebook() {
  showModal(`
    <div class="modal-backdrop" data-act="close-overlay"></div>
    <div class="modal-shell">
      <section class="modal" role="dialog" aria-modal="true" aria-label="推演规则">
        <div class="modal__head">
          <div><h2 class="modal__title">推演规则</h2></div>
          <button class="modal__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
        </div>
        <div class="modal__body">
          <section class="rule-section">
            <h3><span>01</span>导演与角色各司其职</h3>
            <p>导演 LLM 负责世界、NPC、处境、难度、后果与叙事。角色 LLM 只拿到自己此刻能感知的信息、自己的记忆和角色卡，各自决定举动。它不知道别人的秘密，也不能决定骰点结果。</p>
          </section>
          <section class="rule-section">
            <h3><span>02</span>时间跟着事件走</h3>
            <p>没有固定的“每回合十分钟”。每个时刻是一个有因果边界的场景单元；它持续多久，由这一刻发生的事决定。导演在收束时给出分钟数与理由，系统据此推进场景时钟。</p>
          </section>
          <section class="rule-section">
            <h3><span>03</span>举动与效果</h3>
            <p>每个角色先秘密宣告一个具体举动（deed），再写下它想要的效果（effect），并选择六项能力之一。导演在看见所有举动后，为每个效果给出 DC 与情境修正。deed 会发生；检定决定 effect 是否落地。</p>
            <div class="rule-formula">score = d20 + ability (1–10) + trait bonus + condition modifiers + director modifier + penalties<br/><br/>意外奏效：natural 20 或 margin ≥ +10<br/>落地：margin ≥ 0<br/>落空：margin &lt; 0；deed 仍发生，只是 effect 没被接住</div>
            <div class="rule-tiers">
              <div class="rule-tier rule-tier--crit"><h4>意外奏效</h4><p>效果落地，并获得额外优势、线索或关系位移。</p></div>
              <div class="rule-tier rule-tier--ok"><h4>落地</h4><p>效果落地，通常伴随代价、暴露、消耗或新的问题。</p></div>
              <div class="rule-tier rule-tier--soft"><h4>落空</h4><p>效果没有落地：话被岔开、动作被挡回或被误解；但举动本身仍然发生。</p></div>
            </div>
          </section>
          <section class="rule-section">
            <h3><span>04</span>被敌意举动指向的人有一轮回应</h3>
            <p>只有敌意举动（强迫、伤害、夺取、逼到角落或欺骗）会触发回应回合。如果 A 的敌意举动指向 B，B 会在骰点落下前获得一次回应机会：</p>
            <ul>
              <li><b>继续原本的举动：</b>B 一心二用。B 的原举动与回应都受到 −2 分心惩罚。</li>
              <li><b>放下原本的举动：</b>B 的原举动取消，不会发生；回应不再受分心惩罚。</li>
              <li><b>无论是否放下原举动：</b>若同时有多个敌意举动指向 B，B 的回应每多一人再 −1；这是同时施压，不是围攻。</li>
            </ul>
            <p>回应只掷一次，同时对抗所有敌意举动。举动者的总分对抗目标回应的总分，差值同样决定意外奏效/落地/落空。</p>
            <div class="rule-callout">选择放弃，并不是认输。它只是承认：这一刻你只能认真做一件事。</div>
          </section>
          <section class="rule-section">
            <h3><span>05</span>秘密、信息与记忆</h3>
            <p>角色不会共享内心。导演给每人不同的私密线索；行动揭示秘密时，必须留下可被他人感知的证据。每个时刻结束后，角色会得到一条主观记忆。长线推演中，记忆与关系会反过来影响判断。</p>
          </section>
          <section class="rule-section">
            <h3><span>06</span>扮演模式：你就是其中一个角色</h3>
            <p>扮演模式把一名主动角色换成真人玩家。运行方式与推演模式完全相同：每个人秘密宣告 deed/effect，导演裁定，敌意举动的目标获得一次回应，骰点决定 effect 是否落地。区别只在于你的信息边界与角色完全一致。</p>
            <ul>
              <li><b>你能看到：</b>公开处境、自己的私密线索、自己的角色卡与记忆、公开事实、自己的举动、回应与检定。</li>
              <li><b>你看不到：</b>其他人的秘密、欲望、内心、effect、检定与裁定，以及导演幕后注和剧本的隐藏真相。</li>
              <li><b>他人的可见部分：</b>他们做了什么、说了什么，以及公开后果。</li>
              <li><b>复盘：</b>故事结束后，你可以一次性公开全部幕后信息。复盘之后本场结束，不能继续推进。</li>
            </ul>
            <div class="rule-callout">信息边界由服务端裁切，不靠界面隐藏。复盘之前，完整战报与全知正文也不会交给你。</div>
          </section>
          <section class="rule-section">
            <h3><span>07</span>世界层</h3>
            <p>世界层记录时间、区域资源、势力、线程与事实账本。事实有 <b>knownBy</b>——势力知道不等于每个角色知道；消息是在路上的信号，抵达之前不会改变任何人的认知。纪元可以长出聚焦场景，把镜头交给局部角色引擎。</p>
          </section>
          <section class="rule-section">
            <h3><span>08</span>可复现的骰点</h3>
            <p>每一场有一个 seed。每个角色在某一时刻的举动骰与回应骰，都由 seed 和稳定的行为标签确定。重试生成叙事不会改变已锁定的骰点，便于复盘与调试。</p>
          </section>
        </div>
        <div class="modal__foot"><button class="btn btn--ghost btn--sm" data-act="close-overlay">合上规则书</button></div>
      </section>
    </div>`);
}

/* ---- 删除确认 ---- */

export function openConfirmDelete() {
  const run = state.currentRun;
  if (!run) return;
  showModal(`
    <div class="modal-backdrop" data-act="close-overlay"></div>
    <div class="modal-shell">
      <section class="modal modal--narrow" role="dialog" aria-modal="true" aria-label="删除确认">
        <div class="modal__head">
          <div><h2 class="modal__title">要让这一幕沉下去吗？</h2></div>
          <button class="modal__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
        </div>
        <div class="modal__body">
          <p class="modal__note">《${escapeHtml(run.scenario.title)}》的完整记录、角色记忆和所有已掷出的骰点都会从剧目库中删除。这个动作不可撤销。</p>
        </div>
        <div class="modal__foot">
          <button class="btn btn--quiet btn--sm" data-act="close-overlay">保留</button>
          <button class="btn btn--danger btn--sm" data-act="delete-run-confirm">${icon('trash', 13)} 确认删除</button>
        </div>
      </section>
    </div>`);
}

export function openConfirmDeleteWorld() {
  const world = state.currentWorld;
  if (!world) return;
  const sceneCount = world.sceneRuns.length;
  showModal(`
    <div class="modal-backdrop" data-act="close-overlay"></div>
    <div class="modal-shell">
      <section class="modal modal--narrow" role="dialog" aria-modal="true" aria-label="删除世界项目">
        <div class="modal__head">
          <div><h2 class="modal__title">要让这个世界项目沉没吗？</h2></div>
          <button class="modal__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
        </div>
        <div class="modal__body">
          <p class="modal__note">《${escapeHtml(world.definition.title)}》作为完整的故事文件夹删除：所有纪元、事件、事实与知识账本，将同时删除其中 <b>${sceneCount}</b> 个聚焦场景，不可恢复。需要留存的话，可先导出战报。</p>
          <p class="modal__note modal__note--dim"><a href="/api/worlds/${encodeURIComponent(world.id)}/export.md" download>导出世界战报（Markdown）</a></p>
        </div>
        <div class="modal__foot">
          <button class="btn btn--quiet btn--sm" data-act="close-overlay">保留</button>
          <button class="btn btn--danger btn--sm" data-act="delete-world-confirm">${icon('trash', 13)} 删除世界项目</button>
        </div>
      </section>
    </div>`);
}

export function closeOverlay() {
  modalLayer.hidden = true;
  modalLayer.innerHTML = '';
  document.body.style.overflow = '';
  state.modalOpen = false;
  state.drawerCharacterId = null;
}

/* ---- 世界角色 / 势力档案 ---- */

export function renderWorldActorDrawer(world, actorId) {
  const actor = worldActor(world, actorId);
  const runtime = world.actors[actorId];
  if (!actor || !runtime) return;
  const region = worldRegion(world, runtime.regionId);
  const faction = actor.factionId ? worldFaction(world, actor.factionId) : null;
  const known = world.facts
    .filter((fact) => fact.retiredAtEpoch === null && fact.knownBy.includes(actorId))
    .sort((a, b) => b.importance - a.importance || b.createdEpoch - a.createdEpoch);
  const unknown = world.facts.filter((fact) => fact.retiredAtEpoch === null && !fact.knownBy.includes(actorId));
  const relevantEvents = world.events.filter((event) => event.actorIds.includes(actorId)).slice(-4).reverse();
  const secretBlur = state.godView ? '' : 'secret-blur';
  const conditions = runtime.conditions || [];
  const memories = actor.memories || [];
  showModal(`
    <div class="drawer-backdrop" data-act="close-overlay"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="${attr(actor.name)} 的世界档案">
      <div class="drawer__head">
        <span class="drawer__head-label">世界角色</span>
        <button class="drawer__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
      </div>
      <div class="drawer__hero">
        <div class="drawer__identity">
          ${avatar(actor, 'lg')}
          <div>
            <h2 class="drawer__name">${escapeHtml(actor.name)}</h2>
            <div class="drawer__title">${escapeHtml(actor.title)}${actor.age ? ` · ${escapeHtml(actor.age)} 岁` : ''}${actor.pronouns ? ` · ${escapeHtml(actor.pronouns)}` : ''}</div>
            <div class="drawer__place">${icon('map', 12)} ${escapeHtml(region?.name || '未知')}${faction ? `｜${escapeHtml(faction.name)}` : ''}${actor.spotlight ? ' <span class="tag tag--gold">聚光</span>' : ''}</div>
          </div>
        </div>
        <p class="drawer__profile">${escapeHtml(actor.publicProfile)}</p>
        ${state.godView && actor.appearance ? `<p class="drawer__profile side-dim">${escapeHtml(actor.appearance)}</p>` : ''}
      </div>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>此刻</span></div>
        <div class="inner-block">
          <div class="inner-item"><span>世界层目标</span><p>${escapeHtml(actor.agenda)}</p></div>
          <div class="inner-item"><span>当前状态</span><p>${escapeHtml(runtime.status)}｜紧张 ${runtime.stress}/10</p></div>
          <div class="inner-item"><span>秘密 <button class="secret-toggle" data-act="reveal-secret">揭示</button></span><p class="${secretBlur}">${escapeHtml(actor.secret)}</p></div>
        </div>
      </section>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>能力</span></div>
        <div class="attr-grid">
          ${Object.entries(actor.abilities)
            .map(
              ([key, value]) => `<div class="attr-row"><span class="attr-row__label">${escapeHtml(ABILITY_LABELS[key])}</span><span class="attr-row__pips">${Array.from({ length: 10 }, (_, index) => `<i class="${index < value ? 'is-on' : ''}"></i>`).join('')}</span><span class="attr-row__value">${String(value).padStart(2, '0')}</span></div>`,
            )
            .join('')}
        </div>
      </section>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>状态与物品</span></div>
        <div class="cond-list">${conditions.length ? conditions.map((condition) => `<div class="cond-row"><div class="cond-row__name"><span>${escapeHtml(condition.name)}</span><span class="neg">${condition.modifier > 0 ? '+' : ''}${condition.modifier}</span></div><p>${escapeHtml(condition.description)}</p></div>`).join('') : '<div class="drawer-empty">没有持续中的世界状态。</div>'}</div>
        <div class="inv-list" style="margin-top:12px">${actor.possessions.map((item) => `<span class="inv-item">${escapeHtml(item)}</span>`).join('')}</div>
      </section>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>认知</span><span>${known.length} 已知 · ${unknown.length} 未知</span></div>
        <div class="know-list">
          ${known.slice(0, 12).map((fact) => `<div class="know-row"><i class="know-mark">${icon('check', 10)}</i><p>${escapeHtml(fact.text)}</p></div>`).join('') || '<div class="drawer-empty">尚未获得世界事实。</div>'}
          ${state.godView ? unknown.slice(0, 8).map((fact) => `<div class="know-row know-row--unknown"><i class="know-mark">?</i><p>${escapeHtml(fact.text)}</p></div>`).join('') : ''}
        </div>
      </section>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>初始记忆</span></div>
        <div class="memory-list">${memories.length ? memories.map((memory) => `<div class="memory-row"><div class="memory-row__meta">重要度 ${memory.importance}</div><p>${escapeHtml(memory.summary)}${memory.detail ? `<i class="side-dim">${escapeHtml(memory.detail)}</i>` : ''}</p></div>`).join('') : '<div class="drawer-empty">没有额外记忆。</div>'}</div>
      </section>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>最近参与</span></div>
        <div class="event-links">${relevantEvents.length ? relevantEvents.map((event) => `<button data-act="open-world-event" data-event="${attr(event.id)}"><span>${escapeHtml(event.clock.display)}</span>${escapeHtml(event.title)}</button>`).join('') : '<div class="drawer-empty">还没有直接参与世界事件。</div>'}</div>
      </section>
    </aside>`);
}

export function renderWorldFactionDrawer(world, factionId) {
  const faction = worldFaction(world, factionId);
  const runtime = world.factions[factionId];
  if (!faction || !runtime) return;
  const known = world.facts
    .filter((fact) => fact.retiredAtEpoch === null && fact.knownBy.includes(factionId))
    .sort((a, b) => b.importance - a.importance);
  const leader = faction.leaderActorId ? worldActor(world, faction.leaderActorId) : null;
  const threads = world.definition.setting.threads.filter((thread) => thread.involvedFactionIds.includes(factionId));
  showModal(`
    <div class="drawer-backdrop" data-act="close-overlay"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="${attr(faction.name)} 的势力档案">
      <div class="drawer__head">
        <span class="drawer__head-label">势力档案</span>
        <button class="drawer__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
      </div>
      <div class="drawer__hero">
        <div class="drawer__identity">
          <span class="sigil sigil--lg" style="--faction-color:${attr(safeWorldColor(faction.color, '#9aae9f'))}">${escapeHtml(faction.sigil?.[0] || faction.name[0])}</span>
          <div>
            <h2 class="drawer__name">${escapeHtml(faction.name)}</h2>
            <div class="drawer__title">${escapeHtml(faction.description)}</div>
          </div>
        </div>
        <div class="stat-grid">
          <div><span>力量</span><b>${runtime.power}/10</b></div>
          <div><span>合法性</span><b>${runtime.legitimacy}/10</b></div>
          ${Object.entries(runtime.resources).slice(0, 3).map(([key, value]) => `<div><span>${escapeHtml(WORLD_RESOURCE_LABELS[key] || key)}</span><b>${Math.round(value)}</b></div>`).join('')}
        </div>
        <p class="drawer__profile">${escapeHtml(faction.goal)}</p>
        <div class="inner-item"><span>秘密 <button class="secret-toggle" data-act="reveal-secret">揭示</button></span><p class="${state.godView ? '' : 'secret-blur'}">${escapeHtml(faction.secret)}</p></div>
      </div>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>关系态度</span></div>
        ${Object.entries(runtime.attitudes).map(([id, value]) => `<div class="attitude-row"><span>${escapeHtml(worldEntityName(world, id))}</span><b class="${value < 0 ? 'neg' : 'pos'}">${value > 0 ? '+' : ''}${value}</b></div>`).join('') || '<div class="drawer-empty">没有明确态度。</div>'}
      </section>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>领袖与线程</span></div>
        ${leader ? `<button class="leader-link" data-act="open-world-actor" data-actor="${attr(leader.id)}">${avatar(leader, 'sm')}${escapeHtml(leader.name)} · ${escapeHtml(leader.title)}</button>` : '<div class="drawer-empty">没有具名领袖。</div>'}
        <div class="thread-mini">${threads.map((thread) => `<span class="tag">${escapeHtml(thread.title)}</span>`).join('')}</div>
      </section>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>已知事实</span><span>${known.length}</span></div>
        <div class="know-list">${known.slice(0, 14).map((fact) => `<div class="know-row"><i class="know-mark">${icon('check', 10)}</i><p>${escapeHtml(fact.text)}</p></div>`).join('') || '<div class="drawer-empty">该势力尚未获得事实。</div>'}</div>
      </section>
    </aside>`);
}

/* ---- 世界事件档案 ---- */

export function renderWorldEventModal(world, eventId) {
  const event = world.events.find((entry) => entry.id === eventId);
  if (!event) return;
  const region = event.regionId ? worldRegion(world, event.regionId) : null;
  const parent = event.parentId ? world.events.find((entry) => entry.id === event.parentId) : null;
  const children = event.childIds.map((id) => world.events.find((entry) => entry.id === id)).filter(Boolean);
  const facts = event.effects.factIdsAdded.map((id) => world.facts.find((fact) => fact.id === id)).filter(Boolean);
  const signals = event.signalIds.map((id) => world.signals.find((signal) => signal.id === id)).filter(Boolean);
  const hook = event.sceneHookId ? world.sceneHooks.find((entry) => entry.id === event.sceneHookId) : null;
  const actorNames = event.actorIds.map((id) => worldActor(world, id)).filter(Boolean);
  const factionNames = event.factionIds.map((id) => worldFaction(world, id)).filter(Boolean);
  showModal(`
    <div class="modal-backdrop" data-act="close-overlay"></div>
    <div class="modal-shell">
      <section class="modal modal--wide" role="dialog" aria-modal="true" aria-label="${attr(event.title)}">
        <div class="modal__head">
          <div>
            <span class="modal__kicker">${escapeHtml(event.clock.display)} · ${escapeHtml(region?.name || '世界层')}</span>
            <h2 class="modal__title">${escapeHtml(event.title)}</h2>
          </div>
          <button class="modal__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
        </div>
        <div class="modal__body">
          <div class="event-meta">
            <span class="tag">${event.visibility === 'public' ? '公开' : event.visibility === 'secret' ? '秘密' : '混合'}</span>
            ${parent ? `<button class="tag tag--button" data-act="open-world-event" data-event="${attr(parent.id)}">父事件 · ${escapeHtml(parent.title)}</button>` : ''}
            ${children.map((child) => `<button class="tag tag--button" data-act="open-world-event" data-event="${attr(child.id)}">子事件 · ${escapeHtml(child.title)}</button>`).join('')}
          </div>
          <p class="event-summary">${escapeHtml(event.summary)}</p>
          ${event.publicNarrative ? `<div class="event-public"><span>公开可见版本</span>${paragraphHtml(event.publicNarrative)}</div>` : ''}
          <div class="event-columns">
            <section>
              <h3>参与者</h3>
              <div class="event-people">
                ${actorNames.map((actor) => `<button data-act="open-world-actor" data-actor="${attr(actor.id)}">${avatar(actor, 'sm')}${escapeHtml(actor.name)}</button>`).join('')}
                ${factionNames.map((faction) => `<button data-act="open-world-faction" data-faction="${attr(faction.id)}"><span class="sigil sigil--sm" style="--faction-color:${attr(safeWorldColor(faction.color, '#9aae9f'))}">${escapeHtml(faction.sigil?.[0] || faction.name[0])}</span>${escapeHtml(faction.name)}</button>`).join('')}
              </div>
            </section>
            <section>
              <h3>新增事实</h3>
              <div class="event-facts">${facts.length ? facts.map((fact) => `<div><p>${escapeHtml(fact.text)}</p><small>知道：${escapeHtml(knownByWorld(world, fact.knownBy))}</small></div>`).join('') : '<span class="side-dim">无新事实。</span>'}</div>
            </section>
          </div>
          ${signals.length ? `<section class="event-section"><h3>${event.kind === 'signal' ? '抵达的讯息' : '事件发出的信号'}</h3>${signals.map((signal) => {
            const carried = signal.factIds.map((id) => world.facts.find((fact) => fact.id === id)).filter(Boolean);
            return `<div class="event-signal"><span>${escapeHtml(signal.channel)}</span><b>${formatArrival(world, signal.arrivesAt)}${signal.status === 'delivered' ? ' · 已送达' : ' · 仍在路上'}</b><p>${escapeHtml(signal.content)}</p><small>→ ${escapeHtml(knownByWorld(world, signal.toEntityIds))}</small>${carried.length ? `<div class="event-signal__facts">${carried.map((fact) => `<em>${escapeHtml(truncateText(fact.text, 180))}</em>`).join('')}</div>` : ''}</div>`;
          }).join('')}</section>` : ''}
          ${event.effects.regionChanges.length || event.effects.factionChanges.length || event.effects.actorChanges.length || event.effects.threadChanges.length ? `<section class="event-section"><h3>世界状态变化</h3><div class="event-effects">
            ${event.effects.regionChanges.map((change) => `<div><span>区域</span><b>${escapeHtml(worldEntityName(world, change.regionId))}</b><p>${escapeHtml(change.status || '')}${Object.keys(change.resourceDeltas).length ? `｜${Object.entries(change.resourceDeltas).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join('、')}` : ''}</p></div>`).join('')}
            ${event.effects.factionChanges.map((change) => `<div><span>势力</span><b>${escapeHtml(worldEntityName(world, change.factionId))}</b><p>${change.powerDelta ? `力量 ${change.powerDelta > 0 ? '+' : ''}${change.powerDelta} ` : ''}${change.legitimacyDelta ? `合法性 ${change.legitimacyDelta > 0 ? '+' : ''}${change.legitimacyDelta}` : ''}${change.status ? `｜${escapeHtml(change.status)}` : ''}</p></div>`).join('')}
            ${event.effects.actorChanges.map((change) => `<div><span>角色</span><b>${escapeHtml(worldEntityName(world, change.actorId))}</b><p>${change.status ? `${escapeHtml(change.status)}｜` : ''}${change.stressDelta ? `紧张 ${change.stressDelta > 0 ? '+' : ''}${change.stressDelta}｜` : ''}${change.conditionsAdd.map((condition) => condition.name).join('、')}</p></div>`).join('')}
            ${event.effects.threadChanges.map((change) => `<div><span>线程</span><b>${escapeHtml(worldEntityName(world, change.threadId))}</b><p>${change.note || ''}${change.tensionDelta ? `｜紧张 ${change.tensionDelta > 0 ? '+' : ''}${change.tensionDelta}` : ''}</p></div>`).join('')}
          </div></section>` : ''}
          ${hook ? `<section class="event-section"><h3>关联聚焦场景</h3>${worldSceneHook(world, hook, { archived: hook.epochIndex !== world.epochs.at(-1)?.index })}</section>` : ''}
        </div>
        <div class="modal__foot"><button class="btn btn--ghost btn--sm" data-act="close-overlay">合上事件档案</button></div>
      </section>
    </div>`);
}

/* ---- 世界概述 / 事实账本 ---- */

export function openWorldOverview() {
  const world = state.currentWorld;
  if (!world) return;
  showModal(`
    <div class="modal-backdrop" data-act="close-overlay"></div>
    <div class="modal-shell">
      <section class="modal" role="dialog" aria-modal="true" aria-label="世界概述">
        <div class="modal__head">
          <div><span class="modal__kicker">${escapeHtml(world.definition.kicker)}</span><h2 class="modal__title">${escapeHtml(world.definition.title)}</h2></div>
          <button class="modal__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
        </div>
        <div class="modal__body">
          <div class="prose">${paragraphHtml(world.definition.setting.overview)}</div>
        </div>
        <div class="modal__foot"><button class="btn btn--ghost btn--sm" data-act="close-overlay">合上</button></div>
      </section>
    </div>`);
}

export function openWorldFactsModal() {
  const world = state.currentWorld;
  if (!world) return;
  const active = world.facts.filter((fact) => fact.retiredAtEpoch === null).sort((a, b) => b.createdEpoch - a.createdEpoch || b.importance - a.importance);
  const retired = world.facts.filter((fact) => fact.retiredAtEpoch !== null).slice(-8);
  showModal(`
    <div class="modal-backdrop" data-act="close-overlay"></div>
    <div class="modal-shell">
      <section class="modal modal--wide" role="dialog" aria-modal="true" aria-label="世界事实账本">
        <div class="modal__head">
          <div><h2 class="modal__title">事实账本</h2></div>
          <button class="modal__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
        </div>
        <div class="modal__body">
          <p class="modal__note">客观事实不会自动变成所有人的认知。每一条事实下方的“知道”才是此刻真实的传播结果。</p>
          <div class="facts-modal-list">${active.map((fact) => `<div class="fact-entry ${fact.public ? 'is-public' : ''}"><div><span class="tag">${fact.public ? '公开' : '限制'}</span><span class="fact-entry__tag">${escapeHtml(fact.tag)}</span></div><p>${escapeHtml(fact.text)}</p><small>知道：${escapeHtml(knownByWorld(world, fact.knownBy))}${fact.sourceEventId ? `｜来源事件 ${escapeHtml(fact.sourceEventId.slice(-6))}` : ''}</small></div>`).join('')}</div>
          ${retired.length ? `<h3 class="facts-modal__retired-title">已失效</h3>${retired.map((fact) => `<div class="fact-entry is-retired"><p>${escapeHtml(fact.text)}</p><small>失效于第 ${fact.retiredAtEpoch + 1} 纪元</small></div>`).join('')}` : ''}
        </div>
        <div class="modal__foot"><button class="btn btn--ghost btn--sm" data-act="close-overlay">合上账本</button></div>
      </section>
    </div>`);
}

/* ---- 线程档案抽屉 ---- */

const THREAD_STATUS_LABELS = { active: '进行中', resolved: '已了结', failed: '已失败' };

export function openWorldThreadDrawer(threadId) {
  const world = state.currentWorld;
  if (!world) return;
  const thread = worldThread(world, threadId);
  const runtime = world.threads[threadId];
  if (!thread) return;
  const clockValue = runtime?.clockValue ?? thread.clock.value;
  const tension = runtime?.tension ?? thread.tension;
  const ratio = Math.min(100, Math.max(0, (clockValue / thread.clock.max) * 100));
  const notes = [...(runtime?.history ?? [])].reverse();
  const events = world.events.filter((event) =>
    event.effects.threadChanges.some((change) => change.threadId === threadId),
  );
  showModal(`
    <div class="drawer-backdrop" data-act="close-overlay"></div>
    <aside class="drawer" role="dialog" aria-modal="true" aria-label="${attr(thread.title)} 的线程档案">
      <div class="drawer__head">
        <span class="drawer__head-label">线程档案</span>
        <button class="drawer__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
      </div>
      <div class="drawer__hero">
        <div class="drawer__identity">
          <div>
            <h2 class="drawer__name">${escapeHtml(thread.title)}</h2>
            <div class="drawer__title"><span class="status-pill status-pill--${runtime?.status === 'resolved' ? 'ended' : runtime?.status === 'failed' ? 'error' : 'running'}">${THREAD_STATUS_LABELS[runtime?.status || thread.status] || '进行中'}</span></div>
          </div>
        </div>
        <div class="stat-grid">
          <div><span>紧张</span><b>${tension}/10</b></div>
          <div><span>${escapeHtml(thread.clock.label)}</span><b>${clockValue}/${thread.clock.max} ${escapeHtml(thread.clock.unit)}</b></div>
        </div>
        <div class="meter meter--drawer"><span style="width:${ratio.toFixed(0)}%"></span></div>
        <p class="drawer__profile">${escapeHtml(thread.clock.onFill)}</p>
      </div>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>问题与赌注</span></div>
        <div class="inner-block">
          <div class="inner-item"><span>问题</span><p>${escapeHtml(thread.question)}</p></div>
          <div class="inner-item"><span>赌注</span><p>${escapeHtml(thread.stakes)}</p></div>
        </div>
      </section>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>涉及势力 / 区域</span></div>
        <div class="thread-mini">
          ${thread.involvedFactionIds.map((id) => `<span class="tag">${escapeHtml(worldEntityName(world, id))}</span>`).join('')}
          ${thread.involvedRegionIds.map((id) => `<span class="tag">${escapeHtml(worldEntityName(world, id))}</span>`).join('')}
          ${!thread.involvedFactionIds.length && !thread.involvedRegionIds.length ? '<div class="drawer-empty">没有圈定范围。</div>' : ''}
        </div>
      </section>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>逐纪元笔记</span><span>${notes.length}</span></div>
        <div class="memory-list">
          ${notes.length
            ? notes.map((note) => `<div class="memory-row"><div class="memory-row__meta">第 ${note.epochIndex + 1} 纪元</div><p>${escapeHtml(note.note)}</p></div>`).join('')
            : '<div class="drawer-empty">还没有写下演变笔记。</div>'}
        </div>
      </section>
      <section class="drawer__section">
        <div class="drawer__section-head"><span>关联事件</span><span>${events.length}</span></div>
        <div class="event-links">
          ${events.length
            ? events.map((event) => `<button data-act="open-world-event" data-event="${attr(event.id)}"><span>${escapeHtml(event.clock.display)}</span>${escapeHtml(event.title)}</button>`).join('')
            : '<div class="drawer-empty">还没有事件推动过这条线程。</div>'}
        </div>
      </section>
    </aside>`);
}

/* ---- 扮演模式：复盘 ---- */

function recapRollText(roll, { outcome = true } = {}) {
  if (!roll) return '';
  const parts = [
    `d20 ${roll.natural}`,
    `${escapeHtml(ABILITY_LABELS[roll.ability] || roll.ability)} +${roll.abilityValue}`,
  ];
  if (roll.traitName) parts.push(`${escapeHtml(roll.traitName)} +${roll.traitBonus}`);
  if (roll.conditionBonus) {
    parts.push(`状态 ${roll.conditionBonus > 0 ? '+' : ''}${roll.conditionBonus}`);
  }
  if (roll.situationalBonus) {
    parts.push(`裁定 ${roll.situationalBonus > 0 ? '+' : ''}${roll.situationalBonus}`);
  }
  if (roll.penalty) parts.push(`惩罚 ${roll.penalty}`);
  const target =
    roll.opponentTotal !== undefined && roll.opponentTotal !== null
      ? `回应总值 ${roll.opponentTotal}`
      : `DC ${roll.dc ?? '—'}`;
  const margin = roll.margin ?? 0;
  return `${parts.join(' + ')} = <b>${roll.total}</b>｜${target}｜差值 ${margin >= 0 ? '+' : ''}${margin}${outcome && roll.tier ? `｜<b>${escapeHtml(OUTCOME_LABELS[roll.tier] || roll.tier)}</b>` : ''}${roll.criticalByNatural20 ? '｜自然 20' : ''}`;
}

function recapBeatHtml(run, beat) {
  const actionHtml = (beat.actions || [])
    .map((action) => {
      const name = characterName(run, action.characterId);
      const target = action.targetId ? ` → ${characterName(run, action.targetId)}` : '';
      const adjudication = (beat.adjudications || []).find((entry) => entry.actionId === action.id);
      const outcome =
        action.status === 'abandoned'
          ? '放下原举动'
          : OUTCOME_LABELS[action.outcome] || '未结算';
      return `<article class="recap-action">
        <header class="recap-action__head">
          <b>${escapeHtml(name)}</b><span>${escapeHtml(action.summary || '（未命名）')}${escapeHtml(target)}</span>
          <em class="verdict verdict--${OUTCOME_CLASS_FOR[action.outcome] || 'unknown'}">${escapeHtml(outcome)}</em>
        </header>
        <p class="act__desc">${escapeHtml(action.deed || action.description || '')}</p>
        ${action.effect ? `<p class="act__effect">想要的效果：${escapeHtml(action.effect)}</p>` : ''}
        ${action.dialogue ? `<p class="act__quote">${escapeHtml(action.dialogue)}</p>` : ''}
        ${action.thought ? `<div class="thought"><span>内心</span>${escapeHtml(action.thought)}</div>` : ''}
        ${action.stakes ? `<p class="act__note">赌注：${escapeHtml(action.stakes)}</p>` : ''}
        ${adjudication ? `<p class="act__adj"><b>裁定</b> DC ${adjudication.dc}（${escapeHtml(adjudication.difficultyLabel)}）${adjudication.modifier ? ` / 修正 ${adjudication.modifier > 0 ? '+' : ''}${adjudication.modifier}` : ''}｜${escapeHtml(adjudication.reason)}｜风险：${escapeHtml(adjudication.risk)}</p>` : ''}
        ${action.roll ? `<p class="recap-roll mono">${recapRollText(action.roll)}</p>` : ''}
        ${action.outcomeNote ? `<p class="act__note">${escapeHtml(action.outcomeNote)}</p>` : ''}
      </article>`;
    })
    .join('');
  const reactionHtml = (beat.reactions || [])
    .map((reaction) => {
      const name = characterName(run, reaction.characterId);
      return `<article class="recap-action recap-action--reaction">
        <header class="recap-action__head"><b>${escapeHtml(name)}</b><span>${escapeHtml(reaction.summary || '回应')}（${escapeHtml(reaction.stance || '')}）</span><em>${reaction.continueOriginal ? '继续原举动' : '放下原举动'}</em></header>
        ${reaction.description ? `<p class="act__desc">${escapeHtml(reaction.description)}</p>` : ''}
        ${reaction.dialogue ? `<p class="act__quote">${escapeHtml(reaction.dialogue)}</p>` : ''}
        ${reaction.thought ? `<div class="thought"><span>内心</span>${escapeHtml(reaction.thought)}</div>` : ''}
        ${reaction.roll ? `<p class="recap-roll mono">${recapRollText(reaction.roll, { outcome: false })}</p>` : ''}
      </article>`;
    })
    .join('');
  const externalHtml = (beat.externalEvents || [])
    .map(
      (event) => `<div class="recap-external"><b>${escapeHtml(event.description)}</b>
        <span class="mono">d20 ${event.natural} vs DC ${event.dc} · ${event.success ? '发生' : '未发生'}</span>
        <p>${escapeHtml(event.fact)}</p>
        ${event.reason ? `<small>${escapeHtml(event.reason)}</small>` : ''}</div>`,
    )
    .join('');
  const notesHtml = (beat.outcomeNotes || [])
    .map(
      (note) => `<p class="act__note"><b>${escapeHtml(characterName(run, note.characterId))}</b>：${escapeHtml(note.note)}</p>`,
    )
    .join('');
  const cueHtml = (beat.privateCues || [])
    .map(
      (cue) => `<div class="cue"><span>${escapeHtml(characterName(run, cue.characterId))}</span><p>${escapeHtml(cue.cue)}</p></div>`,
    )
    .join('');
  const changes = beat.stateChanges;
  const changeHtml = changes
    ? `${changes.characters
        .map((change) => {
          const pieces = [];
          if (change.stressDelta) pieces.push(`紧张 ${change.stressDelta > 0 ? '+' : ''}${change.stressDelta}`);
          if (change.conditionsAdd.length) pieces.push(`状态 +${change.conditionsAdd.map((condition) => condition.name).join('、')}`);
          if (change.conditionsRemove.length) pieces.push(`状态 -${change.conditionsRemove.join('、')}`);
          if (change.inventoryAdd.length) pieces.push(`获得 ${change.inventoryAdd.join('、')}`);
          if (change.inventoryRemove.length) pieces.push(`失去 ${change.inventoryRemove.join('、')}`);
          if (change.privateNote) pieces.push(`私密笔记：${change.privateNote}`);
          if (change.memory) pieces.push(`记忆：${change.memory.summary}`);
          return pieces.length
            ? `<div class="recap-change"><b>${escapeHtml(characterName(run, change.characterId))}</b><span>${escapeHtml(pieces.join('；'))}</span></div>`
            : '';
        })
        .join('')}
        ${changes.world.factsAdd.length ? `<div class="recap-change"><b>公开事实 +</b><span>${escapeHtml(changes.world.factsAdd.join('；'))}</span></div>` : ''}
        ${changes.world.factsRemove.length ? `<div class="recap-change"><b>公开事实 −</b><span>${escapeHtml(changes.world.factsRemove.join('；'))}</span></div>` : ''}
        ${Object.keys(changes.world.flagsSet || {}).length ? `<div class="recap-change"><b>flags</b><span class="mono">${escapeHtml(JSON.stringify(changes.world.flagsSet))}</span></div>` : ''}`
    : '';
  return `<details class="recap-beat">
    <summary><b>第 ${beat.index + 1} 刻</b><span>${escapeHtml(beat.clock.display)} · ${escapeHtml(beat.title)}</span><i>${beat.actions.length} 举动 · ${beat.reactions.length} 回应</i></summary>
    <div class="recap-beat__body">
      ${beat.gmNote ? `<div class="cue cue--gm"><span>导演幕后注</span><p>${escapeHtml(beat.gmNote)}</p></div>` : ''}
      ${cueHtml ? `<div class="recap-block"><h4>私密线索</h4>${cueHtml}</div>` : ''}
      <div class="recap-block"><h4>举动</h4>${actionHtml || '<p class="side-empty">没有举动。</p>'}</div>
      ${reactionHtml ? `<div class="recap-block"><h4>回应</h4>${reactionHtml}</div>` : ''}
      ${externalHtml ? `<div class="recap-block"><h4>外部事件</h4>${externalHtml}</div>` : ''}
      ${notesHtml ? `<div class="recap-block"><h4>幕后记录</h4>${notesHtml}</div>` : ''}
      ${changeHtml ? `<div class="recap-block"><h4>状态变化</h4>${changeHtml}</div>` : ''}
      <div class="recap-block"><h4>公开叙事</h4><div class="prose prose--recap">${paragraphHtml(beat.narration || '')}</div></div>
      ${beat.nextTimeJump ? `<p class="side-note">时间推进 ${beat.nextTimeJump.elapsedMinutes} 分钟：${escapeHtml(beat.nextTimeJump.reason)}（${escapeHtml(beat.nextTimeJump.label)}）</p>` : ''}
    </div>
  </details>`;
}

const OUTCOME_CLASS_FOR = {
  critical_success: 'crit',
  success: 'ok',
  soft_failure: 'softfail',
};

export function openConfirmRecap() {
  const run = state.currentRun;
  if (!run) return;
  if (!isPlayRun(run) || playRevealed(run)) {
    openRecap();
    return;
  }
  const completed = completeBeats(run).length;
  showModal(`
    <div class="modal-backdrop" data-act="close-overlay"></div>
    <div class="modal-shell">
      <section class="modal modal--narrow" role="dialog" aria-modal="true" aria-label="复盘确认">
        <div class="modal__head">
          <div><h2 class="modal__title">要让幕后亮起来吗？</h2></div>
          <button class="modal__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
        </div>
        <div class="modal__body">
          <p class="modal__note">复盘会一次性公开所有人的秘密、欲望、恐惧、内心、effect、检定与导演幕后注。${run.ending ? '故事已经收束，这是最后的阅读。' : `本场目前完成了 ${completed} 刻，现在复盘意味着故事停在这里。`}</p>
          <p class="modal__note modal__note--dim">复盘之后本场结束，不能继续推进。若想继续这个故事，请另起一场。</p>
        </div>
        <div class="modal__foot">
          <button class="btn btn--quiet btn--sm" data-act="close-overlay">再等等</button>
          <button class="btn btn--primary btn--sm" data-act="recap-confirm">${icon('eye', 13)} 确认复盘</button>
        </div>
      </section>
    </div>`);
}

export function openRecap() {
  const run = state.currentRun;
  if (!run || !isPlayRun(run) || !playRevealed(run)) return;
  const playerId = playCharacterId(run);
  const characters = run.scenario.characters
    .map(
      (character) => `<article class="recap-character">
        <header class="recap-character__head">
          ${avatar(character, 'sm')}
          <b>${escapeHtml(character.name)}</b>
          <span>${escapeHtml(character.title)}</span>
          ${character.id === playerId ? '<span class="tag tag--gold">你扮演</span>' : ''}
        </header>
        <p class="drawer__profile">${escapeHtml(character.publicProfile)}</p>
        <div class="inner-block">
          <div class="inner-item"><span>性格</span><p>${escapeHtml(character.personality)}</p></div>
          <div class="inner-item"><span>欲望</span><p>${escapeHtml(character.desire)}</p></div>
          <div class="inner-item"><span>恐惧</span><p>${escapeHtml(character.fear)}</p></div>
          <div class="inner-item"><span>秘密</span><p>${escapeHtml(character.secret)}</p></div>
        </div>
        <p class="side-note">能力：${Object.entries(character.abilities || {}).map(([key, value]) => `${escapeHtml(ABILITY_LABELS[key] || key)} ${value}`).join('｜')}${character.traits?.length ? `｜特质：${character.traits.map((trait) => escapeHtml(trait.name)).join('、')}` : ''}</p>
      </article>`,
    )
    .join('');
  const beats = completeBeats(run).map((beat) => recapBeatHtml(run, beat)).join('');
  const canon = [
    run.scenario.world.hiddenCanon
      ? `<div class="recap-canon__item"><h4>导演级真相</h4><p>${escapeHtml(run.scenario.world.hiddenCanon)}</p></div>`
      : '',
    run.scenario.world.directorNotes
      ? `<div class="recap-canon__item"><h4>导演笔记</h4><p>${escapeHtml(run.scenario.world.directorNotes)}</p></div>`
      : '',
  ].join('');
  showModal(`
    <div class="modal-backdrop" data-act="close-overlay"></div>
    <div class="modal-shell">
      <section class="modal modal--wide recap-modal" role="dialog" aria-modal="true" aria-label="完整复盘">
        <div class="modal__head">
          <div>
            <span class="modal__kicker">复盘 · 全部幕后信息</span>
            <h2 class="modal__title">《${escapeHtml(run.scenario.title)}》</h2>
          </div>
          <button class="modal__close" data-act="close-overlay" aria-label="关闭">${icon('close', 15)}</button>
        </div>
        <div class="modal__body">
          <div class="recap-intro">
            <p>你扮演的是 <b>${escapeHtml(characterName(run, playerId))}</b>。这一刻之后，你不再被角色的认知边界限制。</p>
            ${run.ending ? `<div class="recap-ending"><span class="tag tag--gold">终章</span><b>${escapeHtml(run.ending.headline)}</b><div class="prose prose--recap">${paragraphHtml(run.ending.epilogue)}</div>${run.ending.finalImage ? `<p class="ending__image">${escapeHtml(run.ending.finalImage)}</p>` : ''}</div>` : '<p class="side-note">本场没有终章：你在故事中途选择了复盘。</p>'}
          </div>
          ${canon ? `<section class="recap-section"><h3>剧本背后</h3><div class="recap-canon">${canon}</div></section>` : ''}
          <section class="recap-section"><h3>所有人的底牌</h3><div class="recap-cast">${characters}</div></section>
          <section class="recap-section">
            <div class="recap-section__bar"><h3>逐刻全记录</h3><div class="recap-tools"><button class="text-link" data-act="recap-expand">展开全部</button><button class="text-link" data-act="recap-collapse">收起全部</button></div></div>
            <div class="recap-beats">${beats || '<p class="side-empty">还没有完成的时刻。</p>'}</div>
          </section>
        </div>
        <div class="modal__foot">
          <a class="btn btn--ghost btn--sm" href="/api/runs/${encodeURIComponent(run.id)}/export.md" download>${icon('download', 13)} 导出完整战报</a>
          <button class="btn btn--quiet btn--sm" data-act="close-overlay">合上复盘</button>
        </div>
      </section>
    </div>`);
}

/* ---- 打开入口 ---- */

export function openWorldEvent(eventId) {
  if (!state.currentWorld) return;
  renderWorldEventModal(state.currentWorld, eventId);
}

export function openWorldActor(actorId) {
  if (!state.currentWorld) return;
  renderWorldActorDrawer(state.currentWorld, actorId);
}

export function openWorldFaction(factionId) {
  if (!state.currentWorld) return;
  renderWorldFactionDrawer(state.currentWorld, factionId);
}
