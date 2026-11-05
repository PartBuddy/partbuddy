import { checkPrint } from '@partbuddy/geometry';
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
      const result = checkPrint(model.bodies.filter((body) => !standard.has(body.name)), { bed: print.printer.bed, nozzle: print.printer.nozzle, overhang: print.material.overhang }, model.structure.features);
      useStudio.getState().setPrintCheck({ revision: model.revision, result });
      void platform()
        .print.reportCheck(reportOf(result, print.printer.nozzle))
        .catch(() => undefined);
    }, CHECK_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [model, print]);
}
