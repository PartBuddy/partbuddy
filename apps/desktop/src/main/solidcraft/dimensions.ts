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
  /** The parameters whose expressions name this one (`parameters.list`); not checked. */
  used_by?: unknown;
}

interface BatchReply {
  results?: unknown[];
  failed?: { index: number; command: string; error: string };
}

/** Values within this distance count as equal (mm); SolidCraft reports lengths to about 1e-9. */
const SAME = 1e-4;
/** The failing last step that makes SolidCraft undo the whole batch. */
const UNDO_ALL = { command: 'sketch.inspect', params: { sketch: 2147483647 } };
/** How many selections keep what their search found; the oldest is dropped. */
const KEPT_PROBES = 20;
/**
 * How far a group test moves each candidate (mm): a twentieth of a millimetre, times 1 + √p / 10 for the k-th prime p.
 * Square roots of different primes are no rational multiples of one another, so the moves of several drivers changed
 * together do not cancel out exactly as long as each moves the selection by a rational multiple of its own change. They
 * can come close: two opposite drivers of the same lever at neighbouring primes leave 0.005 × (√q − √p), 0.0009 mm for 29 and 31,
 * 0.0007 for 229 and 233; so the group test counts any move over `SAME` (1e-4). Drivers of different levers (1 and ½:
 * a size and a diameter) can come closer with fewer candidates.
 * shortcut: twin primes above about 2500 (some 370 candidates of one size), or drivers of different levers, can leave less
 * than `SAME`; measure the selection before the change in the same batch and split such groups if it ever matters.
 */
const NUDGE = 0.05;
/** Plain numbers with an optional length unit; formulas are the designer's intent and stay untouched. */
const PLAIN_NUMBER = /^\s*-?\d+(?:\.\d+)?\s*(?:mm)?\s*$/;
/** Names the contract accepts (letters, digits, underscore). */
const PARAMETER_NAME = /^[\p{L}_][\p{L}\p{N}_]{0,99}$/u;

function isParameter(entry: unknown): entry is Parameter {
  const p = entry as Partial<Parameter> | null;
  return typeof p?.name === 'string' && typeof p.expression === 'string' && typeof p.value === 'number' && typeof p.unit === 'string';
}

/**
 * Lengths in mm whose value equals the current one, or twice it for a radius (a diameter parameter). None is left out: a
 * cap of eight lost the driver of a design with more sizes of the same value, and the field then sent the user to the
 * assistant (audit D45). How they are told apart without a rebuild for each: DimensionService.probe.
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

type Candidate = { parameter: Parameter; factor: 1 | 2 };

/** The feature ids in a target's face and edge names: `F12:side|F1:+z` → 12 and 1 (engineering-notes.md: the feature id in the face name). */
export function featureIds(target: DimensionTarget): Set<number> {
  const names = target.measure === 'length' ? target.edge.split('|') : target.measure === 'radius' ? [target.face] : target.faces;
  return new Set(names.flatMap((name) => /^F(\d+)/.exec(name)?.slice(1).map(Number) ?? []));
}

/**
 * The candidates in three groups, each in SolidCraft's order: the inputs of a feature the selection lies on (by the
 * timeline's ids and names), then user parameters such a feature uses (`used_by`), then the rest. The first are the
 * likely drivers and are told apart first; the rest are still searched (a cut shortens an edge of the box it cuts).
 */
export function nearFirst(candidates: Candidate[], target: DimensionTarget, parameters: Parameter[], timeline: { id: number; name: string }[]): [Candidate[], Candidate[], Candidate[]] {
  const ids = featureIds(target);
  const features = new Set(timeline.filter((item) => ids.has(item.id)).map((item) => item.name));
  const featureOfParameter = new Map(parameters.map((parameter) => [parameter.name, parameter.feature]));
  const own = ({ parameter }: Candidate) => parameter.feature !== undefined && features.has(parameter.feature);
  const used = ({ parameter }: Candidate) => !own({ parameter, factor: 1 }) && Array.isArray(parameter.used_by) && parameter.used_by.some((name) => typeof name === 'string' && features.has(featureOfParameter.get(name) ?? ''));
  return [candidates.filter(own), candidates.filter(used), candidates.filter((candidate) => !own(candidate) && !used(candidate))];
}

/** The k-th prime, k from 0 (2, 3, 5, …): the nudges of a group test are told apart by their square roots. */
const PRIMES: number[] = [];
function prime(k: number): number {
  for (let n = (PRIMES.at(-1) ?? 1) + 1; PRIMES.length <= k; n += 1) if (PRIMES.every((p) => n % p !== 0)) PRIMES.push(n);
  return PRIMES[k] ?? 2;
}

/** A group of candidates still to be told apart. `moves`: one of them is known to move the selection; `then`: the other half of its split, which moves when this one does not. */
type Group = { members: Candidate[]; moves: boolean; then?: Group };

/** What one selection's search knows: drivers found, candidates to try again at the next value, groups not yet told apart. */
interface Search {
  key: string;
  state: string;
  target: DimensionTarget;
  current: number;
  value: number;
  candidates: Candidate[];
  drivers: Candidate[];
  open: Candidate[];
  queue: Group[];
  running: boolean;
  /** A try found the design changed: the search is of a design that is gone. */
  stale?: boolean;
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

/** What tells one design from another, read at the start of a batch (DimensionService.design). */
const READ_DESIGN = [
  { command: 'parameters.list', params: {} },
  { command: 'document.inspect', params: {} },
];

/**
 * The parameters, the timeline and the state of a design from the first two results of a batch (`READ_DESIGN`): the
 * parameters with their expressions and the timeline with what is suppressed or rolled back. A probe's own tries are
 * undone, so they leave both as they were.
 */
function designOf(results: unknown[] | undefined): { parameters: Parameter[]; state: string; timeline: { id: number; name: string }[] } {
  const list = (results?.[0] as { parameters?: unknown[] } | undefined)?.parameters ?? [];
  const parameters = list.filter(isParameter);
  const inspected = (results?.[1] ?? {}) as { timeline?: unknown; marker?: unknown };
  const items = Array.isArray(inspected.timeline) ? (inspected.timeline as Record<string, unknown>[]) : [];
  const timeline = items.flatMap((item) => (typeof item.id === 'number' && typeof item.name === 'string' ? [{ id: item.id, name: item.name }] : []));
  const shape = Array.isArray(inspected.timeline) ? items.map((item) => [item.id, item.name, item.suppressed, item.rolled_back]) : null;
  return { parameters, timeline, state: JSON.stringify([parameters.map((p) => [p.name, p.expression, p.value]), shape, inspected.marker ?? null]) };
}

export class DimensionService {
  constructor(
    private readonly engine: () => ControlRequester,
    /** Folder SolidCraft may write to, for the preview export. */
    private readonly cacheDir: string,
    /**
     * Runs one step of a search after the answer, behind every trial queued by then (supervisor), again while it says
     * there is more; without it the search is finished before the answer.
     */
    private readonly later?: (step: () => Promise<boolean>) => void,
  ) {}

  private async batch(commands: { command: string; params: Record<string, unknown> }[], rollback: boolean): Promise<BatchReply> {
    return this.engine().request<BatchReply>('engine.batch', { commands, rollback, allow_paths: [this.cacheDir] }, 60_000);
  }

  private async parameters(): Promise<Parameter[]> {
    return (await this.design()).parameters;
  }

  /** The parameters, and what tells this design from a changed one (`designOf`). */
  private async design(): Promise<{ parameters: Parameter[]; state: string; timeline: { id: number; name: string }[] }> {
    const reply = await this.batch(READ_DESIGN, false);
    return designOf(reply.results);
  }

  /**
   * A try of a search: the design read and the steps in ONE batch, then undone (`UNDO_ALL`). The assistant's calls do not
   * wait for the probes (supervisor), so a design read in a batch of its own may already be another when the try runs;
   * read in the same batch, a try on a changed design is never taken for the selection's (review of BC-08, S2). Gives the
   * steps' results, `refused` when SolidCraft did not build them, `changed` when the design is no longer the search's.
   */
  private async attempt(search: Search, steps: { command: string; params: Record<string, unknown> }[]): Promise<unknown[] | 'refused' | 'changed'> {
    const reply = await this.batch([...READ_DESIGN, ...steps, UNDO_ALL], true);
    const results = reply.results ?? [];
    // SolidCraft could not read the design: its own error, not a changed design.
    if (reply.failed && reply.failed.index < READ_DESIGN.length) throw new Error(`SolidCraft could not read the design: ${reply.failed.error.slice(0, 200)}`);
    if (designOf(results).state !== search.state) {
      // The search is of a design that is gone: it stops and is not kept.
      search.stale = true;
      search.queue = [];
      this.searches.delete(search.key);
      return 'changed';
    }
    return reply.failed?.index === READ_DESIGN.length + steps.length ? results.slice(READ_DESIGN.length) : 'refused';
  }

  /** The searches per selection, its current size and the design as it was; the selection probed last is the live one. */
  private readonly searches = new Map<string, Search>();
  private live = '';

  /**
   * Finds the parameter that drives the target and, when there is exactly one, a face-tagged 3MF of the body with the
   * new value for the ghost preview. Nothing in the design changes.
   *
   * A try rebuilds the design twice, the change and its undo: 2.3 to 13 s on the housing template (SolidCraft 0.40.1,
   * 2026-11-13), where 15 sizes are 2 mm. So the candidates are not tried one by one (audit D45, review of BC-08):
   * - those of the features the selection lies on come first (`nearFirst`);
   * - a group is tested in one rebuild, each member moved by its own small step: if the selection stays, none of them
   *   drives it; if it moves, the group is halved until one is left, which is tried with the value typed;
   * - the answer comes with the first driver; the rest is searched afterwards, one try per step (two rebuilds, 2.3 to 13 s
   *   on the housing, and the design read in the same batch) behind any other trial (`later`), and stops when another selection
   *   is probed, a value applied or the design changed. A second driver found then turns the next value typed into a choice;
   * - what was found is kept per selection (its target as picked, for an edge with the exact point), its size and the
   *   design, so the next value typed tries only what SolidCraft refused. A kept driver is taken as one again without a
   *   try with the new value: that holds while the parameter moves the selection in proportion (a box, an offset), not
   *   for a size it drives only over part of its range; the preview still builds the new value.
   * shortcut: a driver whose move is cancelled by another's in the same group to under `SAME` is not found (`NUDGE` makes
   * that need an irrational ratio of their effects or twin primes past 2500); and the first value typed answers "direct"
   * before a second driver is known. Try every candidate of a group that moved if a driver is ever missed.
   */
  async probe(target: DimensionTarget, current: number, value: number): Promise<ProbeResult> {
    if (!(value > 0) || !Number.isFinite(value)) return { mode: 'assistant', reason: 'noDriver' };
    const { parameters, state, timeline } = await this.design();
    const key = JSON.stringify([target, Number(current.toFixed(6)), state]);
    this.live = key;
    let search = this.searches.get(key);
    if (!search) {
      const tiers = nearFirst(candidatesFor(parameters, current, target.measure), target, parameters, timeline);
      const queue = tiers.filter((members) => members.length > 0).map((members): Group => ({ members, moves: false }));
      search = { key, state, target, current, value, candidates: tiers.flat(), drivers: [], open: [], queue, running: false };
      this.searches.set(key, search);
      if (this.searches.size > KEPT_PROBES) this.searches.delete(this.searches.keys().next().value as string);
    }
    search.value = value;
    // What SolidCraft refused or lost the selection with at an earlier value is tried at this one.
    try {
      for (const candidate of search.open.splice(0)) if (!search.stale) await this.tryValue(search, candidate);
      while ((search.drivers.length === 0 || !this.later) && search.queue.length > 0) await this.step(search);
    } catch (error) {
      // A try that threw (a timeout) took its group with it: the search is not kept half done.
      this.searches.delete(key);
      throw error;
    }
    // Changed by another call while it was searched: what was found may be of the design before (the field then leaves it to the assistant).
    if (search.stale) throw new Error('the design changed while its sizes were tried');
    if (search.queue.length > 0) this.searchOn(search);
    const order = search.candidates;
    const drivers = [...search.drivers].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    if (drivers.length === 0) return { mode: 'assistant', reason: 'noDriver' };
    // Several drive it (a symmetric extrude, a mirrored size): the user says which; the preview follows the pick.
    if (drivers.length > 1) return { mode: 'choice', options: drivers.map((d) => ({ parameter: d.parameter.name, factor: d.factor, label: labelOf(d.parameter) })) };
    const [driver] = drivers as [Candidate];
    return {
      mode: 'direct',
      parameter: driver.parameter.name,
      factor: driver.factor,
      label: labelOf(driver.parameter),
      preview: await this.preview(target.body, driver.parameter.name, value * driver.factor, search),
    };
  }

  /** The rest of a search after the answer, one step at a time behind other trials, while its selection is the live one and the design unchanged. */
  private searchOn(search: Search): void {
    if (search.running || !this.later) return;
    search.running = true;
    this.later(async () => {
      try {
        // Each try reads the design in the try's batch and stops the search when it changed (attempt).
        if (this.live !== search.key) return (search.running = false);
        await this.step(search);
        return (search.running = search.queue.length > 0 && this.live === search.key);
      } catch (error) {
        search.running = false;
        this.searches.delete(search.key);
        throw error;
      }
    });
  }

  /** One rebuild of a search: a group tested, split, or one candidate tried with the value. */
  private async step(search: Search): Promise<void> {
    const group = search.queue.shift();
    if (!group) return;
    const [only] = group.members;
    if (group.members.length === 1 && only) return this.tryValue(search, only);
    const moved = group.moves ? 'moved' : await this.nudged(search, group.members);
    if (moved === 'changed') return;
    if (moved === 'still') {
      // Its half moves then: the group they were split from did.
      if (group.then) group.then.moves = true;
      return;
    }
    const half = Math.ceil(group.members.length / 2);
    const second: Group = { members: group.members.slice(half), moves: false };
    // A group SolidCraft refused to move tells nothing of its halves.
    search.queue.unshift({ members: group.members.slice(0, half), moves: false, ...(moved === 'moved' ? { then: second } : {}) }, second);
  }

  /** Moves every member of a group a little at once: does the selection move? `refused` when SolidCraft does not build it. */
  private async nudged(search: Search, members: Candidate[]): Promise<'moved' | 'still' | 'refused' | 'changed'> {
    const changes = Object.fromEntries(members.map((candidate) => [candidate.parameter.name, mm(candidate.parameter.value + NUDGE * (1 + Math.sqrt(prime(search.candidates.indexOf(candidate))) / 10))]));
    const results = await this.attempt(search, [{ command: 'parameters.change', params: { changes } }, measureStep(search.target)]);
    if (typeof results === 'string') return results;
    const after = measured(search.target, results[1]);
    // Against SAME, not a looser bound: two drivers moving it opposite ways can leave under a thousandth (NUDGE).
    return after === null || Math.abs(after - search.current) > SAME ? 'moved' : 'still';
  }

  /** One candidate with the value typed: a driver when it brings the selection there; tried again at the next value when refused or the selection is lost. */
  private async tryValue(search: Search, candidate: Candidate): Promise<void> {
    const results = await this.attempt(search, [{ command: 'parameters.change', params: { name: candidate.parameter.name, expression: mm(search.value * candidate.factor) } }, measureStep(search.target)]);
    if (results === 'changed') return;
    const after = results === 'refused' ? null : measured(search.target, results[1]);
    if (after === null) search.open.push(candidate);
    else if (Math.abs(after - search.value) <= SAME * 10) search.drivers.push(candidate);
  }

  /**
   * The body with the parameter at `value`, exported and undone again; null if SolidCraft cannot build it. For a search, the
   * design is read in the same batch: a preview of a design changed since is no answer of the search (attempt).
   */
  private async preview(body: string, parameter: string, value: number, search?: Search): Promise<Uint8Array<ArrayBuffer> | null> {
    const file = join(this.cacheDir, `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.3mf`);
    const steps = [
      { command: 'parameters.change', params: { name: parameter, expression: mm(value) } },
      { command: 'file.export', params: { path: file, format: '3mf-tagged', bodies: [body], quality: 'standard' } },
    ];
    try {
      if (search) {
        const results = await this.attempt(search, steps);
        if (results === 'changed') throw new Error('the design changed while its sizes were tried');
        if (results === 'refused') return null;
      } else {
        const reply = await this.batch([...steps, UNDO_ALL], true);
        if (reply.failed?.index !== 2) return null;
      }
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
    // The design changes: a search still going on stops.
    this.live = '';
    const known = (await this.parameters()).find((entry) => entry.name === parameter);
    if (!known || known.unit !== 'mm' || !PLAIN_NUMBER.test(known.expression)) throw new Error(`${parameter} is not a plain length parameter`);
    // A size the user sets is theirs from now on: it loses the assistant's mark, and a printer change no longer moves it.
    const comment = !keepFitMark && typeof known.comment === 'string' && fitMarkOf(known.comment) ? { comment: withoutFitMark(known.comment) } : {};
    const reply = await this.batch([{ command: 'parameters.change', params: { name: parameter, expression: mm(value * factor), ...comment } }], true);
    if (reply.failed) throw new Error(`SolidCraft refused the value: ${reply.failed.error}`);
  }
}
