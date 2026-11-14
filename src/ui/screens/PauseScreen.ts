import { SHARD_LOCATIONS } from '../../game/config';
import { el } from '../components/dom';
import { Screen } from './Screen';

export interface PauseScreenCallbacks {
  onResume: () => void;
  onSettings: () => void;
  onQuit: () => void;
  onCharacter?: () => void;
}

export interface PauseStats {
  shards: number;
  total: number;
  elapsed: string;
  area: string;
}

export class PauseScreen extends Screen {
  private readonly callbacks: PauseScreenCallbacks;
  private readonly shardValue: HTMLElement;
  private readonly timeValue: HTMLElement;
  private readonly areaValue: HTMLElement;
  private readonly total: number;

  constructor(callbacks: PauseScreenCallbacks) {
    super('overlay pause');
    this.callbacks = callbacks;
    this.total = SHARD_LOCATIONS.length;

    this.shardValue = el('b', { text: `0 / ${this.total}` });
    this.timeValue = el('b', { text: '0:00' });
    this.areaValue = el('b', { text: 'Mirrorwater' });

    const card = el('div', { class: 'pause__card panel', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Paused' } }, [
      el('div', { class: 'kicker', text: 'Expedition suspended' }),
      el('h2', { class: 'pause__title', text: 'Paused' }),
      el('div', { class: 'pause__stats' }, [
        el('div', { class: 'pause__stat' }, [el('span', { text: 'Echoes' }), this.shardValue]),
        el('div', { class: 'pause__stat' }, [el('span', { text: 'Elapsed' }), this.timeValue]),
        el('div', { class: 'pause__stat' }, [el('span', { text: 'Region' }), this.areaValue]),
      ]),
      el('div', { class: 'pause__keys' }, [
        el('div', {}, [el('span', { text: 'Move' }), el('kbd', { text: 'W A S D' })]),
        el('div', {}, [el('span', { text: 'Run · Jump · Pulse' }), el('span', {}, [el('kbd', { text: 'SHIFT' }), ' ', el('kbd', { text: 'SPACE' }), ' ', el('kbd', { text: 'E' })])]),
        el('div', {}, [el('span', { text: 'Interact · Journal' }), el('span', {}, [el('kbd', { text: 'R' }), ' ', el('kbd', { text: 'J' })])]),
        el('div', {}, [el('span', { text: 'Character record' }), el('kbd', { text: 'C' })]),
        el('div', {}, [el('span', { text: 'Look · Zoom' }), el('span', {}, [el('kbd', { text: 'MOUSE' }), ' ', el('kbd', { text: 'WHEEL' })])]),
      ]),
      el('div', { class: 'pause__actions' }, [
        el('button', {
          class: 'btn btn--primary',
          attrs: { type: 'button' },
          text: 'Resume expedition',
          on: { click: () => this.callbacks.onResume() },
        }),
        this.callbacks.onCharacter
          ? el('button', {
              class: 'btn btn--ghost',
              attrs: { type: 'button' },
              text: 'Field record',
              on: { click: () => this.callbacks.onCharacter?.() },
            })
          : null,
        el('button', {
          class: 'btn btn--ghost',
          attrs: { type: 'button' },
          text: 'Settings',
          on: { click: () => this.callbacks.onSettings() },
        }),
        el('button', {
          class: 'btn btn--ghost btn--danger',
          attrs: { type: 'button' },
          text: 'Save & return to menu',
          on: { click: () => this.callbacks.onQuit() },
        }),
      ]),
      el('p', {
        style: { margin: '2px 0 0', fontSize: '10px', lineHeight: '1.7', color: 'var(--muted)', letterSpacing: '0.04em' },
        text: 'Progress is stored locally. Closing the tab will end the session, not the expedition.',
      }),
    ]);

    const backdrop = el('div', {
      class: 'overlay__backdrop',
      attrs: { 'aria-hidden': 'true' },
      on: { click: () => this.callbacks.onResume() },
    });

    this.root.append(backdrop, card);
  }

  setStats(stats: PauseStats): void {
    this.shardValue.textContent = `${stats.shards} / ${stats.total}`;
    this.timeValue.textContent = stats.elapsed;
    this.areaValue.textContent = stats.area;
  }

  override show(): void {
    super.show();
    this.root.classList.add('is-active');
    requestAnimationFrame(() =>
      this.root.querySelector<HTMLElement>('.btn--primary')?.focus({ preventScroll: true }),
    );
  }

  override hide(): void {
    this.root.classList.remove('is-active');
    super.hide();
  }
}
