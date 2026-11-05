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
  const tag = finding.severity === 'block' ? 'blocks printing' : finding.severity === 'warn' ? 'warning' : 'note';
  switch (finding.kind) {
    case 'size':
      return `- ${tag}: the part is ${finding.size.map(String).join(' × ')} mm, the printer takes ${finding.bed.map(String).join(' × ')} mm${finding.lying ? '; it would fit lying on another side' : ''}.`;
    case 'thinWall':
      return finding.severity === 'block'
        ? `- ${tag}: walls down to ${mm(finding.thickness)}, thinner than the ${mm(nozzle)} nozzle, so they do not print${where(finding.places)}.`
        : `- ${tag}: walls down to ${mm(finding.thickness)}, under the ${mm(finding.minimum)} of two lines${where(finding.places)}.`;
    case 'support': {
      const what =
        finding.cause === 'fillet' ? 'of fillets facing the bed ' : finding.cause === 'hole' ? 'on top of lying holes too wide to bridge ' : finding.cause === 'counterbore' ? 'of counterbore steps facing the bed (the hole cuts the bridge) ' : '';
      const fix =
        finding.cause === 'fillet'
          ? ' (chamfer them at 45° instead)'
          : finding.cause === 'hole'
            ? ' (give them a teardrop or flat roof)'
            : finding.cause === 'counterbore'
              ? ' (add a stepped bridge: one layer with a slot as wide as the hole, one with a square)'
              : '';
      return `- ${tag}: ${String(finding.area)} mm² ${what}lean more than ${String(finding.limit)}° from the vertical and need support${where(finding.places)}${fix}.`;
    }
    case 'contact':
      return `- ${tag}: only ${String(finding.area)} mm² lie on the bed, the part may come loose or tip over${where(finding.places)}.`;
    case 'separate':
      return `- ${tag}: bodies ${finding.bodies.map((body) => JSON.stringify(body)).join(', ')} touch but are separate; the slicer lays each on the bed by itself. Combine them if they are one part.`;
    case 'feature':
      return `- ${tag}: feature ${JSON.stringify(finding.feature)} reports ${JSON.stringify(finding.message.slice(0, 200))}.`;
  }
}

/**
 * The ready-to-print check (M7) as the model reads it: PartBuddy checks after every revision, the
 * model hears of it with the next message when the result changed. Face and feature names come
 * from the design, so they are quoted.
 */
export function printCheckNote(report: PrintCheckReport): string {
  const head =
    '[PartBuddy: ready-to-print check of the part as it is now (printed along +Z, each body standing on its own lowest point; steep overhangs count only where no wall within 1.5 mm and no bridge under 10 mm carries them):';
  if (report.findings.length === 0) return `${head} ready to print, nothing found.]`;
  const verdict = report.status === 'block' ? 'not ready to print' : report.status === 'warn' ? 'prints, with warnings' : 'ready to print';
  const lines = report.findings.slice(0, 12).map((finding) => line(finding, report.nozzle));
  return [`${head} ${verdict}.`, ...lines, 'Fix what blocks printing before you call the part done; the user sees the same findings.]'].join('\n');
}
