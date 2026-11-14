import { SHARD_LOCATIONS } from '../../game/config';
import { el } from '../components/dom';
import type { ScanReport } from '../../game/creatures/types';
import { Screen } from './Screen';

export interface CompassMarker {
  bearing: number; // degrees, 0 = north, clockwise
  kind: 'shard' | 'gate';
}

interface ToastHandle {
  element: HTMLElement;
  timer: number;
}

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export class Hud extends Screen {
  private readonly locationEl: HTMLElement;
  private readonly coordsEl: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly objectiveEl: HTMLElement;
  private readonly pipsEl: HTMLElement;
  private readonly compassTrack: HTMLElement;
  private readonly compassHeading: HTMLElement;
  private readonly shardEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly fpsEl: HTMLElement;
  private readonly hints: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly promptLabel: HTMLElement;
  private readonly promptKey: HTMLElement;
  private readonly toasts: HTMLElement;
  private readonly bannerEl: HTMLElement;
  private readonly bannerTitle: HTMLElement;
  private readonly bannerSub: HTMLElement;
  private readonly waterEl: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly dangerEl: HTMLElement;
  private readonly dangerText: HTMLElement;
  private readonly specimensEl: HTMLElement;
  private readonly scanPanel: HTMLElement;
  private readonly scanCode: HTMLElement;
  private readonly scanName: HTMLElement;
  private readonly scanClass: HTMLElement;
  private readonly scanThreat: HTMLElement;
  private readonly scanGrid: HTMLElement;
  private readonly scanTemperament: HTMLElement;
  private readonly scanBehaviour: HTMLElement;
  private readonly scanClue: HTMLElement;
  private readonly scanExploit: HTMLElement;
  private readonly scanWeaknessLabel: HTMLElement;
  private readonly scanFooter: HTMLElement;
  private scanTimer = 0;
  private readonly ticks: Array<{ bearing: number; element: HTMLElement }> = [];
  private readonly markerElements: HTMLElement[] = [];
  private activeToasts: ToastHandle[] = [];
  private bannerTimer = 0;
  private tipsVisible = true;
  private hintTimer = 0;
  private readonly totalShards = SHARD_LOCATIONS.length;
  private currentHeading = 0;

  constructor() {
    super('hud');
    this.locationEl = el('div', { class: 'hud__location', text: 'Mirrorwater Valley' });
    this.coordsEl = el('div', { class: 'hud__coords', text: 'S 18 · E 08 · ALT 0 M' });
    this.clockEl = el('div', { class: 'hud__clock', text: '07:24 · Morning' });
    this.objectiveEl = el('p', {
      text: 'Recover the five Echo Shards. Follow the compass signals into the valley.',
    });
    this.pipsEl = el('div', { class: 'hud__pips' });
    for (let i = 0; i < this.totalShards; i++) {
      this.pipsEl.appendChild(el('span', { class: 'hud__pip', attrs: { 'aria-hidden': 'true' } }));
    }

    const objectiveCard = el('div', { class: 'hud__objective' }, [
      el('h3', { text: 'Active objective' }),
      this.objectiveEl,
      this.pipsEl,
    ]);

    this.compassTrack = el('div', { class: 'hud__compass-track' });
    const compass = el('div', { class: 'hud__compass', attrs: { 'aria-label': 'Compass' } }, [this.compassTrack]);
    this.compassHeading = el('div', { class: 'hud__compass-heading', text: 'N 000°' });
    this.buildCompass();
    const compassWrap = el('div', { class: 'hud__compass-wrap' }, [compass, this.compassHeading]);

    this.shardEl = el('div', { class: 'hud__shards' }, [
      el('span', { class: 'glyph', attrs: { 'aria-hidden': 'true' } }),
      el('span', { text: `0 / ${this.totalShards}` }),
    ]);
    this.statsEl = el('div', { class: 'hud__stats', text: '' });
    this.fpsEl = el('div', { class: 'hud__fps', text: '' });
    this.hints = el('div', { class: 'hud__hints' }, [
      el('div', {}, [el('kbd', { text: 'WASD' }), el('span', { text: 'Move' })]),
      el('div', {}, [el('kbd', { text: 'SHIFT' }), el('span', { text: 'Run' })]),
      el('div', {}, [el('kbd', { text: 'SPACE' }), el('span', { text: 'Vault' })]),
      el('div', {}, [el('kbd', { text: 'E' }), el('span', { text: 'Echo pulse' })]),
      el('div', {}, [el('kbd', { text: 'F' }), el('span', { text: 'Scan specimen' })]),
      el('div', {}, [el('kbd', { text: 'ESC' }), el('span', { text: 'Pause' })]),
    ]);
    this.promptLabel = el('span', { text: '' });
    this.promptKey = el('kbd', { text: 'E' });
    this.prompt = el('div', { class: 'hud__prompt' }, [this.promptKey, this.promptLabel]);
    this.toasts = el('div', { class: 'hud__toasts', attrs: { 'aria-live': 'polite' } });
    this.bannerTitle = el('h2', { text: '' });
    this.bannerSub = el('p', { text: '' });
    this.bannerEl = el('div', { class: 'hud__banner' }, [this.bannerTitle, this.bannerSub]);
    this.waterEl = el('div', { class: 'hud__water', attrs: { 'aria-hidden': 'true' } });
    this.crosshair = el('div', { class: 'hud__crosshair', attrs: { 'aria-hidden': 'true' } });

    this.dangerText = el('span', { class: 'hud__danger-text', text: '' });
    this.dangerEl = el('div', { class: 'hud__danger', attrs: { 'aria-live': 'polite' } }, [
      el('span', { class: 'hud__danger-dot', attrs: { 'aria-hidden': 'true' } }),
      this.dangerText,
    ]);
    this.specimensEl = el('div', { class: 'hud__specimens', text: 'SPECIMENS 0 / 4' });

    this.scanCode = el('span', { class: 'hud__scan-code', text: 'SC-00' });
    this.scanName = el('h2', { text: '' });
    this.scanClass = el('p', { class: 'hud__scan-class', text: '' });
    this.scanThreat = el('span', { class: 'hud__scan-threat', text: '' });
    this.scanGrid = el('div', { class: 'hud__scan-grid' });
    this.scanTemperament = el('p', { class: 'hud__scan-temperament', text: '' });
    this.scanBehaviour = el('p', { class: 'hud__scan-behaviour', text: '' });
    this.scanWeaknessLabel = el('h3', { text: 'Environmental weakness' });
    this.scanClue = el('p', { class: 'hud__scan-clue', text: '' });
    this.scanExploit = el('p', { class: 'hud__scan-exploit', text: '' });
    this.scanFooter = el('div', { class: 'hud__scan-footer', text: '' });
    this.scanPanel = el('aside', { class: 'hud__scan', attrs: { 'aria-live': 'polite' } }, [
      el('div', { class: 'hud__scan-head' }, [
        el('div', {}, [this.scanCode, this.scanName, this.scanClass]),
        this.scanThreat,
      ]),
      this.scanGrid,
      this.scanTemperament,
      this.scanBehaviour,
      el('div', { class: 'hud__scan-weakness' }, [
        this.scanWeaknessLabel,
        this.scanClue,
        this.scanExploit,
      ]),
      this.scanFooter,
    ]);

    const tl = el('div', { class: 'hud__tl' }, [this.locationEl, this.coordsEl, this.clockEl, objectiveCard]);
    const tr = el('div', { class: 'hud__tr' }, [this.shardEl, this.statsEl]);

    this.root.append(
      this.waterEl,
      this.crosshair,
      tl,
      compassWrap,
      tr,
      this.dangerEl,
      this.specimensEl,
      this.scanPanel,
      this.hints,
      this.prompt,
      this.toasts,
      this.bannerEl,
      this.fpsEl,
    );
  }

  private buildCompass(): void {
    for (let deg = 0; deg < 360; deg += 15) {
      const major = deg % 45 === 0;
      const label = major ? CARDINALS[deg / 45] : '';
      const tick = el('div', { class: `hud__compass-tick${major ? ' is-major' : ''}` }, [
        el('i', { attrs: { 'aria-hidden': 'true' } }),
        el('span', { text: label }),
      ]);
      tick.style.left = '50%';
      this.compassTrack.appendChild(tick);
      this.ticks.push({ bearing: deg, element: tick });
    }
    // Marker pool — reused each frame, no per-frame DOM churn.
    for (let i = 0; i < 6; i++) {
      const marker = el('div', { class: 'hud__compass-marker', style: { display: 'none' } });
      this.compassTrack.appendChild(marker);
      this.markerElements.push(marker);
    }
  }

  setLocation(name: string): void {
    if (this.locationEl.textContent === name) return;
    this.locationEl.textContent = name;
    this.locationEl.animate(
      [
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 650, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }

  setCoords(text: string): void {
    this.coordsEl.textContent = text;
  }

  /** In-world clock and phase of day, e.g. "18:42 · Sunset". */
  setClock(text: string): void {
    if (this.clockEl.textContent === text) return;
    this.clockEl.textContent = text;
  }

  setObjective(text: string): void {
    this.objectiveEl.textContent = text;
  }

  setShards(collected: number, total = this.totalShards): void {
    const shardText = this.shardEl.querySelector('span:last-child');
    if (shardText) shardText.textContent = `${collected} / ${total}`;
    Array.from(this.pipsEl.children).forEach((pip, index) => {
      pip.classList.toggle('is-filled', index < collected);
    });
  }

  setStats(text: string): void {
    this.statsEl.textContent = text;
  }

  setFps(text: string, visible: boolean): void {
    this.fpsEl.textContent = text;
    this.fpsEl.classList.toggle('is-visible', visible);
  }

  setHintsVisible(visible: boolean): void {
    this.tipsVisible = visible;
    this.hints.style.display = visible ? 'grid' : 'none';
  }

  dimHints(dimmed: boolean): void {
    this.hints.classList.toggle('is-dimmed', dimmed);
  }

  setWater(active: boolean): void {
    this.waterEl.classList.toggle('is-active', active);
  }

  setHeading(degrees: number, markers: CompassMarker[]): void {
    this.currentHeading = ((degrees % 360) + 360) % 360;
    const pxPerDegree = 2.9;
    for (const tick of this.ticks) {
      let diff = ((tick.bearing - this.currentHeading + 540) % 360) - 180;
      if (Math.abs(diff) > 74) {
        tick.element.style.visibility = 'hidden';
        continue;
      }
      tick.element.style.visibility = 'visible';
      tick.element.style.transform = `translate(-50%, 0) translateX(${diff * pxPerDegree}px)`;
    }
    this.markerElements.forEach((marker, index) => {
      const data = markers[index];
      if (!data) {
        marker.style.display = 'none';
        return;
      }
      let diff = ((data.bearing - this.currentHeading + 540) % 360) - 180;
      if (Math.abs(diff) > 74) {
        marker.style.display = 'none';
        return;
      }
      marker.style.display = 'block';
      marker.classList.toggle('is-gate', data.kind === 'gate');
      marker.style.transform = `translate(-50%, 0) translateX(${diff * pxPerDegree}px) rotate(45deg)`;
    });
    const cardinal = CARDINALS[Math.round(this.currentHeading / 45) % 8];
    this.compassHeading.textContent = `${cardinal} ${String(Math.round(this.currentHeading)).padStart(3, '0')}°`;
  }

  /** Shows a contextual prompt; pass a keycap only when a key actually triggers it. */
  showPrompt(label: string, keycap = ''): void {
    if (this.promptLabel.textContent !== label) this.promptLabel.textContent = label;
    this.promptKey.style.display = keycap ? 'inline-flex' : 'none';
    if (this.promptKey.textContent !== keycap) this.promptKey.textContent = keycap;
    this.prompt.classList.add('is-visible');
  }

  hidePrompt(): void {
    this.prompt.classList.remove('is-visible');
  }

  toast(text: string, kind: 'default' | 'accent' | 'warn' = 'default', duration = 3600): void {
    const element = el('div', { class: `toast${kind === 'default' ? '' : ` toast--${kind}`}`, text });
    this.toasts.appendChild(element);
    const handle: ToastHandle = {
      element,
      timer: window.setTimeout(() => this.dismissToast(handle), duration),
    };
    this.activeToasts.push(handle);
    while (this.activeToasts.length > 3) {
      const oldest = this.activeToasts.shift();
      if (oldest) this.dismissToast(oldest);
    }
  }

  private dismissToast(handle: ToastHandle): void {
    window.clearTimeout(handle.timer);
    const index = this.activeToasts.indexOf(handle);
    if (index >= 0) this.activeToasts.splice(index, 1);
    handle.element.classList.add('is-leaving');
    window.setTimeout(() => handle.element.remove(), 420);
  }

  banner(title: string, subtitle: string, duration = 4200): void {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = subtitle;
    this.bannerEl.classList.add('is-visible');
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => this.bannerEl.classList.remove('is-visible'), duration);
  }

  /** Compact danger readout used by the wildlife manager. */
  setDanger(text: string | null, level: 'warn' | 'alert' = 'warn'): void {
    if (!text) {
      this.dangerEl.classList.remove('is-visible', 'is-alert');
      return;
    }
    if (this.dangerText.textContent !== text) this.dangerText.textContent = text;
    this.dangerEl.classList.add('is-visible');
    this.dangerEl.classList.toggle('is-alert', level === 'alert');
  }

  /** Highlights the reticle when a robotic signature is inside the scan cone. */
  setScanReady(ready: boolean): void {
    this.crosshair.classList.toggle('is-scan', ready);
  }

  setSpecimens(scanned: number, total: number): void {
    const text = `SPECIMENS ${scanned} / ${total}`;
    if (this.specimensEl.textContent !== text) this.specimensEl.textContent = text;
    this.specimensEl.classList.toggle('is-complete', scanned >= total && total > 0);
  }

  get scanOpen(): boolean {
    return this.scanPanel.classList.contains('is-visible');
  }

  /** Populates the specimen panel with a scan report. */
  showScan(report: ScanReport): void {
    this.scanCode.textContent = report.codename;
    this.scanName.textContent = report.name;
    this.scanClass.textContent = report.classification;
    this.scanThreat.textContent = `THREAT ${report.threat} · ${report.threatLabel}`;
    this.scanThreat.classList.toggle('is-high', report.threat >= 4);
    this.scanGrid.replaceChildren(
      ...[
        ['STATE', report.stateLabel],
        ['DISTANCE', `${report.distance.toFixed(0)} m`],
        ['SIZE', report.sizeLabel],
        ['MASS', `${Math.round(report.massKg).toLocaleString()} kg`],
        ['HEIGHT', `${report.heightMetres.toFixed(1)} m`],
        ['AWARENESS', `${Math.round(report.awareness * 100)}%`],
      ].map(([label, value]) =>
        el('div', { class: 'hud__scan-stat' }, [
          el('span', { text: label }),
          el('strong', { text: value }),
        ]),
      ),
    );
    this.scanTemperament.textContent = report.temperament;
    this.scanBehaviour.textContent = report.behaviour;
    this.scanWeaknessLabel.textContent = `Environmental weakness · ${report.weakness.label}`;
    this.scanClue.textContent = report.weakness.clue;
    this.scanExploit.textContent = report.weakness.exploit;
    this.scanFooter.textContent = report.firstScan
      ? `NEW SPECIMEN · ${report.scanned} / ${report.total} species catalogued · F to re-scan`
      : `Specimen ${report.scanned} / ${report.total} species catalogued · F to re-scan`;
    this.scanPanel.classList.add('is-visible');
    window.clearTimeout(this.scanTimer);
    this.scanTimer = window.setTimeout(() => this.scanPanel.classList.remove('is-visible'), 18000);
  }

  hideScan(): void {
    window.clearTimeout(this.scanTimer);
    this.scanPanel.classList.remove('is-visible');
  }

  /** Letterbox the HUD for a cinematic encounter. */
  setCinematic(active: boolean): void {
    this.root.classList.toggle('is-cinematic', active);
  }

  /** Fades control hints after a while, then re-reveals them if the player idles. */
  tickHints(dt: number, moving: boolean): void {
    if (!this.tipsVisible) return;
    if (moving) {
      this.hintTimer = Math.min(this.hintTimer + dt, 12);
    } else {
      this.hintTimer = Math.max(this.hintTimer - dt * 2, 0);
    }
    this.hints.classList.toggle('is-dimmed', this.hintTimer >= 10);
  }

  override show(): void {
    super.show();
    this.root.classList.add('is-active');
  }

  override hide(): void {
    this.root.classList.remove('is-active');
    this.hidePrompt();
    for (const toast of [...this.activeToasts]) this.dismissToast(toast);
    this.bannerEl.classList.remove('is-visible');
    super.hide();
  }
}
