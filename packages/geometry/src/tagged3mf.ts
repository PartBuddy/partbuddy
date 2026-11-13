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
const vertexPattern = /<vertex\b([^>]*)>/g;
const trianglePattern = /<triangle\b([^>]*)>/g;
const attributePattern = /([\w:]+)\s*=\s*"([^"]*)"/g;

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
  if (/<item\b[^>]*\btransform\s*=/.test(xml)) throw new Error('3MF build item carries a transform');

  const coordinates: number[] = [];
  for (const match of xml.matchAll(vertexPattern)) {
    const attributes = attributesOf(match[1] ?? '');
    const n = coordinates.length / 3;
    coordinates.push(numberOf(attributes, 'x', 'vertex', n), numberOf(attributes, 'y', 'vertex', n), numberOf(attributes, 'z', 'vertex', n));
  }
  const corners: number[] = [];
  const faces: number[] = [];
  for (const match of xml.matchAll(trianglePattern)) {
    const attributes = attributesOf(match[1] ?? '');
    const n = faces.length;
    corners.push(numberOf(attributes, 'v1', 'triangle', n), numberOf(attributes, 'v2', 'triangle', n), numberOf(attributes, 'v3', 'triangle', n));
    faces.push(numberOf(attributes, 'ft:face', 'triangle', n));
  }

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
