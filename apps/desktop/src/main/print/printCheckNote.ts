import type { PrintCheckReport } from '../../shared/contract';
import type { ToolResult } from '../agents/gateProxy';

type Finding = PrintCheckReport['findings'][number];
type Places = Extract<Finding, { places: unknown }>['places'];

const mm = (value: number) => `${String(Math.round(value * 100) / 100)} mm`;

/**
 * Where, in the face names the model also gets from SolidCraft; long lists are cut short, and say
 * by how much. `bodies` is how many bodies the finding is about when the places do not name all.
 */
function where(places: Places, bodies = places.length): string {
  if (places.length === 0) return '';
  const shown = places.slice(0, 4);
  const rest = bodies - shown.length;
  const more = rest > 0 ? `; and ${String(rest)} more ${rest === 1 ? 'body' : 'bodies'}` : '';
  // A body that rests on a point or an edge has no face to name.
  if (shown.every(({ faces }) => faces.length === 0)) return ` (body ${shown.map(({ body }) => JSON.stringify(body)).join(', ')}${more})`;
  const parts = shown.map(({ body, faces }) => {
    if (faces.length === 0) return `body ${JSON.stringify(body)}`;
    const named = faces.slice(0, 6).map((face) => JSON.stringify(face)).join(', ');
    const further = faces.length > 6 ? ` and ${String(faces.length - 6)} more` : '';
    return `${named}${further} of body ${JSON.stringify(body)}`;
  });
  return ` (faces ${parts.join('; ')}${more})`;
}

function line(finding: Finding, nozzle: number): string {
  const tag = finding.severity === 'block' ? 'blocks printing' : 'warning';
  switch (finding.kind) {
    case 'size':
      return `- ${tag}: body ${JSON.stringify(finding.body)} is ${finding.size.map(String).join(' × ')} mm, the printer takes ${finding.bed.map(String).join(' × ')} mm${finding.lying ? '; it would fit lying on another side' : ''}.`;
    case 'thinWall':
      // What lies flat is built of layers: it prints from one layer on, and closes from four.
      if (finding.floor)
        return finding.severity === 'block'
          ? `- ${tag}: floors or lids down to ${mm(finding.thickness)}, thinner than one layer, so they do not print${where(finding.places)}.`
          : `- ${tag}: floors or lids down to ${mm(finding.thickness)}, under the ${mm(finding.minimum)} a floor needs to print closed${finding.layers === undefined ? '' : ` (${String(finding.layers)} layers)`}${where(finding.places)}.`;
      return finding.severity === 'block'
        ? `- ${tag}: walls down to ${mm(finding.thickness)}, thinner than the ${mm(nozzle)} nozzle, so they do not print${where(finding.places)}.`
        : `- ${tag}: walls down to ${mm(finding.thickness)}, under the ${mm(finding.minimum)} of two lines${where(finding.places)}.`;
    case 'overhang':
      return `- ${tag}: ${String(finding.area)} mm² lean more than ${String(finding.limit)}° from the vertical${where(finding.places)}; the slicer decides whether they need support.`;
    case 'contact':
      return finding.bodies > 1
        ? `- ${tag}: ${String(finding.bodies)} bodies have little on the bed, the least ${String(finding.area)} mm²; they may come loose or tip over${where(finding.places, finding.bodies)}.`
        : `- ${tag}: only ${String(finding.area)} mm² lie on the bed, the part may come loose or tip over${where(finding.places)}.`;
    case 'separate':
      return `- ${tag}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(', ')} touch but are separate; the slicer lays each on the bed by itself. Combine them if they are one part.`;
    case 'open':
      return `- ${tag}: ${finding.bodies.map((body) => `body ${JSON.stringify(body)}`).join(', ')} is an open surface, not a closed solid: it has no volume, so nothing of it prints. Close it into a solid, or remove it if it only helped to build.`;
    case 'feature':
      return (
        `- ${tag}: feature ${JSON.stringify(finding.feature)} reports ${JSON.stringify(finding.message.slice(0, 200))}.` +
        // Practice run 2026-11-10: the model took this for a false alarm; the lips it had added to a hinged lid did stay behind.
        (finding.message.includes('separate pieces')
          ? ' This is real: if the body moves with a joint, the piece was built from the design level and stays behind when the joint moves. Undo it and build it again with the body\'s component active (component.activate), the joints at 0.'
          : '')
      );
    case 'overlap':
      return `- ${tag}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(' and ')} overlap by ${String(finding.volume)} mm³; as separate parts they do not go together. Combine them if they are one part, otherwise make room.`;
    case 'tight':
      return `- ${tag}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(' and ')} come within ${mm(finding.gap)} of each other without touching, under the material's push fit of ${mm(finding.minimum)} per side; they only go together with force. Widen the gap unless that is meant.`;
    case 'blocked':
      return `- ${tag}: joint ${JSON.stringify(finding.joint)} stops at ${String(finding.at)} ${finding.unit}, before its limit of ${String(finding.limit)} ${finding.unit}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(' and ')} touch there. Make room where they touch, or narrow the limit with joint.limits if that is the stop you mean.`;
    case 'posed':
      return `- ${tag}: joint ${JSON.stringify(finding.joint)} stands at ${String(finding.value)} ${finding.unit}, not at 0 as designed; the design is exported and checked as it stands. Drive it back with joint.drive unless that is meant.`;
  }
}

/** What the mesh check looks at at once (the finding kinds of printCheck.ts), so "nothing found" claims no more. */
const CHECKED_MESH = 'build volume, wall and floor thickness, overhang angle, area on the bed, open bodies, failed features, bodies that touch';
/** What SolidCraft measures after it (withClearance, withMotion): it takes longer and comes with the full check. */
const MEASURED = { clearance: 'bodies that overlap or come closer than a push fit', joints: 'joints that stop before a limit' };
const CHECKED_MEASURED = `${MEASURED.clearance}, ${MEASURED.joints}`;
/** What the model is to do while the measures are out; partbuddy_view itself says only that they are coming, or a small model calls it in circles. */
const FETCH_FULL = 'call partbuddy_view for the full check before you call the part done';
const preliminaryLine = (view: boolean) => `Preliminary: clearance and joints still being measured (${CHECKED_MEASURED}); ${view ? 'the full check will be here in a moment' : FETCH_FULL}.`;
/** A measure that failed is said, never read as "nothing found" (audit H-05). */
const unmeasuredLine = (failed: readonly ('clearance' | 'joints')[]) =>
  `NOT measured, or not all of it (SolidCraft's measure failed or did not finish every pair in its time, or there were more than 40 joint runs): ${failed.map((what) => MEASURED[what]).join(', ')}. Measure it yourself (${failed.map((what) => (what === 'clearance' ? 'inspect.clearance' : 'joint.sweep')).join(', ')}) before you call the part done.`;
/** Mesh bodies have no faces to measure: `inspect.clearance` leaves them out however it is called, so the way is to convert them. */
const uncheckedLine = (bodies: readonly string[]) =>
  `NOT measured for overlaps and gaps: ${bodies.map((name) => `"${name}"`).join(', ')}, mesh bod${bodies.length === 1 ? 'y' : 'ies'} SolidCraft does not measure. Convert ${bodies.length === 1 ? 'it' : 'them'} to faces (mesh.convert, closed meshes only) to have ${bodies.length === 1 ? 'it' : 'them'} measured; until then judge ${bodies.length === 1 ? 'its' : 'their'} fit yourself.`;
/** What a clean check says nothing about (audit R3); the model must not pass the verdict on as more. */
const NOT_CHECKED = 'Not checked: strength and layer direction under load, the fits and hole allowances you chose, details and text too fine to print, bed-edge chamfers. Judge those yourself.';

/** Bodies listed with their measures before the rest is counted. */
const MAX_BODIES = 6;

/**
 * Why the numbers are there and what they are not. Solid volume alone would mislead: turning a block into a shell
 * with ribs takes most of it away, and little of the filament, since the slicer fills a block sparsely anyway. The
 * shell estimate is two wall lines on every surface and 15 % infill inside (Prusa and Protolabs Network name 10 to
 * 20 % as usual): an assumption, since PartBuddy does not know the slicer's settings.
 */
const MEASURES_HEAD =
  'Per body as it prints. Solid volume overstates what thinning a thick region saves, because the slicer fills it sparsely anyway; the shell estimate ' +
  '(two wall lines on every surface, 15 % infill inside: an assumption, not the slicer\'s settings) is nearer to the filament. What counts for sure: fewer layers, less area to support, less surface. Promise neither grams nor minutes:';

/** A volume as the model reads it: under 1 cm³ in mm³, so a small part still shows what a change saved. */
const volume = (mm3: number) => (mm3 < 1000 ? `${String(Math.round(mm3))} mm³` : `${String(Math.round(mm3 / 10) / 100)} cm³`);

type Body = NonNullable<PrintCheckReport['bodies']>[number];

/** One body's measures: the numbers the model compares before and after a change. */
function measureLine(body: Body): string {
  return `- ${JSON.stringify(body.name)}: ${volume(body.volume)} solid, about ${volume(body.shell)} as a shell, ${mm(body.height)} high (${String(body.layers)} layers), ${String(body.surface)} mm² of surface, ${String(body.contact)} mm² on the bed, ${String(body.support)} mm² leaning past the overhang limit.`;
}

function measureLines(report: PrintCheckReport, head = MEASURES_HEAD, only: (body: Body) => boolean = () => true): string[] {
  const bodies = (report.bodies ?? []).slice(0, MAX_BODIES).filter(only);
  if (bodies.length === 0) return [];
  const rest = (report.bodies ?? []).length - MAX_BODIES + (report.bodiesOmitted ?? 0);
  return [head, ...bodies.map(measureLine), ...(rest > 0 ? [`- and ${String(rest)} more ${rest === 1 ? 'body' : 'bodies'}.`] : [])];
}

/** The findings as lines; what does not fit is counted, never dropped without a word. */
function findingLines(report: PrintCheckReport): string[] {
  const lines = report.findings.slice(0, 12).map((finding) => line(finding, report.nozzle));
  const rest = report.findings.length - lines.length + (report.omitted ?? 0);
  if (rest > 0) lines.push(`- and ${String(rest)} more ${rest === 1 ? 'finding' : 'findings'} not listed here; the user sees them in the ready-to-print panel.`);
  return lines;
}

/**
 * The ready-to-print check (M7) as the model reads it: PartBuddy checks after every revision, the
 * model reads it behind the answer of each tool that changed the design, and with the next message
 * when the result changed. Face and feature names come from the design, so they are quoted.
 */
export function printCheckNote(report: PrintCheckReport, view = false): string {
  const head =
    '[PartBuddy: ready-to-print check of the part as it is now (each body lying on its print face when it has one, else as designed along +Z on its own lowest point; overhangs by angle only):';
  const failed = report.unmeasured ?? [];
  const preliminary = [...(report.measuring ? [preliminaryLine(view)] : []), ...(failed.length > 0 ? [unmeasuredLine(failed)] : []), ...((report.unchecked ?? []).length > 0 ? [uncheckedLine(report.unchecked ?? [])] : [])];
  const measured = (['clearance', 'joints'] as const).filter((what) => !failed.includes(what)).map((what) => `, ${MEASURED[what]}`).join('');
  if (report.findings.length === 0)
    return [`${head} nothing found ${report.measuring ? `so far (${CHECKED_MESH})` : `in what it checks (${CHECKED_MESH}${measured})`}.`, ...preliminary, ...measureLines(report), `${NOT_CHECKED}]`].join('\n');
  const verdict = report.status === 'block' ? 'not ready to print' : report.status === 'warn' ? 'prints, with warnings' : 'ready to print';
  return [`${head} ${verdict}.`, ...findingLines(report), ...preliminary, ...measureLines(report), `Fix what blocks printing before you call the part done; the user sees the same findings. ${NOT_CHECKED}]`].join('\n');
}

/**
 * The check behind the tool answers of one turn (review of PR 357): in full the first time and whenever the verdict
 * or a finding changed, else as one line with the measures that changed. Thirty steps of a build would otherwise
 * carry thirty copies of the same note.
 */
export class CheckTold {
  private verdict: string | null = null;
  private readonly bodies = new Map<string, string>();

  /** A new message of the user: the next check is told in full again. */
  forget(): void {
    this.verdict = null;
    this.bodies.clear();
  }

  note(report: PrintCheckReport): string {
    // Every finding with its faces and numbers, not the lines shown: a change in the thirteenth finding is a change.
    const verdict = JSON.stringify([report.status, report.measuring === true, report.unmeasured ?? [], report.unchecked ?? [], report.findings, report.omitted ?? 0]);
    const same = verdict === this.verdict;
    const changed = (body: Body) => this.bodies.get(body.name) !== measureLine(body);
    const short = same
      ? [
          `[PartBuddy: ready-to-print check after this change: unchanged, ${
            report.findings.length === 0
              ? 'nothing found'
              : `${report.status === 'block' ? 'still not ready to print, ' : ''}the same ${String(report.findings.length + (report.omitted ?? 0))} ${report.findings.length + (report.omitted ?? 0) === 1 ? 'finding' : 'findings'} as before`
          }${report.measuring ? `; clearance and joints still being measured: ${FETCH_FULL}` : ''}${(report.unmeasured ?? []).length > 0 ? `; ${unmeasuredLine(report.unmeasured ?? [])}` : '.'}`,
          ...measureLines(report, 'Measures that changed:', changed),
        ].join('\n') + ']'
      : printCheckNote(report);
    this.verdict = verdict;
    this.bodies.clear();
    for (const body of report.bodies ?? []) this.bodies.set(body.name, measureLine(body));
    return short;
  }
}

/** Said behind a tool's answer in place of a check that has not caught up with the design yet. */
export const CHECK_PENDING =
  '[PartBuddy: the ready-to-print check of the latest change is still running; call partbuddy_view for it before you call the part done.]';
/** The same from partbuddy_view itself, which must not send a small model round in circles. */
export const CHECK_PENDING_VIEW = '[PartBuddy: the ready-to-print check of the latest change is still running; it will be here in a moment.]';

/**
 * How long a changing tool's answer waits for the check of what it built, and how long of that for the full check
 * once clearance and joints are measured as well. Measured 2026-11-12 on SolidCraft 0.40.1 without a window
 * (tools/audit, check-timing): mirror and mesh check 0.21 s for a box with its lid and 0.14 s for a hinge, the
 * hinge's two joint sweeps 0.5 s more; the renderer adds 0.25 s of quiet time. So the mesh check is there after
 * about half a second and the full one after about one: three times that each.
 */
export const CHECK_WAIT_MS = 3000;
export const CHECK_FULL_MS = 1500;

/** What PartBuddy holds right now: the revision the mirror last delivered and the check last reported. */
export interface CheckState {
  mirrored: { documentId: string; revision: number } | null;
  report: PrintCheckReport | null;
}

/**
 * The answer of a tool that changed the design, with the check of that change behind it (audit
 * R1): the model reads the findings in the turn that caused them, on every route, instead of being
 * asked to fetch them. The check runs in the renderer after the mirror, so the answer waits for
 * it: up to `fullMs` for the full check, then it takes the mesh check and says that it is
 * preliminary, and after `waitMs` without any it says the check is still running.
 */
export async function withCheckOfChange(
  result: ToolResult,
  change: { documentId: string; revision: number },
  state: () => CheckState,
  tell: (report: PrintCheckReport) => string = printCheckNote,
  waitMs = CHECK_WAIT_MS,
  fullMs = CHECK_FULL_MS,
): Promise<ToolResult> {
  const started = Date.now();
  for (;;) {
    const { mirrored, report } = state();
    // SolidCraft's revision also moves without a mirror (a save), so the mirror may be past the change.
    const checked = mirrored?.documentId === change.documentId && mirrored.revision >= change.revision && report?.revision === mirrored.revision ? report : null;
    const waited = Date.now() - started;
    if (checked && (!checked.measuring || waited >= fullMs)) return { ...result, content: [...result.content, { type: 'text', text: tell(checked) }] };
    if (waited >= waitMs) return { ...result, content: [...result.content, { type: 'text', text: checked ? tell(checked) : CHECK_PENDING }] };
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
