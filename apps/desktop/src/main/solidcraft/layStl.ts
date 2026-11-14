import { Quaternion, Vector3 } from 'three';

const HEADER = 80;
const TRIANGLE = 50;

/**
 * A binary STL (`file.export` writes binary) turned so `down`, the normal of the print face, points to -Z, its lowest
 * point lifted to Z 0: the lay of the 3MF export (`joinPieces` in pieces3mf.ts) for a file of one mesh. Facet
 * normals turn along; the attribute bytes stay.
 * shortcut: runs in the main process, 0.75 s per million triangles (77 ms for 100 000, 2.9 s for 4 million, measured);
 * move it into a worker when STL exports of millions of triangles turn up.
 */
export function layStl(file: Uint8Array, down: readonly [number, number, number]): Uint8Array {
  const data = Buffer.from(file);
  const count = data.length >= HEADER + 4 ? data.readUInt32LE(HEADER) : -1;
  if (data.length !== HEADER + 4 + count * TRIANGLE) throw new Error('the STL is not a binary STL SolidCraft wrote');
  const turn = new Quaternion().setFromUnitVectors(new Vector3(...down).normalize(), new Vector3(0, 0, -1));
  const v = new Vector3();
  const at = (triangle: number, item: number) => HEADER + 4 + triangle * TRIANGLE + item * 12;
  let low = Infinity;
  for (let t = 0; t < count; t += 1) {
    for (let item = 0; item < 4; item += 1) {
      const offset = at(t, item);
      v.set(data.readFloatLE(offset), data.readFloatLE(offset + 4), data.readFloatLE(offset + 8)).applyQuaternion(turn);
      data.writeFloatLE(v.x, offset);
      data.writeFloatLE(v.y, offset + 4);
      data.writeFloatLE(v.z, offset + 8);
      // Item 0 is the facet's normal, 1 to 3 its corners.
      if (item > 0) low = Math.min(low, data.readFloatLE(offset + 8));
    }
  }
  if (Number.isFinite(low)) for (let t = 0; t < count; t += 1) for (let item = 1; item < 4; item += 1) data.writeFloatLE(data.readFloatLE(at(t, item) + 8) - low, at(t, item) + 8);
  return data;
}
