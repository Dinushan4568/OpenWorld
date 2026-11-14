/** Engine-free RPG progression contracts. */

export type SkillCategory = 'exploration' | 'movement' | 'scanning' | 'survival' | 'technology';

export type StatKey =
  | 'moveSpeed'
  | 'jump'
  | 'scanRange'
  | 'pulseCooldown'
  | 'maxStamina'
  | 'staminaRegen'
  | 'waterSpeed'
  | 'resourceYield'
  | 'resourceFlat'
  | 'xpBonus'
  | 'upgradeDiscount';

export type AbilityId =
  | 'survey-instinct'
  | 'wayfinder'
  | 'cache-sense'
  | 'double-jump'
  | 'water-stride'
  | 'scan-sample'
  | 'overclock'
  | 'field-medic'
  | 'salvage-eye';

export type EquipmentSlot = 'tool' | 'suit' | 'rig' | 'scanner';

export type ResourceId = 'echo-glass' | 'ferro-scrap' | 'bio-fiber' | 'lattice-fragment' | 'storm-salt';

export interface StatBlock {
  moveSpeed: number;
  jump: number;
  scanRange: number;
  pulseCooldown: number;
  maxStamina: number;
  staminaRegen: number;
  waterSpeed: number;
  resourceYield: number;
  resourceFlat: number;
  xpBonus: number;
  upgradeDiscount: number;
}

export interface SkillDefinition {
  id: string;
  category: SkillCategory;
  tier: 1 | 2 | 3;
  name: string;
  description: string;
  effectText: string;
  maxRank: number;
  costPerRank: number;
  requires?: { skill: string; rank: number };
  stat?: StatKey;
  perRank?: number;
  ability?: AbilityId;
  abilityRank?: number;
}

export interface AbilityDefinition {
  id: AbilityId;
  name: string;
  description: string;
  glyph: string;
  source: string;
}

export interface ResourceDefinition {
  id: ResourceId;
  name: string;
  description: string;
  glyph: string;
  color: string;
}

export interface EquipmentStat {
  base: number;
  perLevel: number;
}

export interface EquipmentDefinition {
  id: string;
  slot: EquipmentSlot;
  tier: 1 | 2;
  name: string;
  description: string;
  stats: Partial<Record<StatKey, EquipmentStat>>;
  /** Costs for upgrading to level 1, 2 and 3. */
  upgradeCosts: Array<Partial<Record<ResourceId, number>>>;
  recipe?: {
    level: number;
    resources: Partial<Record<ResourceId, number>>;
  };
}

export interface ResourceNodeDefinition {
  id: string;
  type: ResourceId;
  x: number;
  z: number;
  amount: number;
}

export interface OwnedEquipment {
  id: string;
  level: number;
}

export interface PlayerStatistics {
  distanceTravelled: number;
  playTime: number;
  shards: number;
  scans: number;
  missions: number;
  puzzles: number;
  resources: number;
  memories: number;
  equipmentUpgrades: number;
  skillsLearned: number;
  xpEarned: number;
}

export interface ProgressionProfile {
  version: 1;
  level: number;
  xp: number;
  skills: Record<string, number>;
  equipment: OwnedEquipment[];
  equipped: Partial<Record<EquipmentSlot, string>>;
  resources: Partial<Record<ResourceId, number>>;
  gatheredNodes: string[];
  scannedSpecies: string[];
  solvedPuzzles: string[];
  collectedShards: string[];
  completedMissions: string[];
  readMemories: string[];
  endings: string[];
  statistics: PlayerStatistics;
  createdAt: number;
  updatedAt: number;
}

export interface ProgressionStats extends StatBlock {
  level: number;
  xp: number;
  xpToNext: number;
  skillPoints: number;
  totalSkillPoints: number;
  spentSkillPoints: number;
  powerScore: number;
}

export interface SkillView {
  id: string;
  category: SkillCategory;
  categoryLabel: string;
  tier: number;
  name: string;
  description: string;
  effectText: string;
  rank: number;
  maxRank: number;
  cost: number;
  unlocked: boolean;
  canUnlock: boolean;
  buttonLabel: string;
  prerequisiteText: string;
  abilityName: string | null;
}

export interface AbilityView {
  id: AbilityId;
  name: string;
  description: string;
  glyph: string;
  source: string;
  unlocked: boolean;
}

export interface EquipmentView {
  id: string;
  slot: EquipmentSlot;
  slotLabel: string;
  name: string;
  tier: number;
  description: string;
  level: number;
  maxLevel: number;
  equipped: boolean;
  statsText: string;
  nextStatsText: string;
  upgradeCostText: string;
  canUpgrade: boolean;
  upgradeReason: string;
}

export interface RecipeView {
  id: string;
  name: string;
  slotLabel: string;
  description: string;
  costText: string;
  levelRequirement: number;
  canCraft: boolean;
  reason: string;
}

export interface LoadoutView {
  slot: EquipmentSlot;
  slotLabel: string;
  item: EquipmentView | null;
}

export interface ResourceView {
  id: ResourceId;
  name: string;
  description: string;
  glyph: string;
  color: string;
  amount: number;
}

export interface ProgressionView {
  level: number;
  xp: number;
  xpToNext: number;
  skillPoints: number;
  totalSkillPoints: number;
  spentSkillPoints: number;
  stats: ProgressionStats;
  categories: Array<{ id: SkillCategory; label: string; description: string; skills: SkillView[] }>;
  abilities: AbilityView[];
  equipment: EquipmentView[];
  loadout: LoadoutView[];
  recipes: RecipeView[];
  resources: ResourceView[];
  statistics: PlayerStatistics;
  powerScore: number;
  savedAt: number;
}

export interface ProgressionResult {
  ok: boolean;
  message: string;
  levels?: number;
}

export interface ProgressionEvents extends Record<string, unknown> {
  change: { profile: Readonly<ProgressionProfile>; stats: Readonly<ProgressionStats> };
  levelUp: { level: number; gained: number; skillPoints: number };
  abilityUnlocked: { id: AbilityId; name: string };
  skillUnlocked: { id: string; name: string; rank: number };
  equipmentChanged: { id: string; action: 'equip' | 'unequip' | 'upgrade' | 'craft' };
  resourceGained: { id: ResourceId; amount: number; total: number };
  saved: { ok: boolean; error?: string };
  loaded: { ok: boolean; repaired: boolean; error?: string };
}
