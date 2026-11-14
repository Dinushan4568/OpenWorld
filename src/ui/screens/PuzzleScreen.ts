import { el } from '../components/dom';
import type { PuzzleDefinition } from '../../game/story/types';
import { Screen } from './Screen';

export interface PuzzleScreenCallbacks {
  onSolved: (puzzle: PuzzleDefinition) => void;
  onClose: () => void;
}

/** Three-dial ancient mechanism. Deterministic and fully keyboard operable. */
export class PuzzleScreen extends Screen {
  private readonly callbacks: PuzzleScreenCallbacks;
  private readonly kickerEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly briefingEl: HTMLElement;
  private readonly dialsEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly submit: HTMLButtonElement;
  private puzzle: PuzzleDefinition | null = null;
  private values: number[] = [];
  private solved = false;
  private readonly keyHandler: (event: KeyboardEvent) => void;

  constructor(callbacks: PuzzleScreenCallbacks) {
    super('overlay puzzle');
    this.callbacks = callbacks;
    this.kickerEl = el('div', { class: 'kicker', text: 'Continuity interface · manual alignment' });
    this.titleEl = el('h2', { class: 'puzzle__title', text: '' });
    this.briefingEl = el('p', { class: 'puzzle__briefing', text: '' });
    this.dialsEl = el('div', { class: 'puzzle__dials' });
    this.statusEl = el('p', { class: 'puzzle__status', attrs: { 'aria-live': 'polite' }, text: '' });
    this.submit = el('button', {
      class: 'btn btn--primary puzzle__submit',
      attrs: { type: 'button' },
      text: 'Align the mechanism',
      on: { click: () => this.trySubmit() },
    });

    const card = el(
      'div',
      {
        class: 'puzzle__card panel',
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ancient mechanism' },
      },
      [
        this.kickerEl,
        this.titleEl,
        this.briefingEl,
        this.dialsEl,
        el('p', { class: 'puzzle__hint', text: '' }),
        this.statusEl,
        el('div', { class: 'puzzle__actions' }, [
          this.submit,
          el('button', {
            class: 'btn btn--ghost',
            attrs: { type: 'button' },
            text: 'Step away',
            on: { click: () => this.callbacks.onClose() },
          }),
        ]),
        el('div', { class: 'puzzle__foot' }, [
          el('span', { text: 'The dials remember. The array does not forgive.' }),
          el('span', { class: 'puzzle__glyph', attrs: { 'aria-hidden': 'true' }, text: '⌬' }),
        ]),
      ],
    );

    const backdrop = el('div', {
      class: 'overlay__backdrop',
      attrs: { 'aria-hidden': 'true' },
      on: { click: () => this.callbacks.onClose() },
    });
    this.root.append(backdrop, card);

    this.keyHandler = (event: KeyboardEvent) => {
      if (!this.isActive) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.callbacks.onClose();
      }
    };
    window.addEventListener('keydown', this.keyHandler, true);
  }

  showPuzzle(puzzle: PuzzleDefinition): void {
    this.puzzle = puzzle;
    this.solved = false;
    this.values = puzzle.dials.map(() => 0);
    this.kickerEl.textContent = puzzle.kicker;
    this.titleEl.textContent = puzzle.title;
    this.briefingEl.textContent = puzzle.subtitle;
    const hint = this.root.querySelector<HTMLElement>('.puzzle__hint');
    if (hint) hint.textContent = puzzle.hint;
    this.statusEl.textContent = `${puzzle.dials.length} dials · align the sequence`;
    this.root.classList.remove('is-solved');
    this.submit.disabled = false;
    this.submit.textContent = 'Align the mechanism';
    this.renderDials();
    this.show();
    this.root.classList.add('is-active');
    requestAnimationFrame(() => this.dialsEl.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true }));
  }

  private renderDials(): void {
    if (!this.puzzle) return;
    this.dialsEl.replaceChildren(
      ...this.puzzle.dials.map((dial, index) =>
        el('div', { class: 'puzzle__dial' }, [
          el('span', { class: 'puzzle__dial-label', text: dial.label }),
          el('div', { class: 'puzzle__dial-controls' }, [
            el('button', {
              class: 'puzzle__step',
              attrs: { type: 'button', 'aria-label': `Turn ${dial.label} down` },
              text: '−',
              on: { click: () => this.step(index, -1) },
            }),
            el('output', { class: 'puzzle__value', text: dial.symbols[this.values[index]] }),
            el('button', {
              class: 'puzzle__step',
              attrs: { type: 'button', 'aria-label': `Turn ${dial.label} up` },
              text: '+',
              on: { click: () => this.step(index, 1) },
            }),
          ]),
          el('span', { class: 'puzzle__dial-hint', text: dial.symbols.join(' · ') }),
        ]),
      ),
    );
  }

  private step(index: number, direction: number): void {
    if (!this.puzzle || this.solved) return;
    const dial = this.puzzle.dials[index];
    const size = dial.symbols.length;
    this.values[index] = (this.values[index] + direction + size) % size;
    const output = this.dialsEl.querySelectorAll<HTMLOutputElement>('.puzzle__value')[index];
    if (output) output.textContent = dial.symbols[this.values[index]];
    this.statusEl.textContent = 'The mechanism waits.';
  }

  private trySubmit(): void {
    if (!this.puzzle || this.solved) return;
    if (!this.puzzle.dials.every((dial, index) => this.values[index] === dial.target)) {
      this.statusEl.textContent = 'The dials slip back into dissonance. Read the cadence again.';
      this.root.classList.add('is-wrong');
      window.setTimeout(() => this.root.classList.remove('is-wrong'), 480);
      return;
    }
    this.solved = true;
    this.root.classList.add('is-solved');
    this.statusEl.textContent = this.puzzle.success;
    this.submit.disabled = true;
    this.submit.textContent = 'Mechanism aligned';
    this.callbacks.onSolved(this.puzzle);
    requestAnimationFrame(() => {
      const close = this.root.querySelector<HTMLButtonElement>('.btn--ghost');
      close?.focus({ preventScroll: true });
    });
  }

  override hide(): void {
    this.root.classList.remove('is-active', 'is-solved', 'is-wrong');
    super.hide();
  }

  override destroy(): void {
    window.removeEventListener('keydown', this.keyHandler, true);
    super.destroy();
  }
}
