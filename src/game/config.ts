/**
 * Echoes of the Lost World — global configuration.
 * Pure data only: this module must stay free of engine imports so it can be unit-tested in Node.
 */

export const GAME = {
  title: 'Echoes of the Lost World',
  shortTitle: 'Echoes',
  subtitle: 'An expedition beyond the silence',
  version: '0.1.0',
  phase: 'Phase 01 — Foundation',
  studio: 'Hollow Lantern Studio',
  storageKey: 'eotlw.settings.v1',
  progressKey: 'eotlw.progress.v1',
} as const;

export type QualityPreset = 'low' | 'medium' | 'high' | 'ultra';

export interface QualityProfile {
  id: QualityPreset;
  label: string;
  description: string;
  pixelRatioCap: number;
  renderScale: number;
  shadows: boolean;
  shadowResolution: number;
  shadowDistance: number;
  samples: number;
  bloom: boolean;
  ssao: boolean;
  anisotropy: number;
  drawDistance: number;
  scatterDensity: number;
}

export const QUALITY_PROFILES: Record<QualityPreset, QualityProfile> = {
  low: {
    id: 'low',
    label: 'Low',
    description: 'Integrated graphics · 720p-class',
    pixelRatioCap: 1,
    renderScale: 0.75,
    shadows: false,
    shadowResolution: 512,
    shadowDistance: 70,
    samples: 1,
    bloom: false,
    ssao: false,
    anisotropy: 2,
    drawDistance: 340,
    scatterDensity: 0.55,
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    description: 'Laptop GPUs · balanced',
    pixelRatioCap: 1.25,
    renderScale: 0.9,
    shadows: true,
    shadowResolution: 1024,
    shadowDistance: 110,
    samples: 2,
    bloom: true,
    ssao: false,
    anisotropy: 4,
    drawDistance: 480,
    scatterDensity: 0.8,
  },
  high: {
    id: 'high',
    label: 'High',
    description: 'Dedicated GPUs · recommended',
    pixelRatioCap: 1.75,
    renderScale: 1,
    shadows: true,
    shadowResolution: 2048,
    shadowDistance: 150,
    samples: 4,
    bloom: true,
    ssao: true,
    anisotropy: 8,
    drawDistance: 640,
    scatterDensity: 1,
  },
  ultra: {
    id: 'ultra',
    label: 'Ultra',
    description: 'Cinematic fidelity · high-end',
    pixelRatioCap: 2,
    renderScale: 1,
    shadows: true,
    shadowResolution: 4096,
    shadowDistance: 190,
    samples: 4,
    bloom: true,
    ssao: true,
    anisotropy: 16,
    drawDistance: 780,
    scatterDensity: 1.25,
  },
};

export const WORLD = {
  /** Extent of the playable heightfield (metres, centred on the origin). */
  terrainSize: 900,
  terrainResolution: 288,
  farTerrainSize: 2400,
  farTerrainResolution: 96,
  waterLevel: -1.6,
  /** Circular expedition boundary. */
  boundaryRadius: 330,
  fogColor: [0.45, 0.56, 0.55],
  lakeCenter: { x: -78, z: -66 },
  lakeRadius: 92,
  plazaCenter: { x: 46, z: -34 },
  gateCenter: { x: 152, z: 74 },
  spawn: { x: 18, z: 8 },
  sunAzimuth: 2.08,
  sunElevation: 0.34,
} as const;

export const PLAYER = {
  eyeHeight: 1.62,
  /** Capsule used for collision against terrain, props and the camera boom. */
  capsuleRadius: 0.38,
  capsuleHeight: 1.78,
  walkSpeed: 3.5,
  runSpeed: 6.6,
  sprintSpeed: 9.2,
  acceleration: 26,
  airControl: 0.35,
  gravity: 22,
  jumpVelocity: 6.4,
  maxSlope: 0.62, // cosine of the steepest walkable slope
  wadeDepth: 0.55,
  stepInterval: 0.44,
  /** Maximum lip the character can step up without jumping. */
  stepHeight: 0.55,
  /** Grace window to jump after walking off a ledge. */
  coyoteTime: 0.12,
  /** Input buffer so a jump pressed just before landing still fires. */
  jumpBufferTime: 0.14,
  maxFallSpeed: 32,
  /** Ground acceleration is exponential (1/s); air control scales it down. */
  groundLambda: 13,
  airLambda: 2.6,
} as const;

export const CAMERA = {
  distance: 5.4,
  minDistance: 2.2,
  maxDistance: 11,
  shoulder: 0.62,
  height: 1.55,
  minPitch: -0.62,
  maxPitch: 0.85,
  sensitivity: 1,
  fov: 62,
  sprintFovBoost: 6,
  positionDamping: 12,
  rotationDamping: 24,
} as const;

export const SHARD_LOCATIONS: ReadonlyArray<{ id: string; name: string; x: number; z: number; hint: string }> = [
  { id: 'shard_plaza', name: 'Echo Shard I', x: 46, z: -22, hint: 'The Sunken Plaza' },
  { id: 'shard_lake', name: 'Echo Shard II', x: -104, z: -108, hint: 'Mirrorwater Shore' },
  { id: 'shard_ridge', name: 'Echo Shard III', x: -152, z: 84, hint: 'The Windward Ridge' },
  { id: 'shard_gate', name: 'Echo Shard IV', x: 146, z: 58, hint: 'Foot of the Echo Gate' },
  { id: 'shard_grove', name: 'Echo Shard V', x: 182, z: -96, hint: 'The Whispering Grove' },
];

export const MODEL_FILES = {
  rock_cluster: 'rock_cluster.glb',
  monolith_spire: 'monolith_spire.glb',
  temple_pillar: 'temple_pillar.glb',
  echo_gate: 'echo_gate.glb',
  gate_rune: 'gate_rune.glb',
  spire_tree: 'spire_tree.glb',
  ruin_wall: 'ruin_wall.glb',
  echo_shard: 'echo_shard.glb',
  drone_body: 'drone_body.glb',
  drone_ring: 'drone_ring.glb',
  wayfarer: 'wayfarer.glb',
} as const;

export type ModelName = keyof typeof MODEL_FILES;

export const MODEL_URLS = Object.fromEntries(
  Object.entries(MODEL_FILES).map(([key, file]) => [key, `${import.meta.env?.BASE_URL ?? '/'}assets/models/${file}`.replace('//assets', '/assets')]),
) as Record<ModelName, string>;
