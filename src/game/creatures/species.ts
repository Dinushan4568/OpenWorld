/**
 * The four original robotic species of the valley.
 *
 * Every creature is a machine built by the same vanished survey programme:
 * scavenger-class SC units, grazer-class GR haulers, drifter-class DR survey
 * gliders, and warden-class WD custodians. Designs, names and behaviour are
 * original to this project — nothing here is derived from an existing creature
 * franchise.
 */
import type { CreatureKind, Vec2, Weakness } from './types';

export type Rgb = [number, number, number];

export interface CreaturePalette {
  /** Painted armour. */
  plate: Rgb;
  /** Recessed machinery, joints and shadowed steel. */
  dark: Rgb;
  /** Brass, copper and exposed pistons. */
  joint: Rgb;
  /** Emissive conduits, cores and vents. */
  glow: Rgb;
  /** Sensor lenses. */
  eye: Rgb;
}

export type RigRole =
  | 'root'
  | 'body'
  | 'head'
  | 'jaw'
  | 'neck'
  | 'tail'
  | 'leg'
  | 'shin'
  | 'arm'
  | 'forearm'
  | 'wing'
  | 'wingtip'
  | 'shield'
  | 'pike'
  | 'vane'
  | 'antenna'
  | 'ring'
  | 'pack';

export interface RigJointSpec {
  name: string;
  parent: string | null;
  /** Local position relative to the parent pivot, in metres. */
  pivot: [number, number, number];
  role: RigRole;
  side: -1 | 0 | 1;
  /** Walk-cycle phase offset in radians. */
  phase: number;
}

export interface RigSpec {
  /** Total model height above the feet, used for scan framing and camera aim. */
  height: number;
  joints: RigJointSpec[];
}

export interface SpeciesSenses {
  sightRange: number;
  /** Field of view in degrees; converted to a cosine by the brain factory. */
  fovDegrees: number;
  hearingRange: number;
  /** Awareness gained per second of clear sight. */
  awarenessRate: number;
  awarenessDecay: number;
}

export interface SpeciesMotion {
  walkSpeed: number;
  runSpeed: number;
  turnRate: number;
  /** Metres above local terrain for gliders; 0 for walkers. */
  flightAltitude: number;
  /** Wing beats or hover pulses per second. */
  beatRate: number;
  /** Stride phase advance per metre travelled. */
  stride: number;
}

export interface SpeciesTemperament {
  aggression: number;
  skittishness: number;
  curiosity: number;
}

export interface SpeciesDefinition {
  kind: CreatureKind;
  name: string;
  codename: string;
  classification: string;
  temperamentLine: string;
  behaviour: string;
  diet: string;
  sizeLabel: string;
  massKg: number;
  heightMetres: number;
  lengthMetres: number;
  threat: number;
  threatLabel: string;
  senses: SpeciesSenses;
  motion: SpeciesMotion;
  temperament: SpeciesTemperament;
  avoidWater: boolean;
  maxSlope: number;
  idleSeconds: [number, number];
  patrolWait: number;
  investigateSeconds: number;
  fleeSeconds: number;
  roamRadius: number;
  leashRadius: number;
  weakness: Weakness;
  palette: CreaturePalette;
  rig: RigSpec;
  encounter?: { title: string; subtitle: string; range: number };
}

const joint = (
  name: string,
  parent: string | null,
  pivot: [number, number, number],
  role: RigRole,
  side: -1 | 0 | 1 = 0,
  phase = 0,
): RigJointSpec => ({ name, parent, pivot, role, side, phase });

/* ------------------------------------------------------------------ */
/* SC-07 Mossback Scuttler — small mechanical forest scavenger         */
/* ------------------------------------------------------------------ */

const SCUTTLER_RIG: RigSpec = {
  height: 0.95,
  joints: [
    joint('body', null, [0, 0.52, 0], 'body'),
    joint('head', 'body', [0, 0.06, 0.34], 'head'),
    joint('jaw', 'head', [0, -0.08, 0.18], 'jaw'),
    joint('antenna-l', 'head', [0.1, 0.12, 0.14], 'antenna', -1, 0.4),
    joint('antenna-r', 'head', [-0.1, 0.12, 0.14], 'antenna', 1, 1.9),
    joint('vane-l', 'body', [0.24, 0.16, -0.06], 'vane', -1),
    joint('vane-r', 'body', [-0.24, 0.16, -0.06], 'vane', 1),
    joint('tail', 'body', [0, 0.02, -0.32], 'tail'),
    ...([[-1, 1], [1, 1], [-1, 2], [1, 2], [-1, 3], [1, 3]] as const).map(([side, index]) =>
      joint(
        `leg-${side < 0 ? 'l' : 'r'}${index}`,
        'body',
        [side * 0.27, 0.02, index === 1 ? 0.2 : index === 2 ? 0 : -0.2],
        'leg',
        side as -1 | 1,
        index === 2 ? Math.PI : 0,
      ),
    ),
  ],
};

const SCUTTLER: SpeciesDefinition = {
  kind: 'scuttler',
  name: 'Mossback Scuttler',
  codename: 'SC-07',
  classification: 'Survey scavenger · hexapedal utility unit',
  temperamentLine: 'Twitchy, inquisitive, and convinced every shiny object is food.',
  behaviour:
    'Forages in loose packs along the forest floor. Follows scent routes between moss banks, bolts from sudden noise, and returns to its burrow line before dark.',
  diet: 'Mineral crust, lichen and dropped circuit fragments.',
  sizeLabel: 'Small — knee height',
  massKg: 48,
  heightMetres: 0.95,
  lengthMetres: 1.2,
  threat: 1,
  threatLabel: 'Harmless unless cornered',
  senses: { sightRange: 28, fovDegrees: 150, hearingRange: 18, awarenessRate: 0.9, awarenessDecay: 0.35 },
  motion: { walkSpeed: 1.35, runSpeed: 3.4, turnRate: 3.1, flightAltitude: 0, beatRate: 0, stride: 2.6 },
  temperament: { aggression: 0.08, skittishness: 0.9, curiosity: 0.85 },
  avoidWater: true,
  maxSlope: 32,
  idleSeconds: [1.6, 4.2],
  patrolWait: 1.4,
  investigateSeconds: 7,
  fleeSeconds: 3.6,
  roamRadius: 13,
  leashRadius: 30,
  weakness: {
    category: 'phototropic',
    label: 'Phototropic overload',
    clue: 'Its solar vanes rotate to face any bright silhouette — even one that is only an echo.',
    exploit:
      'Trigger an echo pulse while uphill of the pack. The vanes lock, the legs freeze mid-step, and the Scuttler can be walked past safely.',
  },
  palette: {
    plate: [0.2, 0.3, 0.19],
    dark: [0.07, 0.1, 0.08],
    joint: [0.42, 0.36, 0.22],
    glow: [0.42, 1, 0.62],
    eye: [1, 0.86, 0.32],
  },
  rig: SCUTTLER_RIG,
};

/* ------------------------------------------------------------------ */
/* GR-02 Cinderhull Grazer — large mechanical sauropod                 */
/* ------------------------------------------------------------------ */

const GRAZER_RIG: RigSpec = {
  height: 6.2,
  joints: [
    joint('hips', null, [0, 2.75, 0], 'body'),
    joint('body', 'hips', [0, 0, 0], 'body'),
    joint('neck-1', 'body', [0, 0.85, 1.55], 'neck'),
    joint('neck-2', 'neck-1', [0, 0.95, 0.9], 'neck'),
    joint('head', 'neck-2', [0, 0.85, 0.75], 'head'),
    joint('jaw', 'head', [0, -0.18, 0.45], 'jaw'),
    joint('tail-1', 'body', [0, 0.45, -1.7], 'tail', 0, 0),
    joint('tail-2', 'tail-1', [0, 0, -1.25], 'tail', 0, 0.6),
    joint('tail-3', 'tail-2', [0, 0, -1.15], 'tail', 0, 1.2),
    ...([[-1, 'f'], [1, 'f'], [-1, 'b'], [1, 'b']] as const).flatMap(([side, end]) => {
      const prefix = `leg-${side < 0 ? 'l' : 'r'}-${end}`;
      const z = end === 'f' ? 1.35 : -1.35;
      const phase = end === 'f' ? (side < 0 ? 0 : Math.PI) : side < 0 ? Math.PI : 0;
      return [
        joint(`${prefix}-upper`, 'body', [side * 0.92, -0.22, z], 'leg', side as -1 | 1, phase),
        joint(`${prefix}-lower`, `${prefix}-upper`, [0, -1.25, 0], 'shin', side as -1 | 1, phase),
      ];
    }),
  ],
};

const GRAZER: SpeciesDefinition = {
  kind: 'grazer',
  name: 'Cinderhull Grazer',
  codename: 'GR-02',
  classification: 'Heavy grazer · quadrupedal mineral processor',
  temperamentLine: 'Slow, patient, and utterly certain of its own weight.',
  behaviour:
    'Walks a mineral circuit between meadow crusts. Stamps and lowers its neck at intruders but rarely gives chase; its furnace core runs hottest at dusk.',
  diet: 'Iron-rich soil crust, basalt grit and thermal vents.',
  sizeLabel: 'Large — two storeys at the shoulder',
  massKg: 6800,
  heightMetres: 6.2,
  lengthMetres: 10.5,
  threat: 3,
  threatLabel: 'Territorial — keep your distance',
  senses: { sightRange: 42, fovDegrees: 200, hearingRange: 26, awarenessRate: 0.62, awarenessDecay: 0.22 },
  motion: { walkSpeed: 1.15, runSpeed: 2.7, turnRate: 0.75, flightAltitude: 0, beatRate: 0, stride: 0.85 },
  temperament: { aggression: 0.5, skittishness: 0.18, curiosity: 0.3 },
  avoidWater: true,
  maxSlope: 22,
  idleSeconds: [3.5, 7.5],
  patrolWait: 4,
  investigateSeconds: 9,
  fleeSeconds: 4,
  roamRadius: 24,
  leashRadius: 58,
  weakness: {
    category: 'resonance',
    label: 'Resonance-blind knee servos',
    clue: 'Its knees tremble in time with the old reactor hum drifting from Station Theta.',
    exploit:
      'Herd the Grazer across the facility outflow and pulse as it crosses. The servos desynchronise, its stride stalls, and the meadow path opens.',
  },
  palette: {
    plate: [0.33, 0.19, 0.13],
    dark: [0.1, 0.09, 0.08],
    joint: [0.5, 0.34, 0.18],
    glow: [1, 0.42, 0.13],
    eye: [1, 0.62, 0.2],
  },
  rig: GRAZER_RIG,
  encounter: {
    title: 'Cinderhull Grazer',
    subtitle: 'A walking furnace crosses the meadow, plate by plate.',
    range: 32,
  },
};

/* ------------------------------------------------------------------ */
/* DR-11 Glasswing Drifter — flying robotic surveyor                   */
/* ------------------------------------------------------------------ */

const DRIFTER_RIG: RigSpec = {
  height: 1.1,
  joints: [
    joint('body', null, [0, 0, 0], 'body'),
    joint('head', 'body', [0, 0.16, 0.58], 'head'),
    joint('wing-l-1', 'body', [0.38, 0.12, 0.05], 'wing', -1),
    joint('wing-l-2', 'wing-l-1', [0.9, 0, 0.05], 'wingtip', -1),
    joint('wing-r-1', 'body', [-0.38, 0.12, 0.05], 'wing', 1),
    joint('wing-r-2', 'wing-r-1', [-0.9, 0, 0.05], 'wingtip', 1),
    joint('tail-1', 'body', [0, 0.02, -0.55], 'tail'),
    joint('tail-2', 'tail-1', [0, 0, -0.55], 'tail', 0, 0.7),
    joint('ring', 'body', [0, -0.24, 0], 'ring'),
  ],
};

const DRIFTER: SpeciesDefinition = {
  kind: 'drifter',
  name: 'Glasswing Drifter',
  codename: 'DR-11',
  classification: 'Aerial surveyor · thermal glider',
  temperamentLine: 'Restless. It would rather circle you than land.',
  behaviour:
    'Rides warm air above the river and lake, tilting its glass wings to hold a thermal. Dives at echoes, avoids cold spray, and returns to its column before it loses lift.',
  diet: 'Charged mist, updraft ions and reflected sunlight.',
  sizeLabel: 'Medium — four-metre wingspan',
  massKg: 210,
  heightMetres: 1.1,
  lengthMetres: 4.6,
  threat: 2,
  threatLabel: 'Unpredictable in the air',
  senses: { sightRange: 58, fovDegrees: 230, hearingRange: 30, awarenessRate: 0.78, awarenessDecay: 0.3 },
  motion: { walkSpeed: 3.4, runSpeed: 7.2, turnRate: 1.35, flightAltitude: 15, beatRate: 1.75, stride: 0.9 },
  temperament: { aggression: 0.24, skittishness: 0.58, curiosity: 0.72 },
  avoidWater: false,
  maxSlope: 90,
  idleSeconds: [2, 4],
  patrolWait: 1.2,
  investigateSeconds: 8,
  fleeSeconds: 3.2,
  roamRadius: 34,
  leashRadius: 72,
  weakness: {
    category: 'thermal',
    label: 'Thermal dependency',
    clue: 'Its wings go glass-still whenever cold spray drifts across the falls.',
    exploit:
      'Lure it through the waterfall plume, then pulse. With no warm air under it the Drifter must settle on the rocks — briefly harmless and easy to pass.',
  },
  palette: {
    plate: [0.52, 0.57, 0.6],
    dark: [0.13, 0.16, 0.2],
    joint: [0.62, 0.65, 0.68],
    glow: [0.32, 0.8, 1],
    eye: [0.62, 1, 1],
  },
  rig: DRIFTER_RIG,
  encounter: {
    title: 'Glasswing Drifter',
    subtitle: 'Something circles once overhead, then decides you are interesting.',
    range: 24,
  },
};

/* ------------------------------------------------------------------ */
/* WD-01 Verdigris Warden — armoured mechanical guardian               */
/* ------------------------------------------------------------------ */

const WARDEN_RIG: RigSpec = {
  height: 3.7,
  joints: [
    joint('hips', null, [0, 1.72, 0], 'body'),
    joint('torso', 'hips', [0, 0.42, 0], 'body'),
    joint('head', 'torso', [0, 1.0, 0], 'head'),
    joint('pack', 'torso', [0, 0.5, -0.45], 'pack'),
    joint('arm-l-upper', 'torso', [0.62, 0.78, 0], 'arm', -1),
    joint('arm-l-lower', 'arm-l-upper', [0, -0.78, 0], 'forearm', -1),
    joint('shield', 'arm-l-lower', [0.08, -0.85, 0.18], 'shield', -1),
    joint('arm-r-upper', 'torso', [-0.62, 0.78, 0], 'arm', 1, Math.PI),
    joint('arm-r-lower', 'arm-r-upper', [0, -0.78, 0], 'forearm', 1),
    joint('pike', 'arm-r-lower', [-0.05, -0.7, 0.1], 'pike', 1),
    joint('leg-l-upper', 'hips', [0.34, -0.18, 0], 'leg', -1),
    joint('leg-l-lower', 'leg-l-upper', [0, -0.86, 0], 'shin', -1),
    joint('leg-r-upper', 'hips', [-0.34, -0.18, 0], 'leg', 1, Math.PI),
    joint('leg-r-lower', 'leg-r-upper', [0, -0.86, 0], 'shin', 1, Math.PI),
  ],
};

const WARDEN: SpeciesDefinition = {
  kind: 'warden',
  name: 'Verdigris Warden',
  codename: 'WD-01',
  classification: 'Custodial guardian · armoured enforcer unit',
  temperamentLine: 'Old duty, newer rust. It still walks its rounds.',
  behaviour:
    'Holds a fixed patrol around the places it was built to protect. Challenges intruders with a raised aegis, advances only inside its post, and always returns to its route.',
  diet: 'Grid power, gate harmonics and maintenance drones.',
  sizeLabel: 'Large — three and a half metres of armour',
  massKg: 1450,
  heightMetres: 3.7,
  lengthMetres: 2.4,
  threat: 4,
  threatLabel: 'Guardian — avoid its patrol',
  senses: { sightRange: 46, fovDegrees: 125, hearingRange: 28, awarenessRate: 0.55, awarenessDecay: 0.16 },
  motion: { walkSpeed: 1.5, runSpeed: 3.2, turnRate: 1.05, flightAltitude: 0, beatRate: 0, stride: 1.2 },
  temperament: { aggression: 0.88, skittishness: 0.04, curiosity: 0.12 },
  avoidWater: true,
  maxSlope: 26,
  idleSeconds: [1.8, 3.2],
  patrolWait: 2.6,
  investigateSeconds: 8,
  fleeSeconds: 0,
  roamRadius: 10,
  leashRadius: 40,
  weakness: {
    category: 'harmonic',
    label: 'Echo-keyed aegis',
    clue: 'The shield face rings in answer to the Echo Gate, and every pulse it swallows costs it a stride.',
    exploit:
      'Pulse from beyond its post while the aegis is raised. The shield flares and locks for a breath — long enough to slip past, never long enough to fight.',
  },
  palette: {
    plate: [0.2, 0.4, 0.34],
    dark: [0.09, 0.13, 0.12],
    joint: [0.54, 0.48, 0.28],
    glow: [0.33, 1, 0.82],
    eye: [0.72, 1, 0.9],
  },
  rig: WARDEN_RIG,
  encounter: {
    title: 'Verdigris Warden',
    subtitle: 'The aegis wakes a heartbeat before the eyes do.',
    range: 30,
  },
};

export const SPECIES: Record<CreatureKind, SpeciesDefinition> = {
  scuttler: SCUTTLER,
  grazer: GRAZER,
  drifter: DRIFTER,
  warden: WARDEN,
};

export const SPECIES_ORDER: readonly CreatureKind[] = ['scuttler', 'grazer', 'drifter', 'warden'];

/** One individual in the valley. Patrol points are absolute world XZ. */
export interface CreatureSpawn {
  id: string;
  kind: CreatureKind;
  x: number;
  z: number;
  heading: number;
  patrol: readonly Vec2[];
  /** Personality variance applied on top of the species baseline. */
  variance?: Partial<SpeciesTemperament> & { scale?: number };
  /** Encounter copy override, or false to opt out. */
  encounter?: boolean;
}

/**
 * Roster chosen so every species is visible on a normal walk from the River
 * Bridge spawn: Scuttlers on the forest floor and plaza edge, Grazers in the
 * meadow and grove, Drifters over the falls and lake, Wardens on the city
 * square and the Station Theta deck.
 */
export const CREATURE_SPAWNS: readonly CreatureSpawn[] = [
  {
    id: 'scuttler-grove-1',
    kind: 'scuttler',
    x: 168,
    z: -86,
    heading: 0.6,
    patrol: [
      { x: 168, z: -86 },
      { x: 176, z: -92 },
      { x: 170, z: -100 },
      { x: 160, z: -94 },
    ],
    variance: { curiosity: 0.95, scale: 1.05 },
  },
  {
    id: 'scuttler-grove-2',
    kind: 'scuttler',
    x: 178,
    z: -98,
    heading: 2.4,
    patrol: [
      { x: 178, z: -98 },
      { x: 186, z: -92 },
      { x: 180, z: -84 },
    ],
    variance: { skittishness: 0.95, scale: 0.9 },
  },
  {
    id: 'scuttler-plaza',
    kind: 'scuttler',
    x: 56,
    z: 4,
    heading: 3.1,
    // This one has no route: it wanders the trail edge on its own business.
    patrol: [],
    variance: { curiosity: 0.7 },
  },
  {
    id: 'grazer-meadow',
    kind: 'grazer',
    x: 96,
    z: 40,
    heading: 1.9,
    patrol: [
      { x: 96, z: 40 },
      { x: 112, z: 30 },
      { x: 118, z: 12 },
      { x: 100, z: 10 },
    ],
  },
  {
    id: 'grazer-grove',
    kind: 'grazer',
    x: 150,
    z: -70,
    heading: 0.4,
    patrol: [
      { x: 150, z: -70 },
      { x: 160, z: -82 },
      { x: 148, z: -96 },
      { x: 136, z: -84 },
    ],
    variance: { aggression: 0.35, skittishness: 0.35, scale: 0.92 },
  },
  {
    id: 'drifter-falls',
    kind: 'drifter',
    x: 2,
    z: 168,
    heading: 1.2,
    patrol: [
      { x: 2, z: 168 },
      { x: 22, z: 178 },
      { x: -12, z: 182 },
      { x: -6, z: 158 },
    ],
  },
  {
    id: 'drifter-lake',
    kind: 'drifter',
    x: -70,
    z: -58,
    heading: -0.8,
    // A free glider: it hunts thermals instead of walking a line.
    patrol: [],
    variance: { curiosity: 0.9 },
  },
  {
    id: 'warden-city',
    kind: 'warden',
    x: -184,
    z: -16,
    heading: -2.2,
    patrol: [
      { x: -184, z: -16 },
      { x: -190, z: -6 },
      { x: -206, z: -10 },
      { x: -212, z: -28 },
      { x: -198, z: -40 },
      { x: -182, z: -34 },
    ],
  },
  {
    id: 'warden-station',
    kind: 'warden',
    x: -78,
    z: 190,
    heading: 1.4,
    patrol: [
      { x: -78, z: 190 },
      { x: -89, z: 209 },
      { x: -111, z: 209 },
      { x: -122, z: 190 },
      { x: -111, z: 171 },
      { x: -89, z: 171 },
    ],
    variance: { aggression: 0.95 },
  },
];

export function speciesFor(kind: CreatureKind): SpeciesDefinition {
  return SPECIES[kind];
}

export function spawnsOfKind(kind: CreatureKind): readonly CreatureSpawn[] {
  return CREATURE_SPAWNS.filter((spawn) => spawn.kind === kind);
}
