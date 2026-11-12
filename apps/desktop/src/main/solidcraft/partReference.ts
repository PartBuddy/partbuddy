import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { LibraryPart } from './standardParts';

/**
 * What a body of SolidCraft's library looks like, to hold a body in a design against it. A
 * component's description says "Hex nut M3", and anything can be moved or joined into that
 * component, so the mirror takes a body for the part only when it has the shape SolidCraft builds
 * for that description: `solidcraft-cli` builds the part by itself, outside the design, and both
 * are measured the same way (`inspect.measure`).
 */

/** Volume, surface and counts of a body: the same however the part is turned or placed. */
export interface PartShape {
  volume: number;
  area: number;
  faces: number;
  edges: number;
  vertices: number;
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

/** Reads the references of parts, by description; a part SolidCraft does not build that way is left out. */
export type ReferenceReader = (parts: readonly PartQuery[]) => Promise<Map<string, PartReference>>;

/** The shape in one body's entry of `inspect.measure`; null for a body that is open or reads oddly. */
export function shapeOf(measured: unknown): PartShape | null {
  const body = measured as { volume_mm3?: unknown; area_mm2?: unknown; faces?: unknown; edges?: unknown; vertices?: unknown } | null | undefined;
  const size = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
  const count = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;
  if (!body || !size(body.volume_mm3) || !size(body.area_mm2) || !count(body.faces) || !count(body.edges) || !count(body.vertices)) return null;
  return { volume: body.volume_mm3, area: body.area_mm2, faces: body.faces, edges: body.edges, vertices: body.vertices };
}

/**
 * Measured with SolidCraft 0.40.1 over all 13 families: a part turned, hidden or resized differs
 * from the one built alone by at most 6e-11 of its volume and area.
 */
const SHAPE_TOLERANCE = 1e-6;

/** Whether two bodies have the same shape: counts equal, volume and area within the measuring noise. */
export function sameShape(a: PartShape, b: PartShape): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) <= SHAPE_TOLERANCE * Math.max(x, y);
  return a.faces === b.faces && a.edges === b.edges && a.vertices === b.vertices && close(a.volume, b.volume) && close(a.area, b.area);
}

const referenceName = (index: number) => `ref${String(index)}`;

/** The steps that build each part alone and measure it: every part a component of a name of its own. */
export function referenceScript(parts: readonly PartQuery[]): { command: string; params: Record<string, unknown> }[] {
  return [
    ...parts.map(({ part }, i) => ({
      command: 'parts.insert',
      params: { family: part.family, size: part.size, ...(part.length === null ? {} : { length: part.length }), name: referenceName(i), point: [i * 1000, 0, 0] },
    })),
    { command: 'component.list', params: {} },
    ...parts.map((_, i) => ({ command: 'component.metadata', params: { component: referenceName(i) } })),
    { command: 'inspect.measure', params: {} },
  ];
}

/**
 * The references in the results of `referenceScript`. A part counts only when SolidCraft described
 * what it built in exactly the words asked for, so a description read wrongly gives no reference.
 */
export function referencesOf(parts: readonly PartQuery[], results: readonly unknown[]): Map<string, PartReference> {
  const references = new Map<string, PartReference>();
  const components = (results[parts.length] as { components?: unknown } | undefined)?.components;
  const bodies = (results[parts.length * 2 + 1] as { bodies?: unknown } | undefined)?.bodies;
  if (!Array.isArray(components) || !Array.isArray(bodies)) return references;
  for (const [i, { description }] of parts.entries()) {
    const component = (components as { name?: unknown; bodies?: unknown }[]).find((entry) => entry.name === referenceName(i));
    const metadata = results[parts.length + 1 + i] as { description?: unknown; part_number?: unknown } | undefined;
    if (!Array.isArray(component?.bodies) || component.bodies.length !== 1 || metadata?.description !== description) continue;
    const shape = shapeOf((bodies as { name?: unknown }[]).find((body) => body.name === (component.bodies as unknown[])[0]));
    if (shape) references.set(description, { shape, partNumber: typeof metadata.part_number === 'string' ? metadata.part_number.slice(0, 200) : '' });
  }
  return references;
}

/** A description always builds the same part in one SolidCraft, so each is built once per run of PartBuddy. */
const known = new Map<string, PartReference | null>();

/**
 * References from `solidcraft-cli run`: one process builds every part not known yet. `cli` is
 * asked each time (it throws while SolidCraft is not installed); the script lies in `dir`. A part
 * that cannot be built is logged and left out, so the parts beside it keep their references.
 */
export function cliReferences(cli: () => string, dir: string, log: (message: string) => void, env: NodeJS.ProcessEnv = process.env): ReferenceReader {
  return async (parts) => {
    const program = cli();
    const key = (description: string) => `${program}\n${description}`;
    const build = async (wanted: readonly PartQuery[]): Promise<void> => {
      await mkdir(dir, { recursive: true });
      const script = join(dir, `parts-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.json`);
      await writeFile(script, JSON.stringify(referenceScript(wanted)));
      try {
        const out = await new Promise<string>((done, fail) => {
          // Argument array, no shell (architecture: security boundaries).
          execFile(program, ['run', script, '--results', '--quiet'], { env, windowsHide: true, timeout: 2 * 60 * 1000, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (!error) done(stdout);
            else fail(new Error(stderr.trim().replace(/^error:\s*/i, '').slice(0, 500) || error.message));
          });
        });
        const built = referencesOf(wanted, JSON.parse(out) as unknown[]);
        // A description SolidCraft built as something else stays without a reference: it is not built again.
        for (const { description } of wanted) known.set(key(description), built.get(description) ?? null);
      } finally {
        await rm(script, { force: true });
      }
    };
    const missing = [...new Map(parts.filter((part) => !known.has(key(part.description))).map((part) => [part.description, part])).values()].slice(0, 200);
    if (missing.length > 0) {
      try {
        await build(missing);
      } catch (error) {
        // One description SolidCraft cannot build stops the whole script; the others are built one by one.
        const failed = (part: PartQuery, cause: unknown) => log(`no reference for the standard part "${part.description}": ${(cause as Error).message}`);
        if (missing.length === 1 && missing[0]) failed(missing[0], error);
        else for (const part of missing) await build([part]).catch((cause: unknown) => failed(part, cause));
      }
    }
    const found = new Map<string, PartReference>();
    for (const { description } of parts) {
      const reference = known.get(key(description));
      if (reference) found.set(description, reference);
    }
    return found;
  };
}
