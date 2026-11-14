import { describe, expect, it } from 'vitest';
import { StoryDirector } from '../src/game/story/StoryDirector';
import type { DialogueSession } from '../src/game/story/types';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length(): number { return this.data.size; }
  clear(): void { this.data.clear(); }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  key(index: number): string | null { return Array.from(this.data.keys())[index] ?? null; }
  removeItem(key: string): void { this.data.delete(key); }
  setItem(key: string, value: string): void { this.data.set(key, value); }
}

function talk(director: StoryDirector, npcId: string, choices: Array<[string, string]>): void {
  const session = director.beginNpcDialogue(npcId);
  if (!session) throw new Error(`No conversation for ${npcId}`);
  for (const [nodeId, choiceId] of choices) {
    expect(session.view.nodeId).toBe(nodeId);
    const step = director.choose(session, choiceId);
    if (step.view) session.view = step.view;
    if (step.close) {
      director.finishDialogue(session);
      return;
    }
  }
  director.finishDialogue(session);
}

function currentObjective(director: StoryDirector): string {
  const mission = director.currentMission();
  const objective = director.currentObjective();
  if (!mission || !objective) throw new Error('No active objective');
  return `${mission.id}:${objective.id}`;
}

function missionObjective(director: StoryDirector, missionId: string): string {
  const mission = director.missions.currentObjective(missionId);
  if (!mission) throw new Error(`No active objective for ${missionId}`);
  return `${missionId}:${mission.id}`;
}

function completeMainToVault(director: StoryDirector): void {
  // Meet Iona and accept the first mission's job.
  talk(director, 'iona', [
    ['start', 'ask'],
    ['ask', 'accept'],
  ]);
  expect(currentObjective(director)).toBe('main_survey:find_ledger');
  expect(director.interact('survey-ledger').type).toBe('pickup');
  expect(currentObjective(director)).toBe('main_survey:return_ledger');
  talk(director, 'iona', [
    ['start', 'read'],
    ['reveal', 'theta'],
    ['theta', 'accept_main'],
  ]);
  expect(director.state.completed).toContain('main_survey');
  expect(currentObjective(director)).toBe('main_vault:reach_theta');
  director.updatePosition(-100, 190);
  expect(currentObjective(director)).toBe('main_vault:find_sable');
  talk(director, 'sable9', [
    ['start', 'what'],
    ['what', 'witness'],
    ['witness', 'accept'],
  ]);
  expect(currentObjective(director)).toBe('main_vault:solve_lock');
  expect(Array.from(director.availableInteractions())).toContain('continuity-console');
  const puzzle = director.interact('continuity-console');
  expect(puzzle.type).toBe('puzzle');
  const notices = director.solvePuzzle('continuity-lock');
  expect(notices.some((notice) => notice.text.includes('vault'))).toBe(true);
  expect(currentObjective(director)).toBe('main_vault:take_key');
  expect(director.interact('continuity-key').type).toBe('pickup');
  expect(currentObjective(director)).toBe('main_vault:report_iona');
  talk(director, 'iona', [
    ['start', 'gate'],
    ['gate', 'plan'],
    ['plan', 'accept_gate'],
  ]);
}

describe('chapter one mission flow', () => {
  it('plays the three main missions through to an ending', () => {
    const storage = new MemoryStorage();
    const director = new StoryDirector(storage);
    expect(director.state.active).toEqual(['main_survey']);
    expect(currentObjective(director)).toBe('main_survey:talk_iona');

    completeMainToVault(director);
    expect(director.state.completed).toEqual(['main_survey', 'main_vault']);
    expect(currentObjective(director)).toBe('main_witness:gather_echoes');
    expect(director.npcLocations().iona.x).toBe(140);

    director.setShards(3);
    expect(currentObjective(director)).toBe('main_witness:gather_echoes');
    director.setShards(5);
    expect(currentObjective(director)).toBe('main_witness:meet_iona_gate');
    talk(director, 'iona', [
      ['start', 'ready'],
      ['ready', 'go'],
    ]);
    expect(currentObjective(director)).toBe('main_witness:align_array');
    expect(Array.from(director.availableInteractions())).toContain('gate-console');
    expect(director.interact('gate-console').type).toBe('puzzle');
    director.solvePuzzle('witness-array');
    expect(currentObjective(director)).toBe('main_witness:speak_choir');
    expect(Array.from(director.availableInteractions())).toContain('gate-witness');

    const witness = director.interact('gate-witness');
    expect(witness.type).toBe('dialogue');
    if (witness.type !== 'dialogue') throw new Error('no choir session');
    const session: DialogueSession = witness.session;
    let step = director.choose(session, 'want');
    expect(step.view?.nodeId).toBe('want');
    if (step.view) session.view = step.view;
    step = director.choose(session, 'preserve');
    expect(step.view?.nodeId).toBe('preserve_confirm');
    if (step.view) session.view = step.view;
    step = director.choose(session, 'choose_memory');
    expect(step.close).toBe(true);
    director.finishDialogue(session);

    expect(director.state.completed).toContain('main_witness');
    expect(director.chapterComplete).toBe(true);
    expect(director.state.ending).toBe('preserve');
    expect(director.state.marks).toBeGreaterThanOrEqual(270);
    expect(director.state.items).toContain('survey-lens');
    expect(director.journal(5, 5).mainComplete).toBe(3);
    expect(director.journal(5, 5).ending?.title).toBe('The Names We Carry');
  });

  it('completes all three side missions', () => {
    const storage = new MemoryStorage();
    const director = new StoryDirector(storage);
    // Kesh's salvage caches can be done immediately.
    talk(director, 'kesh', [
      ['start', 'why'],
      ['why', 'accept'],
      ['accept', 'go'],
    ]);
    expect(missionObjective(director, 'side_caches')).toBe('side_caches:cache_north');
    for (const id of ['cache-north', 'cache-west', 'cache-south']) {
      expect(director.interact(id).type).toBe('pickup');
    }
    expect(missionObjective(director, 'side_caches')).toBe('side_caches:return_kesh');
    talk(director, 'kesh', [
      ['start', 'ask'],
      ['ask', 'close'],
    ]);
    expect(director.state.completed).toContain('side_caches');
    expect(director.marks).toBe(45);

    // Finish the first main mission and accept the stakes along the way.
    talk(director, 'iona', [
      ['start', 'ask'],
      ['ask', 'accept'],
    ]);
    director.interact('survey-ledger');
    talk(director, 'iona', [
      ['start', 'read'],
      ['reveal', 'theta'],
      ['theta', 'accept_both'],
    ]);
    expect(director.state.active).toContain('side_stakes');
    for (const id of ['stake-east', 'stake-forest', 'stake-ridge']) {
      expect(director.interact(id).type).toBe('pickup');
    }
    talk(director, 'iona', [
      ['start', 'thanks'],
      ['thanks', 'close'],
    ]);
    expect(director.state.completed).toContain('side_stakes');

    // Reach the vault lock, then take Sable's caretaker request.
    director.updatePosition(-100, 190);
    talk(director, 'sable9', [
      ['start', 'what'],
      ['what', 'witness'],
      ['witness', 'accept'],
    ]);
    director.solvePuzzle('continuity-lock');
    talk(director, 'sable9', [
      ['start', 'why'],
      ['why', 'accept'],
      ['accept', 'go'],
    ]);
    expect(director.state.active).toContain('side_caretakers');
    director.scan('scuttler');
    director.scan('grazer');
    director.scan('drifter');
    expect(missionObjective(director, 'side_caretakers')).toBe('side_caretakers:return_sable');
    talk(director, 'sable9', [
      ['start', 'what'],
      ['what', 'close'],
    ]);
    expect(director.state.completed).toContain('side_caretakers');
    expect(director.state.marks).toBe(45 + 40 + 35 + 60);
    expect(director.state.items).toContain('caretaker-cipher');
  });

  it('saves and reloads mission progress, codex and world state', () => {
    const storage = new MemoryStorage();
    const first = new StoryDirector(storage);
    talk(first, 'iona', [
      ['start', 'ask'],
      ['ask', 'accept'],
    ]);
    first.interact('survey-ledger');
    const marks = first.marks;
    expect(marks).toBe(0);
    const saved = storage.getItem('eotlw.story.v1');
    expect(saved).toBeTruthy();

    const second = new StoryDirector(storage);
    expect(currentObjective(second)).toBe('main_survey:return_ledger');
    expect(second.state.flags['ledger-taken']).toBe(true);
    expect(second.worldView().available).not.toContain('survey-ledger');
    expect(second.worldView().consumed).toContain('survey-ledger');

    // A corrupt save must not brick the adventure.
    storage.setItem('eotlw.story.v1', '{not json');
    const recovered = new StoryDirector(storage);
    expect(recovered.state.active).toEqual(['main_survey']);
  });

  it('keeps the optional memories readable without consuming them', () => {
    const director = new StoryDirector(new MemoryStorage());
    const before = director.state.codex.length;
    const session = director.beginNpcDialogue('iona');
    expect(session).not.toBeNull();
    const memory = director.interact('memory-plaza');
    expect(memory.type).toBe('dialogue');
    expect(director.state.readMemories).toContain('memory-plaza');
    expect(director.state.codex.length).toBe(before + 1);
    const again = director.interact('memory-plaza');
    expect(again.type).toBe('dialogue');
    expect(director.state.readMemories.filter((id) => id === 'memory-plaza')).toHaveLength(1);
  });

  it('completes the whole chapter — every main and side mission — in one run', () => {
    const director = new StoryDirector(new MemoryStorage());

    // Kesh's salvage run can happen before the main thread even starts.
    talk(director, 'kesh', [
      ['start', 'why'],
      ['why', 'accept'],
      ['accept', 'go'],
    ]);
    for (const id of ['cache-north', 'cache-west', 'cache-south']) director.interact(id);
    talk(director, 'kesh', [
      ['start', 'ask'],
      ['ask', 'close'],
    ]);

    // Main thread: survey, vault, witness.
    talk(director, 'iona', [
      ['start', 'ask'],
      ['ask', 'accept'],
    ]);
    director.interact('survey-ledger');
    talk(director, 'iona', [
      ['start', 'read'],
      ['reveal', 'theta'],
      ['theta', 'accept_both'],
    ]);
    expect(director.state.active).toContain('side_stakes');
    for (const id of ['stake-east', 'stake-forest', 'stake-ridge']) director.interact(id);
    talk(director, 'iona', [
      ['start', 'thanks'],
      ['thanks', 'close'],
    ]);
    expect(director.state.completed).toContain('side_stakes');

    director.updatePosition(-100, 190);
    talk(director, 'sable9', [
      ['start', 'what'],
      ['what', 'witness'],
      ['witness', 'accept'],
    ]);
    director.solvePuzzle('continuity-lock');
    director.interact('continuity-key');
    // Sable's caretaker survey is optional but still available after the vault.
    talk(director, 'sable9', [
      ['start', 'why'],
      ['why', 'accept'],
      ['accept', 'go'],
    ]);
    director.scan('scuttler');
    director.scan('grazer');
    director.scan('drifter');
    talk(director, 'sable9', [
      ['start', 'what'],
      ['what', 'close'],
    ]);
    expect(director.state.completed).toContain('side_caretakers');

    talk(director, 'iona', [
      ['start', 'gate'],
      ['gate', 'plan'],
      ['plan', 'accept_gate'],
    ]);
    expect(director.state.completed).toEqual(
      expect.arrayContaining(['main_survey', 'main_vault', 'side_stakes', 'side_caches', 'side_caretakers']),
    );

    director.setShards(5);
    talk(director, 'iona', [
      ['start', 'ready'],
      ['ready', 'go'],
    ]);
    director.solvePuzzle('witness-array');
    const witness = director.interact('gate-witness');
    if (witness.type !== 'dialogue') throw new Error('witness core did not speak');
    const session = witness.session;
    let step = director.choose(session, 'want');
    if (step.view) session.view = step.view;
    step = director.choose(session, 'preserve');
    if (step.view) session.view = step.view;
    step = director.choose(session, 'choose_memory');
    expect(step.close).toBe(true);
    director.finishDialogue(session);

    expect(director.state.completed).toHaveLength(6);
    expect(director.state.completed).toEqual(expect.arrayContaining(['main_witness']));
    expect(director.state.ending).toBe('preserve');
    expect(director.chapterComplete).toBe(true);
    const journal = director.journal(5, 5);
    expect(journal.mainComplete).toBe(3);
    expect(journal.sideComplete).toBe(3);
    expect(journal.marks).toBe(410);
    expect(journal.missions.filter((mission) => mission.status === 'complete')).toHaveLength(6);
    expect(journal.items.map((item) => item.id)).toEqual(
      expect.arrayContaining(['survey-lens', 'resonance-capacitor', 'caretaker-cipher']),
    );
    expect(journal.codex.length).toBeGreaterThanOrEqual(8);
    expect(director.state.active).toHaveLength(0);
  });

  it('can end the chapter by reopening the lattice instead', () => {
    const director = new StoryDirector(new MemoryStorage());
    completeMainToVault(director);
    director.setShards(5);
    talk(director, 'iona', [
      ['start', 'ready'],
      ['ready', 'go'],
    ]);
    director.solvePuzzle('witness-array');
    const witness = director.interact('gate-witness');
    if (witness.type !== 'dialogue') throw new Error('witness core did not speak');
    const session = witness.session;
    let step = director.choose(session, 'history');
    if (step.view) session.view = step.view;
    step = director.choose(session, 'want');
    if (step.view) session.view = step.view;
    step = director.choose(session, 'broadcast');
    if (step.view) session.view = step.view;
    step = director.choose(session, 'choose_return');
    expect(step.close).toBe(true);
    director.finishDialogue(session);

    expect(director.state.ending).toBe('broadcast');
    expect(director.ending()?.title).toBe('The Long Return');
    expect(director.journal(5, 5).ending?.id).toBe('broadcast');
  });
});
