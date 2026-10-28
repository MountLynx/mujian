/* 集中状态与文案常量。所有视图与逻辑模块共享这一份。 */

export const state = {
  health: null,
  scenarios: [],
  runs: [],
  projects: [],
  worldPresets: [],
  worlds: [],
  worldPresetDetails: {},
  activeWorldPresetId: null,
  currentWorld: null,
  worldActive: false,
  worldPending: false,
  worldStopRequested: false,
  worldPollTimer: null,
  worldPollBusy: false,
  worldJsonEditor: '',
  worldEditorMessage: null,
  view: 'home',
  routeToken: 0,
  currentRun: null,
  active: false,
  selectedBeatId: null,
  followLatest: true,
  godView: false,
  lastLatestBeatId: null,
  pollTimer: null,
  pollBusy: false,
  busyAction: false,
  pendingAdvance: false,
  stopRequested: false,
  drawerCharacterId: null,
  modalOpen: false,
  create: {
    mode: 'preset',
    presetId: null,
    editorText: '',
    editorMessage: null,
  },
};

export const STATUS_LABELS = {
  ready: '待开场',
  running: '推演中',
  paused: '暂停',
  ended: '已收束',
  error: '中断',
};

export const ABILITY_LABELS = {
  physique: '体魄',
  agility: '敏捷',
  perception: '感知',
  intellect: '智识',
  will: '意志',
  presence: '风度',
};

export const OUTCOME_LABELS = {
  critical_success: '意外奏效',
  success: '落地',
  soft_failure: '落空',
};

/* 结果章的样式类：彩色只出现在这一层。 */
export const OUTCOME_CLASS = {
  critical_success: 'crit',
  success: 'ok',
  soft_failure: 'softfail',
};

export const WORLD_RESOURCE_LABELS = {
  stability: '稳定',
  granary: '粮仓',
  influence: '影响',
  fleet: '舰队',
  industry: '工业',
  food: '粮食',
  trade: '贸易',
  supplies: '补给',
  gold: '金库',
  order: '秩序',
};
