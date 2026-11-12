import { shareDescription, type ShareFacts } from '../../../apps/desktop/src/main/share/description';
import { printCheckNote } from '../../../apps/desktop/src/main/print/printCheckNote';
import { printCheckReportSchema, type PrintCheckReport } from '../../../apps/desktop/src/shared/contract';
import { save, source } from '../passung-texte-helpers';

const facts = (language: 'en' | 'de', check: ShareFacts['check']): ShareFacts => ({
  name: 'Audit',
  language,
  bodies: [{ name: 'Body', size: [40, 40, 10] }],
  parameters: [],
  hardware: [],
  material: 'PLA',
  layer: 0.2,
  nozzle: 0.4,
  check,
  files: { model: 'a.3mf', step: 'a.step', pictures: ['a.png'] },
});
const supports = (text: string) => text.split('\n').find((line) => /^- (Supports|Stützen):/.test(line));
// What index.ts:882 hands over from the last reported check.
const fromReport = (report: PrintCheckReport | null): ShareFacts['check'] => (report ? { status: report.status, overhang: report.findings.some((finding) => finding.kind === 'overhang') } : null);

// D5: the supports line of the sharing package's description, for checks without an overhang finding.
test('D5: "Supports" in the sharing description', () => {
  const blocked = printCheckReportSchema.parse({
    status: 'block',
    nozzle: 0.4,
    revision: 7,
    findings: [
      { kind: 'thinWall', severity: 'block', thickness: 0.3, minimum: 0.9, area: 50, places: [{ body: 'Body', faces: ['F1:side:0'] }] },
      { kind: 'size', severity: 'block', size: [300, 40, 10], bed: [256, 256, 256], lying: false },
      { kind: 'contact', severity: 'warn', area: 4, places: [] },
    ],
  });
  const rows = (['en', 'de'] as const).flatMap((language) => [
    { language, check: 'null (no check reported)', line: supports(shareDescription(facts(language, null))) },
    { language, check: 'report: block (thinWall 0.3 mm, size 300 mm, contact 4 mm²), no overhang finding', line: supports(shareDescription(facts(language, fromReport(blocked)))) },
    { language, check: '{status: block, overhang: false}', line: supports(shareDescription(facts(language, { status: 'block', overhang: false }))) },
    { language, check: '{status: warn, overhang: false}', line: supports(shareDescription(facts(language, { status: 'warn', overhang: false }))) },
    { language, check: '{status: ready, overhang: false}', line: supports(shareDescription(facts(language, { status: 'ready', overhang: false }))) },
    { language, check: '{status: warn, overhang: true}', line: supports(shareDescription(facts(language, { status: 'warn', overhang: true }))) },
  ]);
  const description = source('main/share/description.ts');
  const index = source('main/index.ts');
  const result = {
    rows,
    whatTheAssistantReadsOfTheSameCheck: printCheckNote(blocked),
    // How often the description reads the status it is given, and whether the package compares the check's revision.
    statusReadInDescription: (description.match(/check\.status/g) ?? []).length,
    shareHandsOver: index.split('\n').find((line) => line.includes('check: printCheck ?'))?.trim(),
    revisionComparedAt: index.split('\n').flatMap((line, i) => (line.includes('printCheck.revision') ? [i + 1] : [])),
  };
  save('d5-stuetzen', result);
  expect(rows[1]?.line).toBe('- Supports: none needed, it prints as designed');
});
