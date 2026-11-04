/**
 * Screen-space picking of B-rep edges and vertices (M1, decided 2026-11-04). Faces are picked by
 * raycasting the mesh; edges and vertices are thin, so they are found by their distance to the
 * pointer in pixels, which keeps them easy to hit at any zoom. Pure functions: the caller passes a
 * projection from world to screen pixels, so tests run without WebGL.
 */

export type Vec3 = [number, number, number];

/** World point to screen pixels and depth (0 near … 1 far); null when behind the camera. */
export type Project = (x: number, y: number, z: number) => { x: number; y: number; depth: number } | null;

export interface ScreenCandidate {
  /** Vertex index, or segment index for edges. */
  index: number;
  /** Distance to the pointer in pixels. */
  pixels: number;
  /** The nearest world point (the vertex, or the point on the segment). */
  point: Vec3;
}

const at = (values: Float32Array, index: number) => values[index] ?? 0;

/** Vertices within `maxPixels` of the pointer, nearest first. */
export function vertexCandidates(vertices: Float32Array, project: Project, pointer: { x: number; y: number }, maxPixels: number): ScreenCandidate[] {
  const found: ScreenCandidate[] = [];
  for (let i = 0; i < vertices.length; i += 3) {
    const x = at(vertices, i);
    const y = at(vertices, i + 1);
    const z = at(vertices, i + 2);
    const screen = project(x, y, z);
    if (!screen) continue;
    const pixels = Math.hypot(screen.x - pointer.x, screen.y - pointer.y);
    if (pixels <= maxPixels) found.push({ index: i / 3, pixels, point: [x, y, z] });
  }
  return found.sort((a, b) => a.pixels - b.pixels);
}

/** Edge segments within `maxPixels` of the pointer, nearest first, with the closest point on each. */
export function segmentCandidates(segments: Float32Array, project: Project, pointer: { x: number; y: number }, maxPixels: number): ScreenCandidate[] {
  const found: ScreenCandidate[] = [];
  for (let s = 0; s < segments.length; s += 6) {
    const a0: Vec3 = [at(segments, s), at(segments, s + 1), at(segments, s + 2)];
    const b0: Vec3 = [at(segments, s + 3), at(segments, s + 4), at(segments, s + 5)];
    const a = project(...a0);
    const b = project(...b0);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const span = dx * dx + dy * dy;
    // Parameter of the closest point on the projected segment, clamped to the segment.
    const t = span === 0 ? 0 : Math.min(1, Math.max(0, ((pointer.x - a.x) * dx + (pointer.y - a.y) * dy) / span));
    const pixels = Math.hypot(a.x + dx * t - pointer.x, a.y + dy * t - pointer.y);
    if (pixels > maxPixels) continue;
    // Linear in screen space is close enough on a short tessellation segment.
    const point: Vec3 = [a0[0] + (b0[0] - a0[0]) * t, a0[1] + (b0[1] - a0[1]) * t, a0[2] + (b0[2] - a0[2]) * t];
    found.push({ index: s / 6, pixels, point });
  }
  return found.sort((a, b) => a.pixels - b.pixels);
}

/** Pick radii in CSS pixels: vertices win over edges, edges over faces. */
export const PICK_PIXELS = { vertex: 8, edge: 6 } as const;
