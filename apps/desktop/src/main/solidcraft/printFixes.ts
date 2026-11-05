import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { PrintFix } from '../../shared/contract';
import type { ActionPreview } from './actions';
import type { ControlRequester } from './mirror';

/**
 * Fixes for support at the light (M7f step 2, decided 2026-11-05), built from SolidCraft commands
 * checked headless with SolidCraft 0.30.1 on 2026-11-05:
 * - chamfer: the fillet keeps the edges that do not face the bed (`timeline.edit` with the rest of
 *   its `edges`, or `timeline.delete` when none is left), and those edges get a chamfer of the
 *   fillet's size (`solid.chamfer`, the radius's expression as the distance);
 * - bridge: two sketches on the step of a counterbore facing the bed, a slot as wide as the hole cut
 *   one layer deep and a square cut two layers deep (stepped bridging);
 * - ribs: support walls standing on the bed, a vertical sketch each extruded symmetrically, one
 *   body each (`Print support <n>`);
 * - roof: a sketch across the hole at its start (`sketch.create` with an explicit plane), the roof
 *   outline (`sketch.line` closed) and a cut along the hole (`solid.extrude` with `operation: cut`).
 * Previews run like the actions' (ADR 0017): the commands, an export, and a failing read that
 * makes SolidCraft undo the batch.
 */

type Step = { command: string; params: Record<string, unknown> };

/** The support walls joined into one body for the ghost only; the preview is undone. */
const PREVIEW_BODY = 'Print support preview';
const UNDO_ALL: Step = { command: 'sketch.inspect', params: { sketch: 2147483647 } };
const mm = (value: number) => `${Number(value.toFixed(6))} mm`;

interface BatchReply {
  results?: unknown[];
  failed?: { index: number; command: string; error: string };
}

type Point = [number, number, number];
const isPoint = (value: unknown): value is Point => Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === 'number' && Number.isFinite(v));
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

type Triangle = [Point, Point, Point];
const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Point, b: Point) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const along = (a: Point, d: Point, t: number): Point => [a[0] + d[0] * t, a[1] + d[1] * t, a[2] + d[2] * t];

/** The distance from a point to a triangle (closest point by its region, Ericson 5.1.5). */
export function pointTriangleDistance(p: Point, [a, b, c]: Triangle): number {
  const ab = sub(b, a);
  const ac = sub(c, a);
  const ap = sub(p, a);
  const d1 = dot(ab, ap);
  const d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return distance(p, a);
  const bp = sub(p, b);
  const d3 = dot(ab, bp);
  const d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return distance(p, b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return distance(p, along(a, ab, d1 / (d1 - d3)));
  const cp = sub(p, c);
  const d5 = dot(ab, cp);
  const d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return distance(p, c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return distance(p, along(a, ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return distance(p, along(b, sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  const v = vb * denom;
  const w = vc * denom;
  return distance(p, [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}

/**
 * Which edges of a fillet's definition the faces belong to: each face takes the edge point closest
 * to its surface (an edge point lies on the old sharp edge, right beside its own blend).
 */
export function edgesOfFaces(edges: readonly Point[], faces: readonly (readonly Triangle[])[]): Set<number> {
  const picked = new Set<number>();
  for (const triangles of faces) {
    let best = -1;
    let bestDistance = Infinity;
    edges.forEach((edge, i) => {
      for (const triangle of triangles) {
        const d = pointTriangleDistance(edge, triangle);
        if (d < bestDistance) {
          bestDistance = d;
          best = i;
        }
      }
    });
    if (best >= 0) picked.add(best);
  }
  return picked;
}

/** The fillet definition `timeline.inspect` returns, read as untrusted input. */
export function filletOf(inspected: unknown): { edges: Point[]; radius: string } {
  const reply = (inspected ?? {}) as { type?: unknown; definition?: { edges?: unknown; radius?: unknown; type?: unknown } };
  if (reply.type !== 'fillet') throw new Error('that feature is no fillet');
  const definition = reply.definition ?? {};
  if (definition.type !== undefined && definition.type !== 'constant') throw new Error('only fillets with one radius can become chamfers');
  const edges = Array.isArray(definition.edges) ? definition.edges : [];
  if (edges.length === 0 || !edges.every(isPoint)) throw new Error('the fillet names its edges in a way PartBuddy cannot follow');
  const radius = typeof definition.radius === 'number' ? mm(definition.radius) : typeof definition.radius === 'string' ? definition.radius.slice(0, 200) : null;
  if (!radius) throw new Error('the fillet has no radius');
  return { edges, radius };
}

export class PrintFixService {
  constructor(
    private readonly engine: () => ControlRequester,
    private readonly cacheDir: string,
  ) {}

  private batch(commands: Step[], rollback: boolean): Promise<BatchReply> {
    return this.engine().request<BatchReply>('engine.batch', { commands, rollback, allow_paths: [this.cacheDir] }, 10 * 60 * 1000);
  }

  /**
   * The commands of a fix; a chamfer reads its fillets first. Support walls become one body each
   * when applied; for the ghost, which shows one body, they are joined into one.
   */
  async steps(fix: PrintFix, preview = false): Promise<Step[]> {
    if (fix.fix === 'ribs') {
      return fix.ribs.flatMap((rib, i) => [
        { command: 'sketch.create', params: { plane: { origin: rib.origin, x_dir: rib.xDir, y_dir: rib.yDir }, name: 'Print support' } },
        { command: 'sketch.line', params: { points: rib.points, closed: true } },
        {
          command: 'solid.extrude',
          params:
            preview && i > 0
              ? { distance: mm(rib.thickness), direction: 'symmetric', operation: 'join', targets: [PREVIEW_BODY], name: 'Print support' }
              : { distance: mm(rib.thickness), direction: 'symmetric', operation: 'new', body_name: preview ? PREVIEW_BODY : `Print support ${String(fix.first + i)}`, name: 'Print support' },
        },
      ]);
    }
    if (fix.fix === 'bridge') {
      return fix.bridges.flatMap((bridge) => {
        const plane = { plane: { origin: bridge.origin, x_dir: bridge.xDir, y_dir: bridge.yDir }, name: 'Print bridge' };
        return [
          { command: 'sketch.create', params: plane },
          { command: 'sketch.line', params: { points: bridge.slot, closed: true } },
          { command: 'solid.extrude', params: { distance: mm(bridge.slotDepth), operation: 'cut', targets: [fix.body], name: 'Print bridge' } },
          { command: 'sketch.create', params: plane },
          { command: 'sketch.line', params: { points: bridge.square, closed: true } },
          { command: 'solid.extrude', params: { distance: mm(bridge.squareDepth), operation: 'cut', targets: [fix.body], name: 'Print bridge' } },
        ];
      });
    }
    if (fix.fix === 'roof') {
      return fix.roofs.flatMap((roof) => [
        { command: 'sketch.create', params: { plane: { origin: roof.origin, x_dir: roof.xDir, y_dir: roof.yDir }, name: 'Print roof' } },
        { command: 'sketch.line', params: { points: roof.points, closed: true } },
        { command: 'solid.extrude', params: { distance: mm(roof.length), operation: 'cut', targets: [fix.body], name: 'Print roof' } },
      ]);
    }
    const reply = await this.batch(
      fix.fillets.map(({ feature }) => ({ command: 'timeline.inspect', params: { feature } })),
      false,
    );
    if (reply.failed) throw new Error(reply.failed.error);
    return fix.fillets.flatMap(({ feature, faces }, i) => {
      const { edges, radius } = filletOf(reply.results?.[i]);
      const moved = edgesOfFaces(edges, faces);
      const keep = edges.filter((_, e) => !moved.has(e));
      const away = edges.filter((_, e) => moved.has(e));
      return [
        keep.length > 0 ? { command: 'timeline.edit', params: { feature, set: { edges: keep } } } : { command: 'timeline.delete', params: { feature } },
        { command: 'solid.chamfer', params: { edges: away, distance: radius, body: fix.body } },
      ];
    });
  }

  /** Builds the fix on trial and exports the body for the ghost; SolidCraft's refusal comes back as text. */
  async preview(fix: PrintFix): Promise<ActionPreview> {
    const file = join(this.cacheDir, `fix-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.3mf`);
    try {
      const steps = await this.steps(fix, true);
      const shown = fix.fix === 'ribs' ? PREVIEW_BODY : fix.body;
      const reply = await this.batch([...steps, { command: 'file.export', params: { path: file, format: '3mf-tagged', bodies: [shown], quality: 'standard' } }, UNDO_ALL], true);
      if (reply.failed?.index !== steps.length + 1) return { ok: false, error: (reply.failed?.error ?? 'SolidCraft did not build it').slice(0, 300) };
      return { ok: true, preview: new Uint8Array(await readFile(file)) };
    } catch (error) {
      return { ok: false, error: (error as Error).message.slice(0, 300) };
    } finally {
      await rm(file, { force: true });
    }
  }

  async apply(fix: PrintFix): Promise<void> {
    const reply = await this.batch(await this.steps(fix), true);
    if (reply.failed) throw new Error(`SolidCraft refused it: ${reply.failed.error}`);
  }
}
