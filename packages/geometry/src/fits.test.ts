/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import type { FaceTable } from './faceTable';
import { cylinderKind, fitDiameter, printedDiameter } from './fits';
import { buildRenderMesh } from './renderMesh';
import { parseTagged3mf } from './tagged3mf';
import { buildViewerModel } from './viewerModel';

const PETG = { clearance: { clamp: 0.1, push: 0.2, slide: 0.3, turn: 0.35 }, holeShrink: 0.2 };

describe('fits for printed parts (M7)', () => {
  it('tells holes from pins on the cable clip', () => {
    const fixture = new URL('../fixtures/', import.meta.url);
    const mesh = parseTagged3mf(new Uint8Array(readFileSync(new URL('cable-clip.3mf', fixture))));
    const table = JSON.parse(readFileSync(new URL('cable-clip.faces.json', fixture), 'utf8')) as FaceTable;
    const model = buildViewerModel(buildRenderMesh(mesh, table), table);
    const kindOf = (name: string) => cylinderKind(model, table.faces.findIndex((face) => face.name === name));
    // The screw bores and the cable channel are holes, the rounded corners of the plate are pins.
    expect(kindOf('F8:bore:side:0')).toBe('hole');
    expect(kindOf('F5:side#1')).toBe('hole');
    expect(kindOf('F2:blend:F1:+x|F1:+y')).toBe('pin');
    expect(kindOf('F1:+z')).toBeNull();
  });

  it('draws a hole for a 6 mm shaft larger by the clearance and the hole allowance', () => {
    expect(fitDiameter('hole', 6, 'slide', PETG)).toBe(6.8);
    expect(fitDiameter('hole', 8, 'clamp', PETG)).toBe(8.4);
    expect(fitDiameter('pin', 6, 'turn', PETG)).toBe(5.3);
  });

  it('draws a pin for a drawn hole from what the hole prints at', () => {
    const printed = printedDiameter('hole', 6.8, PETG);
    expect(printed).toBe(6.6);
    expect(fitDiameter('pin', printed, 'slide', PETG)).toBe(6);
    expect(printedDiameter('pin', 6, PETG)).toBe(6);
  });

  it('draws pins smaller by the outer growth measured after printing', () => {
    const measured = { ...PETG, outerGrowth: 0.1 };
    expect(fitDiameter('pin', 6, 'slide', measured)).toBe(5.3);
    expect(printedDiameter('pin', 5.3, measured)).toBe(5.4);
    expect(fitDiameter('hole', 6, 'slide', measured)).toBe(6.8);
  });
});
