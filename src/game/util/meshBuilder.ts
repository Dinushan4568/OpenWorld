/** CPU mesh construction helpers used for terrain, ground cover and effects. */
import { Mesh, type GraphicsDevice } from 'playcanvas';

export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[]; // RGBA, linear space
  indices: number[];
}

export function createMeshData(): MeshData {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

export function vertexCount(data: MeshData): number {
  return data.positions.length / 3;
}

export interface VertexInput {
  p: [number, number, number];
  n?: [number, number, number];
  uv?: [number, number];
  c?: [number, number, number, number];
}

export function addVertex(data: MeshData, vertex: VertexInput): number {
  const { p, n = [0, 1, 0], uv = [0, 0], c = [1, 1, 1, 1] } = vertex;
  data.positions.push(p[0], p[1], p[2]);
  data.normals.push(n[0], n[1], n[2]);
  data.uvs.push(uv[0], uv[1]);
  data.colors.push(c[0], c[1], c[2], c[3]);
  return vertexCount(data) - 1;
}

export function addTriangle(
  data: MeshData,
  a: VertexInput,
  b: VertexInput,
  c: VertexInput,
): [number, number, number] {
  const ia = addVertex(data, a);
  const ib = addVertex(data, b);
  const ic = addVertex(data, c);
  data.indices.push(ia, ib, ic);
  return [ia, ib, ic];
}

export function addQuad(
  data: MeshData,
  a: VertexInput,
  b: VertexInput,
  c: VertexInput,
  d: VertexInput,
): void {
  const ia = addVertex(data, a);
  const ib = addVertex(data, b);
  const ic = addVertex(data, c);
  const id = addVertex(data, d);
  data.indices.push(ia, ib, ic, ia, ic, id);
}

/** Recompute smooth normals from triangle winding. */
export function computeNormals(data: MeshData): void {
  const normals = new Float32Array(data.positions.length);
  const idx = data.indices;
  for (let i = 0; i < idx.length; i += 3) {
    const ia = idx[i] * 3;
    const ib = idx[i + 1] * 3;
    const ic = idx[i + 2] * 3;
    const ux = data.positions[ib] - data.positions[ia];
    const uy = data.positions[ib + 1] - data.positions[ia + 1];
    const uz = data.positions[ib + 2] - data.positions[ia + 2];
    const vx = data.positions[ic] - data.positions[ia];
    const vy = data.positions[ic + 1] - data.positions[ia + 1];
    const vz = data.positions[ic + 2] - data.positions[ia + 2];
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const offset of [ia, ib, ic]) {
      normals[offset] += nx;
      normals[offset + 1] += ny;
      normals[offset + 2] += nz;
    }
  }
  const out: number[] = [];
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    out.push(normals[i] / len, normals[i + 1] / len, normals[i + 2] / len);
  }
  data.normals = out;
}

/** Upload MeshData to the GPU. The simple Mesh API builds the vertex format for us. */
export function buildMesh(device: GraphicsDevice, data: MeshData, name = 'procedural-mesh'): Mesh {
  if (!data.positions.length) throw new Error(`Cannot build empty mesh "${name}"`);
  const mesh = new Mesh(device);
  mesh.setPositions(new Float32Array(data.positions));
  mesh.setNormals(new Float32Array(data.normals));
  mesh.setUvs(0, new Float32Array(data.uvs));
  mesh.setColors(new Float32Array(data.colors), 4);
  const indices = new Uint32Array(data.indices);
  mesh.setIndices(indices);
  mesh.update();
  return mesh;
}

/** Append a transform onto an existing mesh (used for merged ground cover). */
export function addTransformedTriangle(
  data: MeshData,
  tri: Array<[number, number, number]>,
  origin: [number, number, number],
  color: [number, number, number, number],
  normal?: [number, number, number],
): void {
  const verts = tri.map((p) => ({
    p: [p[0] + origin[0], p[1] + origin[1], p[2] + origin[2]] as [number, number, number],
    c: color,
    uv: [0, 0] as [number, number],
    n: normal,
  }));
  addTriangle(data, verts[0], verts[1], verts[2]);
}
