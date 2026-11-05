import type { PrintCheck } from '@partbuddy/geometry';

import type { PrintCheckReport } from '../../../shared/contract';

/** The check without the camera boxes, as the main process words it for the assistant. */
export function reportOf(result: PrintCheck, nozzle: number): PrintCheckReport {
  return {
    status: result.status,
    nozzle,
    findings: result.findings.slice(0, 40).map((finding) => {
      if (finding.kind === 'size' || finding.kind === 'feature') return finding;
      if (finding.kind === 'separate') return { ...finding, bodies: finding.bodies.slice(0, 20) };
      const places = finding.places.slice(0, 20).map((place) => ({ body: place.body, faces: place.faces.slice(0, 40) }));
      switch (finding.kind) {
        case 'thinWall':
          return { kind: finding.kind, severity: finding.severity, thickness: finding.thickness, minimum: finding.minimum, area: finding.area, places };
        case 'support':
          return { kind: finding.kind, severity: finding.severity, area: finding.area, limit: finding.limit, cause: finding.cause, places };
        case 'contact':
          return { kind: finding.kind, severity: finding.severity, area: finding.area, places };
      }
    }),
  };
}
