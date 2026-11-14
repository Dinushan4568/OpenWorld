import { STAT_LABELS, categoryLabel } from '../../game/progression/content';
import type {
  EquipmentSlot,
  ProgressionView,
  SkillView,
  StatKey,
} from '../../game/progression/types';
import { el } from '../components/dom';
import { Screen } from './Screen';

export type CharacterTab = 'overview' | 'skills' | 'inventory' | 'equipment' | 'stats';

export interface CharacterScreenCallbacks {
  onClose: () => void;
  onUnlockSkill: (id: string) => void;
  onEquip: (id: string) => void;
  onUnequip: (slot: EquipmentSlot) => void;
  onUpgrade: (id: string) => void;
  onCraft: (id: string) => void;
}

const TABS: Array<{ id: CharacterTab; label: string; glyph: string }> = [
  { id: 'overview', label: 'Overview', glyph: '◇' },
  { id: 'skills', label: 'Skills', glyph: '⌘' },
  { id: 'inventory', label: 'Inventory', glyph: '▣' },
  { id: 'equipment', label: 'Equipment', glyph: '⚒' },
  { id: 'stats', label: 'Statistics', glyph: '◫' },
];

const STAT_ORDER: StatKey[] = [
  'moveSpeed',
  'jump',
  'scanRange',
  'pulseCooldown',
  'maxStamina',
  'staminaRegen',
  'waterSpeed',
  'resourceYield',
  'resourceFlat',
  'xpBonus',
  'upgradeDiscount',
];

const STAT_HELP: Record<StatKey, string> = {
  moveSpeed: 'Multiplier on walking and sprinting pace.',
  jump: 'Multiplier on vault height. Vault Step adds a mid-air jump.',
  scanRange: 'Metres the survey cone reaches.',
  pulseCooldown: 'Seconds between echo pulses.',
  maxStamina: 'Reserve drained by sprinting and climbing.',
  staminaRegen: 'Stamina recovered per second.',
  waterSpeed: 'Movement multiplier while wading.',
  resourceYield: 'Multiplier on cache yields.',
  resourceFlat: 'Flat resources added to every cache.',
  xpBonus: 'Multiplier on all experience earned.',
  upgradeDiscount: 'Reduction on equipment upgrade costs.',
};

const number = (value: number): string => Math.round(value).toLocaleString('en-US');

function statValue(key: StatKey, value: number): string {
  if (key === 'moveSpeed' || key === 'jump' || key === 'waterSpeed' || key === 'resourceYield' || key === 'xpBonus') {
    return `${Math.round(value * 100)}%`;
  }
  if (key === 'upgradeDiscount') return `${Math.round(value * 100)}%`;
  if (key === 'scanRange') return `${Math.round(value)} m`;
  if (key === 'pulseCooldown') return `${value.toFixed(2).replace(/\.?0+$/, '')} s`;
  if (key === 'staminaRegen') return `${value.toFixed(1).replace(/\.?0+$/, '')}/s`;
  return number(value);
}

/** The field character sheet: skills, gear, supplies and an expedition record. */
export class CharacterScreen extends Screen {
  private readonly callbacks: CharacterScreenCallbacks;
  private readonly head: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly tabBar: HTMLElement;
  private readonly body: HTMLElement;
  private readonly tabs = new Map<CharacterTab, HTMLButtonElement>();
  private readonly title: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly resourceStrip: HTMLElement;
  private readonly feedbackEl: HTMLElement;
  private feedbackTimer = 0;
  private currentTab: CharacterTab = 'overview';
  private view: ProgressionView | null = null;

  constructor(callbacks: CharacterScreenCallbacks) {
    super('overlay character');
    this.callbacks = callbacks;
    this.title = el('h2', { class: 'character__title', text: 'Field Record' });
    this.subtitle = el('p', { class: 'character__subtitle', text: 'Expedition profile' });
    this.head = el('div', { class: 'character__head' }, [
      el('div', {}, [
        el('div', { class: 'kicker', text: 'Echoes of the Lost World · Character' }),
        this.title,
        this.subtitle,
      ]),
      el('button', {
        class: 'dialogue__close',
        attrs: { type: 'button', 'aria-label': 'Close character sheet' },
        text: 'Close',
        on: { click: () => this.callbacks.onClose() },
      }),
    ]);
    this.summary = el('div', { class: 'character__summary' });
    this.resourceStrip = el('div', { class: 'character__resources', attrs: { 'aria-label': 'Resources' } });
    this.feedbackEl = el('span', { class: 'character__feedback', attrs: { 'aria-live': 'polite' }, text: '' });
    this.tabBar = el('div', { class: 'character__tabs', attrs: { role: 'tablist', 'aria-label': 'Character sections' } });
    for (const tab of TABS) {
      const button = el('button', {
        class: 'character__tab',
        attrs: { type: 'button', role: 'tab', 'aria-selected': 'false', 'data-tab': tab.id },
        on: { click: () => this.selectTab(tab.id) },
      }, [el('span', { class: 'character__tab-glyph', attrs: { 'aria-hidden': 'true' }, text: tab.glyph }), tab.label]);
      this.tabs.set(tab.id, button);
      this.tabBar.appendChild(button);
    }
    this.body = el('div', { class: 'character__body', attrs: { role: 'tabpanel' } });

    const card = el(
      'div',
      {
        class: 'character__card',
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Character and progression' },
      },
      [
        this.head,
        this.summary,
        this.resourceStrip,
        this.tabBar,
        this.body,
        el('div', { class: 'character__foot' }, [
          el('span', { class: 'character__foot-note', text: 'Progression is validated and saved to this browser with IndexedDB.' }),
          this.feedbackEl,
          el('span', { class: 'character__key', attrs: { 'aria-hidden': 'true' }, text: 'C' }),
        ]),
      ],
    );
    const backdrop = el('div', {
      class: 'overlay__backdrop',
      attrs: { 'aria-hidden': 'true' },
      on: { click: () => this.callbacks.onClose() },
    });
    this.root.append(backdrop, card);
  }

  showCharacter(view: ProgressionView): void {
    this.view = view;
    this.render();
    this.show();
    this.root.classList.add('is-active');
    requestAnimationFrame(() => this.tabs.get(this.currentTab)?.focus({ preventScroll: true }));
  }

  refresh(view: ProgressionView): void {
    this.view = view;
    if (this.isActive) this.render();
  }

  feedback(text: string, ok: boolean): void {
    this.feedbackEl.textContent = text;
    this.feedbackEl.classList.toggle('is-warn', !ok);
    this.feedbackEl.classList.add('is-visible');
    if (this.feedbackTimer) window.clearTimeout(this.feedbackTimer);
    this.feedbackTimer = window.setTimeout(() => {
      this.feedbackEl.classList.remove('is-visible');
      this.feedbackTimer = 0;
    }, 3200);
  }

  override hide(): void {
    if (this.feedbackTimer) window.clearTimeout(this.feedbackTimer);
    this.feedbackTimer = 0;
    this.feedbackEl.classList.remove('is-visible');
    this.root.classList.remove('is-active');
    super.hide();
  }

  private selectTab(tab: CharacterTab): void {
    this.currentTab = tab;
    this.render();
  }

  private render(): void {
    if (!this.view) return;
    const view = this.view;
    const xpPercent = view.xpToNext > 0 ? Math.min(100, (view.xp / view.xpToNext) * 100) : 100;
    this.title.textContent = `Level ${view.level} Field Record`;
    this.subtitle.textContent =
      view.level >= 20
        ? `Power ${view.powerScore} · level cap reached`
        : `${number(view.xp)} / ${number(view.xpToNext)} XP to level ${view.level + 1} · Power ${view.powerScore}`;

    this.summary.replaceChildren(
      this.summaryCard('Level', String(view.level), view.level >= 20 ? 'Cap reached' : `${Math.round(xpPercent)}% to next`),
      this.summaryCard('Skill points', String(view.skillPoints), `${view.spentSkillPoints} spent of ${view.totalSkillPoints}`),
      this.summaryCard('Abilities', String(view.abilities.filter((ability) => ability.unlocked).length), `${view.abilities.length} discovered`),
      this.summaryCard('Resources', String(view.statistics.resources), 'units gathered'),
    );

    this.resourceStrip.replaceChildren(
      ...view.resources.map((resource) =>
        el('div', { class: 'character__resource', attrs: { title: resource.description } }, [
          el('span', { class: 'character__resource-glyph', style: { color: resource.color }, text: resource.glyph }),
          el('span', { text: resource.name }),
          el('b', { text: number(resource.amount) }),
        ]),
      ),
    );

    this.tabBar.querySelector<HTMLElement>('.character__progress')?.remove();
    const progress = el('div', {
      class: 'character__progress',
      attrs: { role: 'progressbar', 'aria-label': 'Experience to next level', 'aria-valuemin': '0', 'aria-valuemax': String(view.xpToNext || 100), 'aria-valuenow': String(view.xp) },
    }, [el('i', { style: { width: `${xpPercent}%` } })]);
    this.tabBar.appendChild(progress);
    for (const [id, button] of this.tabs) {
      const selected = id === this.currentTab;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-selected', String(selected));
    }

    const renderers: Record<CharacterTab, () => HTMLElement> = {
      overview: () => this.overview(view),
      skills: () => this.skills(view),
      inventory: () => this.inventory(view),
      equipment: () => this.equipment(view),
      stats: () => this.statistics(view),
    };
    this.body.replaceChildren(renderers[this.currentTab]());
  }

  private summaryCard(label: string, value: string, note: string): HTMLElement {
    return el('div', { class: 'character__summary-card' }, [
      el('span', { class: 'character__summary-label', text: label }),
      el('b', { class: 'character__summary-value', text: value }),
      el('span', { class: 'character__summary-note', text: note }),
    ]);
  }

  /* ------------------------------- tabs ------------------------------- */

  private overview(view: ProgressionView): HTMLElement {
    const derived = el('div', { class: 'character__stat-grid' }, STAT_ORDER.map((key) => this.derivedStat(key, view.stats[key])));
    const loadout = el('div', { class: 'character__loadout' }, view.loadout.map((slot) => {
      const item = slot.item;
      return el('div', { class: 'character__loadout-slot' }, [
        el('span', { class: 'character__slot-name', text: slot.slotLabel }),
        item
          ? el('div', {}, [
              el('b', { text: item.name }),
              el('span', { text: ` · level ${item.level}/${item.maxLevel}` }),
              el('small', { text: item.statsText }),
            ])
          : el('span', { class: 'character__muted', text: 'Empty · equip an item' }),
      ]);
    }));
    const abilities = el('div', { class: 'character__abilities' }, view.abilities.map((ability) =>
      el('div', {
        class: `character__ability${ability.unlocked ? ' is-unlocked' : ''}`,
        attrs: { title: ability.description },
      }, [
        el('span', { class: 'character__ability-glyph', attrs: { 'aria-hidden': 'true' }, text: ability.glyph }),
        el('div', {}, [
          el('b', { text: ability.name }),
          el('span', { text: ability.unlocked ? ability.description : `Locked · ${ability.source}` }),
        ]),
      ]),
    ));
    return el('div', { class: 'character__overview' }, [
      el('section', { class: 'character__section' }, [
        el('div', { class: 'character__section-head' }, [
          el('h3', { text: 'Live attributes' }),
          el('span', { text: 'Skills, equipment and field discoveries combine here.' }),
        ]),
        derived,
      ]),
      el('div', { class: 'character__columns' }, [
        el('section', { class: 'character__section' }, [
          el('div', { class: 'character__section-head' }, [el('h3', { text: 'Loadout' }), el('span', { text: 'Currently fielded equipment.' })]),
          loadout,
        ]),
        el('section', { class: 'character__section' }, [
          el('div', { class: 'character__section-head' }, [el('h3', { text: 'Exploration abilities' }), el('span', { text: 'Earned by raising skills.' })]),
          abilities,
        ]),
      ]),
    ]);
  }

  private skills(view: ProgressionView): HTMLElement {
    const intro = el('div', { class: 'character__note' }, [
      el('b', { text: `${view.skillPoints} skill points available` }),
      el('span', { text: ' · Every rank costs points. Later tiers require the skill before them.' }),
    ]);
    const sections = view.categories.map((category) =>
      el('section', { class: 'character__section' }, [
        el('div', { class: 'character__section-head' }, [
          el('h3', {}, [el('span', { class: 'character__category-glyph', text: categorySkillsGlyph(category.id) }), category.label]),
          el('span', { text: category.description }),
        ]),
        el('div', { class: 'character__skill-list' }, category.skills.map((skill) => this.skillCard(skill))),
      ]),
    );
    return el('div', {}, [intro, ...sections]);
  }

  private skillCard(skill: SkillView): HTMLElement {
    const pips = el('div', { class: 'character__pips', attrs: { 'aria-label': `${skill.rank} of ${skill.maxRank} ranks` } });
    for (let i = 0; i < skill.maxRank; i += 1) pips.appendChild(el('span', { class: `character__pip${i < skill.rank ? ' is-filled' : ''}` }));
    const button = el('button', {
      class: `btn btn--small${skill.canUnlock ? ' btn--primary' : ' btn--ghost'}`,
      attrs: {
        type: 'button',
        disabled: !skill.canUnlock,
        title: skill.canUnlock ? `${skill.name} · ${skill.effectText}` : skill.buttonLabel,
        'data-skill': skill.id,
      },
      text: skill.buttonLabel,
      on: { click: () => this.callbacks.onUnlockSkill(skill.id) },
    });
    return el('article', { class: `character__skill${skill.unlocked ? ' is-unlocked' : ''}${skill.canUnlock ? ' is-ready' : ''}`, attrs: { 'data-skill-card': skill.id } }, [
      el('div', { class: 'character__skill-head' }, [
        el('div', {}, [
          el('span', { class: 'character__tier', text: `Tier ${skill.tier}` }),
          el('h4', { text: skill.name }),
          el('span', { class: 'character__prereq', text: skill.prerequisiteText }),
        ]),
        pips,
      ]),
      el('p', { class: 'character__skill-desc', text: skill.description }),
      el('p', { class: 'character__effect', text: skill.effectText }),
      skill.abilityName ? el('div', { class: 'character__unlock', text: `Unlocks ${skill.abilityName}` }) : null,
      el('div', { class: 'character__skill-foot' }, [
        el('span', { class: 'character__rank', text: `Rank ${skill.rank} / ${skill.maxRank} · ${skill.cost} SP` }),
        button,
      ]),
    ]);
  }

  private inventory(view: ProgressionView): HTMLElement {
    const resources = el('div', { class: 'character__resource-grid' }, view.resources.map((resource) =>
      el('article', { class: 'character__resource-card' }, [
        el('div', { class: 'character__resource-card-head' }, [
          el('span', { class: 'character__resource-glyph', style: { color: resource.color }, text: resource.glyph }),
          el('div', {}, [el('h4', { text: resource.name }), el('span', { text: `${number(resource.amount)} in pack` })]),
        ]),
        el('p', { text: resource.description }),
      ]),
    ));
    const recipes = view.recipes.length
      ? el('div', { class: 'character__recipe-grid' }, view.recipes.map((recipe) =>
          el('article', { class: 'character__recipe' }, [
            el('div', { class: 'character__recipe-head' }, [
              el('div', {}, [
                el('span', { class: 'character__tier', text: recipe.slotLabel }),
                el('h4', { text: recipe.name }),
              ]),
              el('span', { class: `character__status${recipe.canCraft ? ' is-ready' : ''}`, text: recipe.reason }),
            ]),
            el('p', { text: recipe.description }),
            el('div', { class: 'character__recipe-foot' }, [
              el('span', { class: 'character__cost', text: recipe.costText }),
              el('span', { class: 'character__muted', text: `Requires level ${recipe.levelRequirement}` }),
              el('button', {
                class: `btn btn--small${recipe.canCraft ? ' btn--primary' : ' btn--ghost'}`,
                attrs: { type: 'button', disabled: !recipe.canCraft, 'data-craft': recipe.id },
                text: recipe.canCraft ? 'Craft' : 'Locked',
                on: { click: () => this.callbacks.onCraft(recipe.id) },
              }),
            ]),
          ]),
        ))
      : el('p', { class: 'character__muted', text: 'Every known blueprint is already in your pack.' });

    return el('div', {}, [
      el('div', { class: 'character__note' }, [
        el('b', { text: 'Field supplies' }),
        el('span', { text: ' · Gather caches with R. Resources are spent on upgrades and blueprints.' }),
      ]),
      el('section', { class: 'character__section' }, [
        el('div', { class: 'character__section-head' }, [el('h3', { text: 'Materials' }), el('span', { text: 'Recovered from the valley.' })]),
        resources,
      ]),
      el('section', { class: 'character__section' }, [
        el('div', { class: 'character__section-head' }, [el('h3', { text: 'Field blueprints' }), el('span', { text: 'Tier-two equipment built from gathered materials.' })]),
        recipes,
      ]),
    ]);
  }

  private equipment(view: ProgressionView): HTMLElement {
    const slots = el('div', { class: 'character__equipped' }, view.loadout.map((slot) =>
      el('div', { class: 'character__equipped-slot' }, [
        el('span', { class: 'character__slot-name', text: slot.slotLabel }),
        slot.item
          ? el('div', { class: 'character__equipped-item' }, [
              el('div', {}, [
                el('b', { text: slot.item.name }),
                el('span', { text: ` · level ${slot.item.level}/${slot.item.maxLevel}` }),
                el('small', { text: slot.item.statsText }),
              ]),
              el('button', {
                class: 'btn btn--small btn--ghost',
                attrs: { type: 'button', 'data-unequip': slot.slot },
                text: 'Unequip',
                on: { click: () => this.callbacks.onUnequip(slot.slot) },
              }),
            ])
          : el('div', { class: 'character__muted', text: 'Empty slot — equip an item below.' }),
      ]),
    ));

    const owned = el('div', { class: 'character__gear-grid' }, view.equipment.map((item) => {
      const pips = el('div', { class: 'character__pips' });
      for (let i = 0; i < item.maxLevel; i += 1) pips.appendChild(el('span', { class: `character__pip${i < item.level ? ' is-filled' : ''}` }));
      return el('article', { class: `character__gear${item.equipped ? ' is-equipped' : ''}`, attrs: { 'data-gear': item.id } }, [
        el('div', { class: 'character__gear-head' }, [
          el('div', {}, [
            el('span', { class: 'character__tier', text: `${item.slotLabel} · tier ${item.tier}` }),
            el('h4', { text: item.name }),
          ]),
          item.equipped ? el('span', { class: 'character__status is-ready', text: 'Equipped' }) : null,
        ]),
        el('div', { class: 'character__gear-level' }, [el('span', { text: `Level ${item.level} / ${item.maxLevel}` }), pips]),
        el('p', { class: 'character__gear-stats', text: item.statsText }),
        el('p', { class: 'character__muted', text: item.level < item.maxLevel ? `Next: ${item.nextStatsText}` : 'Maximum upgrades applied.' }),
        el('div', { class: 'character__gear-foot' }, [
          el('span', { class: 'character__cost', text: item.level < item.maxLevel ? `Upgrade · ${item.upgradeCostText}` : 'Fully upgraded' }),
          el('div', { class: 'character__gear-actions' }, [
            item.equipped
              ? null
              : el('button', {
                  class: 'btn btn--small btn--ghost',
                  attrs: { type: 'button', 'data-equip': item.id },
                  text: 'Equip',
                  on: { click: () => this.callbacks.onEquip(item.id) },
                }),
            el('button', {
              class: `btn btn--small${item.canUpgrade ? ' btn--primary' : ' btn--ghost'}`,
              attrs: { type: 'button', disabled: !item.canUpgrade, title: item.upgradeReason, 'data-upgrade': item.id },
              text: item.canUpgrade ? 'Upgrade' : item.level >= item.maxLevel ? 'Maxed' : 'Need materials',
              on: { click: () => this.callbacks.onUpgrade(item.id) },
            }),
          ]),
        ]),
      ]);
    }));

    const bench = view.recipes.length
      ? el('div', { class: 'character__bench' }, view.recipes.map((recipe) =>
          el('div', { class: 'character__bench-item' }, [
            el('div', {}, [el('b', { text: recipe.name }), el('small', { text: `${recipe.slotLabel} · ${recipe.costText}` })]),
            el('span', { class: 'character__muted', text: recipe.reason }),
            el('button', {
              class: `btn btn--small${recipe.canCraft ? ' btn--primary' : ' btn--ghost'}`,
              attrs: { type: 'button', disabled: !recipe.canCraft, 'data-bench-craft': recipe.id },
              text: recipe.canCraft ? 'Craft' : 'Locked',
              on: { click: () => this.callbacks.onCraft(recipe.id) },
            }),
          ]),
        ))
      : null;

    return el('div', {}, [
      el('section', { class: 'character__section' }, [
        el('div', { class: 'character__section-head' }, [el('h3', { text: 'Current loadout' }), el('span', { text: 'One item per slot.' })]),
        slots,
      ]),
      el('section', { class: 'character__section' }, [
        el('div', { class: 'character__section-head' }, [el('h3', { text: 'Owned equipment' }), el('span', { text: 'Upgrade costs scale with level.' })]),
        owned,
      ]),
      bench
        ? el('section', { class: 'character__section' }, [
            el('div', { class: 'character__section-head' }, [el('h3', { text: 'Crafting bench' }), el('span', { text: 'Blueprints recovered in the field.' })]),
            bench,
          ])
        : null,
    ]);
  }

  private statistics(view: ProgressionView): HTMLElement {
    const stats = view.statistics;
    const entries: Array<[string, string]> = [
      ['Experience earned', number(stats.xpEarned)],
      ['Distance travelled', `${number(stats.distanceTravelled)} m`],
      ['Time in the valley', formatPlaytime(stats.playTime)],
      ['Echo shards recovered', `${stats.shards} / 5`],
      ['Specimens scanned', number(stats.scans)],
      ['Missions complete', number(stats.missions)],
      ['Puzzles solved', number(stats.puzzles)],
      ['Resources gathered', number(stats.resources)],
      ['Memories read', number(stats.memories)],
      ['Equipment upgrades', number(stats.equipmentUpgrades)],
      ['Skill ranks learned', number(stats.skillsLearned)],
    ];
    return el('div', {}, [
      el('section', { class: 'character__section' }, [
        el('div', { class: 'character__section-head' }, [el('h3', { text: 'Expedition statistics' }), el('span', { text: 'Recorded automatically as you play.' })]),
        el('div', { class: 'character__record' }, entries.map(([label, value]) =>
          el('div', { class: 'character__record-row' }, [el('span', { text: label }), el('b', { text: value })]),
        )),
      ]),
      el('section', { class: 'character__section' }, [
        el('div', { class: 'character__section-head' }, [el('h3', { text: 'Attribute detail' }), el('span', { text: 'Where every number comes from.' })]),
        el('div', { class: 'character__stat-table' }, STAT_ORDER.map((key) =>
          el('div', { class: 'character__stat-row' }, [
            el('span', { text: STAT_LABELS[key] }),
            el('b', { text: statValue(key, view.stats[key]) }),
            el('small', { text: STAT_HELP[key] }),
          ]),
        )),
      ]),
      el('section', { class: 'character__section' }, [
        el('div', { class: 'character__section-head' }, [el('h3', { text: 'Category mastery' }), el('span', { text: 'Ranks invested across the five disciplines.' })]),
        el('div', { class: 'character__mastery' }, view.categories.map((category) => {
          const total = category.skills.reduce((sum, skill) => sum + skill.maxRank, 0);
          const earned = category.skills.reduce((sum, skill) => sum + skill.rank, 0);
          const percent = total > 0 ? (earned / total) * 100 : 0;
          return el('div', { class: 'character__mastery-row' }, [
            el('span', { text: category.label }),
            el('div', { class: 'character__bar' }, [el('i', { style: { width: `${percent}%` } })]),
            el('b', { text: `${earned} / ${total}` }),
          ]);
        })),
      ]),
    ]);
  }

  private derivedStat(key: StatKey, value: number): HTMLElement {
    return el('div', { class: 'character__stat-card', attrs: { title: STAT_HELP[key] } }, [
      el('span', { text: STAT_LABELS[key] }),
      el('b', { text: key === 'pulseCooldown' ? `${value.toFixed(2).replace(/\.?0+$/, '')} s` : statValue(key, value) }),
    ]);
  }
}

function categorySkillsGlyph(category: string): string {
  const found = { exploration: '◇', movement: '⇢', scanning: '◎', survival: '⌁', technology: '⌬' } as Record<string, string>;
  return found[category] ?? '·';
}

function formatPlaytime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m ${total % 60}s`;
}

export { categoryLabel };
