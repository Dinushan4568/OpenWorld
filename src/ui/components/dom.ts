/** Tiny DOM builder + reusable form controls. Keeps screens declarative and testable. */

export interface ElementProps {
  class?: string;
  text?: string;
  html?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  dataset?: Record<string, string>;
  style?: Partial<CSSStyleDeclaration>;
  on?: Partial<Record<keyof HTMLElementEventMap, (event: Event) => void>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  children: Array<Node | string | null | undefined> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.html !== undefined) node.innerHTML = props.html;
  if (props.attrs) {
    for (const [key, value] of Object.entries(props.attrs)) {
      if (value === null || value === undefined || value === false) continue;
      node.setAttribute(key, String(value));
    }
  }
  if (props.dataset) Object.assign(node.dataset, props.dataset);
  if (props.style) Object.assign(node.style, props.style);
  if (props.on) {
    for (const [event, handler] of Object.entries(props.on)) {
      if (handler) node.addEventListener(event, handler as EventListener);
    }
  }
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function svgIcon(path: string, size = 16, viewBox = '0 0 24 24'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  p.setAttribute('stroke', 'currentColor');
  p.setAttribute('stroke-width', '1.5');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  svg.appendChild(p);
  return svg;
}

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger';

export interface ButtonOptions {
  label: string;
  variant?: ButtonVariant;
  onClick?: (event: MouseEvent) => void;
  shortcut?: string;
  icon?: SVGSVGElement;
  title?: string;
  ariaLabel?: string;
}

export function createButton(options: ButtonOptions): HTMLButtonElement {
  const { label, variant = 'default', onClick, shortcut, icon, title, ariaLabel } = options;
  const classes = ['btn'];
  if (variant !== 'default') classes.push(`btn--${variant}`);
  const btn = el('button', {
    class: classes.join(' '),
    attrs: { type: 'button', 'aria-label': ariaLabel ?? label, ...(title ? { title } : {}) },
  });
  if (icon) btn.appendChild(icon);
  btn.appendChild(el('span', { class: 'btn__label', text: label }));
  if (shortcut) btn.appendChild(el('span', { class: 'btn__key', text: shortcut }));
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

export interface SliderFieldOptions {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (value: number) => string;
  onChange: (value: number) => void;
}

export interface FieldControl {
  element: HTMLElement;
}

export interface SliderControl extends FieldControl {
  setValue: (value: number) => void;
}

export interface ToggleControl extends FieldControl {
  setChecked: (value: boolean) => void;
}

export interface SegmentedControl<T extends string> extends FieldControl {
  setSelected: (value: T) => void;
}

export function createSliderField(options: SliderFieldOptions): SliderControl {
  const { label, hint, min, max, step, value, format, onChange } = options;
  const valueEl = el('span', { class: 'field__value', text: (format ?? String)(value) });
  const input = el('input', {
    class: 'slider',
    attrs: {
      type: 'range',
      min: String(min),
      max: String(max),
      step: String(step),
      value: String(value),
      'aria-label': label,
    },
  });
  const paint = (v: number): void => {
    input.style.setProperty('--fill', `${((v - min) / (max - min || 1)) * 100}%`);
    valueEl.textContent = (format ?? String)(v);
  };
  paint(value);
  input.addEventListener('input', () => {
    const next = Number(input.value);
    paint(next);
    onChange(next);
  });
  const wrapper = el('div', { class: 'field' }, [
    el('div', { class: 'field__top' }, [el('span', { class: 'field__label', text: label }), valueEl]),
    input,
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  ]);
  return {
    element: wrapper,
    setValue: (v: number) => {
      input.value = String(v);
      paint(v);
    },
  };
}

export interface ToggleFieldOptions {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function createToggleField(options: ToggleFieldOptions): ToggleControl {
  const { label, hint, value, onChange } = options;
  const button = el('button', {
    class: 'switch',
    attrs: { type: 'button', role: 'switch', 'aria-checked': String(value), 'aria-label': label },
    on: {
      click: () => {
        const next = button.getAttribute('aria-checked') !== 'true';
        button.setAttribute('aria-checked', String(next));
        onChange(next);
      },
    },
  });
  const wrapper = el('div', { class: 'field' }, [
    el('div', { class: 'field__top' }, [
      el('span', { class: 'field__label', text: label }),
      button,
    ]),
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  ]);
  return {
    element: wrapper,
    setChecked: (v: boolean) => button.setAttribute('aria-checked', String(v)),
  };
}

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export interface SegmentedFieldOptions<T extends string> {
  label: string;
  hint?: string;
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
}

export function createSegmentedField<T extends string>(options: SegmentedFieldOptions<T>): SegmentedControl<T> {
  const { label, hint, options: choices, value, onChange } = options;
  const group = el('div', { class: 'segmented', attrs: { role: 'group', 'aria-label': label } });
  const buttons = choices.map((choice) => {
    const btn = el('button', {
      text: choice.label,
      attrs: {
        type: 'button',
        'aria-pressed': String(choice.value === value),
        ...(choice.title ? { title: choice.title } : {}),
      },
      on: {
        click: () => {
          for (const b of buttons) b.setAttribute('aria-pressed', String(b === btn));
          onChange(choice.value);
        },
      },
    });
    group.appendChild(btn);
    return btn;
  });
  const wrapper = el('div', { class: 'field' }, [
    el('div', { class: 'field__top' }, [
      el('span', { class: 'field__label', text: label }),
      group,
    ]),
    hint ? el('span', { class: 'field__hint', text: hint }) : null,
  ]);
  const setSelected = (v: T): void => {
    const index = Math.max(0, choices.findIndex((choice) => choice.value === v));
    buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === index)));
  };
  return { element: wrapper, setSelected };
}

/** Focus trap helpers used by modal overlays. */
export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

export function trapFocus(container: HTMLElement): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    if (event.key !== 'Tab') return;
    const nodes = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (node) => node.offsetParent !== null,
    );
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
}
