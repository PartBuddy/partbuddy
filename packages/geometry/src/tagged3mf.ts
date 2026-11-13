import { strFromU8, unzipSync } from 'fflate';

/** Namespace of SolidCraft's face-tag extension, version 1 (2026-10). */
export const FACE_TAG_NAMESPACE = 'https://github.com/bherbruck/solidcraft/formats/3mf-face-tags/2026/10';

export interface TaggedMesh {
  /** Body name from the 3MF object. */
  name: string;
  /** Number of B-rep faces declared by `ft:faces`. */
  faceCount: number;
  /** Vertex positions in millimetres, xyz per vertex. */
  positions: Float64Array;
  /** Vertex indices, three per triangle. */
  indices: Uint32Array;
  /** B-rep face index per triangle (`ft:face`). */
  triangleFaces: Uint32Array;
}

const MODEL_PATH = '3D/3dmodel.model';
const objectPattern = /<object\b[^>]*\bname="([^"]*)"[^>]*\bft:faces="(\d+)"[^>]*>/;
const attributePattern = /([\w:]+)\s*=\s*"([^"]*)"/g;

/** An element of the mesh: SolidCraft's way of writing it (`usual`, read at once) and any other (`any`, read attribute by attribute). */
interface Element {
  element: string;
  names: readonly string[];
  count: RegExp;
  usual: RegExp;
  any: RegExp;
}

const VERTEX: Element = { element: 'vertex', names: ['x', 'y', 'z'], count: /<vertex\b/g, usual: /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"\s*\/>/g, any: /<vertex\b([^>]*)>/g };
const TRIANGLE: Element = {
  element: 'triangle',
  names: ['v1', 'v2', 'v3', 'ft:face'],
  count: /<triangle\b/g,
  usual: /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"\s+ft:face="(\d+)"\s*\/>/g,
  any: /<triangle\b([^>]*)>/g,
};

/** The attributes of one element, in whatever order they are written. */
function attributesOf(text: string): Map<string, string> {
  return new Map([...text.matchAll(attributePattern)].map((match) => [match[1] ?? '', match[2] ?? '']));
}

/** A number the element must carry: a missing or broken one fails the parse instead of leaving a hole in the mesh (audit D30). */
function numberOf(attributes: Map<string, string>, name: string, element: string, n: number): number {
  const text = attributes.get(name);
  const value = Number(text);
  if (text === undefined || text.trim() === '' || !Number.isFinite(value)) throw new Error(`${element} ${String(n)} has no valid ${name}`);
  return value;
}

/**
 * The values of every element of a kind, in order. SolidCraft's way of writing is read in one go; only when that does
 * not account for every element is each read by its attributes, which is twice as slow (review of PR #371, K2: 414 ms
 * against 944 ms for 100 000 vertices).
 */
function valuesOf(xml: string, { element, names, count, usual, any }: Element): number[] {
  const elements = xml.match(count)?.length ?? 0;
  const values: number[] = [];
  for (const match of xml.matchAll(usual)) for (let k = 1; k <= names.length; k += 1) values.push(Number(match[k]));
  if (values.length === elements * names.length && values.every(Number.isFinite)) return values;
  values.length = 0;
  let n = 0;
  for (const match of xml.matchAll(any)) {
    const attributes = attributesOf(match[1] ?? '');
    for (const name of names) values.push(numberOf(attributes, name, element, n));
    n += 1;
  }
  return values;
}

/** The transform of a build item that leaves the mesh where it is. */
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

/**
 * Parses a face-tagged 3MF written by SolidCraft (`file.export {format: "3mf-tagged"}`).
 * three.js' 3MFLoader ignores foreign namespaces, so the face tags need this parser (ADR 0004).
 * Supports one mesh object per file, which is what a single-body export produces.
 */
export function parseTagged3mf(data: Uint8Array): TaggedMesh {
  const files = unzipSync(data, { filter: (file) => file.name === MODEL_PATH });
  const model = files[MODEL_PATH];
  if (!model) throw new Error(`3MF package has no ${MODEL_PATH}`);
  const xml = strFromU8(model);

  if (!xml.includes(`xmlns:ft="${FACE_TAG_NAMESPACE}"`)) {
    throw new Error('3MF is not face-tagged (unknown or missing ft namespace)');
  }
  const object = objectPattern.exec(xml);
  if (!object) throw new Error('3MF has no face-tagged mesh object');
  // The checks measure in millimetres, in the design's frame: another unit or a moved build item fails (audit D30).
  const unit = attributesOf(/<model\b([^>]*)>/.exec(xml)?.[1] ?? '').get('unit') ?? 'millimeter';
  if (unit !== 'millimeter') throw new Error(`3MF unit is ${unit}, not millimeter`);
  for (const item of xml.matchAll(/<item\b([^>]*)>/g)) {
    const transform = attributesOf(item[1] ?? '').get('transform');
    if (transform === undefined) continue;
    const matrix = transform.trim().split(/\s+/).map(Number);
    if (matrix.length !== 12 || matrix.some((value, i) => !(Math.abs(value - (IDENTITY[i] ?? 0)) < 1e-9))) throw new Error('3MF build item carries a transform');
  }

  const coordinates = valuesOf(xml, VERTEX);
  const tagged = valuesOf(xml, TRIANGLE);
  const corners = tagged.filter((_, i) => i % 4 !== 3);
  const faces = tagged.filter((_, i) => i % 4 === 3);

  const faceCount = Number(object[2]);
  const vertexCount = coordinates.length / 3;
  for (const index of corners) {
    if (!Number.isInteger(index) || index < 0 || index >= vertexCount) throw new Error(`triangle references missing vertex ${index}`);
  }
  for (const face of faces) {
    if (!Number.isInteger(face) || face < 0 || face >= faceCount) throw new Error(`triangle references face ${face} of ${faceCount}`);
  }

  return {
    name: object[1] ?? '',
    faceCount,
    positions: Float64Array.from(coordinates),
    indices: Uint32Array.from(corners),
    triangleFaces: Uint32Array.from(faces),
  };
}
