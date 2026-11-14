/** Collision metadata for every modular prop in the library. */
import type { ModelName } from '../config';

export interface SolidDefinition {
  /** Bounding/collision radius at scale 1. */
  radius: number;
  /** Height above the placement point at scale 1. */
  height: number;
  walkable?: boolean;
  shape?: 'circle' | 'box';
  /** Half extents at scale 1 for box footprints. */
  halfX?: number;
  halfZ?: number;
}

export const PROP_SOLIDS: Partial<Record<ModelName, SolidDefinition>> = {
  rock_cluster: { radius: 1.35, height: 2.1, walkable: true },
  spire_tree: { radius: 0.42, height: 6.0 },
  temple_pillar: { radius: 0.72, height: 4.8 },
  ruin_wall: { radius: 2.1, height: 2.9 },
  monolith_spire: { radius: 1.0, height: 7.4 },
  city_block: { radius: 6.2, height: 12.8, shape: 'box', halfX: 4.7, halfZ: 4.2 },
  city_tower: { radius: 7.2, height: 44, shape: 'box', halfX: 5.1, halfZ: 5.1 },
  city_arch: { radius: 9.2, height: 8.9, shape: 'box', halfX: 9.2, halfZ: 2.8 },
  facility_pylon: { radius: 2.3, height: 11.4 },
  facility_dish: { radius: 2.8, height: 6.4 },
  facility_block: { radius: 6.6, height: 5.6, shape: 'box', halfX: 6.5, halfZ: 4.5 },
  crystal_cluster: { radius: 1.7, height: 3.6 },
};
