import { describe, expect, it } from 'vitest';

import { freeBodyName, libraryOf, standardPartsOf, STANDARD_PARTS_KEY } from '../src/main/solidcraft/standardParts';
import { hasLength, suggestLength, suggestSize } from '../src/renderer/src/viewer/partChoice';

// As SolidCraft 0.40's `parts.library` answers, shortened.
const raw = {
  families: [
    {
      family: 'socket_head_cap_screw',
      name: 'Socket head cap screw',
      lengths: [4, 5, 6, 8, 10, 12, 16],
      sizes: [
        { d: 2.5, default_length: 8, size: 'M2.5' },
        { d: 3, default_length: 8, size: 'M3' },
        { d: 4, default_length: 10, size: 'M4' },
      ],
    },
    { family: 'bearing', name: 'Deep groove ball bearing (envelope)', lengths: null, sizes: [{ bore: 5, outer: 16, size: '625' }, { bore: 8, outer: 22, size: '608' }] },
    { family: 'hex_cap_screw_inch', name: 'Inch', lengths: [1], sizes: [{ d: 6.35, size: '1/4-20 UNC' }] },
  ],
};

describe('standard parts (B7)', () => {
  it('keeps the metric families with the diameter that goes into the hole', () => {
    const library = libraryOf(raw);
    expect(library.map((entry) => entry.family)).toEqual(['socket_head_cap_screw', 'bearing']);
    expect(library[1]?.sizes[1]).toEqual({ size: '608', diameter: 22, defaultLength: null });
    expect(libraryOf(null)).toEqual([]);
  });

  it('suggests the size and length that fit the picked hole', () => {
    const library = libraryOf(raw);
    expect(suggestSize(library, 'socket_head_cap_screw', 3.4)).toBe('M3');
    expect(suggestSize(library, 'socket_head_cap_screw', 3.05)).toBe('M3');
    expect(suggestSize(library, 'socket_head_cap_screw', 1)).toBe('M2.5');
    expect(suggestSize(library, 'bearing', 22.2)).toBe('608');
    expect(suggestLength(library, 'socket_head_cap_screw', 'M4')).toBe(10);
    expect(hasLength(library, 'bearing')).toBe(false);
    expect(suggestLength(library, 'bearing', '608')).toBeNull();
  });

  it('names the part\'s body freely and reads the marked bodies back', () => {
    expect(freeBodyName('SHCS M3x12', ['Body1'])).toBe('SHCS M3x12');
    expect(freeBodyName('SHCS M3x12', ['SHCS M3x12', 'SHCS M3x12 (2)'])).toBe('SHCS M3x12 (3)');
    expect(standardPartsOf({ [STANDARD_PARTS_KEY]: { bodies: ['SHCS M3x12', 3] } })).toEqual(['SHCS M3x12']);
    expect(standardPartsOf({})).toEqual([]);
  });
});
