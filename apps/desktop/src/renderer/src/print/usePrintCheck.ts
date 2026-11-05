import { checkPrint, type PrintCheck } from '@partbuddy/geometry';
import { useEffect } from 'react';

import type { PrintCheckReport } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';

/** Quiet time after a revision before the check runs, so a burst of steps is checked once. */
const CHECK_DELAY_MS = 250;

/** The check without the camera boxes, as the main process words it for the assistant. */
export function reportOf(result: PrintCheck, nozzle: number): PrintCheckReport {
  return {
    status: result.status,
    nozzle,
    findings: result.findings.slice(0, 40).map((finding) => {
      if (finding.kind === 'size' || finding.kind === 'feature') return finding;
      const places = finding.places.slice(0, 20).map((place) => ({ body: place.body, faces: place.faces.slice(0, 40) }));
      switch (finding.kind) {
        case 'thinWall':
          return { kind: finding.kind, severity: finding.severity, thickness: finding.thickness, minimum: finding.minimum, area: finding.area, places };
        case 'support':
          return { kind: finding.kind, severity: finding.severity, area: finding.area, limit: finding.limit, places };
        case 'contact':
          return { kind: finding.kind, severity: finding.severity, area: finding.area, places };
      }
    }),
  };
}

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
      const result = checkPrint(
        model.bodies,
        { bed: print.printer.bed, nozzle: print.printer.nozzle, overhang: print.material.overhang },
        model.structure.features,
      );
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
