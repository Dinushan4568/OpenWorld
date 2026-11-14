// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

describe('bootstrap failure handling', () => {
  it('renders a fatal panel when no graphics device can be created', async () => {
    document.body.innerHTML = `
      <div id="boot-shell"></div>
      <div id="app">
        <canvas id="game-canvas"></canvas>
        <div id="ui-root"></div>
      </div>`;
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const { Game } = await import('../src/game/Game');
    const game = new Game();
    await game.boot();
    const fatal = document.querySelector('.fatal');
    expect(fatal).toBeTruthy();
    expect(fatal?.textContent ?? '').toMatch(/could not start|Echoes of the Lost World/i);
    game.dispose();
  }, 30000);
});
