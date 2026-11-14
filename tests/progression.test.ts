import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { ProgressionSystem } from '../src/game/progression/ProgressionSystem';
import { MemoryProgressionStore, IndexedDBProgressionStore } from '../src/game/progression/store';
import { validateProfile, blankProfile } from '../src/game/progression/validation';
import {
  ABILITIES,
  EQUIPMENT_BY_ID,
  MAX_LEVEL,
  RESOURCE_NODES,
  SKILLS,
  SKILL_BY_ID,
  SKILL_CATEGORIES,
  XP_SOURCES,
  xpToNext,
} from '../src/game/progression/content';

const make = () => new ProgressionSystem({ persistence: new MemoryProgressionStore(), autoSave: false, now: () => 1_700_000_000_000 });

describe('progression content', () => {
  it('ships five disciplines, fifteen skills, nine abilities and eight items', () => {
    expect(SKILL_CATEGORIES).toHaveLength(5);
    expect(SKILLS).toHaveLength(15);
    expect(Object.keys(ABILITIES)).toHaveLength(9);
    expect(Object.keys(EQUIPMENT_BY_ID)).toHaveLength(8);
    expect(RESOURCE_NODES).toHaveLength(20);
    expect(XP_SOURCES.shard).toBeGreaterThan(0);
    for (const skill of SKILLS) {
      expect(SKILL_CATEGORIES.some((category) => category.id === skill.category)).toBe(true);
      if (skill.requires) {
        const required = SKILL_BY_ID[skill.requires.skill];
        expect(required).toBeTruthy();
        expect(skill.requires.rank).toBeLessThanOrEqual(required.maxRank);
      }
      if (skill.ability) expect(ABILITIES[skill.ability]).toBeTruthy();
    }
    expect(new Set(SKILLS.map((skill) => skill.id)).size).toBe(SKILLS.length);
    expect(new Set(RESOURCE_NODES.map((node) => node.id)).size).toBe(RESOURCE_NODES.length);
    const granted = new Set(SKILLS.map((skill) => skill.ability).filter(Boolean));
    expect(granted.size).toBe(Object.keys(ABILITIES).length);
    for (const ability of Object.values(ABILITIES)) expect(ability.description.length).toBeGreaterThan(12);
  });
});

describe('ProgressionSystem — experience and levels', () => {
  it('awards experience, levels up and grants skill points', () => {
    const progression = make();
    const levels: number[] = [];
    progression.on('levelUp', ({ level }) => levels.push(level));
    const result = progression.grantXp(100);
    expect(result.ok).toBe(true);
    expect(result.levels).toBe(1);
    expect(progression.profile.level).toBe(2);
    expect(progression.profile.xp).toBe(Math.round(100 * progression.stats.xpBonus) - 100);
    expect(progression.stats.totalSkillPoints).toBe(4);
    expect(progression.stats.skillPoints).toBe(4);
    expect(levels).toEqual([2]);
  });

  it('carries experience into the next level and reports multiple levels', () => {
    const progression = make();
    const base = xpToNext(1) + xpToNext(2) + 25;
    const result = progression.grantXp(base);
    const awarded = Math.round(base * progression.stats.xpBonus);
    expect(result.levels).toBe(2);
    expect(progression.profile.level).toBe(3);
    expect(progression.profile.xp).toBe(awarded - xpToNext(1) - xpToNext(2));
  });

  it('caps at MAX_LEVEL and never exceeds it', () => {
    const progression = make();
    progression.grantXp(100_000);
    expect(progression.profile.level).toBe(MAX_LEVEL);
    expect(progression.profile.xp).toBe(0);
    expect(progression.stats.xpToNext).toBe(0);
    const before = progression.profile.level;
    progression.grantXp(1_000);
    expect(progression.profile.level).toBe(before);
  });

  it('applies the experience multiplier from gear and skills', () => {
    const progression = make();
    const base = progression.stats.xpBonus;
    expect(base).toBeGreaterThan(1);
    const result = progression.grantXp(100);
    expect(result.message).toBe(`+${Math.round(100 * base)} XP`);
  });
});

describe('ProgressionSystem — skills and abilities', () => {
  it('enforces prerequisites and skill-point cost', () => {
    const progression = make();
    const tierTwo = SKILL_BY_ID['ruin-lore'];
    expect(tierTwo.requires?.skill).toBe('field-survey');
    const locked = progression.unlockSkill('ruin-lore');
    expect(locked.ok).toBe(false);
    expect(locked.message).toContain('Requires');

    expect(progression.unlockSkill('field-survey').ok).toBe(true);
    expect(progression.unlockSkill('ruin-lore').ok).toBe(true);
    expect(progression.profile.skills['field-survey']).toBe(1);
    expect(progression.profile.skills['ruin-lore']).toBe(1);
  });

  it('unlocks abilities at the correct rank and exposes them in the view', () => {
    const progression = make();
    progression.grantXp(500);
    const events: string[] = [];
    progression.on('abilityUnlocked', ({ id }) => events.push(id));
    progression.unlockSkill('field-survey');
    expect(progression.hasAbility('survey-instinct')).toBe(true);
    expect(events).toContain('survey-instinct');
    const view = progression.view();
    const ability = view.abilities.find((entry) => entry.id === 'survey-instinct');
    expect(ability?.unlocked).toBe(true);
  });

  it('changes derived stats when skills are learned', () => {
    const progression = make();
    progression.grantXp(500);
    const before = progression.stats.resourceYield;
    progression.unlockSkill('field-survey');
    expect(progression.stats.resourceYield).toBeGreaterThan(before);

    const stamina = progression.stats.maxStamina;
    progression.unlockSkill('hardy');
    expect(progression.stats.maxStamina).toBeGreaterThan(stamina);
  });

  it('spends skill points and cannot overspend', () => {
    const progression = make();
    progression.grantXp(100); // level 2, 4 points
    expect(progression.stats.skillPoints).toBe(4);
    expect(progression.unlockSkill('field-survey').ok).toBe(true);
    expect(progression.stats.skillPoints).toBe(3);
    // field-survey max rank 3, costs 1 each
    expect(progression.unlockSkill('field-survey').ok).toBe(true);
    expect(progression.unlockSkill('field-survey').ok).toBe(true);
    expect(progression.stats.skillPoints).toBe(1);
    expect(progression.unlockSkill('field-survey').ok).toBe(false);
    expect(progression.stats.skillPoints).toBe(1);
  });

  it('exposes actionable locked/unlocked button states', () => {
    const progression = make();
    const view = progression.view();
    const flat = view.categories.flatMap((category) => category.skills);
    const field = flat.find((skill) => skill.id === 'field-survey');
    expect(field?.canUnlock).toBe(true);
    expect(field?.buttonLabel).toContain('SP');
    // Spend both starting points, then the same card must switch to "Need N SP".
    progression.unlockSkill('field-survey');
    progression.unlockSkill('field-survey');
    const spent = progression.view().categories.flatMap((c) => c.skills).find((s) => s.id === 'field-survey');
    expect(spent?.canUnlock).toBe(false);
    expect(spent?.buttonLabel).toContain('SP');
  });
});

describe('ProgressionSystem — resources, nodes and scans', () => {
  it('adds resources and gathers nodes only once', () => {
    const progression = make();
    const result = progression.collectNode('glass-plaza');
    expect(result.ok).toBe(true);
    expect(progression.resourceAmount('echo-glass')).toBeGreaterThan(0);
    const second = progression.collectNode('glass-plaza');
    expect(second.ok).toBe(false);
    expect(progression.profile.gatheredNodes).toContain('glass-plaza');
  });

  it('applies resource yield and cache-sense bonuses to node amounts', () => {
    const progression = make();
    progression.grantXp(500);
    progression.unlockSkill('field-survey');
    progression.unlockSkill('ruin-lore');
    progression.unlockSkill('ruin-lore');
    expect(progression.hasAbility('cache-sense')).toBe(true);
    const expected = Math.max(
      1,
      Math.round(2 * progression.stats.resourceYield + progression.stats.resourceFlat),
    );
    progression.collectNode('glass-plaza');
    expect(progression.resourceAmount('echo-glass')).toBe(expected);
  });

  it('awards scan XP only for the first sample of each species', () => {
    const progression = make();
    const first = progression.recordScan('scuttler');
    expect(first.first).toBe(true);
    expect(first.result.ok).toBe(true);
    const second = progression.recordScan('scuttler');
    expect(second.first).toBe(false);
    expect(progression.profile.statistics.scans).toBe(2);
    expect(progression.profile.scannedSpecies).toEqual(['scuttler']);
  });

  it('offers scan samples only after the scan-sample ability is unlocked', () => {
    const progression = make();
    expect(progression.scanSampleId('drifter')).toBeNull();
    progression.grantXp(500);
    progression.unlockSkill('optic-tuning');
    progression.unlockSkill('field-analysis');
    progression.unlockSkill('field-analysis');
    expect(progression.hasAbility('scan-sample')).toBe(true);
    expect(progression.scanSampleId('drifter')).toBe('bio-fiber');
  });
});

describe('ProgressionSystem — equipment', () => {
  it('upgrades starter equipment, spends resources and raises its stats', () => {
    const progression = make();
    progression.addResource('ferro-scrap', 20);
    progression.addResource('echo-glass', 20);
    const before = progression.stats.moveSpeed;
    const result = progression.upgradeEquipment('trail-staff');
    expect(result.ok).toBe(true);
    expect(progression.profile.equipment.find((entry) => entry.id === 'trail-staff')?.level).toBe(1);
    expect(progression.stats.moveSpeed).toBeGreaterThan(before);
    expect(progression.profile.statistics.equipmentUpgrades).toBe(1);
  });

  it('blocks upgrades when resources are missing', () => {
    const progression = make();
    const result = progression.upgradeEquipment('trail-staff');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Need');
    expect(progression.profile.equipment.find((entry) => entry.id === 'trail-staff')?.level).toBe(0);
  });

  it('equips and unequips owned items and updates derived stats', () => {
    const progression = make();
    progression.grantXp(1000);
    progression.addResource('ferro-scrap', 50);
    progression.addResource('bio-fiber', 50);
    const craft = progression.craftEquipment('deep-salvage-rig');
    expect(craft.ok).toBe(true);
    const before = progression.stats.resourceYield;
    const equip = progression.equipItem('deep-salvage-rig');
    expect(equip.ok).toBe(true);
    expect(progression.stats.resourceYield).toBeGreaterThan(before);
    expect(progression.unequipItem('rig').ok).toBe(true);
    expect(progression.profile.equipped.rig).toBeUndefined();
  });

  it('requires the recipe level and resources to craft', () => {
    const progression = make();
    progression.addResource('ferro-scrap', 50);
    progression.addResource('bio-fiber', 50);
    expect(progression.craftEquipment('deep-salvage-rig').ok).toBe(false);
    progression.grantXp(1000);
    expect(progression.craftEquipment('deep-salvage-rig').ok).toBe(true);
  });

  it('discounts upgrade costs with technology skills and reports the discount', () => {
    const progression = make();
    progression.grantXp(1000);
    progression.unlockSkill('capacitor');
    progression.unlockSkill('lattice-decipher');
    progression.unlockSkill('lattice-decipher');
    progression.unlockSkill('salvage-master');
    expect(progression.stats.upgradeDiscount).toBeGreaterThan(0.15);
    progression.addResource('bio-fiber', 50);
    progression.addResource('ferro-scrap', 50);
    expect(progression.upgradeEquipment('canvas-coat').ok).toBe(true);
    const cost = progression.effectiveUpgradeCost('canvas-coat');
    expect(cost['bio-fiber']).toBeLessThan(EQUIPMENT_BY_ID['canvas-coat'].upgradeCosts[1]['bio-fiber']!);
    expect(progression.view().equipment.find((entry) => entry.id === 'canvas-coat')?.upgradeCostText).not.toBe('—');
  });

  it('exposes loadout slots and recipe cards', () => {
    const progression = make();
    const view = progression.view();
    expect(view.loadout).toHaveLength(4);
    expect(view.loadout.every((slot) => slot.item)).toBe(true);
    expect(view.recipes.length).toBeGreaterThanOrEqual(4);
    expect(view.recipes.find((recipe) => recipe.id === 'deep-salvage-rig')?.canCraft).toBe(false);
  });
});

describe('ProgressionSystem — save and load', () => {
  it('round-trips a profile through persistence', async () => {
    const store = new MemoryProgressionStore();
    const first = new ProgressionSystem({ persistence: store, autoSave: false, now: () => 1_700_000_000_000 });
    first.grantXp(500);
    first.unlockSkill('field-survey');
    first.addResource('echo-glass', 7);
    first.addResource('ferro-scrap', 9);
    first.collectNode('glass-plaza');
    first.recordScan('drifter');
    expect(first.upgradeEquipment('trail-staff').ok).toBe(true);
    first.awardShard('shard_plaza');
    first.recordTravel(12.5, 4);
    expect(await first.flushSave()).toBe(true);

    const second = new ProgressionSystem({ persistence: store, autoSave: false });
    const loaded = await second.load();
    expect(loaded.ok).toBe(true);
    expect(second.profile.level).toBe(first.profile.level);
    expect(second.profile.skills['field-survey']).toBe(1);
    expect(second.resourceAmount('echo-glass')).toBe(first.resourceAmount('echo-glass'));
    expect(second.profile.scannedSpecies).toEqual(['drifter']);
    expect(second.profile.equipment.find((entry) => entry.id === 'trail-staff')?.level).toBe(1);
    expect(second.profile.gatheredNodes).toEqual(['glass-plaza']);
    expect(second.profile.collectedShards).toEqual(['shard_plaza']);
    expect(second.profile.statistics.distanceTravelled).toBe(12.5);
    expect(second.profile.statistics.equipmentUpgrades).toBe(1);
    expect(await second.flushSave()).toBe(true);
  });

  it('drains the final save before closing IndexedDB', async () => {
    const store = new IndexedDBProgressionStore();
    await store.clear();
    const first = new ProgressionSystem({ persistence: store, autoSave: false });
    expect((await first.load()).ok).toBe(true);
    first.grantXp(260);
    first.addResource('ferro-scrap', 4);
    const pending = first.flushSave();
    first.dispose();
    expect(await pending).toBe(true);

    const secondStore = new IndexedDBProgressionStore();
    const second = new ProgressionSystem({ persistence: secondStore, autoSave: false });
    expect((await second.load()).ok).toBe(true);
    expect(second.profile.level).toBe(first.profile.level);
    expect(second.resourceAmount('ferro-scrap')).toBe(4);
    await secondStore.clear();
    secondStore.close();
  });

  it('loads through IndexedDB, including a second load after save', async () => {
    const store = new IndexedDBProgressionStore();
    await store.clear();
    const first = new ProgressionSystem({ persistence: store, autoSave: false });
    first.grantXp(300);
    first.addResource('ferro-scrap', 11);
    expect(await first.flushSave()).toBe(true);
    store.close();

    const secondStore = new IndexedDBProgressionStore();
    const second = new ProgressionSystem({ persistence: secondStore, autoSave: false });
    expect((await second.load()).ok).toBe(true);
    expect(second.profile.level).toBe(first.profile.level);
    expect(second.resourceAmount('ferro-scrap')).toBe(11);
    await secondStore.clear();
    secondStore.close();
  });

  it('recovers from corrupt saved data and reports repair', async () => {
    const store = new MemoryProgressionStore();
    await store.save({
      version: 1,
      level: 999,
      xp: -20,
      skills: { 'wayfinder': 3, 'field-survey': 0, 'nonsense': 4 },
      equipment: [{ id: 'resonance-harness', level: 99 }, { id: 'fake-item', level: 2 }],
      equipped: { tool: 'resonance-harness', rig: 'fake-item' },
      resources: { 'echo-glass': -4, 'ferro-scrap': 2, 'unobtanium': 9 },
      gatheredNodes: ['glass-plaza', 'nonsense'],
      scannedSpecies: ['scuttler', 'unicorn'],
      solvedPuzzles: ['nonsense'],
      collectedShards: ['nonsense'],
      completedMissions: ['nonsense'],
      readMemories: ['nonsense'],
      endings: ['nonsense'],
      statistics: { shards: -2, scans: 'many' },
      createdAt: 1,
      updatedAt: 2,
    } as never);

    const progression = new ProgressionSystem({ persistence: store, autoSave: false });
    const result = await progression.load();
    expect(result.ok).toBe(true);
    expect(result.message).toContain('recovered');
    expect(progression.profile.level).toBe(MAX_LEVEL);
    expect(progression.profile.equipment.some((entry) => entry.id === 'fake-item')).toBe(false);
    expect(progression.profile.equipment.some((entry) => entry.id === 'resonance-harness')).toBe(true);
    expect(progression.profile.equipped.rig).toBeUndefined();
    expect(progression.profile.resources['echo-glass']).toBeUndefined();
    expect(progression.profile.resources['ferro-scrap']).toBe(2);
    expect(progression.profile.gatheredNodes).toEqual(['glass-plaza']);
    expect(progression.profile.scannedSpecies).toEqual(['scuttler']);
    expect(progression.profile.skills['wayfinder']).toBeUndefined();
    expect(progression.profile.skills['nonsense']).toBeUndefined();
    expect(progression.profile.statistics.shards).toBe(0);
    expect(progression.profile.statistics.scans).toBe(0);
  });

  it('resets to a fresh profile and clears the stored save', async () => {
    const store = new MemoryProgressionStore();
    const progression = new ProgressionSystem({ persistence: store, autoSave: false });
    progression.grantXp(500);
    progression.addResource('echo-glass', 5);
    await progression.flushSave();
    await progression.reset();
    expect(progression.profile.level).toBe(1);
    expect(progression.resourceAmount('echo-glass')).toBe(0);
    expect(store.clears).toBe(1);
    const fresh = new ProgressionSystem({ persistence: store, autoSave: false });
    expect((await fresh.load()).ok).toBe(true);
    expect(fresh.profile.level).toBe(1);
  });
});

describe('progression validation', () => {
  it('keeps a blank profile valid and idempotent', () => {
    const blank = blankProfile(1_700_000_000_000);
    const result = validateProfile(blank, 1_700_000_000_000);
    expect(result.repaired).toBe(false);
    expect(result.profile).toEqual(blank);
  });

  it('drops impossible skill ranks and respects the level point budget', () => {
    const raw = blankProfile(1);
    raw.level = 1;
    raw.skills = { 'field-survey': 3, 'ruin-lore': 3, 'wayfinder': 3 };
    const result = validateProfile(raw, 1);
    expect(result.profile.level).toBe(1);
    expect(result.profile.skills['field-survey']).toBe(2); // 2 SP at level 1
    expect(result.profile.skills['ruin-lore']).toBeUndefined();
    expect(result.profile.skills['wayfinder']).toBeUndefined();
    expect(result.repaired).toBe(true);
  });

  it('never leaves an equipped item that is not owned or does not fit its slot', () => {
    const raw = blankProfile(1);
    raw.equipment = [{ id: 'canvas-coat', level: 0 }];
    raw.equipped = { suit: 'canvas-coat', tool: 'trail-staff', rig: 'canvas-coat' };
    const result = validateProfile(raw, 1);
    expect(result.profile.equipped.suit).toBe('canvas-coat');
    expect(result.profile.equipped.tool).toBeUndefined();
    expect(result.profile.equipped.rig).toBeUndefined();
  });

  it('replaces invalid profiles with a starter profile', () => {
    const result = validateProfile('not a profile', 1);
    expect(result.repaired).toBe(true);
    expect(result.profile.level).toBe(1);
    expect(result.profile.equipment).toHaveLength(4);
  });
});
