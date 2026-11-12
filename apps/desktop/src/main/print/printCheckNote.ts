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

/** What the check looks at (the finding kinds of printCheck.ts, withClearance and withMotion), so "nothing found" claims no more. */
const CHECKED =
  'build volume, wall and floor thickness, overhang angle, area on the bed, open bodies, failed features, bodies that touch, overlap or come closer than a push fit, joints that stop before a limit';
/** What a clean check says nothing about (audit R3); the model must not pass the verdict on as more. */
const NOT_CHECKED = 'Not checked: strength and layer direction under load, the fits and hole allowances you chose, details and text too fine to print, bed-edge chamfers. Judge those yourself.';

/** Bodies listed with their measures before the rest is counted. */
const MAX_BODIES = 6;

/**
 * What each body costs to print as far as its shape decides it, one line per body: the numbers the model compares
 * before and after a change. No grams and no minutes: PartBuddy does not know the slicer's infill, walls or speed.
 */
function measureLines(report: PrintCheckReport): string[] {
  const bodies = report.bodies ?? [];
  if (bodies.length === 0) return [];
  const rest = bodies.length - MAX_BODIES + (report.bodiesOmitted ?? 0);
  return [
    "Per body as it prints (solid volume; the slicer's infill, walls and speed decide grams and time, so promise neither):",
    ...bodies
      .slice(0, MAX_BODIES)
      .map((body) => `- ${JSON.stringify(body.name)}: ${String(body.volume)} cm³, ${mm(body.height)} high (${String(body.layers)} layers), ${String(body.contact)} mm² on the bed, ${String(body.support)} mm² leaning past the overhang limit.`),
    ...(rest > 0 ? [`- and ${String(rest)} more ${rest === 1 ? 'body' : 'bodies'}.`] : []),
  ];
}

/**
 * The ready-to-print check (M7) as the model reads it: PartBuddy checks after every revision, the
 * model reads it behind the answer of each tool that changed the design, and with the next message
 * when the result changed. Face and feature names come
 * from the design, so they are quoted.
 */
export function printCheckNote(report: PrintCheckReport): string {
  const head =
    '[PartBuddy: ready-to-print check of the part as it is now (each body lying on its print face when it has one, else as designed along +Z on its own lowest point; overhangs by angle only):';
  if (report.findings.length === 0) return [`${head} nothing found in what it checks (${CHECKED}).`, ...measureLines(report), `${NOT_CHECKED}]`].join('\n');
  const verdict = report.status === 'block' ? 'not ready to print' : report.status === 'warn' ? 'prints, with warnings' : 'ready to print';
  const lines = report.findings.slice(0, 12).map((finding) => line(finding, report.nozzle));
  // What does not fit the note is counted, never dropped without a word.
  const rest = report.findings.length - lines.length + (report.omitted ?? 0);
  if (rest > 0) lines.push(`- and ${String(rest)} more ${rest === 1 ? 'finding' : 'findings'} not listed here; the user sees them in the ready-to-print panel.`);
  return [`${head} ${verdict}.`, ...lines, ...measureLines(report), `Fix what blocks printing before you call the part done; the user sees the same findings. ${NOT_CHECKED}]`].join('\n');
}

/** Said in place of a check that has not caught up with the design yet. */
export const CHECK_PENDING =
  '[PartBuddy: the ready-to-print check of the latest change is still running; call partbuddy_view for it before you call the part done.]';

/** How long a changing tool's answer waits for the check of what it built. */
export const CHECK_WAIT_MS = 5000;

/** What PartBuddy holds right now: the revision the mirror last delivered and the check last reported. */
export interface CheckState {
  mirrored: { documentId: string; revision: number } | null;
  report: PrintCheckReport | null;
}

/**
 * The answer of a tool that changed the design, with the check of that change behind it (audit
 * R1): the model reads the findings in the turn that caused them, on every route, instead of being
 * asked to fetch them. The check runs in the renderer after the mirror, so the answer waits for
 * it, but no longer than `waitMs`; after that it says the check is still running.
 */
export async function withCheckOfChange(result: ToolResult, change: { documentId: string; revision: number }, state: () => CheckState, waitMs = CHECK_WAIT_MS): Promise<ToolResult> {
  const until = Date.now() + waitMs;
  for (;;) {
    const { mirrored, report } = state();
    // SolidCraft's revision also moves without a mirror (a save), so the mirror may be past the change.
    const checked = mirrored?.documentId === change.documentId && mirrored.revision >= change.revision && report?.revision === mirrored.revision ? report : null;
    if (checked || Date.now() >= until) return { ...result, content: [...result.content, { type: 'text', text: checked ? printCheckNote(checked) : CHECK_PENDING }] };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
