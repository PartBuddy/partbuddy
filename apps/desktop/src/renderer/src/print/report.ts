import type { PrintCheck } from '@partbuddy/geometry';

import type { PrintCheckReport } from '../../../shared/contract';

/** The check without the camera boxes, as the main process words it for the assistant. */
export function reportOf(result: PrintCheck, nozzle: number, revision: number): PrintCheckReport {
  return {
    status: result.status,
    nozzle,
    revision,
    findings: result.findings.slice(0, 40).map((finding) => {
      if (finding.kind === 'size' || finding.kind === 'feature' || finding.kind === 'posed') return finding;
      if (finding.kind === 'blocked') return { kind: finding.kind, severity: finding.severity, joint: finding.joint, bodies: finding.bodies, at: finding.at, limit: finding.limit, unit: finding.unit, places: [] };
      // SolidCraft measures pairs of bodies, not faces: the pair is where it is.
      if (finding.kind === 'overlap') return { kind: finding.kind, severity: finding.severity, bodies: finding.bodies, volume: finding.volume, places: [] };
      if (finding.kind === 'tight') return { kind: finding.kind, severity: finding.severity, bodies: finding.bodies, gap: finding.gap, minimum: finding.minimum, places: [] };
      if (finding.kind === 'separate' || finding.kind === 'open') return { ...finding, bodies: finding.bodies.slice(0, 20) };
      const places = finding.places.slice(0, 20).map((place) => ({ body: place.body, faces: place.faces.slice(0, 40) }));
      switch (finding.kind) {
        case 'thinWall':
          return { kind: finding.kind, severity: finding.severity, floor: finding.floor, thickness: finding.thickness, minimum: finding.minimum, area: finding.area, places };
        case 'overhang':
          return { kind: finding.kind, severity: finding.severity, area: finding.area, limit: finding.limit, places };
        case 'contact':
          return { kind: finding.kind, severity: finding.severity, area: finding.area, places };
      }
    }),
  };
}
