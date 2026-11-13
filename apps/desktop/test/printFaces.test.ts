import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { keepPrintFace, readPrintFaces, resolvePrintFaces, savedPrintFaces, withPrintFace, writePrintFaces } from '../src/main/projects/assembly';
import { layStl } from '../src/main/solidcraft/layStl';

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

type Vec3 = [number, number, number];
const face = (name: string, centroid: Vec3, planeNormal: Vec3 | undefined, area = 100) => ({ name, area, centroid, ...(planeNormal ? { planeNormal } : {}) });
const table = (name: string, faces: ReturnType<typeof face>[]) => ({ name, faces: { faces } });

describe('print faces as SolidCraft saves them (audit D20)', () => {
  // `print_faces` of document.json as SolidCraft 0.40.1 saved a 20 × 10 × 5 box with its top as print face.
  const document = { format: 'solidcraft/54', print_faces: { Lid: { body: 'Lid', certificate: { axis: 2, high: true, kind: 'box' }, name: 'F1:+z', origin_feature: 1, point: [0, 0, 5] } } };

  it('reads the saved print faces and leaves out what reads oddly', () => {
    expect(savedPrintFaces(document)).toEqual({ Lid: { name: 'F1:+z', point: [0, 0, 5] } });
    expect(savedPrintFaces({ print_faces: { A: { name: '', point: [0, 0, 0] }, B: { name: 'F1:+z', point: [0, 0] }, C: { name: 'F1:+z', point: [0, Number.NaN, 0] } } })).toEqual({});
    // A design saved without print faces (one undone) has none.
    expect(savedPrintFaces({ format: 'solidcraft/54' })).toEqual({});
    expect(savedPrintFaces(null)).toEqual({});
  });

  it('keeps a face of the same name, finds a split face on the same plane, and names a face that is gone', () => {
    const saved = { ...savedPrintFaces(document), Cut: { name: 'F1:+z', point: [0, 0, 5] as Vec3 }, Gone: { name: 'F1:+z', point: [0, 0, 5] as Vec3 }, Hidden: { name: 'F3:-y', point: [1, 1, 1] as Vec3 } };
    const tables = [
      table('Lid', [face('F1:-z', [10, 5, 0], [0, 0, -1]), face('F1:+z', [10, 5, 5], [0, 0, 1])]),
      // A cut across the top split it (model.faces of SolidCraft 0.40.1); the larger piece is taken, both lay the box alike.
      table('Cut', [face('F1:+z#[F1:-x,F2:-x]', [4.5, 5, 5], [0, 0, 1], 90), face('F1:+z#[F1:+x,F2:+x]', [15.5, 5, 5], [0, 0, 1], 110), face('F2:-z', [10, 5, 3], [0, 0, 1], 20)]),
      // No flat face holds the point any more (a round top): the body lies as designed and is named.
      table('Gone', [face('F1:+z', [0, 0, 5], undefined), face('F1:-z', [0, 0, 0], [0, 0, -1])]),
    ];
    expect(resolvePrintFaces(saved, tables)).toEqual({ faces: { Lid: 'F1:+z', Cut: 'F1:+z#[F1:+x,F2:+x]', Hidden: 'F3:-y' }, lost: ['Gone'] });
  });

  it('takes a face only within 0.01 mm of the saved point', () => {
    const saved = { Plate: { name: 'old', point: [0, 0, 5] as Vec3 } };
    expect(resolvePrintFaces(saved, [table('Plate', [face('F1:+z', [3, 3, 5.01], [0, 0, 1])])]).faces).toEqual({ Plate: 'F1:+z' });
    expect(resolvePrintFaces(saved, [table('Plate', [face('F1:+z', [3, 3, 5.011], [0, 0, 1])])]).lost).toEqual(['Plate']);
  });

  it('writes all faces at once and keeps or clears one', () => {
    const folder = mkdtempSync(join(tmpdir(), 'partbuddy-faces-'));
    folders.push(folder);
    expect(readPrintFaces(folder)).toEqual({});
    writePrintFaces(folder, { Lid: 'F1:+z', Box: 'F1:-z' });
    keepPrintFace(folder, 'Lid', null);
    keepPrintFace(folder, 'Knob', 'F2:+z');
    expect(readPrintFaces(folder)).toEqual({ Box: 'F1:-z', Knob: 'F2:+z' });
    expect(readFileSync(join(folder, 'print-faces.json'), 'utf8').endsWith('}\n')).toBe(true);
    expect(withPrintFace({ A: 'x' }, 'A', 'y')).toEqual({ A: 'y' });
  });
});

describe('an STL laid on its print face (audit D21)', () => {
  /** A binary STL as `file.export` writes it, one triangle per entry: [normal, a, b, c]. */
  const stl = (triangles: Vec3[][]) => {
    const data = Buffer.alloc(84 + triangles.length * 50);
    data.writeUInt32LE(triangles.length, 80);
    triangles.forEach((triangle, t) => triangle.flat().forEach((value, i) => data.writeFloatLE(value, 84 + t * 50 + i * 4)));
    return data;
  };
  const read = (file: Uint8Array) => {
    const data = Buffer.from(file);
    return Array.from({ length: data.readUInt32LE(80) }, (_, t) => Array.from({ length: 12 }, (_, i) => Math.round(data.readFloatLE(84 + t * 50 + i * 4) * 1000) / 1000));
  };

  it('turns the print face down and lifts the lowest corner to Z 0, normals along', () => {
    // The top of a part 10 mm high (z 2 … 12) goes down: turned half a turn, its top at z 0.
    const file = stl([
      [[0, 0, 1], [0, 0, 12], [10, 0, 12], [0, 10, 12]],
      [[0, 0, -1], [0, 0, 2], [0, 10, 2], [10, 0, 2]],
    ]);
    const laid = read(layStl(file, [0, 0, 1]));
    expect(laid.map((triangle) => triangle.slice(0, 3).map(Math.abs))).toEqual([[0, 0, 1], [0, 0, 1]]);
    expect(laid[0]?.[2]).toBe(-1);
    expect(laid[0]?.filter((_, i) => i % 3 === 2 && i >= 3)).toEqual([0, 0, 0]);
    expect(laid[1]?.filter((_, i) => i % 3 === 2 && i >= 3)).toEqual([10, 10, 10]);
    // A side face down: +x points down, so x 10 becomes the bed.
    const side = read(layStl(file, [1, 0, 0]));
    expect(Math.min(...side.flatMap((triangle) => triangle.filter((_, i) => i % 3 === 2 && i >= 3)))).toBe(0);
    expect(side[0]?.slice(3, 6)[2]).toBe(10);
  });

  it('lays a face tilted 45° flat: its normal points down, its corners on the bed', () => {
    // A face through (0, 0, 0) and (10, 10, 10), leaning 45° towards -y, its normal (0, -1, 1) / √2.
    const n = Math.SQRT1_2;
    const file = stl([[[0, -n, n], [0, 0, 0], [10, 0, 0], [0, 10, 10]]]);
    const [laid] = read(layStl(file, [0, -1, 1]));
    expect(laid?.slice(0, 3)).toEqual([0, 0, -1]);
    expect(laid?.filter((_, i) => i % 3 === 2 && i >= 3)).toEqual([0, 0, 0]);
  });

  it('refuses what is no binary STL', () => {
    expect(() => layStl(Buffer.from('solid box\nendsolid box\n'), [0, 0, 1])).toThrow('not a binary STL');
  });
});
