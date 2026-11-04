/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { describe, expect, it } from 'vitest';

import { meshMetrics, overhangFindings } from './analysis';
import { deriveEdges } from './edges';
import { diffFaces, isUnchanged } from './faceDiff';
import { faceTableFromModelFaces, sameCylinder, type FaceTable } from './faceTable';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf } from './tagged3mf';

const fixture = new URL('../fixtures/', import.meta.url);
const mesh = parseTagged3mf(new Uint8Array(readFileSync(new URL('cable-clip.3mf', fixture))));
const table = JSON.parse(readFileSync(new URL('cable-clip.faces.json', fixture), 'utf8')) as FaceTable;

describe('face-tagged 3MF fixture', () => {
  it('declares the same faces as the face table', () => {
    expect(mesh.name).toBe(table.body);
    expect(mesh.faceCount).toBe(table.faces.length);
    expect(new Set(mesh.triangleFaces).size).toBe(table.faces.length);
  });

  it('maps every face table point onto a triangle tagged with the same face (ADR 0004 contract)', () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(Float32Array.from(mesh.positions), 3));
    geometry.setIndex(new BufferAttribute(mesh.indices, 1));
    const bvh = new MeshBVH(geometry, { indirect: true });
    for (const face of table.faces) {
      const hit = bvh.closestPointToPoint(new Vector3(...face.point));
      expect(hit, face.name).not.toBeNull();
      // Curved faces deviate by the chord tolerance of the "fine" export (5e-5 of the body size).
      expect(hit!.distance, face.name).toBeLessThan(0.01);
      expect(mesh.triangleFaces[hit!.faceIndex], face.name).toBe(face.index);
    }
  });

  it('is watertight and has the expected bounding box', () => {
    const { openEdges } = deriveEdges(mesh);
    expect(openEdges).toBe(0);
    const { bbox, volumeMm3 } = meshMetrics(mesh);
    expect(bbox.min).toEqual([-32, -16, 0]);
    expect(bbox.max).toEqual([32, 16, 20]);
    expect(volumeMm3).toBeGreaterThan(0);
  });

  it('skips seams between pieces of the same cylinder', () => {
    const all = deriveEdges(mesh).edges.length;
    const filtered = deriveEdges(mesh, (a, b) => sameCylinder(table.faces[a]!, table.faces[b]!)).edges.length;
    expect(filtered).toBeLessThan(all);
  });

  it('finds no overhang above 60° in print orientation and ignores the bed face', () => {
    expect(overhangFindings(mesh, 60)).toEqual([]);
  });

  it('finds the former top faces as overhangs when the part is printed upside down', () => {
    const flipped = {
      ...mesh,
      positions: mesh.positions.map((value, i) => (i % 3 === 2 ? 20 - value : value)),
      indices: mesh.indices.map((value, i) => {
        const corner = i % 3;
        if (corner === 1) return mesh.indices[i + 1]!;
        if (corner === 2) return mesh.indices[i - 1]!;
        return value;
      }),
    };
    const names = overhangFindings(flipped, 60).map((f) => table.faces[f.face]!.name);
    expect(names).toContain('F1:+z');
    expect(names).not.toContain('F1:-z');
  });
});

describe('render mesh', () => {
  const render = buildRenderMesh(mesh, table);

  it('keeps the triangle order, so a picked triangle maps to its face', () => {
    expect(render.index.length).toBe(mesh.indices.length);
    expect(render.triangleFaces).toEqual(mesh.triangleFaces);
    for (let t = 0; t < render.index.length / 3; t += 1) {
      for (let k = 0; k < 3; k += 1) {
        expect(render.vertexFaces[render.index[t * 3 + k]!]).toBe(mesh.triangleFaces[t]);
      }
    }
  });

  it('splits vertices per face and keeps their positions', () => {
    expect(render.positions.length / 3).toBeGreaterThanOrEqual(mesh.positions.length / 3);
    const v = render.index[0]!;
    const original = mesh.indices[0]!;
    expect(render.positions[v * 3]).toBeCloseTo(mesh.positions[original * 3]!, 5);
  });

  it('derives edge segments without the cylinder seams', () => {
    expect(render.edgeSegments.length % 6).toBe(0);
    expect(render.edgeSegments.length).toBeGreaterThan(0);
  });
});

describe('model.faces conversion', () => {
  const raw = {
    faces: [
      { index: 0, name: 'F1:-z', exact: true, area: 10, centroid: [0, 0, 0], point: [1, 1, 0], plane_normal: [0, 0, -1] },
      {
        index: 1,
        name: 'F2:bore',
        exact: false,
        area: 5,
        centroid: [0, 0, 2],
        point: [3, 0, 2],
        cylinder: { origin: [0, 0, 0], axis: [0, 0, 1], radius: 3 },
      },
    ],
  };

  it('maps snake_case fields to the face table', () => {
    const converted = faceTableFromModelFaces(raw, 'Body', 'design');
    expect(converted.faces[0]?.planeNormal).toEqual([0, 0, -1]);
    expect(converted.faces[1]?.cylinder?.radius).toBe(3);
    expect(converted.faces[1]?.exact).toBe(false);
    expect(converted.body).toBe('Body');
  });

  it('rejects entries that break the contract', () => {
    expect(() => faceTableFromModelFaces({}, 'Body', 'design')).toThrow(/no face list/);
    expect(() => faceTableFromModelFaces({ faces: [{ ...raw.faces[0], index: 3 }] }, 'Body', 'design')).toThrow(
      /out of order/,
    );
    expect(() => faceTableFromModelFaces({ faces: [{ ...raw.faces[0], point: [1, 2] }] }, 'Body', 'design')).toThrow(
      /point/,
    );
  });
});

describe('face diff between revisions', () => {
  it('finds nothing when the same table is mirrored again', () => {
    expect(isUnchanged(diffFaces(table, structuredClone(table)))).toBe(true);
  });

  it('treats every face as added on the first revision', () => {
    expect(diffFaces(null, table).added).toHaveLength(table.faces.length);
  });

  it('matches faces by name although indices were reassigned', () => {
    const shuffled = { ...table, faces: [...table.faces].reverse().map((face, index) => ({ ...face, index })) };
    expect(isUnchanged(diffFaces(table, shuffled))).toBe(true);
  });

  it('reports moved, new and removed faces', () => {
    const [first, second, ...rest] = table.faces;
    const next = {
      ...table,
      faces: [
        { ...first!, centroid: [first!.centroid[0] + 2, first!.centroid[1], first!.centroid[2]] as [number, number, number] },
        ...rest,
        { ...second!, name: 'F9:new', index: table.faces.length - 1 },
      ].map((face, index) => ({ ...face, index })),
    };
    const diff = diffFaces(table, next);
    expect(diff.changed).toEqual([0]);
    expect(diff.added).toEqual([next.faces.length - 1]);
    expect(diff.removed).toEqual([second!.name]);
  });

  it('ignores differences below the export tolerance', () => {
    const next = { ...table, faces: table.faces.map((face) => ({ ...face, area: face.area * (1 + 1e-5) })) };
    expect(isUnchanged(diffFaces(table, next))).toBe(true);
  });
});
