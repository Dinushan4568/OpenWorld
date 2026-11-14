// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsStore } from '../src/game/core/settings';
import { UiRoot, type UiCallbacks } from '../src/ui/UiRoot';
import type { TouchCallbacks } from '../src/ui/screens/TouchControls';

function makeUi(): UiRoot {
  document.body.innerHTML = '<div id="ui-root"></div>';
  const callbacks: UiCallbacks = {
    onPlay: () => {},
    onResume: () => {},
    onQuit: () => {},
    onRetry: () => {},
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
  return new UiRoot(document.getElementById('ui-root') as HTMLElement, new SettingsStore(null), callbacks, touch);
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('loading and fatal surfaces', () => {
  it('shows progress, then hides the spinner when a fatal error replaces it', () => {
    const ui = makeUi();
    ui.showLoading('Loading test');
    ui.updateLoading('Building valley', 0.5);
    const loading = document.querySelector('.screen-loading') as HTMLElement;
    expect(loading).toBeTruthy();
    expect(loading.textContent).toContain('Building valley');

    ui.showFatal({ title: 'Test failure', message: 'The test renderer is unavailable.' });
    expect(loading.classList.contains('is-hidden')).toBe(true);
    expect(document.querySelector('.fatal')?.textContent).toContain('Test failure');

    ui.dispose();
    expect(document.querySelector('.fatal')).toBeNull();
    expect(document.querySelector('.screen-loading')).toBeNull();
    expect(document.getElementById('ui-root')?.childElementCount).toBe(0);
  });
});
