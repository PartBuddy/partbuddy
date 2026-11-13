import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { DesignParameter } from '../../shared/contract';
import { fitMarkOf, withoutFitMark } from '../../shared/designFit';
import type { ControlRequester } from './mirror';

/**
 * The dimension field at a selection (M1b, decided 2026-11-04): "direct where it is unambiguous,
 * the assistant where intent is needed". PartBuddy finds the parameter that drives the selected
 * edge length or radius by trying each candidate in SolidCraft and measuring the result; only when
 * exactly one candidate moves the selection to the new value does PartBuddy change it itself.
 *
 * A try runs as one `engine.batch` whose last step fails on purpose (reading a sketch that does
 * not exist): SolidCraft then undoes every step of the batch, undo history included, but still
 * returns their results (checked with SolidCraft 0.30.1 on 2026-11-04; `rollback: true` alone
 * undoes nothing when no step fails).
 */

export type DimensionTarget =
  /** Length of a B-rep edge, named like `model.edges` reports it; `point` tells apart edges with the same name. */
  | { measure: 'length'; body: string; edge: string; point: [number, number, number] }
  /** Radius of a cylindrical face (a hole, a boss or a rounded edge). */
  | { measure: 'radius'; body: string; face: string }
  /** Distance between two parallel flat faces of one body (a wall, an offset, a step). */
  | { measure: 'distance'; body: string; faces: [string, string] };

export type ProbeResult =
  | { mode: 'direct'; parameter: string; factor: 1 | 2; label: string; preview: Uint8Array<ArrayBuffer> | null }
  | { mode: 'choice'; options: { parameter: string; factor: 1 | 2; label: string }[] }
  | { mode: 'assistant'; reason: 'noDriver' };

export interface Parameter {
  name: string;
  expression: string;
  unit: string;
  value: number;
  feature?: string;
  input?: string;
  /** As SolidCraft reports it; not checked, so read it as unknown. */
  comment?: unknown;
}

interface BatchReply {
  results?: unknown[];
  failed?: { index: number; command: string; error: string };
}

/** Values within this distance count as equal (mm); SolidCraft reports lengths to about 1e-9. */
const SAME = 1e-4;
/** The failing last step that makes SolidCraft undo the whole batch. */
const UNDO_ALL = { command: 'sketch.inspect', params: { sketch: 2147483647 } };
/** Plain numbers with an optional length unit; formulas are the designer's intent and stay untouched. */
const PLAIN_NUMBER = /^\s*-?\d+(?:\.\d+)?\s*(?:mm)?\s*$/;
/** Names the contract accepts (letters, digits, underscore). */
const PARAMETER_NAME = /^[\p{L}_][\p{L}\p{N}_]{0,99}$/u;

function isParameter(entry: unknown): entry is Parameter {
  const p = entry as Partial<Parameter> | null;
  return typeof p?.name === 'string' && typeof p.expression === 'string' && typeof p.value === 'number' && typeof p.unit === 'string';
}

/**
 * Lengths in mm whose value equals the current one, or twice it for a radius (a diameter parameter). All of them are
 * tried: a cap of eight left out the driver of a design with more sizes of the same value, and the field then sent the
 * user to the assistant (audit D45).
 * shortcut: one rebuild per candidate, in SolidCraft's order; a design with dozens of equal sizes probes as many times
 * longer. Try the parameters of the selected body's features first if that is felt.
 */
export function candidatesFor(parameters: Parameter[], current: number, measure: DimensionTarget['measure']): { parameter: Parameter; factor: 1 | 2 }[] {
  const found: { parameter: Parameter; factor: 1 | 2 }[] = [];
  for (const parameter of parameters) {
    if (parameter.unit !== 'mm' || !PLAIN_NUMBER.test(parameter.expression)) continue;
    if (Math.abs(parameter.value - current) <= SAME) found.push({ parameter, factor: 1 });
    else if (measure === 'radius' && Math.abs(parameter.value - 2 * current) <= SAME) found.push({ parameter, factor: 2 });
  }
  return found;
}

function distance(a: readonly number[], b: readonly number[]): number {
  return Math.hypot((a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0));
}

/** The target's measure in a `model.edges` or `model.faces` result. */
export function measured(target: DimensionTarget, result: unknown): number | null {
  if (target.measure === 'length') {
    const edges = ((result as { edges?: unknown } | null)?.edges ?? []) as { name?: string; length?: number; mid?: number[] }[];
    // SolidCraft adds "~k" when two faces meet more than once; then the edge nearest the pick wins.
    const named = edges.filter((edge) => edge.name === target.edge || edge.name?.startsWith(`${target.edge}~`));
    const best = named.sort((a, b) => distance(a.mid ?? [], target.point) - distance(b.mid ?? [], target.point))[0];
    return typeof best?.length === 'number' ? best.length : null;
  }
  const faces = ((result as { faces?: unknown } | null)?.faces ?? []) as { name?: string; point?: number[]; plane_normal?: number[] | null; cylinder?: { radius?: number } | null }[];
  if (target.measure === 'distance') {
    const [a, b] = target.faces.map((name) => faces.find((face) => face.name === name));
    const n = a?.plane_normal;
    if (!a?.point || !b?.point || !n || n.length !== 3 || !b.plane_normal) return null;
    // Only while the faces stay parallel is the distance one number.
    const dot = n.reduce((sum, value, i) => sum + value * (b.plane_normal?.[i] ?? 0), 0);
    if (Math.abs(Math.abs(dot) - 1) > 1e-6) return null;
    return Math.abs(n.reduce((sum, value, i) => sum + value * ((b.point?.[i] ?? 0) - (a.point?.[i] ?? 0)), 0));
  }
  const radius = faces.find((face) => face.name === target.face)?.cylinder?.radius;
  return typeof radius === 'number' ? radius : null;
}

function measureStep(target: DimensionTarget) {
  return target.measure === 'length'
    ? { command: 'model.edges', params: { body: target.body } }
    : { command: 'model.faces', params: { body: target.body } };
}

const mm = (value: number) => `${Number(value.toFixed(6))} mm`;

const labelOf = (parameter: Parameter) => [parameter.feature, parameter.input].filter(Boolean).join(' · ') || parameter.name;

export class DimensionService {
  constructor(
    private readonly engine: () => ControlRequester,
    /** Folder SolidCraft may write to, for the preview export. */
    private readonly cacheDir: string,
  ) {}

  private async batch(commands: { command: string; params: Record<string, unknown> }[], rollback: boolean): Promise<BatchReply> {
    return this.engine().request<BatchReply>('engine.batch', { commands, rollback, allow_paths: [this.cacheDir] }, 60_000);
  }

  private async parameters(): Promise<Parameter[]> {
    const reply = await this.batch([{ command: 'parameters.list', params: {} }], false);
    const list = (reply.results?.[0] as { parameters?: unknown[] } | undefined)?.parameters ?? [];
    return list.filter(isParameter);
  }

  /**
   * Finds the parameter that drives the target and, when there is exactly one, a face-tagged 3MF
   * of the body with the new value for the ghost preview. Nothing in the design changes.
   */
  async probe(target: DimensionTarget, current: number, value: number): Promise<ProbeResult> {
    if (!(value > 0) || !Number.isFinite(value)) return { mode: 'assistant', reason: 'noDriver' };
    const candidates = candidatesFor(await this.parameters(), current, target.measure);
    const drivers: { parameter: Parameter; factor: 1 | 2 }[] = [];
    for (const candidate of candidates) {
      const reply = await this.batch(
        [
          { command: 'parameters.change', params: { name: candidate.parameter.name, expression: mm(value * candidate.factor) } },
          measureStep(target),
          UNDO_ALL,
        ],
        true,
      );
      // A candidate that SolidCraft refuses (out of range, breaks the model) fails at step 0 or 1.
      if (reply.failed?.index !== 2) continue;
      const after = measured(target, reply.results?.[1]);
      if (after !== null && Math.abs(after - value) <= SAME * 10) drivers.push(candidate);
    }
    if (drivers.length === 0) return { mode: 'assistant', reason: 'noDriver' };
    // Several drive it (a symmetric extrude, a mirrored size): the user says which; the preview follows the pick.
    if (drivers.length > 1) return { mode: 'choice', options: drivers.map((d) => ({ parameter: d.parameter.name, factor: d.factor, label: labelOf(d.parameter) })) };
    const [driver] = drivers as [{ parameter: Parameter; factor: 1 | 2 }];
    return {
      mode: 'direct',
      parameter: driver.parameter.name,
      factor: driver.factor,
      label: labelOf(driver.parameter),
      preview: await this.preview(target.body, driver.parameter.name, value * driver.factor),
    };
  }

  /** The body with the parameter at `value`, exported and undone again; null if SolidCraft cannot build it. */
  private async preview(body: string, parameter: string, value: number): Promise<Uint8Array<ArrayBuffer> | null> {
    const file = join(this.cacheDir, `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.3mf`);
    try {
      const reply = await this.batch(
        [
          { command: 'parameters.change', params: { name: parameter, expression: mm(value) } },
          { command: 'file.export', params: { path: file, format: '3mf-tagged', bodies: [body], quality: 'standard' } },
          UNDO_ALL,
        ],
        true,
      );
      if (reply.failed?.index !== 2) return null;
      return new Uint8Array(await readFile(file));
    } finally {
      await rm(file, { force: true });
    }
  }

  /**
   * The user parameters of the design for the parameter panel: favourites first, then in
   * SolidCraft's order. Feature inputs (`d1`, `d2`, ...) are left out; they show as dimensions.
   */
  async userParameters(): Promise<DesignParameter[]> {
    const reply = await this.batch([{ command: 'parameters.list', params: {} }], false);
    const list = (reply.results?.[0] as { parameters?: unknown[] } | undefined)?.parameters ?? [];
    const found: DesignParameter[] = [];
    for (const entry of list) {
      if (!isParameter(entry)) continue;
      const raw = entry as Parameter & { source?: unknown; comment?: unknown; favorite?: unknown; error?: unknown; used_by?: unknown };
      if (raw.source !== 'user' || !PARAMETER_NAME.test(raw.name)) continue;
      found.push({
        name: raw.name,
        expression: raw.expression.slice(0, 500),
        value: raw.value,
        unit: raw.unit.slice(0, 20),
        comment: typeof raw.comment === 'string' ? raw.comment.slice(0, 500) : '',
        favorite: raw.favorite === true,
        error: typeof raw.error === 'string' && raw.error !== '' ? raw.error.slice(0, 500) : null,
        usedBy: Array.isArray(raw.used_by) ? raw.used_by.length : 0,
        editable: raw.unit === 'mm' && PLAIN_NUMBER.test(raw.expression),
      });
    }
    return [...found.filter((entry) => entry.favorite), ...found.filter((entry) => !entry.favorite)].slice(0, 300);
  }

  /**
   * Tries `value` for a known length parameter (a dimension label in the view, M2b-3): whether
   * SolidCraft can build it, and the body for the ghost when one is named. Nothing changes.
   */
  async previewParameter(parameter: string, value: number, body: string | null): Promise<{ ok: true; preview: Uint8Array<ArrayBuffer> | null } | { ok: false; error: string }> {
    const known = (await this.parameters()).find((entry) => entry.name === parameter);
    if (!known || known.unit !== 'mm' || !PLAIN_NUMBER.test(known.expression)) return { ok: false, error: `${parameter} is not a plain length parameter` };
    if (body) {
      const preview = await this.preview(body, parameter, value);
      return preview ? { ok: true, preview } : { ok: false, error: 'SolidCraft cannot build the part with this value' };
    }
    const reply = await this.batch([{ command: 'parameters.change', params: { name: parameter, expression: mm(value) } }, UNDO_ALL], true);
    return reply.failed?.index === 1 ? { ok: true, preview: null } : { ok: false, error: (reply.failed?.error ?? 'SolidCraft refused the value').slice(0, 300) };
  }

  /**
   * Sets the parameter for real (the user pressed Enter). The name must be a parameter whose
   * value is a plain number, so a formula is never overwritten and nothing else can be set.
   */
  async apply(parameter: string, value: number, factor: 1 | 2, keepFitMark = false): Promise<void> {
    if (!(value > 0) || !Number.isFinite(value)) throw new Error('the value must be a positive length');
    const known = (await this.parameters()).find((entry) => entry.name === parameter);
    if (!known || known.unit !== 'mm' || !PLAIN_NUMBER.test(known.expression)) throw new Error(`${parameter} is not a plain length parameter`);
    // A size the user sets is theirs from now on: it loses the assistant's mark, and a printer change no longer moves it.
    const comment = !keepFitMark && typeof known.comment === 'string' && fitMarkOf(known.comment) ? { comment: withoutFitMark(known.comment) } : {};
    const reply = await this.batch([{ command: 'parameters.change', params: { name: parameter, expression: mm(value * factor), ...comment } }], true);
    if (reply.failed) throw new Error(`SolidCraft refused the value: ${reply.failed.error}`);
  }
}
