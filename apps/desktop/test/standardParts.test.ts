import { describe, expect, it } from 'vitest';

import { freeBodyName, isLibraryPart, libraryOf, libraryPartOf } from '../src/main/solidcraft/standardParts';
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

// The 13 families of SolidCraft 0.40.1's `parts.library` with their first sizes, and what `parts.insert`
// described one part of each as (measured 2026-11-12).
const size = (...sizes: string[]) => sizes.map((entry) => ({ size: entry }));
const library = {
  families: [
    { family: 'socket_head_cap_screw', name: 'Socket head cap screw', sizes: size('M2', 'M2.5', 'M3') },
    { family: 'button_head_cap_screw', name: 'Button head cap screw', sizes: size('M3', 'M4') },
    { family: 'countersunk_socket_screw', name: 'Countersunk socket screw', sizes: size('M3', 'M4') },
    { family: 'hex_bolt', name: 'Hex head bolt / screw', sizes: size('M2', 'M2.5', 'M3') },
    { family: 'hex_nut', name: 'Hex nut', sizes: size('M2', 'M2.5', 'M3') },
    { family: 'washer', name: 'Plain washer', sizes: size('M2', 'M2.5', 'M3') },
    { family: 'set_screw', name: 'Hex socket set screw, flat point', sizes: size('M3', 'M4') },
    { family: 'dowel_pin', name: 'Parallel pin (dowel)', sizes: size('2', '3') },
    { family: 'bearing', name: 'Deep groove ball bearing (envelope)', sizes: size('625', '626') },
    { family: 'hex_cap_screw_inch', name: 'Hex cap screw (inch)', sizes: size('1/4-20 UNC', '1/4-28 UNF') },
    { family: 'hex_nut_inch', name: 'Hex nut (inch)', sizes: size('1/4-20 UNC', '1/4-28 UNF') },
    { family: 'washer_sae', name: 'Plain washer, SAE (narrow)', sizes: size('1/4', '5/16') },
    { family: 'washer_uss', name: 'Plain washer, USS (wide)', sizes: size('1/4', '5/16') },
  ],
};
const inserted = [
  'Socket head cap screw M3x8',
  'Button head cap screw M3x8',
  'Countersunk socket screw M3x8',
  'Hex head bolt / screw M3x8',
  'Hex nut M3',
  'Plain washer M3',
  'Hex socket set screw, flat point M3x4',
  'Parallel pin (dowel) 2x8',
  'Deep groove ball bearing (envelope) 625',
  'Hex cap screw (inch) 1/4-20 UNC x 3/4',
  'Hex nut (inch) 1/4-20 UNC',
  'Plain washer, SAE (narrow) 1/4',
  'Plain washer, USS (wide) 1/4',
];

describe("parts of SolidCraft's library, told by what parts.library lists (audit S-01, G2)", () => {
  it('knows a part of every family, the countersunk screw too, and lengths off the list', () => {
    expect(inserted.filter((description) => isLibraryPart(description, library))).toEqual(inserted);
    // The screws partbuddy_mechanism puts in for head: countersunk; a fixed list of 12 names left them printed and exported.
    expect(isLibraryPart('Countersunk socket screw M3x10', library)).toBe(true);
    for (const description of ['Socket head cap screw M2.5x7.5', 'Hex cap screw (inch) 1/4-20 UNC x 1-1/2', 'Hex cap screw (inch) 1/4-20 UNCx7.5']) {
      expect(isLibraryPart(description, library), description).toBe(true);
    }
  });

  it('reads family, size and length in mm from the description, as parts.insert takes them to build the part again', () => {
    // Descriptions as SolidCraft 0.40.1 writes them: millimetres after "x", inches after " x ".
    expect(libraryPartOf('Countersunk socket screw M3x10', library)).toEqual({ family: 'countersunk_socket_screw', size: 'M3', length: 10 });
    expect(libraryPartOf('Socket head cap screw M2.5x7.5', library)).toEqual({ family: 'socket_head_cap_screw', size: 'M2.5', length: 7.5 });
    expect(libraryPartOf('Hex nut (inch) 1/4-20 UNC', library)).toEqual({ family: 'hex_nut_inch', size: '1/4-20 UNC', length: null });
    expect(libraryPartOf('Hex cap screw (inch) 1/4-20 UNC x 3/4', library)?.length).toBeCloseTo(19.05, 9);
    expect(libraryPartOf('Hex cap screw (inch) 1/4-20 UNC x 1-1/4', library)).toEqual({ family: 'hex_cap_screw_inch', size: '1/4-20 UNC', length: 31.75 });
    expect(libraryPartOf('Hex cap screw (inch) 1/4-20 UNC x 8', library)?.length).toBeCloseTo(203.2, 9);
    expect(libraryPartOf('Hex cap screw (inch) 1/4-20 UNCx7.5', library)?.length).toBe(7.5);
    expect(libraryPartOf('Hex cap screw (inch) 1/4-20 UNC x 1/0', library)).toBeNull();
    expect(libraryPartOf('Hex nut holder', library)).toBeNull();
  });

  it('knows a family SolidCraft adds without a change in PartBuddy', () => {
    expect(isLibraryPart('Square nut M3', library)).toBe(false);
    expect(isLibraryPart('Square nut M3', { families: [...library.families, { family: 'square_nut', name: 'Square nut', sizes: size('M3') }] })).toBe(true);
  });

  it('leaves a printed part printed whose description only reads like a library part', () => {
    for (const description of ['Hex nut holder', 'Hex nut M3 holder', 'Hex nut', 'Hex nut ', 'Hex nut M33', 'Plain washer M3x', 'Countersunk socket screw', 'Bracket for a Hex nut M3', 'hex nut M3', null, 3]) {
      expect(isLibraryPart(description, library), String(description)).toBe(false);
    }
    // Without the library nothing is taken for a part: the bodies stay in print check and export.
    expect(isLibraryPart('Hex nut M3', null)).toBe(false);
    expect(isLibraryPart('Hex nut M3', { families: [null, { name: 'Hex nut' }, { name: 'Hex nut', sizes: [null, {}] }] })).toBe(false);
  });
});

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

  it('names the part\'s body freely', () => {
    expect(freeBodyName('SHCS M3x12', ['Body1'])).toBe('SHCS M3x12');
    expect(freeBodyName('SHCS M3x12', ['SHCS M3x12', 'SHCS M3x12 (2)'])).toBe('SHCS M3x12 (3)');
  });
});
