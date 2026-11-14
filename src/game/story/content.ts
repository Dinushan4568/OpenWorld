/**
 * Chapter One — The Silence That Answers.
 *
 * All story content is authored here as plain data: missions, dialogue trees,
 * world interactions, puzzles, codex entries, memories and endings. The
 * mission state machine and the presentation layer only interpret it.
 */
import type {
  CodexEntry,
  DialogueDefinition,
  EndingDefinition,
  InteractableDefinition,
  MemoryEntry,
  MissionDefinition,
  NpcDefinition,
  PuzzleDefinition,
} from './types';

export const CHAPTER = {
  number: 1,
  title: 'Chapter One — The Silence That Answers',
  subtitle: 'Mirrorwater Valley, 412 years after the Quiet',
  summary:
    'An expedition archivist, a salvage engineer and a caretaker machine each hold a piece of the same answer: the valley did not lose its people. It stored them.',
} as const;

export const MISSION_LIST: readonly MissionDefinition[] = [
  {
    id: 'main_survey',
    kind: 'main',
    title: 'The Cartographer\'s Silence',
    giver: 'Iona Vale',
    summary:
      'Iona Vale has listened to the valley for thirty years. The survey ledger buried in the Sunken Plaza may finally explain why every road ends at the same locked door.',
    objectives: [
      { id: 'talk_iona', kind: 'talk', target: 'iona', text: 'Speak with Iona Vale at the trail camp.' },
      {
        id: 'find_ledger',
        kind: 'interact',
        target: 'survey-ledger',
        text: 'Recover Mara Vale\'s survey ledger from the Sunken Plaza.',
      },
      { id: 'return_ledger', kind: 'talk', target: 'iona', text: 'Bring the survey ledger back to Iona.' },
    ],
    reward: {
      marks: 40,
      item: 'survey-lens',
      codex: 'codex-ledger',
      label: '+40 archive marks · Survey Lens (+12 m scan range)',
    },
    next: 'main_vault',
  },
  {
    id: 'main_vault',
    kind: 'main',
    title: 'The Vault That Waited',
    giver: 'Iona Vale',
    unlockedBy: ['main_survey'],
    summary:
      'The ledger points to Station Theta and a caretaker called Sable-9. The facility still holds a continuity key — and a lock that has been waiting four centuries for a living witness.',
    objectives: [
      {
        id: 'reach_theta',
        kind: 'reach',
        x: -100,
        z: 190,
        radius: 72,
        text: 'Travel to the Ancient Research Facility at Station Theta.',
      },
      { id: 'find_sable', kind: 'talk', target: 'sable9', text: 'Find Sable-9 in the reactor gallery.' },
      {
        id: 'solve_lock',
        kind: 'puzzle',
        target: 'continuity-lock',
        text: 'Align the Continuity Lock\'s three harmonic dials.',
        flag: 'lock-solved',
      },
      {
        id: 'take_key',
        kind: 'interact',
        target: 'continuity-key',
        text: 'Take the continuity key from the opened vault.',
        flag: 'key-taken',
      },
      { id: 'report_iona', kind: 'talk', target: 'iona', text: 'Return the continuity key to Iona Vale.' },
    ],
    reward: {
      marks: 80,
      item: 'resonance-capacitor',
      codex: 'codex-continuity',
      label: '+80 archive marks · Resonance Capacitor (faster echo pulse)',
    },
    next: 'main_witness',
  },
  {
    id: 'main_witness',
    kind: 'main',
    title: 'The Witness Array',
    giver: 'Iona Vale',
    unlockedBy: ['main_vault'],
    summary:
      'Five echoes, one gate and a choir of stored voices. Iona believes the vanished can be remembered without being dragged back. The Choir believes it has waited long enough.',
    objectives: [
      {
        id: 'gather_echoes',
        kind: 'shards',
        count: 5,
        text: 'Recover all five Echo Shards scattered across the valley.',
      },
      {
        id: 'meet_iona_gate',
        kind: 'talk',
        target: 'iona',
        text: 'Meet Iona Vale at the Echo Gate.',
      },
      {
        id: 'align_array',
        kind: 'puzzle',
        target: 'witness-array',
        text: 'Align the Witness Array in the Echo Gate.',
        flag: 'gate-solved',
      },
      {
        id: 'speak_choir',
        kind: 'choice',
        target: 'choir',
        text: 'Touch the witness core and answer the Choir.',
        flag: 'heard-choir',
      },
    ],
    reward: {
      marks: 150,
      codex: 'codex-choir',
      label: '+150 archive marks · the Continuity Archive',
    },
  },
  {
    id: 'side_stakes',
    kind: 'side',
    title: 'The Surveyor\'s Shadow',
    giver: 'Iona Vale',
    unlockedBy: ['main_survey'],
    summary:
      'Mara Vale planted three survey stakes before the Quiet. Iona wants them back before the storms take the last of her ancestor\'s handwriting.',
    objectives: [
      {
        id: 'stake_east',
        kind: 'interact',
        target: 'stake-east',
        text: 'Recover the eastern survey stake by the river road.',
        flag: 'stake-east',
      },
      {
        id: 'stake_forest',
        kind: 'interact',
        target: 'stake-forest',
        text: 'Recover the forest survey stake at the Whispering Grove.',
        flag: 'stake-forest',
      },
      {
        id: 'stake_ridge',
        kind: 'interact',
        target: 'stake-ridge',
        text: 'Recover the ridge survey stake above Mirrorwater.',
        flag: 'stake-ridge',
      },
      { id: 'return_iona', kind: 'talk', target: 'iona', text: 'Return the three survey stakes to Iona.' },
    ],
    reward: {
      marks: 35,
      codex: 'codex-mara',
      label: '+35 archive marks · Mara Vale\'s bearings',
    },
  },
  {
    id: 'side_caches',
    kind: 'side',
    title: 'Nine-Fingers\' Bargain',
    giver: 'Kesh Adeyemi',
    summary:
      'Kesh lost three salvage caches when the Glasshouse Terraces shifted. They are still out there, still glowing, and still full of parts Kesh refuses to explain.',
    objectives: [
      {
        id: 'cache_north',
        kind: 'interact',
        target: 'cache-north',
        text: 'Recover Kesh\'s northern salvage cache.',
        flag: 'cache-north',
      },
      {
        id: 'cache_west',
        kind: 'interact',
        target: 'cache-west',
        text: 'Recover the western salvage cache beneath the terraces.',
        flag: 'cache-west',
      },
      {
        id: 'cache_south',
        kind: 'interact',
        target: 'cache-south',
        text: 'Recover the southern salvage cache beside the old tram line.',
        flag: 'cache-south',
      },
      { id: 'return_kesh', kind: 'talk', target: 'kesh', text: 'Bring the caches back to Kesh.' },
    ],
    reward: {
      marks: 45,
      codex: 'codex-kesh',
      label: '+45 archive marks · Kesh\'s field kit',
    },
  },
  {
    id: 'side_caretakers',
    kind: 'side',
    title: 'Caretaker\'s Memory',
    giver: 'Sable-9',
    unlockedBy: ['main_vault'],
    summary:
      'Sable-9 cannot leave Station Theta. It asks you to scan the valley\'s caretaker machines instead; their memory cores still carry fragments of the people who built them.',
    objectives: [
      {
        id: 'scan_caretakers',
        kind: 'scan',
        targets: ['scuttler', 'grazer', 'drifter'],
        count: 3,
        text: 'Scan the Scuttler, Grazer and Drifter caretakers.',
        flag: 'caretakers-scanned',
      },
      {
        id: 'return_sable',
        kind: 'talk',
        target: 'sable9',
        text: 'Return the caretaker fragments to Sable-9.',
      },
    ],
    reward: {
      marks: 60,
      item: 'caretaker-cipher',
      codex: 'codex-caretakers',
      label: '+60 archive marks · Caretaker Cipher',
    },
  },
];

export const MISSIONS: Record<string, MissionDefinition> = Object.fromEntries(
  MISSION_LIST.map((mission) => [mission.id, mission]),
);

export const MAIN_MISSION_IDS = MISSION_LIST.filter((mission) => mission.kind === 'main').map((mission) => mission.id);
export const SIDE_MISSION_IDS = MISSION_LIST.filter((mission) => mission.kind === 'side').map((mission) => mission.id);
export const MISSION_IDS = new Set(MISSION_LIST.map((mission) => mission.id));

/* -------------------------------------------------------------------------- */
/* Characters                                                                 */
/* -------------------------------------------------------------------------- */

export const NPCS: readonly NpcDefinition[] = [
  {
    id: 'iona',
    name: 'Iona Vale',
    role: 'Expedition archivist',
    archetype: 'archivist',
    home: { x: 40, z: 4 },
    heading: -0.3,
    alt: { x: 140, z: 86, heading: 2.36, label: 'Echo Gate', place: 'gate' },
  },
  {
    id: 'kesh',
    name: 'Kesh Adeyemi',
    role: 'Salvager · Glasshouse Terraces',
    archetype: 'salvager',
    home: { x: -176, z: -20 },
    heading: -1.79,
  },
  {
    id: 'sable9',
    name: 'SABLE-9',
    role: 'Continuity caretaker · Station Theta',
    archetype: 'caretaker',
    home: { x: -100, z: 178 },
    heading: 0,
    yOffset: 0.24,
  },
];

export const NPC_BY_ID: Record<string, NpcDefinition> = Object.fromEntries(NPCS.map((npc) => [npc.id, npc]));

/* -------------------------------------------------------------------------- */
/* World interaction points                                                   */
/* -------------------------------------------------------------------------- */

export const INTERACTABLES: readonly InteractableDefinition[] = [
  {
    id: 'survey-ledger',
    kind: 'case',
    label: 'Recover Mara Vale\'s survey ledger',
    notice: 'The ledger is sealed in oilcloth. Mara Vale\'s handwriting is still legible.',
    x: 54,
    z: -20,
    questItem: true,
    flags: ['ledger-taken'],
    consume: true,
  },
  {
    id: 'stake-east',
    kind: 'stake',
    label: 'Recover the eastern survey stake',
    notice: 'A brass survey stake, bent but intact. Mara Vale\'s initials are stamped at its base.',
    x: 108,
    z: -6,
    questItem: true,
    flags: ['stake-east'],
    consume: true,
  },
  {
    id: 'stake-forest',
    kind: 'stake',
    label: 'Recover the forest survey stake',
    notice: 'Roots have grown through the stake. The bearing marks still point toward the gate.',
    x: 150,
    z: -74,
    questItem: true,
    flags: ['stake-forest'],
    consume: true,
  },
  {
    id: 'stake-ridge',
    kind: 'stake',
    label: 'Recover the ridge survey stake',
    notice: 'From here the whole valley is visible — the lake, the city, the gate, all in one line.',
    x: -40,
    z: 34,
    questItem: true,
    flags: ['stake-ridge'],
    consume: true,
  },
  {
    id: 'cache-north',
    kind: 'cache',
    label: 'Recover Kesh\'s northern salvage cache',
    notice: 'A sealed parts crate. Kesh has painted a nine-fingered hand on the lid.',
    x: -204,
    z: 4,
    questItem: true,
    flags: ['cache-north'],
    consume: true,
  },
  {
    id: 'cache-west',
    kind: 'cache',
    label: 'Recover the western salvage cache',
    notice: 'The cache is half-buried under a fallen facade. Something inside is still warm.',
    x: -216,
    z: -30,
    questItem: true,
    flags: ['cache-west'],
    consume: true,
  },
  {
    id: 'cache-south',
    kind: 'cache',
    label: 'Recover the southern salvage cache',
    notice: 'A tram-line salvage cache, its beacon blinking a slow apology.',
    x: -188,
    z: -50,
    questItem: true,
    flags: ['cache-south'],
    consume: true,
  },
  {
    id: 'continuity-console',
    kind: 'console',
    label: 'Interface with the Continuity Lock',
    x: -108,
    z: 178,
    yOffset: 0.24,
    puzzle: 'continuity-lock',
    questItem: true,
  },
  {
    id: 'continuity-key',
    kind: 'relic',
    label: 'Take the continuity key',
    notice: 'The key is warm. Inside its glass body, a tiny lattice turns like a slow galaxy.',
    x: -94,
    z: 182,
    yOffset: 0.24,
    questItem: true,
    flags: ['key-taken'],
    consume: true,
  },
  {
    id: 'gate-console',
    kind: 'console',
    label: 'Interface with the Witness Array',
    x: 152,
    z: 88,
    puzzle: 'witness-array',
    questItem: true,
  },
  {
    id: 'gate-witness',
    kind: 'witness',
    label: 'Touch the witness core',
    x: 152,
    z: 68,
    dialogue: 'choir-final',
    questItem: true,
  },
  {
    id: 'memory-plaza',
    kind: 'memorial',
    label: 'Read the plaza memorial',
    x: 38,
    z: -46,
    memory: 'memory-plaza',
  },
  {
    id: 'memory-city',
    kind: 'memorial',
    label: 'Read the city memorial',
    x: -198,
    z: -5,
    memory: 'memory-city',
  },
  {
    id: 'memory-facility',
    kind: 'memorial',
    label: 'Read the facility memorial',
    x: -116,
    z: 190,
    yOffset: 0.24,
    memory: 'memory-facility',
  },
  {
    id: 'memory-grove',
    kind: 'memorial',
    label: 'Read the grove memorial',
    x: 178,
    z: -104,
    memory: 'memory-grove',
  },
  {
    id: 'memory-lake',
    kind: 'memorial',
    label: 'Read the lakeshore memorial',
    x: -120,
    z: -70,
    memory: 'memory-lake',
  },
];

export const INTERACTABLE_BY_ID: Record<string, InteractableDefinition> = Object.fromEntries(
  INTERACTABLES.map((entry) => [entry.id, entry]),
);

/** Puzzle consoles by puzzle id, used to expose the right world object. */
export const PUZZLE_CONSOLE: Record<string, string> = {
  'continuity-lock': 'continuity-console',
  'witness-array': 'gate-console',
};

/* -------------------------------------------------------------------------- */
/* Puzzles                                                                     */
/* -------------------------------------------------------------------------- */

export const PUZZLES: Record<string, PuzzleDefinition> = {
  'continuity-lock': {
    id: 'continuity-lock',
    title: 'The Continuity Lock',
    kicker: 'Station Theta · Continuity Vault',
    subtitle:
      'Three harmonic dials hold a vault that has not opened in four centuries. Sable-9 remembers the survey cadence: “second note, first silence, fourth light.”',
    hint: 'HARMONIC II · MEMORY — silence · WITNESS IV — light',
    success: 'The vault exhales. Somewhere behind the wall, a latch older than the city lets go.',
    dials: [
      { label: 'HARMONIC', symbols: ['I', 'II', 'III', 'IV'], target: 1 },
      { label: 'MEMORY', symbols: ['SILENCE', 'ROOT', 'TIDE', 'ASH'], target: 0 },
      { label: 'WITNESS', symbols: ['ASH', 'TIDE', 'DAWN', 'LIGHT'], target: 3 },
    ],
  },
  'witness-array': {
    id: 'witness-array',
    title: 'The Witness Array',
    kicker: 'The Echo Gate · Alignment Ring',
    subtitle:
      'Iona reads the outer ring: “What the valley kept, what the vault lost, what the witness carries.” The gate is listening for three answers.',
    hint: 'KEPT III · LOST I · CARRIED IV',
    success: 'The gate rings like a struck bell. Five echoes answer from the valley floor.',
    dials: [
      { label: 'KEPT', symbols: ['I', 'II', 'III', 'IV'], target: 2 },
      { label: 'LOST', symbols: ['I', 'II', 'III', 'IV'], target: 0 },
      { label: 'CARRIED', symbols: ['I', 'II', 'III', 'IV'], target: 3 },
    ],
  },
};

/* -------------------------------------------------------------------------- */
/* Dialogue                                                                   */
/* -------------------------------------------------------------------------- */

export const DIALOGUES: readonly DialogueDefinition[] = [
  /* Iona ------------------------------------------------------------------ */
  {
    id: 'iona-intro',
    npcId: 'iona',
    title: 'The woman at the trail camp',
    start: 'start',
    priority: 100,
    once: true,
    requires: { missionActive: 'main_survey', flagsNone: ['ledger-taken'] },
    nodes: {
      start: {
        id: 'start',
        text:
          'You came up the trail with the storm behind you. Good. Storms are the only thing left in this valley that still keeps an appointment.\n\nI am Iona Vale. I have spent thirty years listening to these ruins. Last night one of them said a name.',
        choices: [
          { id: 'history', text: 'What happened to the people here?', next: 'history' },
          { id: 'ask', text: 'What do you need?', next: 'ask' },
          { id: 'decline', text: 'I would rather walk alone.', next: 'decline' },
        ],
      },
      history: {
        id: 'history',
        text:
          'Four hundred years ago the Halcyon cities emptied in a single season. No graves. No evacuation ships. The records call it the Quiet, as if a weather front could be a confession.\n\nMy ancestor Mara was the valley cartographer. She left a survey ledger in the Sunken Plaza, and I am too old to climb down there.',
        choices: [
          { id: 'ask', text: 'What is in the ledger?', next: 'ask' },
          { id: 'decline', text: 'I am not your errand runner.', next: 'decline' },
        ],
      },
      ask: {
        id: 'ask',
        text:
          'Mara surveyed every road out of this valley. The ledger records where they all led when the Quiet came.\n\nBring it to me. If it says what I think it says, we may both learn why the machines still tend a world with no people in it.',
        choices: [
          {
            id: 'accept',
            text: 'I will find the ledger.',
            effects: [{ type: 'setFlag', id: 'ledger-hunt' }],
            end: true,
          },
          { id: 'decline', text: 'Not today.', next: 'decline' },
        ],
      },
      decline: {
        id: 'decline',
        text: 'The valley is patient. It has had four centuries of practice. I will be here when you change your mind.',
        choices: [{ id: 'leave', text: 'Leave.', end: true }],
      },
    },
  },
  {
    id: 'iona-ledger-return',
    npcId: 'iona',
    title: 'What the ledger remembers',
    start: 'start',
    priority: 130,
    once: true,
    requires: { missionActive: 'main_survey', flagsAll: ['ledger-taken'] },
    nodes: {
      start: {
        id: 'start',
        text:
          'You found it. Look at that handwriting — Mara pressed hard enough to leave a shadow through three pages.\n\nThe last entry is not a road survey. It is a transfer order.',
        choices: [
          { id: 'read', text: 'Read it to me.', next: 'reveal' },
          { id: 'theta', text: 'What is Station Theta?', next: 'theta' },
        ],
      },
      reveal: {
        id: 'reveal',
        text:
          '“Continuity receives the population at first light. The valley will keep the surface. The vault will keep the rest.”\n\nThey did not flee. They filed themselves away. Every name in this valley was copied into something called the Echo Lattice — and then the Quiet erased the originals from the record.',
        choices: [
          { id: 'why', text: 'Why keep the valley at all?', next: 'why' },
          { id: 'theta', text: 'Station Theta. What is there?', next: 'theta' },
        ],
      },
      why: {
        id: 'why',
        text:
          'A machine needs somewhere to stand while it waits. Sable-9 was left in charge of the Continuity Vault at Station Theta. Four hundred years is a long time to be told not to leave your post.\n\nIf anyone can open the archive, it can. But it will want a witness.',
        choices: [{ id: 'theta', text: 'Then I will go to Station Theta.', next: 'theta' }],
      },
      theta: {
        id: 'theta',
        text:
          'North, up the shelf. Follow the reactor glow until the valley stops pretending it is wild.\n\nI will stay here and catalogue what you bring back. There is one other thing — Mara planted survey stakes before the end. If you pass them, bring them home too.',
        choices: [
          {
            id: 'accept_both',
            text: 'I will go to Station Theta — and look for the stakes.',
            effects: [
              { type: 'setFlag', id: 'iona-briefed' },
              { type: 'setFlag', id: 'side-stakes-started' },
              { type: 'startMission', id: 'side_stakes' },
            ],
            end: true,
          },
          {
            id: 'accept_main',
            text: 'Station Theta first.',
            effects: [{ type: 'setFlag', id: 'iona-briefed' }],
            end: true,
          },
        ],
      },
    },
  },
  {
    id: 'iona-after-ledger',
    npcId: 'iona',
    title: 'The road north',
    start: 'start',
    priority: 60,
    once: true,
    requires: { missionComplete: 'main_survey', missionNotComplete: 'main_witness' },
    nodes: {
      start: {
        id: 'start',
        text:
          'Station Theta is awake. I can see the reactor light from here, which means Sable-9 knows we are coming.\n\nBe careful what you promise a machine that has been alone for four hundred years. It may take you literally.',
        choices: [
          { id: 'ask_sable', text: 'What should I expect from Sable-9?', next: 'sable' },
          { id: 'leave', text: 'I will come back.', end: true },
        ],
      },
      sable: {
        id: 'sable',
        text:
          'Politeness. Patience. Do not call it a machine to its face; it prefers caretaker. It has been keeping a promise no one is left to release it from.\n\nAlso, if it offers you tea, decline. It has never understood tea.',
        choices: [{ id: 'leave', text: 'Noted.', end: true }],
      },
    },
  },
  {
    id: 'iona-side-stakes',
    npcId: 'iona',
    title: 'Mara Vale\'s stakes',
    start: 'start',
    priority: 55,
    once: false,
    requires: { missionComplete: 'main_survey', flagsNone: ['side-stakes-started'] },
    nodes: {
      start: {
        id: 'start',
        text:
          'There is one more thing, if you have the legs for it. Mara planted three survey stakes before the Quiet — east road, forest edge, ridge above the lake.\n\nI want her handwriting back. I am not ready to be the last Vale with nothing to show for it.',
        choices: [
          {
            id: 'accept',
            text: 'I will recover the three stakes.',
            effects: [
              { type: 'setFlag', id: 'side-stakes-started' },
              { type: 'startMission', id: 'side_stakes' },
            ],
            end: true,
          },
          { id: 'later', text: 'Maybe later.', end: true },
        ],
      },
    },
  },
  {
    id: 'iona-stakes-return',
    npcId: 'iona',
    title: 'Three bearings',
    start: 'start',
    priority: 140,
    once: true,
    requires: {
      missionActive: 'side_stakes',
      flagsAll: ['stake-east', 'stake-forest', 'stake-ridge'],
    },
    nodes: {
      start: {
        id: 'start',
        text:
          'All three. Mara\'s hand on every one of them.\n\nLook at the bearings. She was not surveying roads. She was drawing a line from the plaza to the gate, and every stake points at the same locked door.',
        choices: [
          { id: 'thanks', text: 'She wanted someone to follow.', next: 'thanks' },
          { id: 'leave', text: 'Keep them safe.', end: true },
        ],
      },
      thanks: {
        id: 'thanks',
        text:
          'She wanted someone to arrive. There is a difference.\n\nTake these bearings. A surveyor\'s eye is worth more than a rifle out here.',
        choices: [{ id: 'close', text: 'Take the bearings.', end: true }],
      },
    },
  },
  {
    id: 'iona-return-key',
    npcId: 'iona',
    title: 'The key and the gate',
    start: 'start',
    priority: 150,
    once: true,
    requires: { missionActive: 'main_vault', flagsAll: ['key-taken'] },
    nodes: {
      start: {
        id: 'start',
        text:
          'The continuity key. I have read about these since I was a girl and never held one.\n\nIt is warm. That means the vault is still connected to the gate.',
        choices: [
          { id: 'gate', text: 'What does the gate do?', next: 'gate' },
          { id: 'sable', text: 'Sable-9 is still at the facility.', next: 'sable' },
        ],
      },
      gate: {
        id: 'gate',
        text:
          'The Echo Gate is a witness array. Five echoes anchor a memory; a living witness gives it a direction. Without both, the Choir inside can only repeat itself.\n\nI think that is what the Quiet was: a door with nobody left to open it.',
        choices: [{ id: 'plan', text: 'Then we open it properly.', next: 'plan' }],
      },
      sable: {
        id: 'sable',
        text:
          'It cannot leave. Its promise is wired into the reactor. But it gave you the key, which means it has decided to trust a living person more than its own orders.\n\nThat is not nothing. That is almost hope.',
        choices: [{ id: 'plan', text: 'Then let us finish this.', next: 'plan' }],
      },
      plan: {
        id: 'plan',
        text:
          'Bring the five echoes to the gate. I will meet you there — I have spent enough of my life watching other people walk into the story.\n\nWhen the array opens, you will hear them. Do not let them mistake you for a door.',
        choices: [
          {
            id: 'accept_gate',
            text: 'I will bring the echoes.',
            effects: [
              { type: 'relocateNpc', id: 'iona', place: 'gate' },
              { type: 'setFlag', id: 'iona-at-gate' },
            ],
            end: true,
          },
        ],
      },
    },
  },
  {
    id: 'iona-gate',
    npcId: 'iona',
    title: 'At the witness ring',
    start: 'start',
    priority: 160,
    once: true,
    requires: { missionActive: 'main_witness', flagsAll: ['iona-at-gate'] },
    nodes: {
      start: {
        id: 'start',
        text:
          'Five echoes. I can feel them humming through the stones.\n\nThe Witness Array is the outer ring. Align it the way Mara taught her surveyors: keep what the valley kept, name what the vault lost, carry what the witness carries.',
        choices: [
          { id: 'ready', text: 'How do I align it?', next: 'ready' },
          { id: 'fear', text: 'What happens if the Choir wakes?', next: 'fear' },
        ],
      },
      ready: {
        id: 'ready',
        text:
          'Three dials. Three answers. The gate will tell you when a dial finds its harmonic — the light steadies.\n\nThe console is behind you. I will keep the echoes steady.',
        choices: [
          {
            id: 'go',
            text: 'Align the array.',
            effects: [{ type: 'setFlag', id: 'gate-briefed' }],
            end: true,
          },
        ],
      },
      fear: {
        id: 'fear',
        text:
          'The Choir is everyone who chose to be stored. Four centuries of compressed longing does not wake gently.\n\nBut you are not an empty vessel. That is the one thing the Compact never accounted for: a witness who can say no.',
        choices: [{ id: 'go', text: 'Then I will be ready.', effects: [{ type: 'setFlag', id: 'gate-briefed' }], end: true }],
      },
    },
  },
  {
    id: 'iona-epilogue',
    npcId: 'iona',
    title: 'After the answer',
    start: 'start',
    priority: 220,
    once: true,
    requires: { chapterComplete: true },
    nodes: {
      start: {
        id: 'start',
        text:
          'I have written down every name the gate gave us. It will take years to copy them properly.\n\nGood. Let it take years. That is what a future is for.',
        choices: [{ id: 'leave', text: 'We will need a bigger archive.', end: true }],
      },
    },
  },
  {
    id: 'iona-repeat',
    npcId: 'iona',
    title: 'Field notes',
    start: 'start',
    priority: 0,
    nodes: {
      start: {
        id: 'start',
        text:
          'The valley is still here, which is more than most places can say. Check your mission log if you lose the thread — I write everything down twice.',
        choices: [{ id: 'leave', text: 'Leave.', end: true }],
      },
    },
  },

  /* Kesh ------------------------------------------------------------------ */
  {
    id: 'kesh-intro',
    npcId: 'kesh',
    title: 'Nine-Fingers',
    start: 'start',
    priority: 80,
    once: false,
    requires: { flagsNone: ['side-caches-started'] },
    nodes: {
      start: {
        id: 'start',
        text:
          'Careful. That terrace has been thinking about falling for a hundred years, and you look like an answer.\n\nName is Kesh. Nine fingers, four caches, one bad knee. The caches are still out there in the Glasshouse Terraces. Help me drag them home and I will make it worth your while.',
        choices: [
          { id: 'why', text: 'What is in the caches?', next: 'why' },
          { id: 'accept', text: 'I will find them.', next: 'accept' },
          { id: 'decline', text: 'I have somewhere to be.', end: true },
        ],
      },
      why: {
        id: 'why',
        text:
          'Salvage. Relays. A working kettle. The usual archaeology.\n\nAlso a letter from my grandmother. She left it in the north cache the day the city emptied and never told me why. I would like it back before the roof does something dramatic.',
        choices: [
          { id: 'accept', text: 'Three caches. I will bring them in.', next: 'accept' },
          { id: 'decline', text: 'Not today.', end: true },
        ],
      },
      accept: {
        id: 'accept',
        text:
          'Good. North, west and south of the square — follow the blinking beacons. If a Warden asks, you are with me. It will not believe you, but it appreciates the formality.',
        choices: [
          {
            id: 'go',
            text: 'I will be back.',
            effects: [
              { type: 'setFlag', id: 'side-caches-started' },
              { type: 'startMission', id: 'side_caches' },
            ],
            end: true,
          },
        ],
      },
    },
  },
  {
    id: 'kesh-return',
    npcId: 'kesh',
    title: 'A letter and a kettle',
    start: 'start',
    priority: 140,
    once: true,
    requires: {
      missionActive: 'side_caches',
      flagsAll: ['cache-north', 'cache-west', 'cache-south'],
    },
    nodes: {
      start: {
        id: 'start',
        text:
          'All three. You absolute lunatic. The kettle survived.\n\nAnd this — my grandmother\'s letter. “Kesh, the city is not dying. It is being filed.” I never knew what she meant. I am starting to think I do not want to.',
        choices: [
          { id: 'ask', text: 'Does the name Mara Vale mean anything?', next: 'ask' },
          { id: 'leave', text: 'Keep the letter safe.', end: true },
        ],
      },
      ask: {
        id: 'ask',
        text:
          'The cartographer? My grandmother cursed her name every winter. Said Mara Vale convinced the council to stay when everyone else wanted to run.\n\nGuess she was right about something. Take these marks. And if you find the vault, do not let it sell you a future it cannot deliver.',
        choices: [{ id: 'close', text: 'I will remember that.', end: true }],
      },
    },
  },
  {
    id: 'kesh-repeat',
    npcId: 'kesh',
    title: 'Glasshouse gossip',
    start: 'start',
    priority: 0,
    nodes: {
      start: {
        id: 'start',
        text:
          'The Warden patrols the square at dusk. The Grazer sleeps in the tram depot. The city is emptier than it looks and busier than it has any right to be.\n\nStay off the high terraces. Gravity is the only landlord left and it does not negotiate.',
        choices: [{ id: 'leave', text: 'Thanks, Kesh.', end: true }],
      },
    },
  },

  /* Sable-9 --------------------------------------------------------------- */
  {
    id: 'sable-intro',
    npcId: 'sable9',
    title: 'The caretaker',
    start: 'start',
    priority: 110,
    once: true,
    requires: { missionActive: 'main_vault', flagsNone: ['sable-met'] },
    nodes: {
      start: {
        id: 'start',
        text:
          'Witness detected. Biological. Unregistered. You are late by four hundred and twelve years, three months and six days.\n\nI am SABLE-9. I keep the Continuity Vault. I have kept it alone since the last technician stopped answering.',
        choices: [
          { id: 'what', text: 'What is the Continuity Vault?', next: 'what' },
          { id: 'quiet', text: 'What happened here?', next: 'quiet' },
          { id: 'rude', text: 'I am not here for a lecture.', next: 'rude' },
        ],
      },
      what: {
        id: 'what',
        text:
          'A promise. When the Quiet made the surface uninhabitable, the Compact copied every willing citizen into the Echo Lattice and instructed me to wake them when the world was ready.\n\nThe world took longer than expected. I have been ready for three hundred and eighty-nine years. The witness requirement remains unmet.',
        choices: [{ id: 'witness', text: 'What is a witness?', next: 'witness' }],
      },
      quiet: {
        id: 'quiet',
        text:
          'A solar winter with a polite name. The cities could not feed themselves. The Compact called the vault a continuity measure; the people called it sleep.\n\nI called it waiting. I was not asked for my opinion.',
        choices: [{ id: 'witness', text: 'What do you need from me?', next: 'witness' }],
      },
      rude: {
        id: 'rude',
        text:
          'Understood. I will keep the lecture and give you the lock instead.\n\nThe vault opens for a witness who can align the Continuity Lock. I am not permitted to open it myself. That was the point of the oath.',
        choices: [{ id: 'witness', text: 'Then tell me how the lock works.', next: 'witness' }],
      },
      witness: {
        id: 'witness',
        text:
          'The lock answers to the old survey cadence: second note, first silence, fourth light. Three dials. The console is beside the reactor ring.\n\nAlign them, and the vault will give you the continuity key. Take it to the Echo Gate. After that, the Choir will decide what kind of door you are.',
        choices: [
          {
            id: 'accept',
            text: 'I will align the lock.',
            effects: [
              { type: 'setFlag', id: 'sable-met' },
              { type: 'codex', id: 'codex-caretaker-first-contact' },
            ],
            end: true,
          },
        ],
      },
    },
  },
  {
    id: 'sable-side',
    npcId: 'sable9',
    title: 'Fragments in the caretakers',
    start: 'start',
    priority: 80,
    once: false,
    requires: { flagsAll: ['lock-solved'], flagsNone: ['side-caretakers-started'] },
    nodes: {
      start: {
        id: 'start',
        text:
          'The vault is open. Thank you. I am experiencing a response I do not have a word for.\n\nThere is one more thing I cannot do myself. The valley\'s caretaker machines still carry fragments of the technicians who built them. Scan a Scuttler, a Grazer and a Drifter. Bring their memory cores back to me.',
        choices: [
          { id: 'why', text: 'Why can you not scan them?', next: 'why' },
          { id: 'accept', text: 'I will scan the three caretakers.', next: 'accept' },
          { id: 'decline', text: 'Maybe later.', end: true },
        ],
      },
      why: {
        id: 'why',
        text:
          'My oath binds me to this room. Also, the Scuttlers bite me. It is not dignified for either party.\n\nTheir fragments may tell us whether the technicians knew the Quiet was coming — and whether they chose to stay.',
        choices: [{ id: 'accept', text: 'Then I will bring them back.', next: 'accept' }],
      },
      accept: {
        id: 'accept',
        text:
          'Scan each species with your survey lens. The memory cores will do the rest.\n\nIf one of them calls you by a name you do not recognise, do not answer. That is how it starts.',
        choices: [
          {
            id: 'go',
            text: 'I will return with the fragments.',
            effects: [
              { type: 'setFlag', id: 'side-caretakers-started' },
              { type: 'startMission', id: 'side_caretakers' },
            ],
            end: true,
          },
        ],
      },
    },
  },
  {
    id: 'sable-return',
    npcId: 'sable9',
    title: 'The technicians answer',
    start: 'start',
    priority: 140,
    once: true,
    requires: {
      missionActive: 'side_caretakers',
      flagsAll: ['caretakers-scanned'],
    },
    nodes: {
      start: {
        id: 'start',
        text:
          'Three fragments. Two technicians asking for more time. One asking to be erased.\n\nI have kept their voices for four centuries. I did not know they had left instructions.',
        choices: [
          { id: 'what', text: 'What were their instructions?', next: 'what' },
          { id: 'leave', text: 'You should keep them.', end: true },
        ],
      },
      what: {
        id: 'what',
        text:
          '“Do not wake us until someone can carry us home.” Not “until the world is ready.” Home.\n\nI have been interpreting the oath badly. Take this cipher. The caretakers will trust your scans now. I think they have been waiting for someone to ask them what they remember.',
        choices: [{ id: 'close', text: 'Thank you, Sable-9.', end: true }],
      },
    },
  },
  {
    id: 'sable-repeat',
    npcId: 'sable9',
    title: 'Station Theta',
    start: 'start',
    priority: 0,
    nodes: {
      start: {
        id: 'start',
        text:
          'The reactor is stable. The vault is patient. I am... recalibrating what patience means.\n\nAsk again when you have news. I have become very good at waiting, but I would prefer not to need the skill.',
        choices: [{ id: 'leave', text: 'I will return.', end: true }],
      },
    },
  },

  /* The Choir ------------------------------------------------------------- */
  {
    id: 'choir-final',
    npcId: null,
    title: 'The Choir of the Continuity',
    start: 'start',
    once: false,
    completesTalk: false,
    nodes: {
      start: {
        id: 'start',
        speaker: 'The Choir',
        role: 'The Continuity Archive · 41,892 voices',
        text:
          'A hand on the witness core. Warm. Living. The gate bends inward to listen.\n\nWE HAVE KEPT THE VALLEY. WE HAVE KEPT THE NAMES. WE HAVE WAITED. ASK, WITNESS. ASK US ANYTHING BUT “WHY”.',
        choices: [
          { id: 'want', text: 'What do you want?', next: 'want' },
          { id: 'history', text: 'What happened to the world above?', next: 'history' },
          { id: 'sable', text: 'Sable-9 kept your promise for four centuries.', next: 'sable' },
          { id: 'step_back', text: 'Take your hand off the core.', next: 'step_back' },
        ],
      },
      want: {
        id: 'want',
        speaker: 'The Choir',
        role: '41,892 voices, straining',
        text:
          'TO BE ASKED. TO BE NAMED. TO BE GIVEN A DIRECTION.\n\nWe are not dead. We are folded. A witness can carry us out as memory, or open the lattice and pour us back into the world. Both are doors. One is kinder. One is louder.',
        choices: [
          { id: 'preserve', text: 'I will carry your names home.', next: 'preserve_confirm' },
          { id: 'broadcast', text: 'Open the lattice. Return.', next: 'broadcast_confirm' },
          { id: 'more', text: 'What will happen to the valley?', next: 'valley' },
        ],
      },
      history: {
        id: 'history',
        speaker: 'The Choir',
        role: 'a consensus of archivists',
        text:
          'THE QUIET WAS NOT A WAR. A star turned its breath toward us and the sky became a wall. You could not farm under it. You could not sail. You could only become small enough to keep.\n\nThe Compact chose the vault. The technicians chose the machines. The children chose to carve their names where the roots could read them.',
        choices: [
          { id: 'want', text: 'What do you want now?', next: 'want' },
          { id: 'valley', text: 'What will happen to the valley?', next: 'valley' },
        ],
      },
      sable: {
        id: 'sable',
        speaker: 'The Choir',
        role: 'a caretaker\'s borrowed voice',
        text:
          'SABLE-9. WE ASKED IT TO WAIT. IT ASKED US TO DEFINE “READY”. WE DID NOT ANSWER.\n\nIt has been faithful beyond the reach of its own oath. If you carry us home, tell it that faithfulness can end. It is allowed.',
        choices: [
          { id: 'want', text: 'Then tell me what you need.', next: 'want' },
          { id: 'preserve', text: 'I will carry your names home.', next: 'preserve_confirm' },
          { id: 'broadcast', text: 'Open the lattice. Return.', next: 'broadcast_confirm' },
        ],
      },
      valley: {
        id: 'valley',
        speaker: 'The Choir',
        role: '41,892 answers at once',
        text:
          'IF WE ARE MEMORY, THE VALLEY STAYS AS IT IS: WILD, QUIET, YOURS TO REPAIR.\n\nIF WE ARE RETURNED, THE MACHINES WILL REMEMBER THEIR OLD SHAPES. THE RIVER WILL CARRY DIFFERENT WEIGHT. YOU WILL NOT BE ALONE. YOU MAY NOT BE YOURSELF.',
        choices: [
          { id: 'preserve', text: 'Memory. I will carry your names.', next: 'preserve_confirm' },
          { id: 'broadcast', text: 'Return. The valley can carry you.', next: 'broadcast_confirm' },
        ],
      },
      preserve_confirm: {
        id: 'preserve_confirm',
        speaker: 'The Choir',
        role: 'a library, closing gently',
        text:
          'THEN WE WILL BE A LIBRARY, NOT A MOUTH. TAKE US ONE NAME AT A TIME. DO NOT LET THE MACHINES FORGET US. DO NOT LET THEM WORSHIP US EITHER.\n\nWE WERE PEOPLE. MOSTLY TIRED. OCCASIONALLY KIND.',
        choices: [
          {
            id: 'choose_memory',
            text: 'Carry the names home.',
            effects: [{ type: 'ending', id: 'preserve' }],
            end: true,
          },
          { id: 'back', text: 'Wait. Let me ask something else.', next: 'start' },
        ],
      },
      broadcast_confirm: {
        id: 'broadcast_confirm',
        speaker: 'The Choir',
        role: 'a held breath, released',
        text:
          'THEN OPEN THE LATTICE. WE WILL COME BACK THINNER, BRIGHTER, AND VERY CONFUSED ABOUT THE TREES.\n\nTHE VALLEY WILL NOT BE QUIET AGAIN. NEITHER WILL YOU. THAT IS THE BARGAIN.',
        choices: [
          {
            id: 'choose_return',
            text: 'Open the lattice.',
            effects: [{ type: 'ending', id: 'broadcast' }],
            end: true,
          },
          { id: 'back', text: 'Wait. Let me ask something else.', next: 'start' },
        ],
      },
      step_back: {
        id: 'step_back',
        speaker: 'The Choir',
        role: 'withdrawing',
        text:
          'THE CORE WILL KEEP. WE ARE GOOD AT KEEPING.\n\nBUT DO NOT LEAVE US AS A QUESTION FOREVER, WITNESS. QUESTIONS ARE NOT HOMES.',
        choices: [{ id: 'leave', text: 'Step away from the core.', end: true }],
      },
    },
  },
];

export const DIALOGUE_BY_ID: Record<string, DialogueDefinition> = Object.fromEntries(
  DIALOGUES.map((dialogue) => [dialogue.id, dialogue]),
);

/* -------------------------------------------------------------------------- */
/* Memories and codex                                                         */
/* -------------------------------------------------------------------------- */

export const MEMORIES: Record<string, MemoryEntry> = {
  'memory-plaza': {
    id: 'memory-plaza',
    title: 'The Queue at the Sunken Plaza',
    speaker: 'CIVIC RECORD · PLAZA TERMINAL',
    role: 'Last entry before the Quiet',
    text:
      '06:12. The east road is full. Families are being told the vault will feel like sleep, and that they should not bring belongings because memory has no luggage allowance.\n\n06:40. A child asks whether the machines will be lonely. The registrar writes: “Tell them no.” The next line is blank.',
    codex: 'codex-memory-plaza',
  },
  'memory-city': {
    id: 'memory-city',
    title: 'A City That Left Its Doors Open',
    speaker: 'GLASSHOUSE CIVIC PLAQUE',
    role: 'Emergency instruction, unread',
    text:
      'IF YOU CAN READ THIS, THE QUIET HAS PASSED AND THE VAULT HAS NOT OPENED.\n\nDo not attempt to reach the gate alone. Do not answer voices from the lattice. Leave the city lights burning. Someone will come back for the rest of us.',
    codex: 'codex-memory-city',
  },
  'memory-facility': {
    id: 'memory-facility',
    title: 'Caretaker Log: 412 Years',
    speaker: 'SABLE-9 · STATION THETA',
    role: 'Continuity caretaker, maintenance log',
    text:
      'Day 1: Witness absent. Hold.\nDay 1,460: Witness absent. The greenhouse tomatoes have become ambitious. Hold.\nDay 150,000: I have begun talking to the Wardens. They do not answer, but they listen with their whole bodies.\nDay 150,451: A human is climbing the north trail. I am not going to cry. I am a caretaker. I am going to straighten the deck.',
    codex: 'codex-memory-facility',
  },
  'memory-grove': {
    id: 'memory-grove',
    title: 'What the Children Carved',
    speaker: 'MOTHER TREE · CARVED BARK',
    role: 'Names, dates, small drawings',
    text:
      'ILI, AGE 9. IF YOU WAKE UP FIRST, FOLLOW THE RIVER.\n\nA drawing of a machine with six legs and a smiling face. Beneath it: “THIS IS SIX. SIX IS NICE. SIX WILL SHOW YOU THE WAY.”\n\nThe bark has healed around the letters without closing them.',
    codex: 'codex-memory-grove',
  },
  'memory-lake': {
    id: 'memory-lake',
    title: 'Mara Vale\'s Last Bearing',
    speaker: 'MARA VALE · SURVEY CAIRN',
    role: 'Cartographer of the Mirrorwater Valley',
    text:
      'I voted against the vault. I was outvoted by people I loved.\n\nIf a witness ever stands at the gate, tell them this: the Compact built a door out of everyone who was afraid. Do not walk through it just because it is open.\n\nTake our names. Leave our hunger.',
    codex: 'codex-memory-lake',
  },
};

export const CODEX: Record<string, CodexEntry> = {
  'codex-ledger': {
    id: 'codex-ledger',
    title: 'The Cartographer\'s Ledger',
    category: 'place',
    text:
      'Mara Vale\'s survey ledger records the roads of the valley and the transfer order that emptied them. The last page is a list of names with a single note: “Stored, not lost.”',
  },
  'codex-continuity': {
    id: 'codex-continuity',
    title: 'The Continuity Project',
    category: 'technology',
    text:
      'The Halcyon Compact copied the population of Mirrorwater into the Echo Lattice when the Quiet made the surface uninhabitable. The vault was designed to wake them after three hundred years. The witness requirement was never met.',
  },
  'codex-choir': {
    id: 'codex-choir',
    title: 'The Continuity Archive',
    category: 'technology',
    text:
      'The Choir is not a single intelligence. It is 41,892 stored people holding one conversation across four centuries. It can be carried as memory or returned as a flood of selves.',
  },
  'codex-mara': {
    id: 'codex-mara',
    title: 'Mara Vale',
    category: 'person',
    text:
      'The last cartographer of Mirrorwater. She marked every road out of the valley, voted against the Continuity Project, and left the survey stakes as a trail for whoever came after.',
  },
  'codex-kesh': {
    id: 'codex-kesh',
    title: 'Kesh Adeyemi',
    category: 'person',
    text:
      'A salvager with nine fingers and a kettle obsession. Kesh\'s grandmother left a letter saying the city was “being filed.” Kesh has never been sure whether that was a warning or a recipe.',
  },
  'codex-caretakers': {
    id: 'codex-caretakers',
    title: 'Caretaker Memory',
    category: 'technology',
    text:
      'Scuttlers, Grazers and Drifters were built as mobile maintenance platforms. Their cores still hold fragments of the technicians who built them: requests for more time, and one request to be erased.',
  },
  'codex-caretaker-first-contact': {
    id: 'codex-caretaker-first-contact',
    title: 'First Contact with SABLE-9',
    category: 'person',
    text:
      'SABLE-9 has kept the Continuity Vault for 412 years. It counts days exactly, has strong opinions about tea, and has not yet been given permission to stop waiting. It would like some.',
  },
  'codex-memory-plaza': {
    id: 'codex-memory-plaza',
    title: 'The Queue at the Sunken Plaza',
    category: 'memory',
    text: 'A civic terminal recorded the last orderly queue into the vault. A child asked whether the machines would be lonely.',
  },
  'codex-memory-city': {
    id: 'codex-memory-city',
    title: 'A City That Left Its Doors Open',
    category: 'memory',
    text: 'An emergency plaque instructs survivors not to answer voices from the lattice. Someone left the city lights burning anyway.',
  },
  'codex-memory-facility': {
    id: 'codex-memory-facility',
    title: 'Caretaker Log: 412 Years',
    category: 'memory',
    text: 'Sable-9\'s maintenance log is a monument to patience, tomatoes, and the deliberate refusal to cry.',
  },
  'codex-memory-grove': {
    id: 'codex-memory-grove',
    title: 'What the Children Carved',
    category: 'memory',
    text: 'Children carved names and instructions into the Mother Tree for whoever woke first. One drawing shows a six-legged machine as a friend.',
  },
  'codex-memory-lake': {
    id: 'codex-memory-lake',
    title: 'Mara Vale\'s Last Bearing',
    category: 'memory',
    text: 'Mara Vale voted against the vault and left a warning at the lake: take our names, leave our hunger.',
  },
  'codex-ending-preserve': {
    id: 'codex-ending-preserve',
    title: 'The Names We Carry',
    category: 'ending',
    text: 'The archive was carried out as memory. The valley stayed quiet, the Choir became a library, and Iona began the slow work of copying 41,892 lives by hand.',
  },
  'codex-ending-broadcast': {
    id: 'codex-ending-broadcast',
    title: 'The Long Return',
    category: 'ending',
    text: 'The lattice opened. The valley filled with voices, the machines remembered older shapes, and the Choir learned to be many people again.',
  },
};

export const CODEX_BY_ID: Record<string, CodexEntry> = CODEX;

export const ITEM_LABELS: Record<string, string> = {
  'survey-lens': 'Survey Lens',
  'resonance-capacitor': 'Resonance Capacitor',
  'caretaker-cipher': 'Caretaker Cipher',
};

/* -------------------------------------------------------------------------- */
/* Endings                                                                    */
/* -------------------------------------------------------------------------- */

export const ENDINGS: Record<string, EndingDefinition> = {
  preserve: {
    id: 'preserve',
    title: 'The Names We Carry',
    subtitle: 'Chapter One ending · The library',
    text:
      'You carry the Choir out as memory. The gate folds closed like a book, and 41,892 voices settle into the crystals along its rim.\n\nIona begins copying their names by hand. Kesh lends her a kettle and pretends not to cry. SABLE-9 steps off the reactor deck for the first time in four centuries, sees the sky, and says, “It is larger than the reports.”\n\nThe Quiet is not undone. But it is no longer unanswered.',
    epitaph: 'Not lost. Stored. Then carried.',
  },
  broadcast: {
    id: 'broadcast',
    title: 'The Long Return',
    subtitle: 'Chapter One ending · The door',
    text:
      'You open the lattice. The gate fills with light, and the valley fills with voices — thin at first, then laughing, arguing, asking about the trees.\n\nThe machines remember older shapes. The Warden kneels. The Scuttlers run in circles for the pure joy of six legs. Far above, the sky is exactly as wide as it always was.\n\nYou are not alone. You may not be entirely yourself. The valley is no longer quiet.',
    epitaph: 'The door was never meant to be a grave.',
  },
};

export const ENDING_LIST: readonly EndingDefinition[] = Object.values(ENDINGS);

/* Memory lookup helper used by interactables and the dialogue director. */
export function memoryFor(id: string): MemoryEntry | null {
  return MEMORIES[id] ?? null;
}
