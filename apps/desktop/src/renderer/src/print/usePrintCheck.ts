import { isLogoColourBody } from '../../../shared/drawingPlacement';
import { checkPrint, withClearance, withMotion, type PrintCheck } from '@partbuddy/geometry';
import { useEffect } from 'react';

import { platform } from '../platform';
import { useStudio } from '../state/store';
import { measuresOf } from './bodyMeasures';
import { fitsOf, jointRuns, reachOf, reportOf, sweepInBlocks } from './report';

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
    // Until the check of this revision and printer is there, the one shown is of something else (audit X-1).
    useStudio.getState().checkPending();
    const run = () => {
      // Standard parts (B7) are counterparts and are not printed.
      // A body whose part SolidCraft is still building is neither yet; the mirror that follows says which, and the check runs again.
      const standard = new Set([...(model.structure.standardParts ?? []), ...(model.structure.pendingParts ?? [])]);
      // Bodies printed as one piece (a print-in-place hinge) stand on one bed: the first body's name names the group.
      const groupOf = (name: string) => model.structure.printGroups?.find((group) => group.includes(name))?.[0];
      const printed = model.bodies.filter((body) => !standard.has(body.name)).map((body) => ({ ...body, printFace: printFaces[body.name], group: groupOf(body.name) }));
      const result = checkPrint(printed, { bed: print.printer.bed, nozzle: print.printer.nozzle, layer: print.printer.layer, overhang: print.material.overhang }, model.structure.features);
      // A value that follows another through a motion link (a gear) is neither swept nor posed on its own: its driver is.
      const joints = (model.structure.joints ?? []).map((joint) => ({ ...joint, values: joint.values.map((value, index) => ({ ...value, index })).filter((value) => !value.follows) })).filter((joint) => joint.values.length > 0);
      // A joint left away from "as designed" needs no measuring, so it shows at once: with a lid closed onto its
      // box SolidCraft's measures took longer than a look at the list (practice run 2026-11-10).
      // A logo's colour pieces sit in the part on purpose; measuring them, SolidCraft took minutes
      // for a logo of many pieces and held up every trial after it.
      const parts = printed.filter((body) => !isLogoColourBody(body.name));
      const measuring = parts.length >= 2 || joints.length > 0;
      const preliminary = joints.length > 0 ? withMotion(result, { joints, stops: [] }) : result;
      useStudio.getState().setPrintCheck({ documentId: model.documentId, revision: model.revision, result: preliminary, ...(measuring ? { measuring } : {}) });
      // What each closed body costs to print, for the assistant to see what a change saved.
      const measures = measuresOf(printed, { nozzle: print.printer.nozzle, layer: print.printer.layer, overhang: print.material.overhang });
      const report = (final: typeof result, pending = false, unmeasured: ('clearance' | 'joints')[] = [], unchecked: string[] = []) => {
        const more = { ...(pending ? { measuring: true } : {}), ...(unmeasured.length > 0 ? { unmeasured } : {}), ...(unchecked.length > 0 ? { unchecked } : {}), ...(measures.problem ? { problem: measures.problem } : {}) };
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
      // Mesh bodies SolidCraft leaves out of the clearance: named, as nothing is known of them.
      let unchecked: string[] = [];
      const measure = async (): Promise<PrintCheck> => {
        let final = result;
        // Several parts (F2): overlaps, gaps under the push fit for this nozzle, and under the print-in-place gap
        // between parts printed as one piece that move.
        const fits = fitsOf(print, model.structure);
        // shortcut: with a print group every pair is measured up to the print-in-place gap, and SolidCraft's answer is cut to 100 near pairs (contract); measure the group's bodies apart when designs with many close parts and a hinge come up.
        if (parts.length >= 2) {
          const measured = await platform()
            .design.clearance(
              parts.map((body) => body.name),
              Math.max(fits.push, fits.inPlace?.gap ?? 0, 0),
            )
            .catch((error: unknown) => {
              console.warn('PartBuddy: measuring the clearance between the parts failed', error);
              return null;
            });
          if (measured) final = withClearance(final, measured, fits.push, fits.inPlace);
          if (!measured || measured.incomplete) failed.push('clearance');
          unchecked = measured?.unchecked ?? [];
        }
        // Parts that move (ADR 0027): every joint value runs from where it stands to its limits, and as far as it can go where it has none.
        if (joints.length > 0) {
          // The box round all bodies only for a distance without a limit: 20 ms for 250 000 triangles.
          const reach = joints.some((joint) => joint.values.some((value) => value.unit === 'mm' && (value.limits ?? [null]).includes(null))) ? reachOf(model.bodies) : 0;
          const { sweeps, more } = jointRuns(joints, reach);
          if (more) failed.push('joints');
          // SolidCraft takes a limited number of runs per call: block after block.
          const stopped = await sweepInBlocks(
            sweeps,
            (block) => platform().design.sweepJoints(block.map(({ joint, index, from, to }) => ({ joint, index, from, to }))),
            () => {
              if (!failed.includes('joints')) failed.push('joints');
            },
          );
          const stops = sweeps.flatMap((sweep, i) => {
            const stop = stopped[i];
            return stop ? [{ joint: sweep.name, unit: sweep.unit, to: sweep.to, ...(sweep.free ? { free: true } : {}), ...stop }] : [];
          });
          final = withMotion(final, { joints, stops });
        }
        return final;
      };
      // shortcut: a measure overtaken by a newer revision runs on in SolidCraft and is only thrown away here; cancel it there if that ever holds up the next one.
      void measure()
        .catch((error: unknown) => {
          // Whatever went wrong, the light must not stay on "still measuring": nothing measured is said as such.
          console.warn('PartBuddy: measuring clearance and joints failed', error);
          failed.splice(0, failed.length, ...(parts.length >= 2 ? (['clearance'] as const) : []), ...(joints.length > 0 ? (['joints'] as const) : []));
          return preliminary;
        })
        .then((final) => {
          if (stale) return;
          // The light says it too: a measure that failed is no green (audit X-1).
          useStudio.getState().setPrintCheck({ documentId: model.documentId, revision: model.revision, result: final, ...(failed.length > 0 ? { unmeasured: failed } : {}), ...(unchecked.length > 0 ? { unchecked } : {}) });
          report(final, false, failed, unchecked);
        });
    };
    const timer = setTimeout(() => {
      try {
        run();
      } catch (error) {
        // A check that throws must not leave the light on "checking" until the next change: not checked, and said so.
        console.warn('PartBuddy: the ready-to-print check failed', error);
        useStudio.getState().setPrintCheck({ documentId: model.documentId, revision: model.revision, result: { status: 'ready', findings: [] }, unmeasured: ['check'] });
      }
    }, CHECK_DELAY_MS);
    let stale = false;
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [model, print, printFaces]);
}
