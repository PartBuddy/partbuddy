import { describe, expect, it } from 'vitest';

import { componentsWithBodies, libraryBodies, structureOf } from '../src/main/solidcraft/mirror';
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

describe('standard parts the assistant inserted itself', () => {
  it('takes the bodies of parts.insert components as standard parts, by their description, also when renamed', () => {
    // component.list as SolidCraft 0.40.0-rc.2 answers: the design itself, three components holding a body, an empty one.
    const parts = componentsWithBodies({
      components: [
        { id: 0, name: 'Sensor housing', parent: null, bodies: ['Base', 'Lid'] },
        { id: 25, name: 'Screw FR', parent: 0, bodies: ['Screw FR'] },
        { id: 31, name: 'Bearing 608', parent: 0, bodies: ['Bearing'] },
        { id: 40, name: 'Bracket', parent: 0, bodies: ['Bracket'] },
        { id: 41, name: 'Group', parent: 0, bodies: [] },
      ],
    });
    expect(parts.map((part) => part.id)).toEqual([25, 31, 40]);
    // Their component.metadata: two from parts.insert, one of the user's own.
    const metadata = [{ description: 'Button head cap screw M3x8' }, { description: 'Deep groove ball bearing (envelope) 608' }, { description: 'Bracket for the shelf' }];
    expect(libraryBodies(parts, metadata)).toEqual(['Screw FR', 'Bearing']);
    expect(componentsWithBodies(undefined)).toEqual([]);
  });
});
