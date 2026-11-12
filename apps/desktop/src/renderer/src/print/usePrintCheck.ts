import { isLogoColourBody } from '../../../shared/drawingPlacement';
import { checkPrint, withClearance, withMotion, type PrintCheck } from '@partbuddy/geometry';
import { useEffect } from 'react';

import { platform } from '../platform';
import { useStudio } from '../state/store';
import { measuresOf } from './bodyMeasures';
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
  const printFaces = useStudio((s) => s.printFaces);
  useEffect(() => {
    if (model.status !== 'ready' || !print) {
      useStudio.getState().setPrintCheck(null);
      return;
    }
    const timer = setTimeout(() => {
      // Standard parts (B7) are counterparts and are not printed.
      const standard = new Set(model.structure.standardParts ?? []);
      const printed = model.bodies.filter((body) => !standard.has(body.name)).map((body) => ({ ...body, printFace: printFaces[body.name] }));
      const result = checkPrint(printed, { bed: print.printer.bed, nozzle: print.printer.nozzle, layer: print.printer.layer, overhang: print.material.overhang }, model.structure.features);
      // A value that follows another through a motion link (a gear) is neither swept nor posed on its own: its driver is.
      const joints = (model.structure.joints ?? []).map((joint) => ({ ...joint, values: joint.values.map((value, index) => ({ ...value, index })).filter((value) => !value.follows) })).filter((joint) => joint.values.length > 0);
      // A joint left away from "as designed" needs no measuring, so it shows at once: with a lid closed onto its
      // box SolidCraft's measures took longer than a look at the list (practice run 2026-11-10).
      // A logo's colour pieces sit in the part on purpose; measuring them, SolidCraft took minutes
      // for a logo of many pieces and held up every trial after it.
      const parts = printed.filter((body) => !isLogoColourBody(body.name));
      const measuring = parts.length >= 2 || joints.length > 0;
      useStudio.getState().setPrintCheck({ revision: model.revision, result: joints.length > 0 ? withMotion(result, { joints, stops: [] }) : result, ...(measuring ? { measuring } : {}) });
      // What each closed body costs to print, for the assistant to see what a change saved.
      const measures = measuresOf(printed, { nozzle: print.printer.nozzle, layer: print.printer.layer, overhang: print.material.overhang });
      const report = (final: typeof result, pending = false, unmeasured: ('clearance' | 'joints')[] = []) => {
        const more = { ...(pending ? { measuring: true } : {}), ...(unmeasured.length > 0 ? { unmeasured } : {}), ...(measures.problem ? { problem: measures.problem } : {}) };
        void platform()
          .print.reportCheck(reportOf(final, print.printer.nozzle, model.revision, measures.bodies, more))
          // A report the main process does not take would leave the assistant waiting for a check that never comes:
          // the check goes again without the measures, and says why.
          .catch((error: unknown) => platform().print.reportCheck(reportOf(final, print.printer.nozzle, model.revision, [], { ...more, problem: `report refused, sent again without measures: ${String(error)}` })))
          .catch(() => undefined);
      };
      if (!measuring) {
        report(result);
        return;
      }
      // The mesh check goes ahead at once: the assistant reads it with its tool's answer, marked as preliminary.
      report(result, true);
      // What SolidCraft measures exactly. The mesh check shows at once; the light takes the measures
      // when they come, if nothing changed. A measure that fails leaves its findings out.
      // A measure that fails leaves its findings out, and the check says that it does.
      const failed: ('clearance' | 'joints')[] = [];
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
          else failed.push('clearance');
        }
        // Parts that move (ADR 0027): every joint value runs from where it stands to its limits.
        if (joints.length > 0) {
          const sweeps = joints.flatMap((joint) =>
            joint.values.flatMap((value) =>
              (value.limits ?? []).flatMap((limit) => (limit !== null && Math.abs(limit - value.value) > 1e-6 ? [{ joint: joint.id, name: joint.name, unit: value.unit, index: value.index, from: value.value, to: limit }] : [])),
            ),
          ).slice(0, 40);
          const stopped = await platform()
            .design.sweepJoints(sweeps.map(({ joint, index, from, to }) => ({ joint, index, from, to })))
            .catch(() => {
              failed.push('joints');
              return [];
            });
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
        useStudio.getState().setPrintCheck({ revision: model.revision, result: final });
        report(final, false, failed);
      });
    }, CHECK_DELAY_MS);
    let stale = false;
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [model, print, printFaces]);
}
