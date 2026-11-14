import { GAME } from '../../game/config';
import { el } from '../components/dom';
import { Screen } from './Screen';

const BLOCKS: ReadonlyArray<{ title: string; lines: string[]; note?: string }> = [
  {
    title: 'Studio',
    lines: ['Hollow Lantern Studio'],
    note: 'An independent expedition into quiet, ruined worlds.',
  },
  {
    title: 'World & narrative design',
    lines: ['The Echoes setting', 'Mirrorwater valley', 'The Gate and its keepers'],
    note: 'All locations, factions, language and artefacts are original works of fiction.',
  },
  {
    title: 'Engineering',
    lines: ['Engine architecture & rendering', 'Terrain, traversal and camera systems', 'Interface & accessibility'],
    note: 'TypeScript, strict mode. Built as a modular, testable game architecture.',
  },
  {
    title: 'Environment',
    lines: ['Procedural heightfield terrain', 'Original GLB props, ruins and the Wayfarer character', 'Procedural sky, textures, atmosphere and gait synthesis'],
    note: 'No third-party art, models, textures or scans are used.',
  },
  {
    title: 'Audio',
    lines: ['Synthesised ambience & wind', 'Echo chimes & locomotion foley'],
    note: 'Generated live with the Web Audio API.',
  },
  {
    title: 'Technology',
    lines: ['PlayCanvas Engine 2.x', 'Vite · TypeScript'],
    note: 'WebGL 2 with WebGPU where supported. glTF 2.0 asset pipeline.',
  },
  {
    title: 'Phase 01 — Foundation',
    lines: ['Rendering, world, traversal, interface', 'Objective: recover five echoes'],
    note: 'Phase 02 rebuilt the expedition and its controller.',
  },
  {
    title: 'Phase 03 — The living valley',
    lines: ['Five regions, streamed chunk content', 'Crystal River & waterfalls · day/night cycle'],
    note: 'The valley beyond the gate is open to explore.',
  },
];

export interface CreditsScreenCallbacks {
  onClose: () => void;
}

export class CreditsScreen extends Screen {
  private readonly callbacks: CreditsScreenCallbacks;

  constructor(callbacks: CreditsScreenCallbacks) {
    super('credits');
    this.callbacks = callbacks;

    const close = (label = 'Back'): HTMLButtonElement =>
      el('button', {
        class: 'btn btn--ghost',
        attrs: { type: 'button' },
        text: label,
        on: { click: () => this.callbacks.onClose() },
      });

    const head = el('div', { class: 'credits__head' }, [
      el('div', { class: 'kicker', text: `${GAME.studio} presents` }),
      close(),
    ]);

    const title = el('div', { class: 'credits__title' }, [
      el('h2', { text: GAME.title }),
      el('p', { text: 'Expedition credits' }),
    ]);

    const grid = el('div', { class: 'credits__grid' });
    for (const block of BLOCKS) {
      grid.appendChild(
        el('div', { class: 'credit-block' }, [
          el('h3', { text: block.title }),
          el('p', {}, block.lines.map((line) => el('span', { text: line, style: { display: 'block' } }))),
          block.note ? el('small', { text: block.note }) : null,
        ]),
      );
    }

    const legal = el('div', { class: 'credits__legal' }, [
      el('span', { text: '© 2026 Hollow Lantern Studio. Original work of interactive fiction.' }),
      el('span', { text: `Version ${GAME.version} · ${GAME.phase}` }),
    ]);

    this.root.append(
      head,
      el('div', { class: 'credits__scroll' }, [title, grid]),
      legal,
    );
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Credits');

    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.callbacks.onClose();
      }
    });
  }

  override show(): void {
    super.show();
    this.root.classList.add('is-active');
    const scrollArea = this.root.querySelector<HTMLElement>('.credits__scroll');
    if (scrollArea) scrollArea.scrollTop = 0;
    requestAnimationFrame(() => this.root.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }));
  }

  override hide(): void {
    this.root.classList.remove('is-active');
    super.hide();
  }
}
