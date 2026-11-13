import type { PrintCheck } from '@partbuddy/geometry';

import type { Joint, PrintCheckReport } from '../../../shared/contract';
import type { StudioPrintCheck } from '../state/store';

/** How many joint runs SolidCraft is asked for at most (the contract's limit of `joint.sweep`). */
const MOST_RUNS = 40;

/**
 * The joint runs to measure: every value from where it stands to each of its limits, `index` its place in the joint.
 * At most {@link MOST_RUNS}; `more` when there were more, which the check then says it did not measure.
 */
export function jointRuns(joints: readonly (Pick<Joint, 'id' | 'name'> & { values: (Joint['values'][number] & { index: number })[] })[]) {
  const runs = joints.flatMap((joint) =>
    joint.values.flatMap((value) =>
      (value.limits ?? []).flatMap((limit) => (limit !== null && Math.abs(limit - value.value) > 1e-6 ? [{ joint: joint.id, name: joint.name, unit: value.unit, index: value.index, from: value.value, to: limit }] : [])),
    ),
  );
  return { sweeps: runs.slice(0, MOST_RUNS), more: runs.length > MOST_RUNS };
}

/**
 * Whether an export asks first (M7, audit X-1): the light is red, or what SolidCraft measures is still out or did not
 * all run, so an overlap or a blocked joint may be missing. It only asks; the user may know better (decided 2026-11-05).
 */
export function asksBeforeExport(check: Pick<StudioPrintCheck, 'result' | 'measuring' | 'unmeasured'> | null): boolean {
  return check !== null && (check.result.status === 'block' || check.measuring === true || (check.unmeasured?.length ?? 0) > 0);
}

/** The check without the camera boxes, as the main process words it for the assistant; `bodies`: what each body costs to print. */
export function reportOf(result: PrintCheck, nozzle: number, revision: number, bodies: NonNullable<PrintCheckReport['bodies']> = [], more: Pick<PrintCheckReport, 'measuring' | 'problem' | 'unmeasured' | 'unchecked'> = {}): PrintCheckReport {
  return {
    status: result.status,
    nozzle,
    revision,
    ...(more.measuring ? { measuring: true } : {}),
    ...(more.unmeasured && more.unmeasured.length > 0 ? { unmeasured: more.unmeasured } : {}),
    ...(more.unchecked && more.unchecked.length > 0 ? { unchecked: more.unchecked.slice(0, 40) } : {}),
    ...(more.problem ? { problem: more.problem.slice(0, 300) } : {}),
    ...(bodies.length > 0 ? { bodies: bodies.slice(0, 40) } : {}),
    ...(bodies.length > 40 ? { bodiesOmitted: bodies.length - 40 } : {}),
    ...(result.findings.length > 40 ? { omitted: result.findings.length - 40 } : {}),
    findings: result.findings.slice(0, 40).map((finding) => {
      if (finding.kind === 'size' || finding.kind === 'feature' || finding.kind === 'posed') return finding;
      if (finding.kind === 'blocked') return { kind: finding.kind, severity: finding.severity, joint: finding.joint, bodies: finding.bodies, at: finding.at, limit: finding.limit, unit: finding.unit, places: [] };
      // SolidCraft measures pairs of bodies, not faces: the pair is where it is.
      if (finding.kind === 'overlap') return { kind: finding.kind, severity: finding.severity, bodies: finding.bodies, volume: finding.volume, places: [] };
      if (finding.kind === 'tight') return { kind: finding.kind, severity: finding.severity, bodies: finding.bodies, gap: finding.gap, minimum: finding.minimum, places: [] };
      if (finding.kind === 'separate' || finding.kind === 'fused' || finding.kind === 'open') return { ...finding, bodies: finding.bodies.slice(0, 20) };
      const places = finding.places.slice(0, 20).map((place) => ({ body: place.body, faces: place.faces.slice(0, 40) }));
      switch (finding.kind) {
        case 'thinWall':
          return { kind: finding.kind, severity: finding.severity, floor: finding.floor, ...(finding.layers === undefined ? {} : { layers: finding.layers }), thickness: finding.thickness, minimum: finding.minimum, area: finding.area, places };
        case 'overhang':
          return { kind: finding.kind, severity: finding.severity, area: finding.area, limit: finding.limit, places };
        case 'contact':
          return { kind: finding.kind, severity: finding.severity, area: finding.area, bodies: finding.bodies, places };
      }
    }),
  };
}
