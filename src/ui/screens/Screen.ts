import { el } from '../components/dom';

/** Base class for declarative UI screens. */
export abstract class Screen {
  readonly root: HTMLElement;
  protected active = false;

  constructor(className: string, tag: 'div' | 'section' = 'div') {
    this.root = el(tag, { class: className });
    this.root.setAttribute('aria-hidden', 'true');
  }

  mount(parent: HTMLElement): this {
    parent.appendChild(this.root);
    return this;
  }

  show(): void {
    this.active = true;
    this.root.setAttribute('aria-hidden', 'false');
  }

  hide(): void {
    this.active = false;
    this.root.setAttribute('aria-hidden', 'true');
  }

  get isActive(): boolean {
    return this.active;
  }

  destroy(): void {
    this.root.remove();
    this.active = false;
  }
}
