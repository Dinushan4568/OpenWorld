// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsStore } from '../src/game/core/settings';
import { PUZZLES } from '../src/game/story/content';
import { StoryDirector } from '../src/game/story/StoryDirector';
import { UiRoot, type UiCallbacks } from '../src/ui/UiRoot';
import type { TouchCallbacks } from '../src/ui/screens/TouchControls';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

function harness() {
  document.body.innerHTML = '<div id="ui-root"></div>';
  document.body.className = '';
  const root = document.getElementById('ui-root') as HTMLElement;
  const store = new SettingsStore(null);
  const calls: string[] = [];
  const callbacks: UiCallbacks = {
    onPlay: () => {},
    onResume: () => {},
    onQuit: () => {},
    onRetry: () => {},
    onDialogueChoose: (choice) => calls.push(`choose:${choice}`),
    onDialogueClose: () => calls.push('dialogue-close'),
    onPuzzleSolved: (puzzle) => calls.push(`solved:${puzzle.id}`),
    onPuzzleClose: () => calls.push('puzzle-close'),
    onJournalClose: () => calls.push('journal-close'),
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
  return { ui, root, calls };
}

describe('story interfaces', () => {
  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => window.setTimeout(() => cb(0), 0));
  });

  it('renders a conversation, its choices and keyboard responses', () => {
    const { ui, root, calls } = harness();
    const director = new StoryDirector(new MemoryStorage());
    const session = director.beginNpcDialogue('iona');
    expect(session).not.toBeNull();
    if (!session) return;
    ui.showDialogue(session);
    expect(ui.hasTransientOverlay).toBe(true);
    const card = root.querySelector('.dialogue__card') as HTMLElement;
    expect(card.textContent).toContain('Iona Vale');
    expect(card.textContent).toContain('What happened to the people here?');
    expect(card.querySelectorAll('.dialogue__choice')).toHaveLength(3);

    (card.querySelectorAll<HTMLButtonElement>('.dialogue__choice')[0]).click();
    expect(calls).toContain('choose:history');

    // Number keys choose the same response, Escape leaves cleanly.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    expect(calls).toContain('choose:ask');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(calls).toContain('dialogue-close');
    ui.hideDialogue();
    expect(ui.hasTransientOverlay).toBe(false);
  });

  it('aligns the continuity lock and reports the solve once', () => {
    const { ui, root, calls } = harness();
    const puzzle = PUZZLES['continuity-lock'];
    ui.showPuzzle(puzzle);
    expect(ui.hasTransientOverlay).toBe(true);
    const dials = [...root.querySelectorAll<HTMLElement>('.puzzle__dial')];
    expect(dials).toHaveLength(3);

    // Targets: harmonic II (1), memory silence (0), witness light (3).
    dials[0].querySelectorAll<HTMLButtonElement>('.puzzle__step')[1].click();
    for (let i = 0; i < 3; i += 1) {
      dials[2].querySelectorAll<HTMLButtonElement>('.puzzle__step')[1].click();
    }
    const outputs = [...root.querySelectorAll<HTMLOutputElement>('.puzzle__value')].map((out) => out.textContent);
    expect(outputs).toEqual(['II', 'SILENCE', 'LIGHT']);

    root.querySelector<HTMLButtonElement>('.puzzle__submit')?.click();
    expect(calls).toContain('solved:continuity-lock');
    expect(root.querySelector('.puzzle__status')?.textContent).toContain('vault exhales');
    expect(root.querySelector<HTMLButtonElement>('.puzzle__submit')?.disabled).toBe(true);
    // A second submit must not duplicate the reward.
    root.querySelector<HTMLButtonElement>('.puzzle__submit')?.click();
    expect(calls.filter((call) => call === 'solved:continuity-lock')).toHaveLength(1);

    root.querySelector<HTMLButtonElement>('.puzzle__actions .btn--ghost')?.click();
    expect(calls).toContain('puzzle-close');
    ui.hidePuzzle();
  });

  it('renders the mission journal with objectives, rewards and archive', () => {
    const { ui, root, calls } = harness();
    const director = new StoryDirector(new MemoryStorage());
    const view = director.journal(0, 5);
    ui.showQuestLog(view);
    expect(ui.hasTransientOverlay).toBe(true);
    const card = root.querySelector('.questlog__card') as HTMLElement;
    expect(card.textContent).toContain('Chapter One');
    expect(card.textContent).toContain("The Cartographer's Silence");
    expect(card.textContent).toContain('Speak with Iona Vale');
    expect(card.textContent).toContain('Field work');
    expect(card.querySelectorAll('.questlog__mission').length).toBeGreaterThanOrEqual(4);
    expect(card.querySelectorAll('.questlog__objective').length).toBeGreaterThan(0);
    expect(card.textContent).toContain('No archive fragments recovered yet.');

    const close = [...card.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent === 'Close');
    close?.click();
    expect(calls).toContain('journal-close');
    ui.hideQuestLog();
    expect(ui.hasTransientOverlay).toBe(false);
  });
});
