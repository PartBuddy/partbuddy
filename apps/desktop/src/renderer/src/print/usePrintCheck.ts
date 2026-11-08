import { isLogoColourBody } from '../../../shared/drawingPlacement';
import { checkPrint, withClearance } from '@partbuddy/geometry';
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
      useStudio.getState().setPrintCheck({ revision: model.revision, result });
      const report = (final: typeof result) => {
        void platform()
          .print.reportCheck(reportOf(final, print.printer.nozzle, model.revision))
          .catch(() => undefined);
      };
      // A logo's colour pieces sit in the part on purpose; measuring them, SolidCraft took minutes
      // for a logo of many pieces and held up every trial after it.
      const parts = printed.filter((body) => !isLogoColourBody(body.name));
      if (parts.length < 2) {
        report(result);
        return;
      }
      // Several parts (F2): SolidCraft measures overlaps and gaps under the push fit exactly. The
      // mesh check shows at once; the light takes the measure when it comes, if nothing changed.
      const pushFit = print.material.clearance.push;
      void platform()
        .design.clearance(
          parts.map((body) => body.name),
          Math.max(pushFit, 0),
        )
        .then(
          (measured) => {
            if (stale) return;
            const merged = withClearance(result, measured, pushFit);
            useStudio.getState().setPrintCheck({ revision: model.revision, result: merged });
            report(merged);
          },
          () => {
            if (!stale) report(result);
          },
        );
    }, CHECK_DELAY_MS);
    let stale = false;
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [model, print]);
}
