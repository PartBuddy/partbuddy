import { printNote } from '../../../apps/desktop/src/main/print/printProfiles';
import { printCheckNote } from '../../../apps/desktop/src/main/print/printCheckNote';
import { scaleClearance } from '../../../apps/desktop/src/shared/designFit';
import { testPieceSteps, PIN } from '../../../apps/desktop/src/shared/testPieces';
import { applyReadings } from '../../../apps/desktop/src/shared/tolerances';
import { partPrint, save, source, startingMaterial } from '../passung-texte-helpers';

// T2: the way of a reading from the tolerance assistant to the assistant's print note, per nozzle.
test('T2: a clearance read off the test pieces, as the assistant gets it', () => {
  const pla = startingMaterial('pla');
  const readings = { fits: { clamp: 0.05, push: 0.15, slide: 0.3, turn: 0.35 }, holes: [null, null, null, null], overhang: null };
  const applied = applyReadings(pla, readings);
  const perNozzle = [0.2, 0.25, 0.4, 0.6, 0.8].map((nozzle) => {
    const layer = nozzle / 2;
    // The comb hole the user reads "0.3" off: built for this nozzle (ToleranceAssistant.tsx:58,79).
    const hole = testPieceSteps({ nozzle, layer }).find((step) => step.params.name === 'Fit 0.3');
    const note = printNote(partPrint(nozzle, layer, applied.material));
    return {
      nozzle,
      combHoleDiameter: hole?.params.diameter,
      combClearancePerSide: (Number(hole?.params.diameter) - PIN) / 2,
      storedSlide: applied.material.clearance.slide,
      scaled: {
        clamp: scaleClearance(applied.material.clearance.clamp, { nozzle, layer }),
        push: scaleClearance(applied.material.clearance.push, { nozzle, layer }),
        slide: scaleClearance(applied.material.clearance.slide, { nozzle, layer }),
        turn: scaleClearance(applied.material.clearance.turn, { nozzle, layer }),
      },
      noteClearanceLine: note.split('\n').find((line) => line.startsWith('Clearance per side')),
      noteFitsLine: /press fit [^(]+\(the material's values, scaled for this nozzle\)/.exec(note)?.[0],
    };
  });
  // The ready-to-print check takes the push fit as stored (usePrintCheck.ts:54), not scaled.
  const tight = printCheckNote({
    status: 'warn',
    nozzle: 0.2,
    revision: 1,
    findings: [{ kind: 'tight', severity: 'warn', bodies: ['Pin', 'Hole'], gap: scaleClearance(applied.material.clearance.push, { nozzle: 0.2, layer: 0.1 }), minimum: applied.material.clearance.push, places: [] }],
  });
  const result = {
    readings,
    problems: applied.problems,
    storedClearance: applied.material.clearance,
    settingsFieldShows: 'material.clearance[fit] as stored (PrintProfilesEditor.tsx:242)',
    perNozzle,
    checkUsesStoredPush: source('renderer/src/print/usePrintCheck.ts').includes('const pushFit = print.material.clearance.push;'),
    checkScales: source('renderer/src/print/usePrintCheck.ts').includes('scaleClearance'),
    tightNoteAtNozzle02: tight,
  };
  save('t2-toleranz', result);
  const at06 = perNozzle.find((row) => row.nozzle === 0.6);
  expect(at06?.combClearancePerSide).toBeCloseTo(0.3, 9);
  expect(at06?.storedSlide).toBe(0.3);
  expect(at06?.scaled.slide).toBe(0.45);
  expect(at06?.noteClearanceLine).toContain('slide 0.45 mm');
});
