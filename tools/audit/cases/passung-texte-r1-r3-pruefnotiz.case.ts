import { VIEW_GUIDANCE, withViewTool } from '../../../apps/desktop/src/main/agents/viewContext';
import { CHECK_PENDING_VIEW, CheckTold, printCheckNote, withCheckOfChange } from '../../../apps/desktop/src/main/print/printCheckNote';
import { ProfileNote } from '../../../apps/desktop/src/main/print/printProfiles';
import { printCheckReportSchema, printFindingSchema, type PrintCheckReport } from '../../../apps/desktop/src/shared/contract';
import { standardText } from '../../../apps/desktop/src/shared/standards';
import { save, source } from '../passung-texte-helpers';

const upstream = { instructions: () => '', listTools: () => Promise.resolve([]), callTool: () => Promise.resolve({ content: [] }) };

// R1/R3: the words of the ready-to-print check as the model gets them, and when in a turn.
test('R1/R3: the check note, blocked and clean, and when it reaches the model', async () => {
  const clean = printCheckReportSchema.parse({ status: 'ready', nozzle: 0.4, revision: 1, findings: [] });
  const blocked = printCheckReportSchema.parse({
    status: 'block',
    nozzle: 0.4,
    revision: 2,
    findings: [{ kind: 'thinWall', severity: 'block', floor: false, thickness: 0.3, minimum: 0.9, area: 50, places: [{ body: 'Plate', faces: ['F2:side:0'] }] }],
  });

  // index.ts:370-379, :557 and :738-744 since PR #357, with the real ProfileNote, CheckTold, withCheckOfChange and partbuddy_view.
  let printCheck: PrintCheckReport | null = null;
  let designRevision = 0;
  const checkNote = new ProfileNote();
  const checkTold = new CheckTold();
  const checkForView = () => {
    if (!printCheck) return null;
    if (printCheck.revision !== designRevision) return CHECK_PENDING_VIEW;
    return printCheckNote(printCheck, true);
  };
  const tools = withViewTool(upstream as never, () => null, () => null, checkForView);
  const view = async () => (await tools.callTool('partbuddy_view', {}, 'c')).content.map((part) => (part as { text?: string }).text).slice(1);
  const withMessage = (fresh: boolean) => {
    checkTold.forget();
    return printCheck ? checkNote.take('claude', fresh, printCheckNote(printCheck)) : null;
  };
  // A changing tool's answer: waits (here 200 ms instead of 3 s) for the check of its revision.
  const change = async () => {
    const answer = await withCheckOfChange({ content: [{ type: 'text', text: 'Built.' }] } as never, { documentId: 'd', revision: designRevision }, () => ({ mirrored: { documentId: 'd', revision: designRevision }, report: printCheck }), (report) => checkTold.note(report), 200, 100);
    return (answer as { content: { text?: string }[] }).content.slice(1).map((part) => part.text);
  };

  const timeline: { moment: string; modelGets: unknown }[] = [];
  printCheck = clean;
  designRevision = 1;
  timeline.push({ moment: '1 user message 1 goes out (design clean, revision 1)', modelGets: withMessage(true) });
  designRevision = 2;
  timeline.push({ moment: '2 the model changes the design (revision 2), the check is still of revision 1: the tool answer', modelGets: await change() });
  printCheck = blocked;
  timeline.push({ moment: '3 the model changes the design (revision 2), its check reported: the tool answer', modelGets: await change() });
  timeline.push({ moment: '4 the model calls partbuddy_view', modelGets: await view() });
  designRevision = 3;
  printCheck = { ...blocked, revision: 3 };
  timeline.push({ moment: '5 the model changes again, the wall is still 0.3 mm (revision 3): the tool answer', modelGets: await change() });
  timeline.push({ moment: '6 user message 2 goes out', modelGets: withMessage(false) });

  const mentions = (file: string) => (source(file).match(/printCheck|checkNote|checkForView|partbuddy_view|VIEW_TOOL/g) ?? []).length;
  const kinds = printFindingSchema.options.map((option) => option.shape.kind.value);
  const result = {
    cleanNote: printCheckNote(clean),
    blockedNote: printCheckNote(blocked),
    guidance: VIEW_GUIDANCE,
    timeline,
    // Where a turn ends: none of these files reads the check.
    mentionsOfTheCheck: {
      'main/agents/agentService.ts': mentions('main/agents/agentService.ts'),
      'main/agents/loop.ts': mentions('main/agents/loop.ts'),
      'main/agents/claudeCode.ts': mentions('main/agents/claudeCode.ts'),
      'main/agents/workLog.ts': mentions('main/agents/workLog.ts'),
    },
    takeCallsInIndex: source('main/index.ts').split('\n').flatMap((line, i) => (line.includes('checkNote.take(') ? [i + 1] : [])),
    // R3: what the check can find at all, against what "ready to print, nothing found" says.
    findingKinds: kinds,
    standardTail: standardText('vent').split('\n').at(-1),
    wordsMissingInCleanNote: ['bridge', 'layer', 'fit', 'detail', 'text', 'hole'].filter((word) => !printCheckNote(clean).includes(word)),
  };
  save('r1-r3-pruefnotiz', result);
  // R3 since PR #357: "nothing found in what it checks (…)"; R1: the blocked check comes with the tool answer.
  expect(result.cleanNote).toContain('nothing found in what it checks');
  expect(String(timeline[2]?.modelGets)).toContain('not ready to print');
});
