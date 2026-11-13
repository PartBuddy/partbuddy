import { promisify } from 'node:util';

import { strToU8, unzip, zip, type Unzipped } from 'fflate';
import { Matrix4, Quaternion, Vector3 } from 'three';

type Vec3 = [number, number, number];

const MODEL = '3D/3dmodel.model';
/** Bambu Studio's and OrcaSlicer's settings of the objects and their parts, where they read the parts' names. */
const SETTINGS = 'Metadata/model_settings.config';
const ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', apos: "'", amp: '&' };
const unescape = (text: string) => text.replace(/&(lt|gt|quot|apos|amp);/g, (_, name: string) => ENTITIES[name] ?? '');
const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const number = (value: number) => String(Math.round(value * 1e6) / 1e6);
const unzipping = promisify(unzip);
// The fastest deflate: a 193 MB model zips in 3 s instead of 7.6 s, 10 % larger (review of PR #366, K3).
const zipping = (files: Unzipped) => new Promise<Uint8Array>((resolve, reject) => {
  zip(files, { level: 1 }, (error, data) => {
    if (error) reject(error);
    else resolve(data);
  });
});

/** A mesh object of the model: its id, its name and where it lies in the model's bytes. */
interface MeshObject {
  id: number;
  name: string | null;
  start: number;
  end: number;
}

/**
 * Rewrites a 3MF of SolidCraft (`file.export`, one mesh object and one build item per body, in the design's frame) so
 * that each group of bodies printed as one piece (`printGroups`, a print-in-place hinge, audit G1) is one object: an
 * object of components that point at the bodies' meshes, without moving them, so the bodies keep their place to each
 * other to the micron and a slicer drops the piece onto the bed as one (3MF core, 2015/02: an object holds a mesh or
 * components). Its parts keep their bodies' names for Bambu Studio and OrcaSlicer (`model_settings.config`). With
 * `downs` (the normal of a body's print face, by name) each piece is also laid down as the slicer export lays a body:
 * turned so the first print face among its bodies, in the order of the group, points down, its lowest point at Z 0.
 * Build items it does not change stay as they are. Null when there is nothing to change.
 * The model is cut and joined as bytes and (un)zipped off the main thread: a 193 MB model as one string took 13 s
 * and 1 GB on it, and from 512 MB a string is too long (review of PR #366, K3); now 3 s, the main thread free.
 * shortcut: one body's mesh laid on a print face is still read as one string, so a single body over 512 MB of 3MF text
 * cannot be laid; parse its vertices from the bytes when such bodies turn up.
 */
export async function joinPieces(file: Uint8Array, groups: readonly (readonly string[])[], downs: Readonly<Record<string, Vec3>> = {}): Promise<Uint8Array | null> {
  const files: Unzipped = await unzipping(file);
  const source = files[MODEL];
  if (!source) throw new Error(`the 3MF has no ${MODEL}`);
  const model = Buffer.from(source.buffer, source.byteOffset, source.byteLength);
  const resourcesEnd = model.lastIndexOf('</resources>');
  const buildStart = model.indexOf('<build', resourcesEnd);
  const buildEnd = model.indexOf('</build>', buildStart);
  if (resourcesEnd < 0 || buildStart < 0 || buildEnd < 0) throw new Error('the 3MF model has no resources or no build');

  const objects: MeshObject[] = [];
  let maxId = 0;
  for (let at = model.indexOf(' id="'); at >= 0 && at < resourcesEnd; at = model.indexOf(' id="', at + 5)) {
    maxId = Math.max(maxId, Number.parseInt(model.toString('latin1', at + 5, at + 16), 10) || 0);
  }
  for (let at = model.indexOf('<object'); at >= 0 && at < resourcesEnd; at = model.indexOf('<object', at + 7)) {
    const close = model.indexOf('>', at);
    const head = model.toString('utf8', at, close);
    const id = /\bid="(\d+)"/.exec(head)?.[1];
    const name = /\bname="([^"]*)"/.exec(head)?.[1];
    const end = model.indexOf('</object>', close);
    if (id && end > 0) objects.push({ id: Number(id), name: name === undefined ? null : unescape(name), start: close, end });
  }
  const build = model.toString('utf8', buildStart, buildEnd);
  const open = build.slice(0, build.indexOf('>') + 1);
  const items = [...build.matchAll(/<item\b[^>]*\/>/g)].map((match) => ({ text: match[0], id: Number(/\bobjectid="(\d+)"/.exec(match[0])?.[1]) }));
  const built = new Map(objects.filter((object) => object.name !== null && items.some((item) => item.id === object.id)).map((object) => [object.name ?? '', object]));

  const grouped = new Set<string>();
  const pieces = groups
    .map((group) => group.filter((name) => built.has(name) && !grouped.has(name)))
    .filter((group) => group.length > 1);
  for (const piece of pieces) for (const name of piece) grouped.add(name);
  const laid = [...built.keys()].filter((name) => !grouped.has(name) && downs[name]);
  if (pieces.length === 0 && laid.length === 0) return null;

  let next = maxId + 1;
  const added: string[] = [];
  const parts: string[] = [];
  const changed = new Map<number, string>();
  const drop = new Set<number>();
  for (const piece of [...pieces, ...laid.map((name) => [name])]) {
    const members = piece.flatMap((name) => built.get(name) ?? []);
    const down = piece.map((name) => downs[name]).find(Boolean);
    const transform = down ? ` transform="${laying(down, members.map((member) => model.toString('latin1', member.start, member.end)))}"` : '';
    if (members.length === 1 && members[0]) {
      changed.set(members[0].id, `<item objectid="${String(members[0].id)}"${transform}/>`);
      continue;
    }
    const id = next;
    next += 1;
    const name = escape(piece.join(' + '));
    added.push(`<object id="${String(id)}" type="model" name="${name}"><components>${members.map((member) => `<component objectid="${String(member.id)}"/>`).join('')}</components></object>`);
    parts.push(`<object id="${String(id)}"><metadata key="name" value="${name}"/>${members.map((member) => `<part id="${String(member.id)}" subtype="normal_part"><metadata key="name" value="${escape(member.name ?? '')}"/></part>`).join('')}</object>`);
    for (const member of members) drop.add(member.id);
    changed.set(members[0]?.id ?? id, `<item objectid="${String(id)}"${transform}/>`);
  }
  // Each item in its place; the group's item where its first body's was.
  const kept = items.flatMap((item) => (changed.has(item.id) ? [changed.get(item.id) ?? ''] : drop.has(item.id) ? [] : [item.text]));
  files[MODEL] = Buffer.concat([
    model.subarray(0, resourcesEnd),
    Buffer.from(`${added.join('\n')}\n`, 'utf8'),
    model.subarray(resourcesEnd, buildStart),
    Buffer.from(`${open}\n${kept.join('\n')}\n`, 'utf8'),
    model.subarray(buildEnd),
  ]);
  // A settings file of the slicer's own is left alone: it would not know the new object.
  if (parts.length > 0 && !files[SETTINGS]) files[SETTINGS] = strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<config>\n${parts.join('\n')}\n</config>\n`);
  return zipping(files);
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
