import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { Matrix4, Quaternion, Vector3 } from 'three';

type Vec3 = [number, number, number];

const MODEL = '3D/3dmodel.model';
const ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
const unescape = (text: string) => text.replace(/&(lt|gt|quot|apos|amp);/g, (_, name: string) => ENTITIES[name] ?? '');
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const number = (value: number) => String(Math.round(value * 1e6) / 1e6);

/**
 * Rewrites a 3MF of SolidCraft (`file.export`, one mesh object and one build item per body, in the design's frame) so
 * that each group of bodies printed as one piece (`printGroups`, a print-in-place hinge, audit G1) is one object: an
 * object of components that point at the bodies' meshes, without moving them, so the bodies keep their place to each
 * other to the micron and a slicer drops the piece onto the bed as one (3MF core, 2015/02: an object holds a mesh or
 * components). With `downs` (the normal of a body's print face, by name) each piece is also laid down as the slicer
 * export lays a body: turned so the first print face among its bodies points down, its lowest point at Z 0.
 * A file without such a group or print face comes back as it was.
 */
export function joinPieces(file: Uint8Array, groups: readonly (readonly string[])[], downs: Readonly<Record<string, Vec3>> = {}): Uint8Array {
  const files = unzipSync(file);
  const source = files[MODEL];
  if (!source) throw new Error(`the 3MF has no ${MODEL}`);
  let model = strFromU8(source);
  const objects = [...model.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)].flatMap((match) => {
    const id = /\bid="(\d+)"/.exec(match[1] ?? '')?.[1];
    const name = /\bname="([^"]*)"/.exec(match[1] ?? '')?.[1];
    return id && name !== undefined ? [{ id: Number(id), name: unescape(name), body: match[2] ?? '' }] : [];
  });
  const items = new Set([...model.matchAll(/<item\b[^>]*\bobjectid="(\d+)"[^>]*\/>/g)].map((match) => Number(match[1])));
  const byName = new Map(objects.filter((object) => items.has(object.id)).map((object) => [object.name, object]));
  const grouped = new Set<string>();
  const pieces = groups
    .map((group) => group.filter((name) => byName.has(name) && !grouped.has(name)))
    .filter((group) => group.length > 1)
    .map((group) => {
      for (const name of group) grouped.add(name);
      return group;
    });
  for (const name of byName.keys()) if (!grouped.has(name)) pieces.push([name]);
  if (pieces.every((piece) => piece.length === 1 && !downs[piece[0] ?? ''])) return file;

  let next = Math.max(0, ...objects.map((object) => object.id)) + 1;
  const added: string[] = [];
  const build: string[] = [];
  for (const piece of pieces) {
    const members = piece.flatMap((name) => byName.get(name) ?? []);
    let id = members[0]?.id ?? 0;
    if (members.length > 1) {
      id = next;
      next += 1;
      const components = members.map((member) => `<component objectid="${String(member.id)}"/>`).join('');
      added.push(`<object id="${String(id)}" type="model" name="${escape(piece.join(' + '))}"><components>${components}</components></object>`);
    }
    const down = piece.map((name) => downs[name]).find(Boolean);
    build.push(`<item objectid="${String(id)}"${down ? ` transform="${laying(down, members.map((member) => member.body))}"` : ''}/>`);
  }
  model = model.replace(/<\/resources>/, () => `${added.join('\n')}\n</resources>`).replace(/<build>[\s\S]*?<\/build>/, () => `<build>\n${build.join('\n')}\n</build>`);
  files[MODEL] = strToU8(model);
  return zipSync(files);
}

/** The 3MF transform (m00 … m32, points as rows) that turns `down` to -Z and lifts the lowest vertex of the meshes to Z 0. */
function laying(down: Vec3, meshes: readonly string[]): string {
  const turn = new Matrix4().makeRotationFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(...down).normalize(), new Vector3(0, 0, -1)));
  const v = new Vector3();
  let low = Infinity;
  for (const mesh of meshes) {
    for (const match of mesh.matchAll(/<vertex\s+x="([^"]+)"\s+y="([^"]+)"\s+z="([^"]+)"/g)) {
      low = Math.min(low, v.set(Number(match[1]), Number(match[2]), Number(match[3])).applyMatrix4(turn).z);
    }
  }
  const e = turn.elements;
  // three.js keeps columns; a 3MF row of the matrix is a column of the turn.
  return [e[0], e[1], e[2], e[4], e[5], e[6], e[8], e[9], e[10], 0, 0, Number.isFinite(low) ? -low : 0].map(number).join(' ');
}
