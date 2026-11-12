/**
 * Helpers of the mechanism measuring group (phase 4, 04-messung-mechanik.md). Nothing here changes the
 * shared harness; it fills what the harness leaves open for mechanisms: down-facing faces by angle in
 * a given print direction and on a given bed, the segments of a ray, and one summary per scene.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { UpstreamTools } from '../../apps/desktop/src/main/agents/gateProxy';
import type { PrintCheckProfile } from '../../packages/geometry/src/index';
import { openAudit, ray, type Audit, type Hit, type MeasuredBody, type Step, type Vec3 } from './harness';

export { ray };
export type { Audit, MeasuredBody, Step, Vec3 };

const BED: [number, number, number] = [256, 256, 256];
export const PROFILES: Record<string, PrintCheckProfile> = {
  pla04: { bed: BED, nozzle: 0.4, overhang: 45 },
  petg04: { bed: BED, nozzle: 0.4, overhang: 40 },
  tpu04: { bed: BED, nozzle: 0.4, overhang: 35 },
  pla06: { bed: BED, nozzle: 0.6, overhang: 45 },
  pla08: { bed: BED, nozzle: 0.8, overhang: 45 },
};

const r3 = (value: number) => Math.round(value * 1000) / 1000;

export interface DownFace {
  face: string;
  /** Steepest overhang on the face, degrees from the vertical (90 = a level ceiling). */
  maxAngle: number;
  over35: number;
  over40: number;
  over45: number;
  /** Area of level ceiling (over 89°) in mm², its box in the bed's plane and its height over the bed. */
  flat: number;
  flatSpan: [number, number];
  flatZ: number;
}

/**
 * Every face of a body that looks down and does not lie on the bed, from the exported triangles.
 * `up` -1 measures the body turned over (a lid printed on its top); `bed` is the height of the bed in
 * that direction, by default the body's own lowest point (as the print check takes it).
 */
export function downFaces(body: MeasuredBody, up: 1 | -1 = 1, bed?: number): { bedZ: number; bedArea: number; maxAngle: number; over35: number; over40: number; over45: number; flat: number; longestFlatSpan: number; faces: DownFace[] } {
  const { positions: p, indices, triangleFaces } = body.mesh;
  let low = Infinity;
  for (let v = 2; v < p.length; v += 3) low = Math.min(low, up * p[v]!);
  const bedZ = bed ?? low;
  let bedArea = 0;
  const stats = new Map<string, DownFace & { box: [number, number, number, number] }>();
  for (let t = 0; t < indices.length; t += 3) {
    const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
    const e1 = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!];
    const e2 = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
    const n = [e1[1]! * e2[2]! - e1[2]! * e2[1]!, e1[2]! * e2[0]! - e1[0]! * e2[2]!, e1[0]! * e2[1]! - e1[1]! * e2[0]!];
    const length = Math.hypot(...n);
    const area = length / 2;
    if (area < 1e-5) continue;
    const nz = (up * n[2]!) / length;
    if (nz > -1e-6) continue;
    const top = Math.max(up * p[a + 2]!, up * p[b + 2]!, up * p[c + 2]!);
    if (top - bedZ < 0.02) {
      bedArea += area;
      continue;
    }
    const angle = (Math.asin(Math.min(1, -nz)) * 180) / Math.PI;
    const name = body.faces.faces[triangleFaces[t / 3]!]?.name ?? '?';
    let s = stats.get(name);
    if (!s) stats.set(name, (s = { face: name, maxAngle: 0, over35: 0, over40: 0, over45: 0, flat: 0, flatSpan: [0, 0], flatZ: 0, box: [Infinity, Infinity, -Infinity, -Infinity] }));
    s.maxAngle = Math.max(s.maxAngle, angle);
    if (angle > 35.5) s.over35 += area;
    if (angle > 40.5) s.over40 += area;
    if (angle > 45.5) s.over45 += area;
    if (angle > 89) {
      s.flat += area;
      s.flatZ = top - bedZ;
      for (const v of [a, b, c]) s.box = [Math.min(s.box[0], p[v]!), Math.min(s.box[1], p[v + 1]!), Math.max(s.box[2], p[v]!), Math.max(s.box[3], p[v + 1]!)];
    }
  }
  const faces = [...stats.values()]
    .filter((s) => s.over35 > 0.01)
    .map(({ box, ...s }): DownFace => ({ ...s, maxAngle: r3(s.maxAngle), over35: r3(s.over35), over40: r3(s.over40), over45: r3(s.over45), flat: r3(s.flat), flatSpan: s.flat > 0 ? [r3(box[2] - box[0]), r3(box[3] - box[1])] : [0, 0], flatZ: r3(s.flatZ) }))
    .sort((x, y) => y.over45 - x.over45);
  const sum = (key: 'over35' | 'over40' | 'over45' | 'flat') => r3(faces.reduce((total, face) => total + face[key], 0));
  return {
    bedZ: r3(up * bedZ),
    bedArea: r3(bedArea),
    maxAngle: Math.max(0, ...faces.map((face) => face.maxAngle)),
    over35: sum('over35'),
    over40: sum('over40'),
    over45: sum('over45'),
    flat: sum('flat'),
    // The shorter side of the box of the widest level ceiling: what a bridge must span at least.
    longestFlatSpan: Math.max(0, ...faces.filter((face) => face.flat > 0.5).map((face) => Math.min(...face.flatSpan))),
    faces,
  };
}

/** A ray's way cut at its crossings: which bodies it is inside of on each stretch (none: a gap). */
export function segments(hits: readonly Hit[]): { from: number; to: number; length: number; inside: string[] }[] {
  const inside = new Map<string, number>();
  const out: { from: number; to: number; length: number; inside: string[] }[] = [];
  let last: number | null = null;
  for (const hit of hits) {
    if (last !== null && hit.distance - last > 1e-6) out.push({ from: last, to: hit.distance, length: r3(hit.distance - last), inside: [...inside].filter(([, count]) => count > 0).map(([name]) => name) });
    inside.set(hit.body, (inside.get(hit.body) ?? 0) + (hit.entering ? 1 : -1));
    last = hit.distance;
  }
  return out;
}

/** The harness's tools in the shape the app's own helpers take (roomDepths). */
export function upstreamOf(audit: Audit): UpstreamTools {
  return {
    instructions: () => '',
    listTools: () => Promise.resolve([]),
    callTool: async (name, args) => {
      const result = await audit.tool(name, args);
      return { content: [{ type: 'text', text: result.text }], isError: result.isError };
    },
  } as unknown as UpstreamTools;
}

const said = async (run: () => Promise<unknown>): Promise<unknown> => {
  try {
    return await run();
  } catch (cause) {
    return { error: (cause as Error).message };
  }
};

/** What SolidCraft holds: bodies with volume, box and closedness. */
export async function bodiesOf(audit: Audit): Promise<{ name: string; volume: number; closed: unknown; shells: unknown; bbox: unknown }[]> {
  const [measured] = (await audit.batch([{ command: 'inspect.measure', params: {} }])) as [{ bodies?: Record<string, unknown>[] }];
  return (measured.bodies ?? []).map((body) => ({ name: String(body.name), volume: r3(Number(body.volume_mm3)), closed: body.closed, shells: (body.kernel as { shells?: unknown } | undefined)?.shells, bbox: body.bbox }));
}

/**
 * One scene measured: the bodies, the smallest gap and shared volume of the pair, the down-facing
 * faces of each body (in its print direction, on its own bed and on the bed both share) and the
 * print check with every profile.
 */
export async function summarize(audit: Audit, pair: [string, string] | null, options: { up?: Record<string, 1 | -1>; profiles?: string[] } = {}): Promise<Record<string, unknown>> {
  const { bodies, check } = await audit.measure();
  const listed = await bodiesOf(audit);
  const present = pair !== null && pair.every((name) => listed.some((body) => body.name === name));
  const clearance = present ? await said(async () => (await audit.batch([{ command: 'inspect.clearance', params: { bodies: [pair[0]], against: [pair[1]], clearance: 5 } }]))[0]) : null;
  const interference = present ? await said(async () => (await audit.batch([{ command: 'inspect.interference', params: { bodies: pair } }]))[0]) : null;
  const joints = await said(async () => (await audit.batch([{ command: 'joint.list', params: {} }]))[0]);
  const near = (clearance as { near?: { distance_mm?: number; from?: unknown; to?: unknown }[]; overlaps?: unknown[] } | null)?.near;
  const commonBed = Math.min(...bodies.map((body) => body.metrics.bbox.min[2]));
  return {
    bodyCount: listed.length,
    bodies: listed,
    smallestGap: near?.[0] ? { mm: near[0].distance_mm, from: near[0].from, to: near[0].to } : null,
    clearanceOverlaps: (clearance as { overlaps?: unknown[]; error?: string } | null)?.overlaps ?? (clearance as { error?: string } | null)?.error ?? null,
    interference: interference === null ? null : { count: (interference as { count?: unknown }).count, error: (interference as { error?: unknown }).error },
    joints: ((joints as { joints?: { name?: unknown; type?: unknown; values?: unknown }[] } | undefined)?.joints ?? []).map((joint) => ({ name: joint.name, type: joint.type, values: joint.values })),
    down: Object.fromEntries(bodies.map((body) => [body.name, { ownBed: downFaces(body, options.up?.[body.name] ?? 1), ...(options.up ? {} : { commonBed: downFaces(body, 1, commonBed) }) }])),
    check: Object.fromEntries((options.profiles ?? ['pla04', 'petg04', 'pla06']).map((name) => [name, check(PROFILES[name]!)])),
    measured: bodies,
  };
}

/** Calls that must be refused: each answer, and whether the design is the same afterwards. */
export async function refused(audit: Audit, calls: Record<string, unknown>[]): Promise<{ args: Record<string, unknown>; text: string; isError: boolean; unchanged: boolean }[]> {
  const out = [];
  for (const args of calls) {
    const before = JSON.stringify(await bodiesOf(audit));
    const answer = await audit.tool('partbuddy_mechanism', args);
    out.push({ args, ...answer, unchanged: JSON.stringify(await bodiesOf(audit)) === before });
  }
  return out;
}

/** Runs one scene on its own SolidCraft and writes its result to out/mechanik/<name>/result.json. */
export async function scene(name: string, nozzle: number, run: (audit: Audit) => Promise<Record<string, unknown>>): Promise<Record<string, unknown>> {
  const audit = await openAudit(`mechanik/${name}`, nozzle);
  try {
    const result = await run(audit);
    // The meshes stay out of the file.
    const { measured: _measured, ...kept } = result as { measured?: unknown };
    writeFileSync(join(audit.dir, 'result.json'), JSON.stringify(kept, null, 2));
    writeFileSync(join(audit.dir, 'sent.json'), JSON.stringify(audit.sent, null, 2));
    return result;
  } finally {
    await audit.close();
  }
}

export const box = (name: string, corner: Vec3, size: Vec3): Step => ({ command: 'solid.box', params: { length: size[0], width: size[1], height: size[2], corner, operation: 'new', body_name: name } });
