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

/**
 * The print faces of the open design, the one place that keeps and reads them: in `print-faces.json` of its project
 * folder, or, while the design has none, here for that design (audit H-13); SolidCraft keeps them in the design, so
 * the first save brings them into the folder. After a save the kept faces become SolidCraft's (`takeSaved`).
 */
export class PrintFaceKeeper {
  private loose: { documentId: string | null; faces: Record<string, string> } = { documentId: null, faces: {} };
  /** Bodies already said to have lost their print face, so a lost face is said once, not after every save. */
  private told = new Set<string>();

  constructor(
    private readonly options: {
      folder: () => string | null;
      documentId: () => string | null;
      /** Every change of the kept faces, for the plate view and the print check. */
      changed: (faces: Record<string, string>) => void;
    },
  ) {}

  now(): Record<string, string> {
    const folder = this.options.folder();
    if (folder) return readPrintFaces(folder);
    return this.loose.documentId === this.options.documentId() ? this.loose.faces : {};
  }

  /** Keeps or clears (null) one body's print face, as it is set: by the user, the assistant, a mechanism or a template. */
  keep(body: string, face: string | null): void {
    this.set(withPrintFace(this.now(), body, face));
  }

  /**
   * Takes the print faces SolidCraft saved, matched to the mirrored faces (`resolvePrintFaces`); null (the file is
   * older than the design, or there is none) leaves the kept faces as they are. Gives the bodies whose print face
   * lies on no flat face of them any more and that were not said before: they now lie as designed.
   */
  takeSaved(saved: { faces: Record<string, string>; lost: string[] } | null): string[] {
    if (!saved || !this.options.folder()) return [];
    const kept = this.now();
    const same = Object.keys(kept).length === Object.keys(saved.faces).length && Object.entries(saved.faces).every(([body, face]) => kept[body] === face);
    if (!same) this.set(saved.faces);
    const news = saved.lost.filter((body) => !this.told.has(body));
    this.told = new Set(saved.lost);
    return news;
  }

  private set(faces: Record<string, string>): void {
    const folder = this.options.folder();
    if (folder) writePrintFaces(folder, faces);
    else this.loose = { documentId: this.options.documentId(), faces };
    this.options.changed(faces);
  }
}

type Vec3 = [number, number, number];

/** A print face as SolidCraft saves it: the name the face had when it was set, and a point on its plane. */
export interface SavedPrintFace {
  name: string;
  point: Vec3;
  /** The face's outward normal where SolidCraft's certificate says it (a box face: `axis` and `high`). */
  normal?: Vec3;
}

const vec3 = (value: unknown): value is Vec3 => Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));

/** The normal a box face's certificate names (`{kind: 'box', axis: 0…2, high}`, SolidCraft 0.40.1); none for other kinds. */
function certifiedNormal(certificate: unknown): Vec3 | undefined {
  const { kind, axis, high } = (certificate ?? {}) as { kind?: unknown; axis?: unknown; high?: unknown };
  if (kind !== 'box' || typeof high !== 'boolean' || (axis !== 0 && axis !== 1 && axis !== 2)) return undefined;
  const normal: Vec3 = [0, 0, 0];
  normal[axis] = high ? 1 : -1;
  return normal;
}

/** The print faces in a saved design's `document.json` (`print_faces`, by body); an entry that reads oddly is left out. */
export function savedPrintFaces(document: unknown): Record<string, SavedPrintFace> {
  const entries = (document as { print_faces?: unknown } | null | undefined)?.print_faces;
  const faces: Record<string, SavedPrintFace> = {};
  if (typeof entries !== 'object' || entries === null) return faces;
  for (const [body, entry] of Object.entries(entries as Record<string, { name?: unknown; point?: unknown; certificate?: unknown }>)) {
    if (typeof entry.name !== 'string' || entry.name === '' || !vec3(entry.point)) continue;
    const normal = certifiedNormal(entry.certificate);
    faces[body] = { name: entry.name, point: entry.point, ...(normal ? { normal } : {}) };
  }
  return faces;
}

/** How far a point may lie off a face's plane and still be on it, and two normals apart and still alike. */
const ON_PLANE_MM = 0.01;
const SAME_NORMAL = 1e-6;

type TableFace = { name: string; centroid: Vec3; planeNormal?: Vec3 | undefined };
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const minus = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const alike = (a: Vec3, b: Vec3) => Math.abs(dot(a, b) - 1) <= SAME_NORMAL;

/**
 * The face of each saved print face in the mirrored bodies (`tables`, the face table of each body), so the check lays
 * the body as SolidCraft's slicer export does:
 * 1. the face of that name;
 * 2. when SolidCraft kept a name the body no longer has because a cut split the face ("F1:+z" became
 *    "F1:+z#[F1:-x,F2:-x]" and "F1:+z#[F1:+x,F2:+x]", measured with 0.40.1), the piece nearest the saved point:
 *    pieces of one face share its normal;
 * 3. else a flat face whose plane holds the saved point, with the certified normal where SolidCraft saved one (a box
 *    face), and only when all such faces point the same way: a face on the same plane facing the other way (a step's
 *    underside) would turn the body over.
 * `lost` names the bodies none of this finds: they lie as designed, as SolidCraft's slicer export lays them when the
 * face is gone. A body that is not mirrored (hidden) keeps its saved name.
 * shortcut: the point is taken in the body's frame as `model.faces` gives it; a print face of a body in a moved
 * component may then read as lost, which says so rather than lays it wrong; compare in the component's frame if it shows.
 * shortcut: which piece of a split face SolidCraft's own slicer export lays on is not measured; all pieces share the
 * normal, so the turn is the same and only the place on the bed may differ.
 */
export function resolvePrintFaces(saved: Readonly<Record<string, SavedPrintFace>>, tables: readonly { name: string; faces: { faces: readonly TableFace[] } }[]): { faces: Record<string, string>; lost: string[] } {
  const faces: Record<string, string> = {};
  const lost: string[] = [];
  for (const [body, print] of Object.entries(saved)) {
    const table = tables.find((entry) => entry.name === body)?.faces.faces;
    if (!table) {
      faces[body] = print.name;
      continue;
    }
    const flat = table.filter((face): face is TableFace & { planeNormal: Vec3 } => Boolean(face.planeNormal));
    const nearest = (candidates: typeof flat) => [...candidates].sort((a, b) => dot(minus(a.centroid, print.point), minus(a.centroid, print.point)) - dot(minus(b.centroid, print.point), minus(b.centroid, print.point)))[0];
    const named = flat.find((face) => face.name === print.name);
    const pieces = flat.filter((face) => face.name.startsWith(`${print.name}#`));
    const onPlane = flat.filter((face) => Math.abs(dot(minus(print.point, face.centroid), face.planeNormal)) <= ON_PLANE_MM && (!print.normal || alike(face.planeNormal, print.normal)));
    const oneWay = onPlane.every((face) => alike(face.planeNormal, onPlane[0]?.planeNormal ?? face.planeNormal));
    const face = named ?? nearest(pieces) ?? (oneWay ? nearest(onPlane) : undefined);
    if (face) faces[body] = face.name;
    else lost.push(body);
  }
  return { faces, lost };
}
