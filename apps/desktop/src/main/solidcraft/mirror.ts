import { mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { faceTableFromModelFaces } from '@partbuddy/geometry';

import type { MirroredBody, MirrorRevision } from '../../shared/contract';

/** The part of the control client the mirror needs. */
export interface ControlRequester {
  request<T = unknown>(method: string, params?: Record<string, unknown>, timeoutMs?: number): Promise<T>;
}

interface InspectResult {
  name?: unknown;
  bodies?: { name?: unknown; visible?: unknown }[];
}

interface BatchResult {
  completed: number;
  results: unknown[];
  failed?: { index: number; command: string; error: string };
}

/** Exports wait behind a running rebuild, which can take minutes on large parts. */
const BATCH_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * Mirrors the active design (ADR 0004): one `engine.batch` with `document.revision`, then
 * `model.faces` and a face-tagged 3MF export per visible body. Exports go only into the
 * disposable cache folder; `allow_paths` makes SolidCraft refuse any other path.
 */
export async function mirrorActiveDesign(client: ControlRequester, cacheDir: string): Promise<MirrorRevision> {
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
    return { documentId: head.document_id, revision: head.revision, designName, bodies: mirrored };
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
