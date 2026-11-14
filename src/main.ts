import './styles/app.css';
import { Game } from './game/Game';

declare global {
  interface Window {
    __echoes?: Game;
  }
}

function renderFallback(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.error('[bootstrap] fatal', error);
  const shell = document.getElementById('boot-shell');
  shell?.remove();
  const root = document.getElementById('ui-root');
  if (!root) return;
  root.innerHTML = `
    <div class="fatal">
      <div class="fatal__panel">
        <span class="fatal__eyebrow">Bootstrap failure</span>
        <h1>Echoes of the Lost World could not start</h1>
        <p>The interface failed to initialise. Reload the page to try again, and make sure hardware acceleration is enabled.</p>
        <pre>${message.replace(/[&<>]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[char] ?? char)}</pre>
        <div class="fatal__actions">
          <button class="btn btn--primary" type="button" onclick="window.location.reload()">Reload</button>
        </div>
      </div>
    </div>
  `;
}

function start(): void {
  try {
    const game = new Game();
    window.__echoes = game;
    void game.boot();
  } catch (error) {
    renderFallback(error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
