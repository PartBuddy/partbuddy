import type { TaggedMesh } from './tagged3mf';

export interface BrepEdge {
  /** SolidCraft edge naming: the two face indices, lower first. */
  faces: [number, number];
  /** Line segments, xyz xyz per segment. */
  segments: Float32Array;
  /** Length in mm (sum of the segments). */
  length: number;
  /** End points of an open edge (two), none for a closed loop such as a full circle. */
  ends: [number, number, number][];
}

/** Splits the mesh edges between two faces into connected chains: one chain per B-rep edge. */
function chainsOf(vertices: number[]): number[][] {
  const parent = new Map<number, number>();
  const find = (v: number): number => {
    let root = v;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
    let node = v;
    while (node !== root) {
      const next = parent.get(node)!;
      parent.set(node, root);
      node = next;
    }
    return root;
  };
  for (const v of vertices) if (!parent.has(v)) parent.set(v, v);
  for (let i = 0; i < vertices.length; i += 2) {
    const a = find(vertices[i]!);
    const b = find(vertices[i + 1]!);
    if (a !== b) parent.set(a, b);
  }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < vertices.length; i += 2) {
    const root = find(vertices[i]!);
    const list = groups.get(root) ?? [];
    list.push(vertices[i]!, vertices[i + 1]!);
    groups.set(root, list);
  }
  return [...groups.values()];
}

/**
 * Derives B-rep edges from the face tags: every mesh edge whose two triangles carry different
 * face indices lies on a B-rep edge (ADR 0004). The mesh edges between one pair of faces are split
 * into connected chains, because two faces can meet along several separate edges. `skip` filters
 * smooth seams, e.g. between the two halves of a cylinder.
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
  const position = (v: number): [number, number, number] => [
    mesh.positions[v * 3] ?? 0,
    mesh.positions[v * 3 + 1] ?? 0,
    mesh.positions[v * 3 + 2] ?? 0,
  ];

  const edges: BrepEdge[] = [];
  for (const [pair, vertices] of pairs) {
    const [fa, fb] = pair.split('|').map(Number) as [number, number];
    for (const chain of chainsOf(vertices)) {
      const segments = new Float32Array(chain.length * 3);
      const degree = new Map<number, number>();
      let length = 0;
      for (let i = 0; i < chain.length; i += 2) {
        const a = position(chain[i]!);
        const b = position(chain[i + 1]!);
        segments.set(a, i * 3);
        segments.set(b, i * 3 + 3);
        length += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        for (const v of [chain[i]!, chain[i + 1]!]) degree.set(v, (degree.get(v) ?? 0) + 1);
      }
      const ends = [...degree].filter(([, count]) => count === 1).map(([v]) => position(v));
      edges.push({ faces: [fa, fb], segments, length, ends });
    }
  }
  return { edges, openEdges };
}

/**
 * SolidCraft's name of the edge between two faces: both face names in sorted order, joined by "|"
 * (as `model.edges` reports them). When the two faces meet along several edges, SolidCraft adds a
 * suffix whose order PartBuddy cannot know; such names are marked as not exact.
 */
export function edgeName(faceA: string, faceB: string): string {
  return [faceA, faceB].sort().join('|');
}
