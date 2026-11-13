import { Quaternion, Vector3, type BufferAttribute } from 'three';

import type { BodyModel } from '../state/store';
import type { Vec2 } from './nesting';

type Vec3 = [number, number, number];

/** Footprint points per body at most; larger meshes are sampled evenly. */
const MAX_POINTS = 4000;

/** A part on the plate: one body, or the bodies printed as one piece, as they lie to each other. */
export interface PlatePiece {
  /** The first body's name names the piece. */
  name: string;
  members: string[];
  quaternion: Quaternion;
  points: Vec2[];
  floor: number;
  height: number;
}

/** The normal of a body's print face, if it is a flat face of the body. */
const faceNormal = (body: BodyModel, face: string | undefined) => (face ? body.model.table.faces.find((entry) => entry.name === face)?.planeNormal : undefined);

/** How a body is turned to lie with `normal` down (or as designed), with its footprint and height that way. */
function plateInput(body: BodyModel, normal: Vec3 | undefined): { quaternion: Quaternion; points: Vec2[]; floor: number; height: number } {
  const quaternion = normal ? new Quaternion().setFromUnitVectors(new Vector3(...normal).normalize(), new Vector3(0, 0, -1)) : new Quaternion();
  const positions = (body.model.geometry.getAttribute('position') as BufferAttribute).array;
  const count = positions.length / 3;
  const stride = Math.max(1, Math.floor(count / MAX_POINTS));
  const points: Vec2[] = [];
  let floor = Infinity;
  let top = -Infinity;
  const v = new Vector3();
  for (let i = 0; i < count; i += 1) {
    v.set(positions[i * 3] ?? 0, positions[i * 3 + 1] ?? 0, positions[i * 3 + 2] ?? 0).applyQuaternion(quaternion);
    floor = Math.min(floor, v.z);
    top = Math.max(top, v.z);
    if (i % stride === 0) points.push([v.x, v.y]);
  }
  return { quaternion, points, floor, height: top - floor };
}

/**
 * The parts the plate view lays out: each printed body on its print face, and each group of bodies printed as one piece
 * (a print-in-place hinge, audit G1) as one part, turned onto the print face of the first of its bodies, in the group's
 * order, that has one, as print check and export do. Standard parts (screws, nuts) are bought, not printed: they stay off.
 */
export function platePieces(bodies: readonly BodyModel[], groups: readonly (readonly string[])[], faces: Readonly<Record<string, string>>, standard: readonly string[] = []): PlatePiece[] {
  const pieces = new Map<string, BodyModel[]>();
  for (const body of bodies) {
    if (standard.includes(body.name)) continue;
    const group = groups.find((entry) => entry.includes(body.name));
    const name = group?.find((member) => bodies.some((other) => other.name === member && !standard.includes(member))) ?? body.name;
    const members = [...(pieces.get(name) ?? []), body];
    if (group) members.sort((a, b) => group.indexOf(a.name) - group.indexOf(b.name));
    pieces.set(name, members);
  }
  return [...pieces].map(([name, members]) => {
    const normal = members.map((body) => faceNormal(body, faces[body.name])).find(Boolean);
    const laid = members.map((body) => plateInput(body, normal));
    const floor = Math.min(...laid.map((entry) => entry.floor));
    const top = Math.max(...laid.map((entry) => entry.floor + entry.height));
    return { name, members: members.map((body) => body.name), quaternion: laid[0]?.quaternion ?? new Quaternion(), points: laid.flatMap((entry) => entry.points), floor, height: top - floor };
  });
}
