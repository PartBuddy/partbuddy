import { describe, expect, it } from 'vitest';

import { edgesOf, holeLoops } from '../src/main/solidcraft/holeLoops';

describe('the holes of an open part, from its free edges (body.repair refuses to patch them)', () => {
  // model.edges of the wall holder without one face (F1477, SolidCraft 0.49.0): the six free edges round the missing
  // face, one of them starting at -0, a seam of a round face, and an edge between two faces.
  const answer = {
    edges: [
      { name: 'F3:face:8', start: [0, 46, 12], end: [50, 46, 12], mid: [25, 46, 12] },
      { name: 'F3:face:11', start: [50, 46, 12], end: [50, 46, 22], mid: [50, 46, 17] },
      { name: 'F3:face:12', start: [0, 46, 12], end: [0, 46, 22], mid: [0, 46, 17] },
      { name: 'F3:face:15', start: [48.2, 46, 23.8], end: [50, 46, 22], mid: [49.1, 46, 22.9] },
      { name: 'F3:face:16', start: [-0.0000001, 46, 22], end: [1.8, 46, 23.8], mid: [0.9, 46, 22.9] },
      { name: 'F3:face:20', start: [1.8, 46, 23.8], end: [48.2, 46, 23.8], mid: [25, 46, 23.8] },
      { name: 'F3:face:2', start: [23.098, 0, 41.338], end: [23.098, 3.95, 41.338], mid: [23.098, 1.975, 41.338] },
      { name: 'F4:blend(F3:+y|F3:-x)|F3:face:9', start: [0, 0, 0], end: [1, 0, 0], mid: [0.5, 0, 0] },
      { name: 'odd', start: [0, 0], end: [1, 0, 0], mid: [0.5, 0, 0] },
    ],
  };

  it('finds the loop round the missing face, by its edges middles, and leaves seams and shared edges out', () => {
    const edges = edgesOf(answer);
    expect(edges).toHaveLength(8);
    expect(holeLoops(edges)).toEqual([[[25, 46, 12], [50, 46, 17], [0, 46, 17], [49.1, 46, 22.9], [0.9, 46, 22.9], [25, 46, 23.8]]]);
  });

  it('takes a round hole of one edge, and finds none in a closed part', () => {
    const circle = { name: 'F2:bore', start: [5, 0, 0] as [number, number, number], end: [5, 0, 0] as [number, number, number], mid: [-5, 0, 0] as [number, number, number] };
    expect(holeLoops([circle])).toEqual([[[-5, 0, 0]]]);
    expect(holeLoops(edgesOf({ edges: [answer.edges[7]] }))).toEqual([]);
    expect(holeLoops(edgesOf(null))).toEqual([]);
  });
});
