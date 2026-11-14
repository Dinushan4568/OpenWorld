import { el } from '../components/dom';
import type { DialogueSession, DialogueView } from '../../game/story/types';
import { Screen } from './Screen';

export interface DialogueScreenCallbacks {
  onChoose: (choiceId: string) => void;
  onClose: () => void;
}

/** Transient conversation overlay. The Game owns the session; this only draws it. */
export class DialogueScreen extends Screen {
  private readonly callbacks: DialogueScreenCallbacks;
  private readonly speakerEl: HTMLElement;
  private readonly roleEl: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly textEl: HTMLElement;
  private readonly choicesEl: HTMLElement;
  private readonly card: HTMLElement;
  private readonly keyHandler: (event: KeyboardEvent) => void;

  constructor(callbacks: DialogueScreenCallbacks) {
    super('overlay dialogue');
    this.callbacks = callbacks;
    this.speakerEl = el('div', { class: 'dialogue__speaker', text: '' });
    this.roleEl = el('div', { class: 'dialogue__role', text: '' });
    this.titleEl = el('h2', { class: 'dialogue__title', text: '' });
    this.textEl = el('p', { class: 'dialogue__text', text: '' });
    this.choicesEl = el('div', { class: 'dialogue__choices', attrs: { role: 'group', 'aria-label': 'Responses' } });

    this.card = el(
      'div',
      {
        class: 'dialogue__card',
        attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dialogue-speaker' },
      },
      [
        el('div', { class: 'dialogue__head' }, [
          el('div', {}, [this.speakerEl, this.roleEl]),
          el('button', {
            class: 'dialogue__close',
            attrs: { type: 'button', 'aria-label': 'End conversation' },
            text: 'Close',
            on: { click: () => this.callbacks.onClose() },
          }),
        ]),
        this.titleEl,
        this.textEl,
        this.choicesEl,
        el('div', { class: 'dialogue__foot' }, [
          el('span', { text: '1–4 respond · ESC leave' }),
          el('span', { class: 'dialogue__sigil', attrs: { 'aria-hidden': 'true' }, text: '◈' }),
        ]),
      ],
    );
    this.speakerEl.id = 'dialogue-speaker';

    const backdrop = el('div', {
      class: 'overlay__backdrop',
      attrs: { 'aria-hidden': 'true' },
      on: { click: () => this.callbacks.onClose() },
    });
    this.root.append(backdrop, this.card);

    this.keyHandler = (event: KeyboardEvent) => {
      if (!this.isActive) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.callbacks.onClose();
        return;
      }
      const index = Number(event.key) - 1;
      if (Number.isInteger(index) && index >= 0) {
        const buttons = Array.from(this.choicesEl.querySelectorAll<HTMLButtonElement>('button'));
        if (buttons[index]) {
          event.preventDefault();
          event.stopPropagation();
          buttons[index].click();
        }
      }
    };
    window.addEventListener('keydown', this.keyHandler, true);
  }

  showSession(session: DialogueSession): void {
    this.setView(session.view);
    this.show();
    this.root.classList.add('is-active');
    requestAnimationFrame(() => this.focusFirstChoice());
  }

  setView(view: DialogueView): void {
    this.speakerEl.textContent = view.speaker;
    this.roleEl.textContent = view.role;
    this.titleEl.textContent = view.title;
    this.textEl.textContent = view.text;
    this.choicesEl.replaceChildren(
      ...view.choices.map((choice, index) =>
        el(
          'button',
          {
            class: `dialogue__choice${index === 0 ? ' is-first' : ''}`,
            attrs: { type: 'button', 'data-choice': choice.id },
            on: { click: () => this.callbacks.onChoose(choice.id) },
          },
          [
            el('span', { class: 'dialogue__choice-key', text: String(index + 1) }),
            el('span', { class: 'dialogue__choice-text', text: choice.text }),
          ],
        ),
      ),
    );
    requestAnimationFrame(() => this.focusFirstChoice());
  }

  private focusFirstChoice(): void {
    const first = this.choicesEl.querySelector<HTMLButtonElement>('button');
    first?.focus({ preventScroll: true });
  }

  markSolved(message: string): void {
    this.root.classList.add('is-solved');
    this.choicesEl.replaceChildren(
      el('p', { class: 'dialogue__solved', text: message }),
    );
  }

  override hide(): void {
    this.root.classList.remove('is-active', 'is-solved');
    super.hide();
  }

  override destroy(): void {
    window.removeEventListener('keydown', this.keyHandler, true);
    super.destroy();
  }
}
