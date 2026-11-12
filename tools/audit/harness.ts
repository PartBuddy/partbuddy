/**
 * Measuring harness of the full audit (docs/audits/2026-11-12-vollaudit, phase 4): the app's real
 * assistant tools against a real SolidCraft without a window, measured with packages/geometry.
 * Nothing of the product is rebuilt here; see README.md.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { withBlockTool } from '../../apps/desktop/src/main/agents/blockTool';
import type { UpstreamTools } from '../../apps/desktop/src/main/agents/gateProxy';
import { withMechanismTool } from '../../apps/desktop/src/main/agents/mechanismTool';
import { HeadlessEngine } from '../../apps/desktop/src/main/solidcraft/headless';
import { mirrorActiveDesign } from '../../apps/desktop/src/main/solidcraft/mirror';
import {
  buildRenderMesh,
  buildViewerModel,
  checkPrint,
  meshMetrics,
  Overhang,
  overhangLimits,
  overhangOf,
  parseTagged3mf,
  type FaceTable,
  type MeshMetrics,
  type PrintCheck,
  type PrintCheckProfile,
  type TaggedMesh,
  type ViewerModel,
} from '../../packages/geometry/src/index';

export type Step = { command: string; params: Record<string, unknown> };
export type Vec3 = [number, number, number];

/** The Claude app hands out TEMP as an 8.3 short path, which SolidCraft refuses (docs/engineering-notes.md). */
const LONG_TEMP = join(homedir(), 'AppData', 'Local', 'Temp');
/** The installed SolidCraft (0.40.1 since 2026-11-12); AUDIT_SOLIDCRAFT_CLI names another one. */
const CLI = process.env.AUDIT_SOLIDCRAFT_CLI ?? join(process.env.ProgramFiles ?? '', 'SolidCraft', 'solidcraft-cli.exe');
const OUT = join(import.meta.dirname, 'out');

export const PLA_04: PrintCheckProfile = { bed: [256, 256, 256], nozzle: 0.4, layer: 0.2, overhang: 45 };

export interface MeasuredBody {
  name: string;
  /** SolidCraft's own measurement of the body (inspect.measure): volume_mm3, bbox, closed, counts. */
  solidcraft: Record<string, unknown>;
  faces: FaceTable;
  mesh: TaggedMesh;
  metrics: MeshMetrics;
  model: ViewerModel;
}

export interface Hit {
  body: string;
  /** Distance from the ray's origin in mm. */
  distance: number;
  /** SolidCraft's name of the face that was hit. */
  face: string;
  /** True when the ray goes into the material there, false when it leaves it. */
  entering: boolean;
}

/**
 * Every crossing of a ray with the bodies' meshes, nearest first (Möller–Trumbore on the exported
 * triangles, in double precision). The way between an entering and the next leaving hit is a wall,
 * between a leaving and the next entering hit a gap. On a curved face the mesh lies up to its chord
 * tolerance (2e-4 of the body's size at quality standard) inside the true face.
 */
export function ray(bodies: readonly MeasuredBody[], origin: Vec3, direction: Vec3): Hit[] {
  const length = Math.hypot(...direction);
  const d = direction.map((value) => value / length) as Vec3;
  const hits: Hit[] = [];
  for (const body of bodies) {
    const { positions: p, indices, triangleFaces } = body.mesh;
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t]! * 3, indices[t + 1]! * 3, indices[t + 2]! * 3];
      const e1: Vec3 = [p[b]! - p[a]!, p[b + 1]! - p[a + 1]!, p[b + 2]! - p[a + 2]!];
      const e2: Vec3 = [p[c]! - p[a]!, p[c + 1]! - p[a + 1]!, p[c + 2]! - p[a + 2]!];
      const h = cross(d, e2);
      const det = dot(e1, h);
      if (Math.abs(det) < 1e-12) continue;
      const s: Vec3 = [origin[0] - p[a]!, origin[1] - p[a + 1]!, origin[2] - p[a + 2]!];
      const u = dot(s, h) / det;
      const q = cross(s, e1);
      const v = dot(d, q) / det;
      // Half open, so a ray through a shared edge counts one of its two triangles.
      if (u < 0 || v < 0 || u + v >= 1) continue;
      const distance = dot(e2, q) / det;
      if (distance <= 1e-9) continue;
      const face = body.faces.faces[triangleFaces[t / 3]!]?.name ?? '?';
      // Outward triangles: the ray enters where it runs against the normal (det > 0).
      hits.push({ body: body.name, distance: round(distance), face, entering: det > 0 });
    }
  }
  return hits.sort((x, y) => x.distance - y.distance);
}

const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const round = (value: number) => Math.round(value * 1e4) / 1e4;

/** Overhang areas in mm² of one body as designed (Z up, on its own lowest point), by the print check's own rule. */
export function overhang(body: MeasuredBody, profile: PrintCheckProfile, reach = 0): { fine: number; bed: number; borderline: number; support: number; supportFaces: Record<string, number> } {
  const geometry = body.model.geometry;
  const map = overhangOf(
    {
      positions: geometry.getAttribute('position').array as Float32Array,
      normals: geometry.getAttribute('normal').array as Float32Array,
      index: geometry.index!.array as Uint32Array,
      vertexFaces: body.model.vertexFaces,
      faceCount: body.faces.faces.length,
    },
    body.metrics.bbox.min[2],
    overhangLimits(profile.overhang),
    reach,
  );
  const supportFaces = Object.fromEntries([...map.supportByFace].flatMap((area, i) => (area > 0 ? [[body.faces.faces[i]?.name ?? String(i), round(area)]] : [])));
  return { fine: round(map.area[Overhang.Fine]), bed: round(map.area[Overhang.Bed]), borderline: round(map.area[Overhang.Borderline]), support: round(map.area[Overhang.Support]), supportFaces };
}

export interface Audit {
  /** Folder of this case's files: tools/audit/out/<case>. */
  dir: string;
  /** Raw SolidCraft commands in one batch (to build a carrier body, or to measure); throws SolidCraft's own words. */
  batch(commands: Step[]): Promise<unknown[]>;
  /** One call of an assistant tool as the model would make it (partbuddy_block, partbuddy_mechanism, or any SolidCraft tool). */
  tool(name: string, args: Record<string, unknown>): Promise<{ text: string; isError: boolean }>;
  /** Every batch the PartBuddy tools sent to SolidCraft so far, in order. */
  sent: { rollback: boolean; commands: Step[] }[];
  /** All visible bodies through the app's own mirror (3mf-tagged + model.faces), with SolidCraft's and the mesh's measures. */
  measure(): Promise<{ bodies: MeasuredBody[]; check(profile: PrintCheckProfile): PrintCheck }>;
  /** Writes result.json (what the case measured) and the commands sent, and exports the design as STL and .sc. */
  finish(result: unknown): Promise<void>;
  close(): Promise<void>;
}

/** Starts SolidCraft without a window on a new design, with PartBuddy's block and mechanism tools on top. */
export async function openAudit(name: string, nozzle = 0.4): Promise<Audit> {
  if (!existsSync(CLI)) throw new Error(`no solidcraft-cli at ${CLI}; set AUDIT_SOLIDCRAFT_CLI`);
  const dir = join(OUT, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const engine = await HeadlessEngine.start({ cli: CLI, allowPaths: [dir], env: { ...process.env, TEMP: LONG_TEMP, TMP: LONG_TEMP } });
  const sent: Audit['sent'] = [];
  const logged: UpstreamTools = {
    ...engine.tools,
    callTool: (tool, args, callId) => {
      if (tool === 'batch') sent.push({ rollback: args.rollback === true, commands: args.commands as Step[] });
      return engine.tools.callTool(tool, args, callId);
    },
  };
  const tools = withMechanismTool(withBlockTool(logged), () => nozzle);
  const batch = async (commands: Step[]): Promise<unknown[]> => {
    const reply = await engine.requester.request<{ results?: unknown[]; failed?: { index: number; command: string; error: string } }>('engine.batch', { commands });
    if (reply.failed) throw new Error(`step ${String(reply.failed.index)} ${reply.failed.command}: ${reply.failed.error}`);
    return reply.results ?? [];
  };
  return {
    dir,
    batch,
    sent,
    tool: async (tool, args) => {
      const result = await tools.callTool(tool, args, undefined);
      const text = result.content.find((part) => part.type === 'text')?.text;
      return { text: typeof text === 'string' ? text : '', isError: result.isError === true };
    },
    measure: async () => {
      const mirror = await mirrorActiveDesign(engine.requester, dir);
      const [measured] = (await batch([{ command: 'inspect.measure', params: {} }])) as [{ bodies?: Record<string, unknown>[] }];
      const bodies = mirror.bodies.map((body): MeasuredBody => {
        const mesh = parseTagged3mf(body.mesh);
        return {
          name: body.name,
          solidcraft: (measured.bodies ?? []).find((entry) => entry.name === body.name) ?? {},
          faces: body.faces,
          mesh,
          metrics: meshMetrics(mesh),
          model: buildViewerModel(buildRenderMesh(mesh, body.faces), body.faces),
        };
      });
      return { bodies, check: (profile) => checkPrint(bodies.map((body) => ({ name: body.name, model: body.model })), profile, mirror.structure.features) };
    },
    finish: async (result) => {
      writeFileSync(join(dir, 'result.json'), JSON.stringify(result, null, 2));
      writeFileSync(join(dir, 'sent.json'), JSON.stringify(sent, null, 2));
      await batch([{ command: 'file.export', params: { path: join(dir, `${name}.stl`), format: 'stl' } }]);
      await engine.save(join(dir, `${name}.sc`));
    },
    close: () => engine.close(),
  };
}

/** Radii in mm of the cylindrical faces of a body, as SolidCraft's model.faces states them (exact, not from the mesh). */
export function cylinders(body: MeasuredBody): { face: string; diameter: number; axis: Vec3; origin: Vec3 }[] {
  return body.faces.faces.flatMap((face) => (face.cylinder ? [{ face: face.name, diameter: round(face.cylinder.radius * 2), axis: face.cylinder.axis, origin: face.cylinder.origin }] : []));
}
