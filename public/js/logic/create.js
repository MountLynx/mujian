/* 建场流程：预置/自定义、手稿校验、模板载入、文件导入、设置读取。 */

import { state } from '../state.js';
import { api } from '../api.js';
import { toast, setBusyButton } from '../dom.js';
import { renderCreatePage } from '../render/create.js';

export async function loadCreatePage() {
  state.view = 'new';
  document.title = '新建推演 · 幕间';
  if (!state.health) await loadBaseDataFallback();
  renderCreatePage();
}

async function loadBaseDataFallback() {
  const results = await Promise.allSettled([api('/api/health'), api('/api/scenarios')]);
  if (results[0].status === 'fulfilled') state.health = results[0].value;
  if (results[1].status === 'fulfilled') state.scenarios = results[1].value.scenarios || [];
}

/* 一份可直接开跑的示例手稿。 */
export function blankScenarioTemplate() {
  return {
    title: '晚潮公馆',
    subtitle: '一场被暴雨困住的葬礼，和一个不该出现在宾客名单上的名字。',
    kicker: '暴雨夜 · 第三次守灵',
    world: {
      title: '晚潮公馆',
      era: '架空近代 · 海湾孤宅',
      tone: '阴郁克制的家族悬疑；不靠惊吓，靠每个人不肯说完整的那半句话。',
      setting:
        '晚潮公馆坐落在一条每逢暴雨就会断桥的岬角上。今晚是老太爷的第三次守灵夜，律师会在零点宣读遗嘱。屋里的人都知道，遗嘱里有一个本不该存在的继承人。\n\n电话线在傍晚断了，车钥匙少了一把。没有人能离开，也没有人愿意先承认自己回来是为了什么。',
      location: '晚潮公馆：一栋临海的旧宅。一楼是灵堂与会客厅，二楼是书房和锁着的卧室，塔楼里有一台老式电台。',
      dateLabel: '守灵第三夜',
      startClock: '23:10',
      premise: '律师的船被风浪耽搁，遗嘱副本却不翼而飞。宾客中有人收到一封以死者名义写来的信，知道自己被算计了。',
      opening:
        '二十三时十分，风暴把落地窗敲得像有人在外面用指节数数。\n\n灵堂里的白烛烧到一半，老太爷的遗像旁多出一把湿淋淋的黑伞，伞骨上挂着不属于这个季节的海藻。律师的皮箱开着，遗嘱副本不见了。楼梯口传来一声轻咳，所有人同时想起：这栋房子里，本该只有五个活人。',
      directorNotes:
        '让秘密在行动和证物里显形，不要用旁白直接宣判。每个人的目标都可以合理，合理的目标才会撞在一起。',
      hiddenCanon:
        '（可选，仅导演知道。）遗嘱真正指定的继承人是早年被认为夭折的女儿；她一直以另一个身份活在这栋房子里。',
      initialFacts: ['遗嘱副本失踪。', '暴雨切断了唯一的桥。', '旧宅里多出一把没有人认领的黑伞。'],
      countdown: '零点宣读遗嘱',
    },
    rules: {
      maxBeats: 4,
      difficultyGuidance: '普通压力下的行动 DC 15；有充分准备或工具时 DC 12–13；被多人注视、违逆或冒险时 DC 18；几乎不可能 DC 22–25。',
    },
    characters: [
      {
        id: 'lin_shu',
        name: '林述',
        title: '晚潮公馆的年轻管家',
        age: '29',
        pronouns: '他',
        publicProfile: '在公馆长大，记得每一扇门开合的声音。今晚他负责把所有人留在灵堂，却把二楼的钥匙藏进了袖口。',
        personality: '礼貌、周到，习惯用服务别人的动作掩住自己的判断。他对这个家有感情，也因此更清楚它已经烂到哪里。',
        desire: '在遗嘱宣读前找到真正的副本，确认自己究竟属于这个家，还是只是一个被养大的证人。',
        fear: '发现自己守护了一辈子的秩序，只是替某个人掩盖了一场偷窃。',
        secret: '他昨晚在书房听见老太爷和律师争吵；他偷走了遗嘱副本，因为上面有他母亲的名字。',
        abilities: { physique: 5, agility: 6, perception: 8, intellect: 6, will: 7, presence: 5 },
        traits: [
          { name: '听见门响', description: '能凭声音判断房子哪一扇门被打开过。', bonus: 2, ability: 'perception' },
          { name: '不动声色的侍者', description: '在礼节中让对方先露出破绽。', bonus: 1, ability: 'presence' },
        ],
        possessions: ['二楼钥匙', '遗嘱副本（贴身藏着）', '白手套'],
        memories: [
          { summary: '老太爷最后一次清醒时叫过一个女人的名字，那个名字写在遗嘱副本上。', importance: 5 },
          { summary: '昨晚书房里传出摔杯声；律师今天来的时候，右手有一道新伤。', importance: 4 },
        ],
        relationships: [
          { targetId: 'qiu_yin', label: '律师 / 不速之客', attitude: '她知道的事情比她说出来的多。我要先听她怎么解释那只皮箱。' },
          { targetId: 'su_wan', label: '旧日的小姐', attitude: '她离开公馆十年，回来时却能叫出每个老佣人的名字。' },
        ],
      },
      {
        id: 'qiu_yin',
        name: '邱吟',
        title: '前来宣读遗嘱的律师',
        age: '37',
        pronouns: '她',
        publicProfile: '旧式套装，手提一只从未离手的皮箱。她说自己只负责宣读，却在大雨里最先抵达，鞋底没有湿。',
        personality: '冷静、精确，擅长把问题还给提问的人。她相信规则比人可靠，但偶尔会为某个具体的人破坏规则。',
        desire: '找到遗嘱副本并完成宣读，保住自己的执照和最后一个客户的秘密。',
        fear: '被揭穿她曾修改过契约日期；那会让她失去的不只是职业。',
        secret: '她早就知道遗嘱副本今天会失踪。她带了一份自己准备的替代版本，真正想藏的，是老太爷留给私生女的旧照片。',
        abilities: { physique: 4, agility: 5, perception: 6, intellect: 8, will: 7, presence: 7 },
        traits: [
          { name: '条款的记忆', description: '对文件格式、印章与措辞过目不忘。', bonus: 2, ability: 'intellect' },
          { name: '不湿的鞋底', description: '先到的人有时间布置现场。', bonus: 1, ability: 'perception' },
        ],
        possessions: ['律师皮箱', '未宣读的替代遗嘱', '一支旧钢笔'],
        memories: [
          { summary: '老太爷要求她把一部分遗产留给一个“没有姓名的女儿”。', importance: 5 },
          { summary: '林述昨天在书房翻找东西时，袖口露出过二楼钥匙。', importance: 4 },
        ],
        relationships: [
          { targetId: 'lin_shu', label: '管家 / 可疑的守门人', attitude: '他太熟悉这座房子的动静了。也许他先我一步拿到了副本。' },
          { targetId: 'su_wan', label: '意外的继承人', attitude: '如果她就是照片里的女孩，这份遗嘱会把她十年前离开的真相一起挖出来。' },
        ],
      },
    ],
  };
}

function readCreateSettings() {
  const maxBeatsNode = document.querySelector('#setting-max-beats');
  const seedNode = document.querySelector('#setting-seed');
  const thinkingNode = document.querySelector('#setting-thinking');
  return {
    maxBeats: Math.max(2, Math.min(12, Number(maxBeatsNode?.value) || 5)),
    seed: seedNode?.value?.trim() || undefined,
    thinking: thinkingNode?.value || 'auto',
  };
}

function showCreateError(message) {
  const node = document.querySelector('#create-error');
  if (!node) {
    toast(message, 'error');
    return;
  }
  node.hidden = false;
  node.textContent = message;
}

export async function startCreate(button) {
  if (state.busyAction) return;
  const settings = readCreateSettings();
  const settingsError = document.querySelector('#create-error');
  if (settingsError) settingsError.hidden = true;
  state.busyAction = true;
  setBusyButton(button, true, '正在建场');
  try {
    let data;
    if (state.create.mode === 'preset') {
      if (!state.create.presetId) throw new Error('还没有选择预置剧本。');
      data = await api('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ presetId: state.create.presetId, ...settings }),
      });
    } else {
      const textarea = document.querySelector('#custom-editor');
      const raw = textarea?.value ?? state.create.editorText;
      state.create.editorText = raw;
      let scenario;
      try {
        scenario = JSON.parse(raw);
      } catch (error) {
        throw new Error(`手稿不是合法 JSON：${error.message}`);
      }
      data = await api('/api/runs', {
        method: 'POST',
        body: JSON.stringify({ scenario, ...settings }),
      });
    }
    toast('场已建好。推开第一幕之前，所有骰子都还安静。', 'success');
    location.hash = `#run/${encodeURIComponent(data.run.id)}`;
  } catch (error) {
    const suffix = error.issues?.length ? `\n${error.issues.join('；')}` : '';
    showCreateError(`${error.message}${suffix}`);
    toast(error.message || '建场失败。', 'error');
    setBusyButton(button, false);
  } finally {
    state.busyAction = false;
  }
}

export function switchCreateMode(mode) {
  if (mode !== 'preset' && mode !== 'custom') return;
  state.create.mode = mode;
  document.querySelectorAll('.create-tab[data-mode]').forEach((tab) => {
    const selected = tab.dataset.mode === mode;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  document.querySelectorAll('.create-panel[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== mode;
  });
  const startButton = document.querySelector('[data-act="start-create"]');
  if (startButton) {
    startButton.innerHTML = `开局`;
  }
  const hint = document.querySelector('.create-submit__hint');
  if (hint) {
    hint.textContent =
      mode === 'preset'
        ? '建场不会立即消耗 token；你可以在推演页逐刻推进。'
        : '建场前会校验手稿，不会立即消耗 token。';
  }
  if (mode === 'custom') {
    const editor = document.querySelector('#custom-editor');
    if (editor && !editor.value.trim()) {
      editor.value = JSON.stringify(blankScenarioTemplate(), null, 2);
      state.create.editorText = editor.value;
    }
    editor?.focus({ preventScroll: true });
  }
}

export function updateEditorMessage(type, text) {
  state.create.editorMessage = { type, text };
  const node = document.querySelector('#editor-message');
  if (!node) return;
  node.hidden = false;
  node.className = `editor-message ${type === 'error' ? 'editor-message--error' : type === 'ok' ? 'editor-message--ok' : ''}`;
  node.textContent = text;
}

function parseEditorScenario() {
  const textarea = document.querySelector('#custom-editor');
  const raw = textarea?.value ?? state.create.editorText;
  state.create.editorText = raw;
  let scenario;
  try {
    scenario = JSON.parse(raw);
  } catch (error) {
    throw new Error(`JSON 格式不合法：${error.message}`);
  }
  if (!scenario || typeof scenario !== 'object' || Array.isArray(scenario)) {
    throw new Error('手稿根节点必须是一个对象。');
  }
  if (!scenario.title) throw new Error('缺少 title（剧本标题）。');
  if (!scenario.world || typeof scenario.world !== 'object') throw new Error('缺少 world（世界观与场所）。');
  if (!Array.isArray(scenario.characters) || scenario.characters.length < 2) {
    throw new Error('characters 至少需要两位角色。');
  }
  return scenario;
}

export function validateEditor() {
  try {
    const scenario = parseEditorScenario();
    const names = scenario.characters
      .map((character) => (typeof character === 'string' ? character : character?.name))
      .filter(Boolean);
    updateEditorMessage(
      'ok',
      `手稿结构可读：《${scenario.title}》 / ${scenario.characters.length} 位角色（${names.join('、')}） / 起点 ${scenario.world?.startClock || '未填'}。完整校验会在建场时进行。`,
    );
    return scenario;
  } catch (error) {
    updateEditorMessage('error', error.message);
    return null;
  }
}

export async function loadPresetTemplate() {
  if (!state.create.presetId) {
    updateEditorMessage('error', '还没有可载入的预置剧本。');
    return;
  }
  try {
    const data = await api(`/api/scenarios/${encodeURIComponent(state.create.presetId)}`);
    const editor = document.querySelector('#custom-editor');
    const text = JSON.stringify(data.scenario, null, 2);
    if (editor) editor.value = text;
    state.create.editorText = text;
    switchCreateMode('custom');
    updateEditorMessage('ok', `已载入《${data.scenario.title}》作为底本。现在改的是你的副本，不会影响预置剧本。`);
  } catch (error) {
    updateEditorMessage('error', error.message);
  }
}

export async function importJsonFile(file) {
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const editor = document.querySelector('#custom-editor');
    const pretty = JSON.stringify(parsed, null, 2);
    if (editor) editor.value = pretty;
    state.create.editorText = pretty;
    switchCreateMode('custom');
    updateEditorMessage('ok', `已导入 ${file.name}。检查手稿后再建场。`);
  } catch (error) {
    updateEditorMessage('error', `无法读取文件：${error.message}`);
  }
}
