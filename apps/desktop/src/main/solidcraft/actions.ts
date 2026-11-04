import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { DesignAction, MeasureItem, MeasureResult } from '../../shared/contract';
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
  async preview(action: DesignAction): Promise<ActionPreview> {
    const file = join(this.cacheDir, `action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.3mf`);
    try {
      const reply = await this.batch(
        [commandOf(action), { command: 'file.export', params: { path: file, format: '3mf-tagged', bodies: [action.body], quality: 'standard' } }, UNDO_ALL],
        true,
      );
      if (reply.failed?.index !== 2) return { ok: false, error: (reply.failed?.error ?? 'SolidCraft did not build it').slice(0, 300) };
      return { ok: true, preview: new Uint8Array(await readFile(file)) };
    } finally {
      await rm(file, { force: true });
    }
  }

  async apply(action: DesignAction): Promise<void> {
    const reply = await this.batch([commandOf(action)], true);
    if (reply.failed) throw new Error(`SolidCraft refused it: ${reply.failed.error}`);
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
}
