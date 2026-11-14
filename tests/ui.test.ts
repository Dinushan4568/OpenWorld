// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../src/game/core/settings';
import { UiRoot, type UiCallbacks } from '../src/ui/UiRoot';
import type { TouchCallbacks } from '../src/ui/screens/TouchControls';

function harness() {
  document.body.innerHTML = '<div id="ui-root"></div>';
  document.body.className = '';
  const root = document.getElementById('ui-root') as HTMLElement;
  const store = new SettingsStore(null);
  const played: string[] = [];
  const callbacks: UiCallbacks = {
    onPlay: (mode) => played.push(mode),
    onResume: () => played.push('resume'),
    onQuit: () => played.push('quit'),
    onRetry: () => played.push('retry'),
  };
  const touch: TouchCallbacks = {
    onMove: () => {},
    onLook: () => {},
    onJump: () => {},
    onSprint: () => {},
    onPulse: () => {},
    onScan: () => {},
    onPause: () => {},
  };
  const ui = new UiRoot(root, store, callbacks, touch);
  return { ui, store, root, played };
}

describe('UI shell', () => {
  it('renders a specimen scan, danger readout and encounter letterbox', () => {
    const { ui, root } = harness();
    ui.hud.setSpecimens(2, 4);
    expect(root.querySelector('.hud__specimens')?.textContent).toBe('SPECIMENS 2 / 4');

    ui.hud.setDanger('VERDIGRIS WARDEN · WATCHING YOU · 18 M', 'alert');
    const danger = root.querySelector('.hud__danger') as HTMLElement;
    expect(danger.classList.contains('is-visible')).toBe(true);
    expect(danger.classList.contains('is-alert')).toBe(true);
    expect(danger.textContent).toContain('VERDIGRIS WARDEN');

    ui.hud.showScan({
      id: 'grazer-meadow',
      kind: 'grazer',
      name: 'Cinderhull Grazer',
      codename: 'GR-02',
      classification: 'Heavy grazer · quadrupedal mineral processor',
      temperament: 'Slow, patient, and utterly certain of its own weight.',
      behaviour: 'Walks a mineral circuit between meadow crusts.',
      diet: 'Iron-rich soil crust.',
      sizeLabel: 'Large — two storeys at the shoulder',
      massKg: 6800,
      heightMetres: 6.2,
      lengthMetres: 10.5,
      threat: 3,
      threatLabel: 'Territorial — keep your distance',
      state: 'patrol',
      stateLabel: 'Walking patrol',
      distance: 22,
      awareness: 0.2,
      weakness: {
        category: 'resonance',
        label: 'Resonance-blind knee servos',
        clue: 'Its knees tremble in time with the old reactor hum.',
        exploit: 'Pulse as it crosses the outflow and its stride stalls.',
      },
      scanned: 2,
      total: 4,
      firstScan: true,
    });
    const panel = root.querySelector('.hud__scan') as HTMLElement;
    expect(panel.classList.contains('is-visible')).toBe(true);
    expect(panel.textContent).toContain('Cinderhull Grazer');
    expect(panel.textContent).toContain('Resonance-blind knee servos');
    expect(panel.textContent).toContain('NEW SPECIMEN');
    expect(panel.textContent).toContain('Walking patrol');

    ui.hud.setCinematic(true);
    expect(ui.hud.root.classList.contains('is-cinematic')).toBe(true);
    ui.hud.setCinematic(false);
    expect(ui.hud.root.classList.contains('is-cinematic')).toBe(false);

    ui.hud.hideScan();
    expect(panel.classList.contains('is-visible')).toBe(false);
    ui.hud.setDanger(null);
    expect(danger.classList.contains('is-visible')).toBe(false);
  });

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows the loading screen and reports progress', () => {
    const { ui, root } = harness();
    ui.showLoading('Initialising renderer');
    ui.updateLoading('Loading props', 0.4);
    const loading = root.querySelector('.screen-loading') as HTMLElement;
    expect(loading.getAttribute('aria-hidden')).toBe('false');
    expect(loading.querySelector('.loading__status')?.textContent).toBe('Loading props');
  });

  it('renders a fresh menu and starts a new expedition from Play', () => {
    const { ui, root, played } = harness();
    ui.showMenu({ collected: 0, total: 5, playtime: 0, hasProgress: false });
    const menu = root.querySelector('.screen-menu') as HTMLElement;
    expect(menu.classList.contains('is-active')).toBe(true);
    expect(document.body.classList.contains('is-menu')).toBe(true);
    const play = [...menu.querySelectorAll('button')].find((b) => b.textContent?.includes('Play')) as HTMLButtonElement;
    expect(play).toBeTruthy();
    play.click();
    expect(played).toEqual(['new']);
  });

  it('offers Continue and New expedition when a save exists', () => {
    const { ui, root, played } = harness();
    ui.showMenu({ collected: 3, total: 5, playtime: 1200, hasProgress: true });
    const labels = [...root.querySelectorAll('.screen-menu button')].map((b) => b.textContent ?? '');
    expect(labels.some((label) => label.includes('Continue'))).toBe(true);
    expect(labels.some((label) => label.includes('New expedition'))).toBe(true);
    const cont = [...root.querySelectorAll('.screen-menu button')].find((b) => b.textContent?.includes('Continue')) as HTMLButtonElement;
    cont.click();
    expect(played).toEqual(['continue']);
  });

  it('opens and closes settings with Escape, returning to the menu', () => {
    const { ui, root } = harness();
    ui.showMenu({ collected: 0, total: 5, playtime: 0, hasProgress: false });
    ui.showSettings('menu');
    expect(ui.hasTransientOverlay).toBe(true);
    root.querySelector('.overlay--settings')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(ui.hasTransientOverlay).toBe(false);
    expect(ui.menu.isActive).toBe(true);
  });

  it('returns to the pause screen after settings opened from pause', () => {
    const { ui } = harness();
    ui.showPause({ shards: 2, total: 5, elapsed: '04:12', area: 'Mirrorwater Shore' });
    expect(ui.pause.isActive).toBe(true);
    ui.showSettings('pause');
    ui.closeSettings();
    expect(ui.pause.isActive).toBe(true);
    ui.hidePause();
    expect(ui.pause.isActive).toBe(false);
  });

  it('applies reduce-motion and grain preferences to the document', () => {
    const { ui, store, root } = harness();
    store.set('reduceMotion', true);
    expect(document.body.classList.contains('reduce-motion')).toBe(true);
    const grain = root.querySelector('.ui-grain') as HTMLElement;
    expect(grain.style.display).not.toBe('none');
    store.set('filmGrain', false);
    expect(grain.style.display).toBe('none');
    void ui;
  });

  it('activates the HUD and hides touch controls when they are disabled', () => {
    const { ui, store } = harness();
    store.set('touchControls', 'never');
    ui.showHud();
    expect(document.body.classList.contains('is-playing')).toBe(true);
    expect(ui.hud.isActive).toBe(true);
    expect(ui.touch.isActive).toBe(false);
  });
});
