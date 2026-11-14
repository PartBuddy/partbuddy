import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { rootOutcome, rootSteps, cutsThrough, splitPieceSteps, stepsOf, throughReach, throughTrial, type FeatureBlock } from '../../shared/blocks';
import type { ClearanceResult, DesignAction, JointSweep, JointSweepResult, MeasureItem, MeasureResult } from '../../shared/contract';
import type { ToolPrinter } from '../../shared/toolFit';
import { LIP, snapHold } from '../../shared/mechanisms';
import type { ControlRequester } from './mirror';

/**
 * Actions at the selection (M1b-2, decided 2026-11-04): one click and a number instead of a
 * sentence to the assistant. Each maps to one SolidCraft command that takes points on the picked
 * edges or faces, so no index has to match between PartBuddy's mesh and SolidCraft's B-rep.
 * Previews run like the dimension field's tries (ADR 0017): the command, an export, and a failing
 * read that makes SolidCraft undo the batch.
 */

type Step = { command: string; params: Record<string, unknown> };

const UNDO_ALL: Step = { command: 'sketch.inspect', params: { sketch: 2147483647 } };
const mm = (value: number) => `${Number(value.toFixed(6))} mm`;

/**
 * The SolidCraft command of an action (checked with SolidCraft 0.30.1 on 2026-11-04), on the picked body alone (audit G6).
 * Measured with SolidCraft 0.40.1 on 2026-11-13, two boxes of 20 mm side by side: on the edge they share, `solid.fillet`
 * and `solid.chamfer` are refused without `body` and round the named one with it; `solid.shell` hollows the first body
 * at a shared face unless `body` names one; `solid.hole` drills the one `targets` names; `solid.press_pull` takes no
 * body and cut 25 mm deep through the first box into the second, so an extrusion is `solid.extrude` from the face of the
 * body (`face_body`) into it alone (`targets`), which on a free face takes and adds what press-pull did (7200 / 8800 mm³).
 */
export function commandOf(action: DesignAction): Step {
  const body = action.body;
  switch (action.action) {
    case 'fillet':
      return { command: 'solid.fillet', params: { edges: action.points, radius: mm(action.size), body } };
    case 'chamfer':
      return { command: 'solid.chamfer', params: { edges: action.points, distance: mm(action.size), body } };
    case 'extrude':
      // Positive adds material, negative cuts.
      return {
        command: 'solid.extrude',
        params: { face: action.points[0], face_body: body, distance: mm(action.size), operation: action.size > 0 ? 'join' : 'cut', targets: [body] },
      };
    case 'hole':
      return {
        command: 'solid.hole',
        params: { position: action.points[0], diameter: mm(action.size), ...(action.depth ? { depth: mm(action.depth) } : {}), targets: [body] },
      };
    case 'shell':
      return { command: 'solid.shell', params: { faces: action.points, thickness: mm(action.size), body } };
  }
}

/** The component that holds a body, from `component.list`; 0 (the design itself) while the body is no component. */
export function componentOf(listing: unknown, body: string): number {
  const components = (listing as { components?: unknown } | undefined)?.components;
  if (!Array.isArray(components)) return 0;
  const found = (components as { id?: unknown; parent?: unknown; bodies?: unknown }[]).find((entry) => entry.parent !== null && Array.isArray(entry.bodies) && entry.bodies.includes(body));
  return Number.isInteger(found?.id) ? (found?.id as number) : 0;
}

interface BatchReply {
  results?: unknown[];
  failed?: { index: number; command: string; error: string };
}

/** `unmeasured`: a function block's cut goes through all of its body, as its reach could not be measured (audit W2). */
export type ActionPreview = { ok: true; preview: Uint8Array<ArrayBuffer> | null; unmeasured?: true; root?: { applied: number | null; wanted: number } } | { ok: false; error: string };

export class ActionService {
  constructor(
    private readonly engine: () => ControlRequester,
    private readonly cacheDir: string,
  ) {}

  private batch(commands: Step[], rollback: boolean): Promise<BatchReply> {
    return this.engine().request<BatchReply>('engine.batch', { commands, rollback, allow_paths: [this.cacheDir] }, 10 * 60 * 1000);
  }

  /** Builds the action on trial and exports the body for the ghost; SolidCraft's refusal comes back as text. */
  preview(action: DesignAction): Promise<ActionPreview> {
    return this.previewSteps([commandOf(action)], action.body);
  }

  /** Builds commands on trial and exports the body for the ghost (actions, function blocks F1). */
  async previewSteps(steps: Step[], body: string | string[]): Promise<ActionPreview> {
    const file = join(this.cacheDir, `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.3mf`);
    try {
      const reply = await this.batch(
        [...steps, { command: 'file.export', params: { path: file, format: '3mf-tagged', bodies: typeof body === 'string' ? [body] : body, quality: 'standard' } }, UNDO_ALL],
        true,
      );
      if (reply.failed?.index !== steps.length + 1) return { ok: false, error: (reply.failed?.error ?? 'SolidCraft did not build it').slice(0, 300) };
      return { ok: true, preview: new Uint8Array(await readFile(file)) };
    } finally {
      await rm(file, { force: true });
    }
  }

  /** Steps on trial: SolidCraft takes them back and gives what they answered; null when one of them failed. */
  async trial(steps: Step[]): Promise<unknown[] | null> {
    const reply = await this.batch([...steps, UNDO_ALL], true);
    return reply.failed?.index === steps.length ? (reply.results ?? []).slice(0, steps.length) : null;
  }

  /**
   * A block's steps in its body's component; a cut "through" with its reach found on trial, through the wall at its point
   * alone (audit W2). `unmeasured` when the reach could not be found: then it goes through all of the body on its line,
   * far walls too, and the form must say so. SolidCraft's refusal and an engine error are told apart in the log.
   */
  async blockSteps(block: FeatureBlock, sketch: string | undefined, log: (line: string) => void, printer?: ToolPrinter): Promise<{ steps: Step[]; unmeasured: boolean }> {
    let reach: (number | null)[] | undefined;
    if (cutsThrough(block)) {
      try {
        const tried = await this.trial(await this.inComponentOf(block.body, throughTrial(block)));
        const measured = tried?.findLast((result) => Array.isArray((result as { bodies?: unknown } | undefined)?.bodies));
        reach = measured ? throughReach(block, measured) : undefined;
        if (!tried) log(`Warning: ${block.block} on ${block.body}: SolidCraft refused the trial of its reach; it goes through all of the body`);
        else if (!reach?.every((value) => value !== null)) log(`Warning: ${block.block} on ${block.body}: no wall of the body at a point (within 0.05 mm); it goes through all of the body there`);
      } catch (cause) {
        log(`Warning: ${block.block} on ${block.body}: the trial of its reach failed (${(cause as Error).message.slice(0, 200)}); it goes through all of the body`);
      }
    }
    const steps = await this.inComponentOf(block.body, stepsOf(block, sketch, reach, printer));
    return { steps, unmeasured: cutsThrough(block) && !reach?.every((value) => value !== null) };
  }

  async apply(action: DesignAction): Promise<void> {
    await this.applySteps([commandOf(action)]);
  }

  /** Builds the steps for real; SolidCraft's warnings come back, for the caller to log (review of BC-17 S4: they were dropped). */
  async applySteps(steps: Step[]): Promise<string[]> {
    const reply = await this.batch(steps, true);
    if (reply.failed) throw new Error(`SolidCraft refused it: ${reply.failed.error}`);
    return (reply.results ?? []).flatMap((result) => {
      const warning = (result as { warning?: unknown } | undefined)?.warning;
      return typeof warning === 'string' ? [warning.slice(0, 300)] : [];
    });
  }

  /**
   * The radius a snap fit's root gets after its steps, tried and taken back (audit MV-10): the radius asked, a smaller one where
   * the face ends closer, or null where SolidCraft refuses the fillet or one of the steps.
   */
  async rootOf(block: Extract<FeatureBlock, { block: 'snapFit' }>, steps: Step[]): Promise<number | null> {
    const results = await this.trial([...steps, ...rootSteps(block)]);
    return results ? rootOutcome(block, results.slice(-3)) : null;
  }

  /**
   * Steps for a body, with the body's component active around them when they sketch. A sketch made
   * at the design level and extruded into a body that is a component stays in the world: once a
   * joint moves the body, a slot or an engraving is gone from it and comes back at 0 (SolidCraft
   * 0.40.0-rc.3, checked 2026-11-10). With the component active it moves along, built at any pose;
   * the plane stays in world coordinates. Commands that pick by a point (fillet, hole, press-pull)
   * find the component themselves, so they cost no extra request.
   */
  async inComponentOf(body: string, steps: Step[]): Promise<Step[]> {
    if (body === '' || !steps.some((step) => step.command === 'sketch.create')) return steps;
    const reply = await this.batch([{ command: 'component.list', params: {} }], false);
    const component = componentOf(reply.results?.[0], body);
    if (component === 0) return steps;
    return [{ command: 'component.activate', params: { component } }, ...steps, { command: 'component.activate', params: { component: 0 } }];
  }

  /** Engine commands in one batch without rolling back; SolidCraft's refusal throws (reading, moving a logo). */
  async run(commands: Step[]): Promise<unknown[]> {
    const reply = await this.batch(commands, false);
    if (reply.failed) throw new Error(`SolidCraft refused it: ${reply.failed.error}`);
    return reply.results ?? [];
  }

  /** The names of the design's sketches (`document.inspect`). */
  async sketchNames(): Promise<string[]> {
    const reply = await this.batch([{ command: 'document.inspect', params: {} }], false);
    const sketches = ((reply.results?.[0] ?? {}) as { sketches?: { name?: unknown }[] }).sketches ?? [];
    return sketches.flatMap((sketch) => (typeof sketch.name === 'string' ? [sketch.name] : []));
  }

  /**
   * Gives the pieces a cut split off their colour: SolidCraft names them "<body> (2)" and so on,
   * without the colour the body had (a logo in colours). Returns how many it coloured.
   */
  async colourSplitPieces(layers: { body: string; fill: string }[]): Promise<number> {
    const reply = await this.batch([{ command: 'document.inspect', params: {} }], false);
    const steps = splitPieceSteps(layers, reply.results?.[0]);
    if (steps.length > 0) await this.applySteps(steps);
    return steps.length;
  }

  /** Distance and angle between two selections, or the size of one (`inspect.measure`). */
  async measure(items: MeasureItem[]): Promise<MeasureResult> {
    const reply = await this.batch([{ command: 'inspect.measure', params: { items } }], false);
    if (reply.failed) throw new Error(reply.failed.error);
    const result = (reply.results?.[0] ?? {}) as { distance_mm?: unknown; angle_deg?: unknown };
    return {
      distance: typeof result.distance_mm === 'number' ? result.distance_mm : null,
      angle: typeof result.angle_deg === 'number' ? result.angle_deg : null,
    };
  }

  /**
   * Runs each joint value to a limit on a copy of the design (`joint.sweep`, ADR 0027); a sweep SolidCraft refuses counts as run through.
   * So does a snap fit: parts that meet a short way before the limit, press past one another no deeper than a snap's catch
   * and are free of each other at the limit, as a lid's bead does over the rim of its box. Anything deeper in the way is a
   * stop, however close to the limit (audit D11). The poses are tried in one batch that ends in the failing read, so
   * SolidCraft takes every drive back with its undo step and the joint stands where it stood (0.40.1); a failure on the
   * way takes them back the same way, and the stop is kept and logged (audit G4). `rollback` alone took back nothing: in
   * the window each check left undo steps and a new revision, which was mirrored and checked again without end (audit
   * X-1, contract test "stays quiet").
   */
  async sweepJoints(sweeps: JointSweep[], log: (line: string) => void = () => undefined): Promise<JointSweepResult> {
    if (sweeps.length === 0) return [];
    const reply = await this.batch(sweeps.map((sweep) => ({ command: 'joint.sweep', params: { ...sweep } })), false);
    if (reply.failed) throw new Error(reply.failed.error);
    const stops = sweeps.map((_, i) => sweepStopOf(reply.results?.[i]));
    let tried = 0;
    const left: string[] = [];
    for (const [i, sweep] of sweeps.entries()) {
      const stop = stops[i];
      const unit = (reply.results?.[i] as { unit?: unknown } | undefined)?.unit;
      if (!stop || !snapSpan(stop.stoppedAt, sweep.to, unit)) continue;
      // Each try costs five interference reads (about 0.1 s each on the hinged box): past the cap the stop is reported.
      if (tried++ >= SNAP_TRIES) {
        left.push(`${String(sweep.joint)}/${String(sweep.index)}`);
        continue;
      }
      const poses = snapPoses(stop.stoppedAt, sweep.to, unit);
      const drive = (value: number) => ({ command: 'joint.drive', params: { joint: sweep.joint, index: sweep.index, value, quiet: true } });
      const steps = [...poses.flatMap((value) => [drive(value), { command: 'inspect.interference', params: {} }]), UNDO_ALL];
      const what = `joint ${String(sweep.joint)} value ${String(sweep.index)}: ${stop.a} meets ${stop.b} at ${String(stop.stoppedAt)} on the way to ${String(sweep.to)}`;
      const posed = await this.batch(steps, true);
      if (posed.failed?.index !== steps.length - 1) {
        const why = posed.failed ? `${posed.failed.command}: ${posed.failed.error.slice(0, 200)}` : 'the batch did not end in its failing read';
        log(`Warning: ${what}: the snap fit could not be tried (${why}); the stop is reported`);
        continue;
      }
      const depths = poses.map((_, k) => overlapDepth(posed.results?.[k * 2 + 1]));
      const passing = depths.slice(0, -1);
      // Not free at the limit: the stop stands, as before.
      if (depths.at(-1) !== 0) continue;
      if (passing.some((depth) => depth === null)) {
        log(`Warning: ${what}: SolidCraft's interference on the way could not be read; the stop is reported`);
        continue;
      }
      // Through no deeper than a snap's catch on the way, and free at the limit: what stopped the sweep is a snap fit.
      const deepest = Math.max(...passing.map((depth) => depth ?? Infinity));
      if (deepest > 0 && deepest <= SNAP_CATCH + 1e-9) stops[i] = null;
    }
    if (left.length > 0) log(`Warning: ${String(left.length)} more stops near a limit were not tried as snap fits (at most ${String(SNAP_TRIES)} per call of joint runs) and are reported: joint/value ${left.slice(0, 20).join(', ')}`);
    return stops;
  }

  /**
   * Overlaps and gaps narrower than `gap` between bodies (`inspect.clearance`, plan step F2). Mesh
   * bodies are not measured; SolidCraft lists them as unchecked, and the check says so.
   */
  async clearance(bodies: string[], gap: number): Promise<ClearanceResult> {
    const reply = await this.batch([{ command: 'inspect.clearance', params: { bodies, clearance: gap } }], false);
    if (reply.failed) throw new Error(reply.failed.error);
    return clearanceOf(reply.results?.[0]);
  }
}

/**
 * How close to its limit a contact must lie to be tried as a snap fit: a bead's way over a rim. Nearer than `REACHED` it
 * reached the limit anyway (the light's own rule), and nothing needs trying. Within the span it is a snap fit only when
 * what passes is no deeper than `SNAP_CATCH` (sweepJoints): the span says where to look, the overlap decides (audit D11).
 */
const SNAP_SPAN = { deg: 6, mm: 4 };
const REACHED = { deg: 0.5, mm: 0.1 };
/**
 * The deepest overlap a snap fit presses past (mm): the deeper catch of PartBuddy's own snaps, the bead of the closure
 * (`LIP.bead`, 0.5 mm proud) or the snap hook's catch less the room its arm stands off the wall (`SNAP.catch` − `SNAP.gap`,
 * 0.6 mm; mechanisms.ts). Measured with SolidCraft 0.40.1 on 2026-11-13: the template's hinged box 0.29 to 0.33 mm, a lid
 * pushed onto its base over a hook of snapSteps 0.600 mm from 10 to 1 mm before closed.
 * shortcut: a snap-fit block the user gave a deeper catch (`catchDepth` over 0.6 mm) reads as a stop near a limit; take
 * the catches of the design's own blocks into the rule if that turns up.
 */
export const SNAP_CATCH = Math.max(LIP.bead, snapHold());
/** How many stops near a limit one call of joint runs (up to 40, report.ts) tries as snap fits; the rest are reported and logged. */
export const SNAP_TRIES = 8;

/**
 * Where a snap fit is tried: just past the contact, at a quarter, half and three quarters of the way, and at the limit.
 * shortcut: a part in the way that is passed between two of these poses is not seen; the stop is then reported, as no
 * pose found the snap. Sample finer if a snap fit with a short way reads as a stop.
 */
export function snapPoses(stoppedAt: number, to: number, unit: unknown): number[] {
  const near = Math.sign(to - stoppedAt) * (unit === 'mm' ? REACHED.mm : REACHED.deg);
  const at = (value: number) => Math.round(value * 1e6) / 1e6;
  return [at(stoppedAt + near), ...[0.25, 0.5, 0.75].map((share) => at(stoppedAt + (to - stoppedAt) * share)), to];
}

/**
 * How deep two parts overlap in an `inspect.interference` answer (0.40.1: `{count, interferences: [{a, b, bbox, volume_mm3}]}`):
 * the thinnest side of the deepest overlap's box, 0 when they are free, null when the answer cannot be read.
 * shortcut: the box lies along the world axes, so an overlap that runs at a slant reads thicker than it is and is kept as
 * a stop; and its thinnest side is what is read, so a part thinner than a catch (a web of 0.5 mm, a pin of 0.4 mm) that
 * goes deep into another reads as a snap fit. Measure the overlap along the motion if either turns up.
 */
export function overlapDepth(result: unknown): number | null {
  const { count, interferences } = (result ?? {}) as { count?: unknown; interferences?: unknown };
  if (count === 0) return 0;
  if (!Array.isArray(interferences) || interferences.length === 0) return null;
  let deepest = 0;
  for (const item of interferences as { bbox?: { min?: unknown; max?: unknown } }[]) {
    const { min, max } = item.bbox ?? {};
    if (!isVec(min) || !isVec(max)) return null;
    deepest = Math.max(deepest, Math.min(max[0] - min[0], max[1] - min[1], max[2] - min[2]));
  }
  return deepest;
}

/** Whether a sweep that stopped at `stoppedAt` on its way to `to` stopped close enough to be a snap fit, if the limit's pose is free. */
export function snapSpan(stoppedAt: number, to: number, unit: unknown): boolean {
  const short = Math.abs(to - stoppedAt);
  return unit === 'mm' ? short > REACHED.mm && short <= SNAP_SPAN.mm : short > REACHED.deg && short <= SNAP_SPAN.deg;
}

/** SolidCraft's answer of one `joint.sweep`: the stop when two parts made it, null when it ran through or a limit or loop ended it. */
export function sweepStopOf(result: unknown): JointSweepResult[number] {
  const { stopped_at: stoppedAt, stopped_by: by } = (result ?? {}) as { stopped_at?: unknown; stopped_by?: unknown };
  if (typeof stoppedAt !== 'number' || !Number.isFinite(stoppedAt) || typeof by !== 'object' || by === null) return null;
  const { a, b, at } = by as { a?: unknown; b?: unknown; at?: unknown };
  const first = name(a);
  const second = name(b);
  return first && second && isVec(at) ? { stoppedAt, a: first, b: second, at } : null;
}

type Vec3 = [number, number, number];
const isVec = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number' && Number.isFinite(item));
const name = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null);

/** SolidCraft's answer of `inspect.clearance`, checked field by field; anything odd is left out. */
export function clearanceOf(result: unknown): ClearanceResult {
  const { overlaps, near, unchecked } = (result ?? {}) as { overlaps?: unknown; near?: unknown; unchecked?: unknown };
  const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]).slice(0, 100) : []);
  // SolidCraft lists a mesh body as {a: name, b: null, reason: "mesh body: not checked"}; any other entry is a pair it
  // did not finish (its time budget ran out), so the measure is not whole (inspect.interference/clearance, 0.40.1).
  const entries = Array.isArray(unchecked) ? (unchecked as Record<string, unknown>[]) : [];
  const mesh = (item: Record<string, unknown>) => item.b === null && typeof item.reason === 'string' && item.reason.startsWith('mesh body');
  const left = [...new Set(entries.filter(mesh).flatMap((item) => name(item.a) ?? []))].slice(0, 200);
  return {
    ...(left.length > 0 ? { unchecked: left } : {}),
    ...(entries.some((item) => !mesh(item)) ? { incomplete: true as const } : {}),
    overlaps: list(overlaps).flatMap((item) => {
      const a = name(item.a);
      const b = name(item.b);
      const box = item.bbox as { min?: unknown; max?: unknown } | undefined;
      const volume = item.volume_mm3;
      if (!a || !b || typeof volume !== 'number' || !(volume >= 0) || !isVec(box?.min) || !isVec(box.max)) return [];
      return [{ a, b, volume, box: { min: box.min, max: box.max } }];
    }),
    near: list(near).flatMap((item) => {
      const a = name(item.a);
      const b = name(item.b);
      const distance = item.distance_mm;
      if (!a || !b || typeof distance !== 'number' || !(distance >= 0) || !isVec(item.from) || !isVec(item.to)) return [];
      return [{ a, b, distance, from: item.from, to: item.to }];
    }),
  };
}
