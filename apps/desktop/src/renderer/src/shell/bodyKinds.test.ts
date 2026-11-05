import { describe, expect, it } from 'vitest';

import { bodyKindOf } from './bodyKinds';

const feature = (id: number, type: string) => ({ id, name: type, type, error: null, warning: null, suppressed: false, rolledBack: false, ms: 0 });

describe('body kinds (B4)', () => {
  it('tells mesh bodies and imported parts from modelled ones by the feature that made them', () => {
    const features = [feature(3, 'BaseFeature'), feature(6, 'MeshFeature'), feature(13, 'ConvertMeshFeature'), feature(14, 'ExtrudeFeature')];
    expect(bodyKindOf({ name: 'Platine', visible: true, feature: 6 }, features)).toBe('mesh');
    expect(bodyKindOf({ name: 'Gehäuse', visible: true, feature: 3 }, features)).toBe('imported');
    expect(bodyKindOf({ name: 'Halter', visible: true, feature: 13 }, features)).toBe('model');
    expect(bodyKindOf({ name: 'Deckel', visible: true, feature: null }, features)).toBe('model');
  });
});
