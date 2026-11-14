// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressionSystem } from '../src/game/progression/ProgressionSystem';
import { MemoryProgressionStore } from '../src/game/progression/store';
import { SettingsStore } from '../src/game/core/settings';
import { UiRoot, type UiCallbacks } from '../src/ui/UiRoot';
import type { TouchCallbacks } from '../src/ui/screens/TouchControls';

function harness() {
  document.body.innerHTML = '<div id="ui-root"></div>';
  const root = document.getElementById('ui-root') as HTMLElement;
  const calls: string[] = [];
  const callbacks: UiCallbacks = {
    onPlay: () => {},
    onResume: () => {},
    onQuit: () => {},
    onRetry: () => {},
    onCharacterClose: () => calls.push('character-close'),
    onUnlockSkill: (id) => calls.push(`unlock:${id}`),
    onEquipItem: (id) => calls.push(`equip:${id}`),
    onUnequipItem: (slot) => calls.push(`unequip:${slot}`),
    onUpgradeItem: (id) => calls.push(`upgrade:${id}`),
    onCraftItem: (id) => calls.push(`craft:${id}`),
    onPauseCharacter: () => calls.push('pause-character'),
  };
  const touch: TouchCallbacks = {
    onMove: () => {},
    onLook: () => {},
    onJump: () => {},
    onSprint: () => {},
    onPulse: () => {},
    onScan: () => {},
    onPause: () => {},
  };
  const ui = new UiRoot(root, new SettingsStore(null), callbacks, touch);
  return { ui, root, calls };
}

function progression(): ProgressionSystem {
  return new ProgressionSystem({ persistence: new MemoryProgressionStore(), autoSave: false });
}

describe('character screen', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0));
  });

  it('renders every tab and routes skill unlocks through the callback', () => {
    const { ui, root, calls } = harness();
    const system = progression();
    system.grantXp(500);
    ui.showCharacter(system.view());
    expect(ui.hasTransientOverlay).toBe(true);
    expect(ui.characterOpen).toBe(true);

    const card = root.querySelector('.character__card') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.querySelectorAll('.character__tab')).toHaveLength(5);
    expect(card.textContent).toContain('Live attributes');
    expect(card.textContent).toContain('Exploration abilities');

    const skillsTab = [...card.querySelectorAll<HTMLButtonElement>('.character__tab')].find((tab) => tab.textContent?.includes('Skills'));
    expect(skillsTab).toBeTruthy();
    skillsTab!.click();
    expect(card.textContent).toContain('Field Survey');
    expect(card.textContent).toContain('Technology');
    const unlock = card.querySelector<HTMLButtonElement>('[data-skill="field-survey"]');
    expect(unlock?.disabled).toBe(false);
    unlock!.click();
    expect(calls).toContain('unlock:field-survey');
  });

  it('renders inventory recipes and equipment actions', () => {
    const { ui, root, calls } = harness();
    const system = progression();
    system.grantXp(1200);
    system.addResource('ferro-scrap', 40);
    system.addResource('bio-fiber', 40);
    system.addResource('echo-glass', 40);
    ui.showCharacter(system.view());
    const card = root.querySelector('.character__card') as HTMLElement;
    const tabs = [...card.querySelectorAll<HTMLButtonElement>('.character__tab')];
    tabs.find((tab) => tab.textContent?.includes('Inventory'))!.click();
    expect(card.textContent).toContain('Materials');
    expect(card.textContent).toContain('Deep Salvage Rig');
    const craft = card.querySelector<HTMLButtonElement>('[data-craft="deep-salvage-rig"]');
    expect(craft?.disabled).toBe(false);
    craft!.click();
    expect(calls).toContain('craft:deep-salvage-rig');

    tabs.find((tab) => tab.textContent?.includes('Equipment'))!.click();
    expect(card.textContent).toContain('Current loadout');
    const upgrade = card.querySelector<HTMLButtonElement>('[data-upgrade="trail-staff"]');
    expect(upgrade?.disabled).toBe(false);
    upgrade!.click();
    expect(calls).toContain('upgrade:trail-staff');
    const unequip = card.querySelector<HTMLButtonElement>('[data-unequip="tool"]');
    expect(unequip).toBeTruthy();
    unequip!.click();
    expect(calls).toContain('unequip:tool');

    tabs.find((tab) => tab.textContent?.includes('Statistics'))!.click();
    expect(card.textContent).toContain('Expedition statistics');
    expect(card.textContent).toContain('Distance travelled');
    expect(card.textContent).toContain('Category mastery');
  });

  it('shows level, experience and closes by button or backdrop', () => {
    const { ui, root, calls } = harness();
    const system = progression();
    system.grantXp(100);
    ui.showCharacter(system.view());
    const card = root.querySelector('.character__card') as HTMLElement;
    expect(card.textContent).toContain('Level 2 Field Record');
    expect(card.textContent).toContain('Skill points');

    (card.querySelector('.dialogue__close') as HTMLButtonElement).click();
    expect(calls).toContain('character-close');

    ui.hideCharacter();
    expect(ui.hasTransientOverlay).toBe(false);
    expect(ui.characterOpen).toBe(false);

    ui.showCharacter(system.view());
    (root.querySelector('.character .overlay__backdrop') as HTMLElement).click();
    expect(calls.filter((entry) => entry === 'character-close')).toHaveLength(2);
  });

  it('opens the field record from the pause screen', () => {
    const { ui, calls } = harness();
    ui.showPause({ shards: 2, total: 5, elapsed: '12:00', area: 'Mirrorwater' });
    const record = [...ui.pause.root.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
      button.textContent?.includes('Field record'),
    );
    expect(record).toBeTruthy();
    record!.click();
    expect(calls).toContain('pause-character');
    ui.hidePause();
  });

  it('updates the HUD level and stamina readouts', () => {
    const { ui, root } = harness();
    ui.hud.setProgression(7, 120, 480, 3);
    expect(root.querySelector('.hud__level-value')?.textContent).toBe('7');
    expect(root.querySelector('.hud__xp-text')?.textContent).toContain('120 / 480 XP');
    expect(root.querySelector('.hud__xp-text')?.textContent).toContain('3 SP');
    ui.hud.setStamina(12, 120);
    const stamina = root.querySelector('.hud__stamina') as HTMLElement;
    expect(stamina.classList.contains('is-low')).toBe(true);
    expect(stamina.textContent).toContain('12');
  });
});
