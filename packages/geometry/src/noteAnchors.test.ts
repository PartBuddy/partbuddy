/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FaceInfo, FaceTable } from './faceTable';
import { edgeAnchor, faceAnchor, lineageOf, pointAnchor, resolveAnchor, signatureOf, signatureScore, type NoteAnchor } from './noteAnchors';

const fixture = new URL('../fixtures/', import.meta.url);
const table = JSON.parse(readFileSync(new URL('cable-clip.faces.json', fixture), 'utf8')) as FaceTable;

const face = (name: string): FaceInfo => {
  const found = table.faces.find((entry) => entry.name === name);
  if (!found) throw new Error(`fixture has no face ${name}`);
  return found;
};

/** The fixture after a rebuild: every face shifted by `by`, names changed by `rename`. */
function rebuilt(by: [number, number, number], rename: (name: string) => string | null = (name) => name): FaceTable {
  const shift = (v: [number, number, number]): [number, number, number] => [v[0] + by[0], v[1] + by[1], v[2] + by[2]];
  const faces = table.faces.flatMap((entry) => {
    const name = rename(entry.name);
    if (name === null) return [];
    const moved: FaceInfo = { ...entry, name, centroid: shift(entry.centroid), point: shift(entry.point) };
    if (entry.cylinder) moved.cylinder = { ...entry.cylinder, origin: shift(entry.cylinder.origin) };
    return [moved];
  });
  return { ...table, faces };
}

function anchorOn(name: string): Extract<NoteAnchor, { kind: 'face' }> {
  const target = face(name);
  const anchor = faceAnchor(table, name, target.point, target.planeNormal ?? [0, 0, 1]);
  if (anchor?.kind !== 'face') throw new Error('no face anchor');
  return anchor;
}

describe('note anchors (ADR 0006)', () => {
  it('keeps a note on its face by name and moves it with the face', () => {
    const anchor = anchorOn('F1:+z');
    const resolved = resolveAnchor(anchor, [rebuilt([0, 0, 2])]);
    expect(resolved.status).toBe('attached');
    expect(resolved.target).toBe('F1:+z');
    expect(resolved.world[2]).toBeCloseTo(anchor.world[2] + 2, 6);
    expect(resolved.world[0]).toBeCloseTo(anchor.world[0], 6);
  });

  it('keeps the place on a cylinder by height and direction', () => {
    const name = 'F8:bore:side:0';
    const target = face(name);
    expect(target.cylinder).toBeDefined();
    const anchor = faceAnchor(table, name, target.point, [1, 0, 0]);
    if (!anchor) throw new Error('no anchor');
    const resolved = resolveAnchor(anchor, [table]);
    expect(resolved.status).toBe('attached');
    for (const i of [0, 1, 2]) expect(resolved.world[i]).toBeCloseTo(target.point[i] ?? 0, 3);
  });

  it('follows a split face through its lineage and says it moved', () => {
    expect(lineageOf('F4:+z#[F4:-x,F6:-x]')).toBe('F4:+z');
    const anchor = anchorOn('F4:+z#[F4:-x,F6:-x]');
    const renamed = rebuilt([0, 0, 0], (name) => (name.startsWith('F4:+z#') ? name.replace(/#.*$/, name.includes('-x') ? '#1' : '#2') : name));
    const resolved = resolveAnchor(anchor, [renamed]);
    expect(resolved.status).toBe('moved');
    expect(resolved.target).toBe('F4:+z#1');
  });

  it('finds a renamed face by its shape, and never a face of another type', () => {
    const anchor = anchorOn('F6:+x');
    const renamed = rebuilt([0, 0, 0], (name) => (name === 'F6:+x' ? 'F12:+x' : name));
    const resolved = resolveAnchor(anchor, [renamed]);
    expect(resolved.status).toBe('moved');
    expect(resolved.target).toBe('F12:+x');
    expect(signatureScore(signatureOf(face('F1:+z')), face('F8:bore:side:0'))).toBe(0);
  });

  it('calls two equally fitting faces ambiguous', () => {
    const anchor = anchorOn('F1:-z');
    const twin: FaceInfo = { ...face('F1:-z'), index: 999, name: 'F20:-z' };
    const renamed = rebuilt([0, 0, 0], (name) => (name === 'F1:-z' ? 'F21:-z' : name));
    const resolved = resolveAnchor(anchor, [{ ...renamed, faces: [...renamed.faces, twin] }]);
    expect(resolved.status).toBe('ambiguous');
  });

  it('marks a note orphaned when its face or body is gone', () => {
    const anchor = anchorOn('F5:side#1');
    const gone = rebuilt([0, 0, 0], (name) => (name.startsWith('F5:') ? null : name));
    expect(resolveAnchor(anchor, [gone]).status).toBe('orphaned');
    expect(resolveAnchor(anchor, []).status).toBe('orphaned');
    expect(resolveAnchor(anchor, []).world).toEqual(anchor.world);
  });

  it('moves an edge note with its two faces', () => {
    const anchor = edgeAnchor(table, 'F1:+x|F1:+z', [32, 0, 3.2]);
    if (!anchor) throw new Error('no edge anchor');
    const resolved = resolveAnchor(anchor, [rebuilt([1, 0, 0])]);
    expect(resolved.status).toBe('attached');
    expect(resolved.world[0]).toBeCloseTo(33, 6);
    expect(edgeAnchor(table, 'F1:+x|F99:nope', [0, 0, 0])).toBeNull();
    // An edge at a fillet: the fillet's face has a `|` in its own name.
    expect(edgeAnchor(table, 'F1:+z|F3:blend:F1:+x|F1:+z', [0, 0, 0])).toMatchObject({ faces: ['F1:+z', 'F3:blend:F1:+x|F1:+z'] });
    expect(edgeAnchor(table, 'F2:blend:F1:+x|F1:+y|F3:blend:F1:+z|F2:blend:F1:+x|F1:+y', [0, 0, 0])).toMatchObject({ faces: ['F2:blend:F1:+x|F1:+y', 'F3:blend:F1:+z|F2:blend:F1:+x|F1:+y'] });
  });

  it('keeps a point note while its body exists', () => {
    const anchor = pointAnchor(table.body, [1, 2, 3]);
    expect(resolveAnchor(anchor, [table])).toEqual({ status: 'attached', world: [1, 2, 3] });
    expect(resolveAnchor(anchor, []).status).toBe('orphaned');
  });
});
