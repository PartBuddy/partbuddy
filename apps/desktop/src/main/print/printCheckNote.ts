import type { PrintCheckReport } from '../../shared/contract';

type Finding = PrintCheckReport['findings'][number];
type Places = Extract<Finding, { places: unknown }>['places'];

const mm = (value: number) => `${String(Math.round(value * 100) / 100)} mm`;

/** Where, in the face names the model also gets from SolidCraft; long lists are cut short. */
function where(places: Places): string {
  if (places.length === 0) return '';
  const parts = places.slice(0, 4).map(({ body, faces }) => {
    const shown = faces.slice(0, 6).map((face) => JSON.stringify(face)).join(', ');
    const more = faces.length > 6 ? ` and ${String(faces.length - 6)} more` : '';
    return `${shown}${more} of body ${JSON.stringify(body)}`;
  });
  return ` (faces ${parts.join('; ')})`;
}

function line(finding: Finding, nozzle: number): string {
  const tag = finding.severity === 'block' ? 'blocks printing' : 'warning';
  switch (finding.kind) {
    case 'size':
      return `- ${tag}: the part is ${finding.size.map(String).join(' × ')} mm, the printer takes ${finding.bed.map(String).join(' × ')} mm${finding.lying ? '; it would fit lying on another side' : ''}.`;
    case 'thinWall':
      return finding.severity === 'block'
        ? `- ${tag}: walls down to ${mm(finding.thickness)}, thinner than the ${mm(nozzle)} nozzle, so they do not print${where(finding.places)}.`
        : `- ${tag}: walls down to ${mm(finding.thickness)}, under the ${mm(finding.minimum)} of two lines${where(finding.places)}.`;
    case 'overhang':
      return `- ${tag}: ${String(finding.area)} mm² lean more than ${String(finding.limit)}° from the vertical${where(finding.places)}; the slicer decides whether they need support.`;
    case 'contact':
      return `- ${tag}: only ${String(finding.area)} mm² lie on the bed, the part may come loose or tip over${where(finding.places)}.`;
    case 'separate':
      return `- ${tag}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(', ')} touch but are separate; the slicer lays each on the bed by itself. Combine them if they are one part.`;
    case 'feature':
      return `- ${tag}: feature ${JSON.stringify(finding.feature)} reports ${JSON.stringify(finding.message.slice(0, 200))}.`;
    case 'overlap':
      return `- ${tag}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(' and ')} overlap by ${String(finding.volume)} mm³; as separate parts they do not go together. Combine them if they are one part, otherwise make room.`;
    case 'tight':
      return `- ${tag}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(' and ')} come within ${mm(finding.gap)} of each other without touching, under the material's push fit of ${mm(finding.minimum)} per side; they only go together with force. Widen the gap unless that is meant.`;
  }
}

/**
 * The ready-to-print check (M7) as the model reads it: PartBuddy checks after every revision, the
 * model hears of it with the next message when the result changed. Face and feature names come
 * from the design, so they are quoted.
 */
export function printCheckNote(report: PrintCheckReport): string {
  const head =
    '[PartBuddy: ready-to-print check of the part as it is now (printed as designed along +Z, each body standing on its own lowest point; overhangs by angle only):';
  if (report.findings.length === 0) return `${head} ready to print, nothing found.]`;
  const verdict = report.status === 'block' ? 'not ready to print' : report.status === 'warn' ? 'prints, with warnings' : 'ready to print';
  const lines = report.findings.slice(0, 12).map((finding) => line(finding, report.nozzle));
  return [`${head} ${verdict}.`, ...lines, 'Fix what blocks printing before you call the part done; the user sees the same findings.]'].join('\n');
}
