import { execFile } from 'node:child_process';
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

/** Where a description's reference stands: there, being built, or not to be had (and why). */
export type ReferenceState = PartReference | { building: true } | { failed: string };

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

/** Runs `solidcraft-cli` and gives what it printed; rejects with `transient` set when it did not get to answer. */
export type CliRunner = (program: string, args: string[], timeoutMs: number) => Promise<string>;

/** A run that failed before SolidCraft answered (not started, timed out, killed): worth another try later. */
export class TransientCliError extends Error {}

function runCli(env: NodeJS.ProcessEnv): CliRunner {
  return (program, args, timeoutMs) =>
    new Promise<string>((done, fail) => {
      // Argument array, no shell (architecture: security boundaries).
      execFile(program, args, { env, windowsHide: true, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
        if (!error) done(stdout);
        else if (typeof error.code !== 'number' || error.killed) fail(new TransientCliError(error.killed ? `no answer within ${String(Math.round(timeoutMs / 1000))} s` : error.message));
        else fail(new Error(stderr.trim().replace(/^error:\s*/i, '').slice(0, 500) || error.message));
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
/** After a run that did not get to answer, its parts are not tried again for this long. */
const RETRY_AFTER_MS = 5 * 60 * 1000;
const STORE_FILE = 'part-references.json';

export interface PartReferences {
  /** Where each part's reference stands now. What is not known yet is built in the background; `built` tells when. */
  known: (parts: readonly PartQuery[]) => Map<string, ReferenceState>;
  /** The same once every part has been tried: for an export, which must not go out with a screw in it. */
  ready: (parts: readonly PartQuery[]) => Promise<Map<string, ReferenceState>>;
}

export interface PartReferenceOptions {
  /** `solidcraft-cli`; asked each time, it throws while SolidCraft is not installed. */
  cli: () => string;
  /** Where the script lies while it runs and the references are kept (the app's cache folder). */
  dir: string;
  log: (message: string) => void;
  /** Called after a background build that brought a reference: the design is to be mirrored once more. */
  built?: () => void;
  env?: NodeJS.ProcessEnv;
  run?: CliRunner;
  now?: () => number;
}

/**
 * References from `solidcraft-cli run`, one process for every part not known yet, never the same
 * part in two processes. They are kept in a file per SolidCraft program (its version, size and
 * date), so a part is built once, not with every start. A part SolidCraft does not build is
 * remembered with its reason; a run that did not get to answer is tried again after a while.
 */
export function cliReferences(options: PartReferenceOptions): PartReferences {
  const { dir, log } = options;
  const run = options.run ?? runCli(options.env ?? process.env);
  const now = options.now ?? Date.now;
  /** Per program: what its file holds. A description with a text instead of a reference is one SolidCraft does not build. */
  const stores = new Map<string, Promise<{ identity: string; parts: Map<string, PartReference | string> }>>();
  const building = new Map<string, Promise<void>>();
  const retryAt = new Map<string, { at: number; reason: string }>();
  const key = (program: string, description: string) => `${program}\n${description}`;

  const open = (program: string) => {
    let store = stores.get(program);
    if (!store) {
      store = (async () => {
        const [version, file] = await Promise.all([run(program, ['--version'], TIMEOUT_BASE_MS), stat(program)]);
        const identity = `${version.trim()} ${String(file.size)} ${String(Math.round(file.mtimeMs))}`;
        const parts = new Map<string, PartReference | string>();
        try {
          const kept = JSON.parse(await readFile(join(dir, STORE_FILE), 'utf8')) as { identity?: unknown; parts?: unknown };
          if (kept.identity === identity && typeof kept.parts === 'object' && kept.parts !== null) {
            for (const [description, entry] of Object.entries(kept.parts as Record<string, PartReference | string>)) parts.set(description, entry);
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

  const build = async (program: string, wanted: readonly PartQuery[], parts: Map<string, PartReference | string>): Promise<void> => {
    await mkdir(dir, { recursive: true });
    const script = join(dir, `parts-${now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.json`);
    const results = async (steps: unknown[]): Promise<unknown[]> => {
      await writeFile(script, JSON.stringify(steps));
      return JSON.parse(await run(program, ['run', script, '--results', '--quiet'], TIMEOUT_BASE_MS + TIMEOUT_PER_PART_MS * wanted.length)) as unknown[];
    };
    try {
      // Two runs: how many faces a part has is known only once it is built, and a script cannot ask.
      const built = builtParts(wanted, await results(referenceScript(wanted)));
      const references = built.length > 0 ? referencesOf(built, await results(faceScript(built))) : new Map<string, PartReference>();
      for (const { description } of wanted) parts.set(description, references.get(description) ?? 'SolidCraft builds another part for these words');
    } finally {
      await rm(script, { force: true });
    }
  };

  const work = async (program: string, wanted: readonly PartQuery[]): Promise<boolean> => {
    const store = await open(program);
    const missing = wanted.filter((part) => !store.parts.has(part.description));
    if (missing.length === 0) return wanted.some((part) => typeof store.parts.get(part.description) === 'object');
    const refused = (part: PartQuery, cause: unknown) => {
      const reason = (cause as Error).message.slice(0, 300);
      if (cause instanceof TransientCliError) retryAt.set(key(program, part.description), { at: now() + RETRY_AFTER_MS, reason });
      else store.parts.set(part.description, reason);
      log(`no reference for the standard part "${part.description}": ${reason}`);
    };
    try {
      await build(program, missing, store.parts);
    } catch (error) {
      // One description SolidCraft cannot build stops the whole script: the parts are built one by one, once.
      if (missing.length === 1 || error instanceof TransientCliError) for (const part of missing) refused(part, error);
      else for (const part of missing) await build(program, [part], store.parts).catch((cause: unknown) => refused(part, cause));
    }
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, STORE_FILE), JSON.stringify({ identity: store.identity, parts: Object.fromEntries(store.parts) })).catch((error: unknown) => log(`the standard part references were not kept: ${(error as Error).message}`));
    return missing.some((part) => typeof store.parts.get(part.description) === 'object');
  };

  /** The store of a program once it was opened; undefined before. */
  const opened = new Map<string, Map<string, PartReference | string>>();

  const known = (parts: readonly PartQuery[]): Map<string, ReferenceState> => {
    const program = options.cli();
    const have = opened.get(program);
    const states = new Map<string, ReferenceState>();
    const wanted: PartQuery[] = [];
    for (const part of parts) {
      if (states.has(part.description)) continue;
      const kept = have?.get(part.description);
      const held = retryAt.get(key(program, part.description));
      if (typeof kept === 'object') states.set(part.description, kept);
      else if (typeof kept === 'string') states.set(part.description, { failed: kept });
      else if (held && held.at > now()) states.set(part.description, { failed: held.reason });
      else {
        states.set(part.description, { building: true });
        if (!building.has(key(program, part.description))) wanted.push(part);
      }
    }
    if (wanted.length > 0) {
      const job = work(program, wanted.slice(0, 200))
        .then(
          async (gained) => {
            opened.set(program, (await open(program)).parts);
            if (gained) options.built?.();
          },
          (error: unknown) => {
            const reason = (error as Error).message.slice(0, 300);
            for (const part of wanted) retryAt.set(key(program, part.description), { at: now() + RETRY_AFTER_MS, reason });
            log(`no references for standard parts: ${reason}`);
          },
        )
        .finally(() => {
          for (const part of wanted) building.delete(key(program, part.description));
        });
      for (const part of wanted) building.set(key(program, part.description), job);
    }
    return states;
  };

  return {
    known,
    ready: async (parts) => {
      const program = options.cli();
      known(parts);
      await Promise.all(parts.flatMap((part) => building.get(key(program, part.description)) ?? []));
      return known(parts);
    },
  };
}
