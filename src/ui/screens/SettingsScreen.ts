import { QUALITY_PROFILES, type QualityPreset } from '../../game/config';
import type { Settings, SettingsStore, TouchMode } from '../../game/core/settings';
import {
  createSegmentedField,
  createSliderField,
  createToggleField,
  el,
  trapFocus,
  type SegmentedControl,
  type SliderControl,
  type ToggleControl,
} from '../components/dom';
import { Screen } from './Screen';

export interface SettingsScreenCallbacks {
  onClose: () => void;
}

export class SettingsScreen extends Screen {
  private readonly store: SettingsStore;
  private readonly callbacks: SettingsScreenCallbacks;
  private readonly qualityDescription: HTMLElement;
  private readonly unsubscribe: () => void;
  private readonly removeTrap: (event: KeyboardEvent) => void;

  private quality!: SegmentedControl<QualityPreset>;
  private fov!: SliderControl;
  private sensitivity!: SliderControl;
  private volume!: SliderControl;
  private adaptive!: ToggleControl;
  private bloom!: ToggleControl;
  private vignette!: ToggleControl;
  private grain!: ToggleControl;
  private invertY!: ToggleControl;
  private showFps!: ToggleControl;
  private showHints!: ToggleControl;
  private touch!: SegmentedControl<TouchMode>;
  private reduceMotion!: ToggleControl;

  constructor(store: SettingsStore, callbacks: SettingsScreenCallbacks) {
    super('overlay overlay--settings');
    this.store = store;
    this.callbacks = callbacks;
    this.qualityDescription = el('span', { class: 'field__hint' });

    const closeButton = el('button', {
      class: 'btn btn--ghost',
      attrs: { type: 'button' },
      text: 'Back',
      on: { click: () => this.callbacks.onClose() },
    });

    const scroll = el('div', { class: 'overlay__scroll' });
    scroll.append(this.buildDisplaySection(), this.buildCameraSection(), this.buildAudioSection(), this.buildInterfaceSection());

    const panel = el('div', { class: 'overlay__panel panel' }, [
      el('div', { class: 'overlay__header' }, [
        el('div', { class: 'kicker', text: 'Expedition configuration' }),
        el('h2', { text: 'Settings' }),
        el('p', {
          text: 'Every change applies instantly and is stored on this device. Field hardware varies — tune until the horizon is comfortable.',
        }),
      ]),
      scroll,
      el('div', { class: 'overlay__footer' }, [
        el('button', {
          class: 'btn btn--ghost',
          attrs: { type: 'button' },
          text: 'Reset defaults',
          on: { click: () => this.store.reset() },
        }),
        closeButton,
      ]),
    ]);

    const backdrop = el('div', {
      class: 'overlay__backdrop',
      attrs: { 'aria-hidden': 'true' },
      on: { click: () => this.callbacks.onClose() },
    });

    this.root.append(backdrop, panel);
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-label', 'Settings');

    this.removeTrap = trapFocus(panel);
    this.root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.callbacks.onClose();
      }
      this.removeTrap(event);
    });

    this.unsubscribe = this.store.on('change', ({ settings }) => this.sync(settings));
    this.sync(this.store.value);
  }

  private buildDisplaySection(): HTMLElement {
    this.quality = createSegmentedField<QualityPreset>({
      label: 'Quality preset',
      options: (Object.keys(QUALITY_PROFILES) as QualityPreset[]).map((id) => ({
        value: id,
        label: QUALITY_PROFILES[id].label,
        title: QUALITY_PROFILES[id].description,
      })),
      value: this.store.get('quality'),
      onChange: (value) => this.store.set('quality', value),
    });

    const hintRow = el('div', { class: 'field', style: { paddingTop: '0' } }, [this.qualityDescription]);

    this.adaptive = createToggleField({
      label: 'Adaptive resolution',
      hint: 'Slightly lowers internal resolution during heavy scenes to protect a smooth frame rate. Never changes the UI resolution.',
      value: this.store.get('adaptiveResolution'),
      onChange: (value) => this.store.set('adaptiveResolution', value),
    });
    this.fov = createSliderField({
      label: 'Field of view',
      hint: 'Wider views reveal more of the valley but bend the horizon at the edges.',
      min: 50,
      max: 92,
      step: 1,
      value: this.store.get('fov'),
      format: (v) => `${Math.round(v)}°`,
      onChange: (value) => this.store.set('fov', value),
    });
    this.bloom = createToggleField({
      label: 'Bloom & light diffusion',
      hint: 'Soft halation around sunlit metal, glowing runes and the Echo Gate.',
      value: this.store.get('bloom'),
      onChange: (value) => this.store.set('bloom', value),
    });
    this.vignette = createToggleField({
      label: 'Cinematic vignette',
      hint: 'Darkens the frame edges to focus the eye on the horizon.',
      value: this.store.get('vignette'),
      onChange: (value) => this.store.set('vignette', value),
    });
    this.grain = createToggleField({
      label: 'Film grain',
      hint: 'A subtle analogue texture over the image.',
      value: this.store.get('filmGrain'),
      onChange: (value) => this.store.set('filmGrain', value),
    });

    return el('section', { class: 'settings-section' }, [
      el('div', { class: 'settings-section__title', text: 'Display' }),
      this.quality.element,
      hintRow,
      this.adaptive.element,
      this.fov.element,
      this.bloom.element,
      this.vignette.element,
      this.grain.element,
    ]);
  }

  private buildCameraSection(): HTMLElement {
    this.sensitivity = createSliderField({
      label: 'Look sensitivity',
      min: 0.25,
      max: 3,
      step: 0.05,
      value: this.store.get('sensitivity'),
      format: (v) => `${v.toFixed(2)}×`,
      onChange: (value) => this.store.set('sensitivity', value),
    });
    this.invertY = createToggleField({
      label: 'Invert vertical look',
      value: this.store.get('invertY'),
      onChange: (value) => this.store.set('invertY', value),
    });
    return el('section', { class: 'settings-section' }, [
      el('div', { class: 'settings-section__title', text: 'Camera' }),
      this.sensitivity.element,
      this.invertY.element,
    ]);
  }

  private buildAudioSection(): HTMLElement {
    this.volume = createSliderField({
      label: 'Master volume',
      hint: 'Ambient wind, footsteps and the resonance of the echoes are synthesised live.',
      min: 0,
      max: 1,
      step: 0.01,
      value: this.store.get('masterVolume'),
      format: (v) => `${Math.round(v * 100)}%`,
      onChange: (value) => this.store.set('masterVolume', value),
    });
    return el('section', { class: 'settings-section' }, [
      el('div', { class: 'settings-section__title', text: 'Audio' }),
      this.volume.element,
    ]);
  }

  private buildInterfaceSection(): HTMLElement {
    this.showFps = createToggleField({
      label: 'Performance readout',
      hint: 'Frame rate and frame time in the corner of the HUD (F3 toggles at any time).',
      value: this.store.get('showFps'),
      onChange: (value) => this.store.set('showFps', value),
    });
    this.showHints = createToggleField({
      label: 'Contextual field hints',
      hint: 'Control reminders during the first minutes of an expedition.',
      value: this.store.get('showHints'),
      onChange: (value) => this.store.set('showHints', value),
    });
    this.touch = createSegmentedField<TouchMode>({
      label: 'Touch controls',
      hint: 'Auto enables the on-screen stick and buttons on touch-first devices.',
      options: [
        { value: 'auto', label: 'Auto' },
        { value: 'always', label: 'On' },
        { value: 'never', label: 'Off' },
      ],
      value: this.store.get('touchControls'),
      onChange: (value) => this.store.set('touchControls', value),
    });
    this.reduceMotion = createToggleField({
      label: 'Reduce motion',
      hint: 'Calms interface animation and camera sway. Does not affect world simulation.',
      value: this.store.get('reduceMotion'),
      onChange: (value) => this.store.set('reduceMotion', value),
    });

    return el('section', { class: 'settings-section' }, [
      el('div', { class: 'settings-section__title', text: 'Interface' }),
      this.showFps.element,
      this.showHints.element,
      this.touch.element,
      this.reduceMotion.element,
    ]);
  }

  private sync(settings: Readonly<Settings>): void {
    this.quality.setSelected(settings.quality);
    this.fov.setValue(settings.fov);
    this.adaptive.setChecked(settings.adaptiveResolution);
    this.bloom.setChecked(settings.bloom);
    this.vignette.setChecked(settings.vignette);
    this.grain.setChecked(settings.filmGrain);
    this.sensitivity.setValue(settings.sensitivity);
    this.invertY.setChecked(settings.invertY);
    this.volume.setValue(settings.masterVolume);
    this.showFps.setChecked(settings.showFps);
    this.showHints.setChecked(settings.showHints);
    this.touch.setSelected(settings.touchControls);
    this.reduceMotion.setChecked(settings.reduceMotion);
    const profile = QUALITY_PROFILES[settings.quality];
    this.qualityDescription.textContent = `${profile.description}. Shadows ${
      profile.shadows ? `${profile.shadowResolution}px` : 'off'
    } · render scale ${Math.round(profile.renderScale * 100)}%${
      settings.adaptiveResolution ? ` (adaptive floor ${Math.round(profile.adaptiveMinScale * 100)}%)` : ''
    } · ${profile.drawDistance} m draw distance · ${profile.shadowCascades} shadow cascade${
      profile.shadowCascades === 1 ? '' : 's'
    }.`;
  }

  override show(): void {
    super.show();
    this.root.classList.add('is-active');
    this.sync(this.store.value);
    requestAnimationFrame(() => {
      const first = this.root.querySelector<HTMLElement>('button');
      first?.focus({ preventScroll: true });
    });
  }

  override hide(): void {
    this.root.classList.remove('is-active');
    super.hide();
  }

  destroy(): void {
    this.unsubscribe();
    super.destroy();
  }
}
