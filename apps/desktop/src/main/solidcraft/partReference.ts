import { execFile } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { LibraryPart } from './standardParts';

/**
 * What a body of SolidCraft's library looks like, to hold a body in a design against it. A
 * component's description says "Hex nut M3", and anything can be moved or joined into that
 * component, so the mirror takes a body for the part only when it has the shape SolidCraft builds
 * for that description: `solidcraft-cli` builds the part by itself, outside the design, and both
 * are measured the same way (`inspect.measure`, of the body and of each face).
 */

/**
 * Volume, surface and counts of a body, and of each face its area, the length of its outline and,
 * where it is round, its radius, sorted: the same however the part is turned or placed. Volume,
 * area and counts alone are five numbers a ring of the right radii and height meets; the faces one
 * by one it does not. All of it is `inspect.measure`, which measures the exact faces; `model.faces`
 * and `model.edges` give areas and lengths of the display mesh, up to 2 % apart between the same
 * part straight and turned (measured with SolidCraft 0.40.1).
 */
export interface PartShape {
  volume: number;
  area: number;
  faces: number;
  edges: number;
  vertices: number;
  faceAreas: number[];
  perimeters: number[];
  radii: number[];
}

/** A library part as SolidCraft builds it: its shape and the part number it gives it ("ISO 4032 M3"). */
export interface PartReference {
  shape: PartShape;
  partNumber: string;
}

/** A part to look up, by the description `parts.insert` gives it. */
export interface PartQuery {
  description: string;
  part: LibraryPart;
}

/**
 * Where a description's reference stands: there; being built; refused by SolidCraft, which does not
 * build such a part (the body is no standard part); not to be had for now, which says nothing
 * about the body; or not to be had at all here, because `solidcraft-cli` is missing.
 */
export type ReferenceState = PartReference | { building: true } | { refused: string } | { failed: string } | { unavailable: string };

/** The state of each part's reference, by description. */
export type ReferenceReader = (parts: readonly PartQuery[]) => Map<string, ReferenceState> | Promise<Map<string, ReferenceState>>;

type Step = { command: string; params: Record<string, unknown> };

/** More faces than any library part has (the most is 13); a body beyond it is not measured face by face. */
const MAX_FACES = 200;

/** How many faces a body's entry of `inspect.measure` counts, when they can be measured one by one. */
export function faceCount(measured: unknown): number | null {
  const faces = (measured as { faces?: unknown } | null | undefined)?.faces;
  return Number.isInteger(faces) && (faces as number) > 0 && (faces as number) <= MAX_FACES ? (faces as number) : null;
}

/** The steps that measure a body's faces one by one. */
export function faceSteps(body: string, faces: number): Step[] {
  return Array.from({ length: faces }, (_, index) => ({ command: 'inspect.measure', params: { items: [{ type: 'face', body, index }] } }));
}

/**
 * The shape in a body's entry of `inspect.measure` and the results of its `faceSteps`; null for a
 * body that is open, whose faces were not all measured, or that reads oddly.
 */
export function shapeOf(measured: unknown, faces: readonly unknown[] | undefined): PartShape | null {
  const body = measured as { volume_mm3?: unknown; area_mm2?: unknown; faces?: unknown; edges?: unknown; vertices?: unknown } | null | undefined;
  const size = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const count = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
  if (!body || !size(body.volume_mm3) || !size(body.area_mm2) || !count(body.faces) || !count(body.edges) || !count(body.vertices)) return null;
  if (!faces || faces.length !== body.faces) return null;
  const faceAreas: number[] = [];
  const perimeters: number[] = [];
  const radii: number[] = [];
  for (const result of faces) {
    const [face] = ((result as { items?: unknown } | null | undefined)?.items ?? []) as ({ area_mm2?: unknown; perimeter_mm?: unknown; radius?: unknown } | null)[];
    if (!face || !size(face.area_mm2)) return null;
    faceAreas.push(face.area_mm2);
    if (size(face.perimeter_mm)) perimeters.push(face.perimeter_mm);
    if (size(face.radius)) radii.push(face.radius);
  }
  const ascending = (a: number, b: number) => a - b;
  return { volume: body.volume_mm3, area: body.area_mm2, faces: body.faces, edges: body.edges, vertices: body.vertices, faceAreas: faceAreas.sort(ascending), perimeters: perimeters.sort(ascending), radii: radii.sort(ascending) };
}

/**
 * Measured with SolidCraft 0.40.1 over every size of all 13 families: a part turned, hidden or
 * resized differs from the one built alone by at most 6e-11 of its volume and area.
 */
const SHAPE_TOLERANCE = 1e-6;

/** Whether two bodies have the same shape: counts equal, every measure within the measuring noise. */
export function sameShape(a: PartShape, b: PartShape): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) <= SHAPE_TOLERANCE * Math.max(Math.abs(x), Math.abs(y));
  const alike = (xs: readonly number[], ys: readonly number[]) => xs.length === ys.length && xs.every((x, i) => close(x, ys[i] ?? NaN));
  return (
    a.faces === b.faces &&
    a.edges === b.edges &&
    a.vertices === b.vertices &&
    close(a.volume, b.volume) &&
    close(a.area, b.area) &&
    alike(a.faceAreas, b.faceAreas) &&
    alike(a.perimeters, b.perimeters) &&
    alike(a.radii, b.radii)
  );
}

const referenceName = (index: number) => `ref${String(index)}`;
/** The body the n-th part of a new design gets (checked against `component.list` when the results are read). */
const referenceBody = (index: number) => `Body${String(index + 1)}`;

const inserts = (parts: readonly PartQuery[]): Step[] =>
  parts.map(({ part }, i) => ({
    command: 'parts.insert',
    params: { family: part.family, size: part.size, ...(part.length === null ? {} : { length: part.length }), name: referenceName(i), point: [i * 1000, 0, 0] },
  }));

/** The steps of the first run: each part alone, a component of a name of its own, described and measured. */
export function referenceScript(parts: readonly PartQuery[]): Step[] {
  return [...inserts(parts), { command: 'component.list', params: {} }, ...parts.map((_, i) => ({ command: 'component.metadata', params: { component: referenceName(i) } })), { command: 'inspect.measure', params: {} }];
}

/** A part SolidCraft built in the words asked for, as the first run measured it. */
export interface BuiltPart extends PartQuery {
  partNumber: string;
  measured: unknown;
  faces: number;
}

const bodyOf = (components: unknown, index: number): boolean => {
  const component = (Array.isArray(components) ? (components as { name?: unknown; bodies?: unknown }[]) : []).find((entry) => entry.name === referenceName(index));
  return Array.isArray(component?.bodies) && component.bodies.length === 1 && component.bodies[0] === referenceBody(index);
};

/**
 * The parts in the results of `referenceScript` that SolidCraft described in exactly the words
 * asked for, so a description read wrongly gives no reference.
 */
export function builtParts(parts: readonly PartQuery[], results: readonly unknown[]): BuiltPart[] {
  const components = (results[parts.length] as { components?: unknown } | undefined)?.components;
  const bodies = (results[parts.length * 2 + 1] as { bodies?: unknown } | undefined)?.bodies;
  if (!Array.isArray(bodies)) return [];
  const built: BuiltPart[] = [];
  for (const [i, query] of parts.entries()) {
    const metadata = results[parts.length + 1 + i] as { description?: unknown; part_number?: unknown } | undefined;
    const measured = (bodies as { name?: unknown }[]).find((body) => body.name === referenceBody(i));
    const faces = faceCount(measured);
    if (!bodyOf(components, i) || metadata?.description !== query.description || faces === null) continue;
    built.push({ ...query, partNumber: typeof metadata.part_number === 'string' ? metadata.part_number.slice(0, 200) : '', measured, faces });
  }
  return built;
}

/** The steps of the second run: the built parts again, in the same order, and each of their faces. */
export function faceScript(built: readonly BuiltPart[]): Step[] {
  return [...inserts(built), { command: 'component.list', params: {} }, ...built.flatMap((part, i) => faceSteps(referenceBody(i), part.faces))];
}

/** The references of the built parts, with the faces from the results of `faceScript`. */
export function referencesOf(built: readonly BuiltPart[], results: readonly unknown[]): Map<string, PartReference> {
  const references = new Map<string, PartReference>();
  const components = (results[built.length] as { components?: unknown } | undefined)?.components;
  let at = built.length + 1;
  for (const [i, part] of built.entries()) {
    const shape = bodyOf(components, i) ? shapeOf(part.measured, results.slice(at, at + part.faces)) : null;
    at += part.faces;
    if (shape) references.set(part.description, { shape, partNumber: part.partNumber });
  }
  return references;
}

/** Runs `solidcraft-cli` and gives what it printed. */
export type CliRunner = (program: string, args: string[], timeoutMs: number, signal?: AbortSignal) => Promise<string>;

/** A run that failed before SolidCraft answered (not started, timed out, killed): worth another try later. */
export class TransientCliError extends Error {}

/** SolidCraft's own answer that it does not build the part: the step that puts it in failed with its reason. */
export class RefusedPartError extends Error {}

function runCli(env: NodeJS.ProcessEnv): CliRunner {
  return (program, args, timeoutMs, signal) =>
    new Promise<string>((done, fail) => {
      // Argument array, no shell (architecture: security boundaries).
      execFile(program, args, { env, windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024, ...(signal ? { signal } : {}) }, (error, stdout, stderr) => {
        const said = stderr.trim().replace(/^error:\s*/i, '').slice(0, 500);
        if (!error) done(stdout);
        else if (typeof error.code !== 'number' || error.killed) fail(new TransientCliError(error.killed ? `no answer within ${String(Math.round(timeoutMs / 1000))} s` : error.message));
        // "step 2 (parts.insert): invalid parameters …": the part itself is refused. Any other end (a crash, another step) says nothing about the part.
        else fail(/^step \d+ \(parts\.insert\)/.test(said) ? new RefusedPartError(said) : new Error(said || `solidcraft-cli ended with code ${String(error.code)}`));
      });
    });
}

/**
 * Measured with SolidCraft 0.40.1: a run for one part takes 0.2 to 0.5 s with the start of the
 * program (the slowest is an M16 button head screw 120 mm long), a run for 30 parts 5.5 s, for all
 * 185 sizes 56 s (0.3 s a part). The limit of a run is many times that, and far under the minutes
 * a mirror would wait if nothing ended it.
 */
const TIMEOUT_BASE_MS = 20_000;
const TIMEOUT_PER_PART_MS = 2_000;
/** After a run that did not get to answer, its parts are tried again after this long. */
const RETRY_AFTER_MS = 5 * 60 * 1000;
/** Runs without an answer a part gets by itself, the first included. */
const RETRIES = 3;
const STORE_FILE = 'part-references.json';
/** Raised when what the file holds changes, so an older file is built anew rather than misread. */
const STORE_FORMAT = 2;
/** The parts one look starts building; more wait for the next look. */
const PARTS_PER_RUN = 200;
/**
 * They are built in up to four runs side by side, one per four cores the computer has, each of at least
 * MIN_PARTS_PER_RUN parts (audit N-nach-4): 80 parts took 14.5 to 14.9 s in one run and 4.1 to 4.7 s in four of 20
 * (SolidCraft 0.40.1, 28 cores). Each run tells `built` when it ends, so the parts it brought show before the slowest
 * run is done. A design with up to 2 × MIN_PARTS_PER_RUN − 1 new parts starts one process, as before.
 */
export const RUNS_AT_ONCE = Math.min(4, Math.max(1, Math.floor(availableParallelism() / 4)));
const MIN_PARTS_PER_RUN = 8;

/** `parts` cut into at most `runs` runs of at least MIN_PARTS_PER_RUN parts, as even as they come. */
export function runsOf<T>(parts: readonly T[], runs = RUNS_AT_ONCE): T[][] {
  if (parts.length === 0) return [];
  const count = Math.max(1, Math.min(runs, Math.floor(parts.length / MIN_PARTS_PER_RUN)));
  const size = Math.ceil(parts.length / count);
  return Array.from({ length: Math.ceil(parts.length / size) }, (_, i) => parts.slice(i * size, (i + 1) * size));
}
/** How often `ready` starts another run for what is still open (20 runs are 4000 descriptions). */
const READY_ROUNDS = 20;

export interface PartReferences {
  /** Where each part's reference stands now. What is not known yet is built in the background; `built` tells when. */
  known: (parts: readonly PartQuery[]) => Map<string, ReferenceState>;
  /**
   * The same once every part has been tried, also one that failed before: for an export, which
   * must not go out with a screw in it and is worth one more run.
   */
  ready: (parts: readonly PartQuery[]) => Promise<Map<string, ReferenceState>>;
  /** Another design or the engine's end: nothing waits to be built again for the design that is gone. */
  forget: () => void;
  /** PartBuddy ends: runs under way are stopped and none is started. */
  stop?: () => void;
}

export interface PartReferenceOptions {
  /** `solidcraft-cli`; asked each time, it throws while SolidCraft is not installed. */
  cli: () => string;
  /** Where the script lies while it runs and the references are kept (the app's cache folder). */
  dir: string;
  log: (message: string) => void;
  /** Called after every background build, whatever it brought: the design is to be mirrored once more. */
  built?: () => void;
  env?: NodeJS.ProcessEnv;
  run?: CliRunner;
  now?: () => number;
  /** Calls back after a while (a timer that does not keep the app alive); the function it gives calls it off. */
  later?: (callback: () => void, ms: number) => () => void;
}

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const measures = (value: unknown): value is number[] => Array.isArray(value) && value.every((entry) => finite(entry) && entry > 0);

/** A reference as the file may hold it; anything else in its place is dropped and the part built again. */
function keptReference(entry: unknown): PartReference | null {
  const reference = entry as { partNumber?: unknown; shape?: Partial<Record<keyof PartShape, unknown>> | null } | null;
  const shape = reference?.shape;
  if (typeof reference?.partNumber !== 'string' || typeof shape !== 'object' || shape === null) return null;
  const counts = [shape.faces, shape.edges, shape.vertices].every((count) => Number.isInteger(count) && (count as number) >= 0);
  if (!finite(shape.volume) || shape.volume <= 0 || !finite(shape.area) || shape.area <= 0 || !counts || !measures(shape.faceAreas) || !measures(shape.perimeters) || !measures(shape.radii)) return null;
  if (shape.faceAreas.length !== shape.faces) return null;
  return { partNumber: reference.partNumber, shape: shape as PartShape };
}

/**
 * References from `solidcraft-cli run`, one process for every part not known yet, never the same
 * part in two processes. They are kept in a file per SolidCraft program (its version, size and
 * date), so a part is built once, not with every start. Kept as well is SolidCraft's own answer
 * that it does not build a part. Whatever else goes wrong (a crash, an answer that does not read,
 * a file that cannot be written) says nothing about the part: it is remembered until PartBuddy
 * ends, and a run that gave no answer is tried again after a while.
 */
export function cliReferences(options: PartReferenceOptions): PartReferences {
  const { dir, log } = options;
  const run = options.run ?? runCli(options.env ?? process.env);
  const now = options.now ?? Date.now;
  const later =
    options.later ??
    ((callback, ms) => {
      const timer = setTimeout(callback, ms);
      timer.unref();
      return () => {
        clearTimeout(timer);
      };
    });
  /** Per program: what its file holds. A text in place of a reference is SolidCraft's reason not to build the part. */
  type Store = { identity: string; parts: Map<string, PartReference | string> };
  const stores = new Map<string, Promise<Store>>();
  /** The store of a program once it was opened; undefined before. */
  const opened = new Map<string, Store['parts']>();
  const building = new Map<string, Promise<void>>();
  /** What failed without SolidCraft refusing the part: not tried again by a mirror, until `at` where it has one. */
  const failed = new Map<string, { reason: string; at?: number }>();
  /** Runs without an answer, per part: after `RETRIES` the part is left alone until an export asks or PartBuddy starts again. */
  const tries = new Map<string, number>();
  /** The parts one timer builds again once their wait is over; a part is in here once. */
  const waiting = new Map<string, { program: string; part: PartQuery }>();
  let cancelTimer: (() => void) | null = null;
  /** Stops every run under way when PartBuddy ends. */
  const ending = new AbortController();
  /** Runs side by side write the same file: one after the other, each with all that is known by then. */
  let keeping: Promise<void> = Promise.resolve();
  const key = (program: string, description: string) => `${program}\n${description}`;

  const open = (program: string) => {
    let store = stores.get(program);
    if (!store) {
      store = (async () => {
        const [version, file] = await Promise.all([run(program, ['--version'], TIMEOUT_BASE_MS), stat(program)]);
        const identity = `${String(STORE_FORMAT)} ${version.trim()} ${String(file.size)} ${String(Math.round(file.mtimeMs))}`;
        const parts: Store['parts'] = new Map();
        try {
          const kept = JSON.parse(await readFile(join(dir, STORE_FILE), 'utf8')) as { identity?: unknown; parts?: unknown } | null;
          if (kept?.identity === identity && typeof kept.parts === 'object' && kept.parts !== null) {
            for (const [description, entry] of Object.entries(kept.parts as Record<string, unknown>)) {
              const reference = typeof entry === 'string' ? entry.slice(0, 500) : keptReference(entry);
              if (reference !== null && reference !== '') parts.set(description, reference);
            }
          }
        } catch {
          // No file yet, or one that does not read: every part is built again.
        }
        return { identity, parts };
      })();
      stores.set(program, store);
      // A program that did not answer is asked again with the next part.
      store.catch(() => stores.delete(program));
    }
    return store;
  };

  /** Builds the parts and keeps what SolidCraft made of each; gives the parts whose results did not read. */
  const build = async (program: string, wanted: readonly PartQuery[], parts: Store['parts']): Promise<PartQuery[]> => {
    await mkdir(dir, { recursive: true });
    const script = join(dir, `parts-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.json`);
    const results = async (steps: unknown[]): Promise<unknown[]> => {
      await writeFile(script, JSON.stringify(steps));
      return JSON.parse(await run(program, ['run', script, '--results', '--quiet'], TIMEOUT_BASE_MS + TIMEOUT_PER_PART_MS * wanted.length, ending.signal)) as unknown[];
    };
    try {
      // Two runs: how many faces a part has is known only once it is built, and a script cannot ask.
      const first = await results(referenceScript(wanted));
      const built = builtParts(wanted, first);
      const references = built.length > 0 ? referencesOf(built, await results(faceScript(built))) : new Map<string, PartReference>();
      const unread: PartQuery[] = [];
      for (const [i, part] of wanted.entries()) {
        const reference = references.get(part.description);
        const described = (first[wanted.length + 1 + i] as { description?: unknown } | null | undefined)?.description;
        if (reference) parts.set(part.description, reference);
        else if (typeof described === 'string' && described !== part.description) parts.set(part.description, `SolidCraft builds "${described.slice(0, 200)}" for these words`);
        else unread.push(part);
      }
      return unread;
    } finally {
      // A script that cannot be removed is no reason to lose the references.
      await rm(script, { force: true }).catch(() => undefined);
    }
  };

  /** One timer for all that wait: it builds what is due and goes on for the rest. It never lifts a wait itself. */
  const arm = () => {
    if (cancelTimer || waiting.size === 0 || ending.signal.aborted) return;
    const next = Math.min(...[...waiting.keys()].map((entry) => failed.get(entry)?.at ?? 0));
    cancelTimer = later(
      () => {
        cancelTimer = null;
        const due = new Map<string, PartQuery[]>();
        for (const [entry, { program, part }] of waiting) {
          const at = failed.get(entry)?.at;
          // Built meanwhile, or given up: nothing to wait for.
          if (at === undefined) waiting.delete(entry);
          else if (at <= now()) {
            waiting.delete(entry);
            due.set(program, [...(due.get(program) ?? []), part]);
          }
        }
        for (const parts of due.values()) {
          try {
            known(parts);
          } catch (error) {
            log(`no references for standard parts: ${(error as Error).message}`);
          }
        }
        arm();
      },
      Math.max(next - now(), 1000),
    );
  };

  const work = async (program: string, wanted: readonly PartQuery[]): Promise<void> => {
    const store = await open(program);
    const missing = wanted.filter((part) => !store.parts.has(part.description));
    if (missing.length === 0) return;
    const without = (part: PartQuery, cause: unknown) => {
      const entry = key(program, part.description);
      const reason = ((cause as Error).message || String(cause)).slice(0, 300);
      let how = ' in this run of PartBuddy';
      if (cause instanceof RefusedPartError) {
        store.parts.set(part.description, reason);
        how = '';
      } else if (cause instanceof TransientCliError) {
        const count = (tries.get(entry) ?? 0) + 1;
        tries.set(entry, count);
        if (count < RETRIES) {
          failed.set(entry, { reason, at: now() + RETRY_AFTER_MS });
          waiting.set(entry, { program, part });
          how = ' for now';
        } else {
          failed.set(entry, { reason });
          how = ` after ${String(RETRIES)} runs; it is not tried again in this run of PartBuddy`;
        }
      } else failed.set(entry, { reason });
      log(`no reference for the standard part "${part.description}"${how}: ${reason}`);
    };
    const unread = new Error('the measures SolidCraft gave did not read');
    try {
      for (const part of await build(program, missing, store.parts)) without(part, unread);
    } catch (error) {
      // One description SolidCraft cannot build stops the whole script: the parts are built one by one, once.
      if (missing.length === 1 || error instanceof TransientCliError) for (const part of missing) without(part, error);
      else {
        for (const part of missing) {
          await build(program, [part], store.parts).then(
            (odd) => {
              for (const entry of odd) without(entry, unread);
            },
            (cause: unknown) => {
              without(part, cause);
            },
          );
        }
      }
    }
    for (const part of missing) if (typeof store.parts.get(part.description) === 'object') tries.delete(key(program, part.description));
    // Nobody asks again by itself after a run without an answer: once the wait is over the parts are built and the design mirrored.
    arm();
    keeping = keeping.then(async () => {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, STORE_FILE), JSON.stringify({ identity: store.identity, parts: Object.fromEntries(store.parts) }));
    }).catch((error: unknown) => {
      log(`the standard part references were not kept: ${(error as Error).message}`);
    });
    await keeping;
  };

  /** `solidcraft-cli`, or why there is none: without it no part can be built here, now or in a moment. */
  const program = (): string | { unavailable: string } => {
    try {
      return options.cli();
    } catch (error) {
      return { unavailable: (error as Error).message };
    }
  };

  const known = (parts: readonly PartQuery[]): Map<string, ReferenceState> => {
    if (ending.signal.aborted) return new Map(parts.map((part) => [part.description, { failed: 'PartBuddy is ending' }]));
    const cli = program();
    if (typeof cli !== 'string') return new Map(parts.map((part) => [part.description, cli]));
    const have = opened.get(cli);
    const states = new Map<string, ReferenceState>();
    const wanted: PartQuery[] = [];
    for (const part of parts) {
      if (states.has(part.description)) continue;
      const kept = have?.get(part.description);
      const lost = failed.get(key(cli, part.description));
      if (typeof kept === 'object') states.set(part.description, kept);
      else if (typeof kept === 'string') states.set(part.description, { refused: kept });
      else if (lost && (lost.at === undefined || lost.at > now())) states.set(part.description, { failed: lost.reason });
      else {
        states.set(part.description, { building: true });
        if (!building.has(key(cli, part.description)) && wanted.length < PARTS_PER_RUN) wanted.push(part);
      }
    }
    for (const run of runsOf(wanted)) {
      const job = work(cli, run)
        .then(
          async () => {
            opened.set(cli, (await open(cli)).parts);
          },
          (error: unknown) => {
            // The program itself could not be asked (its version, its file): nothing says the parts cannot be built.
            const reason = ((error as Error).message || String(error)).slice(0, 300);
            for (const part of run) failed.set(key(cli, part.description), { reason });
            log(`no references for standard parts in this run of PartBuddy: ${reason}`);
          },
        )
        .finally(() => {
          for (const part of run) building.delete(key(cli, part.description));
          // With or without a reference, the parts are no longer "being built": the mirror says once more what each body is.
          options.built?.();
        });
      for (const part of run) building.set(key(cli, part.description), job);
    }
    return states;
  };

  return {
    known,
    ready: async (parts) => {
      const cli = program();
      if (typeof cli !== 'string') return known(parts);
      // Whoever waits is worth one more run for what failed before; SolidCraft's own refusals stay.
      for (const part of parts) {
        failed.delete(key(cli, part.description));
        tries.delete(key(cli, part.description));
      }
      let states = known(parts);
      for (let round = 0; round < READY_ROUNDS && [...states.values()].some((state) => 'building' in state); round += 1) {
        await Promise.all(parts.flatMap((part) => building.get(key(cli, part.description)) ?? []));
        states = known(parts);
      }
      return states;
    },
    stop: () => {
      ending.abort();
      cancelTimer?.();
      cancelTimer = null;
      waiting.clear();
    },
    forget: () => {
      cancelTimer?.();
      cancelTimer = null;
      // What only waited for its next run is asked afresh by whoever shows the part again.
      for (const entry of waiting.keys()) {
        failed.delete(entry);
        tries.delete(entry);
      }
      waiting.clear();
    },
  };
}
