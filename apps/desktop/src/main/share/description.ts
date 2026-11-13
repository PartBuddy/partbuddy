/**
 * The description of a sharing package (plan step F5): a Markdown file to paste into Printables or
 * MakerWorld, with what the design says on its own (parts, sizes, parameters) and how it prints
 * (material, layer, supports from the ready-to-print check). What the part is for is the user's to
 * write; the file marks the place.
 */

export interface ShareFacts {
  name: string;
  language: 'en' | 'de';
  /** With copies and filament from the parts list (P6) where the user noted them. */
  bodies: { name: string; size: [number, number, number] | null; quantity?: number; filament?: string }[];
  parameters: { name: string; value: number; unit: string; comment: string | null }[];
  /** Standard parts to buy, from SolidCraft's bill of materials. */
  hardware: { count: number; name: string; standard: string }[];
  material: string;
  layer: number;
  nozzle: number;
  /** From the ready-to-print check: null when it has not run. */
  check: { status: 'ready' | 'warn' | 'block'; overhang: boolean } | null;
  files: { model: string; step: string; pictures: string[] };
}

/**
 * The check as the description reads it. An overhang is red only for a user who designs without support (audit R55):
 * shared, the part prints with support, so it is said as faces to check in the slicer, not as a part that does not print.
 */
export function shareCheck(report: { status: 'ready' | 'warn' | 'block'; findings: readonly { kind: string; severity: 'block' | 'warn' }[] }): NonNullable<ShareFacts['check']> {
  const blocked = report.findings.some((finding) => finding.severity === 'block' && finding.kind !== 'overhang');
  return { status: blocked ? 'block' : report.status === 'ready' ? 'ready' : 'warn', overhang: report.findings.some((finding) => finding.kind === 'overhang') };
}

const TEXT = {
  en: {
    write: '<!-- What is it, what is it for, how is it put together? -->',
    print: 'Print settings',
    material: 'Material',
    layer: 'Layer height',
    nozzle: 'Nozzle',
    supports: 'Supports',
    noSupports: "the print check found no face that needs them; the slicer decides",
    blocked: "not settled: the print check found problems that keep the part from printing",
    maybeSupports: 'some faces lean more than the material likes; check them in the slicer',
    unchecked: 'not checked',
    parts: 'Parts',
    part: (count: number) => (count === 1 ? '1 part' : `${String(count)} parts`),
    sizes: 'Size',
    hardware: 'Hardware',
    parameters: 'Parameters',
    parametersHint: 'The design is parametric: change these in PartBuddy or SolidCraft.',
    files: 'Files',
    model: 'each part on its print face where one is set, ready for the slicer',
    step: 'to change it in any CAD program',
    pictures: 'pictures',
    made: 'Designed with [PartBuddy](https://github.com/PartBuddy/partbuddy) and SolidCraft.',
  },
  de: {
    write: '<!-- Was ist es, wofür ist es, wie wird es zusammengesetzt? -->',
    print: 'Druckeinstellungen',
    material: 'Material',
    layer: 'Schichthöhe',
    nozzle: 'Düse',
    supports: 'Stützen',
    noSupports: 'die Prüfung von PartBuddy fand keine Fläche, die welche braucht; der Slicer entscheidet',
    blocked: 'offen: die Prüfung von PartBuddy fand Probleme, die den Druck verhindern',
    maybeSupports: 'einige Flächen sind steiler, als das Material mag; im Slicer prüfen',
    unchecked: 'nicht geprüft',
    parts: 'Teile',
    part: (count: number) => (count === 1 ? '1 Teil' : `${String(count)} Teile`),
    sizes: 'Größe',
    hardware: 'Normteile',
    parameters: 'Parameter',
    parametersHint: 'Das Design ist parametrisch: diese Werte lassen sich in PartBuddy oder SolidCraft ändern.',
    files: 'Dateien',
    model: 'jedes Teil auf seiner Druckfläche, wo eine gesetzt ist, fertig für den Slicer',
    step: 'zum Ändern in jedem CAD-Programm',
    pictures: 'Bilder',
    made: 'Konstruiert mit [PartBuddy](https://github.com/PartBuddy/partbuddy) und SolidCraft.',
  },
} as const;

/** Two decimals at most, with the language's separator. */
function format(value: number, language: 'en' | 'de'): string {
  return new Intl.NumberFormat(language, { maximumFractionDigits: 2 }).format(Math.round(value * 100) / 100);
}

/** Text from the design (names, comments) on one line, without Markdown that would change the layout. */
function plain(text: string): string {
  return text.replace(/[\r\n]+/g, ' ').replace(/[<>]/g, '').trim();
}

export function shareDescription(facts: ShareFacts): string {
  const text = TEXT[facts.language];
  const mm = (value: number) => `${format(value, facts.language)} mm`;
  // The check leaves small overhangs, bridges and the lay of the part to the slicer, so it promises nothing; a blocked part is no print at all.
  const supports = !facts.check ? text.unchecked : facts.check.status === 'block' ? text.blocked : facts.check.overhang ? text.maybeSupports : text.noSupports;
  const lines = [
    `# ${plain(facts.name)}`,
    '',
    text.write,
    '',
    `## ${text.print}`,
    '',
    `- ${text.material}: ${plain(facts.material)}`,
    `- ${text.layer}: ${mm(facts.layer)}`,
    `- ${text.nozzle}: ${mm(facts.nozzle)}`,
    `- ${text.supports}: ${supports}`,
    `- ${text.parts}: ${text.part(facts.bodies.length)}`,
    '',
    `## ${text.sizes}`,
    '',
    ...facts.bodies.map(
      (body) =>
        `- ${(body.quantity ?? 1) > 1 ? `${String(body.quantity)} × ` : ''}${plain(body.name)}${body.size ? `: ${body.size.map((value) => format(value, facts.language)).join(' × ')} mm` : ''}${body.filament ? ` (${plain(body.filament)})` : ''}`,
    ),
  ];
  if (facts.hardware.length > 0) {
    lines.push('', `## ${text.hardware}`, '');
    for (const part of facts.hardware) lines.push(`- ${String(part.count)} × ${plain(part.name)} (${plain(part.standard)})`);
  }
  if (facts.parameters.length > 0) {
    lines.push('', `## ${text.parameters}`, '', text.parametersHint, '');
    for (const parameter of facts.parameters) {
      const value = `${format(parameter.value, facts.language)}${parameter.unit ? ` ${parameter.unit}` : ''}`;
      lines.push(`- \`${plain(parameter.name)}\` = ${value}${parameter.comment ? ` – ${plain(parameter.comment)}` : ''}`);
    }
  }
  lines.push(
    '',
    `## ${text.files}`,
    '',
    `- \`${facts.files.model}\` – ${text.model}`,
    `- \`${facts.files.step}\` – ${text.step}`,
    `- ${facts.files.pictures.map((picture) => `\`${picture}\``).join(', ')} – ${text.pictures}`,
    '',
    '---',
    '',
    text.made,
    '',
  );
  return lines.join('\n');
}
