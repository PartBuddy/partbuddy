/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { describe, expect, it } from 'vitest';

import { meshMetrics, overhangFindings } from './analysis';
import { deriveEdges, edgeName } from './edges';
import { diffFaces, isUnchanged } from './faceDiff';
import { faceTableFromModelFaces, sameCylinder, type FaceTable } from './faceTable';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf, type TaggedMesh } from './tagged3mf';

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

  it('reads attributes in any order and fails on a triangle it cannot read, another unit or a moved item (audit D30)', () => {
    const xml = strFromU8(unzipSync(new Uint8Array(readFileSync(new URL('cable-clip.3mf', fixture))))['3D/3dmodel.model']!);
    const packed = (text: string) => zipSync({ '3D/3dmodel.model': strToU8(text) });
    // Written the other way round, the mesh is the same.
    const turned = xml
      .replace(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g, '<vertex z="$3" y="$2" x="$1" />')
      .replace(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)" ft:face="(\d+)"\/>/g, '<triangle ft:face="$4" v3="$3" v1="$1" v2="$2"/>');
    expect(turned).not.toBe(xml);
    expect(parseTagged3mf(packed(turned))).toEqual(mesh);
    // One triangle without its face tag left a hole in the mesh, and the check and the view went on with it.
    expect(() => parseTagged3mf(packed(xml.replace(/ ft:face="\d+"\/>/, '/>')))).toThrow(/triangle 0 has no valid ft:face/);
    expect(() => parseTagged3mf(packed(xml.replace('unit="millimeter"', 'unit="inch"')))).toThrow(/unit is inch/);
    expect(() => parseTagged3mf(packed(xml.replace('<item objectid="2"/>', '<item objectid="2" transform="1 0 0 0 1 0 0 0 1 10 0 0"/>')))).toThrow(/transform/);
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

/** A 10 mm cube; top and bottom carry face 0, the four sides face 1 (two separate loops between them). */
function cube(): TaggedMesh {
  const positions = Float64Array.from([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10]);
  const quads = [
    [0, 3, 2, 1, 0],
    [4, 5, 6, 7, 0],
    [0, 1, 5, 4, 1],
    [1, 2, 6, 5, 1],
    [2, 3, 7, 6, 1],
    [3, 0, 4, 7, 1],
  ];
  const indices: number[] = [];
  const faces: number[] = [];
  for (const [a, b, c, d, face] of quads) {
    indices.push(a!, b!, c!, a!, c!, d!);
    faces.push(face!, face!);
  }
  return { name: 'Cube', positions, indices: Uint32Array.from(indices), triangleFaces: Uint32Array.from(faces), faceCount: 2 };
}

describe('B-rep edges and vertices', () => {
  it('does not take a triangle drawn to a line for a hole in the shell', () => {
    // (a, a, b) has an edge from a to itself, which no other triangle closes: a closed cube read as open.
    const mesh = cube();
    const withSliver = { ...mesh, indices: Uint32Array.from([...mesh.indices, 0, 0, 1]), triangleFaces: Uint32Array.from([...mesh.triangleFaces, 0]) };
    expect(deriveEdges(withSliver).openEdges).toBe(0);
    expect(deriveEdges(withSliver).edges).toHaveLength(2);
  });

  it('splits the edges between two faces into one chain per connected loop', () => {
    const { edges, openEdges } = deriveEdges(cube());
    expect(openEdges).toBe(0);
    // The diagonals inside each quad are not edges; the 0|1 pair forms two closed squares.
    expect(edges).toHaveLength(2);
    for (const edge of edges) {
      expect(edge.faces).toEqual([0, 1]);
      expect(edge.length).toBeCloseTo(40, 5);
      expect(edge.ends).toEqual([]);
    }
  });

  it('describes every edge of the fixture with its faces, range, length and end points', () => {
    const render = buildRenderMesh(mesh, table);
    const count = render.edgeLengths.length;
    expect(count).toBeGreaterThan(20);
    expect(render.edgeFaces.length).toBe(count * 2);
    let segments = 0;
    const corners = new Set<string>();
    for (let v = 0; v < render.vertices.length; v += 3) corners.add(Array.from(render.vertices.subarray(v, v + 3)).join(','));
    for (let e = 0; e < count; e += 1) {
      expect(render.edgeRanges[e * 2]).toBe(segments);
      segments += render.edgeRanges[e * 2 + 1]!;
      expect(render.edgeLengths[e]).toBeGreaterThan(0);
      expect(render.edgeFaces[e * 2]).toBeLessThan(render.edgeFaces[e * 2 + 1]!);
    }
    expect(segments * 6).toBe(render.edgeSegments.length);
    // Every end of an open edge is a vertex, and every vertex ends at least two edges.
    const { edges } = deriveEdges(mesh, (a, b) => sameCylinder(table.faces[a]!, table.faces[b]!));
    const uses = new Map<string, number>();
    for (const edge of edges) {
      for (const end of edge.ends) {
        const key = Array.from(Float32Array.from(end)).join(',');
        uses.set(key, (uses.get(key) ?? 0) + 1);
      }
    }
    expect(corners.size).toBe(uses.size);
    for (const [corner, n] of uses) {
      expect(corners.has(corner)).toBe(true);
      expect(n, corner).toBeGreaterThanOrEqual(2);
    }
  });

  it('names an edge like SolidCraft: both face names sorted, joined by "|"', () => {
    expect(edgeName('F1:-y', 'F1:+x')).toBe('F1:+x|F1:-y');
    expect(edgeName('F2:side#1', 'F2:bottom')).toBe('F2:bottom|F2:side#1');
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
    // Only a face with some area must have a point on it.
    expect(() => faceTableFromModelFaces({ faces: [{ ...raw.faces[0], point: null }] }, 'Body', 'design')).toThrow(/point/);
  });

  it('takes a face without area and without a point, as SolidCraft reports a sliver (M7f)', () => {
    const sliver = { index: 0, name: 'F4:start#[F2:cbore:side:1,F4:side:l2,F4:side:l3]', exact: true, area: 0, centroid: [0, 0, 0], point: null, plane_normal: null };
    expect(faceTableFromModelFaces({ faces: [sliver] }, 'Body', 'design').faces[0]).toMatchObject({ area: 0, point: [0, 0, 0] });
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
