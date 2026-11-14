import type { SettingsStore } from '../game/core/settings';
import type { ProgressSummary } from './screens/MainMenu';
import { MainMenu } from './screens/MainMenu';
import { LoadingScreen } from './screens/LoadingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { CreditsScreen } from './screens/CreditsScreen';
import { PauseScreen, type PauseStats } from './screens/PauseScreen';
import { Hud } from './screens/Hud';
import { TouchControls, type TouchCallbacks } from './screens/TouchControls';
import { FatalErrorScreen, type FatalErrorOptions } from './screens/FatalErrorScreen';
import { el } from './components/dom';

export interface UiCallbacks {
  onPlay: (mode: 'new' | 'continue') => void;
  onResume: () => void;
  onQuit: () => void;
  onRetry: () => void;
}

export type OverlayKind = 'settings' | 'credits' | 'pause' | null;

/** Owns every DOM surface above the canvas and the transitions between them. */
export class UiRoot {
  readonly loading: LoadingScreen;
  readonly menu: MainMenu;
  readonly hud: Hud;
  readonly touch: TouchControls;
  readonly pause: PauseScreen;
  readonly settings: SettingsScreen;
  readonly credits: CreditsScreen;
  private readonly atmosphere: HTMLElement;
  private readonly fade: HTMLElement;
  private readonly callbacks: UiCallbacks;
  private readonly store: SettingsStore;
  private readonly unsubscribe: () => void;
  private overlay: OverlayKind = null;
  private settingsReturn: 'menu' | 'pause' = 'menu';
  private fatal: FatalErrorScreen | null = null;

  constructor(
    root: HTMLElement,
    store: SettingsStore,
    callbacks: UiCallbacks,
    touchCallbacks: TouchCallbacks,
  ) {
    this.store = store;
    this.callbacks = callbacks;

    this.atmosphere = el('div', { class: 'ui-atmosphere', attrs: { 'aria-hidden': 'true' } }, [
      el('div', { class: 'ui-vignette', style: { position: 'absolute', inset: '0' } }),
      el('div', { class: 'ui-grain', style: { position: 'absolute', inset: '0' } }),
    ]);

    this.loading = new LoadingScreen();
    this.menu = new MainMenu({
      onPlay: (mode) => this.callbacks.onPlay(mode),
      onSettings: () => this.showSettings('menu'),
      onCredits: () => this.showCredits(),
    });
    this.hud = new Hud();
    this.touch = new TouchControls(touchCallbacks);
    this.pause = new PauseScreen({
      onResume: () => this.callbacks.onResume(),
      onSettings: () => this.showSettings('pause'),
      onQuit: () => this.callbacks.onQuit(),
    });
    this.settings = new SettingsScreen(store, { onClose: () => this.closeSettings() });
    this.credits = new CreditsScreen({ onClose: () => this.closeCredits() });

    this.fade = el('div', { class: 'ui-fade', attrs: { 'aria-hidden': 'true' } });

    root.append(
      this.atmosphere,
      this.hud.root,
      this.touch.root,
      this.menu.root,
      this.loading.root,
      this.pause.root,
      this.settings.root,
      this.credits.root,
      this.fade,
    );

    this.unsubscribe = store.on('change', ({ settings }) => {
      this.applyPreferences(settings.filmGrain, settings.reduceMotion, settings.showHints, settings.touchControls);
    });
    this.applyPreferences(store.get('filmGrain'), store.get('reduceMotion'), store.get('showHints'), store.get('touchControls'));
  }

  private applyPreferences(
    filmGrain: boolean,
    reduceMotion: boolean,
    showHints: boolean,
    touchMode: 'auto' | 'always' | 'never',
  ): void {
    this.atmosphere.querySelector<HTMLElement>('.ui-grain')?.style.setProperty('display', filmGrain ? 'block' : 'none');
    document.body.classList.toggle('reduce-motion', reduceMotion);
    this.hud.setHintsVisible(showHints);
    if (TouchControls.shouldEnable(touchMode)) {
      if (this.hud.isActive) this.touch.show();
    } else {
      this.touch.hide();
    }
  }

  /* ---------------------------------------------------------------- */
  /* Loading                                                          */
  /* ---------------------------------------------------------------- */

  showLoading(engineLabel = 'Initialising renderer'): void {
    this.loading.setEngineInfo(engineLabel);
    this.loading.show();
  }

  updateLoading(status: string, progress: number): void {
    this.loading.setStatus(status, progress);
  }

  setEngineInfo(text: string): void {
    this.loading.setEngineInfo(text);
  }

  async finishLoading(): Promise<void> {
    await this.loading.complete();
  }

  /* ---------------------------------------------------------------- */
  /* Menu                                                             */
  /* ---------------------------------------------------------------- */

  showMenu(summary: ProgressSummary): void {
    this.menu.setProgress(summary);
    this.menu.show();
    this.hud.hide();
    this.touch.hide();
    document.body.classList.add('is-menu');
    document.body.classList.remove('is-playing');
  }

  hideMenu(): void {
    this.menu.hide();
    document.body.classList.remove('is-menu');
  }

  refreshMenuProgress(summary: ProgressSummary): void {
    this.menu.setProgress(summary);
  }

  setBackend(renderer: string, quality: string): void {
    this.menu.setBackend(renderer, quality);
  }

  setMenuWarning(message: string | null): void {
    this.menu.setWarning(message);
  }

  /* ---------------------------------------------------------------- */
  /* Gameplay surfaces                                                */
  /* ---------------------------------------------------------------- */

  showHud(): void {
    this.hud.show();
    document.body.classList.add('is-playing');
    document.body.classList.remove('is-menu');
    if (TouchControls.shouldEnable(this.store.get('touchControls'))) this.touch.show();
  }

  hideHud(): void {
    this.hud.hide();
    this.touch.hide();
    document.body.classList.remove('is-playing');
  }

  showPause(stats: PauseStats): void {
    this.pause.setStats(stats);
    this.pause.show();
    this.overlay = 'pause';
    document.body.classList.remove('is-playing');
  }

  hidePause(): void {
    this.pause.hide();
    if (this.overlay === 'pause') this.overlay = null;
  }

  /* ---------------------------------------------------------------- */
  /* Overlays                                                         */
  /* ---------------------------------------------------------------- */

  showSettings(returnTo: 'menu' | 'pause'): void {
    this.settingsReturn = returnTo;
    if (returnTo === 'pause') this.pause.hide();
    else this.menu.hide();
    this.settings.show();
    this.overlay = 'settings';
  }

  closeSettings(): void {
    this.settings.hide();
    this.overlay = null;
    if (this.settingsReturn === 'pause') {
      this.pause.show();
      this.overlay = 'pause';
    } else {
      this.menu.show();
    }
  }

  showCredits(): void {
    this.menu.hide();
    this.credits.show();
    this.overlay = 'credits';
  }

  closeCredits(): void {
    this.credits.hide();
    this.overlay = null;
    this.menu.show();
  }

  get activeOverlay(): OverlayKind {
    return this.overlay;
  }

  /** True when Escape should close an overlay rather than toggle pause. */
  get hasTransientOverlay(): boolean {
    return this.overlay === 'settings' || this.overlay === 'credits';
  }

  closeTransientOverlay(): boolean {
    if (this.overlay === 'settings') {
      this.closeSettings();
      return true;
    }
    if (this.overlay === 'credits') {
      this.closeCredits();
      return true;
    }
    return false;
  }

  /* ---------------------------------------------------------------- */
  /* Feedback                                                         */
  /* ---------------------------------------------------------------- */

  toast(text: string, kind: 'default' | 'accent' | 'warn' = 'default', duration = 3600): void {
    if (this.hud.isActive) this.hud.toast(text, kind, duration);
    else if (kind === 'warn') this.setMenuWarning(text);
  }

  setFade(black: boolean): void {
    this.fade.classList.toggle('is-black', black);
  }

  async fadeOut(duration = 560): Promise<void> {
    this.fade.classList.add('is-black');
    await new Promise((resolve) => window.setTimeout(resolve, duration));
  }

  async fadeIn(duration = 560): Promise<void> {
    this.fade.classList.remove('is-black');
    await new Promise((resolve) => window.setTimeout(resolve, duration));
  }

  showFatal(options: FatalErrorOptions): void {
    this.fatal?.destroy();
    this.fatal = new FatalErrorScreen({
      ...options,
      onRetry: options.onRetry ?? (() => this.callbacks.onRetry()),
      secondaryLabel: options.secondaryLabel ?? 'Reload app',
      onSecondary: options.onSecondary ?? (() => window.location.reload()),
    });
    this.hideHud();
    this.menu.hide();
    this.pause.hide();
    this.settings.hide();
    this.credits.hide();
  }

  clearFatal(): void {
    this.fatal?.destroy();
    this.fatal = null;
  }

  dispose(): void {
    this.unsubscribe();
    this.settings.destroy();
    this.fatal?.destroy();
  }
}
