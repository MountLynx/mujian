/* 世界层数据助手：纯函数，供世界渲染与逻辑层共用。 */

import { state } from './state.js';

export function worldStatusLabel(status, active = false, epochCount = 0, maxEpochs = 0) {
  if (active || status === 'running') return '推演中';
  if (status === 'ready') return epochCount > 0 ? '待续' : '待开启';
  if (status === 'paused') return maxEpochs && epochCount >= maxEpochs ? '纪元已满' : '已暂停';
  if (status === 'ended') return '已收束';
  if (status === 'error') return '中断';
  return status;
}

export function isWorldRunning(world) {
  return state.worldActive || world?.status === 'running' || state.worldPending;
}

export function worldStatusFor(world, active = false) {
  const epochs = world?.epochs?.length || 0;
  const max = world?.settings?.maxEpochs || 0;
  return worldStatusLabel(world?.status || 'ready', active, epochs, max);
}

export function worldEntityName(world, id) {
  if (!world) return id;
  const all = [
    ...world.definition.setting.regions,
    ...world.definition.setting.factions,
    ...world.definition.setting.actors,
    ...world.definition.setting.threads,
  ];
  return all.find((entity) => entity.id === id)?.name || all.find((entity) => entity.id === id)?.title || id;
}

export function worldRegion(world, id) {
  return world.definition.setting.regions.find((region) => region.id === id) || null;
}

export function worldFaction(world, id) {
  return world.definition.setting.factions.find((faction) => faction.id === id) || null;
}

export function worldActor(world, id) {
  return world.definition.setting.actors.find((actor) => actor.id === id) || null;
}

export function worldThread(world, id) {
  return world.definition.setting.threads.find((thread) => thread.id === id) || null;
}

export function safeWorldColor(value, fallback = '#8fa9a1') {
  return /^#[0-9a-fA-F]{3,8}$/.test(String(value || '')) ? value : fallback;
}

export function worldFactionColor(world, factionId) {
  return safeWorldColor(worldFaction(world, factionId)?.color);
}

export function knownByWorld(world, ids) {
  const names = [
    ...world.definition.setting.actors.map((actor) => [actor.id, actor.name]),
    ...world.definition.setting.factions.map((faction) => [faction.id, faction.name]),
  ];
  const map = new Map(names);
  return ids.map((id) => map.get(id) || id).join('、') || '无人';
}

export function formatArrival(world, arrivesAt) {
  const delta = arrivesAt - world.elapsedMinutes;
  if (delta <= 0) return '已经抵达';
  if (delta < 60) return `${delta} 分钟后`;
  if (delta < 1440) return `${(delta / 60).toFixed(delta % 60 ? 1 : 0)} 小时后`;
  return `${(delta / 1440).toFixed(delta % 1440 ? 1 : 0)} 日后`;
}

export function formatWorldAdvance(minutes) {
  if (minutes < 60) return `+${minutes}m`;
  if (minutes < 1440) {
    const value = minutes / 60;
    return `+${Number.isInteger(value) ? value : value.toFixed(1)}h`;
  }
  const value = minutes / 1440;
  return `+${Number.isInteger(value) ? value : value.toFixed(1)}d`;
}
