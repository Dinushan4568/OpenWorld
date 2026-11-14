/**
 * The RPG progression engine.
 *
 * Owns the player profile, derives live stats from skills + equipped gear,
 * awards experience from exploration, and persists everything through the
 * injectable {@link ProgressionPersistence} interface.
 */
import { Emitter } from '../core/emitter';
import { SHARD_LOCATIONS } from '../config';
import { ENDINGS, MEMORIES, MISSION_IDS, PUZZLES } from '../story/content';
import {
  ABILITIES,
  BASE_STATS,
  EQUIPMENT_BY_ID,
  EQUIPMENT_SLOTS,
  MAX_EQUIPMENT_LEVEL,
  MAX_LEVEL,
  RESOURCES,
  RESOURCE_LIST,
  RESOURCE_NODE_BY_ID,
  SKILLS,
  SKILL_BY_ID,
  SKILL_CATEGORIES,
  SLOT_LABELS,
  XP_SOURCES,
  categoryLabel,
  statLabel,
  totalSkillPointsForLevel,
  xpToNext,
} from './content';
import type { ProgressionPersistence } from './store';
import { MemoryProgressionStore } from './store';
import { blankProfile, validateProfile } from './validation';
import type {
  AbilityId,
  AbilityView,
  EquipmentDefinition,
  EquipmentSlot,
  EquipmentView,
  LoadoutView,
  OwnedEquipment,
  PlayerStatistics,
  ProgressionEvents,
  ProgressionProfile,
  ProgressionResult,
  ProgressionStats,
  ProgressionView,
  RecipeView,
  ResourceId,
  ResourceView,
  SkillView,
  StatKey,
} from './types';

const SHARD_IDS = new Set(SHARD_LOCATIONS.map((shard) => shard.id));
const SCAN_SPECIES = new Set(['scuttler', 'grazer', 'drifter', 'warden']);
const SAMPLE_RESOURCES: Record<string, ResourceId> = {
  scuttler: 'ferro-scrap',
  grazer: 'ferro-scrap',
  drifter: 'bio-fiber',
  warden: 'lattice-fragment',
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 3): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};
const copy = <T>(value: T): T => structuredClone(value);

export interface ProgressionOptions {
  persistence?: ProgressionPersistence;
  autoSave?: boolean;
  now?: () => number;
  /** Delay before an automatic save; short enough that a tab close keeps progress. */
  saveDelayMs?: number;
}

export class ProgressionSystem extends Emitter<ProgressionEvents> {
  private profileData: ProgressionProfile;
  private readonly persistence: ProgressionPersistence;
  private readonly autoSave: boolean;
  private readonly now: () => number;
  private readonly saveDelayMs: number;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<boolean> | null = null;
  private disposed = false;
  private queuedSave = false;
  private loadedOnce = false;
  private lastError: string | null = null;

  constructor(options: ProgressionOptions = {}) {
    super();
    this.persistence = options.persistence ?? new MemoryProgressionStore();
    this.autoSave = options.autoSave ?? true;
    this.now = options.now ?? (() => Date.now());
    this.saveDelayMs = options.saveDelayMs ?? 650;
    this.profileData = blankProfile(this.now());
  }

  get profile(): Readonly<ProgressionProfile> {
    return this.profileData;
  }

  get hasLoaded(): boolean {
    return this.loadedOnce;
  }

  get loadError(): string | null {
    return this.lastError;
  }

  get stats(): ProgressionStats {
    const base: ProgressionStats = {
      ...BASE_STATS,
      level: this.profileData.level,
      xp: this.profileData.xp,
      xpToNext: xpToNext(this.profileData.level),
      skillPoints: 0,
      totalSkillPoints: totalSkillPointsForLevel(this.profileData.level),
      spentSkillPoints: 0,
      powerScore: 0,
    };

    let spent = 0;
    for (const skill of SKILLS) {
      const rank = this.profileData.skills[skill.id] ?? 0;
      if (rank <= 0) continue;
      spent += rank * skill.costPerRank;
      if (skill.stat && skill.perRank) {
        base[skill.stat] += skill.perRank * rank;
      }
    }
    base.spentSkillPoints = spent;
    base.skillPoints = Math.max(0, base.totalSkillPoints - spent);

    for (const owned of this.profileData.equipment) {
      if (this.profileData.equipped[EQUIPMENT_BY_ID[owned.id]?.slot] !== owned.id) continue;
      const definition = EQUIPMENT_BY_ID[owned.id];
      if (!definition) continue;
      for (const [key, entry] of Object.entries(definition.stats)) {
        if (!entry) continue;
        base[key as StatKey] += entry.base + entry.perLevel * owned.level;
      }
    }

    const abilities = this.abilitySet();
    if (abilities.has('cache-sense')) base.resourceFlat += 1;
    if (abilities.has('overclock')) base.pulseCooldown -= 0.15;
    if (abilities.has('field-medic')) base.staminaRegen += 2;
    if (abilities.has('salvage-eye')) base.upgradeDiscount += 0.1;
    if (abilities.has('water-stride')) base.waterSpeed += 0.08;

    base.moveSpeed = round(clamp(base.moveSpeed, 1, 2.4));
    base.jump = round(clamp(base.jump, 1, 1.8));
    base.scanRange = Math.round(clamp(base.scanRange, 40, 160));
    base.pulseCooldown = round(clamp(base.pulseCooldown, 1.2, 6));
    base.maxStamina = Math.round(clamp(base.maxStamina, 60, 500));
    base.staminaRegen = round(clamp(base.staminaRegen, 6, 60));
    base.waterSpeed = round(clamp(base.waterSpeed, 0.6, 1.6));
    base.resourceYield = round(clamp(base.resourceYield, 1, 3));
    base.resourceFlat = Math.round(clamp(base.resourceFlat, 0, 10));
    base.xpBonus = round(clamp(base.xpBonus, 1, 3));
    base.upgradeDiscount = round(clamp(base.upgradeDiscount, 0, 0.65));
    base.powerScore = Math.round(
      this.profileData.level * 10 +
        spent * 4 +
        this.profileData.equipment.reduce((sum, item) => sum + item.level * 3, 0) +
        abilities.size * 5,
    );
    return base;
  }

  abilitySet(): Set<AbilityId> {
    const unlocked = new Set<AbilityId>();
    for (const skill of SKILLS) {
      if (!skill.ability) continue;
      const rank = this.profileData.skills[skill.id] ?? 0;
      if (rank >= (skill.abilityRank ?? 1)) unlocked.add(skill.ability);
    }
    return unlocked;
  }

  hasAbility(id: AbilityId): boolean {
    return this.abilitySet().has(id);
  }

  scanSampleId(kind: string): ResourceId | null {
    return this.hasAbility('scan-sample') ? SAMPLE_RESOURCES[kind] ?? null : null;
  }

  resourceAmount(id: ResourceId): number {
    return this.profileData.resources[id] ?? 0;
  }

  canAfford(cost: Partial<Record<ResourceId, number>>): boolean {
    return Object.entries(cost).every(([id, amount]) => this.resourceAmount(id as ResourceId) >= (amount ?? 0));
  }

  effectiveUpgradeCost(itemId: string): Partial<Record<ResourceId, number>> {
    const definition = EQUIPMENT_BY_ID[itemId];
    const owned = this.ownedEquipment(itemId);
    if (!definition || !owned) return {};
    const step = definition.upgradeCosts[owned.level];
    if (!step) return {};
    const discount = this.stats.upgradeDiscount;
    const cost: Partial<Record<ResourceId, number>> = {};
    for (const [id, amount] of Object.entries(step)) {
      cost[id as ResourceId] = Math.max(1, Math.ceil((amount ?? 0) * (1 - discount)));
    }
    return cost;
  }

  view(): ProgressionView {
    const stats = this.stats;
    const categories = SKILL_CATEGORIES.map((category) => ({
      id: category.id,
      label: category.label,
      description: category.description,
      skills: SKILLS.filter((skill) => skill.category === category.id).map((skill) => this.skillView(skill.id)),
    }));
    const equipment = this.profileData.equipment
      .map((owned) => this.equipmentView(owned.id))
      .filter((entry): entry is EquipmentView => Boolean(entry));
    const byId = new Map(equipment.map((entry) => [entry.id, entry]));
    const loadout: LoadoutView[] = EQUIPMENT_SLOTS.map((slot) => {
      const id = this.profileData.equipped[slot.id];
      return { slot: slot.id, slotLabel: slot.label, item: id ? byId.get(id) ?? null : null };
    });
    const recipes: RecipeView[] = Object.values(EQUIPMENT_BY_ID)
      .filter((definition) => definition.recipe && !this.ownedEquipment(definition.id))
      .map((definition) => this.recipeView(definition));
    return {
      level: this.profileData.level,
      xp: this.profileData.xp,
      xpToNext: xpToNext(this.profileData.level),
      skillPoints: stats.skillPoints,
      totalSkillPoints: stats.totalSkillPoints,
      spentSkillPoints: stats.spentSkillPoints,
      stats,
      categories,
      abilities: this.abilityViews(),
      equipment,
      loadout,
      recipes,
      resources: this.resourceViews(),
      statistics: copy(this.profileData.statistics),
      powerScore: stats.powerScore,
      savedAt: this.profileData.updatedAt,
    };
  }

  async load(): Promise<ProgressionResult> {
    try {
      const raw = await this.persistence.load();
      if (raw == null) {
        this.loadedOnce = true;
        this.emit('loaded', { ok: true, repaired: false });
        return { ok: true, message: 'New expedition profile' };
      }
      const result = validateProfile(raw, this.now());
      this.profileData = result.profile;
      this.lastError = null;
      this.loadedOnce = true;
      this.emit('loaded', { ok: true, repaired: result.repaired });
      this.emit('change', { profile: this.profileData, stats: this.stats });
      return {
        ok: true,
        message: result.repaired ? 'Profile recovered and validated' : 'Profile loaded',
      };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.profileData = blankProfile(this.now());
      this.loadedOnce = true;
      this.emit('loaded', { ok: false, repaired: true, error: this.lastError });
      this.emit('change', { profile: this.profileData, stats: this.stats });
      return { ok: false, message: `Could not load progression: ${this.lastError}` };
    }
  }

  async save(): Promise<boolean> {
    if (this.saving) {
      this.queuedSave = true;
      return this.saving;
    }
    this.saving = (async () => {
      try {
        await this.persistence.save(copy(this.profileData));
        this.emit('saved', { ok: true });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.lastError = message;
        this.emit('saved', { ok: false, error: message });
        return false;
      } finally {
        this.saving = null;
        if (this.queuedSave) {
          this.queuedSave = false;
          void this.save();
        }
      }
    })();
    return this.saving;
  }

  async flushSave(): Promise<boolean> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    return this.save();
  }

  async reset(): Promise<void> {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.saving) await this.saving;
    this.queuedSave = false;
    this.profileData = blankProfile(this.now());
    this.emit('change', { profile: this.profileData, stats: this.stats });
    try {
      await this.persistence.clear();
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
    }
    await this.save();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    // Let an in-flight IndexedDB transaction finish before closing the
    // connection; closing immediately can abort the final save.
    const close = (): void => this.persistence.close?.();
    if (!this.saving) {
      close();
      return;
    }
    void (async () => {
      while (this.saving) {
        try {
          await this.saving;
        } catch {
          // save() already reports its own failure; keep draining queued saves.
        }
      }
      close();
    })();
  }

  grantXp(base: number): ProgressionResult {
    const gained = this.gainXp(base);
    this.commit();
    this.emitLevelUps(gained.levels);
    return {
      ok: gained.amount > 0,
      message: `+${gained.amount} XP`,
      levels: gained.levels,
    };
  }

  addResource(id: ResourceId, amount: number, countStatistic = true): ProgressionResult {
    if (!RESOURCES[id] || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: 'Unknown resource' };
    }
    const total = Math.max(0, Math.min(1_000_000, Math.floor(this.resourceAmount(id) + amount)));
    this.profileData.resources[id] = total;
    if (countStatistic) this.profileData.statistics.resources += Math.floor(amount);
    this.commit();
    this.emit('resourceGained', { id, amount: Math.floor(amount), total });
    return { ok: true, message: `+${Math.floor(amount)} ${RESOURCES[id].name}` };
  }

  collectNode(nodeId: string): ProgressionResult {
    const node = RESOURCE_NODE_BY_ID[nodeId];
    if (!node) return { ok: false, message: 'Unknown resource node' };
    if (this.profileData.gatheredNodes.includes(nodeId)) {
      return { ok: false, message: 'This cache has already been gathered' };
    }
    const amount = Math.max(1, Math.round(node.amount * this.stats.resourceYield + this.stats.resourceFlat));
    const total = Math.max(0, Math.min(1_000_000, this.resourceAmount(node.type) + amount));
    this.profileData.resources[node.type] = total;
    this.profileData.gatheredNodes.push(nodeId);
    this.profileData.statistics.resources += amount;
    const gained = this.gainXp(XP_SOURCES.resource);
    this.commit();
    this.emitLevelUps(gained.levels);
    this.emit('resourceGained', { id: node.type, amount, total });
    return { ok: true, message: `+${amount} ${RESOURCES[node.type].name} · +${gained.amount} XP` };
  }

  unlockSkill(id: string): ProgressionResult {
    const skill = SKILL_BY_ID[id];
    if (!skill) return { ok: false, message: 'Unknown skill' };
    const rank = this.profileData.skills[id] ?? 0;
    if (rank >= skill.maxRank) return { ok: false, message: `${skill.name} is already mastered` };
    if (skill.requires && (this.profileData.skills[skill.requires.skill] ?? 0) < skill.requires.rank) {
      const required = SKILL_BY_ID[skill.requires.skill];
      return { ok: false, message: `Requires ${required?.name ?? skill.requires.skill} rank ${skill.requires.rank}` };
    }
    if (this.stats.skillPoints < skill.costPerRank) {
      return { ok: false, message: `Need ${skill.costPerRank} skill points` };
    }
    const existing = new Set(this.abilitySet());
    this.profileData.skills[id] = rank + 1;
    this.profileData.statistics.skillsLearned += 1;
    this.commit();
    this.emit('skillUnlocked', { id, name: skill.name, rank: rank + 1 });
    for (const unlocked of this.abilitySet()) {
      if (existing.has(unlocked)) continue;
      const ability = ABILITIES[unlocked];
      this.emit('abilityUnlocked', { id: unlocked, name: ability?.name ?? unlocked });
    }
    return { ok: true, message: `${skill.name} · rank ${rank + 1}` };
  }

  equipItem(id: string): ProgressionResult {
    const owned = this.ownedEquipment(id);
    const definition = EQUIPMENT_BY_ID[id];
    if (!owned || !definition) return { ok: false, message: 'You do not own that equipment' };
    if (this.profileData.equipped[definition.slot] === id) {
      return { ok: false, message: `${definition.name} is already equipped` };
    }
    this.profileData.equipped[definition.slot] = id;
    this.commit();
    this.emit('equipmentChanged', { id, action: 'equip' });
    return { ok: true, message: `Equipped ${definition.name}` };
  }

  unequipItem(slot: EquipmentSlot): ProgressionResult {
    const id = this.profileData.equipped[slot];
    if (!id) return { ok: false, message: 'That slot is already empty' };
    delete this.profileData.equipped[slot];
    this.commit();
    this.emit('equipmentChanged', { id, action: 'unequip' });
    return { ok: true, message: `Unequipped ${EQUIPMENT_BY_ID[id]?.name ?? id}` };
  }

  upgradeEquipment(id: string): ProgressionResult {
    const owned = this.ownedEquipment(id);
    const definition = EQUIPMENT_BY_ID[id];
    if (!owned || !definition) return { ok: false, message: 'You do not own that equipment' };
    if (owned.level >= MAX_EQUIPMENT_LEVEL) return { ok: false, message: `${definition.name} is fully upgraded` };
    const cost = this.effectiveUpgradeCost(id);
    if (!this.canAfford(cost)) {
      return { ok: false, message: `Need ${this.costText(cost)}` };
    }
    for (const [resource, amount] of Object.entries(cost)) {
      const remaining = this.resourceAmount(resource as ResourceId) - (amount ?? 0);
      if (remaining <= 0) delete this.profileData.resources[resource as ResourceId];
      else this.profileData.resources[resource as ResourceId] = remaining;
    }
    owned.level += 1;
    this.profileData.statistics.equipmentUpgrades += 1;
    const gained = this.gainXp(XP_SOURCES.equipmentUpgrade);
    this.commit();
    this.emitLevelUps(gained.levels);
    this.emit('equipmentChanged', { id, action: 'upgrade' });
    return { ok: true, message: `${definition.name} upgraded to level ${owned.level}` };
  }

  craftEquipment(id: string): ProgressionResult {
    const definition = EQUIPMENT_BY_ID[id];
    if (!definition) return { ok: false, message: 'Unknown blueprint' };
    if (!definition.recipe) return { ok: false, message: 'That item cannot be crafted' };
    if (this.ownedEquipment(id)) return { ok: false, message: `${definition.name} is already owned` };
    if (this.profileData.level < definition.recipe.level) {
      return { ok: false, message: `Requires level ${definition.recipe.level}` };
    }
    if (!this.canAfford(definition.recipe.resources)) {
      return { ok: false, message: `Need ${this.costText(definition.recipe.resources)}` };
    }
    for (const [resource, amount] of Object.entries(definition.recipe.resources)) {
      const remaining = this.resourceAmount(resource as ResourceId) - (amount ?? 0);
      if (remaining <= 0) delete this.profileData.resources[resource as ResourceId];
      else this.profileData.resources[resource as ResourceId] = remaining;
    }
    const owned: OwnedEquipment = { id, level: 0 };
    this.profileData.equipment.push(owned);
    const gained = this.gainXp(XP_SOURCES.craft);
    this.commit();
    this.emitLevelUps(gained.levels);
    this.emit('equipmentChanged', { id, action: 'craft' });
    return { ok: true, message: `Crafted ${definition.name}` };
  }

  awardShard(id: string): ProgressionResult {
    if (!SHARD_IDS.has(id)) return { ok: false, message: 'Unknown memory shard' };
    if (this.profileData.collectedShards.includes(id)) return { ok: false, message: 'Shard already collected' };
    this.profileData.collectedShards.push(id);
    this.profileData.statistics.shards += 1;
    const gained = this.gainXp(XP_SOURCES.shard);
    this.commit();
    this.emitLevelUps(gained.levels);
    return { ok: true, message: `+${gained.amount} XP · memory shard`, levels: gained.levels };
  }

  recordScan(kind: string): { result: ProgressionResult; first: boolean } {
    const first = SCAN_SPECIES.has(kind) && !this.profileData.scannedSpecies.includes(kind);
    if (first && SCAN_SPECIES.has(kind)) this.profileData.scannedSpecies.push(kind);
    this.profileData.statistics.scans += 1;
    const gained = first ? this.gainXp(XP_SOURCES.scan) : { amount: 0, levels: 0 };
    this.commit();
    if (first) this.emitLevelUps(gained.levels);
    return {
      first,
      result: {
        ok: true,
        message: first ? `New species catalogued · +${gained.amount} XP` : 'Scan recorded',
        levels: gained.levels,
      },
    };
  }

  awardPuzzle(id: string): ProgressionResult {
    if (!PUZZLES[id]) return { ok: false, message: 'Unknown puzzle' };
    if (this.profileData.solvedPuzzles.includes(id)) return { ok: false, message: 'Puzzle already solved' };
    this.profileData.solvedPuzzles.push(id);
    this.profileData.statistics.puzzles += 1;
    const gained = this.gainXp(XP_SOURCES.puzzle);
    this.commit();
    this.emitLevelUps(gained.levels);
    return { ok: true, message: `+${gained.amount} XP · puzzle solved`, levels: gained.levels };
  }

  awardMission(id: string, marks = 0): ProgressionResult {
    if (!MISSION_IDS.has(id)) return { ok: false, message: 'Unknown mission' };
    if (this.profileData.completedMissions.includes(id)) return { ok: false, message: 'Mission already complete' };
    this.profileData.completedMissions.push(id);
    this.profileData.statistics.missions += 1;
    const gained = this.gainXp(XP_SOURCES.mission + Math.max(0, marks) * 2);
    this.commit();
    this.emitLevelUps(gained.levels);
    return { ok: true, message: `+${gained.amount} XP · mission complete`, levels: gained.levels };
  }

  awardMemory(id: string): ProgressionResult {
    if (!MEMORIES[id]) return { ok: false, message: 'Unknown memory' };
    if (this.profileData.readMemories.includes(id)) return { ok: false, message: 'Memory already read' };
    this.profileData.readMemories.push(id);
    this.profileData.statistics.memories += 1;
    const gained = this.gainXp(XP_SOURCES.memory);
    this.commit();
    this.emitLevelUps(gained.levels);
    return { ok: true, message: `+${gained.amount} XP · memory recovered`, levels: gained.levels };
  }

  awardEnding(id: string): ProgressionResult {
    if (!ENDINGS[id]) return { ok: false, message: 'Unknown ending' };
    if (this.profileData.endings.includes(id)) return { ok: false, message: 'Ending already recorded' };
    this.profileData.endings.push(id);
    const gained = this.gainXp(XP_SOURCES.ending);
    this.commit();
    this.emitLevelUps(gained.levels);
    return { ok: true, message: `+${gained.amount} XP · ending recorded`, levels: gained.levels };
  }

  recordTravel(distance: number, seconds: number): void {
    if (!Number.isFinite(distance) || distance < 0) return;
    if (distance > 0) {
      this.profileData.statistics.distanceTravelled = Math.min(
        50_000_000,
        this.profileData.statistics.distanceTravelled + distance,
      );
    }
    if (Number.isFinite(seconds) && seconds > 0) {
      this.profileData.statistics.playTime = Math.min(50_000_000, this.profileData.statistics.playTime + seconds);
    }
    this.commit();
  }

  private ownedEquipment(id: string): OwnedEquipment | undefined {
    return this.profileData.equipment.find((entry) => entry.id === id);
  }

  private gainXp(base: number): { amount: number; levels: number } {
    if (!Number.isFinite(base) || base <= 0) return { amount: 0, levels: 0 };
    const amount = Math.max(0, Math.round(base * this.stats.xpBonus));
    if (amount <= 0) return { amount: 0, levels: 0 };
    this.profileData.statistics.xpEarned += amount;
    let levels = 0;
    if (this.profileData.level < MAX_LEVEL) {
      this.profileData.xp += amount;
      while (this.profileData.level < MAX_LEVEL) {
        const needed = xpToNext(this.profileData.level);
        if (needed <= 0 || this.profileData.xp < needed) break;
        this.profileData.xp -= needed;
        this.profileData.level += 1;
        levels += 1;
      }
      if (this.profileData.level >= MAX_LEVEL) this.profileData.xp = 0;
    }
    return { amount, levels };
  }

  private commit(): void {
    this.profileData.updatedAt = this.now();
    this.emit('change', { profile: this.profileData, stats: this.stats });
    this.scheduleSave();
  }

  private emitLevelUps(levels: number): void {
    if (levels <= 0) return;
    const finalLevel = this.profileData.level;
    const first = finalLevel - levels + 1;
    for (let level = first; level <= finalLevel; level += 1) {
      this.emit('levelUp', {
        level,
        gained: levels,
        skillPoints: totalSkillPointsForLevel(level) - this.stats.spentSkillPoints,
      });
    }
  }

  private scheduleSave(): void {
    if (!this.autoSave) return;
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, this.saveDelayMs);
  }

  private skillView(id: string): SkillView {
    const skill = SKILL_BY_ID[id];
    const rank = this.profileData.skills[id] ?? 0;
    const prerequisiteMet =
      !skill.requires || (this.profileData.skills[skill.requires.skill] ?? 0) >= skill.requires.rank;
    const mastered = rank >= skill.maxRank;
    const points = this.stats.skillPoints;
    const canUnlock = !mastered && prerequisiteMet && points >= skill.costPerRank;
    const ability = skill.ability ? ABILITIES[skill.ability] : undefined;
    return {
      id: skill.id,
      category: skill.category,
      categoryLabel: categoryLabel(skill.category),
      tier: skill.tier,
      name: skill.name,
      description: skill.description,
      effectText: skill.effectText,
      rank,
      maxRank: skill.maxRank,
      cost: skill.costPerRank,
      unlocked: rank > 0,
      canUnlock,
      buttonLabel: mastered
        ? 'Mastered'
        : !prerequisiteMet
          ? 'Locked'
          : points < skill.costPerRank
            ? `Need ${skill.costPerRank} SP`
            : rank === 0
              ? `Learn · ${skill.costPerRank} SP`
              : `Rank ${rank + 1} · ${skill.costPerRank} SP`,
      prerequisiteText: skill.requires
        ? `${SKILL_BY_ID[skill.requires.skill]?.name ?? skill.requires.skill} · rank ${skill.requires.rank}`
        : 'No prerequisite',
      abilityName: ability ? `${ability.name} · rank ${skill.abilityRank ?? 1}` : null,
    };
  }

  private abilityViews(): AbilityView[] {
    const unlocked = this.abilitySet();
    return (Object.keys(ABILITIES) as AbilityId[]).map((id) => {
      const definition = ABILITIES[id];
      return {
        id,
        name: definition.name,
        description: definition.description,
        glyph: definition.glyph,
        source: definition.source,
        unlocked: unlocked.has(id),
      };
    });
  }

  private equipmentView(id: string): EquipmentView | null {
    const definition = EQUIPMENT_BY_ID[id];
    const owned = this.ownedEquipment(id);
    if (!definition || !owned) return null;
    const cost = this.effectiveUpgradeCost(id);
    const maxed = owned.level >= MAX_EQUIPMENT_LEVEL;
    const canUpgrade = !maxed && this.canAfford(cost);
    return {
      id,
      slot: definition.slot,
      slotLabel: SLOT_LABELS[definition.slot],
      name: definition.name,
      tier: definition.tier,
      description: definition.description,
      level: owned.level,
      maxLevel: MAX_EQUIPMENT_LEVEL,
      equipped: this.profileData.equipped[definition.slot] === id,
      statsText: this.equipmentStatsText(definition, owned.level),
      nextStatsText: maxed ? 'Maximum level reached' : this.equipmentStatsText(definition, owned.level + 1),
      upgradeCostText: maxed ? '—' : this.costText(cost),
      canUpgrade,
      upgradeReason: maxed
        ? 'Fully upgraded'
        : canUpgrade
          ? 'Ready to upgrade'
          : `Missing ${this.costText(this.missingCost(cost))}`,
    };
  }

  private recipeView(definition: EquipmentDefinition): RecipeView {
    const recipe = definition.recipe;
    if (!recipe) {
      return {
        id: definition.id,
        name: definition.name,
        slotLabel: SLOT_LABELS[definition.slot],
        description: definition.description,
        costText: '—',
        levelRequirement: 1,
        canCraft: false,
        reason: 'No blueprint',
      };
    }
    const levelMet = this.profileData.level >= recipe.level;
    const affordable = this.canAfford(recipe.resources);
    return {
      id: definition.id,
      name: definition.name,
      slotLabel: SLOT_LABELS[definition.slot],
      description: definition.description,
      costText: this.costText(recipe.resources),
      levelRequirement: recipe.level,
      canCraft: levelMet && affordable,
      reason: !levelMet ? `Requires level ${recipe.level}` : affordable ? 'Craftable' : `Missing ${this.costText(this.missingCost(recipe.resources))}`,
    };
  }

  private resourceViews(): ResourceView[] {
    return RESOURCE_LIST.map((definition) => ({
      id: definition.id,
      name: definition.name,
      description: definition.description,
      glyph: definition.glyph,
      color: definition.color,
      amount: this.resourceAmount(definition.id),
    }));
  }

  private equipmentStatsText(definition: EquipmentDefinition, level: number): string {
    const entries = Object.entries(definition.stats)
      .map(([key, entry]) => {
        if (!entry) return null;
        const value = entry.base + entry.perLevel * level;
        if (Math.abs(value) < 0.0005) return null;
        return this.formatItemStat(key as StatKey, value);
      })
      .filter((entry): entry is string => Boolean(entry));
    return entries.length > 0 ? entries.join(' · ') : 'No stat bonuses';
  }

  private formatItemStat(key: StatKey, value: number): string {
    const sign = value >= 0 ? '+' : '−';
    const abs = Math.abs(value);
    if (key === 'scanRange') return `${sign}${Math.round(abs)} m scan range`;
    if (key === 'pulseCooldown') return `${sign}${round(abs, 2)} s pulse cooldown`;
    if (key === 'maxStamina') return `${sign}${Math.round(abs)} stamina`;
    if (key === 'staminaRegen') return `${sign}${round(abs, 1)} stamina/s`;
    if (key === 'resourceFlat') return `${sign}${Math.round(abs)} bonus resource`;
    if (key === 'upgradeDiscount') return `${sign}${Math.round(abs * 100)}% upgrade discount`;
    return `${sign}${Math.round(abs * 100)}% ${statLabel(key).toLowerCase()}`;
  }

  private costText(cost: Partial<Record<ResourceId, number>>): string {
    const entries = Object.entries(cost)
      .filter(([, amount]) => (amount ?? 0) > 0)
      .map(([id, amount]) => `${amount} ${RESOURCES[id as ResourceId]?.name ?? id}`);
    return entries.length > 0 ? entries.join(' · ') : 'Nothing';
  }

  private missingCost(cost: Partial<Record<ResourceId, number>>): Partial<Record<ResourceId, number>> {
    const missing: Partial<Record<ResourceId, number>> = {};
    for (const [id, amount] of Object.entries(cost)) {
      const lacking = (amount ?? 0) - this.resourceAmount(id as ResourceId);
      if (lacking > 0) missing[id as ResourceId] = lacking;
    }
    return missing;
  }
}

export { blankProfile, validateProfile };
export type { PlayerStatistics };
