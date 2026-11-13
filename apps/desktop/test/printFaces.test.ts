import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { keepPrintFace, PrintFaceKeeper, readPrintFaces, resolvePrintFaces, savedPrintFaces, withPrintFace, writePrintFaces } from '../src/main/projects/assembly';
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
    // A box face's certificate names its normal: axis 2, high, so +z.
    expect(savedPrintFaces(document)).toEqual({ Lid: { name: 'F1:+z', point: [0, 0, 5], normal: [0, 0, 1] } });
    // A cylinder's cap and a face found by lineage carry no axis (SolidCraft 0.40.1): no normal.
    expect(savedPrintFaces({ print_faces: { Cyl: { certificate: { high: true, kind: 'cylinder_cap' }, name: 'F1:top', point: [0, 0, 10] }, Step: { certificate: { kind: 'lineage' }, name: 'F3:-z', point: [47.3, -2.3, 3] } } })).toEqual({ Cyl: { name: 'F1:top', point: [0, 0, 10] }, Step: { name: 'F3:-z', point: [47.3, -2.3, 3] } });
    expect(savedPrintFaces({ print_faces: { A: { name: '', point: [0, 0, 0] }, B: { name: 'F1:+z', point: [0, 0] }, C: { name: 'F1:+z', point: [0, Number.NaN, 0] } } })).toEqual({});
    // A design saved without print faces (one undone) has none.
    expect(savedPrintFaces({ format: 'solidcraft/54' })).toEqual({});
    expect(savedPrintFaces(null)).toEqual({});
  });

  it('keeps a face of the same name, finds a split face on the same plane, and names a face that is gone', () => {
    const saved = { ...savedPrintFaces(document), Cut: { name: 'F1:+z', point: [0, 0, 5] as Vec3 }, Gone: { name: 'F1:+z', point: [0, 0, 5] as Vec3 }, Hidden: { name: 'F3:-y', point: [1, 1, 1] as Vec3 } };
    const tables = [
      table('Lid', [face('F1:-z', [10, 5, 0], [0, 0, -1]), face('F1:+z', [10, 5, 5], [0, 0, 1])]),
      // A cut across the top split it (model.faces of SolidCraft 0.40.1); the piece nearest the saved point is taken, both lay the box alike,
      // not the larger one and not the cut's floor on another plane.
      table('Cut', [face('F1:+z#[F1:+x,F2:+x]', [15.5, 5, 5], [0, 0, 1], 110), face('F1:+z#[F1:-x,F2:-x]', [4.5, 5, 5], [0, 0, 1], 90), face('F2:-z', [10, 5, 3], [0, 0, 1], 20)]),
      // No flat face holds the point any more (a round top): the body lies as designed and is named.
      table('Gone', [face('F1:+z', [0, 0, 5], undefined), face('F1:-z', [0, 0, 0], [0, 0, -1])]),
    ];
    expect(resolvePrintFaces(saved, tables)).toEqual({ faces: { Lid: 'F1:+z', Cut: 'F1:+z#[F1:-x,F2:-x]', Hidden: 'F3:-y' }, lost: ['Gone'] });
  });

  it('takes a face on the plane only when it cannot lay the body the wrong way up (review of BC-04)', () => {
    // A step: its floor at z 3 faces up, the underside of an overhang at z 3 faces down; the saved name is gone.
    const step = table('Step', [face('F2:+z', [5, 5, 3], [0, 0, 1], 50), face('F4:-z', [15, 5, 3], [0, 0, -1], 80)]);
    expect(resolvePrintFaces({ Step: { name: 'F9:old', point: [0, 0, 3] } }, [step])).toEqual({ faces: {}, lost: ['Step'] });
    // With the certified normal of a box face the floor is found.
    expect(resolvePrintFaces({ Step: { name: 'F9:old', point: [0, 0, 3], normal: [0, 0, 1] } }, [step]).faces).toEqual({ Step: 'F2:+z' });
    // Two faces on the plane facing one way: the nearest.
    const two = table('Two', [face('A', [30, 0, 3], [0, 0, 1]), face('B', [2, 0, 3], [0, 0, 1])]);
    expect(resolvePrintFaces({ Two: { name: 'gone', point: [0, 0, 3] } }, [two]).faces).toEqual({ Two: 'B' });
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

describe('the print faces of the open design, kept in one place (audit D20, H-13, review of BC-04 B1)', () => {
  const keeper = (folder: { now: string | null }, documentId = { now: 'doc-1' as string | null }) => {
    const told: Record<string, string>[] = [];
    const faces = new PrintFaceKeeper({ folder: () => folder.now, documentId: () => documentId.now, changed: (next) => told.push(next) });
    return { faces, told, documentId };
  };

  it('keeps faces of a design without a folder for that design, and in its folder once it has one', () => {
    const folder = { now: null as string | null };
    const { faces, told, documentId } = keeper(folder);
    faces.keep('Knob', 'F1:+z');
    expect(faces.now()).toEqual({ Knob: 'F1:+z' });
    expect(told).toEqual([{ Knob: 'F1:+z' }]);
    // Another design without a folder has none of them.
    documentId.now = 'doc-2';
    expect(faces.now()).toEqual({});
    documentId.now = 'doc-1';
    // Without a folder a saved file is not taken: there is none to keep it in.
    expect(faces.takeSaved({ faces: {}, lost: [] })).toEqual([]);
    expect(faces.now()).toEqual({ Knob: 'F1:+z' });
    folder.now = mkdtempSync(join(tmpdir(), 'partbuddy-faces-'));
    folders.push(folder.now);
    // The folder has no file before the first save is read: the faces kept without it still hold (review of BC-04, K2).
    expect(faces.now()).toEqual({ Knob: 'F1:+z' });
    // The first save writes the file, also when SolidCraft's faces are those kept.
    expect(faces.takeSaved({ faces: { Knob: 'F1:+z' }, lost: [] })).toEqual([]);
    expect(readPrintFaces(folder.now)).toEqual({ Knob: 'F1:+z' });
    faces.keep('Lid', 'F2:-z');
    expect(readPrintFaces(folder.now)).toEqual({ Knob: 'F1:+z', Lid: 'F2:-z' });
  });

  it('takes the saved faces only when the file is current, and says a lost face once', () => {
    const folder = { now: mkdtempSync(join(tmpdir(), 'partbuddy-faces-')) as string | null };
    folders.push(folder.now ?? '');
    const { faces, told } = keeper(folder);
    faces.keep('Lid', 'F1:+z');
    // A file older than the design (supervisor.savedPrintFaces gives null) leaves the face just set as it is.
    expect(faces.takeSaved(null)).toEqual([]);
    expect(faces.now()).toEqual({ Lid: 'F1:+z' });
    // The current file: an undone face goes, a split one is renamed, a lost one is said once.
    expect(faces.takeSaved({ faces: { Box: 'F1:+z#[F1:-x,F2:-x]' }, lost: ['Knob'] })).toEqual(['Knob']);
    expect(faces.now()).toEqual({ Box: 'F1:+z#[F1:-x,F2:-x]' });
    expect(faces.takeSaved({ faces: { Box: 'F1:+z#[F1:-x,F2:-x]' }, lost: ['Knob'] })).toEqual([]);
    // The same faces again change nothing and tell nobody.
    expect(told).toHaveLength(2);
    // Lost once more after it had its face again: said again.
    expect(faces.takeSaved({ faces: { Box: 'F1:+z#[F1:-x,F2:-x]' }, lost: [] })).toEqual([]);
    expect(faces.takeSaved({ faces: { Box: 'F1:+z#[F1:-x,F2:-x]' }, lost: ['Knob'] })).toEqual(['Knob']);
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
