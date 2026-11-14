import type { TouchMode } from '../../game/core/settings';
import { el } from '../components/dom';

export interface TouchCallbacks {
  onMove: (x: number, y: number) => void;
  onLook: (dx: number, dy: number) => void;
  onJump: () => void;
  onSprint: (active: boolean) => void;
  onPulse: () => void;
  onScan: () => void;
  onPause: () => void;
}

/** Thumb-stick and action buttons for touch-first devices. */
export class TouchControls {
  readonly root: HTMLElement;
  private readonly callbacks: TouchCallbacks;
  private readonly stick: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly lookArea: HTMLElement;
  private readonly sprintButton: HTMLButtonElement;
  private stickPointer: number | null = null;
  private lookPointer: number | null = null;
  private lastLook = { x: 0, y: 0 };
  private sprint = false;
  private enabled = false;

  constructor(callbacks: TouchCallbacks) {
    this.callbacks = callbacks;
    this.knob = el('div', { class: 'touch__knob' });
    this.stick = el('div', { class: 'touch__stick', attrs: { 'aria-label': 'Movement stick' } }, [this.knob]);
    this.lookArea = el('div', { class: 'touch__look', attrs: { 'aria-hidden': 'true' } });

    const jump = el('button', { class: 'touch__btn', attrs: { type: 'button' }, text: 'Jump' });
    const pulse = el('button', { class: 'touch__btn touch__btn--pulse', attrs: { type: 'button' }, text: 'Pulse' });
    const scan = el('button', { class: 'touch__btn touch__btn--scan', attrs: { type: 'button' }, text: 'Scan' });
    this.sprintButton = el('button', {
      class: 'touch__btn',
      attrs: { type: 'button', 'aria-pressed': 'false' },
      text: 'Run',
    });
    const pause = el('button', {
      class: 'touch__btn touch__pause',
      attrs: { type: 'button', 'aria-label': 'Pause' },
      html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    });

    const buttons = el('div', { class: 'touch__buttons' }, [pause, scan, pulse, jump, this.sprintButton]);
    this.root = el('div', { class: 'touch' }, [this.lookArea, this.stick, buttons]);

    this.bindStick();
    this.bindLook();
    jump.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.callbacks.onJump();
    });
    pulse.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.callbacks.onPulse();
    });
    scan.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.callbacks.onScan();
    });
    pause.addEventListener('click', () => this.callbacks.onPause());
    this.sprintButton.addEventListener('click', () => {
      this.sprint = !this.sprint;
      this.sprintButton.setAttribute('aria-pressed', String(this.sprint));
      this.sprintButton.style.borderColor = this.sprint ? 'rgba(255, 178, 107, 0.8)' : '';
      this.callbacks.onSprint(this.sprint);
    });
  }

  private bindStick(): void {
    const radius = 52;
    const update = (event: PointerEvent): void => {
      const rect = this.stick.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = event.clientX - cx;
      let dy = event.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > radius) {
        dx = (dx / len) * radius;
        dy = (dy / len) * radius;
      }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.callbacks.onMove(dx / radius, -dy / radius);
    };
    this.stick.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.stickPointer = event.pointerId;
      this.stick.setPointerCapture(event.pointerId);
      this.stick.style.borderColor = 'rgba(255, 178, 107, 0.6)';
      update(event);
    });
    this.stick.addEventListener('pointermove', (event) => {
      if (this.stickPointer !== event.pointerId) return;
      update(event);
    });
    const release = (event: PointerEvent): void => {
      if (this.stickPointer !== event.pointerId) return;
      this.stickPointer = null;
      this.knob.style.transform = 'translate(0, 0)';
      this.stick.style.borderColor = '';
      this.callbacks.onMove(0, 0);
    };
    this.stick.addEventListener('pointerup', release);
    this.stick.addEventListener('pointercancel', release);
  }

  private bindLook(): void {
    this.lookArea.addEventListener('pointerdown', (event) => {
      this.lookPointer = event.pointerId;
      this.lastLook = { x: event.clientX, y: event.clientY };
      this.lookArea.setPointerCapture(event.pointerId);
    });
    this.lookArea.addEventListener('pointermove', (event) => {
      if (this.lookPointer !== event.pointerId) return;
      const dx = event.clientX - this.lastLook.x;
      const dy = event.clientY - this.lastLook.y;
      this.lastLook = { x: event.clientX, y: event.clientY };
      this.callbacks.onLook(dx, dy);
    });
    const release = (event: PointerEvent): void => {
      if (this.lookPointer === event.pointerId) this.lookPointer = null;
    };
    this.lookArea.addEventListener('pointerup', release);
    this.lookArea.addEventListener('pointercancel', release);
  }

  reset(): void {
    this.knob.style.transform = 'translate(0, 0)';
    this.callbacks.onMove(0, 0);
    this.sprint = false;
    this.sprintButton.setAttribute('aria-pressed', 'false');
    this.sprintButton.style.borderColor = '';
    this.callbacks.onSprint(false);
  }

  show(): void {
    this.enabled = true;
    this.root.classList.add('is-active');
  }

  hide(): void {
    this.enabled = false;
    this.root.classList.remove('is-active');
    this.reset();
  }

  get isActive(): boolean {
    return this.enabled;
  }

  static shouldEnable(mode: TouchMode): boolean {
    if (mode === 'always') return true;
    if (mode === 'never') return false;
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(pointer: coarse)').matches || window.matchMedia?.('(hover: none)').matches;
  }
}
