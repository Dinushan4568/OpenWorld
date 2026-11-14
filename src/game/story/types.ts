/**
 * Engine-free story types shared by the mission state machine, the dialogue
 * director and the world presentation layer.
 */

export type MissionKind = 'main' | 'side';

export type ObjectiveKind =
  | 'talk'
  | 'reach'
  | 'interact'
  | 'puzzle'
  | 'scan'
  | 'shards'
  | 'choice';

export interface MissionObjective {
  id: string;
  text: string;
  kind: ObjectiveKind;
  /** NPC, interactable, puzzle, species or choice id, depending on `kind`. */
  target?: string;
  /** Multiple accepted targets for counted scan objectives. */
  targets?: string[];
  /** Reach objective centre (metres). */
  x?: number;
  z?: number;
  radius?: number;
  /** Required number of matches for counted objectives. */
  count?: number;
  /** Flag set when this objective is completed. */
  flag?: string;
}

export interface MissionReward {
  marks: number;
  /** One-line copy shown in the mission log and completion toast. */
  label: string;
  /** Item or permanent upgrade id added to the save. */
  item?: string;
  /** Codex entry unlocked by the reward. */
  codex?: string;
}

export interface MissionDefinition {
  id: string;
  kind: MissionKind;
  title: string;
  giver: string;
  summary: string;
  objectives: MissionObjective[];
  reward: MissionReward;
  /** Automatically started when this mission completes. */
  next?: string;
  /** Missions that must already be complete before this can be started. */
  unlockedBy?: string[];
}

export type StoryEffect =
  | { type: 'startMission'; id: string }
  | { type: 'setFlag'; id: string; value?: boolean }
  | { type: 'giveItem'; id: string }
  | { type: 'codex'; id: string }
  | { type: 'relocateNpc'; id: string; place: string }
  | { type: 'ending'; id: string };

export interface DialogueChoiceData {
  id: string;
  text: string;
  /** Continue to another node in the same conversation. */
  next?: string;
  /** Apply effects when this answer is chosen. */
  effects?: StoryEffect[];
  /** Ends the conversation. Defaults to true when there is no `next` node. */
  end?: boolean;
}

export interface DialogueNodeData {
  id: string;
  /** Optional speaker override (records, the Choir, etc.). */
  speaker?: string;
  role?: string;
  title?: string;
  text: string;
  choices: DialogueChoiceData[];
}

export interface DialogueRequirement {
  flagsAll?: string[];
  flagsNone?: string[];
  missionActive?: string;
  missionComplete?: string;
  missionNotComplete?: string;
  chapterComplete?: boolean;
  minShards?: number;
}

export interface DialogueDefinition {
  id: string;
  npcId: string | null;
  title: string;
  start: string;
  nodes: Record<string, DialogueNodeData>;
  /** Highest eligible priority wins when an NPC has several things to say. */
  priority?: number;
  /** Once-seen conversations are not offered again. */
  once?: boolean;
  requires?: DialogueRequirement;
  /** Talk-to-NPC objective completion is suppressed for lore-only records. */
  completesTalk?: boolean;
}

export interface DialogueView {
  speaker: string;
  role: string;
  title: string;
  text: string;
  nodeId: string;
  choices: Array<{ id: string; text: string }>;
}

export interface DialogueSession {
  id: string;
  npcId: string | null;
  title: string;
  view: DialogueView;
}

export type NpcArchetype = 'archivist' | 'salvager' | 'caretaker';

export interface NpcDefinition {
  id: string;
  name: string;
  role: string;
  archetype: NpcArchetype;
  home: { x: number; z: number };
  heading: number;
  /** Small vertical offset for authored decks and plinths. */
  yOffset?: number;
  /** Alternate camp used after the story moves this character. */
  alt?: { x: number; z: number; heading: number; label: string; place: string };
}

export type InteractableKind = 'case' | 'stake' | 'cache' | 'console' | 'relic' | 'memorial' | 'witness';

export interface InteractableDefinition {
  id: string;
  kind: InteractableKind;
  label: string;
  /** Short pickup line shown after interacting. */
  notice?: string;
  x: number;
  z: number;
  /** Small vertical offset for authored decks and plinths. */
  yOffset?: number;
  /** Permanent lore object: always readable, never consumed. */
  memory?: string;
  /** Puzzle console opened by this object. */
  puzzle?: string;
  /** Dialogue opened directly by this object (the Gate witness / Choir). */
  dialogue?: string;
  /** Hidden until a mission objective points at it. */
  questItem?: boolean;
  /** Flags set when used. */
  flags?: string[];
  /** Remove the object after use. */
  consume?: boolean;
}

export interface PuzzleDialDefinition {
  label: string;
  symbols: string[];
  /** Index of the correct symbol. */
  target: number;
}

export interface PuzzleDefinition {
  id: string;
  title: string;
  kicker: string;
  subtitle: string;
  hint: string;
  success: string;
  dials: PuzzleDialDefinition[];
}

export interface CodexEntry {
  id: string;
  title: string;
  category: 'person' | 'place' | 'technology' | 'memory' | 'ending';
  text: string;
}

export interface MemoryEntry {
  id: string;
  title: string;
  speaker: string;
  role: string;
  text: string;
  codex: string;
}

export interface EndingDefinition {
  id: string;
  title: string;
  subtitle: string;
  text: string;
  epitaph: string;
}

export interface StoryObjectiveProgress {
  done: boolean;
  count: number;
  targets: string[];
}

export interface StoryState {
  version: 1;
  chapter: number;
  active: string[];
  completed: string[];
  progress: Record<string, Record<string, StoryObjectiveProgress>>;
  flags: Record<string, boolean>;
  marks: number;
  items: string[];
  codex: string[];
  seenDialogues: string[];
  readMemories: string[];
  ending: string | null;
}

export interface StoryEvent {
  type: 'talk' | 'interact' | 'puzzle' | 'scan' | 'shards' | 'choice';
  target: string;
  count?: number;
}

export interface WorldStoryView {
  available: string[];
  consumed: string[];
  solvedPuzzles: string[];
  readMemories: string[];
  npcs: Record<string, { x: number; z: number; heading: number }>;
  highlights: Record<string, 'main' | 'side'>;
  chapterComplete: boolean;
}

export interface ObjectiveTarget {
  id: string;
  x: number;
  z: number;
  label: string;
  kind: MissionKind;
}

export interface JournalObjectiveView {
  id: string;
  text: string;
  done: boolean;
  current: boolean;
  progress?: { count: number; required: number };
}

export interface JournalMissionView {
  id: string;
  kind: MissionKind;
  title: string;
  giver: string;
  summary: string;
  status: 'active' | 'complete' | 'locked' | 'available';
  objectives: JournalObjectiveView[];
  reward: string;
}

export interface JournalView {
  chapterTitle: string;
  chapterSubtitle: string;
  missions: JournalMissionView[];
  mainComplete: number;
  mainTotal: number;
  sideComplete: number;
  sideTotal: number;
  marks: number;
  items: Array<{ id: string; label: string }>;
  codex: Array<{ id: string; title: string; category: CodexEntry['category'] }>;
  ending: EndingDefinition | null;
  shards: number;
  shardTotal: number;
}
