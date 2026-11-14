/**
 * Shared, engine-free vocabulary for the robotic wildlife system.
 *
 * Nothing in this file imports PlayCanvas: the species catalogue, the creature
 * brains and every behaviour test build on these plain types, so the AI can be
 * simulated headlessly and reused by any renderer.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export type CreatureKind = 'scuttler' | 'grazer' | 'drifter' | 'warden';

/**
 * Behaviour states shared by every species. Reusable components — perception,
 * steering, obstacle avoidance, patrol following, event reaction and homing —
 * compose these into four distinct personalities.
 */
export type CreatureState =
  | 'idle'
  | 'roam'
  | 'patrol'
  | 'investigate'
  | 'alert'
  | 'display'
  | 'flee'
  | 'dazed'
  | 'return';

export type EnvironmentEventKind =
  | 'waterfall-surge'
  | 'reactor-pulse'
  | 'city-beacon'
  | 'wind-gust'
  | 'echo-pulse';

/** A world event creatures can notice: audible, visible, and entirely fictional. */
export interface EnvironmentEvent {
  id: string;
  kind: EnvironmentEventKind;
  x: number;
  z: number;
  /** Creatures inside this radius may react. */
  radius: number;
  /** 0..1 — how alarming the event is. High values scatter skittish species. */
  startling: number;
  /** Player-facing line used by the HUD when a creature reacts. */
  label: string;
}

/** What the brain needs to know about the ground beneath a candidate step. */
export interface TerrainProbe {
  height: number;
  slope: number;
  water: boolean;
}

/** Read-only view of the world handed to a brain each tick. */
export interface BrainWorld {
  player: {
    x: number;
    z: number;
    /** Horizontal metres per second. */
    speed: number;
    crouch: boolean;
    sprinting: boolean;
    /** False when terrain or a solid occludes the player from this creature. */
    visible: boolean;
  };
  events: readonly EnvironmentEvent[];
  sample: (x: number, z: number) => TerrainProbe;
  /** True when a solid occupies this spot (props, ruins, bridges). */
  blocked: (x: number, z: number) => boolean;
  /** Optional positions of other creatures, used for soft separation. */
  neighbours?: readonly Vec2[];
  /** Keep creatures inside the playable basin. */
  boundsRadius: number;
  /** 0 = broad daylight, 1 = full night. Species see differently after dark. */
  night?: number;
}

export type WeaknessCategory =
  | 'phototropic'
  | 'resonance'
  | 'thermal'
  | 'harmonic';

/** The fictional puzzle clue surfaced by scanning a species. */
export interface Weakness {
  category: WeaknessCategory;
  label: string;
  /** Environmental tell the player can observe before scanning. */
  clue: string;
  /** Non-violent exploit the player can use in the open world. */
  exploit: string;
}

/** Scan report consumed by the HUD specimen panel. */
export interface ScanReport {
  id: string;
  kind: CreatureKind;
  name: string;
  codename: string;
  classification: string;
  temperament: string;
  behaviour: string;
  diet: string;
  sizeLabel: string;
  massKg: number;
  heightMetres: number;
  lengthMetres: number;
  threat: number;
  threatLabel: string;
  state: CreatureState;
  stateLabel: string;
  distance: number;
  awareness: number;
  weakness: Weakness;
  scanned: number;
  total: number;
  firstScan: boolean;
}
