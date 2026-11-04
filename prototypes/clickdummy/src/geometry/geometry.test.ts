/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { describe, expect, it } from 'vitest';

import { meshMetrics, overhangFindings } from './analysis';
import { deriveEdges } from './edges';
import { sameCylinder, type FaceTable } from './faceTable';
import { parseTagged3mf } from './tagged3mf';

const fixture = new URL('../../public/fixtures/', import.meta.url);
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
