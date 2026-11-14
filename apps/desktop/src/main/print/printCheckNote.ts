import { thinnestLine, withinTurn } from '@partbuddy/geometry';

import type { PrintCheckReport } from '../../shared/contract';
import type { ToolResult } from '../agents/gateProxy';

type Finding = PrintCheckReport['findings'][number];
type Places = Extract<Finding, { places: unknown }>['places'];

// To 0.001 mm like the scaled fits of the print profile (printProfiles.ts), so a push fit of 0.075 does not read 0.08.
const mm = (value: number) => `${String(Math.round(value * 1000) / 1000)} mm`;

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

/** Feature names, quoted, the first eight and how many more. */
const names = (features: readonly string[]) =>
  `feature${features.length === 1 ? '' : 's'} ${features.slice(0, 8).map((name) => JSON.stringify(name)).join(', ')}${features.length > 8 ? ` and ${String(features.length - 8)} more` : ''}`;

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
        ? `- ${tag}: walls down to ${mm(finding.thickness)}, thinner than the narrowest line a slicer lays (${mm(thinnestLine(nozzle))} with the ${mm(nozzle)} nozzle), so they do not print${where(finding.places)}.`
        : `- ${tag}: walls down to ${mm(finding.thickness)}, under the ${mm(finding.minimum)} of two lines${where(finding.places)}.`;
    case 'overhang':
      // Designed away where it can be, said where not (audit R55; a warning, never a block: Manuel 2026-11-14).
      return `- ${tag}: ${String(finding.area)} mm² lean more than ${String(finding.limit)}° from the vertical${where(finding.places)}, so they need support: reshape them where you can (a slope within that angle, a teardrop roof, a chamfer, or another print face); where you cannot, tell the user which support they need there and why.`;
    case 'roundBedEdge':
      // BC-27: a raw fillet on a bed edge; the rules' chamfer leans at most 45°, or the material's angle where it is less (BC-19).
      return `- ${tag}: ${String(finding.area)} mm² of rounded edges on the bed lean more than ${String(finding.limit)}° from the vertical just above it${where(finding.places)}: the foot of a fillet there ends flat on the bed and curls up. Chamfer those edges instead, leaning at most ${String(Math.min(45, finding.limit))}° from the vertical; fillets that face up or sideways are fine.`;
    case 'smallHole':
      // BC-24, yardstick S12: under 2 mm a hole closes up or comes out well under size at any nozzle; a hint, never a block.
      return `- ${tag}: ${finding.holes === 1 ? 'a hole' : `${String(finding.holes)} holes`} under ${mm(finding.minimum)} across, the smallest ${mm(finding.diameter)}${where(finding.places)}: holes that small close up or come out well under size. Make them at least ${mm(finding.minimum)} where the size is free; where it is meant (a tap drill, a seat for a pin), tell the user to drill them out to size after printing.`;
    case 'narrowGap':
      // BC-24: two walls of one body closer than the print-in-place gap; the slot prints closed, the part prints.
      return `- ${tag}: slots between walls of one body down to ${mm(finding.gap)} wide, under the ${mm(finding.minimum)} that stay open with this nozzle (one nozzle, at least 0.3 mm)${where(finding.places)}: the lines on both sides squeeze into them and the slot prints closed (an engraved stroke, a kerf, a slit between letters). Widen them to at least ${mm(finding.minimum)} where they must stay open.`;
    case 'sharpEdge':
      // Design hint (research O14, H9): a body with no rounded or chamfered edge at all; the radius by the rules' sizes.
      return `- ${tag}: ${String(finding.edges)} sharp ${finding.edges === 1 ? 'edge' : 'edges'} (${String(finding.length)} mm) on bodies with no rounded or chamfered edge at all${where(finding.places)}: the design rules round outer edges that are seen or touched, ${mm(finding.radius)} on a part of ${mm(finding.size)} (1 mm under 30 mm, 2 mm up to 100 mm, 3 mm above), never more than the wall they cut into, and chamfer the edges on the bed. Round them, unless the edge must fit flat against another part or the user wants it sharp; then say so.`;
    case 'edgeRadii':
      // Design hint (research O1, H6): outer fillets of more radius families than the rules use.
      return `- ${tag}: outer edges rounded with ${String(finding.families)} families of radii (${finding.radii.map(String).join(', ')} mm)${where(finding.places)}: the design rules use at most ${String(finding.most)} radii per part, so the rounds match (radii less than a quarter apart count as one). Bring them to two or three, e.g. one for the outer corners and one for the edges; keep a radius the user named.`;
    case 'rootCorner':
      // Design hint (research F2, F6, F7, H1): a slender free arm bends at its foot, where a sharp inner corner concentrates the stress.
      return `- ${tag}: ${finding.roots === 1 ? 'a slender arm stands' : `${String(finding.roots)} sides of slender arms stand`} on a sharp inner corner, the thinnest ${mm(finding.thickness)} thick and ${mm(finding.length)} long${where(finding.places)}: an arm that bends (a snap arm, a hook, a thin post) cracks first at a sharp root. Round the root with at least ${mm(finding.radius)} (half the arm's thickness, at least 1 mm and two nozzles; on a snap arm 0.5 to 0.6 of its thickness), unless it carries nothing.`;
    case 'shallowSlope':
      // Design hint (research O4, H4): a face sloped just off flat shows its layers as wide steps.
      return `- ${tag}: ${finding.faces === 1 ? 'a flat face facing up leans' : `${String(finding.faces)} flat faces facing up lean`} less than ${String(finding.limit)}° from flat (${String(finding.area)} mm², the shallowest ${String(finding.angle)}°)${where(finding.places)}: the layers show on it as steps about ${mm(finding.step)} wide. Where it is seen, make it flat or lean it at least ${String(finding.limit)}°; where the slope is its job (a drain, a ramp), leave it and tell the user the steps will show.`;
    case 'shellCorner':
      // Design hint (research O1, H7): a shell rounded outside but not inside thins in the corner.
      return `- ${tag}: ${finding.corners === 1 ? 'a rounded outer edge of a shell thins' : `${String(finding.corners)} rounded outer edges of a shell thin`} the wall in the corner to ${mm(finding.thickness)}, under half the ${mm(finding.wall)} beside it${where(finding.places)}: the outside is rounded ${mm(finding.radius)}, the inside not to match. Round the inside to the outer radius less the wall (${mm(finding.inner)}), concentric, or round the outside before shelling (solid.shell keeps the wall even); else make the outer radius at most the wall.`;
    case 'contact':
      return finding.bodies > 1
        ? `- ${tag}: ${String(finding.bodies)} bodies have little on the bed for their height, the least ${String(finding.area)} mm²; they may come loose or tip over, a brim holds them${where(finding.places, finding.bodies)}.`
        : `- ${tag}: only ${String(finding.area)} mm² lie on the bed for the part's height, it may come loose or tip over, a brim holds it${where(finding.places)}.`;
    case 'separate':
      return `- ${tag}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(', ')} touch but are separate; the slicer lays each on the bed by itself. Combine them if they are one part.`;
    case 'fused':
      return `- ${tag}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(', ')} print as one piece and touch: they fuse where they touch, so the mechanism between them does not move. Leave a gap between them there.`;
    case 'open':
      return `- ${tag}: ${finding.bodies.map((body) => `body ${JSON.stringify(body)}`).join(', ')} is an open surface, not a closed solid: it has no volume, so nothing of it prints. Close it into a solid, or remove it if it only helped to build.`;
    case 'faceLost':
      return finding.bodies.length === 1
        ? `- ${tag}: the print face of body ${JSON.stringify(finding.bodies[0])} is no flat face of it any more (renamed or changed since it was set), so it is not checked lying on it (but as designed, or on the print face of a body it prints in one piece with). Set it again (body.print_face) where it should lie.`
        : `- ${tag}: the print faces of bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(', ')} are no flat faces of them any more (renamed or changed since they were set), so they are not checked lying on them (but as designed, or on the print face of a body they print in one piece with). Set them again (body.print_face) where they should lie.`;
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
      return finding.inPlace
        ? `- ${tag}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(' and ')} print as one piece and move against each other, but come within ${mm(finding.gap)} of each other, under the print-in-place gap of ${mm(finding.minimum)} for this nozzle: they fuse there in the print and do not move. Widen the gap there.`
        : `- ${tag}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(' and ')} come within ${mm(finding.gap)} of each other without touching, under the push fit of ${mm(finding.minimum)} per side for this nozzle (as in the print profile); they only go together with force. Widen the gap unless that is meant.`;
    case 'blocked':
      return finding.free
        ? `- ${tag}: joint ${JSON.stringify(finding.joint)} has no limit that way and stops at ${String(finding.unit === 'deg' ? withinTurn(finding.at) : finding.at)} ${finding.unit}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(' and ')} touch there. Make room where they touch, or set its limits with joint.limits if that is the stop you mean.`
        : `- ${tag}: joint ${JSON.stringify(finding.joint)} stops at ${String(finding.at)} ${finding.unit}, before its limit of ${String(finding.limit)} ${finding.unit}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(' and ')} touch there. Make room where they touch, or narrow the limit with joint.limits if that is the stop you mean.`;
    case 'leftOut':
      return finding.rolledBack
        ? `- ${tag}: the timeline is rolled back: ${names(finding.features)} come after its marker, so they are not in the part as checked and exported. Roll it forward (timeline.roll_to) unless that is meant.`
        : `- ${tag}: ${names(finding.features)} ${finding.features.length === 1 ? 'is' : 'are'} suppressed, so not in the part as checked and exported; a suppressed feature that failed is not fixed. Unsuppress it, or delete it if it is not wanted.`;
    case 'posed':
      return `- ${tag}: joint ${JSON.stringify(finding.joint)} stands at ${String(finding.value)} ${finding.unit}, not at 0 as designed; the design is exported and checked as it stands. Drive it back with joint.drive unless that is meant.`;
  }
}

type Hint = NonNullable<PrintCheckReport['off']>[number];
/** The hints of BC-24 as the note names them; the user may turn each off in the print settings. */
const PRINT_HINT_NAMES = { smallHole: 'holes under 2 mm', narrowGap: 'slots under one nozzle' };
/** The design hints (Manuel, 2026-11-14), off also with their design rule. */
const DESIGN_HINT_NAMES = { sharpEdge: 'bodies with no rounded or chamfered edge', edgeRadii: 'more than three radii on outer edges', rootCorner: 'sharp inner corners at the foot of slender arms', shallowSlope: 'faces facing up that lean less than 15° from flat', shellCorner: 'shell corners rounded outside only' };
const HINTS: Record<Hint, string> = { ...PRINT_HINT_NAMES, ...DESIGN_HINT_NAMES };
const looked = (report: PrintCheckReport, names: Partial<Record<Hint, string>>) => (Object.keys(names) as Hint[]).filter((hint) => !report.off?.includes(hint)).map((hint) => HINTS[hint]);
/** What the mesh check looks at at once (the finding kinds of printCheck.ts), so "nothing found" claims no more: hints turned off are left out. */
const checkedMesh = (report: PrintCheckReport) => `build volume, wall and floor thickness, overhang angle, rounded edges on the bed, ${looked(report, PRINT_HINT_NAMES).map((name) => `${name}, `).join('')}area on the bed for the height, open bodies, failed, suppressed and rolled back features, bodies that touch`;
/** The design hints looked for: how the part looks and holds, said apart from what decides whether it prints. */
const designLine = (report: PrintCheckReport) => {
  const design = looked(report, DESIGN_HINT_NAMES);
  return design.length > 0 ? ` Design hints looked for (how the part looks and holds; yellow, never a block): ${design.join(', ')}.` : '';
};
/** What the user turned off is said as not checked, so the model does not take it for checked. */
const offLine = (report: PrintCheckReport) => (report.off && report.off.length > 0 ? ` Turned off in PartBuddy's print settings or with the design rules, so not looked for: ${report.off.map((hint) => HINTS[hint]).join(', ')}.` : '');
/** What SolidCraft measures after it (withClearance, withMotion): it takes longer and comes with the full check. */
const MEASURED = {
  clearance: 'bodies that overlap or come closer than the push fit, or than the print-in-place gap where they print as one piece and move',
  joints: 'joints that stop before a limit, or within a turn or as far as the parts reach where they have none',
};
const CHECKED_MEASURED = `${MEASURED.clearance}, ${MEASURED.joints}`;
/** What the model is to do while the measures are out; partbuddy_view itself says only that they are coming, or a small model calls it in circles. */
const FETCH_FULL = 'call partbuddy_view for the full check before you call the part done';
const preliminaryLine = (view: boolean) => `Preliminary: clearance and joints still being measured (${CHECKED_MEASURED}); ${view ? 'the full check will be here in a moment' : FETCH_FULL}.`;
/** A measure that failed is said, never read as "nothing found" (audit H-05). */
const unmeasuredLine = (failed: readonly ('clearance' | 'joints')[]) =>
  `NOT measured, or not all of it (SolidCraft's measure failed or did not finish every pair in its time, or there were more than 200 joint runs): ${failed.map((what) => MEASURED[what]).join(', ')}. Measure it yourself (${failed.map((what) => (what === 'clearance' ? 'inspect.clearance' : 'joint.sweep')).join(', ')}) before you call the part done.`;
/** Mesh bodies have no faces to measure: `inspect.clearance` leaves them out however it is called, so the way is to convert them. */
const uncheckedLine = (bodies: readonly string[]) =>
  `NOT measured for overlaps and gaps: ${bodies.map((name) => `"${name}"`).join(', ')}, mesh bod${bodies.length === 1 ? 'y' : 'ies'} SolidCraft does not measure. Convert ${bodies.length === 1 ? 'it' : 'them'} to faces (mesh.convert, closed meshes only) to have ${bodies.length === 1 ? 'it' : 'them'} measured; until then judge ${bodies.length === 1 ? 'its' : 'their'} fit yourself.`;
/** What a clean check says nothing about (audit R3); the model must not pass the verdict on as more. */
const NOT_CHECKED = 'Not checked: strength and layer direction under load, the fits and hole allowances you chose, details and text too fine to print, the size of bed-edge chamfers. Judge those yourself.';

/** Findings about parts that overlap, fit too tight, fuse or stop a joint: each piece prints, the whole may not work. */
const FIT_KINDS = new Set<Finding['kind']>(['overlap', 'tight', 'fused', 'blocked']);
/** What the model must do before "done" (audit H-12): a warning about how the parts go together is fixed or told, never passed over. */
const FIX_BEFORE_DONE =
  'Fix what blocks printing, and either fix or name to the user every warning about parts that overlap, are too tight, fuse or stop a joint, before you call the part done; the user sees the same findings.';

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
    return [`${head} nothing found ${report.measuring ? `so far (${checkedMesh(report)})` : `in what it checks (${checkedMesh(report)}${measured})`}.`, ...preliminary, ...measureLines(report), `${NOT_CHECKED}${designLine(report)}${offLine(report)}]`].join('\n');
  // An assembly whose parts do not go together or move is no finished part, though each piece prints (audit H-12).
  const fitting = report.findings.some((finding) => FIT_KINDS.has(finding.kind));
  const verdict = report.status === 'block' ? 'not ready to print' : report.status === 'warn' ? (fitting ? 'prints, but its parts may not go together or move as designed' : 'prints, with warnings') : 'ready to print';
  return [`${head} ${verdict}.`, ...findingLines(report), ...preliminary, ...measureLines(report), `${FIX_BEFORE_DONE} ${NOT_CHECKED}${designLine(report)}${offLine(report)}]`].join('\n');
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
