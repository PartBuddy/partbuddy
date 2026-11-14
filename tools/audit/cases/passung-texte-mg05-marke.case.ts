import { designLines } from '../../../apps/desktop/src/main/print/printProfiles';
import { hingeOf } from '../../../apps/desktop/src/main/agents/mechanismTool';
import { DESIGN_DEFAULTS } from '../../../apps/desktop/src/shared/contract';
import { fitMarkOf, fittedValue, printInPlaceGap, refit, snapSize } from '../../../apps/desktop/src/shared/designFit';
import { save, startingMaterial } from '../passung-texte-helpers';

// MG-05: a gap marked "[auto 1×nozzle]" on a 0.2 mm nozzle, against the floor PartBuddy names itself.
test('MG-05: the mark 1×nozzle on small nozzles', () => {
  const comment = 'Hinge gap [auto 1×nozzle]';
  const mark = fitMarkOf(comment);
  if (!mark) throw new Error('mark not read');
  const rows = [0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8].map((nozzle) => {
    const printer = { nozzle, layer: nozzle / 2 };
    const told = designLines(DESIGN_DEFAULTS, printer, startingMaterial('pla')).find((line) => line.startsWith('- Sizes you choose yourself'));
    const hinge = hingeOf({ fixed: 'A', moving: 'B', from: [0, 0, 3], to: [0, 30, 3] }, nozzle);
    return {
      nozzle,
      fittedValueFrom04: fittedValue(mark, 0.4, printer),
      printInPlaceGap: printInPlaceGap(printer),
      snapSizeGap: snapSize('gap', nozzle, printer),
      hingeToolDefaultGap: typeof hinge === 'string' ? hinge : hinge.gap,
      toldGap: /print-in-place gaps ([\d.]+ mm)/.exec(told ?? '')?.[1],
      toldMark: /"Hinge gap \[auto [^\]]+\]"/.exec(told ?? '')?.[0],
      // The assistant follows the note (gap as told, marked 1×nozzle); the user then changes the printer, or not.
      refitOfToldGap: refit([{ name: 'gap', value: printInPlaceGap(printer), comment }], printer),
    };
  });
  save('mg05-marke', { comment, mark, rows });
  // MG-05 fixed (PR #352): the gap marked in nozzles stays at 0.3 mm on a 0.2 mm nozzle.
  expect(rows[0]?.fittedValueFrom04).toBe(0.3);
  expect(rows[0]?.printInPlaceGap).toBe(0.3);
});
