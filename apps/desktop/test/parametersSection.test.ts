import { describe, expect, it } from 'vitest';

import { commentText, rangeOf } from '../src/renderer/src/shell/parameterRange';

describe('parameter panel: the range in a comment', () => {
  it('reads [min..max] with points or commas and ignores anything else', () => {
    expect(rangeOf('Base plate length [50..90]')).toEqual({ min: 50, max: 90 });
    expect(rangeOf('Wand [1,2 .. 3,5] mm')).toEqual({ min: 1.2, max: 3.5 });
    expect(rangeOf('no range')).toBeNull();
    expect(rangeOf('[9..3]')).toBeNull();
    expect(commentText('Base plate length [50..90]')).toBe('Base plate length');
  });
});
