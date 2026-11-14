/** Tolerant validation for progression saves. Unknown data is dropped, never trusted. */
import { SHARD_LOCATIONS } from '../config';
import { ENDINGS, MEMORIES, MISSION_IDS, PUZZLES } from '../story/content';
import {
  EQUIPMENT_BY_ID,
  EQUIPMENT_SLOTS,
  MAX_EQUIPMENT_LEVEL,
  MAX_LEVEL,
  RESOURCES,
  RESOURCE_NODE_BY_ID,
  SKILLS,
  SKILL_BY_ID,
  STARTER_EQUIPMENT,
  totalSkillPointsForLevel,
  xpToNext,
} from './content';
import type {
  EquipmentSlot,
  OwnedEquipment,
  PlayerStatistics,
  ProgressionProfile,
  ResourceId,
} from './types';

const SPECIES = new Set(['scuttler', 'grazer', 'drifter', 'warden']);
const SHARD_IDS = new Set(SHARD_LOCATIONS.map((shard) => shard.id));

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const int = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(Math.floor(value), min, max) : fallback;
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const stringList = (value: unknown, predicate: (entry: string) => boolean, limit = 500): string[] =>
  Array.isArray(value)
    ? Array.from(new Set(value.filter((entry): entry is string => typeof entry === 'string' && predicate(entry)))).slice(0, limit)
    : [];

export function blankStatistics(): PlayerStatistics {
  return {
    distanceTravelled: 0,
    playTime: 0,
    shards: 0,
    scans: 0,
    missions: 0,
    puzzles: 0,
    resources: 0,
    memories: 0,
    equipmentUpgrades: 0,
    skillsLearned: 0,
    xpEarned: 0,
  };
}

export function blankProfile(now = Date.now()): ProgressionProfile {
  const equipment: OwnedEquipment[] = STARTER_EQUIPMENT.map((id) => ({ id, level: 0 }));
  return {
    version: 1,
    level: 1,
    xp: 0,
    skills: {},
    equipment,
    equipped: {
      tool: 'trail-staff',
      suit: 'canvas-coat',
      rig: 'utility-rig',
      scanner: 'field-visor',
    },
    resources: {},
    gatheredNodes: [],
    scannedSpecies: [],
    solvedPuzzles: [],
    collectedShards: [],
    completedMissions: [],
    readMemories: [],
    endings: [],
    statistics: blankStatistics(),
    createdAt: now,
    updatedAt: now,
  };
}

function sanitizeStatistics(raw: unknown): PlayerStatistics {
  const source = record(raw);
  return {
    distanceTravelled: Number.isFinite(source.distanceTravelled)
      ? clamp(source.distanceTravelled as number, 0, 50_000_000)
      : 0,
    playTime: Number.isFinite(source.playTime) ? clamp(source.playTime as number, 0, 50_000_000) : 0,
    shards: int(source.shards, 0, 0, 100),
    scans: int(source.scans, 0, 0, 1_000_000),
    missions: int(source.missions, 0, 0, 1000),
    puzzles: int(source.puzzles, 0, 0, 1000),
    resources: int(source.resources, 0, 0, 10_000_000),
    memories: int(source.memories, 0, 0, 1000),
    equipmentUpgrades: int(source.equipmentUpgrades, 0, 0, 1000),
    skillsLearned: int(source.skillsLearned, 0, 0, 1000),
    xpEarned: int(source.xpEarned, 0, 0, 100_000_000),
  };
}

function sanitizeSkills(raw: unknown, level: number): Record<string, number> {
  const source = record(raw);
  const skills: Record<string, number> = {};
  for (const skill of SKILLS) {
    const rank = int(source[skill.id], 0, 0, skill.maxRank);
    if (rank > 0) skills[skill.id] = rank;
  }
  // Prerequisites are enforced from tier 1 upward so a save cannot smuggle in a
  // tier-three skill without its foundation.
  for (const skill of SKILLS) {
    if (!skills[skill.id]) continue;
    if (skill.requires && (skills[skill.requires.skill] ?? 0) < skill.requires.rank) {
      delete skills[skill.id];
    }
  }
  // A save cannot have spent more skill points than its level has earned. Walk
  // the authored order (tier prerequisites come first) and trim the overflow.
  let budget = totalSkillPointsForLevel(level);
  for (const skill of SKILLS) {
    const rank = skills[skill.id];
    if (!rank) continue;
    const cost = rank * skill.costPerRank;
    if (cost <= budget) {
      budget -= cost;
      continue;
    }
    const affordable = Math.floor(budget / skill.costPerRank);
    if (affordable > 0) {
      skills[skill.id] = affordable;
      budget -= affordable * skill.costPerRank;
    } else {
      delete skills[skill.id];
    }
  }
  for (const skill of SKILLS) {
    if (!skills[skill.id]) continue;
    if (skill.requires && (skills[skill.requires.skill] ?? 0) < skill.requires.rank) {
      delete skills[skill.id];
    }
  }
  return skills;
}

function sanitizeEquipment(raw: unknown): OwnedEquipment[] {
  const entries: OwnedEquipment[] = [];
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const source = record(entry);
      const id = typeof source.id === 'string' ? source.id : '';
      const definition = EQUIPMENT_BY_ID[id];
      if (!definition || seen.has(id)) continue;
      seen.add(id);
      entries.push({ id, level: int(source.level, 0, 0, MAX_EQUIPMENT_LEVEL) });
    }
  }
  if (entries.length === 0) {
    for (const id of STARTER_EQUIPMENT) entries.push({ id, level: 0 });
  }
  return entries;
}

function sanitizeEquipped(raw: unknown, owned: OwnedEquipment[]): Partial<Record<EquipmentSlot, string>> {
  const source = record(raw);
  const ownedIds = new Set(owned.map((entry) => entry.id));
  const equipped: Partial<Record<EquipmentSlot, string>> = {};
  for (const slot of EQUIPMENT_SLOTS) {
    const id = source[slot.id];
    if (typeof id !== 'string' || !ownedIds.has(id)) continue;
    if (EQUIPMENT_BY_ID[id]?.slot !== slot.id) continue;
    equipped[slot.id] = id;
  }
  return equipped;
}

function sanitizeResources(raw: unknown): Partial<Record<ResourceId, number>> {
  const source = record(raw);
  const resources: Partial<Record<ResourceId, number>> = {};
  for (const id of Object.keys(RESOURCES) as ResourceId[]) {
    const amount = int(source[id], 0, 0, 1_000_000);
    if (amount > 0) resources[id] = amount;
  }
  return resources;
}

export interface ValidationResult {
  profile: ProgressionProfile;
  repaired: boolean;
  issues: string[];
}

/**
 * Validate and repair a persisted profile. This is used on every load, so a
 * corrupt or hand-edited IndexedDB record cannot crash the expedition or grant
 * impossible equipment/skills.
 */
export function validateProfile(raw: unknown, now = Date.now()): ValidationResult {
  const issues: string[] = [];
  if (!raw || typeof raw !== 'object') {
    return { profile: blankProfile(now), repaired: true, issues: ['profile was not an object'] };
  }
  const source = raw as Record<string, unknown>;
  if (source.version !== 1) issues.push('unsupported or missing version');
  const level = int(source.level, 1, 1, MAX_LEVEL);
  if (level !== source.level) issues.push('level normalised');
  const maximumXp = Math.max(0, xpToNext(level) - 1);
  const xp = int(source.xp, 0, 0, maximumXp);
  if (xp !== source.xp) issues.push('experience normalised');

  const skills = sanitizeSkills(source.skills, level);
  if (Object.keys(skills).length !== Object.keys(record(source.skills)).filter((id) => SKILL_BY_ID[id]).length) {
    issues.push('skills repaired');
  }
  const equipment = sanitizeEquipment(source.equipment);
  if (!Array.isArray(source.equipment) || equipment.length !== (source.equipment as unknown[]).length) {
    issues.push('equipment repaired');
  }
  const equipped = sanitizeEquipped(source.equipped, equipment);
  const resources = sanitizeResources(source.resources);
  const statistics = sanitizeStatistics(source.statistics);
  const gatheredNodes = stringList(source.gatheredNodes, (id) => Boolean(RESOURCE_NODE_BY_ID[id]));
  const scannedSpecies = stringList(source.scannedSpecies, (id) => SPECIES.has(id));
  const solvedPuzzles = stringList(source.solvedPuzzles, (id) => Boolean(PUZZLES[id]));
  const collectedShards = stringList(source.collectedShards, (id) => SHARD_IDS.has(id));
  const completedMissions = stringList(source.completedMissions, (id) => MISSION_IDS.has(id));
  const readMemories = stringList(source.readMemories, (id) => Boolean(MEMORIES[id]));
  const endings = stringList(source.endings, (id) => Boolean(ENDINGS[id]));
  const createdAt =
    typeof source.createdAt === 'number' && Number.isFinite(source.createdAt) && source.createdAt > 0
      ? source.createdAt
      : now;
  const updatedAt =
    typeof source.updatedAt === 'number' && Number.isFinite(source.updatedAt) && source.updatedAt > 0
      ? source.updatedAt
      : createdAt;

  if (gatheredNodes.length !== (Array.isArray(source.gatheredNodes) ? new Set(source.gatheredNodes).size : 0)) {
    issues.push('gathered nodes repaired');
  }
  if (scannedSpecies.length !== (Array.isArray(source.scannedSpecies) ? new Set(source.scannedSpecies).size : 0)) {
    issues.push('scanned species repaired');
  }

  return {
    profile: {
      version: 1,
      level,
      xp,
      skills,
      equipment,
      equipped,
      resources,
      gatheredNodes,
      scannedSpecies,
      solvedPuzzles,
      collectedShards,
      completedMissions,
      readMemories,
      endings,
      statistics,
      createdAt,
      updatedAt,
    },
    repaired: issues.length > 0,
    issues,
  };
}
