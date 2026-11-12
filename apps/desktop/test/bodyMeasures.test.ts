import { buildRenderMesh, buildViewerModel, type FaceTable, type PrintCheckBody, type TaggedMesh } from '@partbuddy/geometry';
import { describe, expect, it } from 'vitest';

import { printCheckNote } from '../src/main/print/printCheckNote';
import { bodyMeasures } from '../src/renderer/src/print/bodyMeasures';
import { reportOf } from '../src/renderer/src/print/report';
import { printCheckReportSchema } from '../src/shared/contract';

/** A box as SolidCraft exports it: six named faces with their normals, outward triangles. */
function box(name: string, size: [number, number, number]): PrintCheckBody {
  const [x, y, z] = size;
  const corners = [[0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0], [0, 0, z], [x, 0, z], [x, y, z], [0, y, z]];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  const faces: [string, [number, number, number]][] = [['F1:-z', [0, 0, -1]], ['F1:+z', [0, 0, 1]], ['F1:-y', [0, -1, 0]], ['F1:+x', [1, 0, 0]], ['F1:+y', [0, 1, 0]], ['F1:-x', [-1, 0, 0]]];
  const mesh: TaggedMesh = {
    name,
    faceCount: 6,
    positions: Float64Array.from(corners.flat()),
    indices: Uint32Array.from(quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d] as number[])),
    triangleFaces: Uint32Array.from(quads.flatMap((_, face) => [face, face])),
  };
  const table: FaceTable = { model: 'test', body: name, units: 'mm', faces: faces.map(([faceName, planeNormal], index) => ({ index, name: faceName, exact: true, area: 0, centroid: [0, 0, 0], point: [0, 0, 0], planeNormal })) };
  return { name, model: buildViewerModel(buildRenderMesh(mesh, table), table) };
}

const PLA = { nozzle: 0.4, layer: 0.2, overhang: 45 };

describe('what a body costs to print, as the assistant reads it with every check (2026-11-12)', () => {
  it('measures a 20 × 30 × 10 mm box as designed: 6 cm³, 50 layers, 600 mm² on the bed, nothing to support', () => {
    expect(bodyMeasures(box('Box', [20, 30, 10]), PLA)).toEqual({ name: 'Box', volume: 6, height: 10, layers: 50, contact: 600, support: 0 });
    // A coarser layer: fewer layers for the same height.
    expect(bodyMeasures(box('Box', [20, 30, 10]), { ...PLA, layer: 0.3 }).layers).toBe(34);
  });

  it('measures it as it lies on its print face: stood on its small side it is twice as high', () => {
    expect(bodyMeasures({ ...box('Box', [20, 30, 10]), printFace: 'F1:-x' }, PLA)).toEqual({ name: 'Box', volume: 6, height: 20, layers: 100, contact: 300, support: 0 });
  });

  it('goes into the note one line per body, with what it is not: grams and minutes', () => {
    const report = reportOf({ status: 'ready', findings: [] }, 0.4, 3, [bodyMeasures(box('Box', [20, 30, 10]), PLA)]);
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    const note = printCheckNote(report);
    expect(note).toContain("Per body as it prints (solid volume; the slicer's infill, walls and speed decide grams and time, so promise neither):");
    expect(note).toContain('- "Box": 6 cm³, 10 mm high (50 layers), 600 mm² on the bed, 0 mm² leaning past the overhang limit.');
    // A check without measures (an older renderer, no closed body) says nothing of them.
    expect(printCheckNote({ status: 'ready', findings: [], nozzle: 0.4, revision: 3 })).not.toContain('Per body');
  });

  it('lists six bodies and counts the rest, also what the report itself left out', () => {
    const many = Array.from({ length: 45 }, (_, i) => ({ name: `Pin ${String(i + 1)}`, volume: 0.1, height: 5, layers: 25, contact: 20, support: 0 }));
    const report = reportOf({ status: 'warn', findings: [{ kind: 'open', severity: 'warn', bodies: ['Shell'] }] }, 0.4, 3, many);
    expect(report.bodies).toHaveLength(40);
    expect(report.bodiesOmitted).toBe(5);
    expect(printCheckReportSchema.safeParse(report).success).toBe(true);
    const note = printCheckNote(report);
    expect(note).toContain('- "Pin 6": 0.1 cm³');
    expect(note).not.toContain('"Pin 7"');
    expect(note).toContain('- and 39 more bodies.');
  });
});
