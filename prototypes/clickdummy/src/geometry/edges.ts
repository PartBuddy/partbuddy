import type { TaggedMesh } from './tagged3mf';

export interface BrepEdge {
  /** SolidCraft edge naming: the two face indices, lower first. */
  faces: [number, number];
  /** Line segments, xyz xyz per segment. */
  segments: Float32Array;
}

/**
 * Derives B-rep edges from the face tags: every mesh edge whose two triangles carry different
 * face indices lies on a B-rep edge (ADR 0004). `skip` filters smooth seams, e.g. between the
 * two halves of a cylinder.
 */
export function deriveEdges(
  mesh: TaggedMesh,
  skip: (faceA: number, faceB: number) => boolean = () => false,
): { edges: BrepEdge[]; openEdges: number } {
  const owner = new Map<string, number>();
  const pairs = new Map<string, number[]>();

  const triangleCount = mesh.indices.length / 3;
  for (let t = 0; t < triangleCount; t += 1) {
    const face = mesh.triangleFaces[t] ?? 0;
    for (let k = 0; k < 3; k += 1) {
      const a = mesh.indices[t * 3 + k] ?? 0;
      const b = mesh.indices[t * 3 + ((k + 1) % 3)] ?? 0;
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      const first = owner.get(key);
      if (first === undefined) {
        owner.set(key, face);
        continue;
      }
      owner.delete(key);
      if (first === face || skip(first, face)) continue;
      const pair = first < face ? `${first}|${face}` : `${face}|${first}`;
      const list = pairs.get(pair) ?? [];
      list.push(a, b);
      pairs.set(pair, list);
    }
  }
  const openEdges = owner.size;

  const edges: BrepEdge[] = [];
  for (const [pair, vertices] of pairs) {
    const [fa, fb] = pair.split('|').map(Number) as [number, number];
    const segments = new Float32Array(vertices.length * 3);
    vertices.forEach((v, i) => {
      segments[i * 3] = mesh.positions[v * 3] ?? 0;
      segments[i * 3 + 1] = mesh.positions[v * 3 + 1] ?? 0;
      segments[i * 3 + 2] = mesh.positions[v * 3 + 2] ?? 0;
    });
    edges.push({ faces: [fa, fb], segments });
  }
  return { edges, openEdges };
}
