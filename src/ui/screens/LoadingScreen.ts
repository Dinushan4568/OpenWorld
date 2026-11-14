import { GAME } from '../../game/config';
import { el } from '../components/dom';
import { Screen } from './Screen';

const TIPS = [
  'Hold Shift to run. The valley is large, and the light is not patient.',
  'Press E to release an Echo Pulse. It reveals shards and ancient machinery nearby.',
  'Steep ridges can be climbed from the gentler western slope.',
  'Your survey drone records everything. It will follow you into the grove.',
  'The Echo Gate answers to all five shards. Bring them home.',
  'Look for bioluminescent growth — it marks the paths the old ones walked.',
  'You can wade the shallows of Mirrorwater, but deep water will slow you down.',
];

export class LoadingScreen extends Screen {
  private readonly bar: HTMLElement;
  private readonly percent: HTMLElement;
  private readonly status: HTMLElement;
  private readonly engine: HTMLElement;
  private readonly tip: HTMLElement;
  private readonly tipIndex: { value: number };
  private tipTimer: number | null = null;
  private progress = 0;
  private targetProgress = 0;
  private completed = false;

  constructor() {
    super('screen-loading');
    this.tipIndex = { value: Math.floor(Math.random() * TIPS.length) };

    const sigil = el('div', { class: 'loading__sigil' });
    sigil.innerHTML = `
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <linearGradient id="sigilGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="#ffb26b" stop-opacity="0.9"/>
            <stop offset="100%" stop-color="#79f0cf" stop-opacity="0.2"/>
          </linearGradient>
        </defs>
        <g class="loading__ring">
          <circle cx="100" cy="100" r="78" fill="none" stroke="url(#sigilGrad)" stroke-width="0.8" stroke-dasharray="2 7"/>
          <circle cx="100" cy="100" r="62" fill="none" stroke="#f2ecdf" stroke-opacity="0.16" stroke-width="0.7"/>
        </g>
        <g class="loading__ring loading__ring--rev">
          <circle cx="100" cy="100" r="48" fill="none" stroke="#79f0cf" stroke-opacity="0.45" stroke-width="0.8" stroke-dasharray="18 34"/>
          <line x1="100" y1="14" x2="100" y2="30" stroke="#ffb26b" stroke-width="1.2"/>
          <line x1="100" y1="170" x2="100" y2="186" stroke="#ffb26b" stroke-width="1.2"/>
        </g>
        <circle cx="100" cy="100" r="9" fill="#ffb26b" fill-opacity="0.16" stroke="#ffb26b" stroke-width="0.9"/>
        <circle cx="100" cy="100" r="2.6" fill="#ffb26b"/>
      </svg>`;
    const core = el('div', { class: 'loading__core', text: 'Ω' });
    sigil.appendChild(core);

    this.status = el('span', { class: 'loading__status', text: 'Booting expedition core' });
    this.percent = el('span', { text: '0%' });
    this.bar = el('div', { class: 'loading__bar' });
    this.tip = el('div', { class: 'loading__tip' });
    this.tip.innerHTML = `<span>Field note</span><p></p>`;
    this.engine = el('div', { class: 'loading__engine', text: 'initialising' });

    const titleBlock = el('div', { class: 'loading__wordmark' }, [
      el('h1', { class: 'loading__title', text: 'Echoes of the Lost World' }),
      el('p', { class: 'loading__subtitle', text: 'An original expedition in five echoes' }),
    ]);

    const progressBlock = el('div', { class: 'loading__progress-wrap' }, [
      el('div', { class: 'loading__meta' }, [this.status, this.percent]),
      el('div', { class: 'loading__track' }, [this.bar]),
    ]);

    const center = el('div', { class: 'loading__center' }, [sigil, titleBlock, progressBlock]);
    const top = el('div', { class: 'loading__top' }, [
      el('span', {}, [el('strong', { text: GAME.studio })]),
      el('span', { text: `${GAME.phase} · ${GAME.version}` }),
    ]);
    const bottom = el('div', { class: 'loading__bottom' }, [
      this.tip,
      el('div', { class: 'loading__engine' }, [this.engine]),
    ]);
    this.root.append(top, center, bottom);
    this.engine.textContent = 'Preparing renderer';
    this.showTip();
    this.tipTimer = window.setInterval(() => this.showTip(), 5200);
  }

  override show(): void {
    super.show();
    this.root.classList.remove('is-hidden');
    this.completed = false;
    this.progress = 0;
    this.targetProgress = 0;
    this.bar.style.width = '0%';
    this.percent.textContent = '0%';
    this.startAnimation();
  }

  override hide(): void {
    this.root.classList.add('is-hidden');
    this.active = false;
    this.root.setAttribute('aria-hidden', 'true');
  }

  setStatus(text: string, progress?: number): void {
    this.status.textContent = text;
    if (typeof progress === 'number') this.targetProgress = Math.max(this.targetProgress, Math.min(1, progress));
  }

  setEngineInfo(text: string): void {
    this.engine.textContent = text;
  }

  private showTip(): void {
    const p = this.tip.querySelector('p');
    this.tip.classList.remove('is-visible');
    window.setTimeout(() => {
      if (p) p.textContent = TIPS[this.tipIndex.value % TIPS.length];
      this.tipIndex.value += 1;
      this.tip.classList.add('is-visible');
    }, 320);
  }

  private startAnimation(): void {
    const tick = (): void => {
      if (this.completed) return;
      this.progress += (this.targetProgress - this.progress) * 0.12;
      if (this.targetProgress - this.progress < 0.002) this.progress = this.targetProgress;
      const pct = Math.round(this.progress * 100);
      this.bar.style.width = `${this.progress * 100}%`;
      this.percent.textContent = `${pct}%`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  async complete(): Promise<void> {
    this.completed = true;
    this.bar.style.width = '100%';
    this.percent.textContent = '100%';
    this.status.textContent = 'Expedition ready';
    await new Promise((resolve) => window.setTimeout(resolve, 420));
    this.root.classList.add('is-hidden');
    this.active = false;
    this.root.setAttribute('aria-hidden', 'true');
    if (this.tipTimer !== null) {
      window.clearInterval(this.tipTimer);
      this.tipTimer = null;
    }
    await new Promise((resolve) => window.setTimeout(resolve, 800));
  }
}
