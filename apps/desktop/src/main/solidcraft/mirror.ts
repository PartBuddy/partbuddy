import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { faceTableFromModelFaces, sketchFromInspect, tessellateSketch, type SketchLines } from '@partbuddy/geometry';

import type { Joint, MirroredBody, MirroredSketch, MirrorRevision, Structure } from '../../shared/contract';
import { isLibraryPart, standardPartsOf } from './standardParts';

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
    standardParts: standardPartsOf(inspect.metadata),
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

/** Bodies of the components `parts.insert` made, by their description, among `parts` and their `component.metadata`. */
export function libraryBodies(parts: readonly { id: number; bodies: string[] }[], metadata: readonly unknown[]): string[] {
  return parts.filter((_, i) => isLibraryPart((metadata[i] as { description?: unknown } | undefined)?.description)).flatMap((part) => part.bodies);
}

/**
 * Adds standard parts inserted without PartBuddy to the structure. Only a design with components
 * holding bodies costs a second request; one that cannot be read leaves the structure as it was.
 */
async function withLibraryParts(client: ControlRequester, structure: Structure, listing: unknown): Promise<Structure> {
  const parts = componentsWithBodies(listing);
  if (parts.length === 0) return structure;
  try {
    const reply = await client.request<BatchResult>(
      'engine.batch',
      { commands: parts.map((part) => ({ command: 'component.metadata', params: { component: part.id } })), rollback: false },
      60_000,
    );
    const found = libraryBodies(parts, reply.results);
    if (found.length === 0) return structure;
    return { ...structure, standardParts: [...new Set([...(structure.standardParts ?? []), ...found])].slice(0, 500) };
  } catch {
    return structure;
  }
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
export async function mirrorActiveDesign(client: ControlRequester, cacheDir: string): Promise<MirrorRevision> {
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
  // Standard parts the assistant inserted with `parts.insert` carry no PartBuddy mark; their component tells.
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
    const structure = withColours(await withLibraryParts(client, structureOf(inspect), batch.results[tail]), batch.results[tail + 1]);
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
      structure: joints.length > 0 ? { ...structure, joints } : structure,
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
export class MirrorScheduler {
  private running = false;
  private next: RevisionTarget | null = null;
  private lastDelivered: RevisionTarget | null = null;

  constructor(
    private readonly run: () => Promise<MirrorRevision>,
    private readonly callbacks: {
      started(): void;
      delivered(revision: MirrorRevision): void;
      failed(error: Error): void;
      idle(): void;
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
  }

  private async loop(): Promise<void> {
    this.running = true;
    this.callbacks.started();
    while (this.next) {
      const target = this.next;
      this.next = null;
      try {
        const revision = await this.run();
        this.lastDelivered = { documentId: revision.documentId, revision: revision.revision };
        this.callbacks.delivered(revision);
        // The export saw a newer state than the one asked for: nothing older needs mirroring.
        // (`next` may have been set by request() while the export ran.)
        const queued = this.next as RevisionTarget | null;
        if (queued && revision.documentId === queued.documentId && revision.revision >= queued.revision) {
          this.next = null;
        }
      } catch (error) {
        this.callbacks.failed(error instanceof Error ? error : new Error(String(error)));
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
