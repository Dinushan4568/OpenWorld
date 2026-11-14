import { el } from '../components/dom';

export interface FatalErrorOptions {
  title: string;
  message: string;
  detail?: string;
  retryLabel?: string;
  onRetry?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/** Full-screen failure state that never leaves the player on a dead canvas. */
export class FatalErrorScreen {
  readonly root: HTMLElement;

  constructor(options: FatalErrorOptions) {
    const actions = el('div', { class: 'fatal__actions' });
    if (options.onRetry) {
      actions.appendChild(
        el('button', {
          class: 'btn btn--primary',
          attrs: { type: 'button' },
          text: options.retryLabel ?? 'Try again',
          on: {
            click: () => {
              this.destroy();
              options.onRetry?.();
            },
          },
        }),
      );
    }
    if (options.onSecondary) {
      actions.appendChild(
        el('button', {
          class: 'btn btn--ghost',
          attrs: { type: 'button' },
          text: options.secondaryLabel ?? 'Reload',
          on: {
            click: () => {
              this.destroy();
              options.onSecondary?.();
            },
          },
        }),
      );
    }

    const card = el('div', { class: 'fatal__card', attrs: { role: 'alertdialog', 'aria-label': options.title } }, [
      el('div', { class: 'kicker', text: 'Expedition interrupted' }),
      el('h1', { text: options.title }),
      el('p', { text: options.message }),
      options.detail ? el('pre', { class: 'fatal__detail', text: options.detail }) : null,
      actions,
      el('p', {
        style: { fontSize: '10px', color: 'var(--muted)', margin: '0' },
        text: 'If the problem persists, check the browser console for diagnostics. WebGL 2 or WebGPU is required.',
      }),
    ]);

    this.root = el('div', { class: 'fatal' }, [card]);
    this.root.style.pointerEvents = 'all';
    document.body.appendChild(this.root);
  }

  destroy(): void {
    this.root.remove();
  }
}
