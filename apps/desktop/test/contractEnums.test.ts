import { describe, expect, it } from 'vitest';

import { HOOK_DIRECTIONS } from '../src/shared/blocks';
import { featureBlockSchema, ZOOM_STEPS, zoomSchema } from '../src/shared/contract';
import { BLOCK_SIZES } from '../src/shared/screwSizes';
import { settingsSchema } from '../src/shared/settings';

describe('the contract holds the lists of the code it checks (audit T47, T48)', () => {
  it('takes the interface size the settings offer and nothing past it', () => {
    expect(zoomSchema.safeParse(ZOOM_STEPS[0]).success).toBe(true);
    expect(zoomSchema.safeParse(ZOOM_STEPS[ZOOM_STEPS.length - 1]).success).toBe(true);
    // Before, 0.8 to 0.89 passed though no step offers it.
    expect(zoomSchema.safeParse(0.8).success).toBe(false);
    expect(zoomSchema.safeParse(0.899).success).toBe(false);
    expect(zoomSchema.safeParse(1.501).success).toBe(false);
    // A file with 0.8 (never offered) reads as the default and still loads.
    expect(settingsSchema.parse({ zoom: 0.8 }).zoom).toBe(1);
    expect(settingsSchema.parse({ zoom: 0.9 }).zoom).toBe(0.9);
  });

  it('knows the sizes and hook directions of the blocks', () => {
    const snap = { block: 'snapFit', body: 'Body1', point: [0, 0, 0], normal: [0, 0, 1], length: 12, thickness: 1.5, width: 5, catchDepth: 0.8, catchLength: 1.5 };
    for (const size of BLOCK_SIZES) for (const hook of HOOK_DIRECTIONS) expect(featureBlockSchema.safeParse({ ...snap, size, hook }).success).toBe(true);
    expect(featureBlockSchema.safeParse({ ...snap, size: 'M12', hook: 'y+' }).success).toBe(false);
    expect(featureBlockSchema.safeParse({ ...snap, size: 'M3', hook: 'z+' }).success).toBe(false);
    const hookOptions = featureBlockSchema.options.find((option) => option.shape.block.value === 'snapFit')?.shape;
    expect(hookOptions && 'hook' in hookOptions ? hookOptions.hook.options : null).toEqual([...HOOK_DIRECTIONS]);
  });
});
