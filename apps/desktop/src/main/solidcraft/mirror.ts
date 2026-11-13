import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { faceTableFromModelFaces, sketchFromInspect, tessellateSketch, type SketchLines } from '@partbuddy/geometry';

import type { Joint, MirroredBody, MirroredSketch, MirrorRevision, Structure } from '../../shared/contract';
import { TOGETHER_KEY } from '../../shared/mechanisms';
import { cliBeside, findExecutable, systemEnvironment } from './discovery';
import { cliReferences, faceCount, faceSteps, sameShape, shapeOf, type PartReference, type ReferenceReader, type ReferenceState } from './partReference';
import { libraryPartOf, type LibraryPart } from './standardParts';

/** The part of the control client the mirror needs. */
export interface ControlRequester {
  request<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
}

interface InspectResult {
  name?: unknown;
  bodies?: { name?: unknown; visible?: unknown }[];
  sketches?: { id?: unknown; name?: unknown; visible?: unknown }[];
  active_sketch?: unknown;
  /** Steps that can be undone and redone. */
  undo?: unknown;
  redo?: unknown;
  timeline?: unknown;
  marker?: unknown;
  metadata?: unknown;
}

const text = (value: unknown, max: number): string | null => (typeof value === 'string' ? value.slice(0, max) : null);

/** The structure tree and timeline from `document.inspect`; unknown entries are left out. */
export function structureOf(inspect: InspectResult): Structure {
  const entries: unknown[] = Array.isArray(inspect.timeline) ? (inspect.timeline as unknown[]) : [];
  const features = entries
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null && Number.isInteger((entry as { id?: unknown }).id))
    .map((entry) => ({
      id: entry.id as number,
      name: text(entry.name, 200) ?? `#${String(entry.id)}`,
      type: text(entry.type, 80) ?? 'Feature',
      error: text(entry.error, 500),
      warning: text(entry.warning, 500),
      suppressed: entry.suppressed === true,
      rolledBack: entry.rolled_back === true,
      ms: typeof entry.ms === 'number' && entry.ms >= 0 ? entry.ms : 0,
    }));
  const marker = Number.isInteger(inspect.marker) && (inspect.marker as number) < features.length ? (inspect.marker as number) : null;
  return {
    features,
    marker,
    bodies: (inspect.bodies ?? [])
      .filter((body) => typeof body.name === 'string' && body.name !== '')
      .map((body) => ({
        name: (body.name as string).slice(0, 200),
        visible: body.visible !== false,
        feature: Number.isInteger((body as { feature?: unknown }).feature) ? ((body as { feature: number }).feature) : null,
      })),
    sketches: (inspect.sketches ?? [])
      .filter((sketch) => Number.isInteger(sketch.id))
      .map((sketch) => ({ id: sketch.id as number, name: text(sketch.name, 200) ?? '', visible: sketch.visible !== false })),
    // Filled by the mirror from what SolidCraft says of each component (`boughtParts`), never from a list of names kept in the design.
    standardParts: [],
  };
}

/** The components below the design that hold bodies, from `component.list`. */
export function componentsWithBodies(listing: unknown): { id: number; bodies: string[] }[] {
  const components = (listing as { components?: unknown } | undefined)?.components;
  if (!Array.isArray(components)) return [];
  return components
    .map((entry) => entry as { id?: unknown; parent?: unknown; bodies?: unknown })
    .filter((entry) => Number.isInteger(entry.id) && entry.parent !== null && Array.isArray(entry.bodies) && entry.bodies.length > 0)
    .slice(0, 500)
    .map((entry) => ({ id: entry.id as number, bodies: (entry.bodies as unknown[]).filter((name): name is string => typeof name === 'string') }));
}

/**
 * The bodies printed as one piece (audit G1): those of components that share a mark of `printTogether` (mechanisms.ts),
 * from their `component.metadata` in the order of `parts`. A component in two marks joins both groups into one.
 */
export function printGroupsOf(parts: readonly { bodies: string[] }[], described: readonly unknown[]): string[][] {
  const labelled = new Map<string, string[]>();
  parts.forEach((part, i) => {
    const metadata = (described[i] as { metadata?: unknown } | undefined)?.metadata;
    for (const key of typeof metadata === 'object' && metadata !== null ? Object.keys(metadata) : []) {
      if (key.startsWith(TOGETHER_KEY)) labelled.set(key, [...(labelled.get(key) ?? []), ...part.bodies]);
    }
  });
  let groups: Set<string>[] = [];
  for (const bodies of labelled.values()) {
    const merged = new Set(bodies);
    groups = groups.filter((group) => {
      if (![...group].some((body) => merged.has(body))) return true;
      for (const body of group) merged.add(body);
      return false;
    });
    groups.push(merged);
  }
  // In the order of the design, so the first body names its group the same way each time.
  const order = parts.flatMap((part) => part.bodies);
  return groups
    .filter((group) => group.size > 1)
    .map((group) => [...group].sort((a, b) => order.indexOf(a) - order.indexOf(b)).slice(0, 500))
    .slice(0, 200);
}

/** The groups of `printGroupsOf`, read from SolidCraft; none when that fails, so each body is checked by itself as before. */
async function printGroupsIn(client: ControlRequester, listing: unknown, log: (message: string) => void): Promise<string[][]> {
  const parts = componentsWithBodies(listing);
  if (parts.length < 2) return [];
  try {
    const described = await client.request<BatchResult>('engine.batch', { commands: parts.map((part) => ({ command: 'component.metadata', params: { component: part.id } })), rollback: false }, 60_000);
    if (described.failed) throw new Error(`${described.failed.command} failed: ${described.failed.error}`);
    return printGroupsOf(parts, described.results);
  } catch (error) {
    log(`parts printed together could not be read (${(error as Error).message}); each body is checked on its own bed`);
    return [];
  }
}

/** What telling standard parts needs besides the engine: the log, and SolidCraft's own build of each part. */
export interface PartChecks {
  log: (message: string) => void;
  references: ReferenceReader;
}

/** A component described as a library part that holds one body: what may be a standard part. */
export interface PartCandidate {
  component: number;
  body: string;
  description: string;
  part: LibraryPart;
}

/**
 * The components among `parts` whose `component.metadata` describes a part of the library
 * (`library` is what `parts.library` answers) and that hold the one body the library builds for it.
 * shortcut: a library component with more than one body counts as printed altogether, the library's
 * own body too (a nut mirrored inside its own component); tell them apart when SolidCraft marks the
 * body it built.
 */
export function partCandidates(parts: readonly { id: number; bodies: string[] }[], metadata: readonly unknown[], library: unknown, log: (message: string) => void): PartCandidate[] {
  const candidates: PartCandidate[] = [];
  for (const [i, entry] of parts.entries()) {
    const description = (metadata[i] as { description?: unknown } | null | undefined)?.description;
    const part = libraryPartOf(description, library);
    if (!part || typeof description !== 'string') continue;
    const [body] = entry.bodies;
    if (entry.bodies.length !== 1 || body === undefined) {
      log(`the component described as "${description}" holds ${String(entry.bodies.length)} bodies (${entry.bodies.join(', ')}), a standard part has one: they count as printed`);
      continue;
    }
    candidates.push({ component: entry.id, body, description, part });
  }
  return candidates;
}

/** A standard part in the design: bought, not printed. The part number is the one SolidCraft gives the part it builds. */
export interface BoughtPart {
  component: number;
  body: string;
  description: string;
  partNumber: string;
}

/**
 * What the recognition makes of a design's bodies: the standard parts; the bodies whose part
 * SolidCraft is still building (neither printed nor bought until the mirror after, so the print
 * check leaves them out for that moment); and why a body could not be checked at all, for what
 * must not leave PartBuddy with a screw in it.
 */
export interface ToldParts {
  bought: BoughtPart[];
  pending: string[];
  unchecked: string[];
  /** Bodies described as library parts that count as printed because no part can be built here at all (`solidcraft-cli` is missing): for a word to the user. */
  unverified: string[];
}

/**
 * The candidates whose body has the shape SolidCraft builds for their description; `measured` is
 * `inspect.measure` of their bodies, `faces` per candidate the results of its `faceSteps` (none
 * where the count of faces already differs). A body with material joined on, cut away or put in
 * the part's place differs and counts as printed. Every body left printed is logged with the
 * reason, so a part that should have counted can be found in the field.
 */
export function boughtAmong(
  candidates: readonly PartCandidate[],
  measured: unknown,
  faces: readonly (readonly unknown[] | undefined)[],
  references: ReadonlyMap<string, ReferenceState>,
  log: (message: string) => void,
): ToldParts {
  const bought: BoughtPart[] = [];
  const pending: string[] = [];
  const unchecked: string[] = [];
  const unverified: string[] = [];
  for (const [i, { component, body, description }] of candidates.entries()) {
    const reference = references.get(description);
    const entry = measuredBody(measured, body) as { volume_mm3?: unknown; faces?: unknown } | undefined;
    const differs = () => {
      const part = (reference as PartReference).shape;
      log(`body "${body}" is described as "${description}" but is not that part (${String(entry?.volume_mm3)} mm³, ${String(entry?.faces)} faces; the part has ${String(part.volume)} mm³, ${String(part.faces)} faces): it counts as printed`);
    };
    if (!reference || 'failed' in reference) {
      const reason = reference ? reference.failed : 'no answer';
      unchecked.push(`"${body}": ${reason}`);
      log(`body "${body}" is described as "${description}", which could not be built to hold it against (${reason}): it counts as printed`);
    } else if ('unavailable' in reference) {
      unverified.push(body);
      log(`body "${body}" is described as "${description}", but no part can be built to hold it against (${reference.unavailable}): it counts as printed`);
    } else if ('refused' in reference) log(`body "${body}" is described as "${description}", which SolidCraft does not build (${reference.refused}): it counts as printed`);
    else if ('building' in reference) {
      pending.push(body);
      log(`body "${body}" is described as "${description}", which SolidCraft is building to hold it against: it is neither printed nor bought until then`);
    }
    else if (!entry) log(`body "${body}", described as "${description}", could not be measured: it counts as printed`);
    else if (faceCount(entry) !== reference.shape.faces) differs();
    else {
      const shape = shapeOf(entry, faces[i]);
      if (!shape) log(`body "${body}", described as "${description}", could not be measured: it counts as printed`);
      else if (!sameShape(shape, reference.shape)) differs();
      else bought.push({ component, body, description, partNumber: reference.partNumber });
    }
  }
  return { bought, pending, unchecked, unverified };
}

/** One body's entry in the result of `inspect.measure`. */
function measuredBody(measured: unknown, body: string): unknown {
  const bodies = (measured as { bodies?: unknown } | null | undefined)?.bodies;
  return Array.isArray(bodies) ? (bodies as ({ name?: unknown } | null)[]).find((entry) => entry?.name === body) ?? undefined : undefined;
}

/** `parts.library` per engine connection: the library does not change while SolidCraft runs. */
const libraries = new WeakMap<ControlRequester, unknown>();

async function libraryOfEngine(client: ControlRequester, log: (message: string) => void): Promise<unknown> {
  const known = libraries.get(client);
  if (known !== undefined) return known;
  // A request that is rejected is a library that failed like any other: the bodies count as printed, the export is not held up.
  const reply = await client
    .request<BatchResult>('engine.batch', { commands: [{ command: 'parts.library', params: {} }], rollback: false }, 60_000)
    .catch((error: unknown): BatchResult => ({ completed: 0, results: [], failed: { index: 0, command: 'parts.library', error: (error as Error).message } }));
  const library = reply.failed ? undefined : (reply.results as unknown[] | undefined)?.[0];
  const families = (library as { families?: unknown } | null | undefined)?.families;
  if (!Array.isArray(families) || families.length === 0) {
    log(`standard parts cannot be told from printed bodies: parts.library ${reply.failed ? `failed (${reply.failed.error})` : 'lists no families'}; every body counts as printed`);
    return null;
  }
  libraries.set(client, library);
  return library;
}

/**
 * The standard parts of the design, from `component.list`: the one recognition behind print check,
 * plate, size list, export and the list of parts to buy. A body is one only when its component is
 * described as a library part (stage 1: and holds nothing else) and the body has the shape
 * SolidCraft builds for that description (stage 2). Whatever cannot be read or checked counts as
 * printed, with a line in the log: a screw in the print check shows, a printed part left out of it
 * does not. Only a design with components holding bodies costs requests.
 */
export async function boughtParts(client: ControlRequester, listing: unknown, checks: PartChecks): Promise<ToldParts> {
  const none: ToldParts = { bought: [], pending: [], unchecked: [], unverified: [] };
  const parts = componentsWithBodies(listing);
  if (parts.length === 0) return none;
  try {
    const library = await libraryOfEngine(client, checks.log);
    // Without the library no body can be taken for a part, so every body is a printed one: nothing is left unchecked.
    if (!library) return none;
    const described = await client.request<BatchResult>(
      'engine.batch',
      { commands: parts.map((part) => ({ command: 'component.metadata', params: { component: part.id } })), rollback: false },
      60_000,
    );
    if (described.failed) throw new Error(`${described.failed.command} failed: ${described.failed.error}`);
    const candidates = partCandidates(parts, described.results, library, checks.log);
    if (candidates.length === 0) return none;
    const references = await checks.references(candidates);
    const measured = await client.request<BatchResult>(
      'engine.batch',
      { commands: [{ command: 'inspect.measure', params: { bodies: candidates.map((candidate) => candidate.body) } }], rollback: false },
      60_000,
    );
    if (measured.failed) throw new Error(`${measured.failed.command} failed: ${measured.failed.error}`);
    // The faces one by one, where they can still decide: the reference is there and the body has as many faces.
    const steps: { command: string; params: Record<string, unknown> }[] = [];
    const spans = candidates.map(({ body, description }) => {
      const reference = references.get(description);
      const count = faceCount(measuredBody(measured.results[0], body));
      if (!reference || !('shape' in reference) || count !== reference.shape.faces) return null;
      steps.push(...faceSteps(body, count));
      return [steps.length - count, steps.length] as const;
    });
    const faces = steps.length > 0 ? await client.request<BatchResult>('engine.batch', { commands: steps, rollback: false }, 60_000) : null;
    if (faces?.failed) throw new Error(`${faces.failed.command} failed: ${faces.failed.error}`);
    return boughtAmong(candidates, measured.results[0], spans.map((span) => (span && faces ? faces.results.slice(span[0], span[1]) : undefined)), references, checks.log);
  } catch (error) {
    checks.log(`standard parts could not be told from printed bodies (${(error as Error).message}); every body counts as printed`);
    return { ...none, unchecked: [(error as Error).message] };
  }
}

/** How often each component is placed in the design, through the subassemblies it lies in (`component.list`). */
function placements(listing: unknown): (component: number) => number {
  const components = (listing as { components?: unknown } | undefined)?.components;
  const byId = new Map<unknown, { parent?: unknown; occurrences?: unknown }>();
  for (const entry of Array.isArray(components) ? (components as { id?: unknown; parent?: unknown; occurrences?: unknown }[]) : []) byId.set(entry.id, entry);
  const count = (id: unknown, depth: number): number => {
    const entry = byId.get(id);
    if (!entry || entry.parent === null || depth > 50) return entry ? 1 : 0;
    const occurrences = Array.isArray(entry.occurrences) ? (entry.occurrences as { parent?: unknown }[]) : [];
    return occurrences.reduce((sum, occurrence) => sum + count(occurrence.parent, depth + 1), 0);
  };
  // A standard part is in the design, so it is listed at least once however its placements read.
  return (component) => Math.max(1, count(component, 0));
}

/**
 * The parts to buy, counted, for the sharing package: the standard parts as the mirror tells them,
 * each as often as it is placed. Not `assembly.bom`: its rows follow part number and BOM type, which
 * the assistant can write, so a bought part could fall out of it and a printed one get in.
 */
export function hardwareOf(parts: readonly BoughtPart[], listing: unknown): { count: number; name: string; standard: string }[] {
  const placed = placements(listing);
  const rows = new Map<string, { count: number; name: string; standard: string }>();
  for (const part of parts) {
    const row = rows.get(part.description) ?? { count: 0, name: part.description.slice(0, 200), standard: part.partNumber };
    row.count += placed(part.component);
    rows.set(part.description, row);
  }
  return [...rows.values()].sort((a, b) => a.standard.localeCompare(b.standard)).slice(0, 100);
}

/** The checks of a caller without a log of its own (the audit harness): the installed SolidCraft's `solidcraft-cli`. */
function standaloneChecks(cacheDir: string): PartChecks {
  const log = (message: string) => console.warn(message);
  const cli = () => {
    const executable = findExecutable(systemEnvironment);
    if (!executable) throw new Error('SolidCraft is not installed');
    return cliBeside(executable);
  };
  // Nothing mirrors again for this caller, so it waits for the references.
  return { log, references: cliReferences({ cli, dir: cacheDir, log }).ready };
}

/** The joints from `joint.list` (ADR 0027), checked field by field; a joint or value that reads oddly is left out. */
const vec = (value: unknown): [number, number, number] | null =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)) ? (value as [number, number, number]) : null;

/** The bodies each occurrence places, by occurrence id, from `component.list`. */
function bodiesByOccurrence(components: unknown): Map<number, string[]> {
  const placed = new Map<number, string[]>();
  const entries = (components as { components?: unknown } | undefined)?.components;
  if (!Array.isArray(entries)) return placed;
  for (const entry of entries as { bodies?: unknown; occurrences?: unknown }[]) {
    const bodies = Array.isArray(entry.bodies) ? entry.bodies.filter((name): name is string => typeof name === 'string') : [];
    for (const occurrence of Array.isArray(entry.occurrences) ? (entry.occurrences as { id?: unknown }[]) : []) {
      if (Number.isInteger(occurrence.id)) placed.set(occurrence.id as number, bodies);
    }
  }
  return placed;
}

/** The occurrences a joint moves: its `b` and everything joined on beyond it, never back through `a`. */
function movedBy(joint: { a?: unknown; b?: unknown }, joints: { a?: unknown; b?: unknown }[]): number[] {
  if (!Number.isInteger(joint.a) || !Number.isInteger(joint.b)) return [];
  const moved = new Set<number>([joint.b as number]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const other of joints) {
      if (other === joint || !Number.isInteger(other.a) || !Number.isInteger(other.b)) continue;
      for (const [near, far] of [[other.a, other.b], [other.b, other.a]] as [number, number][]) {
        if (moved.has(near) && !moved.has(far) && far !== joint.a) {
          moved.add(far);
          grew = true;
        }
      }
    }
  }
  return [...moved];
}

/**
 * The motion links of `joint.list` (gears, racks, screws, cams as SolidCraft 0.40 lists them): the
 * value `ib` of joint `b` is `offset + ratio ×` the value `ia` of joint `a`. By follower, `joint:index`.
 */
function followersOf(listing: unknown): Map<string, { joint: number; index: number; ratio: number; offset: number }> {
  const followers = new Map<string, { joint: number; index: number; ratio: number; offset: number }>();
  const links = (listing as { links?: unknown } | undefined)?.links;
  if (!Array.isArray(links)) return followers;
  const index = (value: unknown) => (value === undefined ? 0 : Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 5 ? (value as number) : null);
  for (const link of links as Record<string, unknown>[]) {
    const [ia, ib] = [index(link.ia), index(link.ib)];
    if (!Number.isInteger(link.a) || !Number.isInteger(link.b) || (link.a as number) < 0 || ia === null || ib === null) continue;
    if (typeof link.ratio !== 'number' || !Number.isFinite(link.ratio)) continue;
    const offset = typeof link.offset === 'number' && Number.isFinite(link.offset) ? link.offset : 0;
    followers.set(`${String(link.b)}:${String(ib)}`, { joint: link.a as number, index: ia, ratio: link.ratio, offset });
  }
  return followers;
}

export function jointsOf(listing: unknown, components?: unknown): Joint[] {
  const placed = bodiesByOccurrence(components);
  const followers = followersOf(listing);
  const joints = (listing as { joints?: unknown } | undefined)?.joints;
  if (!Array.isArray(joints)) return [];
  const limit = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  return (joints as Record<string, unknown>[])
    .filter((joint) => Number.isInteger(joint.id) && (joint.id as number) >= 0 && joint.suppressed !== true)
    .slice(0, 200)
    .map((joint) => {
      const frame = joint.frame_a as { origin?: unknown; z?: unknown } | undefined;
      const origin = vec(frame?.origin);
      const axis = vec(frame?.z);
      const bodies = movedBy(joint, joints as Record<string, unknown>[]).flatMap((occurrence) => placed.get(occurrence) ?? []).slice(0, 500);
      return {
        id: joint.id as number,
        name: text(joint.name, 200) ?? `#${String(joint.id)}`,
        type: text(joint.type, 40) ?? 'joint',
        ...(origin && axis && bodies.length > 0 ? { origin, axis, bodies } : {}),
        values: (Array.isArray(joint.values) ? (joint.values as Record<string, unknown>[]) : [])
          .filter((value) => (value.unit === 'deg' || value.unit === 'mm') && typeof value.value === 'number' && Number.isFinite(value.value))
          .slice(0, 6)
          .map((value, index) => {
            const follows = followers.get(`${String(joint.id)}:${String(index)}`);
            return {
              unit: value.unit as 'deg' | 'mm',
              value: value.value as number,
              limits: Array.isArray(value.limits) ? ([limit(value.limits[0]), limit(value.limits[1])] as [number | null, number | null]) : null,
              ...(follows ? { follows } : {}),
            };
          }),
      };
    })
    .filter((joint) => joint.values.length > 0);
}

export function count(value: unknown): number {
  return Number.isInteger(value) && (value as number) > 0 ? (value as number) : 0;
}

export interface BatchResult {
  completed: number;
  results: unknown[];
  failed?: { index: number; command: string; error: string };
}

/** Exports wait behind a running rebuild, which can take minutes on large parts. */
const BATCH_TIMEOUT_MS = 10 * 60 * 1000;

/** Upper bound of mirrored sketch segments per revision (about 6 MB of positions). */
const MAX_SKETCH_SEGMENTS = 250_000;

/** Sketches worth showing: the one being edited and every visible one (SolidCraft hides a sketch once a feature consumes it). */
function sketchesToMirror(inspect: InspectResult): { id: number; active: boolean }[] {
  const active = Number.isInteger(inspect.active_sketch) ? (inspect.active_sketch as number) : null;
  return (inspect.sketches ?? [])
    .filter((sketch) => Number.isInteger(sketch.id) && (sketch.visible !== false || sketch.id === active))
    .map((sketch) => ({ id: sketch.id as number, active: sketch.id === active }));
}

/** Flattens the `sketch.inspect` results; a sketch that cannot be read is left out, the bodies still show. */
function mirrorSketches(results: unknown[], wanted: { id: number; active: boolean }[]): MirroredSketch[] {
  const sketches: MirroredSketch[] = [];
  let segments = 0;
  for (const [i, entry] of wanted.entries()) {
    let read: { name: string; lines: SketchLines };
    try {
      const sketch = sketchFromInspect(results[i]);
      read = { name: sketch.name, lines: tessellateSketch(sketch) };
    } catch {
      continue;
    }
    const { name, lines } = read;
    segments += lines.styles.length;
    if (segments > MAX_SKETCH_SEGMENTS) break;
    sketches.push({ id: entry.id, name, active: entry.active, positions: lines.positions, styles: lines.styles, curves: lines.curves });
  }
  return sketches;
}

/** The structure with each body's own colour from `appearance.list` (`bodies: {name: {color}}`). */
export function withColours(structure: Structure, listing: unknown): Structure {
  const assigned = (listing as { bodies?: Record<string, { color?: unknown }> } | undefined)?.bodies ?? {};
  return {
    ...structure,
    bodies: structure.bodies.map((body) => {
      const colour = assigned[body.name]?.color;
      return typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour) ? { ...body, colour: colour.toLowerCase() } : body;
    }),
  };
}

/**
 * Mirrors the active design (ADR 0004): one `engine.batch` with `document.revision`, then
 * `model.faces` and a face-tagged 3MF export per visible body, then `sketch.inspect` per visible
 * or active sketch (issue #21). Exports go only into the disposable cache folder; `allow_paths`
 * makes SolidCraft refuse any other path.
 */
export async function mirrorActiveDesign(client: ControlRequester, cacheDir: string, checks: PartChecks = standaloneChecks(cacheDir)): Promise<MirrorRevision> {
  const started = performance.now();
  await mkdir(cacheDir, { recursive: true });
  // The revision before anything is read: a change while this runs makes the scheduler mirror once
  // more. Read last, it named the new revision for the old structure, and the scheduler dropped the
  // newer request as done (a sketch added right after a mirror began never showed).
  const first = await client.request<BatchResult>(
    'engine.batch',
    { commands: [{ command: 'document.revision', params: {} }, { command: 'document.inspect', params: {} }], rollback: false },
    60_000,
  );
  if (first.failed) throw new Error(`${first.failed.command} failed: ${first.failed.error}`);
  const startRevision = (first.results[0] as { revision?: unknown } | undefined)?.revision;
  const inspect = (first.results[1] ?? {}) as InspectResult;
  const designName = typeof inspect.name === 'string' ? inspect.name : '';
  const bodies = (inspect.bodies ?? [])
    .filter((body) => body.visible !== false && typeof body.name === 'string' && body.name !== '')
    .map((body) => body.name as string);

  const stamp = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const files = bodies.map((_, i) => join(cacheDir, `mirror-${stamp}-${i}.3mf`));
  const commands: { command: string; params: Record<string, unknown> }[] = [{ command: 'document.revision', params: {} }];
  bodies.forEach((name, i) => {
    commands.push(
      { command: 'model.faces', params: { body: name } },
      { command: 'file.export', params: { path: files[i], format: '3mf-tagged', bodies: [name], quality: 'standard' } },
    );
  });
  const sketches = sketchesToMirror(inspect);
  for (const sketch of sketches) commands.push({ command: 'sketch.inspect', params: { sketch: sketch.id } });
  // Standard parts are told by their components (`boughtParts`).
  commands.push({ command: 'component.list', params: {} });
  // Colours given to bodies (a logo in colours for a multi-colour print), shown in the view.
  commands.push({ command: 'appearance.list', params: {} });
  // Joints of parts that move against each other, with where they stand (ADR 0027).
  commands.push({ command: 'joint.list', params: {} });

  try {
    const batch = await client.request<BatchResult>(
      'engine.batch',
      { commands, rollback: false, allow_paths: [cacheDir] },
      BATCH_TIMEOUT_MS,
    );
    if (batch.failed) {
      throw new Error(`${batch.failed.command} failed: ${batch.failed.error}`);
    }
    const head = batch.results[0] as { document_id?: unknown; revision?: unknown } | undefined;
    if (typeof head?.document_id !== 'string' || typeof head.revision !== 'number') {
      throw new Error('document.revision returned no revision');
    }
    const tail = 1 + bodies.length * 2 + sketches.length;
    const joints = jointsOf(batch.results[tail + 2], batch.results[tail]);
    const told = await boughtParts(client, batch.results[tail], checks);
    // Parts are printed together only where a hinge joins them, so a design without joints is not asked.
    const printGroups = joints.length > 0 ? await printGroupsIn(client, batch.results[tail], checks.log) : [];
    const standardParts = told.bought.map((part) => part.body).slice(0, 500);
    const pendingParts = told.pending.slice(0, 500);
    const structure = withColours({ ...structureOf(inspect), standardParts, ...(pendingParts.length > 0 ? { pendingParts } : {}) }, batch.results[tail + 1]);
    const mirrored: MirroredBody[] = [];
    for (const [i, name] of bodies.entries()) {
      const faces = faceTableFromModelFaces(batch.results[1 + i * 2], name, designName);
      const file = files[i];
      if (!file) continue;
      mirrored.push({ name, mesh: new Uint8Array(await readFile(file)), faces });
    }
    return {
      documentId: head.document_id,
      revision: typeof startRevision === 'number' ? Math.min(startRevision, head.revision) : head.revision,
      designName,
      bodies: mirrored,
      sketches: mirrorSketches(batch.results.slice(1 + bodies.length * 2), sketches),
      structure: { ...structure, ...(joints.length > 0 ? { joints } : {}), ...(printGroups.length > 0 ? { printGroups } : {}) },
      history: { undo: count(inspect.undo), redo: count(inspect.redo) },
      mirrorMs: Math.round(performance.now() - started),
    };
  } finally {
    await Promise.all(files.map((file) => rm(file, { force: true })));
  }
}

export interface RevisionTarget {
  documentId: string;
  revision: number;
}

/**
 * Runs one mirror at a time and coalesces requests: while a mirror runs, only the newest
 * requested revision is remembered and mirrored next. Results for revisions that are already
 * outdated are still delivered, because the previous one would be older still.
 */
/** How long after a failed mirror that left a body waiting for its part the mirror is tried again, and how often. */
const MIRROR_RETRY_MS = 5000;
const MIRROR_RETRIES = 3;

export class MirrorScheduler {
  private running = false;
  private next: RevisionTarget | null = null;
  private lastDelivered: RevisionTarget | null = null;
  /** The revision last delivered, to deliver it again without the bodies that waited for their part. */
  private last: MirrorRevision | null = null;
  /** Whether a body was handed back to the print check because a mirror failed: the mirror that says what it is is still owed. */
  private owed = false;
  private retries = 0;
  private cancelRetry: (() => void) | null = null;

  constructor(
    private readonly run: () => Promise<MirrorRevision>,
    private readonly callbacks: {
      started(): void;
      delivered(revision: MirrorRevision): void;
      failed(error: Error): void;
      idle(): void;
    },
    private readonly later: (callback: () => void, ms: number) => () => void = (callback, ms) => {
      const timer = setTimeout(callback, ms);
      timer.unref();
      return () => {
        clearTimeout(timer);
      };
    },
  ) {}

  request(target: RevisionTarget): void {
    if (sameTarget(target, this.lastDelivered) && !this.running) return;
    this.next = target;
    if (!this.running) void this.loop();
  }

  reset(): void {
    this.next = null;
    this.lastDelivered = null;
    this.stale = false;
    this.last = null;
    this.owed = false;
    this.retries = 0;
    this.cancelRetry?.();
    this.cancelRetry = null;
  }

  /**
   * Mirrors the same revision once more: something outside the design changed what the mirror
   * makes of it (a standard part's reference was built). A mirror that is running may have read
   * the old state, so it is followed by one more; several calls meanwhile make one mirror.
   */
  refresh(): void {
    if (this.running) this.stale = true;
    else if (this.lastDelivered) {
      this.next = this.lastDelivered;
      void this.loop();
    }
  }

  private stale = false;

  private async loop(): Promise<void> {
    this.running = true;
    this.callbacks.started();
    while (this.next) {
      const target = this.next;
      this.next = null;
      this.stale = false;
      try {
        const revision = await this.run();
        this.lastDelivered = { documentId: revision.documentId, revision: revision.revision };
        this.last = revision;
        this.owed = false;
        this.retries = 0;
        this.callbacks.delivered(revision);
        // The export saw a newer state than the one asked for: nothing older needs mirroring.
        // (`next` may have been set by request() while the export ran.)
        const queued = this.next as RevisionTarget | null;
        if (queued && revision.documentId === queued.documentId && revision.revision >= queued.revision) {
          this.next = null;
        }
        // (`stale` may have been set by refresh() while the mirror ran.)
        if (this.stale as boolean) this.next ??= this.lastDelivered;
      } catch (error) {
        this.callbacks.failed(error instanceof Error ? error : new Error(String(error)));
        // A reference built while this mirror failed is not lost: the mirror is tried once more.
        if (this.stale as boolean) {
          this.next ??= target;
          continue;
        }
        // A body that waits for its part is left out of the print check only until the mirror that follows. That
        // mirror failed: the last revision goes out again with the body as a printed one, so it is checked, and the
        // mirror is tried again after a while (a request for the same revision would be taken for done).
        if (this.last?.structure.pendingParts?.length) {
          const structure = { ...this.last.structure };
          delete structure.pendingParts;
          this.last = { ...this.last, structure };
          this.callbacks.delivered(this.last);
          this.owed = true;
          this.retries = 0;
        }
        if (this.owed && !this.cancelRetry && this.retries < MIRROR_RETRIES) {
          this.retries += 1;
          this.cancelRetry = this.later(() => {
            this.cancelRetry = null;
            this.refresh();
          }, MIRROR_RETRY_MS);
        }
        if (sameTarget(this.next, target)) this.next = null;
        this.running = false;
        return;
      }
    }
    this.running = false;
    this.callbacks.idle();
  }
}

function sameTarget(a: RevisionTarget | null, b: RevisionTarget | null): boolean {
  return a !== null && b !== null && a.documentId === b.documentId && a.revision === b.revision;
}
