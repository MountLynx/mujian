import type { ActionRecord, Beat, Run } from '../types.ts';
import { ABILITY_META, OUTCOME_META } from '../types.ts';
import { checkModifierSummary } from '../rules/checks.ts';
import { truncate } from '../utils.ts';

function participantName(run: Run, characterId: string): string {
  return run.scenario.characters.find((character) => character.id === characterId)?.name ?? characterId;
}

function actionStatus(action: ActionRecord): string {
  if (action.status === 'abandoned') return '放下原举动';
  if (!action.outcome) return '未结算';
  return OUTCOME_META[action.outcome].label;
}

function renderRoll(action: ActionRecord): string {
  if (!action.roll) return '';
  const roll = action.roll;
  const target =
    roll.opponentTotal !== null && roll.opponentTotal !== undefined
      ? `回应总值 ${roll.opponentTotal}（对抗）`
      : `DC ${roll.dc}（难度）`;
  const margin = roll.margin ?? 0;
  return [
    `\`${checkModifierSummary(roll).join(' + ')} = ${roll.total}\``,
    `${target}，差值 ${margin >= 0 ? '+' : ''}${margin} → **${OUTCOME_META[roll.tier].label}**${roll.criticalByNatural20 ? '（自然 20）' : ''}`,
  ].join('  \n');
}

function renderBeat(run: Run, beat: Beat): string[] {
  const lines: string[] = [];
  lines.push(`## 第 ${beat.index + 1} 刻 · ${beat.clock.display}｜${beat.title}`);
  if (beat.timeJump) {
    lines.push(`> 时间推进 ${beat.timeJump.elapsedMinutes} 分钟：${beat.timeJump.reason}（${beat.timeJump.label}）`);
  }
  lines.push('');
  if (beat.pressure) lines.push(`**压力**｜${beat.pressure}`);
  if (beat.sceneQuestion) lines.push(`**悬而未决**｜${beat.sceneQuestion}`);
  lines.push('');
  lines.push(beat.narration || '（本刻尚未落定。）');
  lines.push('');

  lines.push('### 本刻举动');
  for (const action of beat.actions) {
    const name = participantName(run, action.characterId);
    const target = action.targetId ? ` → ${participantName(run, action.targetId)}` : '';
    lines.push(`#### ${name}｜${action.summary}${target}`);
    lines.push(`*${action.category} · ${ABILITY_META[action.ability].label} · ${actionStatus(action)}*`);
    lines.push('');
    lines.push(action.deed || action.description);
    const effect = action.effect || action.goalProgress;
    if (effect) lines.push(`\n> 想要的效果：${effect}`);
    if (action.dialogue) lines.push(`\n> “${action.dialogue}”`);
    if (action.roll) {
      lines.push('');
      lines.push(renderRoll(action));
    } else if (action.status === 'abandoned') {
      lines.push('');
      lines.push(`原举动被放下，未进行检定。${action.outcomeNote ? ` ${action.outcomeNote}` : ''}`);
    }
    if (action.outcomeNote && action.status !== 'abandoned') {
      lines.push('');
      lines.push(`> ${action.outcomeNote}`);
    }
    lines.push('');
  }

  if (beat.reactions.length) {
    lines.push('### 回应与分心');
    for (const reaction of beat.reactions) {
      const name = participantName(run, reaction.characterId);
      lines.push(`- **${name}**｜${reaction.summary}（${reaction.stance}）｜${reaction.continueOriginal ? '继续原来的举动，承担分心惩罚' : '放下原来的举动，专心回应'}`);
      if (reaction.description) lines.push(`  ${reaction.description}`);
      if (reaction.roll) {
        lines.push(`  \`${checkModifierSummary(reaction.roll).join(' + ')} = ${reaction.roll.total}\``);
      }
    }
    lines.push('');
  }

  if (beat.externalEvents?.length) {
    lines.push('### 世界事件');
    for (const event of beat.externalEvents) {
      lines.push(
        `- ${event.description}｜d20 ${event.natural} vs DC ${event.dc} → **${event.success ? '发生' : '未发生'}**${event.success ? `：${event.fact}` : ''}`,
      );
    }
    lines.push('');
  }

  const changes = beat.stateChanges;
  if (changes) {
    const factualChanges: string[] = [];
    for (const change of changes.characters) {
      const pieces: string[] = [];
      if (change.stressDelta) pieces.push(`紧张 ${change.stressDelta > 0 ? '+' : ''}${change.stressDelta}`);
      if (change.conditionsAdd.length) pieces.push(`状态 +${change.conditionsAdd.map((condition) => condition.name).join('、')}`);
      if (change.conditionsRemove.length) pieces.push(`状态 -${change.conditionsRemove.join('、')}`);
      if (change.inventoryAdd.length) pieces.push(`获得 ${change.inventoryAdd.join('、')}`);
      if (change.inventoryRemove.length) pieces.push(`失去 ${change.inventoryRemove.join('、')}`);
      if (pieces.length) {
        factualChanges.push(`- ${participantName(run, change.characterId)}：${pieces.join('；')}`);
      }
    }
    if (changes.world.factsAdd.length) {
      factualChanges.push(...changes.world.factsAdd.map((fact) => `- 新事实：${fact}`));
    }
    if (factualChanges.length) {
      lines.push('### 状态变化');
      lines.push(...factualChanges);
      lines.push('');
    }
  }

  if (beat.nextTimeJump) {
    lines.push(`*下一刻：${beat.nextTimeJump.label}（+${beat.nextTimeJump.elapsedMinutes} 分钟）*`);
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  return lines;
}

export function renderMarkdown(run: Run, options: { includeBackstage?: boolean } = {}): string {
  const lines: string[] = [];
  lines.push(`# ${run.scenario.title}`);
  if (run.scenario.subtitle) lines.push(`> ${run.scenario.subtitle}`);
  lines.push('');
  lines.push(`**${run.scenario.kicker}** · ${run.scenario.world.era}`);
  lines.push('');
  lines.push(`- 场景：${run.scenario.world.location}`);
  lines.push(`- 种子：\`${run.seed}\``);
  if (run.play?.characterId) {
    const player = run.scenario.characters.find(
      (character) => character.id === run.play!.characterId,
    );
    lines.push(
      `- 模式：扮演模式（你扮演 ${player?.name ?? run.play.characterId}）${run.play.recapAt ? ' · 已复盘，本战报包含全部幕后信息' : ''}`,
    );
  }
  lines.push(`- 角色：${run.scenario.characters.map((character) => `${character.name}（${character.title}）`).join('、')}`);
  lines.push('');
  lines.push('## 人物');
  for (const character of run.scenario.characters) {
    lines.push(`- **${character.name}**｜${character.title} — ${character.publicProfile}`);
  }
  lines.push('');

  for (const beat of run.beats) {
    if (beat.phase === 'complete') lines.push(...renderBeat(run, beat));
  }

  if (run.ending) {
    lines.push(`## 终章｜${run.ending.headline}`);
    lines.push('');
    lines.push(run.ending.epilogue);
    if (run.ending.finalImage) {
      lines.push('');
      lines.push(`*${run.ending.finalImage}*`);
    }
    lines.push('');
  } else {
    lines.push('## 幕间');
    lines.push('');
    lines.push(`故事停在${run.beats.length}个时刻。有些话还没有落地。`);
    lines.push('');
  }

  if (options.includeBackstage) {
    lines.push('## 幕后速记');
    lines.push('');
    lines.push(`- 模型：${run.settings.model}｜调用 ${run.llm.calls} 次｜token ${run.llm.totalTokens}`);
    lines.push(`- 本场最大时刻数：${run.settings.maxBeats}`);
    lines.push('');
    for (const beat of run.beats) {
      if (beat.phase !== 'complete') continue;
      lines.push(`### 第 ${beat.index + 1} 刻 · 内心与裁定`);
      if (beat.gmNote) lines.push(`> 导演幕后注：${beat.gmNote}`);
      for (const action of beat.actions) {
        lines.push(`- **${participantName(run, action.characterId)}**：${truncate(action.thought || action.goalProgress, 200)}`);
        const adjudication = beat.adjudications.find((entry) => entry.actionId === action.id);
        if (adjudication) {
          lines.push(`  - 裁定：DC ${adjudication.dc}（${adjudication.difficultyLabel}）；${truncate(adjudication.reason, 160)}；风险：${truncate(adjudication.risk, 140)}`);
        }
      }
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}
