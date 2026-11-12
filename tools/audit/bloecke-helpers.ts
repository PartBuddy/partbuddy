/**
 * Helpers of the block measuring cases (cases/bloecke-*.case.ts). Kept beside the shared harness,
 * which these cases do not change.
 */
import { cylinders, ray, type Audit, type Hit, type MeasuredBody, type Step, type Vec3 } from './harness';

export const box = (name: string, size: Vec3, corner: Vec3 = [0, 0, 0]): Step => ({
  command: 'solid.box',
  params: { length: size[0], width: size[1], height: size[2], corner, operation: 'new', body_name: name, name },
});

/** Exact volume in mm³ of every body by name (SolidCraft's inspect.measure), without the mirror. */
export async function volumes(audit: Audit): Promise<Record<string, number>> {
  const [measured] = (await audit.batch([{ command: 'inspect.measure', params: {} }])) as [{ bodies?: { name: string; volume_mm3: number }[] }];
  return Object.fromEntries((measured.bodies ?? []).map((body) => [body.name, body.volume_mm3]));
}

/** What a step took from each body, in mm³ (negative: added). */
export function removed(before: Record<string, number>, after: Record<string, number>): Record<string, number> {
  const names = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return Object.fromEntries(names.map((name) => [name, Math.round(((before[name] ?? 0) - (after[name] ?? 0)) * 1e4) / 1e4]));
}

/** Walls (entering → leaving) and gaps (leaving → entering) along a ray, in mm from its origin. */
export function spans(bodies: readonly MeasuredBody[], origin: Vec3, direction: Vec3): { hits: Hit[]; walls: { body: string; from: number; to: number; thickness: number }[] } {
  const hits = ray(bodies, origin, direction);
  const walls: { body: string; from: number; to: number; thickness: number }[] = [];
  const open = new Map<string, number>();
  for (const hit of hits) {
    if (hit.entering) open.set(hit.body, hit.distance);
    else if (open.has(hit.body)) {
      const from = open.get(hit.body)!;
      walls.push({ body: hit.body, from, to: hit.distance, thickness: Math.round((hit.distance - from) * 1e4) / 1e4 });
      open.delete(hit.body);
    }
  }
  return { hits, walls };
}

/** Bounding box of the mesh vertices of each face whose name passes, from the exported triangles. */
export function faceBoxes(body: MeasuredBody, pass: (name: string) => boolean = () => true): { face: string; min: Vec3; max: Vec3; planeNormal?: unknown; area?: unknown }[] {
  const { positions: p, indices, triangleFaces } = body.mesh;
  const boxes = new Map<number, { min: Vec3; max: Vec3 }>();
  for (let t = 0; t < indices.length; t += 3) {
    const face = triangleFaces[t / 3]!;
    const entry = boxes.get(face) ?? { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let k = 0; k < 3; k += 1) {
      const v = indices[t + k]! * 3;
      for (let a = 0; a < 3; a += 1) {
        entry.min[a] = Math.min(entry.min[a]!, p[v + a]!);
        entry.max[a] = Math.max(entry.max[a]!, p[v + a]!);
      }
    }
    boxes.set(face, entry);
  }
  const r = (v: Vec3) => v.map((value) => Math.round(value * 1e4) / 1e4) as Vec3;
  return [...boxes].flatMap(([index, entry]) => {
    const face = body.faces.faces[index];
    return face && pass(face.name) ? [{ face: face.name, min: r(entry.min), max: r(entry.max), planeNormal: face.planeNormal, area: face.area }] : [];
  });
}

/** A body's summary for result.json: SolidCraft's measure, exact cylinders and the mesh's bounding box. */
export const summary = (body: MeasuredBody) => ({
  name: body.name,
  volume_mm3: body.solidcraft.volume_mm3,
  closed: body.solidcraft.closed,
  bbox: body.solidcraft.bbox,
  shells: (body.solidcraft.kernel as { shells?: number } | undefined)?.shells,
  cylinders: cylinders(body),
});

/**
 * Opens a case below out/bloecke/. The harness names its STL and .sc after the whole case name, so
 * finish() needs the folder out/bloecke/<name>/bloecke to exist (gap of the harness: nested names).
 */
export async function openBlockAudit(name: string, nozzle?: number): Promise<Audit> {
  const { openAudit } = await import('./harness');
  const { mkdirSync } = await import('node:fs');
  const { join } = await import('node:path');
  const audit = await openAudit(`bloecke/${name}`, nozzle);
  mkdirSync(join(audit.dir, 'bloecke'), { recursive: true });
  return audit;
}
