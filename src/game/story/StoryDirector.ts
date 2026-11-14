/**
 * Story director: turns the world's interactions into dialogue, mission
 * advances, puzzle hand-offs and persistent story flags.
 *
 * This layer is still engine-free. It knows where story objects stand, but not
 * how they are drawn; `StoryWorld` consumes its `worldView()` snapshot.
 */
import { distance2D } from '../util/math';
import {
  CHAPTER,
  CODEX,
  DIALOGUE_BY_ID,
  ENDINGS,
  INTERACTABLES,
  INTERACTABLE_BY_ID,
  ITEM_LABELS,
  MEMORIES,
  MISSIONS,
  NPCS,
  NPC_BY_ID,
  PUZZLE_CONSOLE,
  PUZZLES,
  SIDE_MISSION_IDS,
  MAIN_MISSION_IDS,
} from './content';
import { MissionSystem } from './MissionSystem';
import type {
  DialogueChoiceData,
  DialogueDefinition,
  DialogueSession,
  DialogueView,
  EndingDefinition,
  InteractableDefinition,
  JournalMissionView,
  JournalView,
  MemoryEntry,
  MissionDefinition,
  MissionObjective,
  NpcDefinition,
  ObjectiveTarget,
  PuzzleDefinition,
  StoryEffect,
  StoryState,
  WorldStoryView,
} from './types';

export interface StoryNotice {
  text: string;
  kind: 'default' | 'accent' | 'warn';
}

export interface DialogueStep {
  view?: DialogueView;
  close: boolean;
  notices: StoryNotice[];
}

export type InteractionResult =
  | { type: 'dialogue'; session: DialogueSession }
  | { type: 'puzzle'; puzzle: PuzzleDefinition; consoleId: string }
  | { type: 'pickup'; notices: StoryNotice[]; label: string }
  | { type: 'blocked'; notice: StoryNotice }
  | { type: 'none' };

const CHOICE_INTERACTABLE: Record<string, string> = {
  choir: 'gate-witness',
};

export class StoryDirector {
  readonly missions: MissionSystem;

  constructor(storage?: Storage | null) {
    this.missions = new MissionSystem(storage);
    this.missions.ensureStarted();
    this.syncStoryRules();
  }

  get state(): Readonly<StoryState> {
    return this.missions.state;
  }

  reset(): void {
    this.missions.reset();
    this.syncStoryRules();
  }

  get chapterComplete(): boolean {
    return this.missions.chapterComplete;
  }

  get marks(): number {
    return this.missions.marks;
  }

  hasUpgrade(id: string): boolean {
    return this.missions.hasUpgrade(id);
  }

  /* ------------------------------ dialogue ----------------------------- */

  /** Select the highest-priority eligible conversation for an NPC. */
  dialogueFor(npcId: string): DialogueDefinition | null {
    const candidates = Object.values(DIALOGUE_BY_ID)
      .filter((dialogue) => dialogue.npcId === npcId)
      .filter((dialogue) => this.eligible(dialogue))
      .filter((dialogue) => !(dialogue.once && this.state.seenDialogues.includes(dialogue.id)))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
    return candidates[0] ?? null;
  }

  beginNpcDialogue(npcId: string): DialogueSession | null {
    const dialogue = this.dialogueFor(npcId);
    if (!dialogue) return null;
    return {
      id: dialogue.id,
      npcId,
      title: dialogue.title,
      view: this.viewFor(dialogue, dialogue.start),
    };
  }

  beginDialogueById(id: string): DialogueSession | null {
    const dialogue = DIALOGUE_BY_ID[id];
    if (!dialogue) return null;
    return {
      id: dialogue.id,
      npcId: dialogue.npcId,
      title: dialogue.title,
      view: this.viewFor(dialogue, dialogue.start),
    };
  }

  beginMemoryDialogue(memoryId: string): DialogueSession | null {
    const memory = MEMORIES[memoryId];
    if (!memory) return null;
    this.missions.markMemoryRead(memoryId);
    if (memory.codex) this.missions.addCodex(memory.codex);
    return {
      id: `memory:${memoryId}`,
      npcId: null,
      title: memory.title,
      view: {
        speaker: memory.speaker,
        role: memory.role,
        title: memory.title,
        text: memory.text,
        nodeId: 'record',
        choices: [{ id: 'close', text: 'Step back from the memorial.' }],
      },
    };
  }

  private viewFor(dialogue: DialogueDefinition, nodeId: string): DialogueView {
    const node = dialogue.nodes[nodeId] ?? dialogue.nodes[dialogue.start];
    const npc = dialogue.npcId ? NPC_BY_ID[dialogue.npcId] : null;
    return {
      speaker: node.speaker ?? npc?.name ?? 'Unknown',
      role: node.role ?? npc?.role ?? '',
      title: node.title ?? dialogue.title,
      text: node.text,
      nodeId: node.id,
      choices: node.choices.map((choice) => ({ id: choice.id, text: choice.text })),
    };
  }

  /** Apply the effects of a dialogue choice and advance or close the session. */
  choose(session: DialogueSession, choiceId: string): DialogueStep {
    if (session.id.startsWith('memory:')) return { close: true, notices: [] };
    const dialogue = DIALOGUE_BY_ID[session.id];
    if (!dialogue) return { close: true, notices: [] };
    const node = dialogue.nodes[session.view.nodeId] ?? dialogue.nodes[dialogue.start];
    const choice = node.choices.find((entry) => entry.id === choiceId);
    if (!choice) return { close: false, notices: [] };
    const notices = this.applyEffects(choice.effects ?? []);
    const closes = choice.end ?? !choice.next;
    if (!closes && choice.next) {
      return { close: false, notices, view: this.viewFor(dialogue, choice.next) };
    }
    return { close: true, notices };
  }

  /** Called once a conversation has actually closed. */
  finishDialogue(session: DialogueSession): void {
    if (session.id.startsWith('memory:')) return;
    const dialogue = DIALOGUE_BY_ID[session.id];
    if (!dialogue) return;
    if (dialogue.once) this.missions.markDialogueSeen(dialogue.id);
    if (dialogue.completesTalk !== false && dialogue.npcId) {
      this.missions.notify({ type: 'talk', target: dialogue.npcId });
    }
    this.syncStoryRules();
    this.missions.save();
  }

  private eligible(dialogue: DialogueDefinition): boolean {
    const req = dialogue.requires;
    if (!req) return true;
    const state = this.state;
    if (req.chapterComplete === true && !state.ending) return false;
    if (req.chapterComplete === false && state.ending) return false;
    if (req.flagsAll && !req.flagsAll.every((flag) => state.flags[flag] === true)) return false;
    if (req.flagsNone && !req.flagsNone.every((flag) => state.flags[flag] !== true)) return false;
    if (req.missionActive && !state.active.includes(req.missionActive)) return false;
    if (req.missionComplete && !state.completed.includes(req.missionComplete)) return false;
    if (req.missionNotComplete && state.completed.includes(req.missionNotComplete)) return false;
    return true;
  }

  /* ------------------------------ effects ------------------------------ */

  private applyEffects(effects: ReadonlyArray<StoryEffect>): StoryNotice[] {
    const notices: StoryNotice[] = [];
    for (const effect of effects) {
      if (effect.type === 'startMission') {
        const mission = MISSIONS[effect.id];
        if (mission && this.missions.startMission(mission.id, { force: true })) {
          notices.push({
            text: `${mission.kind === 'main' ? 'Main mission' : 'Side mission'} · ${mission.title}`,
            kind: 'accent',
          });
        }
      } else if (effect.type === 'setFlag') {
        this.missions.setFlag(effect.id, effect.value ?? true);
      } else if (effect.type === 'giveItem') {
        if (this.missions.addItem(effect.id)) {
          notices.push({ text: `Acquired · ${ITEM_LABELS[effect.id] ?? effect.id}`, kind: 'accent' });
        }
      } else if (effect.type === 'codex') {
        if (this.missions.addCodex(effect.id)) {
          notices.push({ text: `Archive entry · ${CODEX[effect.id]?.title ?? effect.id}`, kind: 'default' });
        }
      } else if (effect.type === 'relocateNpc') {
        this.missions.setFlag(`npc-place:${effect.id}:${effect.place}`, true);
      } else if (effect.type === 'ending') {
        this.finishEnding(effect.id, notices);
      }
    }
    this.syncStoryRules();
    return notices;
  }

  private finishEnding(endingId: string, notices: StoryNotice[]): void {
    const ending = ENDINGS[endingId];
    if (!ending) return;
    this.missions.addCodex(`codex-ending-${endingId}`);
    // The choice objective is part of the final mission.
    this.missions.notify({ type: 'choice', target: 'choir' });
    this.missions.completeChapter(endingId);
    notices.push({ text: ending.title, kind: 'accent' });
  }

  /* --------------------------- interactions ---------------------------- */

  interact(id: string): InteractionResult {
    const definition = INTERACTABLE_BY_ID[id];
    if (!definition) return { type: 'none' };
    if (definition.memory) {
      const session = this.beginMemoryDialogue(definition.memory);
      return session ? { type: 'dialogue', session } : { type: 'none' };
    }
    if (!this.isAvailable(id)) {
      return {
        type: 'blocked',
        notice: { text: 'That mechanism is dormant.', kind: 'warn' },
      };
    }
    if (definition.puzzle) {
      const puzzle = PUZZLES[definition.puzzle];
      if (!puzzle) return { type: 'none' };
      return { type: 'puzzle', puzzle, consoleId: definition.id };
    }
    if (definition.dialogue) {
      const session = this.beginDialogueById(definition.dialogue);
      return session ? { type: 'dialogue', session } : { type: 'none' };
    }
    const notices: StoryNotice[] = [];
    if (definition.flags) {
      for (const flag of definition.flags) this.missions.setFlag(flag);
    }
    this.missions.notify({ type: 'interact', target: definition.id });
    if (definition.notice) notices.push({ text: definition.notice, kind: 'default' });
    this.syncStoryRules();
    this.missions.save();
    return { type: 'pickup', notices, label: definition.label };
  }

  solvePuzzle(puzzleId: string): StoryNotice[] {
    const puzzle = PUZZLES[puzzleId];
    if (!puzzle) return [];
    const notices: StoryNotice[] = [];
    this.missions.notify({ type: 'puzzle', target: puzzleId });
    notices.push({ text: puzzle.success, kind: 'accent' });
    this.syncStoryRules();
    this.missions.save();
    return notices;
  }

  scan(kind: string): void {
    this.missions.notify({ type: 'scan', target: kind });
  }

  setShards(count: number): void {
    this.missions.setShards(count);
  }

  updatePosition(x: number, z: number): void {
    if (this.missions.updatePosition(x, z)) this.syncStoryRules();
  }

  /* ------------------------------ world view --------------------------- */

  isAvailable(id: string): boolean {
    const definition = INTERACTABLE_BY_ID[id];
    if (!definition) return false;
    if (definition.memory) return true;
    if (definition.flags?.some((flag) => this.state.flags[flag] === true)) return false;
    return this.availableInteractions().has(id);
  }

  availableInteractions(): Set<string> {
    const list = new Set<string>();
    for (const interactable of INTERACTABLES) {
      if (interactable.memory) list.add(interactable.id);
    }
    for (const missionId of this.state.active) {
      const mission = MISSIONS[missionId];
      const objective = this.missions.currentObjective(missionId);
      if (!mission || !objective) continue;
      if (objective.kind === 'interact' && objective.target) list.add(objective.target);
      if (objective.kind === 'puzzle' && objective.target) {
        const consoleId = PUZZLE_CONSOLE[objective.target];
        if (consoleId) list.add(consoleId);
      }
      if (objective.kind === 'choice' && objective.target) {
        const interactableId = CHOICE_INTERACTABLE[objective.target];
        if (interactableId) list.add(interactableId);
      }
    }
    return list;
  }

  private consumed(): string[] {
    return INTERACTABLES.filter(
      (entry) => entry.consume && entry.flags?.some((flag) => this.state.flags[flag] === true),
    ).map((entry) => entry.id);
  }

  npcLocations(): Record<string, { x: number; z: number; heading: number }> {
    const result: Record<string, { x: number; z: number; heading: number }> = {};
    for (const npc of NPCS) {
      let position = npc.home;
      let heading = npc.heading;
      if (npc.alt && this.state.flags[`npc-place:${npc.id}:${npc.alt.place}`] === true) {
        position = npc.alt;
        heading = npc.alt.heading;
      }
      result[npc.id] = { x: position.x, z: position.z, heading };
    }
    return result;
  }

  npcMarkers(): Record<string, 'main' | 'side'> {
    const result: Record<string, 'main' | 'side'> = {};
    for (const npc of NPCS) {
      for (const missionId of this.state.active) {
        const mission = MISSIONS[missionId];
        const objective = this.missions.currentObjective(missionId);
        if (mission && objective?.kind === 'talk' && objective.target === npc.id) {
          result[npc.id] = mission.kind;
          break;
        }
      }
      if (result[npc.id]) continue;
      const offered = this.dialogueFor(npc.id);
      if (offered && (offered.priority ?? 0) > 0) {
        result[npc.id] = offered.id.includes('side') || npc.id === 'kesh' ? 'side' : 'main';
      }
    }
    return result;
  }

  worldView(): WorldStoryView {
    return {
      available: Array.from(this.availableInteractions()),
      consumed: this.consumed(),
      solvedPuzzles: (['continuity-lock', 'witness-array'] as const).filter((id) => {
        const flag = id === 'continuity-lock' ? 'lock-solved' : 'gate-solved';
        return this.state.flags[flag] === true;
      }),
      readMemories: [...this.state.readMemories],
      npcs: this.npcLocations(),
      highlights: this.npcMarkers(),
      chapterComplete: this.chapterComplete,
    };
  }

  /* ------------------------------- targets ----------------------------- */

  currentMission(): MissionDefinition | null {
    return this.missions.currentMission();
  }

  currentObjective(): MissionObjective | null {
    const mission = this.currentMission();
    return mission ? this.missions.currentObjective(mission.id) : null;
  }

  currentTarget(): ObjectiveTarget | null {
    const mission = this.currentMission();
    const objective = mission ? this.missions.currentObjective(mission.id) : null;
    if (!mission || !objective) return null;
    if (objective.kind === 'talk' && objective.target) {
      const npc = NPC_BY_ID[objective.target];
      if (!npc) return null;
      const location = this.npcLocations()[npc.id];
      return { id: npc.id, x: location.x, z: location.z, label: npc.name, kind: mission.kind };
    }
    if (objective.kind === 'reach' && objective.x !== undefined && objective.z !== undefined) {
      return {
        id: objective.id,
        x: objective.x,
        z: objective.z,
        label: objective.text,
        kind: mission.kind,
      };
    }
    if ((objective.kind === 'interact' || objective.kind === 'puzzle' || objective.kind === 'choice') && objective.target) {
      let interactableId: string | undefined = objective.target;
      if (objective.kind === 'puzzle') interactableId = PUZZLE_CONSOLE[objective.target];
      if (objective.kind === 'choice') interactableId = CHOICE_INTERACTABLE[objective.target];
      const entry = interactableId ? INTERACTABLE_BY_ID[interactableId] : null;
      if (!entry) return null;
      return { id: entry.id, x: entry.x, z: entry.z, label: entry.label, kind: mission.kind };
    }
    return null;
  }

  objectiveProgress(): { completed: number; total: number } {
    const mission = this.currentMission();
    if (!mission) return { completed: 0, total: 0 };
    const completed = mission.objectives.filter(
      (objective) => this.missions.objectiveProgress(mission.id, objective.id).done,
    ).length;
    return { completed, total: mission.objectives.length };
  }

  objectiveCount(): { count: number; required: number } | null {
    const mission = this.currentMission();
    const objective = mission ? this.missions.currentObjective(mission.id) : null;
    if (!mission || !objective) return null;
    if (objective.kind !== 'shards' && objective.kind !== 'scan') return null;
    const progress = this.missions.objectiveProgress(mission.id, objective.id);
    return { count: progress.count, required: objective.count ?? 1 };
  }

  /* -------------------------------- journal ---------------------------- */

  journal(shards: number, shardTotal: number): JournalView {
    const missions = [...MAIN_MISSION_IDS.map((id) => MISSIONS[id]), ...SIDE_MISSION_IDS.map((id) => MISSIONS[id])]
      .filter((mission): mission is MissionDefinition => Boolean(mission))
      .map((mission) => this.missionView(mission));
    const mainTotal = MAIN_MISSION_IDS.length;
    const sideTotal = SIDE_MISSION_IDS.length;
    const ending = this.state.ending ? ENDINGS[this.state.ending] ?? null : null;
    return {
      chapterTitle: CHAPTER.title,
      chapterSubtitle: CHAPTER.subtitle,
      missions,
      mainComplete: this.missions.mainCompleted,
      mainTotal,
      sideComplete: SIDE_MISSION_IDS.filter((id) => this.state.completed.includes(id)).length,
      sideTotal,
      marks: this.state.marks,
      items: this.state.items.map((id) => ({ id, label: ITEM_LABELS[id] ?? id })),
      codex: this.state.codex
        .map((id) => CODEX[id])
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .map((entry) => ({ id: entry.id, title: entry.title, category: entry.category })),
      ending,
      shards,
      shardTotal,
    };
  }

  private missionView(mission: MissionDefinition): JournalMissionView {
    const status: JournalMissionView['status'] = this.state.completed.includes(mission.id)
      ? 'complete'
      : this.state.active.includes(mission.id)
        ? 'active'
        : this.missions.isUnlocked(mission)
          ? 'available'
          : 'locked';
    const current = this.missions.currentObjective(mission.id);
    return {
      id: mission.id,
      kind: mission.kind,
      title: mission.title,
      giver: mission.giver,
      summary: mission.summary,
      status,
      objectives: mission.objectives.map((objective) => {
        const progress = this.missions.objectiveProgress(mission.id, objective.id);
        const isCurrent = status === 'active' && current?.id === objective.id;
        const counted = objective.kind === 'shards' || objective.kind === 'scan';
        return {
          id: objective.id,
          text: objective.text,
          done: progress.done,
          current: isCurrent,
          progress: counted
            ? { count: progress.count, required: objective.count ?? 1 }
            : undefined,
        };
      }),
      reward: mission.reward.label,
    };
  }

  /* ------------------------------- helpers ----------------------------- */

  private syncStoryRules(): void {
    // Completing the vault mission always sends Iona to the gate, even if the
    // player closes the conversation before choosing the explicit option.
    if (
      this.state.completed.includes('main_vault') &&
      this.state.flags['iona-at-gate'] !== true
    ) {
      this.missions.setFlag('npc-place:iona:gate', true);
      this.missions.setFlag('iona-at-gate', true);
    }
  }

  /** Read-only story text helpers used by the HUD and notifications. */
  missionTitle(): string {
    return this.currentMission()?.title ?? (this.chapterComplete ? 'Chapter One complete' : 'No active mission');
  }

  objectiveText(): string {
    const mission = this.currentMission();
    const objective = this.currentObjective();
    if (!mission || !objective) {
      return this.chapterComplete
        ? 'The valley is yours to explore. The archive is open.'
        : 'Open the mission log for your next objective.';
    }
    return objective.text;
  }

  chapterTitle(): string {
    return CHAPTER.title;
  }

  chapterSubtitle(): string {
    return CHAPTER.subtitle;
  }

  ending(): EndingDefinition | null {
    return this.state.ending ? ENDINGS[this.state.ending] ?? null : null;
  }

  /** True when the nearest NPC has something worth hearing. */
  hasDialogue(npcId: string): boolean {
    return this.dialogueFor(npcId) !== null;
  }

  npcName(npcId: string): string {
    return NPC_BY_ID[npcId]?.name ?? npcId;
  }

  npc(id: string): NpcDefinition | null {
    return NPC_BY_ID[id] ?? null;
  }

  memory(id: string): MemoryEntry | null {
    return MEMORIES[id] ?? null;
  }

  interactable(id: string): InteractableDefinition | null {
    return INTERACTABLE_BY_ID[id] ?? null;
  }

  /** Distance helper used by tests and the interaction selector. */
  interactionDistance(player: { x: number; z: number }, id: string): number {
    const entry = INTERACTABLE_BY_ID[id];
    if (!entry) return Infinity;
    return distance2D(player.x, player.z, entry.x, entry.z);
  }
}

/** Exposed for UI copy: list of codex entries in a stable order. */
export const CODEX_ORDER = Object.keys(CODEX);

/** Choice definitions are mainly useful to tests. */
export type { DialogueChoiceData };
