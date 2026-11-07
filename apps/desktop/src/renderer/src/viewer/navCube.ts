/**
 * The geometry of the view cube, after Bentley's iTwin.js CubeNavigationAid (MIT,
 * github.com/iTwin/appui, ui/imodel-components-react/src/imodel-components-react/navigationaids/Cube.tsx):
 * each face is a flat element turned into place with a CSS matrix3d, and divided into 3 × 3 cells
 * for its corners, edges and centre. World Z is up and front is -Y, as in iTwin and in our view.
 * Pure functions, so tests run without a DOM.
 */

export type Vec3 = [number, number, number];
/** A 3 × 3 matrix, row-major. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];
export type CubeFace = 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';

const at = (values: ArrayLike<number>, i: number): number => values[i] ?? 0;
const mul = (a: Mat3, b: Mat3): Mat3 =>
  [0, 1, 2].flatMap((r) => [0, 1, 2].map((c) => at(a, r * 3) * at(b, c) + at(a, r * 3 + 1) * at(b, 3 + c) + at(a, r * 3 + 2) * at(b, 6 + c))) as Mat3;

/** Where each face sits (reposition) and how its content is turned (reorient), from iTwin's Cube.tsx. */
export const FACES: Record<CubeFace, { position: Mat3; orient: Mat3 }> = {
  front: { position: [1, 0, 0, 0, 0, -1, 0, 1, 0], orient: [1, 0, 0, 0, -1, 0, 0, 0, 1] },
  back: { position: [1, 0, 0, 0, 0, 1, 0, -1, 0], orient: [-1, 0, 0, 0, 1, 0, 0, 0, 1] },
  right: { position: [0, 0, 1, 0, 1, 0, -1, 0, 0], orient: [0, 1, 0, 1, 0, 0, 0, 0, 1] },
  left: { position: [0, 0, -1, 0, 1, 0, 1, 0, 0], orient: [0, -1, 0, -1, 0, 0, 0, 0, 1] },
  top: { position: [1, 0, 0, 0, 1, 0, 0, 0, 1], orient: [1, 0, 0, 0, -1, 0, 0, 0, 1] },
  bottom: { position: [-1, 0, 0, 0, 1, 0, 0, 0, -1], orient: [-1, 0, 0, 0, 1, 0, 0, 0, 1] },
};
export const FACE_ORDER: CubeFace[] = ['front', 'back', 'right', 'left', 'top', 'bottom'];

/**
 * The CSS transform of one face for the view rotation `rotation` (world to view, rows are the
 * view's right, up and back axes in world coordinates) and half the face width in px.
 */
export function faceTransform(rotation: Mat3, face: CubeFace, half: number): string {
  const { position, orient } = FACES[face];
  const placed = mul(rotation, position);
  const v = [at(placed, 2) * half, at(placed, 5) * half, at(placed, 8) * half];
  const m = mul(placed, orient);
  const list = [at(m, 0), -at(m, 3), at(m, 6), 0, at(m, 1), -at(m, 4), at(m, 7), 0, at(m, 2), -at(m, 5), at(m, 8), 0, at(v, 0), -at(v, 1), at(v, 2) - half, 1];
  return `matrix3d(${list.map((value) => (Math.abs(value) < 1e-9 ? 0 : Number(value.toFixed(6)))).join(',')})`;
}

/**
 * The direction to look from for a cell of a face: `column` -1 (left) to 1 (right) and `row` -1
 * (top) to 1 (bottom) as the face is seen from outside; the centre is the face itself, an edge cell
 * the view between two faces, a corner cell the view between three.
 */
export function cellDirection(face: CubeFace, column: -1 | 0 | 1, row: -1 | 0 | 1): Vec3 {
  const { position, orient } = FACES[face];
  const m = mul(position, orient);
  const local: Vec3 = [column, row, 1];
  const world: Vec3 = [0, 1, 2].map((r) => at(m, r * 3) * local[0] + at(m, r * 3 + 1) * local[1] + at(m, r * 3 + 2) * local[2]) as Vec3;
  return world.map((value) => Math.round(value)) as Vec3;
}

/** The view rotation from a camera's world matrix (columns are its right, up and back axes). */
export function viewRotation(world: ArrayLike<number>): Mat3 {
  // Rows of the world-to-view rotation are the camera's axes: the transpose of the world matrix's rotation.
  return [0, 1, 2, 4, 5, 6, 8, 9, 10].map((i) => at(world, i)) as Mat3;
}
