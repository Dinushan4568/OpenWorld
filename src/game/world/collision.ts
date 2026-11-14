/**
 * Static collision world for the expedition.
 *
 * The valley's solid props (rocks, pillars, trees, ruins, platforms) are
 * registered as vertical cylinders in a uniform 2D hash grid. Everything here
 * is engine-free and deterministic, so the traversal solver can be tested in
 * Node without a graphics device.
 */

export interface SolidCollider {
  x: number;
  z: number;
  radius: number;
  /** World-space Y of the collider's base. */
  base: number;
  /** World-space Y of the collider's top surface. */
  top: number;
  /** Walkable colliders can be stood on; the rest only block. */
  walkable: boolean;
  /** Optional tag for diagnostics. */
  kind: string;
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

export class CollisionWorld {
  private readonly cells = new Map<string, SolidCollider[]>();
  private readonly all: SolidCollider[] = [];

  get count(): number {
    return this.all.length;
  }

  clear(): void {
    this.cells.clear();
    this.all.length = 0;
  }

  add(collider: SolidCollider): void {
    if (collider.radius <= 0 || collider.top <= collider.base) return;
    this.all.push(collider);
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

  /** Colliders whose circle can touch a query circle, de-duplicated across cells. */
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
   * platforms remain stable.
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
   * supported by (used for daises, plinths and large rocks).
   */
  supportAt(x: number, z: number, feetY: number, stepHeight: number): number {
    let best = -Infinity;
    for (const collider of this.query(x, z, 0.01)) {
      if (!collider.walkable) continue;
      if (Math.abs(x - collider.x) > collider.radius || Math.abs(z - collider.z) > collider.radius) continue;
      if (Math.hypot(x - collider.x, z - collider.z) > collider.radius) continue;
      if (collider.top > feetY + stepHeight + 0.001) continue;
      if (collider.top > best) best = collider.top;
    }
    return best;
  }

  /** Point/sphere query used by the camera boom. */
  blocked(x: number, y: number, z: number, radius: number): boolean {
    for (const collider of this.query(x, z, radius)) {
      if (y < collider.base - radius || y > collider.top + radius) continue;
      const dx = x - collider.x;
      const dz = z - collider.z;
      const reach = radius + collider.radius;
      if (dx * dx + dz * dz < reach * reach) return true;
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
