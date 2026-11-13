import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { assemblyPlanSchema, type AssemblyPlan } from '../../shared/assembly';
import { printFacesSchema } from '../../shared/contract';

/**
 * The assembly order of a project (ADR 0026), kept as `assembly.json` next to its design. A project
 * without the file, or with one that does not pass the schema, has none; the view then proposes an
 * order from the geometry. Older projects have no file and open as before.
 */

export const ASSEMBLY_FILE = 'assembly.json';

export function readAssembly(folder: string, log: (message: string) => void = () => undefined): AssemblyPlan | null {
  let text: string;
  try {
    text = readFileSync(join(folder, ASSEMBLY_FILE), 'utf8');
  } catch {
    return null;
  }
  try {
    const parsed = assemblyPlanSchema.safeParse(JSON.parse(text));
    if (parsed.success) return parsed.data;
    log(`assembly order not read: ${parsed.error.issues[0]?.message ?? 'does not match the schema'}`);
  } catch (error) {
    log(`assembly order not read: ${(error as Error).message}`);
  }
  return null;
}

/** Writes the plan through a temporary file, so a crash never leaves half a file. */
export function writeAssembly(folder: string, plan: AssemblyPlan): void {
  const file = join(folder, ASSEMBLY_FILE);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(assemblyPlanSchema.parse(plan), null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}

/**
 * Print faces (B8), by body, kept as `print-faces.json` so the plate view, the print check and the export lay each
 * part on its face. SolidCraft keeps the faces in the design and lists them nowhere but in its saved file
 * (`print_faces` of `document.json`), so the file follows that after every save (`resolvePrintFaces`): an undone,
 * renamed or rebuilt print face reads as SolidCraft holds it (audit D20). Between two saves a mechanism, a template,
 * the user and the assistant (printFaceWatch.ts) say theirs when they set it.
 */
export const PRINT_FACES_FILE = 'print-faces.json';

export function readPrintFaces(folder: string): Record<string, string> {
  try {
    const parsed = printFacesSchema.safeParse(JSON.parse(readFileSync(join(folder, PRINT_FACES_FILE), 'utf8')));
    return parsed.success ? parsed.data : {};
  } catch {
    return {};
  }
}

/** Writes all print faces at once, through a temporary file like the assembly order. */
export function writePrintFaces(folder: string, faces: Readonly<Record<string, string>>): void {
  const file = join(folder, PRINT_FACES_FILE);
  writeFileSync(`${file}.tmp`, `${JSON.stringify(printFacesSchema.parse(faces), null, 2)}\n`);
  renameSync(`${file}.tmp`, file);
}

/** Keeps or clears (null) one body's print face. */
export function keepPrintFace(folder: string, body: string, face: string | null): void {
  writePrintFaces(folder, withPrintFace(readPrintFaces(folder), body, face));
}

/** The print faces with one body's set or cleared (null). */
export function withPrintFace(faces: Readonly<Record<string, string>>, body: string, face: string | null): Record<string, string> {
  const next = Object.fromEntries(Object.entries(faces).filter(([name]) => name !== body));
  if (face) next[body] = face;
  return next;
}

type Vec3 = [number, number, number];

/** A print face as SolidCraft saves it: the name the face had when it was set, and a point on its plane. */
export interface SavedPrintFace {
  name: string;
  point: Vec3;
}

const vec3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));

/** The print faces in a saved design's `document.json` (`print_faces`, by body); an entry that reads oddly is left out. */
export function savedPrintFaces(document: unknown): Record<string, SavedPrintFace> {
  const entries = (document as { print_faces?: unknown } | null | undefined)?.print_faces;
  const faces: Record<string, SavedPrintFace> = {};
  if (typeof entries !== 'object' || entries === null) return faces;
  for (const [body, entry] of Object.entries(entries as Record<string, { name?: unknown; point?: unknown }>)) {
    if (typeof entry.name === 'string' && entry.name !== '' && vec3(entry.point)) faces[body] = { name: entry.name, point: entry.point };
  }
  return faces;
}

/** How far a point may lie off a face's plane and still be on it: SolidCraft's own tolerance of `inspect.compare`. */
const ON_PLANE_MM = 0.01;

/**
 * The face of each saved print face in the mirrored bodies (`tables`, the face table of each body): the face of that
 * name, or, when SolidCraft kept a name the body no longer has (a cut split the face: "F1:+z" became "F1:+z#[…]",
 * measured with 0.40.1), the largest flat face whose plane holds the saved point and so lays the body the same way.
 * `lost` names the bodies whose print face is on no flat face of them any more: they lie as designed, as SolidCraft's
 * slicer export lays them. A body that is not mirrored (hidden) keeps its saved name.
 * shortcut: the point is taken in the body's frame as `model.faces` gives it; a print face of a body in a moved
 * component may then read as lost, which says so rather than lays it wrong; compare in the component's frame if it shows.
 */
export function resolvePrintFaces(
  saved: Readonly<Record<string, SavedPrintFace>>,
  tables: readonly { name: string; faces: { faces: readonly { name: string; area: number; centroid: Vec3; planeNormal?: Vec3 | undefined }[] } }[],
): { faces: Record<string, string>; lost: string[] } {
  const faces: Record<string, string> = {};
  const lost: string[] = [];
  for (const [body, print] of Object.entries(saved)) {
    const table = tables.find((entry) => entry.name === body)?.faces.faces;
    if (!table) {
      faces[body] = print.name;
      continue;
    }
    const flat = table.filter((face) => face.planeNormal);
    const named = flat.find((face) => face.name === print.name);
    const onPlane = flat
      .filter(({ centroid, planeNormal: n = [0, 0, 0] }) => Math.abs((print.point[0] - centroid[0]) * n[0] + (print.point[1] - centroid[1]) * n[1] + (print.point[2] - centroid[2]) * n[2]) <= ON_PLANE_MM)
      .sort((a, b) => b.area - a.area);
    const face = named ?? onPlane[0];
    if (face) faces[body] = face.name;
    else lost.push(body);
  }
  return { faces, lost };
}
