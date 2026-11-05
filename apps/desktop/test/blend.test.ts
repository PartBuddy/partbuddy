import { describe, expect, it } from 'vitest';

import { blendWeights } from '../src/renderer/src/viewer/blend';

describe('before/after weights (UI upgrade step 13)', () => {
  it('shows one side alone at the ends and both solid in the middle', () => {
    expect(blendWeights(0)).toEqual({ before: 1, after: 0 });
    expect(blendWeights(0.25)).toEqual({ before: 1, after: 0.5 });
    expect(blendWeights(0.5)).toEqual({ before: 1, after: 1 });
    expect(blendWeights(0.75)).toEqual({ before: 0.5, after: 1 });
    expect(blendWeights(1)).toEqual({ before: 0, after: 1 });
    expect(blendWeights(3)).toEqual({ before: 0, after: 1 });
  });
});
