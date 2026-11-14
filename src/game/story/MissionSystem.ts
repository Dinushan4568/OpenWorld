/**
 * Deterministic mission state machine.
 *
 * The system is engine-free: objectives are advanced by plain events (talk,
 * interact, puzzle, scan, shards, choice, reach) so the complete chapter can be
 * played through in a unit test without a renderer.
 */
import { Emitter } from '../core/emitter';
import { clamp, distance2D } from '../util/math';
import {
  MAIN_MISSION_IDS,
  MISSION_IDS,
  MISSION_LIST,
  MISSIONS,
} from './content';
import type {
  MissionDefinition,
  MissionObjective,
  MissionReward,
  ObjectiveKind,
  StoryEvent,
  StoryObjectiveProgress,
  StoryState,
} from './types';

export const STORY_KEY = 'eotlw.story.v1';

export interface StoryEvents extends Record<string, unknown> {
  change: { state: Readonly<StoryState> };
  missionStarted: { mission: MissionDefinition; objective: MissionObjective };
  objectiveCompleted: {
    mission: MissionDefinition;
    objective: MissionObjective;
    next: MissionObjective | null;
  };
  missionCompleted: {
    mission: MissionDefinition;
    reward: MissionReward;
    nextMission: MissionDefinition | null;
  };
  chapterCompleted: { endingId: string };
}

const blankState = (): StoryState => ({
  version: 1,
  chapter: 1,
  active: [],
  completed: [],
  progress: {},
  flags: {},
  marks: 0,
  items: [],
  codex: [],
  seenDialogues: [],
  readMemories: [],
  ending: null,
});

const stringList = (value: unknown, limit = 200): string[] =>
  Array.isArray(value)
    ? Array.from(new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length < 160))).slice(0, limit)
    : [];

/** Tolerant load: unknown missions/objectives are dropped and bad numbers clamped. */
export function sanitizeStoryState(input: unknown): StoryState {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const active = stringList(raw.active).filter((id) => MISSION_IDS.has(id));
  const completed = stringList(raw.completed).filter((id) => MISSION_IDS.has(id));
  const activeClean = active.filter((id) => !completed.includes(id));
  const progress: Record<string, Record<string, StoryObjectiveProgress>> = {};
  const rawProgress = (raw.progress && typeof raw.progress === 'object' ? raw.progress : {}) as Record<string, unknown>;
  for (const missionId of [...activeClean, ...completed]) {
    const mission = MISSIONS[missionId];
    if (!mission) continue;
    const source = (rawProgress[missionId] && typeof rawProgress[missionId] === 'object'
      ? rawProgress[missionId]
      : {}) as Record<string, unknown>;
    const entries: Record<string, StoryObjectiveProgress> = {};
    for (const objective of mission.objectives) {
      const value = (source[objective.id] && typeof source[objective.id] === 'object'
        ? source[objective.id]
        : {}) as Record<string, unknown>;
      entries[objective.id] = {
        done: value.done === true,
        count:
          typeof value.count === 'number' && Number.isFinite(value.count)
            ? clamp(Math.floor(value.count), 0, 10000)
            : 0,
        targets: stringList(value.targets, 50),
      };
    }
    progress[missionId] = entries;
  }
  const flagsRaw = (raw.flags && typeof raw.flags === 'object' ? raw.flags : {}) as Record<string, unknown>;
  const flags: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(flagsRaw)) {
    if (typeof value === 'boolean' && key.length < 120) flags[key] = value;
  }
  const marks =
    typeof raw.marks === 'number' && Number.isFinite(raw.marks) ? clamp(Math.floor(raw.marks), 0, 1_000_000) : 0;
  const ending = typeof raw.ending === 'string' && raw.ending.length < 40 ? raw.ending : null;
  return {
    version: 1,
    chapter: typeof raw.chapter === 'number' && Number.isFinite(raw.chapter) ? clamp(Math.floor(raw.chapter), 1, 99) : 1,
    active: activeClean,
    completed,
    progress,
    flags,
    marks,
    items: stringList(raw.items),
    codex: stringList(raw.codex),
    seenDialogues: stringList(raw.seenDialogues),
    readMemories: stringList(raw.readMemories),
    ending,
  };
}

function safeStoryStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const probe = '__eotlw_story_probe__';
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return localStorage;
  } catch {
    return null;
  }
}

export class MissionSystem extends Emitter<StoryEvents> {
  private data: StoryState;
  private readonly storage: Storage | null;
  private lastShards = 0;

  constructor(storage?: Storage | null) {
    super();
    this.storage = storage === undefined ? safeStoryStorage() : storage;
    this.data = this.read();
    this.repairActiveMissions();
  }

  /* ------------------------------- state ------------------------------- */

  get state(): Readonly<StoryState> {
    return this.data;
  }

  get marks(): number {
    return this.data.marks;
  }

  get chapterComplete(): boolean {
    return this.data.ending !== null;
  }

  get hasProgress(): boolean {
    // A freshly auto-started first mission is not a save. Actual play leaves
    // flags, rewards, archive entries or a completed mission behind.
    return (
      this.data.completed.length > 0 ||
      this.data.marks > 0 ||
      this.data.ending !== null ||
      this.data.items.length > 0 ||
      this.data.codex.length > 0 ||
      this.data.readMemories.length > 0 ||
      this.data.seenDialogues.length > 0 ||
      Object.keys(this.data.flags).length > 0
    );
  }

  get mainCompleted(): number {
    return MAIN_MISSION_IDS.filter((id) => this.data.completed.includes(id)).length;
  }

  hasUpgrade(id: string): boolean {
    return this.data.items.includes(id);
  }

  hasFlag(id: string): boolean {
    return this.data.flags[id] === true;
  }

  objectiveProgress(missionId: string, objectiveId: string): StoryObjectiveProgress {
    return (
      this.data.progress[missionId]?.[objectiveId] ?? {
        done: false,
        count: 0,
        targets: [],
      }
    );
  }

  currentObjective(missionId: string): MissionObjective | null {
    const mission = MISSIONS[missionId];
    if (!mission) return null;
    for (const objective of mission.objectives) {
      if (!this.objectiveProgress(missionId, objective.id).done) return objective;
    }
    return null;
  }

  currentMission(): MissionDefinition | null {
    const active = MISSION_LIST.filter((mission) => this.data.active.includes(mission.id));
    return active.find((mission) => mission.kind === 'main') ?? active[0] ?? null;
  }

  isUnlocked(mission: MissionDefinition): boolean {
    if (mission.unlockedBy && mission.unlockedBy.length > 0) {
      return mission.unlockedBy.every((id) => this.data.completed.includes(id));
    }
    return true;
  }

  availableMissions(): MissionDefinition[] {
    return MISSION_LIST.filter(
      (mission) =>
        !this.data.completed.includes(mission.id) &&
        !this.data.active.includes(mission.id) &&
        this.isUnlocked(mission),
    );
  }

  /* ------------------------------ lifecycle ---------------------------- */

  private read(): StoryState {
    if (!this.storage) return blankState();
    try {
      const raw = this.storage.getItem(STORY_KEY);
      return raw ? sanitizeStoryState(JSON.parse(raw)) : blankState();
    } catch (error) {
      console.warn('[story] could not read saved mission progress, starting fresh', error);
      return blankState();
    }
  }

  /** Repair a save that lost its active mission list but not its history. */
  private repairActiveMissions(): void {
    if (this.data.ending) {
      this.data.active = this.data.active.filter((id) => MISSIONS[id]?.kind === 'side');
    }
    for (const id of this.data.active) {
      const mission = MISSIONS[id];
      if (!mission) continue;
      if (!this.data.progress[id]) this.data.progress[id] = this.blankObjectives(mission);
    }
    if (this.data.active.length === 0) {
      const next = MAIN_MISSION_IDS.map((id) => MISSIONS[id]).find(
        (mission) => !this.data.completed.includes(mission.id) && this.isUnlocked(mission),
      );
      if (next) this.startMission(next.id, { silent: true });
    }
  }

  reset(): void {
    this.data = blankState();
    this.lastShards = 0;
    try {
      this.storage?.removeItem(STORY_KEY);
    } catch {
      /* ignore */
    }
    this.startMission('main_survey', { silent: true });
    this.save();
    this.emit('change', { state: this.data });
  }

  ensureStarted(): void {
    if (this.data.active.length === 0 && this.data.completed.length === 0 && !this.data.ending) {
      this.startMission('main_survey');
    }
  }

  private blankObjectives(mission: MissionDefinition): Record<string, StoryObjectiveProgress> {
    const entries: Record<string, StoryObjectiveProgress> = {};
    for (const objective of mission.objectives) {
      entries[objective.id] = { done: false, count: 0, targets: [] };
    }
    return entries;
  }

  startMission(id: string, options: { silent?: boolean; force?: boolean } = {}): boolean {
    const mission = MISSIONS[id];
    if (!mission) return false;
    if (this.data.active.includes(id) || this.data.completed.includes(id)) return false;
    if (!options.force && !this.isUnlocked(mission)) return false;
    this.data.active.push(id);
    if (!this.data.progress[id]) this.data.progress[id] = this.blankObjectives(mission);
    const objective = this.currentObjective(id);
    if (!options.silent && objective) this.emit('missionStarted', { mission, objective });
    this.save();
    this.refreshMission(id);
    this.emit('change', { state: this.data });
    return true;
  }

  /** Feed the state machine a world event. */
  notify(event: StoryEvent): void {
    let changed = false;
    for (const missionId of [...this.data.active]) {
      const mission = MISSIONS[missionId];
      if (!mission) continue;
      const objective = this.currentObjective(missionId);
      if (!objective || !this.matches(objective, event)) continue;
      if (this.applyEvent(mission, objective, event)) changed = true;
    }
    if (changed) {
      this.save();
      this.emit('change', { state: this.data });
    }
  }

  /** Reach objectives are polled by the game instead of being world events. */
  updatePosition(x: number, z: number): boolean {
    let changed = false;
    for (const missionId of [...this.data.active]) {
      const mission = MISSIONS[missionId];
      const objective = this.currentObjective(missionId);
      if (!mission || !objective || objective.kind !== 'reach') continue;
      if (objective.x === undefined || objective.z === undefined) continue;
      const radius = objective.radius ?? 40;
      if (distance2D(x, z, objective.x, objective.z) > radius) continue;
      this.completeObjective(mission, objective);
      changed = true;
    }
    if (changed) {
      this.save();
      this.emit('change', { state: this.data });
    }
    return changed;
  }

  setShards(count: number): void {
    const safe = clamp(Math.floor(count), 0, 5);
    if (safe === this.lastShards) return;
    this.lastShards = safe;
    let changed = false;
    for (const missionId of [...this.data.active]) {
      const mission = MISSIONS[missionId];
      const objective = this.currentObjective(missionId);
      if (!mission || !objective || objective.kind !== 'shards') continue;
      const progress = this.objectiveProgress(missionId, objective.id);
      if (progress.count === safe) continue;
      progress.count = safe;
      if (safe >= (objective.count ?? 1)) {
        this.completeObjective(mission, objective);
      }
      changed = true;
    }
    if (changed) {
      this.save();
      this.emit('change', { state: this.data });
    }
  }

  setFlag(id: string, value = true): void {
    if (this.data.flags[id] === value) return;
    this.data.flags[id] = value;
    this.save();
    this.emit('change', { state: this.data });
  }

  addCodex(id: string): boolean {
    if (this.data.codex.includes(id)) return false;
    this.data.codex.push(id);
    this.save();
    this.emit('change', { state: this.data });
    return true;
  }

  addItem(id: string): boolean {
    if (this.data.items.includes(id)) return false;
    this.data.items.push(id);
    this.save();
    this.emit('change', { state: this.data });
    return true;
  }

  markDialogueSeen(id: string): void {
    if (this.data.seenDialogues.includes(id)) return;
    this.data.seenDialogues.push(id);
    this.save();
  }

  markMemoryRead(id: string): void {
    if (this.data.readMemories.includes(id)) return;
    this.data.readMemories.push(id);
    this.save();
    this.emit('change', { state: this.data });
  }

  completeChapter(endingId: string): void {
    if (this.data.ending) return;
    this.data.ending = endingId;
    // Optional field work can continue after the chapter's final choice.
    this.data.active = this.data.active.filter((id) => MISSIONS[id]?.kind === 'side');
    this.save();
    this.emit('chapterCompleted', { endingId });
    this.emit('change', { state: this.data });
  }

  save(): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(STORY_KEY, JSON.stringify(this.data));
    } catch {
      /* storage may be blocked; the expedition continues in memory */
    }
  }

  /* ----------------------------- objective core ------------------------ */

  private matches(objective: MissionObjective, event: StoryEvent): boolean {
    if (objective.kind !== event.type) return false;
    if (objective.kind === 'scan') {
      const accepted = objective.targets ?? (objective.target ? [objective.target] : []);
      return accepted.includes(event.target);
    }
    return objective.target === event.target;
  }

  private applyEvent(mission: MissionDefinition, objective: MissionObjective, event: StoryEvent): boolean {
    const progress = this.objectiveProgress(mission.id, objective.id);
    if (objective.kind === 'scan') {
      const required = objective.count ?? 1;
      if (!progress.targets.includes(event.target)) progress.targets.push(event.target);
      progress.count = progress.targets.length;
      if (progress.count >= required) this.completeObjective(mission, objective);
      return true;
    }
    if (objective.kind === 'shards') {
      const required = objective.count ?? 1;
      progress.count = Math.max(progress.count, event.count ?? this.lastShards);
      if (progress.count >= required) this.completeObjective(mission, objective);
      return true;
    }
    this.completeObjective(mission, objective);
    return true;
  }

  private completeObjective(mission: MissionDefinition, objective: MissionObjective): void {
    const progress = this.objectiveProgress(mission.id, objective.id);
    if (progress.done) return;
    progress.done = true;
    if (objective.kind === 'interact' || objective.kind === 'puzzle' || objective.kind === 'choice') {
      progress.count = 1;
    }
    if (objective.kind === 'talk') progress.count = 1;
    if (objective.flag) this.data.flags[objective.flag] = true;
    const next = this.currentObjective(mission.id);
    this.emit('objectiveCompleted', { mission, objective, next });
    this.save();
    this.refreshMission(mission.id);
  }

  /** Cascade through countable objectives that are already satisfied. */
  private refreshMission(missionId: string): void {
    const mission = MISSIONS[missionId];
    if (!mission) return;
    let objective = this.currentObjective(missionId);
    let guard = 0;
    while (objective && guard < 20) {
      guard += 1;
      if (objective.kind === 'shards') {
        const progress = this.objectiveProgress(missionId, objective.id);
        if (this.lastShards >= (objective.count ?? 1)) {
          this.completeObjective(mission, objective);
          objective = this.currentObjective(missionId);
          continue;
        }
      }
      break;
    }
    if (mission.objectives.every((entry) => this.objectiveProgress(missionId, entry.id).done)) {
      this.completeMission(mission);
    }
  }

  private completeMission(mission: MissionDefinition): void {
    if (this.data.completed.includes(mission.id)) return;
    this.data.active = this.data.active.filter((id) => id !== mission.id);
    this.data.completed.push(mission.id);
    this.data.flags[`mission-done:${mission.id}`] = true;
    const reward = mission.reward;
    this.data.marks += reward.marks;
    if (reward.item && !this.data.items.includes(reward.item)) this.data.items.push(reward.item);
    if (reward.codex && !this.data.codex.includes(reward.codex)) this.data.codex.push(reward.codex);
    const nextMission = mission.next ? MISSIONS[mission.next] ?? null : null;
    this.save();
    this.emit('missionCompleted', { mission, reward, nextMission });
    if (mission.next) this.startMission(mission.next);
    this.emit('change', { state: this.data });
  }

  /* -------------------------------- views ------------------------------ */

  objectiveKindLabel(kind: ObjectiveKind): string {
    switch (kind) {
      case 'talk':
        return 'Speak';
      case 'reach':
        return 'Travel';
      case 'interact':
        return 'Recover';
      case 'puzzle':
        return 'Align';
      case 'scan':
        return 'Scan';
      case 'shards':
        return 'Recover';
      case 'choice':
        return 'Decide';
    }
  }

  /** Reset the shard counter without altering saved objective progress. */
  syncShardsImmediately(count: number): void {
    this.lastShards = clamp(Math.floor(count), 0, 5);
  }
}
