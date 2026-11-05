import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { isSupportBody } from './supportBody';

/**
 * Support printed into the model leaves PartBuddy in the same 3MF object as the part it carries
 * (M7f step 4, 2026-11-05): Bambu Studio arranges the objects of a 3MF on its own, and turned and
 * moved the walls away from the part. In one object they keep their places. In the design they stay
 * bodies of their own, easy to delete. Works on SolidCraft's 3MF: objects with a mesh, one build
 * item each.
 */

const OBJECT = /<object\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<\/object>/g;
const NAME = /\bname="([^"]*)"/;
const VERTEX = /<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"\s*\/>/g;
const TRIANGLE = /<triangle\s+v1="(\d+)"\s+v2="(\d+)"\s+v3="(\d+)"([^/]*)\/>/g;

interface MeshObject {
  id: string;
  name: string;
  text: string;
  vertices: string[];
  /** Footprint in the file's X and Y. */
  box: [number, number, number, number];
}

function readObject(id: string, text: string): MeshObject {
  const name = NAME.exec(text.slice(0, text.indexOf('>') + 1))?.[1] ?? '';
  const vertices: string[] = [];
  const box: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const match of text.matchAll(VERTEX)) {
    vertices.push(match[0]);
    const x = Number(match[1]);
    const y = Number(match[2]);
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  }
  return { id, name, text, vertices, box };
}

/** How much of `a`'s footprint lies over `b`'s, mm². */
function overlap(a: MeshObject['box'], b: MeshObject['box']): number {
  return Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
}

/** Moves each support object's mesh into the part object it stands under; other files pass unchanged. */
export function mergeSupportObjects(data: Uint8Array): Uint8Array {
  let files: ReturnType<typeof unzipSync>;
  try {
    files = unzipSync(data);
  } catch {
    // Not a package this can read: it goes out as SolidCraft wrote it.
    return data;
  }
  let changed = false;
  for (const fileName of Object.keys(files).filter((name) => /\.model$/i.test(name))) {
    let xml = strFromU8(files[fileName] ?? new Uint8Array());
    const objects = [...xml.matchAll(OBJECT)].map((match) => readObject(match[1] ?? '', match[0]));
    const parts = objects.filter((object) => !isSupportBody(object.name) && object.vertices.length > 0);
    const supports = objects.filter((object) => isSupportBody(object.name) && object.vertices.length > 0);
    if (parts.length === 0 || supports.length === 0) continue;
    // Each support goes to the part it overlaps most, seen from above.
    const added = new Map<string, { vertices: string[]; triangles: string[] }>();
    for (const support of supports) {
      const target = parts.reduce((best, part) => (overlap(support.box, part.box) > overlap(support.box, best.box) ? part : best));
      if (overlap(support.box, target.box) <= 0) continue;
      const into = added.get(target.id) ?? { vertices: [], triangles: [] };
      const offset = target.vertices.length + into.vertices.length;
      into.vertices.push(...support.vertices);
      for (const match of support.text.matchAll(TRIANGLE)) {
        into.triangles.push(`<triangle v1="${String(Number(match[1]) + offset)}" v2="${String(Number(match[2]) + offset)}" v3="${String(Number(match[3]) + offset)}"${match[4] ?? ''}/>`);
      }
      added.set(target.id, into);
      // The support's own object and build item go.
      xml = xml.replace(support.text, '').replace(new RegExp(`<item\\b[^>]*\\bobjectid="${support.id}"[^>]*/>`), '');
    }
    for (const [id, extra] of added) {
      const part = parts.find((item) => item.id === id);
      if (!part) continue;
      const merged = part.text.replace('</vertices>', `${extra.vertices.join('')}</vertices>`).replace('</triangles>', `${extra.triangles.join('')}</triangles>`);
      xml = xml.replace(part.text, merged);
    }
    files[fileName] = strToU8(xml);
    changed = true;
  }
  return changed ? zipSync(files) : data;
}

/** The names of the mesh objects in a 3MF, in file order (to see what goes to the slicer). */
export function objectNames3mf(data: Uint8Array): string[] {
  const files = unzipSync(data);
  return Object.keys(files)
    .filter((name) => /\.model$/i.test(name))
    .flatMap((name) => [...strFromU8(files[name] ?? new Uint8Array()).matchAll(OBJECT)].map((match) => readObject(match[1] ?? '', match[0]).name));
}
