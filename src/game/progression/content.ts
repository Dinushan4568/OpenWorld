/**
 * Authored RPG content: skills, abilities, resources, equipment, recipes and
 * the valley's collectible resource nodes. Everything here is data; the
 * progression engine and the world layer consume it.
 */
import type {
  AbilityDefinition,
  EquipmentDefinition,
  EquipmentSlot,
  ResourceDefinition,
  ResourceNodeDefinition,
  SkillCategory,
  SkillDefinition,
  StatBlock,
  StatKey,
} from './types';

export const MAX_LEVEL = 20;
export const MAX_EQUIPMENT_LEVEL = 3;
export const SKILL_POINTS_PER_LEVEL = 2;

export const BASE_STATS: StatBlock = {
  moveSpeed: 1,
  jump: 1,
  scanRange: 58,
  pulseCooldown: 3.2,
  maxStamina: 100,
  staminaRegen: 14,
  waterSpeed: 1,
  resourceYield: 1,
  resourceFlat: 0,
  xpBonus: 1,
  upgradeDiscount: 0,
};

export const STAT_LABELS: Record<StatKey, string> = {
  moveSpeed: 'Movement',
  jump: 'Jump',
  scanRange: 'Scan range',
  pulseCooldown: 'Pulse cooldown',
  maxStamina: 'Max stamina',
  staminaRegen: 'Stamina regen',
  waterSpeed: 'Water speed',
  resourceYield: 'Resource yield',
  resourceFlat: 'Bonus resources',
  xpBonus: 'Experience gain',
  upgradeDiscount: 'Upgrade discount',
};

export const SKILL_CATEGORIES: Array<{ id: SkillCategory; label: string; description: string; glyph: string }> = [
  {
    id: 'exploration',
    label: 'Exploration',
    description: 'Read the valley, find caches and carry more home.',
    glyph: '◇',
  },
  {
    id: 'movement',
    label: 'Movement',
    description: 'Cover ground, vault obstacles and endure the long walk.',
    glyph: '⇢',
  },
  {
    id: 'scanning',
    label: 'Scanning',
    description: 'Tune the survey gear and catalogue the valley’s machines.',
    glyph: '◎',
  },
  {
    id: 'survival',
    label: 'Survival',
    description: 'Stay steady in water, weather and the spaces between.',
    glyph: '⌁',
  },
  {
    id: 'technology',
    label: 'Technology',
    description: 'Coax more from the Continuity lattice and your field kit.',
    glyph: '⌬',
  },
];

export const ABILITIES: Record<string, AbilityDefinition> = {
  'survey-instinct': {
    id: 'survey-instinct',
    name: 'Survey Instinct',
    description: 'Uncollected resource nodes appear on the compass while you explore.',
    glyph: '◇',
    source: 'Exploration · Field Survey',
  },
  wayfinder: {
    id: 'wayfinder',
    name: 'Wayfinder',
    description: 'The compass tracks up to three nearby resource signatures instead of one.',
    glyph: '⌖',
    source: 'Exploration · Wayfinder',
  },
  'cache-sense': {
    id: 'cache-sense',
    name: 'Cache Sense',
    description: 'Every resource node yields one extra unit when harvested.',
    glyph: '▣',
    source: 'Exploration · Ruin Lore',
  },
  'double-jump': {
    id: 'double-jump',
    name: 'Vault Step',
    description: 'Press jump again in the air to catch a second lift.',
    glyph: '⇧',
    source: 'Movement · Vaulting',
  },
  'water-stride': {
    id: 'water-stride',
    name: 'Water Stride',
    description: 'Wading and deep water slow you down far less.',
    glyph: '≈',
    source: 'Survival · Watercraft',
  },
  'scan-sample': {
    id: 'scan-sample',
    name: 'Scan Sample',
    description: 'The first scan of each machine species yields salvage or bio-fibre.',
    glyph: '⌁',
    source: 'Scanning · Field Analysis',
  },
  overclock: {
    id: 'overclock',
    name: 'Overclock',
    description: 'The echo capacitor recharges faster after every pulse.',
    glyph: 'ϟ',
    source: 'Technology · Capacitor',
  },
  'field-medic': {
    id: 'field-medic',
    name: 'Field Medic',
    description: 'Stamina returns faster whenever you are not sprinting.',
    glyph: '✚',
    source: 'Survival · Field Medicine',
  },
  'salvage-eye': {
    id: 'salvage-eye',
    name: 'Salvage Eye',
    description: 'Field-bench equipment upgrades cost less salvage.',
    glyph: '⚒',
    source: 'Technology · Lattice Decipher',
  },
};

export const SKILLS: readonly SkillDefinition[] = [
  /* Exploration ----------------------------------------------------------- */
  {
    id: 'field-survey',
    category: 'exploration',
    tier: 1,
    name: 'Field Survey',
    description: 'The old expedition habit: read disturbed ground before you see the cache.',
    effectText: '+8% resource yield per rank · Survey Instinct at rank 1',
    maxRank: 3,
    costPerRank: 1,
    stat: 'resourceYield',
    perRank: 0.08,
    ability: 'survey-instinct',
    abilityRank: 1,
  },
  {
    id: 'ruin-lore',
    category: 'exploration',
    tier: 2,
    name: 'Ruin Lore',
    description: 'You know how the Halcyon built their archives, and where they hid the spare parts.',
    effectText: '+6% experience per rank · Cache Sense at rank 2',
    maxRank: 3,
    costPerRank: 1,
    requires: { skill: 'field-survey', rank: 1 },
    stat: 'xpBonus',
    perRank: 0.06,
    ability: 'cache-sense',
    abilityRank: 2,
  },
  {
    id: 'wayfinder',
    category: 'exploration',
    tier: 3,
    name: 'Wayfinder',
    description: 'Every ridge, cairn and dead road resolves into a single inner map.',
    effectText: '+3% movement per rank · Wayfinder at rank 1',
    maxRank: 3,
    costPerRank: 1,
    requires: { skill: 'ruin-lore', rank: 2 },
    stat: 'moveSpeed',
    perRank: 0.03,
    ability: 'wayfinder',
    abilityRank: 1,
  },

  /* Movement -------------------------------------------------------------- */
  {
    id: 'trailcraft',
    category: 'movement',
    tier: 1,
    name: 'Trailcraft',
    description: 'Long stride, quiet feet, and a pack that sits where it should.',
    effectText: '+4% movement speed per rank',
    maxRank: 3,
    costPerRank: 1,
    stat: 'moveSpeed',
    perRank: 0.04,
  },
  {
    id: 'vaulting',
    category: 'movement',
    tier: 2,
    name: 'Vaulting',
    description: 'Momentum is a tool. So are knees, when used correctly.',
    effectText: '+5% jump height per rank · Vault Step at rank 2',
    maxRank: 3,
    costPerRank: 1,
    requires: { skill: 'trailcraft', rank: 1 },
    stat: 'jump',
    perRank: 0.05,
    ability: 'double-jump',
    abilityRank: 2,
  },
  {
    id: 'endurance',
    category: 'movement',
    tier: 3,
    name: 'Endurance',
    description: 'The valley is measured in hours, not metres.',
    effectText: '+15 maximum stamina per rank',
    maxRank: 3,
    costPerRank: 1,
    requires: { skill: 'vaulting', rank: 2 },
    stat: 'maxStamina',
    perRank: 15,
  },

  /* Scanning -------------------------------------------------------------- */
  {
    id: 'optic-tuning',
    category: 'scanning',
    tier: 1,
    name: 'Optic Tuning',
    description: 'Clean lenses and a steadier survey hand.',
    effectText: '+8 m scan range per rank',
    maxRank: 3,
    costPerRank: 1,
    stat: 'scanRange',
    perRank: 8,
  },
  {
    id: 'field-analysis',
    category: 'scanning',
    tier: 2,
    name: 'Field Analysis',
    description: 'You do not just record a machine; you understand what it is trying to do.',
    effectText: '+8% experience per rank · Scan Sample at rank 2',
    maxRank: 3,
    costPerRank: 1,
    requires: { skill: 'optic-tuning', rank: 1 },
    stat: 'xpBonus',
    perRank: 0.08,
    ability: 'scan-sample',
    abilityRank: 2,
  },
  {
    id: 'catalogue',
    category: 'scanning',
    tier: 3,
    name: 'Catalogue',
    description: 'A complete survey is also a complete shopping list.',
    effectText: '+6% resource yield per rank',
    maxRank: 3,
    costPerRank: 1,
    requires: { skill: 'field-analysis', rank: 2 },
    stat: 'resourceYield',
    perRank: 0.06,
  },

  /* Survival -------------------------------------------------------------- */
  {
    id: 'hardy',
    category: 'survival',
    tier: 1,
    name: 'Hardy',
    description: 'Rations, breath and the refusal to stop one step early.',
    effectText: '+20 maximum stamina per rank',
    maxRank: 3,
    costPerRank: 1,
    stat: 'maxStamina',
    perRank: 20,
  },
  {
    id: 'watercraft',
    category: 'survival',
    tier: 2,
    name: 'Watercraft',
    description: 'The river is a road if you stop fighting it.',
    effectText: '+12% water speed per rank · Water Stride at rank 1',
    maxRank: 3,
    costPerRank: 1,
    requires: { skill: 'hardy', rank: 1 },
    stat: 'waterSpeed',
    perRank: 0.12,
    ability: 'water-stride',
    abilityRank: 1,
  },
  {
    id: 'field-medicine',
    category: 'survival',
    tier: 3,
    name: 'Field Medicine',
    description: 'A little tea, a little tape, and a great deal of stubbornness.',
    effectText: '+2 stamina regeneration per rank · Field Medic at rank 2',
    maxRank: 3,
    costPerRank: 1,
    requires: { skill: 'watercraft', rank: 2 },
    stat: 'staminaRegen',
    perRank: 2,
    ability: 'field-medic',
    abilityRank: 2,
  },

  /* Technology ------------------------------------------------------------ */
  {
    id: 'capacitor',
    category: 'technology',
    tier: 1,
    name: 'Capacitor',
    description: 'The echo rig is old, but it was built with generous tolerances.',
    effectText: '−0.18 s pulse cooldown per rank · Overclock at rank 2',
    maxRank: 3,
    costPerRank: 1,
    stat: 'pulseCooldown',
    perRank: -0.18,
    ability: 'overclock',
    abilityRank: 2,
  },
  {
    id: 'lattice-decipher',
    category: 'technology',
    tier: 2,
    name: 'Lattice Decipher',
    description: 'The Continuity language is not a code. It is a habit of thought.',
    effectText: '+7% experience per rank · Salvage Eye at rank 2',
    maxRank: 3,
    costPerRank: 1,
    requires: { skill: 'capacitor', rank: 1 },
    stat: 'xpBonus',
    perRank: 0.07,
    ability: 'salvage-eye',
    abilityRank: 2,
  },
  {
    id: 'salvage-master',
    category: 'technology',
    tier: 3,
    name: 'Salvage Master',
    description: 'Kesh would call it cheating. Kesh would also ask for a cut.',
    effectText: '+12% equipment upgrade discount per rank',
    maxRank: 3,
    costPerRank: 1,
    requires: { skill: 'lattice-decipher', rank: 2 },
    stat: 'upgradeDiscount',
    perRank: 0.12,
  },
];

export const SKILL_BY_ID: Record<string, SkillDefinition> = Object.fromEntries(
  SKILLS.map((skill) => [skill.id, skill]),
);

export const RESOURCES: Record<string, ResourceDefinition> = {
  'echo-glass': {
    id: 'echo-glass',
    name: 'Echo-glass',
    description: 'Resonant crystal shards. The lattice sings when they are near the gate.',
    glyph: '◈',
    color: '#79f0cf',
  },
  'ferro-scrap': {
    id: 'ferro-scrap',
    name: 'Ferro-scrap',
    description: 'Pre-Quiet alloy, still straight enough to be useful.',
    glyph: '⚒',
    color: '#c98b62',
  },
  'bio-fiber': {
    id: 'bio-fiber',
    name: 'Bio-fibre',
    description: 'Tough green filament from the terraces. Good for straps, shelter and bandages.',
    glyph: '⌁',
    color: '#9ddc78',
  },
  'lattice-fragment': {
    id: 'lattice-fragment',
    name: 'Lattice fragment',
    description: 'A sealed sliver of Continuity glass. Warm even in the rain.',
    glyph: '⌬',
    color: '#b59bff',
  },
  'storm-salt': {
    id: 'storm-salt',
    name: 'Storm salt',
    description: 'Mineral bloom left by the Quiet. Bitter, bright and useful in capacitors.',
    glyph: '✧',
    color: '#d7e9ff',
  },
};

export const RESOURCE_LIST: readonly ResourceDefinition[] = Object.values(RESOURCES);

export const EQUIPMENT_SLOTS: Array<{ id: EquipmentSlot; label: string; glyph: string }> = [
  { id: 'tool', label: 'Field tool', glyph: '⟡' },
  { id: 'suit', label: 'Suit', glyph: '▤' },
  { id: 'rig', label: 'Pack rig', glyph: '▣' },
  { id: 'scanner', label: 'Scanner', glyph: '◎' },
];

export const SLOT_LABELS: Record<EquipmentSlot, string> = {
  tool: 'Field tool',
  suit: 'Suit',
  rig: 'Pack rig',
  scanner: 'Scanner',
};

export const EQUIPMENT: readonly EquipmentDefinition[] = [
  {
    id: 'trail-staff',
    slot: 'tool',
    tier: 1,
    name: 'Trail Staff',
    description: 'A survey staff with a tuned echo tip. It makes a long walk feel shorter.',
    stats: {
      moveSpeed: { base: 0.04, perLevel: 0.02 },
      maxStamina: { base: 4, perLevel: 3 },
    },
    upgradeCosts: [
      { 'ferro-scrap': 2, 'echo-glass': 1 },
      { 'ferro-scrap': 4, 'echo-glass': 2 },
      { 'ferro-scrap': 6, 'echo-glass': 3 },
    ],
  },
  {
    id: 'canvas-coat',
    slot: 'suit',
    tier: 1,
    name: 'Canvas Coat',
    description: 'Waxed expedition canvas. It sheds rain and most of the valley’s sharp edges.',
    stats: {
      maxStamina: { base: 12, perLevel: 8 },
      waterSpeed: { base: 0.05, perLevel: 0.03 },
    },
    upgradeCosts: [
      { 'bio-fiber': 3, 'ferro-scrap': 1 },
      { 'bio-fiber': 5, 'ferro-scrap': 2 },
      { 'bio-fiber': 8, 'storm-salt': 2 },
    ],
  },
  {
    id: 'utility-rig',
    slot: 'rig',
    tier: 1,
    name: 'Utility Rig',
    description: 'Kesh’s spare pack. Every strap has been replaced at least twice.',
    stats: {
      resourceYield: { base: 0.1, perLevel: 0.06 },
      xpBonus: { base: 0.02, perLevel: 0.02 },
    },
    upgradeCosts: [
      { 'ferro-scrap': 2, 'bio-fiber': 2 },
      { 'ferro-scrap': 4, 'bio-fiber': 3 },
      { 'ferro-scrap': 6, 'echo-glass': 2 },
    ],
  },
  {
    id: 'field-visor',
    slot: 'scanner',
    tier: 1,
    name: 'Field Visor',
    description: 'A scratched survey lens. The machine spirits forgive its age.',
    stats: {
      scanRange: { base: 6, perLevel: 4 },
      xpBonus: { base: 0.03, perLevel: 0.03 },
    },
    upgradeCosts: [
      { 'echo-glass': 2, 'storm-salt': 1 },
      { 'echo-glass': 4, 'storm-salt': 2 },
      { 'echo-glass': 6, 'lattice-fragment': 1 },
    ],
  },
  {
    id: 'resonance-harness',
    slot: 'tool',
    tier: 2,
    name: 'Resonance Harness',
    description: 'A harness of tuned Continuity wire. Each step carries its own echo.',
    stats: {
      moveSpeed: { base: 0.08, perLevel: 0.04 },
      pulseCooldown: { base: -0.22, perLevel: -0.1 },
      maxStamina: { base: 8, perLevel: 5 },
    },
    upgradeCosts: [
      { 'ferro-scrap': 5, 'echo-glass': 3 },
      { 'lattice-fragment': 1, 'echo-glass': 5 },
      { 'lattice-fragment': 2, 'storm-salt': 4 },
    ],
    recipe: { level: 5, resources: { 'ferro-scrap': 8, 'echo-glass': 4, 'lattice-fragment': 1 } },
  },
  {
    id: 'quiet-weave',
    slot: 'suit',
    tier: 2,
    name: 'Quiet Weave',
    description: 'Woven from the same grey fibre the vault caretakers use for insulation.',
    stats: {
      maxStamina: { base: 25, perLevel: 12 },
      staminaRegen: { base: 3, perLevel: 1.5 },
      waterSpeed: { base: 0.15, perLevel: 0.08 },
    },
    upgradeCosts: [
      { 'bio-fiber': 6, 'storm-salt': 2 },
      { 'lattice-fragment': 1, 'bio-fiber': 8 },
      { 'lattice-fragment': 2, 'echo-glass': 5 },
    ],
    recipe: { level: 6, resources: { 'bio-fiber': 8, 'echo-glass': 3, 'storm-salt': 2 } },
  },
  {
    id: 'deep-salvage-rig',
    slot: 'rig',
    tier: 2,
    name: 'Deep Salvage Rig',
    description: 'A frame built to bring the old city home one useful piece at a time.',
    stats: {
      resourceYield: { base: 0.25, perLevel: 0.12 },
      resourceFlat: { base: 0, perLevel: 0 },
      xpBonus: { base: 0.08, perLevel: 0.04 },
    },
    upgradeCosts: [
      { 'ferro-scrap': 6, 'bio-fiber': 4 },
      { 'ferro-scrap': 8, 'lattice-fragment': 1 },
      { 'lattice-fragment': 2, 'echo-glass': 4 },
    ],
    recipe: { level: 4, resources: { 'ferro-scrap': 6, 'bio-fiber': 4 } },
  },
  {
    id: 'lattice-lens',
    slot: 'scanner',
    tier: 2,
    name: 'Lattice Lens',
    description: 'SABLE-9 ground this lens from a vault window. It sees further than it should.',
    stats: {
      scanRange: { base: 14, perLevel: 7 },
      xpBonus: { base: 0.1, perLevel: 0.05 },
      pulseCooldown: { base: -0.1, perLevel: -0.05 },
    },
    upgradeCosts: [
      { 'echo-glass': 6, 'storm-salt': 3 },
      { 'lattice-fragment': 1, 'echo-glass': 8 },
      { 'lattice-fragment': 3, 'storm-salt': 5 },
    ],
    recipe: { level: 7, resources: { 'echo-glass': 8, 'lattice-fragment': 2 } },
  },
];

export const EQUIPMENT_BY_ID: Record<string, EquipmentDefinition> = Object.fromEntries(
  EQUIPMENT.map((item) => [item.id, item]),
);

export const STARTER_EQUIPMENT = ['trail-staff', 'canvas-coat', 'utility-rig', 'field-visor'] as const;

export const RESOURCE_NODES: readonly ResourceNodeDefinition[] = [
  { id: 'glass-plaza', type: 'echo-glass', x: 44, z: -6, amount: 2 },
  { id: 'glass-city', type: 'echo-glass', x: -196, z: -18, amount: 3 },
  { id: 'glass-gate', type: 'echo-glass', x: 150, z: 80, amount: 2 },
  { id: 'glass-facility', type: 'echo-glass', x: -88, z: 166, amount: 3 },
  { id: 'scrap-city', type: 'ferro-scrap', x: -206, z: 8, amount: 2 },
  { id: 'scrap-terrace', type: 'ferro-scrap', x: -182, z: -42, amount: 3 },
  { id: 'scrap-facility', type: 'ferro-scrap', x: -104, z: 186, amount: 2 },
  { id: 'scrap-gate', type: 'ferro-scrap', x: 146, z: 96, amount: 2 },
  { id: 'fiber-grove', type: 'bio-fiber', x: 188, z: -96, amount: 2 },
  { id: 'fiber-glen', type: 'bio-fiber', x: 168, z: -80, amount: 2 },
  { id: 'fiber-river', type: 'bio-fiber', x: -64, z: 84, amount: 3 },
  { id: 'fiber-ridge', type: 'bio-fiber', x: 122, z: -84, amount: 2 },
  { id: 'salt-lake', type: 'storm-salt', x: -122, z: -64, amount: 2 },
  { id: 'salt-falls', type: 'storm-salt', x: 4, z: 184, amount: 2 },
  { id: 'salt-meadow', type: 'storm-salt', x: 84, z: 18, amount: 2 },
  { id: 'salt-shore', type: 'storm-salt', x: -8, z: 120, amount: 2 },
  { id: 'lattice-gate', type: 'lattice-fragment', x: 148, z: 62, amount: 1 },
  { id: 'lattice-facility', type: 'lattice-fragment', x: -124, z: 186, amount: 1 },
  { id: 'lattice-plaza', type: 'lattice-fragment', x: 44, z: -52, amount: 1 },
  { id: 'lattice-tree', type: 'lattice-fragment', x: 176, z: -96, amount: 1 },
];

export const RESOURCE_NODE_BY_ID: Record<string, ResourceNodeDefinition> = Object.fromEntries(
  RESOURCE_NODES.map((node) => [node.id, node]),
);

export const XP_SOURCES = {
  shard: 40,
  scan: 28,
  mission: 55,
  puzzle: 65,
  resource: 6,
  memory: 20,
  ending: 300,
  equipmentUpgrade: 18,
  craft: 25,
} as const;

export function xpToNext(level: number): number {
  const safe = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  if (safe >= MAX_LEVEL) return 0;
  return 100 + (safe - 1) * 60;
}

export function totalSkillPointsForLevel(level: number): number {
  const safe = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level)));
  return safe * SKILL_POINTS_PER_LEVEL;
}

export function statLabel(key: StatKey): string {
  return STAT_LABELS[key];
}

export function categoryLabel(category: SkillCategory): string {
  return SKILL_CATEGORIES.find((entry) => entry.id === category)?.label ?? category;
}
