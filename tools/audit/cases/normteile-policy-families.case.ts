import { decide } from '../../../apps/desktop/src/main/agents/policy';
import { componentsWithBodies } from '../../../apps/desktop/src/main/solidcraft/mirror';
import { isLibraryPart } from '../../../apps/desktop/src/main/solidcraft/standardParts';
import { openAudit, PLA_04 } from '../harness';
import { appState, attempt, finish } from '../normteile-policy-helpers';

const NAME = 'normteile-policy/families';

// S-01 / G2: one part of every family of parts.library, inserted as the assistant may (parts.insert), then what
// PartBuddy's mirror takes for a standard part and what is left for print check, size list and export.
test('every family of parts.library through isLibraryPart and the mirror', async () => {
  const audit = await openAudit(NAME);
  try {
    const [library] = (await audit.batch([{ command: 'parts.library', params: {} }])) as [{ families: { family: string; name: string; sizes: { size: string }[] }[] }];
    const inserted = [];
    for (const [i, family] of library.families.entries()) {
      const size = family.sizes.find((entry) => entry.size === 'M3')?.size ?? family.sizes[0]!.size;
      const step = { command: 'parts.insert', params: { family: family.family, size, point: [i * 60, 0, 20] } };
      const reply = await attempt(() => audit.batch([step]));
      inserted.push({ family: family.family, libraryName: family.name, size, policy: decide('execute', step), reply: 'failed' in reply ? reply : reply[0] });
    }
    const [listing] = await audit.batch([{ command: 'component.list', params: {} }]);
    const components = componentsWithBodies(listing);
    const metadata = (await audit.batch(components.map((part) => ({ command: 'component.metadata', params: { component: part.id } })))) as { name?: string; description?: string }[];
    const state = await appState(audit, PLA_04);
    const families = components.map((part, i) => {
      const description = metadata[i]?.description;
      return {
        component: metadata[i]?.name,
        description,
        bodies: part.bodies,
        isLibraryPart: isLibraryPart(description),
        inStandardParts: part.bodies.every((body) => state.standardParts.includes(body)),
        family: inserted.find((entry) => typeof description === 'string' && description.startsWith(`${entry.libraryName} `))?.family ?? null,
      };
    });
    // What the export of the app would write: every mirrored body that is no standard part (supervisor.ts exportDesign).
    const exported = state.printed.length === 0 ? null : await attempt(() => audit.batch([{ command: 'inspect.measure', params: { bodies: state.printed } }]));
    const result = { libraryFamilies: library.families.length, inserted, families, notRecognised: families.filter((entry) => !entry.isLibraryPart), state, exportedBodiesMeasure: exported };
    await finish(audit, NAME, result);
    expect(families.length).toBe(library.families.length);
  } finally {
    await audit.close();
  }
});
