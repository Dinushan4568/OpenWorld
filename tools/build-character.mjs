#!/usr/bin/env node
/**
 * Echoes of the Lost World — character asset pipeline.
 *
 * Authors the game's original humanoid expedition suit ("The Wayfarer") as a
 * glTF 2.0 binary with a named, jointed node hierarchy. The runtime animator
 * (src/game/player/CharacterModel.ts) drives these joints with procedural gait
 * synthesis, so the model ships without baked clips and stays fully editable.
 *
 * Everything here is generated from scratch: no third-party meshes, textures,
 * scans, characters or rigs. Run with:  npm run assets
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/assets/models');
const FILE = 'wayfarer.glb';

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

const TAU = Math.PI * 2;
/** Global tessellation scale — keeps the asset lean without changing its silhouette. */
const TESS = 0.72;
const rad = (d) => (d * Math.PI) / 180;

/** Vertex accumulator for one material group, with explicit surface normals. */
function group() {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

function vertex(g, p, n, uv = [0, 0]) {
  g.positions.push(p[0], p[1], p[2]);
  g.normals.push(n[0], n[1], n[2]);
  g.uvs.push(uv[0], uv[1]);
  return g.positions.length / 3 - 1;
}

function tri(g, a, b, c) {
  g.indices.push(a, b, c);
}

/* -------------------------------------------------------------------------- */
/* Geometry primitives (local joint space, metres)                            */
/* -------------------------------------------------------------------------- */

/**
 * Ellipsoid with analytic normals. `phiFrom`/`phiTo` allow hemispheres and
 * caps; the default covers the full sphere.
 */
function ellipsoid(g, opts) {
  let {
    cx = 0, cy = 0, cz = 0,
    rx = 0.1, ry = 0.1, rz = 0.1,
    segU = 20, segV = 14,
    phiFrom = -Math.PI / 2, phiTo = Math.PI / 2,
    tiltX = 0, tiltZ = 0,
  } = opts;
  segU = Math.max(8, Math.round(segU * TESS));
  segV = Math.max(6, Math.round(segV * TESS));
  const base = g.positions.length / 3;
  const cosT = Math.cos(tiltX), sinT = Math.sin(tiltX);
  const cosZ = Math.cos(tiltZ), sinZ = Math.sin(tiltZ);

  const place = (x, y, z) => {
    // Tilt about X, then Z, around the local origin.
    const y1 = y * cosT - z * sinT;
    const z1 = y * sinT + z * cosT;
    const x2 = x * cosZ - y1 * sinZ;
    const y2 = x * sinZ + y1 * cosZ;
    return [cx + x2, cy + y2, cz + z1];
  };
  const normalAt = (nx, ny, nz) => {
    const y1 = ny * cosT - nz * sinT;
    const z1 = ny * sinT + nz * cosT;
    const x2 = nx * cosZ - y1 * sinZ;
    const y2 = nx * sinZ + y1 * cosZ;
    const len = Math.hypot(x2, y2, z1) || 1;
    return [x2 / len, y2 / len, z1 / len];
  };

  for (let v = 0; v <= segV; v++) {
    const phi = phiFrom + (phiTo - phiFrom) * (v / segV);
    const cp = Math.cos(phi);
    const sp = Math.sin(phi);
    for (let u = 0; u <= segU; u++) {
      const theta = (u / segU) * TAU;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      // Sphere point scaled into the ellipsoid.
      const p = place(ct * cp * rx, sp * ry, st * cp * rz);
      // Ellipsoid normal uses the inverse-square scaling.
      const n = normalAt(ct * cp * rx, sp * ry, st * cp * rz);
      vertex(g, p, n, [u / segU, v / segV]);
    }
  }
  for (let v = 0; v < segV; v++) {
    for (let u = 0; u < segU; u++) {
      const i0 = base + v * (segU + 1) + u;
      const i1 = i0 + 1;
      const i2 = i0 + (segU + 1);
      const i3 = i2 + 1;
      tri(g, i0, i2, i1);
      tri(g, i1, i2, i3);
    }
  }
}

/**
 * Tapered capsule hanging from the joint origin along -Y, with rounded caps.
 * The limb capsule is the workhorse for arms, legs, fingers and hoses.
 */
function capsule(g, opts) {
  let {
    length = 0.3,
    rTop = 0.05,
    rBottom = 0.04,
    radial = 16,
    capSegs = 5,
    cx = 0, cy = 0, cz = 0,
    tilt = 0,
  } = opts;

  radial = Math.max(8, Math.round(radial * TESS));
  capSegs = Math.max(3, Math.round(capSegs * TESS));
  const rings = [];
  for (let v = 1; v <= capSegs; v++) {
    const phi = (v / capSegs) * (Math.PI / 2);
    rings.push({
      y: Math.cos(phi) * rTop,
      r: Math.sin(phi) * rTop,
      ny: Math.cos(phi),
      nr: Math.sin(phi),
    });
  }
  for (let v = 1; v <= 8; v++) {
    const t = v / 8;
    rings.push({
      y: -length * t,
      r: rTop + (rBottom - rTop) * t,
      ny: (rTop - rBottom) / length,
      nr: 1,
    });
  }
  for (let v = 1; v <= capSegs; v++) {
    const phi = (Math.PI / 2) * (v / capSegs);
    rings.push({
      y: -length - Math.sin(phi) * rBottom,
      r: Math.cos(phi) * rBottom,
      ny: -Math.sin(phi),
      nr: Math.cos(phi),
    });
  }

  const tiltCos = Math.cos(tilt);
  const tiltSin = Math.sin(tilt);
  const base = g.positions.length / 3;
  for (const ring of rings) {
    for (let u = 0; u <= radial; u++) {
      const theta = (u / radial) * TAU;
      const ct = Math.cos(theta);
      const st = Math.sin(theta);
      const x = ct * ring.r;
      const z = st * ring.r;
      const y = ring.y;
      // Tilt around X for angled hoses/thumbs.
      const ty = y * tiltCos - z * tiltSin;
      const tz = y * tiltSin + z * tiltCos;
      const ny = ring.ny * tiltCos - st * ring.nr * tiltSin;
      const nz = ring.ny * tiltSin + st * ring.nr * tiltCos;
      const nx = ct * ring.nr;
      const len = Math.hypot(nx, ny, nz) || 1;
      vertex(g, [cx + x, cy + ty, cz + tz], [nx / len, ny / len, nz / len], [u / radial, ring.y / Math.max(length, 0.001)]);
    }
  }
  const stride = radial + 1;
  for (let v = 0; v < rings.length - 1; v++) {
    for (let u = 0; u < radial; u++) {
      const i0 = base + v * stride + u;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      tri(g, i0, i2, i1);
      tri(g, i1, i2, i3);
    }
  }
}

/** Torus band around the Y axis — belts, collars, cuffs and wrist seals. */
function band(g, opts) {
  let {
    cx = 0, cy = 0, cz = 0,
    radius = 0.2,
    tube = 0.02,
    arc = TAU,
    segU = 28,
    segV = 8,
    tiltX = 0,
    tiltZ = 0,
  } = opts;
  segU = Math.max(10, Math.round(segU * TESS));
  segV = Math.max(5, Math.round(segV * TESS));
  const base = g.positions.length / 3;
  const closed = Math.abs(arc - TAU) < 1e-6;
  const uMax = closed ? segU : segU;
  for (let u = 0; u <= uMax; u++) {
    const theta = (u / segU) * arc;
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    for (let v = 0; v <= segV; v++) {
      const phi = (v / segV) * TAU;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      const rr = radius + tube * cp;
      const x = ct * rr;
      const y = tube * sp;
      const z = st * rr;
      const nx = ct * cp;
      const ny = sp;
      const nz = st * cp;
      const y1 = y * Math.cos(tiltX) - z * Math.sin(tiltX);
      const z1 = y * Math.sin(tiltX) + z * Math.cos(tiltX);
      const x2 = x * Math.cos(tiltZ) - y1 * Math.sin(tiltZ);
      const y2 = x * Math.sin(tiltZ) + y1 * Math.cos(tiltZ);
      vertex(g, [cx + x2, cy + y2, cz + z1], [nx, ny, nz], [u / segU, v / segV]);
    }
  }
  const stride = segV + 1;
  for (let u = 0; u < uMax; u++) {
    for (let v = 0; v < segV; v++) {
      const i0 = base + u * stride + v;
      const i1 = i0 + 1;
      const i2 = i0 + stride;
      const i3 = i2 + 1;
      tri(g, i0, i2, i1);
      tri(g, i1, i2, i3);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Materials                                                                  */
/* -------------------------------------------------------------------------- */

const MATERIALS = [
  { name: 'wayfarer_fabric', baseColor: [0.052, 0.072, 0.078, 1], metallic: 0.0, roughness: 0.86, doubleSided: true },
  { name: 'wayfarer_leather', baseColor: [0.105, 0.064, 0.034, 1], metallic: 0.02, roughness: 0.68, doubleSided: true },
  { name: 'wayfarer_metal', baseColor: [0.205, 0.225, 0.235, 1], metallic: 0.86, roughness: 0.38, doubleSided: true },
  { name: 'wayfarer_accent', baseColor: [0.62, 0.29, 0.075, 1], metallic: 0.45, roughness: 0.44, doubleSided: true },
  { name: 'wayfarer_visor', baseColor: [0.012, 0.045, 0.055, 1], metallic: 0.9, roughness: 0.16, emissive: [0.18, 0.72, 0.66], doubleSided: true },
  { name: 'wayfarer_bio', baseColor: [0.02, 0.14, 0.12, 1], metallic: 0.25, roughness: 0.34, emissive: [0.16, 0.95, 0.78], doubleSided: true },
  { name: 'wayfarer_cloth', baseColor: [0.088, 0.118, 0.112, 1], metallic: 0.0, roughness: 0.94, doubleSided: true },
];
const MAT = Object.fromEntries(MATERIALS.map((entry, index) => [entry.name.replace('wayfarer_', ''), index]));

/* -------------------------------------------------------------------------- */
/* Skeleton + per-joint geometry                                              */
/* -------------------------------------------------------------------------- */

const nodes = [];
const nodeIndex = new Map();

function joint(name, parent, translation) {
  const record = { name, children: [], parts: [] };
  if (translation) record.translation = translation;
  if (parent) {
    const parentIndex = nodeIndex.get(parent);
    if (parentIndex === undefined) throw new Error(`Unknown parent joint: ${parent}`);
    nodes[parentIndex].children.push(nodes.length);
  }
  nodeIndex.set(name, nodes.length);
  nodes.push(record);
  return name;
}

function part(jointName, materialName, builder) {
  const index = nodeIndex.get(jointName);
  if (index === undefined) throw new Error(`Unknown joint for part: ${jointName}`);
  nodes[index].parts.push({ material: MAT[materialName], geo: builder });
}

const g = () => group();

/* Root -------------------------------------------------------------------- */
joint('wayfarer', null, [0, 0, 0]);

/* Pelvis ------------------------------------------------------------------ */
joint('hips', 'wayfarer', [0, 0.96, 0]);

part('hips', 'fabric', () => {
  const o = g();
  ellipsoid(o, { cy: 0.01, rx: 0.165, ry: 0.125, rz: 0.125, segU: 22, segV: 14 });
  ellipsoid(o, { cy: -0.055, cz: 0.005, rx: 0.155, ry: 0.085, rz: 0.12, segU: 20, segV: 12 });
  return o;
});
part('hips', 'leather', () => {
  const o = g();
  // Utility pouches on the hips, slightly asymmetric for a used look.
  ellipsoid(o, { cx: 0.155, cy: -0.005, cz: 0.055, rx: 0.045, ry: 0.06, rz: 0.038, segU: 14, segV: 10 });
  ellipsoid(o, { cx: -0.15, cy: -0.02, cz: -0.03, rx: 0.04, ry: 0.052, rz: 0.034, segU: 14, segV: 10 });
  return o;
});
part('hips', 'metal', () => {
  const o = g();
  band(o, { cy: 0.045, radius: 0.163, tube: 0.017, segU: 26, segV: 6, tiltZ: 0.04 });
  ellipsoid(o, { cy: 0.04, cz: 0.128, rx: 0.036, ry: 0.03, rz: 0.014, segU: 14, segV: 8 });
  return o;
});

/* Lower jacket skirt ------------------------------------------------------ */
joint('skirt', 'hips', [0, -0.06, 0]);
part('skirt', 'cloth', () => {
  const o = g();
  // Split jacket tails: front, back and two sides.
  ellipsoid(o, { cy: -0.14, cz: 0.095, rx: 0.085, ry: 0.16, rz: 0.02, segU: 16, segV: 10, tiltX: 0.08 });
  ellipsoid(o, { cy: -0.17, cz: -0.115, rx: 0.115, ry: 0.19, rz: 0.022, segU: 18, segV: 12 });
  ellipsoid(o, { cx: 0.155, cy: -0.13, cz: -0.01, rx: 0.02, ry: 0.14, rz: 0.08, segU: 14, segV: 10, tiltZ: -0.14 });
  ellipsoid(o, { cx: -0.155, cy: -0.13, cz: -0.01, rx: 0.02, ry: 0.14, rz: 0.08, segU: 14, segV: 10, tiltZ: 0.14 });
  return o;
});

/* Spine + abdomen --------------------------------------------------------- */
joint('spine', 'hips', [0, 0.06, 0]);
part('spine', 'fabric', () => {
  const o = g();
  ellipsoid(o, { cy: 0.085, cz: 0.002, rx: 0.158, ry: 0.16, rz: 0.112, segU: 22, segV: 14 });
  return o;
});
part('spine', 'leather', () => {
  const o = g();
  // Harness straps running over the abdomen.
  band(o, { cy: 0.02, radius: 0.157, tube: 0.014, segU: 24, segV: 6, tiltZ: 0.03 });
  ellipsoid(o, { cy: 0.05, cz: 0.108, rx: 0.06, ry: 0.08, rz: 0.02, segU: 14, segV: 8 });
  return o;
});
part('spine', 'metal', () => {
  const o = g();
  band(o, { cy: 0.12, radius: 0.15, tube: 0.01, segU: 24, segV: 5 });
  return o;
});

/* Chest ------------------------------------------------------------------- */
joint('chest', 'spine', [0, 0.17, 0]);
part('chest', 'fabric', () => {
  const o = g();
  ellipsoid(o, { cy: 0.105, rx: 0.205, ry: 0.21, rz: 0.142, segU: 26, segV: 16 });
  // Trapezius / shoulder shelf.
  ellipsoid(o, { cy: 0.235, rx: 0.195, ry: 0.06, rz: 0.115, segU: 22, segV: 10 });
  return o;
});
part('chest', 'metal', () => {
  const o = g();
  // Segmented breastplate.
  ellipsoid(o, { cy: 0.13, cz: 0.115, rx: 0.155, ry: 0.125, rz: 0.045, segU: 22, segV: 12, tiltX: 0.12 });
  ellipsoid(o, { cy: 0.035, cz: 0.122, rx: 0.125, ry: 0.045, rz: 0.032, segU: 18, segV: 8 });
  band(o, { cy: 0.245, radius: 0.12, tube: 0.018, segU: 22, segV: 6 });
  return o;
});
part('chest', 'accent', () => {
  const o = g();
  ellipsoid(o, { cy: 0.1, cz: 0.158, rx: 0.018, ry: 0.085, rz: 0.012, segU: 12, segV: 8 });
  ellipsoid(o, { cx: 0.1, cy: 0.225, cz: 0.06, rx: 0.045, ry: 0.016, rz: 0.03, segU: 12, segV: 6 });
  return o;
});
part('chest', 'leather', () => {
  const o = g();
  // Shoulder harness and the collar seal.
  ellipsoid(o, { cx: 0.115, cy: 0.2, cz: 0.08, rx: 0.032, ry: 0.11, rz: 0.02, segU: 12, segV: 10, tiltZ: 0.5 });
  ellipsoid(o, { cx: -0.115, cy: 0.2, cz: 0.08, rx: 0.032, ry: 0.11, rz: 0.02, segU: 12, segV: 10, tiltZ: -0.5 });
  band(o, { cy: 0.275, radius: 0.085, tube: 0.02, segU: 20, segV: 6 });
  return o;
});

/* Neck + head ------------------------------------------------------------- */
joint('neck', 'chest', [0, 0.3, 0.005]);
part('neck', 'fabric', () => {
  const o = g();
  capsule(o, { cy: 0.055, length: 0.09, rTop: 0.055, rBottom: 0.062, radial: 14, capSegs: 4 });
  return o;
});

joint('head', 'neck', [0, 0.085, 0.002]);
part('head', 'metal', () => {
  const o = g();
  // Helmet shell, jaw guard and ear pods.
  ellipsoid(o, { cy: 0.085, cz: -0.005, rx: 0.107, ry: 0.118, rz: 0.118, segU: 24, segV: 16 });
  ellipsoid(o, { cy: 0.005, cz: 0.035, rx: 0.088, ry: 0.062, rz: 0.095, segU: 20, segV: 12 });
  ellipsoid(o, { cx: 0.09, cy: 0.075, cz: 0.0, rx: 0.028, ry: 0.04, rz: 0.045, segU: 12, segV: 8 });
  ellipsoid(o, { cx: -0.09, cy: 0.075, cz: 0.0, rx: 0.028, ry: 0.04, rz: 0.045, segU: 12, segV: 8 });
  return o;
});
part('head', 'visor', () => {
  const o = g();
  ellipsoid(o, { cy: 0.098, cz: 0.083, rx: 0.082, ry: 0.052, rz: 0.052, segU: 22, segV: 12, tiltX: -0.18 });
  return o;
});
part('head', 'fabric', () => {
  const o = g();
  // Hood cowl behind the helmet.
  ellipsoid(o, { cy: 0.055, cz: -0.075, rx: 0.125, ry: 0.135, rz: 0.09, segU: 22, segV: 14 });
  return o;
});
part('head', 'accent', () => {
  const o = g();
  ellipsoid(o, { cx: 0.095, cy: 0.075, cz: 0.05, rx: 0.016, ry: 0.022, rz: 0.012, segU: 10, segV: 6 });
  ellipsoid(o, { cx: -0.095, cy: 0.075, cz: 0.05, rx: 0.016, ry: 0.022, rz: 0.012, segU: 10, segV: 6 });
  // Breathing line on the jaw.
  band(o, { cy: -0.005, cz: 0.045, radius: 0.078, tube: 0.007, segU: 18, segV: 5, tiltX: Math.PI / 2 });
  return o;
});

/* Shoulders --------------------------------------------------------------- */
for (const side of [-1, 1]) {
  const suffix = side < 0 ? 'l' : 'r';
  joint(`shoulder_${suffix}`, 'chest', [side * 0.205, 0.235, 0]);
  part(`shoulder_${suffix}`, 'metal', () => {
    const o = g();
    ellipsoid(o, { cx: side * 0.018, cy: -0.01, rx: 0.082, ry: 0.072, rz: 0.092, segU: 18, segV: 12 });
    return o;
  });
  part(`shoulder_${suffix}`, 'leather', () => {
    const o = g();
    ellipsoid(o, { cx: side * 0.01, cy: 0.035, rz: 0.075, rx: 0.06, ry: 0.028, segU: 16, segV: 8 });
    return o;
  });

  /* Upper arm */
  joint(`upper_arm_${suffix}`, `shoulder_${suffix}`, [side * 0.022, -0.045, 0]);
  part(`upper_arm_${suffix}`, 'fabric', () => {
    const o = g();
    capsule(o, { length: 0.255, rTop: 0.058, rBottom: 0.046, radial: 16, capSegs: 5 });
    return o;
  });
  part(`upper_arm_${suffix}`, 'accent', () => {
    const o = g();
    band(o, { cy: -0.19, radius: 0.052, tube: 0.012, segU: 18, segV: 5 });
    return o;
  });
  part(`upper_arm_${suffix}`, 'leather', () => {
    const o = g();
    ellipsoid(o, { cy: -0.09, cz: 0.03, rx: 0.04, ry: 0.08, rz: 0.03, segU: 12, segV: 8 });
    return o;
  });

  /* Forearm */
  joint(`forearm_${suffix}`, `upper_arm_${suffix}`, [0, -0.265, 0]);
  part(`forearm_${suffix}`, 'fabric', () => {
    const o = g();
    capsule(o, { length: 0.235, rTop: 0.048, rBottom: 0.038, radial: 16, capSegs: 5 });
    return o;
  });
  part(`forearm_${suffix}`, 'metal', () => {
    const o = g();
    ellipsoid(o, { cy: -0.085, cz: 0.028, rx: 0.038, ry: 0.075, rz: 0.026, segU: 14, segV: 10 });
    band(o, { cy: -0.21, radius: 0.042, tube: 0.011, segU: 16, segV: 5 });
    return o;
  });
  part(`forearm_${suffix}`, 'leather', () => {
    const o = g();
    band(o, { cy: -0.04, radius: 0.05, tube: 0.013, segU: 16, segV: 5 });
    return o;
  });

  /* Hand */
  joint(`hand_${suffix}`, `forearm_${suffix}`, [0, -0.25, 0]);
  part(`hand_${suffix}`, 'leather', () => {
    const o = g();
    // Palm and a relaxed four-finger mass.
    ellipsoid(o, { cy: -0.045, cz: 0.008, rx: 0.038, ry: 0.06, rz: 0.03, segU: 14, segV: 10 });
    ellipsoid(o, { cy: -0.1, cz: 0.012, rx: 0.036, ry: 0.03, rz: 0.026, segU: 12, segV: 8, tiltX: -0.25 });
    capsule(o, { cx: side * -0.03, cy: -0.055, length: 0.045, rTop: 0.014, rBottom: 0.012, radial: 8, capSegs: 3, tilt: side * 0.5 });
    return o;
  });
  part(`hand_${suffix}`, 'metal', () => {
    const o = g();
    ellipsoid(o, { cy: -0.035, cz: 0.028, rx: 0.03, ry: 0.035, rz: 0.012, segU: 12, segV: 8 });
    return o;
  });

  /* Thigh */
  joint(`thigh_${suffix}`, 'hips', [side * 0.095, -0.055, 0]);
  part(`thigh_${suffix}`, 'fabric', () => {
    const o = g();
    capsule(o, { length: 0.4, rTop: 0.084, rBottom: 0.058, radial: 18, capSegs: 5 });
    return o;
  });
  part(`thigh_${suffix}`, 'leather', () => {
    const o = g();
    ellipsoid(o, { cy: -0.1, cz: 0.045, rx: 0.055, ry: 0.13, rz: 0.03, segU: 14, segV: 10 });
    return o;
  });
  part(`thigh_${suffix}`, 'metal', () => {
    const o = g();
    ellipsoid(o, { cy: -0.34, cz: 0.032, rx: 0.05, ry: 0.06, rz: 0.035, segU: 14, segV: 10 });
    return o;
  });

  /* Shin */
  joint(`shin_${suffix}`, `thigh_${suffix}`, [0, -0.415, 0]);
  part(`shin_${suffix}`, 'fabric', () => {
    const o = g();
    capsule(o, { length: 0.365, rTop: 0.058, rBottom: 0.042, radial: 16, capSegs: 5 });
    return o;
  });
  part(`shin_${suffix}`, 'metal', () => {
    const o = g();
    // Knee cup and shin guard.
    ellipsoid(o, { cy: -0.015, cz: 0.035, rx: 0.055, ry: 0.06, rz: 0.04, segU: 16, segV: 10 });
    ellipsoid(o, { cy: -0.2, cz: 0.038, rx: 0.042, ry: 0.12, rz: 0.028, segU: 14, segV: 10 });
    return o;
  });
  part(`shin_${suffix}`, 'leather', () => {
    const o = g();
    band(o, { cy: -0.345, radius: 0.048, tube: 0.014, segU: 16, segV: 5 });
    return o;
  });

  /* Foot */
  joint(`foot_${suffix}`, `shin_${suffix}`, [0, -0.375, 0.01]);
  part(`foot_${suffix}`, 'leather', () => {
    const o = g();
    // Boot body, heel and sole.
    ellipsoid(o, { cy: -0.045, cz: 0.045, rx: 0.058, ry: 0.05, rz: 0.135, segU: 18, segV: 12 });
    ellipsoid(o, { cy: -0.03, cz: -0.045, rx: 0.05, ry: 0.055, rz: 0.06, segU: 14, segV: 10 });
    ellipsoid(o, { cy: -0.082, cz: 0.04, rx: 0.06, ry: 0.014, rz: 0.14, segU: 18, segV: 8 });
    return o;
  });
  part(`foot_${suffix}`, 'metal', () => {
    const o = g();
    ellipsoid(o, { cy: -0.075, cz: 0.115, rx: 0.05, ry: 0.032, rz: 0.06, segU: 14, segV: 8 });
    band(o, { cy: -0.005, radius: 0.058, tube: 0.015, segU: 16, segV: 5 });
    return o;
  });
  part(`foot_${suffix}`, 'accent', () => {
    const o = g();
    ellipsoid(o, { cy: -0.035, cz: 0.135, rx: 0.02, ry: 0.016, rz: 0.03, segU: 10, segV: 6 });
    return o;
  });
}

/* Backpack ---------------------------------------------------------------- */
joint('backpack', 'chest', [0, 0.12, -0.165]);
part('backpack', 'leather', () => {
  const o = g();
  ellipsoid(o, { cy: 0.0, cz: -0.045, rx: 0.135, ry: 0.155, rz: 0.075, segU: 18, segV: 12 });
  return o;
});
part('backpack', 'metal', () => {
  const o = g();
  // Field canister and vent grill.
  capsule(o, { cx: 0.095, cy: 0.1, cz: -0.075, length: 0.24, rTop: 0.038, rBottom: 0.038, radial: 14, capSegs: 4 });
  ellipsoid(o, { cx: -0.06, cy: 0.02, cz: -0.11, rx: 0.055, ry: 0.08, rz: 0.02, segU: 12, segV: 8 });
  band(o, { cx: 0.095, cy: 0.02, cz: -0.075, radius: 0.04, tube: 0.009, segU: 14, segV: 4 });
  return o;
});
part('backpack', 'bio', () => {
  const o = g();
  capsule(o, { cx: 0.095, cy: 0.085, cz: -0.115, length: 0.18, rTop: 0.012, rBottom: 0.012, radial: 10, capSegs: 3 });
  ellipsoid(o, { cx: -0.06, cy: 0.02, cz: -0.128, rx: 0.012, ry: 0.05, rz: 0.012, segU: 10, segV: 8 });
  return o;
});

/* Cape / weather cloak ---------------------------------------------------- */
joint('cape', 'chest', [0, 0.24, -0.13]);
part('cape', 'cloth', () => {
  const o = g();
  ellipsoid(o, { cy: -0.22, cz: -0.06, rx: 0.19, ry: 0.26, rz: 0.02, segU: 20, segV: 12 });
  ellipsoid(o, { cx: 0.16, cy: -0.16, cz: -0.03, rx: 0.055, ry: 0.2, rz: 0.018, segU: 14, segV: 10, tiltZ: -0.18 });
  ellipsoid(o, { cx: -0.16, cy: -0.16, cz: -0.03, rx: 0.055, ry: 0.2, rz: 0.018, segU: 14, segV: 10, tiltZ: 0.18 });
  return o;
});
joint('cape_tip', 'cape', [0, -0.44, 0]);
part('cape_tip', 'cloth', () => {
  const o = g();
  ellipsoid(o, { cy: -0.09, cz: -0.055, rx: 0.2, ry: 0.16, rz: 0.016, segU: 18, segV: 10 });
  ellipsoid(o, { cy: -0.2, cz: -0.06, rx: 0.13, ry: 0.08, rz: 0.014, segU: 14, segV: 8 });
  return o;
});
part('cape_tip', 'accent', () => {
  const o = g();
  ellipsoid(o, { cy: -0.145, cz: -0.072, rx: 0.07, ry: 0.012, rz: 0.01, segU: 12, segV: 6 });
  return o;
});

/* -------------------------------------------------------------------------- */
/* glTF scene encoder                                                         */
/* -------------------------------------------------------------------------- */

function normalizeIndices(geo) {
  const positions = geo.positions;
  const normals = geo.normals;
  const uvs = geo.uvs;
  return { positions, normals, uvs, indices: geo.indices };
}

function encodeScene({ sceneName, nodeRecords, materials }) {
  const chunks = [];
  let byteOffset = 0;
  const bufferViews = [];
  const accessors = [];

  const addView = (array, target) => {
    const raw = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const padding = (4 - (raw.byteLength % 4)) % 4;
    bufferViews.push({ buffer: 0, byteOffset, byteLength: raw.byteLength, target });
    chunks.push(raw, Buffer.alloc(padding));
    byteOffset += raw.byteLength + padding;
    return bufferViews.length - 1;
  };

  const meshes = [];
  const nodes = nodeRecords.map((record) => {
    const node = { name: record.name };
    if (record.translation) node.translation = record.translation;
    if (record.children.length) node.children = record.children;
    if (record.parts.length) {
      const primitives = record.parts.map((entry) => {
        const geo = normalizeIndices(entry.geo());
        const positions = Float32Array.from(geo.positions);
        const normals = Float32Array.from(geo.normals);
        const uvs = Float32Array.from(geo.uvs);
        const indices = new Uint32Array(geo.indices);
        const min = [Infinity, Infinity, Infinity];
        const max = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < positions.length; i += 3) {
          for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], positions[i + k]);
            max[k] = Math.max(max[k], positions[i + k]);
          }
        }
        const positionAccessor = accessors.push({
          bufferView: addView(positions, 34962), componentType: 5126, count: positions.length / 3, type: 'VEC3', min, max,
        }) - 1;
        const normalAccessor = accessors.push({
          bufferView: addView(normals, 34962), componentType: 5126, count: normals.length / 3, type: 'VEC3',
        }) - 1;
        const uvAccessor = accessors.push({
          bufferView: addView(uvs, 34962), componentType: 5126, count: uvs.length / 2, type: 'VEC2',
        }) - 1;
        const indexAccessor = accessors.push({
          bufferView: addView(indices, 34963), componentType: 5125, count: indices.length, type: 'SCALAR',
        }) - 1;
        return {
          attributes: { POSITION: positionAccessor, NORMAL: normalAccessor, TEXCOORD_0: uvAccessor },
          indices: indexAccessor,
          material: entry.material,
        };
      });
      node.mesh = meshes.push({ name: record.name, primitives }) - 1;
    }
    return node;
  });

  const gltf = {
    asset: { version: '2.0', generator: 'Echoes of the Lost World — character authoring tool' },
    scene: 0,
    scenes: [{ name: sceneName, nodes: [0] }],
    nodes,
    meshes,
    materials: materials.map((material) => ({
      name: material.name,
      pbrMetallicRoughness: {
        baseColorFactor: material.baseColor,
        metallicFactor: material.metallic,
        roughnessFactor: material.roughness,
      },
      emissiveFactor: material.emissive ?? [0, 0, 0],
      doubleSided: material.doubleSided ?? true,
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength: byteOffset }],
  };

  const bin = Buffer.concat(chunks, byteOffset);
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = (4 - (json.byteLength % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(jsonPad, 0x20)]);
  const totalLength = 12 + 8 + jsonChunk.byteLength + 8 + bin.byteLength;

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.byteLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.byteLength, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);

  return { glb: Buffer.concat([header, jsonHeader, jsonChunk, binHeader, bin], totalLength), json: gltf };
}

/* -------------------------------------------------------------------------- */
/* Write + manifest                                                           */
/* -------------------------------------------------------------------------- */

await mkdir(OUT_DIR, { recursive: true });
const { glb, json } = encodeScene({
  sceneName: 'wayfarer_scene',
  nodeRecords: nodes,
  materials: MATERIALS,
});
await writeFile(resolve(OUT_DIR, FILE), glb);

const manifestPath = resolve(OUT_DIR, 'manifest.json');
let manifest = { models: [] };
try {
  manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
} catch {
  /* a fresh manifest is written below */
}

const vertexCount = json.accessors
  .filter((accessor) => accessor.type === 'VEC3' && accessor.min)
  .reduce((sum, accessor) => sum + accessor.count, 0);
const triangleCount = json.meshes
  .flatMap((mesh) => mesh.primitives)
  .reduce((sum, primitive) => sum + json.accessors[primitive.indices].count / 3, 0);

const entry = {
  file: FILE,
  bytes: glb.byteLength,
  vertices: vertexCount,
  triangles: Math.round(triangleCount),
  rig: 'jointed humanoid · 25 nodes · runtime gait synthesis',
  material: { baseColor: MATERIALS[0].baseColor, roughness: MATERIALS[0].roughness, metallic: MATERIALS[0].metallic },
};
const existing = (manifest.models ?? []).findIndex((model) => model.file === FILE);
if (existing >= 0) manifest.models[existing] = entry;
else (manifest.models ??= []).push(entry);
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `wayfarer.glb · ${(glb.byteLength / 1024).toFixed(1)} KiB · ${nodes.length} nodes · ${json.meshes.length} meshes · ${Math.round(triangleCount)} triangles`,
);
