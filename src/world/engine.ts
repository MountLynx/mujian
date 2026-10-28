import type { ConditionSeed } from '../types.ts';
import type {
  WorldActorChange,
  WorldDraftEvent,
  WorldDraftScene,
  WorldEpochDraft,
  WorldEpoch,
  WorldEvent,
  WorldFactionChange,
  WorldFact,
  WorldRegionChange,
  WorldRun,
  WorldSceneHook,
  WorldSignal,
  WorldThreadChange,
} from './types.ts';
import { worldClock } from './run.ts';
import { buildWorldEpochPrompt } from '../llm/worldPrompts.ts';
import { parseWorldEpochDraft } from '../llm/worldParsers.ts';
import { thinkingForMode, type JsonCallResult, type LanguageModel } from '../llm/client.ts';
import { clamp, newId, nowIso, truncate } from '../utils.ts';

export interface WorldEngineHooks {
  persist?: (run: WorldRun) => Promise<void>;
  log?: (message: string, detail?: unknown) => void;
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export class WorldEngine {
  private readonly run: WorldRun;
  private readonly model: LanguageModel;
  private readonly hooks: WorldEngineHooks;

  constructor(run: WorldRun, model: LanguageModel, hooks: WorldEngineHooks = {}) {
    this.run = run;
    this.model = model;
    this.hooks = hooks;
  }

  private async save(): Promise<void> {
    this.run.updatedAt = nowIso();
    await this.hooks.persist?.(this.run);
  }

  private log(message: string, detail?: unknown): void {
    this.hooks.log?.(message, detail);
  }

  private setProgress(
    phase: WorldRun['progress']['phase'],
    label: string,
    detail?: string,
  ): void {
    this.run.progress = {
      phase,
      label,
      detail,
      updatedAt: nowIso(),
    };
  }

  private trackUsage(result: JsonCallResult<unknown>): void {
    const usage = result.usage;
    this.run.llm.calls += usage.calls;
    this.run.llm.promptTokens += usage.promptTokens;
    this.run.llm.completionTokens += usage.completionTokens;
    this.run.llm.cachedTokens += usage.cachedTokens;
    this.run.llm.reasoningTokens += usage.reasoningTokens;
    this.run.llm.totalTokens += usage.totalTokens;
    this.run.llm.failures += usage.failures;
  }

  async advanceEpoch(): Promise<WorldRun> {
    this.run.status = 'running';
    this.run.error = null;
    this.run.startedAt ??= nowIso();
    this.setProgress('planning', '世界导演正在计算下一纪元', '时间、消息、资源与远方的因果同时推进。');
    await this.save();
    try {
      const prompt = buildWorldEpochPrompt({
        run: this.run,
        dueSignals: this.run.signals.filter((signal) => signal.status === 'pending'),
      });
      const result = await this.model.callJson<WorldEpochDraft>({
        label: `world:epoch:${this.run.epochs.length + 1}`,
        system: prompt.system,
        user: prompt.user,
        schemaHint: prompt.schemaHint,
        thinking: thinkingForMode(this.run.settings.thinking, 'gm'),
        maxTokens: 18_000,
        temperature: 0.78,
        validate: (value) => parseWorldEpochDraft(value, this.run),
        onRetry: (info) => {
          this.run.progress.detail = `世界导演重试（第 ${info.attempt} 次）：${truncate(info.reason, 160)}`;
          this.run.progress.updatedAt = nowIso();
        },
      });
      this.trackUsage(result);
      this.log('world GM epoch draft ready', {
        latencyMs: result.latencyMs,
        tokens: result.usage.totalTokens,
        events: result.data.events.length,
      });
      this.setProgress('applying', '正在写入世界账本', '先送达路上的消息，再结算这一纪元的并发事件。');
      await this.save();
      await this.applyEpoch(result.data);
      this.setProgress('idle', this.run.epochs.length >= this.run.settings.maxEpochs ? '已达到本世界预设纪元上限' : '世界等待下一纪元');
      this.run.status = 'ready';
      await this.save();
      return this.run;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.run.status = 'error';
      this.run.error = truncate(message, 1600);
      this.setProgress('idle', '这一纪元中断，可从断点重试');
      this.log('world epoch failed', { message });
      await this.save();
      throw error;
    }
  }

  private async applyEpoch(draft: WorldEpochDraft): Promise<void> {
    const epochIndex = this.run.epochs.length;
    const newElapsed = this.run.elapsedMinutes + draft.advanceMinutes;
    const newClock = worldClock(
      this.run.definition.setting.startLabel,
      this.run.definition.setting.startClock,
      newElapsed,
    );
    const epoch: WorldEpoch = {
      index: epochIndex,
      clock: newClock,
      advanceMinutes: draft.advanceMinutes,
      advanceReason: draft.advanceReason,
      title: draft.epochTitle,
      summary: draft.worldSummary,
      eventIds: [],
      deliveryEventIds: [],
      sceneHookId: null,
      createdAt: nowIso(),
    };

    // 1. Deliver signals that arrive before or at the new epoch time.
    const dueSignals = this.run.signals
      .filter((signal) => signal.status === 'pending' && signal.arrivesAt <= newElapsed)
      .sort((a, b) => a.arrivesAt - b.arrivesAt);
    for (const signal of dueSignals) {
      const delivery = this.deliverSignal(signal, epochIndex);
      epoch.deliveryEventIds.push(delivery.id);
    }

    // 2. Build event shell IDs so parent references are globally stable.
    const eventIdByLocal = new Map<string, string>();
    for (const event of draft.events) eventIdByLocal.set(event.localId, newId('wevt'));

    // 3. Apply all events. Parent-first ordering keeps coordinated subtrees legible.
    const depth = (event: WorldDraftEvent): number => {
      let d = 0;
      let current = event;
      const seen = new Set<string>();
      while (current.parentLocalId && !seen.has(current.localId)) {
        seen.add(current.localId);
        const parent = draft.events.find((entry) => entry.localId === current.parentLocalId);
        if (!parent) break;
        current = parent;
        d += 1;
      }
      return d;
    };
    const ordered = [...draft.events].sort((a, b) => depth(a) - depth(b));
    const appliedByLocal = new Map<string, WorldEvent>();
    for (const draftEvent of ordered) {
      const applied = this.applyWorldEvent(draftEvent, epochIndex, newElapsed, newClock, eventIdByLocal);
      appliedByLocal.set(draftEvent.localId, applied);
      epoch.eventIds.push(applied.id);
    }

    // 4. Wire parent/child trees after all records exist.
    for (const draftEvent of draft.events) {
      const applied = appliedByLocal.get(draftEvent.localId);
      if (!applied) continue;
      if (draftEvent.parentLocalId) {
        const parentId = eventIdByLocal.get(draftEvent.parentLocalId);
        if (parentId) applied.parentId = parentId;
      }
    }
    for (const applied of appliedByLocal.values()) {
      const children = [...appliedByLocal.values()].filter((event) => event.parentId === applied.id);
      applied.childIds = children.map((event) => event.id);
      if (children.length) applied.kind = 'parent';
    }

    // 5. Scene hook.
    const hook = this.createSceneHook(draft.scene, epochIndex, appliedByLocal);
    if (hook) {
      epoch.sceneHookId = hook.id;
      const source = this.run.events.find((event) => event.id === hook.sourceEventId);
      if (source) source.sceneHookId = hook.id;
    }

    // 6. Commit time and ledger.
    this.run.epochs.push(epoch);
    this.run.elapsedMinutes = newElapsed;
    this.run.clock = newClock;
    this.run.epochIndex = epochIndex + 1;
    this.run.lastTimeJump = {
      minutes: draft.advanceMinutes,
      label: epoch.clock.display,
      reason: draft.advanceReason,
    };
    this.attachSignalEventsToEpoch(epoch, epochIndex);
    await this.save();
    this.log(`world epoch ${epochIndex + 1} complete`, {
      time: newClock.display,
      events: appliedByLocal.size,
      deliveries: epoch.deliveryEventIds.length,
      scene: hook?.title ?? null,
    });
  }

  private validKnownBy(run: WorldRun, knownBy: string[], isPublic: boolean): string[] {
    const all = [
      ...run.definition.setting.actors.map((actor) => actor.id),
      ...run.definition.setting.factions.map((faction) => faction.id),
    ];
    if (isPublic || knownBy.includes('all') || knownBy.includes('world')) return all;
    const valid = new Set(all);
    return unique(knownBy.filter((id) => valid.has(id)));
  }

  private applyWorldEvent(
    draftEvent: WorldDraftEvent,
    epochIndex: number,
    newElapsed: number,
    newClock: WorldRun['clock'],
    eventIdByLocal: Map<string, string>,
  ): WorldEvent {
    const eventId = eventIdByLocal.get(draftEvent.localId)!;
    const parentId = draftEvent.parentLocalId ? eventIdByLocal.get(draftEvent.parentLocalId) ?? null : null;
    const factIds: string[] = [];
    for (const draftFact of draftEvent.facts) {
      const fact: WorldFact = {
        id: newId('fact'),
        text: draftFact.text,
        importance: draftFact.importance,
        knownBy: this.validKnownBy(this.run, draftFact.knownBy, draftFact.public),
        createdEpoch: epochIndex,
        sourceEventId: eventId,
        tag: draftFact.tag,
        public: draftFact.public,
        retiredAtEpoch: null,
      };
      this.run.facts.push(fact);
      factIds.push(fact.id);
    }
    for (const factId of draftEvent.removeFactIds) {
      const fact = this.run.facts.find((entry) => entry.id === factId);
      if (fact && fact.retiredAtEpoch === null) fact.retiredAtEpoch = epochIndex;
    }

    const regionChanges = this.applyRegionChanges(draftEvent.regionChanges);
    const factionChanges = this.applyFactionChanges(draftEvent.factionChanges);
    const actorChanges = this.applyActorChanges(draftEvent.actorChanges, epochIndex);
    const threadChanges = this.applyThreadChanges(draftEvent.threadChanges, epochIndex);

    const signals: WorldSignal[] = [];
    for (const draftSignal of draftEvent.signals) {
      const allTargets = unique(draftSignal.toEntityIds);
      const signalFactIds = draftSignal.factIndices
        .map((index) => factIds[index])
        .filter((id): id is string => Boolean(id));
      // A signal that tells someone what they already know is bookkeeping
      // noise. Only schedule it for targets who still lack at least one fact.
      const toEntityIds = signalFactIds.length
        ? allTargets.filter((target) =>
            signalFactIds.some((factId) => {
              const fact = this.run.facts.find((entry) => entry.id === factId);
              return fact && !fact.knownBy.includes(target);
            }),
          )
        : allTargets;
      if (!toEntityIds.length) {
        this.log('Skipped redundant signal', { event: draftEvent.localId, targets: allTargets });
        continue;
      }
      const fromEntityId =
        draftEvent.actorIds[0] ?? draftEvent.factionIds[0] ?? 'world';
      const arrivesAt = newElapsed + draftSignal.delayMinutes;
      const signal: WorldSignal = {
        id: newId('sig'),
        fromEventId: eventId,
        fromEntityId,
        toEntityIds,
        channel: draftSignal.channel,
        content: draftSignal.content,
        factIds: signalFactIds,
        createdAtEpoch: epochIndex,
        arrivesAt,
        status: draftSignal.delayMinutes === 0 ? 'delivered' : 'pending',
        deliveredAtEpoch: draftSignal.delayMinutes === 0 ? epochIndex : null,
      };
      this.run.signals.push(signal);
      signals.push(signal);
      if (signal.status === 'delivered') {
        for (const target of toEntityIds) {
          for (const factId of signalFactIds) {
            const fact = this.run.facts.find((entry) => entry.id === factId);
            if (fact && !fact.knownBy.includes(target)) fact.knownBy.push(target);
          }
        }
      }
    }

    const event: WorldEvent = {
      id: eventId,
      epochIndex,
      at: newElapsed,
      clock: newClock,
      localId: draftEvent.localId,
      parentId,
      childIds: [],
      kind: 'event',
      title: draftEvent.title,
      regionId: draftEvent.regionId,
      actorIds: draftEvent.actorIds,
      factionIds: draftEvent.factionIds,
      summary: draftEvent.summary,
      publicNarrative: draftEvent.publicNarrative,
      visibility: draftEvent.visibility,
      effects: {
        factIdsAdded: factIds,
        factIdsRemoved: draftEvent.removeFactIds,
        regionChanges,
        factionChanges,
        actorChanges,
        threadChanges,
      },
      signalIds: signals.map((signal) => signal.id),
      sceneHookId: null,
      createdAt: nowIso(),
    };
    this.run.events.push(event);
    return event;
  }

  private applyRegionChanges(changes: WorldRegionChange[]) {
    const applied: WorldRegionChange[] = [];
    for (const change of changes) {
      const runtime = this.run.regions[change.regionId];
      if (!runtime) continue;
      if (change.status !== undefined) runtime.status = change.status;
      if (change.controllingFactionId !== undefined) runtime.controllingFactionId = change.controllingFactionId;
      for (const [key, delta] of Object.entries(change.resourceDeltas)) {
        const current = runtime.resources[key] ?? 0;
        runtime.resources[key] = clamp(current + delta, 0, 100);
      }
      applied.push({
        regionId: change.regionId,
        ...(change.status !== undefined ? { status: change.status } : {}),
        ...(change.controllingFactionId !== undefined ? { controllingFactionId: change.controllingFactionId } : {}),
        resourceDeltas: change.resourceDeltas,
      });
    }
    return applied;
  }

  private applyFactionChanges(changes: WorldFactionChange[]) {
    const applied: WorldFactionChange[] = [];
    for (const change of changes) {
      const runtime = this.run.factions[change.factionId];
      if (!runtime) continue;
      runtime.power = clamp(runtime.power + change.powerDelta, 0, 10);
      runtime.legitimacy = clamp(runtime.legitimacy + change.legitimacyDelta, 0, 10);
      if (change.status) runtime.status = change.status;
      for (const [key, delta] of Object.entries(change.resourceDeltas)) {
        runtime.resources[key] = clamp((runtime.resources[key] ?? 0) + delta, 0, 100);
      }
      for (const [id, delta] of Object.entries(change.attitudeDeltas)) {
        runtime.attitudes[id] = clamp((runtime.attitudes[id] ?? 0) + delta, -100, 100);
      }
      applied.push({
        factionId: change.factionId,
        powerDelta: change.powerDelta,
        legitimacyDelta: change.legitimacyDelta,
        resourceDeltas: change.resourceDeltas,
        attitudeDeltas: change.attitudeDeltas,
        ...(change.status ? { status: change.status } : {}),
      });
    }
    return applied;
  }

  private applyActorChanges(changes: WorldActorChange[], epochIndex: number) {
    const applied: WorldActorChange[] = [];
    for (const change of changes) {
      const runtime = this.run.actors[change.actorId];
      if (!runtime) continue;
      if (change.regionId) runtime.regionId = change.regionId;
      if (change.status) runtime.status = change.status;
      runtime.stress = clamp(runtime.stress + change.stressDelta, 0, 10);
      for (const condition of change.conditionsAdd) {
        runtime.conditions = runtime.conditions.filter((entry) => entry.name !== condition.name);
        runtime.conditions.push(this.cleanCondition(condition));
      }
      for (const name of change.conditionsRemove) {
        runtime.conditions = runtime.conditions.filter((entry) => entry.name !== name);
      }
      runtime.flags = { ...runtime.flags, ...change.flagsSet };
      runtime.lastSeenEpoch = epochIndex;
      applied.push({
        actorId: change.actorId,
        ...(change.regionId ? { regionId: change.regionId } : {}),
        ...(change.status ? { status: change.status } : {}),
        stressDelta: change.stressDelta,
        conditionsAdd: change.conditionsAdd.map((condition) => this.cleanCondition(condition)),
        conditionsRemove: change.conditionsRemove,
        flagsSet: change.flagsSet,
      });
    }
    return applied;
  }

  private cleanCondition(condition: ConditionSeed): ConditionSeed {
    return {
      ...condition,
      kind: condition.kind ?? 'other',
      abilities: condition.abilities ? [...condition.abilities] : undefined,
    };
  }

  private applyThreadChanges(changes: WorldThreadChange[], epochIndex: number) {
    const applied: WorldThreadChange[] = [];
    for (const change of changes) {
      const runtime = this.run.threads[change.threadId];
      const definition = this.run.definition.setting.threads.find((thread) => thread.id === change.threadId);
      if (!runtime || !definition) continue;
      runtime.tension = clamp(runtime.tension + change.tensionDelta, 0, 10);
      runtime.clockValue = clamp(
        runtime.clockValue + change.clockDelta,
        0,
        definition.clock.max,
      );
      if (change.status) runtime.status = change.status;
      if (change.note) {
        runtime.note = change.note;
        runtime.history.push({ epochIndex, note: change.note });
        if (runtime.history.length > 20) runtime.history.shift();
      }
      applied.push(change);
    }
    return applied;
  }

  private deliverSignal(signal: WorldSignal, epochIndex: number): WorldEvent {
    signal.status = 'delivered';
    signal.deliveredAtEpoch = epochIndex;
    for (const target of signal.toEntityIds) {
      for (const factId of signal.factIds) {
        const fact = this.run.facts.find((entry) => entry.id === factId);
        if (fact && !fact.knownBy.includes(target)) fact.knownBy.push(target);
      }
    }
    const at = signal.arrivesAt;
    const clock = worldClock(
      this.run.definition.setting.startLabel,
      this.run.definition.setting.startClock,
      at,
    );
    const actorIds = signal.toEntityIds.filter((id) => Boolean(this.run.actors[id]));
    const factionIds = signal.toEntityIds.filter((id) => Boolean(this.run.factions[id]));
    const event: WorldEvent = {
      id: newId('wevt'),
      epochIndex,
      at,
      clock,
      localId: `signal-${signal.id}`,
      parentId: null,
      childIds: [],
      kind: 'signal',
      title: `讯息抵达：${truncate(signal.channel, 24)}`,
      regionId: null,
      actorIds,
      factionIds,
      summary: signal.content,
      publicNarrative: signal.content,
      visibility: 'mixed',
      effects: {
        factIdsAdded: [],
        factIdsRemoved: [],
        regionChanges: [],
        factionChanges: [],
        actorChanges: [],
        threadChanges: [],
      },
      signalIds: [signal.id],
      sceneHookId: null,
      createdAt: nowIso(),
    };
    this.run.events.push(event);
    return event;
  }

  private attachSignalEventsToEpoch(epoch: WorldEpoch, epochIndex: number): void {
    // The delivery event ids were pushed while signals were delivered; ensure
    // they haven't been duplicated and are clearly associated with this epoch.
    epoch.deliveryEventIds = unique(epoch.deliveryEventIds);
    for (const id of epoch.deliveryEventIds) {
      const event = this.run.events.find((entry) => entry.id === id);
      if (event) event.epochIndex = epochIndex;
    }
  }

  private createSceneHook(
    draft: WorldDraftScene | null,
    epochIndex: number,
    appliedByLocal: Map<string, WorldEvent>,
  ): WorldSceneHook | null {
    const candidates = this.run.definition.setting.actors.filter(
      (actor) => this.run.actors[actor.id]?.regionId === this.run.definition.setting.spotlightRegionId,
    );
    let scene = draft;
    if (!scene && candidates.length >= 2) {
      const regionEvents = [...appliedByLocal.values()]
        .filter((event) => event.regionId === this.run.definition.setting.spotlightRegionId)
        .sort((a, b) => b.actorIds.length - a.actorIds.length);
      const source = regionEvents[0] ?? [...appliedByLocal.values()][0];
      if (source) {
        const participants = candidates.slice(0, 4).map((actor) => actor.id);
        const region = this.run.definition.setting.regions.find(
          (entry) => entry.id === this.run.definition.setting.spotlightRegionId,
        );
        scene = {
          eventLocalId: source.localId,
          regionId: this.run.definition.setting.spotlightRegionId,
          title: `聚焦：${source.title}`,
          question: '这一刻，谁会先做出选择？',
          stakes: region?.publicStatus ?? '局势正在收紧。',
          publicBrief: [
            source.publicNarrative || source.summary,
            region?.description ? truncate(region.description, 200) : '',
          ]
            .filter(Boolean)
            .join('\n'),
          participantIds: participants,
          privateCues: participants.map((actorId) => ({
            actorId,
            cue: this.privateCueForActor(actorId, participants),
          })),
        };
      }
    }
    if (!scene) return null;
    const validActors = new Set(
      scene.participantIds.filter(
        (id) => this.run.actors[id]?.regionId === scene!.regionId,
      ),
    );
    if (validActors.size < 2) return null;
    const event =
      (scene.eventLocalId ? appliedByLocal.get(scene.eventLocalId) : null) ??
      [...appliedByLocal.values()].find((entry) => entry.regionId === scene.regionId) ??
      [...appliedByLocal.values()][0] ??
      null;
    if (!event) return null;
    const region = this.run.definition.setting.regions.find((entry) => entry.id === scene.regionId);
    const privateCues = scene.privateCues.length
      ? scene.privateCues.filter((cue) => validActors.has(cue.actorId))
      : [...validActors].map((actorId) => ({ actorId, cue: this.privateCueForActor(actorId, [...validActors]) }));
    for (const actorId of validActors) {
      if (!privateCues.some((cue) => cue.actorId === actorId)) {
        privateCues.push({ actorId, cue: this.privateCueForActor(actorId, [...validActors]) });
      }
    }
    const hook: WorldSceneHook = {
      id: newId('hook'),
      epochIndex,
      sourceEventId: event.id,
      regionId: scene.regionId,
      title: scene.title || `聚焦：${event.title}`,
      question: scene.question,
      stakes: scene.stakes,
      publicBrief:
        scene.publicBrief ||
        [event.publicNarrative || event.summary, region?.publicStatus ?? ''].filter(Boolean).join('\n'),
      participantIds: [...validActors],
      privateCues,
      status: 'offered',
      runId: null,
      createdAt: nowIso(),
    };
    this.run.sceneHooks.push(hook);
    return hook;
  }

  private privateCueForActor(actorId: string, participants: string[]): string {
    const known = this.run.facts
      .filter((fact) => fact.retiredAtEpoch === null && fact.knownBy.includes(actorId))
      .filter((fact) => !participants.every((id) => fact.knownBy.includes(id)))
      .sort((a, b) => b.importance - a.importance || b.createdEpoch - a.createdEpoch)
      .slice(0, 2)
      .map((fact) => truncate(fact.text, 120));
    if (!known.length) return '有些细节只有你注意到了；但你还不知道它意味着什么。';
    return `你记得：${known.join('；')}`;
  }
}
