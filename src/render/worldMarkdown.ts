import type { WorldEvent, WorldRun } from '../world/types.ts';
import { truncate } from '../utils.ts';

function names(run: WorldRun): Map<string, string> {
  return new Map([
    ...run.definition.setting.regions.map((region) => [region.id, region.name] as const),
    ...run.definition.setting.factions.map((faction) => [faction.id, faction.name] as const),
    ...run.definition.setting.actors.map((actor) => [actor.id, actor.name] as const),
    ...run.definition.setting.threads.map((thread) => [thread.id, thread.title] as const),
  ]);
}

function knownNames(run: WorldRun, ids: string[]): string {
  const map = names(run);
  return ids.map((id) => map.get(id) ?? id).join('、') || '无人';
}

function eventLine(run: WorldRun, event: WorldEvent): string {
  const map = names(run);
  const parts = [
    `- **${event.clock.display}｜${event.title}**`,
    event.regionId ? `区域：${map.get(event.regionId) ?? event.regionId}` : '',
    event.actorIds.length ? `角色：${event.actorIds.map((id) => map.get(id) ?? id).join('、')}` : '',
    event.factionIds.length ? `势力：${event.factionIds.map((id) => map.get(id) ?? id).join('、')}` : '',
    event.visibility !== 'secret' ? `公开版本：${event.publicNarrative || '无'}` : '',
    `客观：${event.summary}`,
    event.effects.factIdsAdded.length ? `新增事实：${event.effects.factIdsAdded.length}` : '',
    event.signalIds.length ? `产生信号：${event.signalIds.length}` : '',
  ];
  return parts.filter(Boolean).join('｜');
}

export function renderWorldMarkdown(run: WorldRun): string {
  const map = names(run);
  const lines: string[] = [];
  lines.push(`# ${run.definition.title}`);
  if (run.definition.subtitle) lines.push(`> ${run.definition.subtitle}`);
  lines.push('');
  lines.push(`**${run.definition.kicker}** · seed \`${run.seed}\``);
  lines.push('');
  lines.push(`## 世界`);
  lines.push(run.definition.setting.overview);
  lines.push('');
  lines.push(`- 当前时间：${run.clock.display}`);
  lines.push(`- 纪元：${run.epochs.length} / ${run.settings.maxEpochs}`);
  lines.push(
    `- 状态：${run.status}｜LLM ${run.llm.calls} 次调用 / ${run.llm.totalTokens.toLocaleString('zh-CN')} tokens`,
  );
  lines.push('');
  lines.push('## 区域');
  for (const region of run.definition.setting.regions) {
    const rt = run.regions[region.id];
    lines.push(
      `- **${region.name}**（${region.kind}）：${rt?.status ?? region.publicStatus}｜控制：${rt?.controllingFactionId ? map.get(rt.controllingFactionId) ?? rt.controllingFactionId : '无'}｜资源：${Object.entries(rt?.resources ?? {}).map(([k, v]) => `${k} ${v}`).join(' / ')}`,
    );
  }
  lines.push('');
  lines.push('## 势力');
  for (const faction of run.definition.setting.factions) {
    const rt = run.factions[faction.id];
    lines.push(
      `- **${faction.name}**：力量 ${rt?.power ?? faction.power}/10，合法性 ${rt?.legitimacy ?? faction.legitimacy}/10；目标：${faction.goal}`,
    );
  }
  lines.push('');
  lines.push('## 剧情线程');
  for (const thread of run.definition.setting.threads) {
    const rt = run.threads[thread.id];
    lines.push(
      `- **${thread.title}**（${rt?.status ?? thread.status}）：${thread.question}｜紧张 ${rt?.tension ?? thread.tension}/10｜进度 ${rt?.clockValue ?? thread.clock.value}/${thread.clock.max} ${thread.clock.unit}${rt?.note ? `｜${rt.note}` : ''}`,
    );
  }
  lines.push('');
  lines.push('## 纪元');
  if (!run.epochs.length) {
    lines.push('（世界还没有推进。所有事件仍在等待发生。）');
  }
  for (const epoch of run.epochs) {
    lines.push(`### 第 ${epoch.index + 1} 纪元 · ${epoch.clock.display}｜${epoch.title}`);
    lines.push(`> 推进 ${epoch.advanceMinutes} 分钟：${epoch.advanceReason}`);
    lines.push('');
    lines.push(epoch.summary);
    lines.push('');
    const deliveries = run.events.filter(
      (event) => event.epochIndex === epoch.index && event.kind === 'signal',
    );
    const roots = run.events.filter(
      (event) => event.epochIndex === epoch.index && event.kind !== 'signal' && !event.parentId,
    );
    if (deliveries.length) {
      lines.push('**送达的信号**');
      for (const event of deliveries) {
        lines.push(`- ${event.clock.display}｜${event.title}｜${truncate(event.summary, 260)}`);
      }
      lines.push('');
    }
    lines.push('**事件**');
    for (const event of roots) {
      lines.push(eventLine(run, event));
      for (const childId of event.childIds) {
        const child = run.events.find((entry) => entry.id === childId);
        if (child) lines.push(`  - ↳ **${child.title}**｜${child.summary}`);
      }
    }
    if (!roots.length) lines.push('（没有形成事件。）');
    lines.push('');
    if (epoch.sceneHookId) {
      const hook = run.sceneHooks.find((entry) => entry.id === epoch.sceneHookId);
      if (hook) {
        lines.push(`**聚焦场景候选**：${hook.title}｜${hook.question}`);
        lines.push(
          `参与者：${hook.participantIds.map((id) => map.get(id) ?? id).join('、')}｜${hook.stakes}`,
        );
        lines.push('');
      }
    }
  }
  lines.push('## 事实账本');
  for (const fact of [...run.facts].sort((a, b) => b.createdEpoch - a.createdEpoch).slice(0, 30)) {
    lines.push(
      `- ${fact.retiredAtEpoch !== null ? '~~' : ''}${truncate(fact.text, 400)}${fact.retiredAtEpoch !== null ? '~~' : ''}（知道：${knownNames(run, fact.knownBy)}）`,
    );
  }
  if (run.signals.some((signal) => signal.status === 'pending')) {
    lines.push('');
    lines.push('## 仍在路上的信号');
    for (const signal of run.signals.filter((entry) => entry.status === 'pending')) {
      lines.push(
        `- ${signal.channel}：${signal.toEntityIds.map((id) => map.get(id) ?? id).join('、')}｜世界开始后 ${signal.arrivesAt} 分钟抵达｜${truncate(signal.content, 220)}`,
      );
    }
  }
  lines.push('');
  lines.push('## 导演附录');
  lines.push(`### 聚光区域\n${map.get(run.definition.setting.spotlightRegionId) ?? run.definition.setting.spotlightRegionId}`);
  lines.push(`### 隐藏真相\n${run.definition.setting.hiddenCanon}`);
  lines.push(
    `### 角色认知\n${run.definition.setting.actors
      .map((actor) => {
        const known = run.facts.filter(
          (fact) => fact.retiredAtEpoch === null && fact.knownBy.includes(actor.id),
        );
        return `- ${actor.name}：${known.length} 条已知事实`;
      })
      .join('\n')}`,
  );
  lines.push('');
  return `${lines.join('\n')}\n`;
}
