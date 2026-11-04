import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { faceTableFromModelFaces, sketchFromInspect, tessellateSketch, type SketchLines } from '@partbuddy/geometry';

import type { MirroredBody, MirroredSketch, MirrorRevision, Structure } from '../../shared/contract';

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
  };
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

/**
 * Mirrors the active design (ADR 0004): one `engine.batch` with `document.revision`, then
 * `model.faces` and a face-tagged 3MF export per visible body, then `sketch.inspect` per visible
 * or active sketch (issue #21). Exports go only into the disposable cache folder; `allow_paths`
 * makes SolidCraft refuse any other path.
 */
export async function mirrorActiveDesign(client: ControlRequester, cacheDir: string): Promise<MirrorRevision> {
  const started = performance.now();
  await mkdir(cacheDir, { recursive: true });
  const inspect = await client.request<InspectResult>('document.inspect', {}, 60_000);
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
    const mirrored: MirroredBody[] = [];
    for (const [i, name] of bodies.entries()) {
      const faces = faceTableFromModelFaces(batch.results[1 + i * 2], name, designName);
      const file = files[i];
      if (!file) continue;
      mirrored.push({ name, mesh: new Uint8Array(await readFile(file)), faces });
    }
    return {
      documentId: head.document_id,
      revision: head.revision,
      designName,
      bodies: mirrored,
      sketches: mirrorSketches(batch.results.slice(1 + bodies.length * 2), sketches),
      structure: structureOf(inspect),
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
