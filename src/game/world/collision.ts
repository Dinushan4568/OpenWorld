/**
 * Static collision world for the expedition.
 *
 * Solids are registered as vertical cylinders or axis-aligned boxes in a
 * uniform 2D hash grid. Chunk-streamed content tags its colliders with a group
 * id so a whole chunk can be removed when it unloads. Everything here is
 * engine-free and deterministic, so the traversal solver and the chunk
 * streaming tests run in Node without a graphics device.
 */

export interface SolidCollider {
  x: number;
  z: number;
  /** Bounding radius (also the collision radius for circle colliders). */
  radius: number;
  /** World-space Y of the collider's base. */
  base: number;
  /** World-space Y of the collider's top surface. */
  top: number;
  /** Walkable colliders can be stood on; the rest only block. */
  walkable: boolean;
  /** Optional tag for diagnostics. */
  kind: string;
  /** Collider footprint. Defaults to a circle. */
  shape?: 'circle' | 'box';
  /** Half extents for box colliders (axis-aligned). */
  halfX?: number;
  halfZ?: number;
  /** Streaming group, used to unload a chunk's colliders in one call. */
  group?: string;
}

export interface PushResult {
  x: number;
  z: number;
  /** True when a collider pushed the point. */
  hit: boolean;
  /** Summed, normalised push direction (points away from the obstacles). */
  nx: number;
  nz: number;
}

const CELL_SIZE = 8;

function cellKey(ix: number, iz: number): string {
  return `${ix}|${iz}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class CollisionWorld {
  private readonly cells = new Map<string, SolidCollider[]>();
  private readonly all: SolidCollider[] = [];

  get count(): number {
    return this.all.length;
  }

  /** Number of colliders currently registered by a streaming group. */
  groupCount(group: string): number {
    return this.all.reduce((count, collider) => count + (collider.group === group ? 1 : 0), 0);
  }

  clear(): void {
    this.cells.clear();
    this.all.length = 0;
  }

  add(collider: SolidCollider, group?: string): void {
    if (collider.top <= collider.base) return;
    if (collider.shape === 'box') {
      const halfX = Math.max(0.05, collider.halfX ?? collider.radius);
      const halfZ = Math.max(0.05, collider.halfZ ?? collider.radius);
      if (halfX <= 0 || halfZ <= 0) return;
      collider.halfX = halfX;
      collider.halfZ = halfZ;
      collider.radius = Math.max(collider.radius, Math.hypot(halfX, halfZ));
    } else if (collider.radius <= 0) {
      return;
    }
    if (group) collider.group = group;
    this.all.push(collider);
    this.index(collider);
  }

  /** Register many colliders under one streaming group. */
  addGroup(colliders: readonly Omit<SolidCollider, 'group'>[], group: string): void {
    for (const collider of colliders) this.add({ ...collider }, group);
  }

  /** Remove every collider belonging to a streaming group. */
  removeGroup(group: string): void {
    let removed = 0;
    for (let i = this.all.length - 1; i >= 0; i--) {
      if (this.all[i].group === group) {
        this.all.splice(i, 1);
        removed++;
      }
    }
    if (removed) this.rebuild();
  }

  private index(collider: SolidCollider): void {
    const minX = Math.floor((collider.x - collider.radius) / CELL_SIZE);
    const maxX = Math.floor((collider.x + collider.radius) / CELL_SIZE);
    const minZ = Math.floor((collider.z - collider.radius) / CELL_SIZE);
    const maxZ = Math.floor((collider.z + collider.radius) / CELL_SIZE);
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const key = cellKey(ix, iz);
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(collider);
        else this.cells.set(key, [collider]);
      }
    }
  }

  private rebuild(): void {
    this.cells.clear();
    for (const collider of this.all) this.index(collider);
  }

  /** Colliders whose footprint can touch a query circle, de-duplicated. */
  query(x: number, z: number, radius: number): SolidCollider[] {
    const minX = Math.floor((x - radius) / CELL_SIZE);
    const maxX = Math.floor((x + radius) / CELL_SIZE);
    const minZ = Math.floor((z - radius) / CELL_SIZE);
    const maxZ = Math.floor((z + radius) / CELL_SIZE);
    const seen = new Set<SolidCollider>();
    for (let ix = minX; ix <= maxX; ix++) {
      for (let iz = minZ; iz <= maxZ; iz++) {
        const bucket = this.cells.get(cellKey(ix, iz));
        if (!bucket) continue;
        for (const collider of bucket) {
          if (Math.abs(collider.x - x) > radius + collider.radius) continue;
          if (Math.abs(collider.z - z) > radius + collider.radius) continue;
          seen.add(collider);
        }
      }
    }
    return [...seen];
  }

  /**
   * Push a vertical capsule out of every blocking collider it intersects.
   * Colliders the feet are standing on (or above) never push, so walkable
   * platforms remain stable. Colliders low enough to step onto are ignored.
   */
  resolve(
    x: number,
    z: number,
    radius: number,
    feetY: number,
    height: number,
    stepHeight = 0,
    passes = 2,
  ): PushResult {
    let px = x;
    let pz = z;
    let nx = 0;
    let nz = 0;
    let hit = false;
    const headY = feetY + height;

    for (let pass = 0; pass < passes; pass++) {
      let moved = false;
      for (const collider of this.query(px, pz, radius)) {
        if (collider.top <= feetY + 0.02) continue; // standing on / above it
        if (collider.walkable && collider.top <= feetY + stepHeight) continue; // low enough to step onto
        if (collider.base >= headY) continue; // passing underneath

        if (collider.shape === 'box') {
          const halfX = collider.halfX ?? collider.radius;
          const halfZ = collider.halfZ ?? collider.radius;
          const closestX = clamp(px, collider.x - halfX, collider.x + halfX);
          const closestZ = clamp(pz, collider.z - halfZ, collider.z + halfZ);
          let dx = px - closestX;
          let dz = pz - closestZ;
          const distance = Math.hypot(dx, dz);
          if (distance > 1e-5) {
            if (distance >= radius) continue;
            dx /= distance;
            dz /= distance;
            const push = radius - distance;
            px += dx * push;
            pz += dz * push;
            nx += dx;
            nz += dz;
            hit = true;
            moved = true;
          } else {
            // Inside the footprint: escape along the shallowest face.
            const toLeft = px - (collider.x - halfX);
            const toRight = collider.x + halfX - px;
            const toBack = pz - (collider.z - halfZ);
            const toFront = collider.z + halfZ - pz;
            const minimum = Math.min(toLeft, toRight, toBack, toFront);
            let ex = 0;
            let ez = 0;
            if (minimum === toLeft) ex = -1;
            else if (minimum === toRight) ex = 1;
            else if (minimum === toBack) ez = -1;
            else ez = 1;
            px += ex * (minimum + radius);
            pz += ez * (minimum + radius);
            nx += ex;
            nz += ez;
            hit = true;
            moved = true;
          }
          continue;
        }

        let dx = px - collider.x;
        let dz = pz - collider.z;
        let distance = Math.hypot(dx, dz);
        const minDistance = radius + collider.radius;
        if (distance >= minDistance) continue;
        if (distance < 1e-5) {
          dx = 1;
          dz = 0;
          distance = 1;
        }
        const ux = dx / distance;
        const uz = dz / distance;
        const push = minDistance - distance;
        px += ux * push;
        pz += uz * push;
        nx += ux;
        nz += uz;
        hit = true;
        moved = true;
      }
      if (!moved) break;
    }

    const len = Math.hypot(nx, nz);
    return { x: px, z: pz, hit, nx: len > 1e-5 ? nx / len : 0, nz: len > 1e-5 ? nz / len : 0 };
  }

  /**
   * Highest walkable surface under a point that the character could be
   * supported by (used for daises, plinths, rooftops and large rocks).
   */
  supportAt(x: number, z: number, feetY: number, stepHeight: number): number {
    let best = -Infinity;
    for (const collider of this.query(x, z, 0.01)) {
      if (!collider.walkable) continue;
      if (collider.shape === 'box') {
        if (Math.abs(x - collider.x) > (collider.halfX ?? collider.radius)) continue;
        if (Math.abs(z - collider.z) > (collider.halfZ ?? collider.radius)) continue;
      } else {
        if (Math.hypot(x - collider.x, z - collider.z) > collider.radius) continue;
      }
      if (collider.top > feetY + stepHeight + 0.001) continue;
      if (collider.top > best) best = collider.top;
    }
    return best;
  }

  /** Point/sphere query used by the camera boom. */
  blocked(x: number, y: number, z: number, radius: number): boolean {
    for (const collider of this.query(x, z, radius)) {
      if (y < collider.base - radius || y > collider.top + radius) continue;
      if (collider.shape === 'box') {
        const halfX = collider.halfX ?? collider.radius;
        const halfZ = collider.halfZ ?? collider.radius;
        const dx = Math.max(Math.abs(x - collider.x) - halfX, 0);
        const dz = Math.max(Math.abs(z - collider.z) - halfZ, 0);
        if (dx * dx + dz * dz < radius * radius) return true;
      } else {
        const dx = x - collider.x;
        const dz = z - collider.z;
        const reach = radius + collider.radius;
        if (dx * dx + dz * dz < reach * reach) return true;
      }
    }
    return false;
  }

  /** Diagnostics snapshot for the debug HUD. */
  describeNearest(x: number, z: number): SolidCollider | null {
    let best: SolidCollider | null = null;
    let bestDistance = Infinity;
    for (const collider of this.query(x, z, 6)) {
      const distance = Math.hypot(x - collider.x, z - collider.z) - collider.radius;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = collider;
      }
    }
    return best;
  }
}
