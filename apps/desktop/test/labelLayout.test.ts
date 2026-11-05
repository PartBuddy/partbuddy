import { describe, expect, it } from 'vitest';

import { layoutLabels } from '../src/renderer/src/viewer/labelLayout';

const view = { width: 800, height: 600 };
const label = (id: string, x: number, y: number, width = 30, height = 16) => ({ id, x, y, width, height });

describe('dimension label layout (UI upgrade step 10)', () => {
  it('leaves labels that do not touch where they are', () => {
    const placed = layoutLabels([label('a', 100, 100), label('b', 300, 100)], view);
    expect(placed.get('a')).toEqual({ dx: 0, dy: 0 });
    expect(placed.get('b')).toEqual({ dx: 0, dy: 0 });
  });

  it('moves a label off the one before it, by its own height first', () => {
    // "Ø9" and "4.5" of a countersunk hole meet at the same point.
    const placed = layoutLabels([label('sink', 200, 200), label('hole', 200, 200)], view);
    expect(placed.get('sink')).toEqual({ dx: 0, dy: 0 });
    expect(placed.get('hole')).toEqual({ dx: 0, dy: -19 });
  });

  it('hides a label rather than stack it when no place nearby is free', () => {
    const crowd = Array.from({ length: 14 }, (_, i) => label(String(i), 400, 300));
    const placed = layoutLabels(crowd, view);
    const shown = [...placed.values()].filter((p) => p !== null);
    expect(shown).toHaveLength(11);
    expect(placed.get('13')).toBeNull();
  });

  it('hides labels whose anchor is off the view and keeps the rest inside it', () => {
    const placed = layoutLabels([label('out', -20, 100), label('edge', 5, 100)], view);
    expect(placed.get('out')).toBeNull();
    // Centred at x 5 the label would stick out on the left; it moves right by its width.
    expect(placed.get('edge')).toEqual({ dx: 33, dy: 0 });
  });
});

describe('dimension labels and the bars on the view (UI upgrade step 11)', () => {
  it('moves a label off the selection dock and the view tools', () => {
    const dock = { left: 300, top: 520, right: 500, bottom: 590 };
    const placed = layoutLabels([label('under-dock', 400, 530)], view, [dock]);
    // Not on the dock and not touching it: two label heights up is the first free place.
    expect(placed.get('under-dock')).toEqual({ dx: 0, dy: -38 });
  });
});
