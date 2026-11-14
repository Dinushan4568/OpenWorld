import { describe, expect, it, vi } from 'vitest';
import { MissionSystem, STORY_KEY, sanitizeStoryState } from '../src/game/story/MissionSystem';
import { StoryDirector } from '../src/game/story/StoryDirector';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

describe('story persistence and mission state', () => {
  it('sanitises unknown ids, overlapping lists and absurd counters', () => {
    const state = sanitizeStoryState({
      version: 99,
      chapter: -4,
      active: ['main_survey', 'not_a_mission', 'main_survey'],
      completed: ['main_vault', 'main_survey'],
      progress: {
        main_survey: {
          talk_iona: { done: true, count: 1, targets: ['iona'] },
          unknown_objective: { done: true },
        },
      },
      flags: { 'ledger-taken': true, bad: 'yes', ['x'.repeat(200)]: true },
      marks: -20,
      items: ['survey-lens', 42, 'survey-lens'],
      codex: ['codex-mara'],
      seenDialogues: ['iona-intro'],
      readMemories: [],
      ending: 'preserve',
    });
    expect(state.active).toEqual([]);
    expect(state.completed).toEqual(['main_vault', 'main_survey']);
    expect(state.marks).toBe(0);
    expect(state.items).toEqual(['survey-lens']);
    expect(state.flags['ledger-taken']).toBe(true);
    expect(state.flags.bad).toBeUndefined();
    expect(state.ending).toBe('preserve');
    expect(state.progress.main_survey.unknown_objective).toBeUndefined();
  });

  it('repairs an in-progress save that lost its active mission list', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      STORY_KEY,
      JSON.stringify({
        version: 1,
        chapter: 1,
        active: [],
        completed: ['main_survey'],
        progress: {},
        flags: { 'ledger-taken': true },
        marks: 40,
        items: ['survey-lens'],
        codex: [],
        seenDialogues: [],
        readMemories: [],
        ending: null,
      }),
    );
    const system = new MissionSystem(storage);
    expect(system.state.active).toEqual(['main_vault']);
    expect(system.currentObjective('main_vault')?.id).toBe('reach_theta');
    expect(system.state.items).toContain('survey-lens');
  });

  it('does not award a mission reward twice', () => {
    const director = new StoryDirector(new MemoryStorage());
    director.missions.notify({ type: 'talk', target: 'iona' });
    director.interact('survey-ledger');
    director.missions.notify({ type: 'talk', target: 'iona' });
    // Finish the first mission by completing the return objective directly.
    expect(director.state.completed).toContain('main_survey');
    const marks = director.marks;
    director.missions.notify({ type: 'talk', target: 'iona' });
    expect(director.marks).toBe(marks);
    expect(director.state.completed.filter((id) => id === 'main_survey')).toHaveLength(1);
  });

  it('does not treat the auto-started first mission as saved progress', () => {
    const director = new StoryDirector(new MemoryStorage());
    expect(director.state.active).toEqual(['main_survey']);
    expect(director.missions.hasProgress).toBe(false);
  });

  it('starts a fresh story and clears old progress', () => {
    const storage = new MemoryStorage();
    const director = new StoryDirector(storage);
    director.missions.notify({ type: 'talk', target: 'iona' });
    director.interact('survey-ledger');
    expect(director.missions.hasProgress).toBe(true);
    director.reset();
    expect(director.state.active).toEqual(['main_survey']);
    expect(director.state.completed).toEqual([]);
    expect(director.state.marks).toBe(0);
    expect(director.state.flags).toEqual({});
    expect(director.state.items).toEqual([]);
  });

  it('survives corrupt storage', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const storage = new MemoryStorage();
    storage.setItem(STORY_KEY, '{broken');
    const director = new StoryDirector(storage);
    expect(director.state.active).toEqual(['main_survey']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
