/* eslint-disable no-restricted-syntax -- converting colours needs colour values as test input */
import { describe, expect, it } from 'vitest';

import { hexColor } from '../src/renderer/src/shell/hexColor';

describe('window button colours', () => {
  it('turns what the minified CSS and computed styles give into #rrggbb', () => {
    expect(hexColor(' #FFF ')).toBe('#ffffff');
    expect(hexColor('#1a2b3c')).toBe('#1a2b3c');
    expect(hexColor('rgb(26, 43, 60)')).toBe('#1a2b3c');
    expect(hexColor('rgba(26 43 60 / 50%)')).toBe('#1a2b3c');
    expect(hexColor('oklch(0.5 0.1 200)')).toBeNull();
    expect(hexColor('rgb(300, 0, 0)')).toBeNull();
  });
});
