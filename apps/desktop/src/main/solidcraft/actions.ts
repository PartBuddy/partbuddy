import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { ClearanceResult, DesignAction, MeasureItem, MeasureResult } from '../../shared/contract';
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

/** The SolidCraft command of an action (checked with SolidCraft 0.30.1 on 2026-11-04). */
export function commandOf(action: DesignAction): Step {
  switch (action.action) {
    case 'fillet':
      return { command: 'solid.fillet', params: { edges: action.points, radius: mm(action.size) } };
    case 'chamfer':
      return { command: 'solid.chamfer', params: { edges: action.points, distance: mm(action.size) } };
    case 'extrude':
      // Positive adds material, negative cuts.
      return { command: 'solid.press_pull', params: { face: action.points[0], distance: mm(action.size) } };
    case 'hole':
      return {
        command: 'solid.hole',
        params: { position: action.points[0], diameter: mm(action.size), ...(action.depth ? { depth: mm(action.depth) } : {}) },
      };
    case 'shell':
      return { command: 'solid.shell', params: { faces: action.points, thickness: mm(action.size) } };
  }
}

interface BatchReply {
  results?: unknown[];
  failed?: { index: number; command: string; error: string };
}

export type ActionPreview = { ok: true; preview: Uint8Array<ArrayBuffer> | null } | { ok: false; error: string };

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

  apply(action: DesignAction): Promise<void> {
    return this.applySteps([commandOf(action)]);
  }

  async applySteps(steps: Step[]): Promise<void> {
    const reply = await this.batch(steps, true);
    if (reply.failed) throw new Error(`SolidCraft refused it: ${reply.failed.error}`);
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
    const bodies = ((reply.results?.[0] ?? {}) as { bodies?: { name?: unknown }[] }).bodies ?? [];
    const steps = layers.flatMap((layer) => {
      const split = bodies.flatMap((body) => (typeof body.name === 'string' && body.name.startsWith(`${layer.body} (`) && /^ \(\d+\)$/.test(body.name.slice(layer.body.length)) ? [body.name] : []));
      return split.length > 0 ? [{ command: 'appearance.assign', params: { bodies: split, color: layer.fill } }] : [];
    });
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
   * Overlaps and gaps narrower than `gap` between bodies (`inspect.clearance`, plan step F2). Mesh
   * bodies are not measured; SolidCraft lists them as unchecked, which the light leaves out.
   */
  async clearance(bodies: string[], gap: number): Promise<ClearanceResult> {
    const reply = await this.batch([{ command: 'inspect.clearance', params: { bodies, clearance: gap } }], false);
    if (reply.failed) throw new Error(reply.failed.error);
    return clearanceOf(reply.results?.[0]);
  }
}

type Vec3 = [number, number, number];
const isVec = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number' && Number.isFinite(item));
const name = (value: unknown): string | null => (typeof value === 'string' && value.length > 0 && value.length <= 200 ? value : null);

/** SolidCraft's answer of `inspect.clearance`, checked field by field; anything odd is left out. */
export function clearanceOf(result: unknown): ClearanceResult {
  const { overlaps, near } = (result ?? {}) as { overlaps?: unknown; near?: unknown };
  const list = (value: unknown) => (Array.isArray(value) ? (value as Record<string, unknown>[]).slice(0, 100) : []);
  return {
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
