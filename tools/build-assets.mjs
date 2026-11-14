#!/usr/bin/env node
/**
 * Echoes of the Lost World — original asset pipeline (Phase 01)
 *
 * Generates the game's glTF 2.0 binary (.glb) props procedurally. Everything here is
 * authored from scratch for this project: no third-party models, textures or scans.
 *
 * Run with:  npm run assets
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../public/assets/models');

/* -------------------------------------------------------------------------- */
/* Deterministic math helpers                                                 */
/* -------------------------------------------------------------------------- */

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

function valueNoise3(x, y, z, seed) {
  // Cheap, deterministic hash noise used to break up silhouettes.
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + seed * 19.19) * 43758.5453;
  return h - Math.floor(h);
}

function smoothNoise3(x, y, z, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = zf * zf * (3 - 2 * zf);
  const c = (dx, dy, dz) => valueNoise3(xi + dx, yi + dy, zi + dz, seed);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u);
  const x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u);
  const x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1;
}

/* -------------------------------------------------------------------------- */
/* Geometry builders                                                          */
/* -------------------------------------------------------------------------- */

function makeBuilder() {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

function pushVertex(b, p, c, uv = [0, 0]) {
  b.positions.push(p[0], p[1], p[2]);
  b.colors.push(c[0], c[1], c[2]);
  b.uvs.push(uv[0], uv[1]);
  return b.positions.length / 3 - 1;
}

function addTriangle(b, a, c, d) {
  b.indices.push(a, c, d);
}

function computeNormals(b) {
  const pos = b.positions;
  const n = new Float32Array(pos.length);
  const idx = b.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const ia = idx[i] * 3, ib = idx[i + 1] * 3, ic = idx[i + 2] * 3;
    const ax = pos[ia], ay = pos[ia + 1], az = pos[ia + 2];
    const bx = pos[ib], by = pos[ib + 1], bz = pos[ib + 2];
    const cx = pos[ic], cy = pos[ic + 1], cz = pos[ic + 2];
    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const i3 of [ia, ib, ic]) {
      n[i3] += nx; n[i3 + 1] += ny; n[i3 + 2] += nz;
    }
  }
  for (let i = 0; i < n.length; i += 3) {
    const len = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1;
    n[i] /= len; n[i + 1] /= len; n[i + 2] /= len;
  }
  return Array.from(n);
}

/** Low-poly organic boulder built from a jittered icosphere. */
function addBoulder(b, opts) {
  const {
    cx = 0, cy = 0, cz = 0, radius = 1, squash = 0.75,
    detail = 2, noise = 0.28, seed = 1, tint = [0.42, 0.4, 0.36],
    colorJitter = 0.16,
  } = opts;
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const l = Math.hypot(...v);
    return [v[0] / l, v[1] / l, v[2] / l];
  });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let d = 0; d < detail; d++) {
    const next = [];
    const cache = new Map();
    const midpoint = (a, c) => {
      const key = a < c ? `${a}_${c}` : `${c}_${a}`;
      if (cache.has(key)) return cache.get(key);
      const va = verts[a], vc = verts[c];
      const m = [va[0] + vc[0], va[1] + vc[1], va[2] + vc[2]];
      const l = Math.hypot(...m) || 1;
      const arr = [m[0] / l, m[1] / l, m[2] / l];
      verts.push(arr);
      cache.set(key, verts.length - 1);
      return verts.length - 1;
    };
    for (const [a, cc, e] of faces) {
      const ab = midpoint(a, cc), bc = midpoint(cc, e), ca = midpoint(e, a);
      next.push([a, ab, ca], [cc, bc, ab], [e, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  const rand = mulberry32(seed);
  const base = b.positions.length / 3;
  for (const v of verts) {
    const n = smoothNoise3(v[0] * 2.2 + 4, v[1] * 2.2, v[2] * 2.2 - 3, seed);
    const warp = 1 + n * noise + (rand() - 0.5) * noise * 0.35;
    const px = v[0] * radius * warp + cx;
    const py = v[1] * radius * squash * warp + cy;
    const pz = v[2] * radius * warp + cz;
    const shade = 1 + (rand() - 0.5) * colorJitter + n * 0.18;
    pushVertex(
      b,
      [px, py, pz],
      [tint[0] * shade, tint[1] * shade, tint[2] * shade],
      [v[0] * 0.5 + 0.5, v[1] * 0.5 + 0.5],
    );
  }
  for (const [a, c, e] of faces) {
    // Degenerate driver direction check to keep boulders from inverting.
    const pa = [b.positions[(base + a) * 3], b.positions[(base + a) * 3 + 1], b.positions[(base + a) * 3 + 2]];
    const pc = [b.positions[(base + c) * 3], b.positions[(base + c) * 3 + 1], b.positions[(base + c) * 3 + 2]];
    const pe = [b.positions[(base + e) * 3], b.positions[(base + e) * 3 + 1], b.positions[(base + e) * 3 + 2]];
    const ux = pc[0] - pa[0], uy = pc[1] - pa[1], uz = pc[2] - pa[2];
    const vx = pe[0] - pa[0], vy = pe[1] - pa[1], vz = pe[2] - pa[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const ox = (pa[0] + pc[0] + pe[0]) / 3 - cx;
    const oy = (pa[1] + pc[1] + pe[1]) / 3 - cy;
    const oz = (pa[2] + pc[2] + pe[2]) / 3 - cz;
    if (nx * ox + ny * oy + nz * oz < 0) addTriangle(b, base + a, base + e, base + c);
    else addTriangle(b, base + a, base + c, base + e);
  }
}

/** Tapered, optionally bent and twisted cylinder (trunks, pillars, conduits). */
function addCylinder(b, opts) {
  const {
    height = 4, radiusBottom = 0.5, radiusTop = 0.3, segments = 10,
    rings = 8, bend = 0, twist = 0, noise = 0.06, seed = 1,
    center = [0, 0, 0], colorBottom = [0.3, 0.28, 0.25], colorTop = [0.45, 0.42, 0.38],
    cap = true,
  } = opts;
  const base = b.positions.length / 3;
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const y = t * height + center[1];
    const bendX = Math.sin(t * Math.PI * 0.9) * bend;
    const rad = lerp(radiusBottom, radiusTop, Math.pow(t, 0.85));
    const twistA = t * twist;
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2 + twistA;
      const nz = smoothNoise3(Math.cos(a) * 2, y * 1.4, Math.sin(a) * 2, seed);
      const rr = rad * (1 + nz * noise);
      const px = center[0] + Math.cos(a) * rr + bendX;
      const pz = center[2] + Math.sin(a) * rr;
      const shade = lerp(0.92, 1.08, nz * 0.5 + 0.5) * (1 - t * 0.08);
      pushVertex(
        b,
        [px, y, pz],
        [
          lerp(colorBottom[0], colorTop[0], t) * shade,
          lerp(colorBottom[1], colorTop[1], t) * shade,
          lerp(colorBottom[2], colorTop[2], t) * shade,
        ],
        [s / segments, t],
      );
    }
  }
  for (let r = 0; r < rings; r++) {
    for (let s = 0; s < segments; s++) {
      const i0 = base + r * (segments + 1) + s;
      const i1 = i0 + 1;
      const i2 = i0 + (segments + 1);
      const i3 = i2 + 1;
      addTriangle(b, i0, i2, i1);
      addTriangle(b, i1, i2, i3);
    }
  }
  if (cap) {
    const topCenter = pushVertex(b, [center[0] + bend, center[1] + height, center[2]], colorTop, [0.5, 0.5]);
    const topRingStart = base + rings * (segments + 1);
    for (let s = 0; s < segments; s++) addTriangle(b, topCenter, topRingStart + s, topRingStart + s + 1);
  }
  return { base, height };
}

/** Partial torus with a squared cross-section — the signature "echo ring". */
function addTorusArc(b, opts) {
  const {
    majorRadius = 6, minorRadius = 0.45, arc = Math.PI, tubularSegments = 48,
    radialSegments = 3, center = [0, 0, 0], rotateAxis = 'x',
    color = [0.55, 0.53, 0.48], colorVar = 0.1,
  } = opts;
  const base = b.positions.length / 3;
  for (let i = 0; i <= tubularSegments; i++) {
    const u = i / tubularSegments;
    const theta = u * arc - arc * 0.5;
    for (let j = 0; j <= radialSegments; j++) {
      const v = j / radialSegments;
      const phi = v * Math.PI * 2;
      const r = minorRadius * (0.55 + 0.45 * Math.abs(Math.cos(phi + Math.PI / 4)));
      const cx = Math.cos(theta) * (majorRadius + Math.cos(phi) * r);
      const cy = Math.sin(theta) * (majorRadius + Math.cos(phi) * r);
      const cz = Math.sin(phi) * r;
      let p;
      if (rotateAxis === 'x') p = [center[0] + cx, center[1] + cy, center[2] + cz];
      else if (rotateAxis === 'flat') p = [center[0] + cx, center[1] + cz, center[2] + cy];
      else p = [center[0] + cz, center[1] + cy, center[2] + cx];
      const shade = 1 + (Math.sin(i * 1.7 + j) * 0.5) * colorVar;
      pushVertex(b, p, [color[0] * shade, color[1] * shade, color[2] * shade], [u, v]);
    }
  }
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = base + i * (radialSegments + 1) + j;
      const c = a + radialSegments + 1;
      addTriangle(b, a, c, a + 1);
      addTriangle(b, a + 1, c, c + 1);
    }
  }
}

function addBox(b, opts) {
  const { cx = 0, cy = 0, cz = 0, sx = 1, sy = 1, sz = 1, color = [0.4, 0.4, 0.4], jitter = 0.08, seed = 1 } = opts;
  const rand = mulberry32(seed);
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const corners = [
    [-hx, -hy, -hz], [hx, -hy, -hz], [hx, hy, -hz], [-hx, hy, -hz],
    [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz],
  ];
  const faces = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
    [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ];
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  const base = b.positions.length / 3;
  for (const c of corners) {
    const shade = 1 + (rand() - 0.5) * jitter;
    pushVertex(b, [c[0] + cx, c[1] + cy, c[2] + cz], [color[0] * shade, color[1] * shade, color[2] * shade], [0.5, 0.5]);
  }
  for (const f of faces) {
    addTriangle(b, base + f[0], base + f[1], base + f[2]);
    addTriangle(b, base + f[0], base + f[2], base + f[3]);
    for (let i = 0; i < 4; i++) {
      const vi = (base + f[i]) * 2;
      b.uvs[vi] = uvs[i][0];
      b.uvs[vi + 1] = uvs[i][1];
    }
  }
}

function addOctahedron(b, { cx = 0, cy = 0, cz = 0, radius = 0.6, color = [0.4, 0.9, 0.8] }) {
  const base = b.positions.length / 3;
  const pts = [
    [0, radius * 1.6, 0], [radius, 0, 0], [0, 0, radius],
    [-radius, 0, 0], [0, 0, -radius], [0, -radius * 1.1, 0],
  ];
  for (let i = 0; i < pts.length; i++) {
    const shade = i === 0 ? 1.5 : i === 5 ? 0.7 : 1.15;
    pushVertex(b, [pts[i][0] + cx, pts[i][1] + cy, pts[i][2] + cz],
      [color[0] * shade, color[1] * shade, color[2] * shade], [0.5, i / 6]);
  }
  const tris = [[0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4]];
  for (const t of tris) addTriangle(b, base + t[0], base + t[1], base + t[2]);
}

/** Minimal glTF 2.0 binary writer (one mesh, one primitive, vertex colours). */
function encodeGLB({ positions, normals, uvs, colors, indices, material, name }) {
  const useShort = positions.length / 3 <= 65535;
  const indexArray = useShort ? new Uint16Array(indices) : new Uint32Array(indices);
  const posArray = new Float32Array(positions);
  const nrmArray = new Float32Array(normals);
  const uvArray = new Float32Array(uvs);
  const colArray = new Float32Array(colors);

  const chunks = [];
  let byteOffset = 0;
  const bufferViews = [];
  const accessors = [];

  const addView = (array, target) => {
    const raw = Buffer.from(array.buffer, array.byteOffset, array.byteLength);
    const padding = (4 - (raw.byteLength % 4)) % 4;
    const view = { buffer: 0, byteOffset, byteLength: raw.byteLength, target };
    bufferViews.push(view);
    chunks.push(raw, Buffer.alloc(padding));
    byteOffset += raw.byteLength + padding;
    return bufferViews.length - 1;
  };

  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < posArray.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], posArray[i + k]);
      max[k] = Math.max(max[k], posArray[i + k]);
    }
  }

  const vertexCount = posArray.length / 3;
  accessors.push({
    bufferView: addView(posArray, 34962), componentType: 5126, count: vertexCount, type: 'VEC3', min, max,
  });
  accessors.push({ bufferView: addView(nrmArray, 34962), componentType: 5126, count: vertexCount, type: 'VEC3' });
  accessors.push({ bufferView: addView(uvArray, 34962), componentType: 5126, count: vertexCount, type: 'VEC2' });
  accessors.push({ bufferView: addView(colArray, 34962), componentType: 5126, count: vertexCount, type: 'VEC3' });
  accessors.push({
    bufferView: addView(indexArray, 34963), componentType: useShort ? 5123 : 5125, count: indexArray.length, type: 'SCALAR',
  });

  const gltf = {
    asset: { version: '2.0', generator: 'Echoes of the Lost World — procedural asset tools' },
    scene: 0,
    scenes: [{ name: `${name}_scene`, nodes: [0] }],
    nodes: [{ name, mesh: 0 }],
    meshes: [{
      name,
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2, COLOR_0: 3 }, indices: 4, material: 0 }],
    }],
    materials: [{
      name: `${name}_material`,
      pbrMetallicRoughness: {
        baseColorFactor: material.baseColor ?? [1, 1, 1, 1],
        metallicFactor: material.metallic ?? 0,
        roughnessFactor: material.roughness ?? 0.9,
      },
      emissiveFactor: material.emissive ?? [0, 0, 0],
      doubleSided: material.doubleSided ?? false,
    }],
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
  header.writeUInt32LE(0x46546c67, 0); // 'glTF'
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(jsonChunk.byteLength, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.byteLength, 0);
  binHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return { glb: Buffer.concat([header, jsonHeader, jsonChunk, binHeader, bin], totalLength), json: gltf };
}

/* -------------------------------------------------------------------------- */
/* Asset definitions                                                          */
/* -------------------------------------------------------------------------- */

function finish(b, material) {
  b.normals = computeNormals(b);
  return b;
}

const assets = [];

function define(name, builder, material) {
  assets.push({ name, builder: finish(builder), material });
}

/* 01 — weathered boulder cluster */
{
  const b = makeBuilder();
  addBoulder(b, { cx: 0, cy: 0.15, cz: 0, radius: 1.25, squash: 0.82, detail: 2, seed: 11, noise: 0.3 });
  addBoulder(b, { cx: 1.25, cy: -0.25, cz: 0.35, radius: 0.72, squash: 0.7, detail: 1, seed: 23, noise: 0.34, tint: [0.36, 0.35, 0.32] });
  addBoulder(b, { cx: -0.95, cy: -0.35, cz: -0.5, radius: 0.58, squash: 0.62, detail: 1, seed: 37, noise: 0.38, tint: [0.47, 0.44, 0.39] });
  define('rock_cluster', b, { baseColor: [0.86, 0.84, 0.8, 1], roughness: 0.97, metallic: 0 });
}

/* 02 — lone monolith spire */
{
  const b = makeBuilder();
  addCylinder(b, {
    height: 7.4, radiusBottom: 1.05, radiusTop: 0.42, segments: 6, rings: 12,
    bend: 0.35, twist: 0.5, noise: 0.09, seed: 5,
    colorBottom: [0.34, 0.33, 0.3], colorTop: [0.58, 0.55, 0.48],
  });
  addBox(b, { cy: 0.12, sx: 2.6, sy: 0.3, sz: 2.6, color: [0.32, 0.31, 0.29], seed: 6 });
  define('monolith_spire', b, { baseColor: [0.92, 0.9, 0.86, 1], roughness: 0.9, metallic: 0.02 });
}

/* 03 — broken temple pillar */
{
  const b = makeBuilder();
  addCylinder(b, {
    height: 4.6, radiusBottom: 0.62, radiusTop: 0.5, segments: 10, rings: 10,
    noise: 0.05, seed: 9, colorBottom: [0.4, 0.38, 0.34], colorTop: [0.52, 0.49, 0.43],
  });
  addBox(b, { cy: 0.16, sx: 1.8, sy: 0.32, sz: 1.8, color: [0.36, 0.34, 0.31], seed: 10 });
  addBox(b, { cy: 4.7, sx: 1.5, sy: 0.26, sz: 1.5, color: [0.46, 0.43, 0.38], seed: 12 });
  define('temple_pillar', b, { baseColor: [0.94, 0.92, 0.87, 1], roughness: 0.88, metallic: 0.03 });
}

/* 04 — the Echo Gate ring (procedural structure) */
{
  const b = makeBuilder();
  addTorusArc(b, {
    majorRadius: 14, minorRadius: 1.15, arc: Math.PI * 1.72, tubularSegments: 96, radialSegments: 4,
    color: [0.42, 0.41, 0.38], colorVar: 0.22,
  });
  addBox(b, { cy: -14.2, sx: 7.5, sy: 2.6, sz: 7.5, color: [0.3, 0.29, 0.27], seed: 4 });
  addBox(b, { cx: 13.4, cy: -12.2, sx: 3.2, sy: 5.4, sz: 3.2, color: [0.34, 0.33, 0.3], seed: 8 });
  addBox(b, { cx: -13.4, cy: -12.2, sx: 3.2, sy: 5.4, sz: 3.2, color: [0.34, 0.33, 0.3], seed: 8 });
  define('echo_gate', b, { baseColor: [0.9, 0.88, 0.84, 1], roughness: 0.93, metallic: 0.02 });
}

/* 05 — glowing rune band */
{
  const b = makeBuilder();
  addTorusArc(b, {
    majorRadius: 14.02, minorRadius: 0.16, arc: Math.PI * 1.72, tubularSegments: 140, radialSegments: 2,
    color: [0.55, 1.5, 1.25], colorVar: 0.25,
  });
  define('gate_rune', b, { baseColor: [0.05, 0.22, 0.2, 1], emissive: [0.3, 1, 0.86], roughness: 0.4, metallic: 0.1 });
}

/* 06 — twisted spire tree */
{
  const b = makeBuilder();
  addCylinder(b, {
    height: 6.2, radiusBottom: 0.42, radiusTop: 0.14, segments: 8, rings: 12,
    bend: 0.85, twist: 1.6, noise: 0.16, seed: 21,
    colorBottom: [0.13, 0.16, 0.14], colorTop: [0.28, 0.3, 0.24],
  });
  // Fronds: thin blades fanned out from the crown, vertex-coloured green.
  const rand = mulberry32(77);
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2 + rand() * 0.3;
    const len = 1.6 + rand() * 2.4;
    const rootY = 5.1 + rand() * 1.1;
    const droop = 0.5 + rand() * 0.9;
    const w = 0.09 + rand() * 0.09;
    const root = [Math.cos(a) * 0.1, rootY, Math.sin(a) * 0.1];
    const tip = [Math.cos(a) * len + 0.85, rootY + 0.55 - droop, Math.sin(a) * len];
    const perp = [Math.cos(a + Math.PI / 2) * w, 0, Math.sin(a + Math.PI / 2) * w];
    const green = [0.16 + rand() * 0.08, 0.34 + rand() * 0.12, 0.22 + rand() * 0.06];
    const base = b.positions.length / 3;
    pushVertex(b, [root[0] - perp[0], root[1], root[2] - perp[2]], green, [0, 0]);
    pushVertex(b, [root[0] + perp[0], root[1], root[2] + perp[2]], green, [1, 0]);
    pushVertex(b, [tip[0] - perp[0] * 0.2, tip[1], tip[2] - perp[2] * 0.2], [green[0] * 1.6, green[1] * 1.5, green[2] * 1.3], [0, 1]);
    pushVertex(b, [tip[0] + perp[0] * 0.2, tip[1], tip[2] + perp[2] * 0.2], [green[0] * 1.6, green[1] * 1.5, green[2] * 1.3], [1, 1]);
    addTriangle(b, base, base + 1, base + 2);
    addTriangle(b, base + 1, base + 3, base + 2);
  }
  define('spire_tree', b, { baseColor: [1, 1, 1, 1], roughness: 0.85, metallic: 0, doubleSided: true });
}

/* 07 — ancient wall fragment */
{
  const b = makeBuilder();
  addBox(b, { cy: 1.4, sx: 5.4, sy: 2.8, sz: 1.1, color: [0.3, 0.29, 0.27], seed: 31, jitter: 0.14 });
  addBox(b, { cx: -1.6, cy: 3.1, sx: 2.0, sy: 0.65, sz: 1.05, color: [0.35, 0.33, 0.3], seed: 32 });
  addBox(b, { cx: 1.5, cy: 3.0, sx: 1.6, sy: 0.45, sz: 1.05, color: [0.33, 0.32, 0.29], seed: 33 });
  addBox(b, { cx: 2.9, cy: 0.55, sx: 1.1, sy: 1.1, sz: 1.6, color: [0.27, 0.26, 0.24], seed: 34 });
  define('ruin_wall', b, { baseColor: [0.9, 0.88, 0.84, 1], roughness: 0.95, metallic: 0.02 });
}

/* 08 — echo shard collectible */
{
  const b = makeBuilder();
  addOctahedron(b, { radius: 0.42, color: [0.3, 1.0, 0.88] });
  define('echo_shard', b, { baseColor: [0.1, 0.5, 0.45, 1], emissive: [0.25, 1, 0.85], roughness: 0.2, metallic: 0.15 });
}

/* 09 — survey drone body */
{
  const b = makeBuilder();
  addBoulder(b, { radius: 0.55, squash: 0.55, detail: 1, noise: 0.05, seed: 41, tint: [0.18, 0.21, 0.23], colorJitter: 0.05 });
  addBox(b, { cy: -0.12, sx: 1.4, sy: 0.09, sz: 0.28, color: [0.28, 0.31, 0.33], seed: 42 });
  addBox(b, { cy: -0.12, sx: 0.28, sy: 0.09, sz: 1.4, color: [0.28, 0.31, 0.33], seed: 43 });
  define('drone_body', b, { baseColor: [0.8, 0.85, 0.88, 1], roughness: 0.45, metallic: 0.75 });
}

/* 10 — drone light ring */
{
  const b = makeBuilder();
  addTorusArc(b, {
    majorRadius: 0.5, minorRadius: 0.045, arc: Math.PI * 2, tubularSegments: 64, radialSegments: 2,
    color: [0.5, 1.6, 1.4], rotateAxis: 'flat',
  });
  define('drone_ring', b, { baseColor: [0.04, 0.2, 0.18, 1], emissive: [0.35, 1, 0.9], roughness: 0.3, metallic: 0.2 });
}

/* 11 — abandoned city apartment block */
{
  const b = makeBuilder();
  const concrete = [0.3, 0.3, 0.29];
  addBox(b, { cy: 6, sx: 9, sy: 12, sz: 8, color: concrete, seed: 51, jitter: 0.12 });
  addBox(b, { cy: 12.15, sx: 9.4, sy: 0.3, sz: 8.4, color: [0.26, 0.26, 0.25], seed: 52 });
  addBox(b, { cy: 4, sx: 9.3, sy: 0.22, sz: 8.3, color: [0.34, 0.33, 0.32], seed: 53 });
  addBox(b, { cy: 8, sx: 9.3, sy: 0.22, sz: 8.3, color: [0.34, 0.33, 0.32], seed: 54 });
  for (const y of [2.2, 6.2, 10.2]) {
    addBox(b, { cy: y, cz: 4.05, sx: 7.6, sy: 1.2, sz: 0.18, color: [0.055, 0.07, 0.075], seed: 55 + y });
    addBox(b, { cy: y, cz: -4.05, sx: 7.6, sy: 1.2, sz: 0.18, color: [0.055, 0.07, 0.075], seed: 58 + y });
  }
  addBox(b, { cx: 5.6, cy: 3, sx: 4, sy: 6, sz: 5, color: [0.27, 0.27, 0.26], seed: 61 });
  addBox(b, { cx: -2, cy: 12.6, sx: 3.4, sy: 0.9, sz: 3, color: [0.24, 0.24, 0.23], seed: 62 });
  addBox(b, { cx: 2.4, cy: 12.4, sx: 2.2, sy: 0.55, sz: 2.4, color: [0.22, 0.22, 0.21], seed: 63 });
  // Reclaimed vines hanging down the facade.
  for (let i = 0; i < 5; i++) {
    const x = -3.4 + i * 1.7;
    addBox(b, { cx: x, cy: 9.6 - i * 0.5, cz: 4.12, sx: 0.16, sy: 3.4 + (i % 3), sz: 0.1, color: [0.12, 0.22, 0.12], seed: 70 + i });
  }
  define('city_block', b, { baseColor: [0.92, 0.9, 0.87, 1], roughness: 0.94, metallic: 0.03 });
}

/* 12 — city tower / civic spire */
{
  const b = makeBuilder();
  addBox(b, { cy: 10, sx: 10, sy: 20, sz: 10, color: [0.26, 0.27, 0.27], seed: 81, jitter: 0.1 });
  addBox(b, { cy: 25, sx: 7, sy: 10, sz: 7, color: [0.24, 0.25, 0.25], seed: 82 });
  addBox(b, { cy: 33, sx: 4.4, sy: 6, sz: 4.4, color: [0.23, 0.24, 0.24], seed: 83 });
  for (let i = 0; i < 6; i++) {
    const y = 2 + i * 3.6;
    const w = i < 3 ? 8.6 : i < 5 ? 5.8 : 3.4;
    for (const z of [5.05, -5.05]) {
      if (y > 20 && Math.abs(z) > 4) continue;
      addBox(b, { cy: y, cz: z, sx: w, sy: 1.4, sz: 0.16, color: [0.05, 0.065, 0.07], seed: 90 + i });
    }
  }
  addCylinder(b, { height: 7, radiusBottom: 0.28, radiusTop: 0.08, segments: 6, rings: 4, cy: 36, colorBottom: [0.35, 0.36, 0.36], colorTop: [0.5, 1.2, 1.1], noise: 0.02, seed: 99, cap: false });
  addOctahedron(b, { cy: 43.4, radius: 0.5, color: [0.4, 1.5, 1.35] });
  addBox(b, { cx: -4.2, cy: 20.6, sx: 2.4, sy: 1.2, sz: 3.2, color: [0.2, 0.2, 0.2], seed: 100 });
  define('city_tower', b, { baseColor: [0.9, 0.9, 0.88, 1], roughness: 0.9, metallic: 0.06 });
}

/* 13 — collapsed overpass segment */
{
  const b = makeBuilder();
  for (const x of [-7, 7]) {
    addBox(b, { cx: x, cy: 3.4, sx: 2.4, sy: 6.8, sz: 3.4, color: [0.28, 0.28, 0.27], seed: 111 + x });
    addBox(b, { cx: x, cy: 7.2, sx: 3.2, sy: 0.8, sz: 4.2, color: [0.3, 0.3, 0.29], seed: 113 + x });
  }
  addBox(b, { cy: 7.9, sx: 18, sy: 1.1, sz: 5.4, color: [0.32, 0.31, 0.3], seed: 115, jitter: 0.14 });
  addBox(b, { cy: 8.75, sx: 18, sy: 0.75, sz: 0.26, color: [0.27, 0.27, 0.26], seed: 116 });
  addBox(b, { cx: 8.2, cy: 8.1, sx: 3.4, sy: 0.9, sz: 5.0, color: [0.29, 0.29, 0.28], seed: 117 });
  addBox(b, { cx: 10.6, cy: 4.4, sx: 2.2, sy: 7.4, sz: 3.2, color: [0.24, 0.24, 0.23], seed: 118 });
  define('city_arch', b, { baseColor: [0.9, 0.88, 0.85, 1], roughness: 0.95, metallic: 0.02 });
}

/* 14 — research facility pylon */
{
  const b = makeBuilder();
  addBox(b, { cy: 0.5, sx: 4.6, sy: 1, sz: 4.6, color: [0.19, 0.22, 0.23], seed: 121 });
  addCylinder(b, {
    height: 9.5, radiusBottom: 0.62, radiusTop: 0.2, segments: 6, rings: 8,
    noise: 0.04, seed: 122, colorBottom: [0.24, 0.3, 0.31], colorTop: [0.4, 0.62, 0.6],
  });
  for (let i = 0; i < 3; i++) {
    addTorusArc(b, {
      majorRadius: 1.5 - i * 0.34, minorRadius: 0.09, arc: Math.PI * 2, tubularSegments: 36, radialSegments: 2,
      center: [0, 4.2 + i * 1.9, 0], rotateAxis: 'flat', color: [0.5, 1.5, 1.3],
    });
  }
  addBox(b, { cy: 9.8, sx: 1.4, sy: 0.5, sz: 1.4, color: [0.3, 0.9, 0.82], seed: 123 });
  addOctahedron(b, { cy: 11.1, radius: 0.5, color: [0.5, 1.7, 1.45] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    addBox(b, { cx: Math.cos(a) * 1.5, cy: 2.1, cz: Math.sin(a) * 1.5, sx: 0.22, sy: 2.6, sz: 0.22, color: [0.2, 0.26, 0.27], seed: 124 + i });
  }
  define('facility_pylon', b, { baseColor: [0.82, 0.9, 0.9, 1], emissive: [0.08, 0.55, 0.48], roughness: 0.45, metallic: 0.55 });
}

/* 15 — survey dish array */
{
  const b = makeBuilder();
  addBox(b, { cy: 0.6, sx: 5, sy: 1.2, sz: 5, color: [0.18, 0.21, 0.22], seed: 131 });
  addCylinder(b, { height: 4.4, radiusBottom: 0.55, radiusTop: 0.34, segments: 8, rings: 5, noise: 0.03, seed: 132, colorBottom: [0.2, 0.26, 0.27], colorTop: [0.3, 0.4, 0.4] });
  addBoulder(b, { cy: 5.5, radius: 2.7, squash: 0.22, detail: 2, seed: 133, noise: 0.04, tint: [0.34, 0.42, 0.42], colorJitter: 0.03 });
  addTorusArc(b, { majorRadius: 2.75, minorRadius: 0.07, arc: Math.PI * 2, tubularSegments: 48, radialSegments: 2, center: [0, 5.5, 0], rotateAxis: 'flat', color: [0.4, 1.2, 1.1] });
  addBox(b, { cx: 0.4, cy: 6.4, sx: 0.18, sy: 2.4, sz: 0.18, color: [0.45, 0.95, 0.9], seed: 134 });
  addBox(b, { cy: 4.4, sx: 1.1, sy: 0.3, sz: 1.1, color: [0.24, 0.3, 0.3], seed: 135 });
  define('facility_dish', b, { baseColor: [0.78, 0.86, 0.87, 1], emissive: [0.04, 0.3, 0.28], roughness: 0.4, metallic: 0.65 });
}

/* 16 — laboratory module */
{
  const b = makeBuilder();
  addBox(b, { cy: 2.5, sx: 13, sy: 5, sz: 9, color: [0.24, 0.28, 0.29], seed: 141, jitter: 0.09 });
  addBox(b, { cy: 5.25, sx: 13.6, sy: 0.5, sz: 9.6, color: [0.2, 0.23, 0.24], seed: 142 });
  addBox(b, { cx: -3, cy: 2.2, cz: 4.55, sx: 3.2, sy: 3.4, sz: 0.2, color: [0.06, 0.1, 0.1], seed: 143 });
  addBox(b, { cy: 3.1, cz: 4.6, sx: 9, sy: 0.18, sz: 0.12, color: [0.35, 1.2, 1.05], seed: 144 });
  addCylinder(b, { height: 1.6, radiusBottom: 0.8, radiusTop: 0.7, segments: 8, rings: 3, center: [3, 5.5, -1.5], colorBottom: [0.3, 0.36, 0.36], colorTop: [0.4, 0.5, 0.5], seed: 145 });
  addBox(b, { cx: 5, cy: 6.2, sx: 1.2, sy: 1.4, sz: 1.2, color: [0.22, 0.26, 0.27], seed: 146 });
  addBox(b, { cx: -5.4, cy: 1.1, cz: -4.4, sx: 3, sy: 2.2, sz: 2.2, color: [0.19, 0.22, 0.23], seed: 147 });
  define('facility_block', b, { baseColor: [0.86, 0.92, 0.92, 1], emissive: [0.03, 0.22, 0.2], roughness: 0.55, metallic: 0.4 });
}

/* 17 — crystal outcrop */
{
  const b = makeBuilder();
  addBoulder(b, { cy: 0.1, radius: 1.5, squash: 0.5, detail: 1, seed: 151, noise: 0.25, tint: [0.3, 0.35, 0.36] });
  const shards = [
    [0.4, 0.2, 0.1, 2.6, 0.42],
    [-0.7, -0.1, 0.4, 1.9, 0.32],
    [0.1, -0.4, -0.8, 1.4, 0.26],
    [0.9, 0.3, -0.5, 1.1, 0.2],
  ];
  for (let i = 0; i < shards.length; i++) {
    const [x, y, z, r, s] = shards[i];
    addOctahedron(b, { cx: x, cy: y + r * 0.9, cz: z, radius: r, color: [0.35 + i * 0.04, 0.95, 0.92] });
    addBox(b, { cx: x, cy: y + 0.15, cz: z, sx: s * 2, sy: 0.3, sz: s * 2, color: [0.2, 0.42, 0.4], seed: 152 + i });
  }
  define('crystal_cluster', b, { baseColor: [0.35, 0.9, 0.85, 1], emissive: [0.2, 0.85, 0.8], roughness: 0.2, metallic: 0.15, doubleSided: true });
}

/* 18 — fern / undergrowth clump */
{
  const b = makeBuilder();
  const rand = mulberry32(161);
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + rand() * 0.5;
    const len = 0.9 + rand() * 1.4;
    const rootY = 0.15 + rand() * 0.3;
    const droop = 0.35 + rand() * 0.6;
    const w = 0.06 + rand() * 0.06;
    const root = [Math.cos(a) * 0.08, rootY, Math.sin(a) * 0.08];
    const tip = [Math.cos(a) * len, rootY + 0.5 - droop, Math.sin(a) * len];
    const perp = [Math.cos(a + Math.PI / 2) * w, 0, Math.sin(a + Math.PI / 2) * w];
    const green = [0.1 + rand() * 0.06, 0.28 + rand() * 0.12, 0.14 + rand() * 0.06];
    const base = b.positions.length / 3;
    pushVertex(b, [root[0] - perp[0], root[1], root[2] - perp[2]], green, [0, 0]);
    pushVertex(b, [root[0] + perp[0], root[1], root[2] + perp[2]], green, [1, 0]);
    pushVertex(b, [tip[0] - perp[0] * 0.2, tip[1], tip[2] - perp[2] * 0.2], [green[0] * 1.5, green[1] * 1.4, green[2] * 1.2], [0, 1]);
    pushVertex(b, [tip[0] + perp[0] * 0.2, tip[1], tip[2] + perp[2] * 0.2], [green[0] * 1.5, green[1] * 1.4, green[2] * 1.2], [1, 1]);
    addTriangle(b, base, base + 1, base + 2);
    addTriangle(b, base + 1, base + 3, base + 2);
  }
  define('fern', b, { baseColor: [1, 1, 1, 1], roughness: 0.9, metallic: 0, doubleSided: true });
}

/* 19 — river reeds */
{
  const b = makeBuilder();
  const rand = mulberry32(171);
  for (let i = 0; i < 16; i++) {
    const a = rand() * Math.PI * 2;
    const d = rand() * 0.9;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = 1.1 + rand() * 1.3;
    const leanX = (rand() - 0.5) * 0.7;
    const leanZ = (rand() - 0.5) * 0.7;
    const w = 0.035 + rand() * 0.03;
    const green = [0.18 + rand() * 0.08, 0.34 + rand() * 0.12, 0.16 + rand() * 0.06];
    const base = b.positions.length / 3;
    pushVertex(b, [x - w, 0, z], green, [0, 0]);
    pushVertex(b, [x + w, 0, z], green, [1, 0]);
    pushVertex(b, [x + leanX, h, z + leanZ], [green[0] * 1.3, green[1] * 1.25, green[2] * 1.2], [0.5, 1]);
    addTriangle(b, base, base + 1, base + 2);
    addTriangle(b, base + 1, base + 2, base + 2);
    // Seed head.
    addOctahedron(b, { cx: x + leanX, cy: h + 0.14, cz: z + leanZ, radius: 0.12 + rand() * 0.05, color: [0.42, 0.36, 0.2] });
  }
  define('reeds', b, { baseColor: [1, 1, 1, 1], roughness: 0.88, metallic: 0, doubleSided: true });
}

/* -------------------------------------------------------------------------- */
/* Write + validate                                                           */
/* -------------------------------------------------------------------------- */

await mkdir(OUT_DIR, { recursive: true });
const manifest = [];
for (const asset of assets) {
  const { glb, json } = encodeGLB({ ...asset.builder, material: asset.material, name: asset.name });
  const file = `${asset.name}.glb`;
  await writeFile(resolve(OUT_DIR, file), glb);
  manifest.push({
    file,
    bytes: glb.byteLength,
    vertices: asset.builder.positions.length / 3,
    triangles: asset.builder.indices.length / 3,
    material: asset.material,
  });
  const prim = json.meshes[0].primitives[0];
  if (!prim.attributes.POSITION && prim.attributes.POSITION !== 0) throw new Error(`Bad ${file}: missing POSITION`);
  if (json.buffers[0].byteLength <= 0) throw new Error(`Bad ${file}: empty buffer`);
}
await writeFile(
  resolve(OUT_DIR, 'manifest.json'),
  JSON.stringify({ generated: new Date().toISOString(), models: manifest }, null, 2),
);

for (const m of manifest) {
  console.log(`${m.file.padEnd(22)} ${String(m.vertices).padStart(6)} verts  ${String(m.triangles).padStart(6)} tris  ${(m.bytes / 1024).toFixed(1)} KiB`);
}
console.log(`\nWrote ${manifest.length} GLB assets to public/assets/models`);
