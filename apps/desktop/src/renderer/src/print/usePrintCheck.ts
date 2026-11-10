import { isLogoColourBody } from '../../../shared/drawingPlacement';
import { checkPrint, withClearance, withMotion, type PrintCheck } from '@partbuddy/geometry';
import { useEffect } from 'react';

import { platform } from '../platform';
import { useStudio } from '../state/store';
import { reportOf } from './report';

/** Quiet time after a revision before the check runs, so a burst of steps is checked once. */
const CHECK_DELAY_MS = 250;

/**
 * Runs the ready-to-print check (M7) after every revision and every change of the printer or the
 * material, without being asked: the practice run showed the check matters most when nobody
 * thinks of it. The result goes to the status bar and, worded, to the assistant's next message.
 */
export function usePrintCheck(): void {
  const model = useStudio((s) => s.model);
  const print = useStudio((s) => s.print);
  useEffect(() => {
    if (model.status !== 'ready' || !print) {
      useStudio.getState().setPrintCheck(null);
      return;
    }
    const timer = setTimeout(() => {
      // Standard parts (B7) are counterparts and are not printed.
      const standard = new Set(model.structure.standardParts ?? []);
      const printed = model.bodies.filter((body) => !standard.has(body.name));
      const result = checkPrint(printed, { bed: print.printer.bed, nozzle: print.printer.nozzle, overhang: print.material.overhang }, model.structure.features);
      const joints = model.structure.joints ?? [];
      // A joint left away from "as designed" needs no measuring, so it shows at once: with a lid closed onto its
      // box SolidCraft's measures took longer than a look at the list (practice run 2026-11-10).
      useStudio.getState().setPrintCheck({ revision: model.revision, result: joints.length > 0 ? withMotion(result, { joints, stops: [] }) : result });
      const report = (final: typeof result) => {
        void platform()
          .print.reportCheck(reportOf(final, print.printer.nozzle, model.revision))
          .catch(() => undefined);
      };
      // A logo's colour pieces sit in the part on purpose; measuring them, SolidCraft took minutes
      // for a logo of many pieces and held up every trial after it.
      const parts = printed.filter((body) => !isLogoColourBody(body.name));
      if (parts.length < 2 && joints.length === 0) {
        report(result);
        return;
      }
      // What SolidCraft measures exactly. The mesh check shows at once; the light takes the measures
      // when they come, if nothing changed. A measure that fails leaves its findings out.
      const measure = async (): Promise<PrintCheck> => {
        let final = result;
        // Several parts (F2): overlaps and gaps under the push fit.
        const pushFit = print.material.clearance.push;
        if (parts.length >= 2) {
          const measured = await platform()
            .design.clearance(
              parts.map((body) => body.name),
              Math.max(pushFit, 0),
            )
            .catch(() => null);
          if (measured) final = withClearance(final, measured, pushFit);
        }
        // Parts that move (ADR 0027): every joint value runs from where it stands to its limits.
        if (joints.length > 0) {
          const sweeps = joints.flatMap((joint) =>
            joint.values.flatMap((value, index) =>
              (value.limits ?? []).flatMap((limit) => (limit !== null && Math.abs(limit - value.value) > 1e-6 ? [{ joint: joint.id, name: joint.name, unit: value.unit, index, from: value.value, to: limit }] : [])),
            ),
          ).slice(0, 40);
          const stopped = await platform()
            .design.sweepJoints(sweeps.map(({ joint, index, from, to }) => ({ joint, index, from, to })))
            .catch(() => []);
          const stops = sweeps.flatMap((sweep, i) => {
            const stop = stopped[i];
            return stop ? [{ joint: sweep.name, unit: sweep.unit, to: sweep.to, ...stop }] : [];
          });
          final = withMotion(final, { joints, stops });
        }
        return final;
      };
      void measure().then((final) => {
        if (stale) return;
        if (final !== result) useStudio.getState().setPrintCheck({ revision: model.revision, result: final });
        report(final);
      });
    }, CHECK_DELAY_MS);
    let stale = false;
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [model, print]);
}
