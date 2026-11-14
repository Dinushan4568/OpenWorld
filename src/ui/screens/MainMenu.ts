import { GAME, SHARD_LOCATIONS } from '../../game/config';
import { formatDuration } from '../../game/util/math';
import { el } from '../components/dom';
import { Screen } from './Screen';

export interface MainMenuCallbacks {
  onPlay: (mode: 'new' | 'continue') => void;
  onSettings: () => void;
  onCredits: () => void;
}

export interface ProgressSummary {
  collected: number;
  total: number;
  playtime: number;
  hasProgress: boolean;
  mission?: {
    title: string;
    objective: string;
    mainComplete: number;
    mainTotal: number;
    marks: number;
    ending: string | null;
  };
}

interface MenuEntry {
  element: HTMLButtonElement;
  label: HTMLElement;
  note: HTMLElement;
  index: HTMLElement;
  primary: boolean;
}

export class MainMenu extends Screen {
  private readonly callbacks: MainMenuCallbacks;
  private readonly actions: HTMLElement;
  private readonly backend: HTMLElement;
  private readonly quality: HTMLElement;
  private readonly continueNote: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly warning: HTMLElement;
  private entries: MenuEntry[] = [];

  constructor(callbacks: MainMenuCallbacks) {
    super('screen-menu');
    this.callbacks = callbacks;
    this.actions = el('div', { class: 'menu__actions', attrs: { role: 'menu', 'aria-label': 'Main menu' } });
    this.backend = el('b', { text: 'initialising' });
    this.quality = el('span', { text: 'auto' });
    this.continueNote = el('span', { text: 'Begin a new expedition' });
    this.objective = el('p', {
      text: `Recover the five Echo Shards scattered across the Mirrorwater valley. ${SHARD_LOCATIONS.length} signals detected.`,
    });
    this.warning = el('div', {
      class: 'menu__objective',
      style: { color: 'var(--amber)', display: 'none', marginTop: '10px' },
    });

    const mark = el('div', { class: 'menu__mark', attrs: { 'aria-hidden': 'true' } });
    const brand = el('div', { class: 'menu__brand' }, [mark, el('span', {}, [el('b', { text: GAME.studio }), ' · Expedition Interface'])]);
    const meta = el('div', { class: 'menu__meta' }, [
      el('div', {}, ['renderer ', this.backend]),
      el('div', {}, ['quality ', this.quality]),
      el('div', { text: `${GAME.version} · ${GAME.phase}` }),
    ]);
    const top = el('div', { class: 'menu__top' }, [brand, meta]);

    const hero = el('div', { class: 'menu__hero' }, [
      el('div', { class: 'menu__eyebrow', text: 'An original science-fiction expedition' }),
      el('h1', { class: 'menu__title' }, [
        'Echoes',
        el('em', { text: 'of the lost world' }),
      ]),
      el('p', {
        class: 'menu__tagline',
        text:
          'A silent world remembers. Cross the Mirrorwater valley, wake the ancient machinery beneath it, and carry five echoes home before the last light leaves the ridge.',
      }),
    ]);

    hero.appendChild(this.actions);

    const footer = el('div', { class: 'menu__footer' }, [
      el('div', { class: 'menu__objective' }, [
        el('strong', { text: 'Expedition objective' }),
        this.objective,
        this.warning,
      ]),
      el('div', { class: 'menu__hint' }, [
        el('div', {}, ['WASD move · Mouse look · E pulse']),
        el('div', {}, ['Shift run · Space jump · ', el('b', { text: 'Esc pause' })]),
      ]),
    ]);

    this.root.append(el('div', { class: 'menu__scrim' }), el('div', { class: 'menu__content' }, [top, hero, footer]));

    this.actions.addEventListener('keydown', (event) => this.handleArrowNavigation(event));
    this.rebuildEntries({ collected: 0, total: SHARD_LOCATIONS.length, playtime: 0, hasProgress: false });
  }

  private makeEntry(
    index: number,
    label: string,
    note: string,
    onClick: () => void,
    primary = false,
  ): MenuEntry {
    const indexEl = el('span', { class: 'menu-item__index', text: String(index).padStart(2, '0') });
    const labelEl = el('span', { class: 'menu-item__label', text: label });
    const noteEl = el('span', { class: 'menu-item__note', text: note });
    const button = el(
      'button',
      {
        class: 'menu-item',
        attrs: { type: 'button', role: 'menuitem', 'data-primary': String(primary) },
        on: { click: onClick },
      },
      [indexEl, labelEl, noteEl],
    );
    return { element: button, label: labelEl, note: noteEl, index: indexEl, primary };
  }

  private rebuildEntries(summary: ProgressSummary): void {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.actions.replaceChildren();
    this.entries = [];

    if (summary.hasProgress) {
      const remaining = Math.max(0, SHARD_LOCATIONS.length - summary.collected);
      const mission = summary.mission;
      const entry = this.makeEntry(
        1,
        'Continue',
        mission
          ? mission.ending
            ? 'chapter complete · revisit the journal'
            : `${mission.mainComplete}/${mission.mainTotal} main missions`
          : remaining === 0
            ? 'return to the gate'
            : `${summary.collected}/${SHARD_LOCATIONS.length} shards`,
        () => this.callbacks.onPlay('continue'),
        true,
      );
      this.entries.push(entry);
      this.entries.push(
        this.makeEntry(2, 'Settings', 'display · camera · audio', () => this.callbacks.onSettings()),
      );
      this.entries.push(this.makeEntry(3, 'Credits', GAME.studio, () => this.callbacks.onCredits()));
      this.entries.push(this.makeEntry(4, 'New expedition', 'restart the valley', () => this.callbacks.onPlay('new')));
      this.continueNote.textContent = mission
        ? `${mission.title} · ${mission.mainComplete}/${mission.mainTotal} main missions · ${mission.marks} marks`
        : `${summary.collected} of ${SHARD_LOCATIONS.length} echoes recovered`;
      this.objective.textContent = mission
        ? mission.ending
          ? `${mission.ending} · ${formatDuration(summary.playtime)} elapsed · open the journal to revisit Chapter One.`
          : `${mission.objective} ${formatDuration(summary.playtime)} elapsed · ${remaining} signal${
              remaining === 1 ? '' : 's'
            } remaining.`
        : `Expedition in progress · ${formatDuration(summary.playtime)} elapsed · ${remaining} signal${
            remaining === 1 ? '' : 's'
          } remaining.`;
    } else {
      this.entries.push(
        this.makeEntry(1, 'Play', 'begin expedition', () => this.callbacks.onPlay('new'), true),
      );
      this.entries.push(
        this.makeEntry(2, 'Settings', 'display · camera · audio', () => this.callbacks.onSettings()),
      );
      this.entries.push(this.makeEntry(3, 'Credits', GAME.studio, () => this.callbacks.onCredits()));
      this.continueNote.textContent = 'Begin a new expedition';
      this.objective.textContent = `Recover the five Echo Shards scattered across the Mirrorwater valley. ${SHARD_LOCATIONS.length} signals detected.`;
    }

    for (const entry of this.entries) this.actions.appendChild(entry.element);
    if (previousFocus && this.root.contains(previousFocus)) {
      this.entries[0]?.element.focus();
    }
  }

  private handleArrowNavigation(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const ordered = this.entries.map((entry) => entry.element);
    const current = ordered.indexOf(document.activeElement as HTMLButtonElement);
    const delta = event.key === 'ArrowDown' ? 1 : -1;
    const next = (current + delta + ordered.length) % ordered.length;
    (ordered[next] ?? ordered[0])?.focus();
  }

  setProgress(summary: ProgressSummary): void {
    this.rebuildEntries(summary);
  }

  setBackend(renderer: string, quality: string): void {
    this.backend.textContent = renderer;
    this.quality.textContent = quality;
  }

  setWarning(message: string | null): void {
    if (!message) {
      this.warning.style.display = 'none';
      this.warning.textContent = '';
      return;
    }
    this.warning.style.display = 'block';
    this.warning.textContent = message;
  }

  override show(): void {
    super.show();
    this.root.classList.add('is-active');
    this.warning.style.display = this.warning.textContent ? 'block' : 'none';
    requestAnimationFrame(() => this.entries[0]?.element.focus({ preventScroll: true }));
  }

  override hide(): void {
    this.root.classList.remove('is-active');
    super.hide();
  }

  focusFirst(): void {
    this.entries[0]?.element.focus({ preventScroll: true });
  }
}
