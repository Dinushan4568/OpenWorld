/**
 * Keyboard / mouse / pointer-lock input. Touch input is fed in from the UI layer.
 * Kept independent of PlayCanvas so it can be exercised in a DOM test harness.
 */
export interface InputCallbacks {
  onPause: () => void;
  onPulse: () => void;
  onToggleFps: () => void;
  onToggleMute: () => void;
  onPointerLockLost: () => void;
}

export class InputManager {
  private readonly canvas: HTMLCanvasElement;
  private readonly callbacks: InputCallbacks;
  private keys = new Set<string>();
  private pressed = new Set<string>();
  private lookX = 0;
  private lookY = 0;
  private wheelDelta = 0;
  private touch = { x: 0, y: 0 };
  private touchSprint = false;
  private touchJump = false;
  private dragging = false;
  private lastDrag = { x: 0, y: 0 };
  private enabled = false;
  private pointerLocked = false;
  private lastPointerLockRequest = 0;
  private readonly listeners: Array<() => void> = [];

  constructor(canvas: HTMLCanvasElement, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.callbacks = callbacks;
    this.bind();
  }

  private listen(
    target: EventTarget,
    type: string,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type, handler, options);
    this.listeners.push(() => target.removeEventListener(type, handler, options));
  }

  private bind(): void {
    this.listen(document, 'keydown', (event) => this.onKeyDown(event as KeyboardEvent));
    this.listen(document, 'keyup', (event) => this.onKeyUp(event as KeyboardEvent));
    this.listen(document, 'pointermove', (event) => this.onPointerMove(event as PointerEvent));
    this.listen(document, 'wheel', (event) => this.onWheel(event as WheelEvent), { passive: false });
    this.listen(document, 'mousedown', (event) => this.onPointerDown(event as MouseEvent));
    this.listen(document, 'mouseup', () => {
      this.dragging = false;
    });
    this.listen(window, 'blur', () => this.releaseAll());
    this.listen(document, 'visibilitychange', () => {
      if (document.hidden) this.releaseAll();
    });
    this.listen(document, 'contextmenu', (event) => {
      if (this.enabled) event.preventDefault();
    });

    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    this.listeners.push(() => {
      document.removeEventListener('pointerlockchange', this.onPointerLockChange);
      document.removeEventListener('pointerlockerror', this.onPointerLockError);
    });
  }

  private onKeyDown(event: KeyboardEvent): void {
    // Overlays (settings, credits) handle Escape themselves and mark it handled.
    if (event.defaultPrevented) return;
    if (event.code === 'F3') {
      event.preventDefault();
      this.callbacks.onToggleFps();
      return;
    }
    if (event.code === 'Escape') {
      this.callbacks.onPause();
      return;
    }
    if (!this.enabled) return;

    if (event.code === 'KeyM') {
      this.callbacks.onToggleMute();
      return;
    }
    if (event.code === 'KeyE' && !event.repeat) {
      this.callbacks.onPulse();
    }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) {
      event.preventDefault();
    }
    if (!event.repeat) this.pressed.add(event.code);
    this.keys.add(event.code);
  }

  private onKeyUp(event: KeyboardEvent): void {
    this.keys.delete(event.code);
  }

  private onPointerMove(event: PointerEvent): void {
    if (!this.enabled) return;
    if (this.pointerLocked) {
      this.lookX += event.movementX ?? 0;
      this.lookY += event.movementY ?? 0;
      return;
    }
    if (this.dragging) {
      this.lookX += event.clientX - this.lastDrag.x;
      this.lookY += event.clientY - this.lastDrag.y;
      this.lastDrag = { x: event.clientX, y: event.clientY };
    }
  }

  private onPointerDown(event: MouseEvent): void {
    if (!this.enabled) return;
    if (event.button !== 0) return;
    // Fallback for browsers without pointer lock: drag to look.
    if (!this.pointerLocked) {
      const elapsed = performance.now() - this.lastPointerLockRequest;
      if (elapsed > 400) {
        this.dragging = true;
        this.lastDrag = { x: event.clientX, y: event.clientY };
      }
    }
  }

  private onWheel(event: WheelEvent): void {
    if (!this.enabled) return;
    event.preventDefault();
    this.wheelDelta += event.deltaY;
  }

  private onPointerLockChange = (): void => {
    const locked = document.pointerLockElement === this.canvas;
    const wasLocked = this.pointerLocked;
    this.pointerLocked = locked;
    if (!locked && wasLocked) {
      this.releaseAll();
      this.callbacks.onPointerLockLost();
    }
  };

  private onPointerLockError = (): void => {
    console.warn('[input] pointer lock request was rejected; falling back to click-drag look.');
    this.pointerLocked = false;
  };

  requestPointerLock(): Promise<void> {
    this.lastPointerLockRequest = performance.now();
    if (document.pointerLockElement === this.canvas) return Promise.resolve();
    try {
      const request = this.canvas.requestPointerLock() as unknown;
      if (request && typeof (request as Promise<void>).then === 'function') {
        return (request as Promise<void>).catch((error) => {
          console.warn('[input] pointer lock unavailable', error);
        });
      }
    } catch (error) {
      console.warn('[input] pointer lock failed', error);
    }
    return Promise.resolve();
  }

  exitPointerLock(): void {
    if (document.pointerLockElement === this.canvas) {
      try {
        document.exitPointerLock();
      } catch {
        /* ignore */
      }
    }
    this.pointerLocked = false;
  }

  get isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.releaseAll();
  }

  releaseAll(): void {
    this.keys.clear();
    this.pressed.clear();
    this.lookX = 0;
    this.lookY = 0;
    this.wheelDelta = 0;
    this.touch = { x: 0, y: 0 };
    this.touchJump = false;
    this.dragging = false;
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  consumePress(code: string): boolean {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  consumeLook(): { x: number; y: number } {
    const look = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return look;
  }

  consumeWheel(): number {
    const delta = this.wheelDelta;
    this.wheelDelta = 0;
    return delta;
  }

  endFrame(): void {
    this.pressed.clear();
  }

  setTouchMove(x: number, y: number): void {
    this.touch = { x, y };
  }

  setTouchSprint(active: boolean): void {
    this.touchSprint = active;
  }

  setTouchJump(): void {
    if (this.enabled) this.touchJump = true;
  }

  addTouchLook(dx: number, dy: number): void {
    if (!this.enabled) return;
    this.lookX += dx * 1.1;
    this.lookY += dy * 1.1;
  }

  moveAxis(): { x: number; y: number } {
    let x = (this.isDown('KeyD') || this.isDown('ArrowRight') ? 1 : 0) - (this.isDown('KeyA') || this.isDown('ArrowLeft') ? 1 : 0);
    let y = (this.isDown('KeyW') || this.isDown('ArrowUp') ? 1 : 0) - (this.isDown('KeyS') || this.isDown('ArrowDown') ? 1 : 0);
    if (Math.abs(this.touch.x) > 0.05 || Math.abs(this.touch.y) > 0.05) {
      x = this.touch.x;
      y = this.touch.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  get wantsSprint(): boolean {
    return this.isDown('ShiftLeft') || this.isDown('ShiftRight') || this.touchSprint;
  }

  get wantsJump(): boolean {
    const keyboard = this.consumePress('Space');
    const touch = this.touchJump;
    this.touchJump = false;
    return keyboard || touch;
  }

  dispose(): void {
    for (const off of this.listeners) off();
    this.listeners.length = 0;
    this.releaseAll();
  }
}
