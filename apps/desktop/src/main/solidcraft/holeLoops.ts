/**
 * The holes of an open part as SolidCraft's `model.edges` shows them: loops of free edges, each one missing face. Used
 * when `body.repair {patch_holes}` refuses ("nothing sewn: the free edges bound holes … patch them", 0.45 to 0.49.0):
 * each loop is patched with `surface.patch {edges}` and sewn in with `surface.stitch`.
 */

type Vec3 = [number, number, number];

/** One edge of `model.edges` (0.49.0): its faces in its name ("A|B"; a free edge names one), its ends and its middle. */
export interface ModelEdge {
  name: string;
  start: Vec3;
  end: Vec3;
  mid: Vec3;
}

/** The faces an edge lies between, from its name "A|B": a name may hold | inside brackets, as "F4:blend(F3:+y|F3:-x)". */
function facesOf(name: string): string[] {
  const parts: string[] = [];
  let [depth, from] = [0, 0];
  for (let i = 0; i < name.length; i += 1) {
    const char = name.charAt(i);
    depth += char === '(' ? 1 : char === ')' ? -1 : 0;
    if (char === '|' && depth === 0) [parts[parts.length], from] = [name.slice(from, i), i + 1];
  }
  return [...parts, name.slice(from)];
}

const isVec = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number' && Number.isFinite(item));

/** The edges of a `model.edges` answer that read as edges; anything odd is left out. */
export function edgesOf(result: unknown): ModelEdge[] {
  const edges = (result as { edges?: unknown } | null | undefined)?.edges;
  return (Array.isArray(edges) ? (edges as Record<string, unknown>[]) : []).flatMap((edge) =>
    typeof edge.name === 'string' && isVec(edge.start) && isVec(edge.end) && isVec(edge.mid) ? [{ name: edge.name, start: edge.start, end: edge.end, mid: edge.mid }] : [],
  );
}

/**
 * The loops of free edges (one face in their name) that close: their ends met to a micrometre, -0 the same as 0
 * (a loop of six edges missed its close on "-0.000" against "0.000"). A seam of a round face names one face too, but
 * its chain does not close and is left out. Each loop as the middles of its edges, the points `surface.patch {edges}`
 * picks them by: a curved edge's middle lies on it, its ends may not pick it (23.11.2026).
 */
export function holeLoops(edges: readonly ModelEdge[]): Vec3[][] {
  const free = edges.filter((edge) => facesOf(edge.name).length === 1);
  const key = (point: Vec3) => point.map((value) => (Math.round(value * 1000) / 1000 + 0).toFixed(3)).join(',');
  const parent = free.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] ?? i;
    return i;
  };
  const seen = new Map<string, number>();
  free.forEach((edge, i) => {
    for (const point of [edge.start, edge.end]) {
      const at = seen.get(key(point));
      if (at === undefined) seen.set(key(point), i);
      else parent[find(i)] = find(at);
    }
  });
  const groups = new Map<number, ModelEdge[]>();
  free.forEach((edge, i) => groups.set(find(i), [...(groups.get(find(i)) ?? []), edge]));
  return [...groups.values()]
    .filter((loop) => {
      const ends = new Map<string, number>();
      for (const edge of loop) for (const point of [edge.start, edge.end]) ends.set(key(point), (ends.get(key(point)) ?? 0) + 1);
      return [...ends.values()].every((count) => count % 2 === 0);
    })
    .map((loop) => loop.map((edge) => edge.mid));
}
