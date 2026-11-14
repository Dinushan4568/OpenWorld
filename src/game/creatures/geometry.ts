/**
 * Small procedural geometry kit for the robotic creatures.
 *
 * Everything is merged into a handful of meshes per rigid joint, so a creature
 * with six legs, armour plates, pistons and antennae costs only a few draw
 * calls instead of dozens of primitive render components.
 */
import { addVertex, createMeshData, type MeshData } from '../util/meshBuilder';
import type { Rgb } from './species';

export type Vec3 = [number, number, number];

const solid = (rgb: Rgb, alpha = 1): [number, number, number, number] => [rgb[0], rgb[1], rgb[2], alpha];

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const normalise = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};

const triangleNormal = (a: Vec3, b: Vec3, c: Vec3): Vec3 => normalise(cross(sub(b, a), sub(c, a)));

function quad(data: MeshData, a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: Rgb, outward: Vec3): void {
  let n = triangleNormal(a, b, c);
  if (dot(n, outward) < 0) {
    const swap = b;
    b = d;
    d = swap;
    n = triangleNormal(a, b, c);
  }
  const c4 = solid(color);
  const uv: Array<[number, number]> = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];
  const ia = addVertex(data, { p: a, n, uv: uv[0], c: c4 });
  const ib = addVertex(data, { p: b, n, uv: uv[1], c: c4 });
  const ic = addVertex(data, { p: c, n, uv: uv[2], c: c4 });
  const id = addVertex(data, { p: d, n, uv: uv[3], c: c4 });
  data.indices.push(ia, ib, ic, ia, ic, id);
}

function triangle(data: MeshData, a: Vec3, b: Vec3, c: Vec3, color: Rgb, outward: Vec3): void {
  let n = triangleNormal(a, b, c);
  if (dot(n, outward) < 0) {
    const swap = b;
    b = c;
    c = swap;
    n = triangleNormal(a, b, c);
  }
  const c4 = solid(color);
  const ia = addVertex(data, { p: a, n, uv: [0.5, 0], c: c4 });
  const ib = addVertex(data, { p: b, n, uv: [1, 0.5], c: c4 });
  const ic = addVertex(data, { p: c, n, uv: [0, 0.5], c: c4 });
  data.indices.push(ia, ib, ic);
}

export function addBox(
  data: MeshData,
  center: Vec3,
  size: Vec3,
  color: Rgb,
  yaw = 0,
): void {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size;
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  const point = (x: number, y: number, z: number): Vec3 => [
    cx + x * cos + z * sin,
    cy + y,
    cz - x * sin + z * cos,
  ];
  const dir = (x: number, y: number, z: number): Vec3 => [x * cos + z * sin, y, -x * sin + z * cos];
  const faces: Array<{ corners: Vec3[]; normal: Vec3 }> = [
    {
      corners: [point(hx, -hy, -hz), point(hx, hy, -hz), point(hx, hy, hz), point(hx, -hy, hz)],
      normal: dir(1, 0, 0),
    },
    {
      corners: [point(-hx, -hy, hz), point(-hx, hy, hz), point(-hx, hy, -hz), point(-hx, -hy, -hz)],
      normal: dir(-1, 0, 0),
    },
    {
      corners: [point(-hx, hy, -hz), point(-hx, hy, hz), point(hx, hy, hz), point(hx, hy, -hz)],
      normal: dir(0, 1, 0),
    },
    {
      corners: [point(-hx, -hy, hz), point(-hx, -hy, -hz), point(hx, -hy, -hz), point(hx, -hy, hz)],
      normal: dir(0, -1, 0),
    },
    {
      corners: [point(hx, -hy, hz), point(hx, hy, hz), point(-hx, hy, hz), point(-hx, -hy, hz)],
      normal: dir(0, 0, 1),
    },
    {
      corners: [point(-hx, -hy, -hz), point(-hx, hy, -hz), point(hx, hy, -hz), point(hx, -hy, -hz)],
      normal: dir(0, 0, -1),
    },
  ];
  for (const face of faces) {
    quad(data, face.corners[0], face.corners[1], face.corners[2], face.corners[3], color, face.normal);
  }
}

/** A tapered cylinder between two points — used for every piston and limb. */
export function addCylinder(
  data: MeshData,
  a: Vec3,
  b: Vec3,
  radius: number,
  color: Rgb,
  sides = 8,
  endRadius = radius,
): void {
  const axis = normalise(sub(b, a));
  const reference: Vec3 = Math.abs(axis[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const u = normalise(cross(reference, axis));
  const v = cross(axis, u);
  const ringA: Vec3[] = [];
  const ringB: Vec3[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    const cx = Math.cos(angle);
    const sx = Math.sin(angle);
    ringA.push([a[0] + (u[0] * cx + v[0] * sx) * radius, a[1] + (u[1] * cx + v[1] * sx) * radius, a[2] + (u[2] * cx + v[2] * sx) * radius]);
    ringB.push([
      b[0] + (u[0] * cx + v[0] * sx) * endRadius,
      b[1] + (u[1] * cx + v[1] * sx) * endRadius,
      b[2] + (u[2] * cx + v[2] * sx) * endRadius,
    ]);
  }
  const mid: Vec3 = [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5];
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    const outside: Vec3 = normalise([
      (ringA[i][0] + ringB[i][0]) * 0.5 - mid[0],
      (ringA[i][1] + ringB[i][1]) * 0.5 - mid[1],
      (ringA[i][2] + ringB[i][2]) * 0.5 - mid[2],
    ]);
    quad(data, ringA[i], ringB[i], ringB[j], ringA[j], color, outside);
  }
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    triangle(data, a, ringA[i], ringA[j], color, [-axis[0], -axis[1], -axis[2]]);
    triangle(data, b, ringB[i], ringB[j], color, axis);
  }
}

export function addCone(data: MeshData, base: Vec3, tip: Vec3, radius: number, color: Rgb, sides = 8): void {
  const axis = normalise(sub(tip, base));
  const reference: Vec3 = Math.abs(axis[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const u = normalise(cross(reference, axis));
  const v = cross(axis, u);
  const ring: Vec3[] = [];
  for (let i = 0; i < sides; i += 1) {
    const angle = (i / sides) * Math.PI * 2;
    const cx = Math.cos(angle);
    const sx = Math.sin(angle);
    ring.push([
      base[0] + (u[0] * cx + v[0] * sx) * radius,
      base[1] + (u[1] * cx + v[1] * sx) * radius,
      base[2] + (u[2] * cx + v[2] * sx) * radius,
    ]);
  }
  const mid: Vec3 = [(base[0] + tip[0]) * 0.5, (base[1] + tip[1]) * 0.5, (base[2] + tip[2]) * 0.5];
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    const outside: Vec3 = normalise([
      (ring[i][0] + tip[0]) * 0.5 - mid[0],
      (ring[i][1] + tip[1]) * 0.5 - mid[1],
      (ring[i][2] + tip[2]) * 0.5 - mid[2],
    ]);
    triangle(data, ring[i], ring[j], tip, color, outside);
  }
  for (let i = 0; i < sides; i += 1) {
    const j = (i + 1) % sides;
    triangle(data, base, ring[j], ring[i], color, [-axis[0], -axis[1], -axis[2]]);
  }
}

export function addSphere(
  data: MeshData,
  center: Vec3,
  radius: number,
  color: Rgb,
  segments = 10,
  rings = 6,
): void {
  const point = (lat: number, lon: number): Vec3 => {
    const cosLat = Math.cos(lat);
    return [
      center[0] + Math.cos(lon) * cosLat * radius,
      center[1] + Math.sin(lat) * radius,
      center[2] + Math.sin(lon) * cosLat * radius,
    ];
  };
  for (let r = 0; r < rings; r += 1) {
    const lat0 = -Math.PI / 2 + (r / rings) * Math.PI;
    const lat1 = -Math.PI / 2 + ((r + 1) / rings) * Math.PI;
    for (let s = 0; s < segments; s += 1) {
      const lon0 = (s / segments) * Math.PI * 2;
      const lon1 = ((s + 1) / segments) * Math.PI * 2;
      const a = point(lat0, lon0);
      const b = point(lat0, lon1);
      const c = point(lat1, lon1);
      const d = point(lat1, lon0);
      const outside: Vec3 = normalise([
        (a[0] + b[0] + c[0] + d[0]) * 0.25 - center[0],
        (a[1] + b[1] + c[1] + d[1]) * 0.25 - center[1],
        (a[2] + b[2] + c[2] + d[2]) * 0.25 - center[2],
      ]);
      if (r === 0) triangle(data, a, c, d, color, outside);
      else if (r === rings - 1) triangle(data, a, b, c, color, outside);
      else quad(data, a, b, c, d, color, outside);
    }
  }
}

/** A torus lying in the XZ plane — hover rings and shield emblems. */
export function addRing(
  data: MeshData,
  center: Vec3,
  radius: number,
  tube: number,
  color: Rgb,
  major = 16,
  minor = 4,
): void {
  const point = (a: number, b: number): Vec3 => {
    const ringRadius = radius + Math.cos(b) * tube;
    return [
      center[0] + Math.cos(a) * ringRadius,
      center[1] + Math.sin(b) * tube,
      center[2] + Math.sin(a) * ringRadius,
    ];
  };
  for (let i = 0; i < major; i += 1) {
    const a0 = (i / major) * Math.PI * 2;
    const a1 = ((i + 1) / major) * Math.PI * 2;
    for (let j = 0; j < minor; j += 1) {
      const b0 = (j / minor) * Math.PI * 2;
      const b1 = ((j + 1) / minor) * Math.PI * 2;
      const p0 = point(a0, b0);
      const p1 = point(a1, b0);
      const p2 = point(a1, b1);
      const p3 = point(a0, b1);
      const tubeCentre: Vec3 = [center[0] + Math.cos((a0 + a1) * 0.5) * radius, center[1], center[2] + Math.sin((a0 + a1) * 0.5) * radius];
      const outside: Vec3 = normalise([
        (p0[0] + p1[0] + p2[0] + p3[0]) * 0.25 - tubeCentre[0],
        (p0[1] + p1[1] + p2[1] + p3[1]) * 0.25 - tubeCentre[1],
        (p0[2] + p1[2] + p2[2] + p3[2]) * 0.25 - tubeCentre[2],
      ]);
      quad(data, p0, p1, p2, p3, color, outside);
    }
  }
}

export function mesh(): MeshData {
  return createMeshData();
}
