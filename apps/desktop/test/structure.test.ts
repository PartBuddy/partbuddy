import { describe, expect, it } from 'vitest';

import { structureOf } from '../src/main/solidcraft/mirror';
import { structureSchema } from '../src/shared/contract';

describe('structure tree and timeline from document.inspect (M1c)', () => {
  it('reads features, the rollback marker, bodies and sketches as SolidCraft 0.30.1 reports them', () => {
    const structure = structureOf({
      bodies: [{ name: 'Body1', visible: true, feature: 2 } as { name: string; visible: boolean }],
      sketches: [{ id: 1, name: 'Base', visible: false }],
      timeline: [
        { id: 1, name: 'Base', type: 'Sketch', error: null, warning: null, suppressed: false, rolled_back: false, ms: 0.2 },
        { id: 2, name: 'Extrude1', type: 'ExtrudeFeature', error: null, warning: null, suppressed: false, rolled_back: false, ms: 2.4 },
        { id: 3, name: 'Fillet1', type: 'FilletFeature', error: 'radius too large', warning: null, suppressed: false, rolled_back: true, ms: 0 },
        { id: 'broken' },
      ],
      marker: 2,
    });
    expect(structure.features.map((feature) => [feature.name, feature.rolledBack, feature.error])).toEqual([
      ['Base', false, null],
      ['Extrude1', false, null],
      ['Fillet1', true, 'radius too large'],
    ]);
    expect(structure.marker).toBe(2);
    expect(structure.bodies).toEqual([{ name: 'Body1', visible: true, feature: 2 }]);
    expect(structure.sketches).toEqual([{ id: 1, name: 'Base', visible: false }]);
    expect(structureSchema.safeParse(structure).success).toBe(true);
  });

  it('reports the marker only while it is before the end', () => {
    const timeline = [{ id: 1, name: 'Box1', type: 'BoxFeature', suppressed: false, rolled_back: false, ms: 1 }];
    expect(structureOf({ timeline, marker: 1 }).marker).toBeNull();
    expect(structureOf({ timeline, marker: 0 }).marker).toBe(0);
    expect(structureOf({}).features).toEqual([]);
  });
});
