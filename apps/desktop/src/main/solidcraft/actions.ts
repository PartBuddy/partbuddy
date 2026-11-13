import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { cutsThrough, splitPieceSteps, stepsOf, throughReach, throughTrial, type FeatureBlock } from '../../shared/blocks';
import type { ClearanceResult, DesignAction, JointSweep, JointSweepResult, MeasureItem, MeasureResult } from '../../shared/contract';
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
export type ActionPreview = { ok: true; preview: Uint8Array<ArrayBuffer> | null; unmeasured?: true } | { ok: false; error: string };

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
  async blockSteps(block: FeatureBlock, sketch: string | undefined, log: (line: string) => void): Promise<{ steps: Step[]; unmeasured: boolean }> {
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
    const steps = await this.inComponentOf(block.body, stepsOf(block, sketch, reach));
    return { steps, unmeasured: cutsThrough(block) && !reach?.every((value) => value !== null) };
  }

  apply(action: DesignAction): Promise<void> {
    return this.applySteps([commandOf(action)]);
  }

  async applySteps(steps: Step[]): Promise<void> {
    const reply = await this.batch(steps, true);
    if (reply.failed) throw new Error(`SolidCraft refused it: ${reply.failed.error}`);
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
   * So does a snap fit: parts that meet a short way before the limit and are free of each other at the limit press past
   * one another there, as a lid's bead does over the rim of its box. The limit's pose is tried in a batch that ends in
   * the failing read, so SolidCraft takes the drive back with its undo step and the joint stands where it stood
   * (0.40.1). `rollback` alone took back nothing: in the window each check left undo steps and a new revision, which
   * was mirrored and checked again without end (audit X-1, contract test "stays quiet").
   */
  async sweepJoints(sweeps: JointSweep[]): Promise<JointSweepResult> {
    if (sweeps.length === 0) return [];
    const reply = await this.batch(sweeps.map((sweep) => ({ command: 'joint.sweep', params: { ...sweep } })), false);
    if (reply.failed) throw new Error(reply.failed.error);
    const stops = sweeps.map((_, i) => sweepStopOf(reply.results?.[i]));
    for (const [i, sweep] of sweeps.entries()) {
      const stop = stops[i];
      if (!stop || sweep.index !== 0 || !snapSpan(stop.stoppedAt, sweep.to, (reply.results?.[i] as { unit?: unknown } | undefined)?.unit)) continue;
      const posed = await this.batch([{ command: 'joint.drive', params: { joint: sweep.joint, value: sweep.to, quiet: true } }, { command: 'inspect.interference', params: {} }, UNDO_ALL], true);
      // Free at the limit: what stopped the sweep is pressed past on the way there.
      if (posed.failed?.index === 2 && (posed.results?.[1] as { count?: unknown } | undefined)?.count === 0) stops[i] = null;
    }
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
 * How close to its limit a contact must lie to be a snap fit rather than a stop: a bead's way over a rim, not a part in
 * the way. Nearer than `REACHED` it reached the limit anyway (the light's own rule), and nothing needs trying.
 */
const SNAP_SPAN = { deg: 6, mm: 4 };
const REACHED = { deg: 0.5, mm: 0.1 };

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
