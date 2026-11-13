import type { InPlaceFit, PrintCheck } from '@partbuddy/geometry';
import { Box3, Vector3, type BufferAttribute, type BufferGeometry } from 'three';

import type { ConnectionStatus, Joint, PartPrint, PrintCheckReport } from '../../../shared/contract';
import { printInPlaceGap, scaleClearance } from '../../../shared/designFit';
import type { ModelState, StudioPrintCheck } from '../state/store';

/** How many joint runs one call asks SolidCraft for (the contract's limit of `joint.sweep`). */
export const SWEEP_BATCH = 40;
/** How many joint runs the check measures at most, in calls of {@link SWEEP_BATCH}: beyond, it says it did not measure them all. */
const MOST_RUNS = 200;

/**
 * How far an angle without a limit on either side turns each way (audit H-04): the two runs of half a turn overlap by
 * more than twice the span in which the main process takes a stop for a snap fit (`SNAP_SPAN`, 6°, solidcraft/actions.ts),
 * so a stop one run lets pass near its end, the other meets well before its own.
 */
const HALF_TURN = 190;
/** How far an angle with a limit on one side only turns the other way: a whole turn, past the same span. */
const WHOLE_TURN = 370;

/**
 * The joint runs to measure: every value from where it stands to each of its limits, `index` its place in the joint.
 * A side without a limit is run too (audit H-04, `free`): an angle as far as a turn, a distance as far as `reach`, past
 * which the moving parts lie clear of every other (no distance is run without one). At most {@link MOST_RUNS}; `more`
 * when there were more, which the check then says it did not measure.
 */
export function jointRuns(joints: readonly (Pick<Joint, 'id' | 'name'> & { values: (Joint['values'][number] & { index: number })[] })[], reach = 0) {
  const runs = joints.flatMap((joint) =>
    joint.values.flatMap((value) => {
      const [low, high] = value.limits ?? [null, null];
      const free = value.unit === 'deg' ? (low === null && high === null ? HALF_TURN : WHOLE_TURN) : reach;
      const ends = [low === null ? (free > 0 ? { to: value.value - free, free: true } : null) : { to: low }, high === null ? (free > 0 ? { to: value.value + free, free: true } : null) : { to: high }];
      return ends.flatMap((end) => (end && Math.abs(end.to - value.value) > 1e-6 ? [{ joint: joint.id, name: joint.name, unit: value.unit, index: value.index, from: value.value, ...end }] : []));
    }),
  );
  return { sweeps: runs.slice(0, MOST_RUNS), more: runs.length > MOST_RUNS };
}

/**
 * How far a joint without limits slides (audit H-04): the diagonal of the box round all bodies and 5 mm more. A part
 * moved further than the diagonal lies outside the box, clear of every other, so nothing can stop it beyond; the 5 mm
 * keep a real stop out of the last 4 mm of the run, where the main process takes it for a snap fit (`SNAP_SPAN`).
 */
export function reachOf(bodies: readonly { model: { geometry: BufferGeometry } }[]): number {
  const box = new Box3();
  for (const body of bodies) {
    const position = body.model.geometry.getAttribute('position') as BufferAttribute | undefined;
    if (position) box.union(new Box3().setFromBufferAttribute(position));
  }
  return box.isEmpty() ? 0 : Math.ceil(box.getSize(new Vector3()).length()) + 5;
}

/**
 * The gaps the check holds bodies to (audit D9, D10): the push fit scaled to the nozzle exactly as the print profile
 * tells the assistant (`printNote`), and between bodies printed as one piece that move against each other the
 * print-in-place gap the rules give such parts. Two bodies of a group move against each other when a joint moves one
 * and not the other; when no joint says which bodies it moves, any two of a group are taken to.
 */
export function fitsOf(print: Pick<PartPrint, 'printer' | 'material'>, structure: { joints?: readonly Pick<Joint, 'bodies'>[] | undefined; printGroups?: readonly (readonly string[])[] | undefined }): { push: number; inPlace?: InPlaceFit } {
  const push = scaleClearance(print.material.clearance.push, print.printer, print.material.measuredNozzle);
  const groups = structure.printGroups ?? [];
  if (groups.length === 0) return { push };
  const moving = (structure.joints ?? []).flatMap((joint) => (joint.bodies ? [joint.bodies] : []));
  const pair = (a: string, b: string) => groups.some((group) => group.includes(a) && group.includes(b)) && (moving.length === 0 || moving.some((bodies) => bodies.includes(a) !== bodies.includes(b)));
  return { push, inPlace: { gap: printInPlaceGap(print.printer), pair } };
}

/** How long the light waits before it shows that it is still checking: a step that checks at once does not blink. */
export const PENDING_SHOWN_MS = 500;

/**
 * Follows a state that passes (review of #367): `show(true)` only once it held for `ms`, `show(false)` at once when it
 * ends. "Checking" after every step of a build would blink, and a screen reader would read it out each time.
 */
export function lateOn(ms: number, show: (on: boolean) => void): (on: boolean) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (on) => {
    clearTimeout(timer);
    if (on)
      timer = setTimeout(() => {
        show(true);
      }, ms);
    else show(false);
  };
}

/**
 * Runs the sweeps in calls of {@link SWEEP_BATCH}, one after the other; a call that fails counts its runs as run through
 * and is told to `failed`, so the check says it did not measure them.
 */
export async function sweepInBlocks<S, R>(sweeps: readonly S[], sweep: (block: S[]) => Promise<R[]>, failed: () => void): Promise<(R | null)[]> {
  const stops: (R | null)[] = [];
  for (let start = 0; start < sweeps.length; start += SWEEP_BATCH) {
    const block = sweeps.slice(start, start + SWEEP_BATCH);
    stops.push(
      ...(await sweep(block).catch((error: unknown) => {
        console.warn(`PartBuddy: joint runs ${String(start + 1)} to ${String(start + block.length)} failed`, error);
        failed();
        return block.map(() => null);
      })),
    );
  }
  return stops;
}

/**
 * The check as far as it holds for the design on screen (audit X-1): one of another revision or another project is as
 * good as still measuring, since the revision numbers of two projects can be the same. So is any while the main process
 * mirrors a newer revision (`rebuilding`): that ends in a new model, or in `failed` or `idle`, which lets the light go.
 * After a mirror that failed SolidCraft is further on than the check: not measured, until a mirror comes through.
 */
export function checkNow(check: StudioPrintCheck | null, model: ModelState, connection: Pick<ConnectionStatus, 'state' | 'mirror' | 'documentId' | 'revision'>): StudioPrintCheck | null {
  if (!check || check.measuring) return check;
  const mirroring = connection.state === 'connected' && connection.mirror === 'rebuilding';
  const current = !mirroring && model.status === 'ready' && model.documentId === check.documentId && model.revision === check.revision;
  if (!current) return { ...check, measuring: true };
  // A mirror of the same revision once more (a standard part's reference was built) may fail too: SolidCraft is not further on then.
  const behind = connection.state === 'connected' && connection.mirror === 'failed' && !(connection.documentId === check.documentId && connection.revision === check.revision);
  return behind ? { ...check, unmeasured: [...(check.unmeasured ?? []), 'mirror'] } : check;
}

/**
 * Whether an export asks first (M7, audit X-1): the light is red, or what SolidCraft measures is still out or did not
 * all run, so an overlap or a blocked joint may be missing. It only asks; the user may know better (decided 2026-11-05).
 */
export function asksBeforeExport(check: StudioPrintCheck | null, model: ModelState, connection: Pick<ConnectionStatus, 'state' | 'mirror' | 'documentId' | 'revision'>): boolean {
  const now = checkNow(check, model, connection);
  return now !== null && (now.result.status === 'block' || now.measuring === true || (now.unmeasured?.length ?? 0) > 0);
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
      if (finding.kind === 'blocked') return { kind: finding.kind, severity: finding.severity, joint: finding.joint, bodies: finding.bodies, at: finding.at, limit: finding.limit, unit: finding.unit, ...(finding.free ? { free: true } : {}), places: [] };
      // SolidCraft measures pairs of bodies, not faces: the pair is where it is.
      if (finding.kind === 'overlap') return { kind: finding.kind, severity: finding.severity, bodies: finding.bodies, volume: finding.volume, places: [] };
      if (finding.kind === 'tight') return { kind: finding.kind, severity: finding.severity, bodies: finding.bodies, gap: finding.gap, minimum: finding.minimum, ...(finding.inPlace ? { inPlace: true } : {}), places: [] };
      if (finding.kind === 'separate' || finding.kind === 'fused' || finding.kind === 'open' || finding.kind === 'faceLost') return { ...finding, bodies: finding.bodies.slice(0, 20) };
      if (finding.kind === 'leftOut') return { ...finding, features: finding.features.slice(0, 40) };
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
