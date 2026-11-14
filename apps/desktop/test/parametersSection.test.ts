import { describe, expect, it } from 'vitest';

import { commentText, groupParameters, labelOf, rangeOf } from '../src/renderer/src/shell/parameterRange';
import { groupOf, withoutGroup } from '../src/shared/parameterGroup';

describe('parameter panel: the range in a comment', () => {
  it('reads [min..max] with points or commas and ignores anything else', () => {
    expect(rangeOf('Base plate length [50..90]')).toEqual({ min: 50, max: 90 });
    expect(rangeOf('Wand [1,2 .. 3,5] mm')).toEqual({ min: 1.2, max: 3.5 });
    expect(rangeOf('no range')).toBeNull();
    expect(rangeOf('[9..3]')).toBeNull();
    expect(commentText('Base plate length [50..90]')).toBe('Base plate length');
  });
});

describe('parameter panel: groups and labels (decided 2026-11-14)', () => {
  const entry = (name: string, comment: string, expression = '10 mm', favorite = false) => ({
    name,
    comment,
    expression,
    favorite,
    unit: expression === 'PartBuddy' ? 'text' : expression.endsWith('deg') ? 'deg' : 'mm',
    editable: /^\d+ mm$/.test(expression),
  });

  it('reads the group in brackets at the start of a comment, never a range or a fit mark', () => {
    expect(groupOf('[Monitor] Ultrawide-Höhe [300..400]')).toBe('Monitor');
    expect(groupOf('[50..90] Länge')).toBeNull();
    expect(groupOf('[auto 3×line] Wand')).toBeNull();
    expect(groupOf('Wand [auto 3×line]')).toBeNull();
    expect(withoutGroup('[Fuß] Fußbreite')).toBe('Fußbreite');
    expect(commentText('[Monitor] Ultrawide-Höhe [300..400] [auto 3×line]')).toBe('Ultrawide-Höhe');
    expect(labelOf('[Box] Outer length of box and lid; the hinge is 40 mm long [54..200]')).toBe('Outer length of box and lid');
    expect(labelOf('')).toBe('');
  });

  it('puts favourites first, the groups in their order, the ungrouped last, and folds formulas away', () => {
    const list = [
      entry('uw_h', '[Monitor] Ultrawide-Höhe'),
      entry('foot_w', '[Fuß] Fußbreite'),
      entry('uw_mid', '[Monitor] Mitte', 'uw_h / 2'),
      entry('tilt', '[Kopf] Neigung', '12 deg'),
      entry('wall', 'Wand', '3 mm', true),
      entry('slot_a', 'Schlitz', 'wall + 0.3 mm'),
      entry('label', 'Beschriftung', 'PartBuddy'),
      entry('uw_w', '[Monitor] Ultrawide-Breite'),
    ];
    const { favorites, groups } = groupParameters(list);
    expect(favorites.map((p) => p.name)).toEqual(['wall']);
    expect(groups.map((g) => [g.name, g.values.map((p) => p.name), g.computed.map((p) => p.name)])).toEqual([
      ['Monitor', ['uw_h', 'uw_w'], ['uw_mid']],
      ['Fuß', ['foot_w'], []],
      // An angle and a text are set by hand, not worked out.
      ['Kopf', ['tilt'], []],
      [null, ['label'], ['slot_a']],
    ]);
  });

  it('keeps an old design without groups in one list with its formulas folded', () => {
    const { groups } = groupParameters([entry('a', ''), entry('b', '', 'a * 2'), entry('c', 'Breite')]);
    expect(groups).toEqual([{ name: null, values: [expect.objectContaining({ name: 'a' }), expect.objectContaining({ name: 'c' })], computed: [expect.objectContaining({ name: 'b' })] }]);
  });
});
