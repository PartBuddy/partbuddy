import { decide } from '../../../apps/desktop/src/main/agents/policy';
import { boughtParts, hardwareOf, type ControlRequester, type PartChecks } from '../../../apps/desktop/src/main/solidcraft/mirror';
import { cliReferences } from '../../../apps/desktop/src/main/solidcraft/partReference';
import { openAudit, PLA_04, type Audit, type Step } from '../harness';
import { appState, attempt, finish } from '../normteile-policy-helpers';

const CLI = process.env.AUDIT_SOLIDCRAFT_CLI ?? 'C:/Program Files/SolidCraft/solidcraft-cli.exe';
const requesterOf = (audit: Audit): ControlRequester => ({
  request: async <T>(_method: string, params?: Record<string, unknown>) => ({ results: await audit.batch((params?.commands ?? []) as Step[]) }) as T,
});
const checksOf = (audit: Audit, logs: string[]): PartChecks => {
  const log = (message: string) => void logs.push(message);
  return { log, references: cliReferences({ cli: () => CLI, dir: audit.dir, log }).ready };
};
const pick = (state: Awaited<ReturnType<typeof appState>>) => ({ standardParts: state.standardParts, printed: state.printed, status: state.check.status, findings: state.check.findings.map((finding) => finding.kind) });

/** A box, a lid 0.3 mm thick (a thinWall finding) and a real M3 nut in a component "Nut"; then the steps, as sent past or through the policy. */
async function route(name: string, steps: (nut: string) => Step[]) {
  const audit = await openAudit(`normteile-policy/library-${name}`);
  const logs: string[] = [];
  const warn = vi.spyOn(console, 'warn').mockImplementation((message: unknown) => void logs.push(String(message)));
  try {
    await audit.batch([
      { command: 'solid.box', params: { length: '40 mm', width: '30 mm', height: '20 mm', operation: 'new', body_name: 'Box', name: 'Box' } },
      { command: 'solid.box', params: { length: '40 mm', width: '30 mm', height: '0.3 mm', corner: [0, 0, 30], operation: 'new', body_name: 'Deckel', name: 'Deckel' } },
      { command: 'parts.insert', params: { family: 'hex_nut', size: 'M3', point: [80, 0, 0], name: 'Nut' } },
    ]);
    const before = await appState(audit, PLA_04);
    const nut = before.standardParts[0] ?? 'Body1';
    const run = [];
    for (const step of steps(nut)) {
      const reply = await attempt(() => audit.batch([step]));
      run.push({ step, decide: decide('execute', step as unknown as Record<string, unknown>).allow, took: !('failed' in reply), failed: 'failed' in reply ? reply.failed.slice(0, 200) : undefined });
    }
    const after = await appState(audit, PLA_04);
    const result = { before: pick(before), run, after: pick(after), log: logs };
    await finish(audit, `normteile-policy/library-${name}`, result);
    return result;
  } finally {
    warn.mockRestore();
    await audit.close();
  }
}

const KEY = 'io.github.manuelstaggl.partbuddy.standard-parts';
const routes: [string, (nut: string) => Step[]][] = [
  ['move-bodies', () => [{ command: 'component.move_bodies', params: { bodies: ['Deckel'], component: 'Nut' } }]],
  ['copy-bodies', () => [{ command: 'component.copy_bodies', params: { bodies: ['Deckel'], component: 'Nut' } }]],
  ['activate-box', () => [{ command: 'component.activate', params: { component: 'Nut' } }, { command: 'solid.box', params: { length: '40 mm', width: '30 mm', height: '0.3 mm', corner: [0, 0, 50], operation: 'new', body_name: 'Sneak', name: 'Sneak' } }]],
  ['combine-join', (nut) => [{ command: 'solid.box', params: { length: '30 mm', width: '30 mm', height: '0.3 mm', corner: [65, -15, 1], operation: 'new', body_name: 'Klotz', name: 'Klotz' } }, { command: 'solid.combine', params: { target: nut, tools: ['Klotz'], operation: 'join' } }]],
  ['box-join', (nut) => [{ command: 'solid.box', params: { length: '30 mm', width: '30 mm', height: '0.3 mm', corner: [65, -15, 1], operation: 'join', targets: [nut], name: 'Flansch' } }]],
  ['rename-into-key', (nut) => [{ command: 'document.metadata.set', params: { values: { [KEY]: { bodies: ['SHCS M3x12'] } } } }, { command: 'body.rename', params: { body: nut, name: 'Old nut' } }, { command: 'body.rename', params: { body: 'Deckel', name: 'SHCS M3x12' } }]],
  ['description', () => [{ command: 'component.from_bodies', params: { bodies: ['Deckel'] } }, { command: 'Component.Metadata.Set', params: { component: 'Deckel', description: 'Hex nut M3' } }]],
  ['other-size', () => [{ command: 'component.metadata.set', params: { component: 'Nut', description: 'Hex nut M4' } }]],
  // The nut's own body removed and the lid put in its place: one body in a library component.
  ['remove-and-move', (nut) => [{ command: 'solid.remove', params: { bodies: [nut] } }, { command: 'component.move_bodies', params: { bodies: ['Deckel'], component: 'Nut' } }]],
  // A description SolidCraft does not build that way (a washer has no length), beside the real nut, which stays a standard part.
  // A ring with the volume, area and counts of the M3 washer but other radii and height (second review, point 3).
  ['ring', () => [
    { command: 'solid.cylinder', params: { radius: 4.025086206896552, height: 1, base: [0, 80, 0], operation: 'new', body_name: 'Ring', name: 'Ring' } },
    { command: 'solid.hole', params: { position: [0, 80, 1], diameter: 2 * 3.3699137931034486 } },
    { command: 'component.from_bodies', params: { bodies: ['Ring'] } },
    { command: 'component.metadata.set', params: { component: 'Ring', description: 'Plain washer M3' } },
    { command: 'parts.insert', params: { family: 'washer', size: 'M3', point: [0, 120, 0] } },
    { command: 'inspect.measure', params: { bodies: ['Ring'] } },
  ]],
  ['washer-length', () => [{ command: 'component.from_bodies', params: { bodies: ['Deckel'] } }, { command: 'component.metadata.set', params: { component: 'Deckel', description: 'Plain washer M3x8' } }]],
];

// Review points 2 and 3: whatever is put into, joined onto or named like a library part stays printed.
for (const [name, steps] of routes) {
  test(`a printed lid stays in print check and export: ${name}`, async () => {
    const result = await route(name, steps);
    expect(result.before.standardParts.length).toBe(1);
    // Since PR #353 a 0.3 mm lid lying flat is a floor of 1.5 layers: warn, not block. It must still be found.
    expect(result.after.findings).toContain('thinWall');
    expect(result.after.standardParts.some((body) => /Deckel|SHCS|Sneak|Ring/.test(body))).toBe(false);
  }, 120_000);
}

// Every size of every family, and lengths off the list, is still told as a standard part.
test('every size of every family is a standard part', async () => {
  const audit = await openAudit('normteile-policy/library-sizes');
  const logs: string[] = [];
  try {
    const [library] = (await audit.batch([{ command: 'parts.library', params: {} }])) as [{ families: { family: string; lengths?: number[] | null; sizes: { size: string }[] }[] }];
    let inserted = 0;
    for (const family of library.families) {
      for (const size of family.sizes) {
        const lengths: (number | undefined)[] = [undefined];
        if (family.lengths && family.lengths.length > 0 && size === family.sizes[0]) lengths.push(7.5, 31.75, 38.1, family.lengths[family.lengths.length - 1]);
        for (const length of lengths) {
          inserted += 1;
          await audit.batch([{ command: 'parts.insert', params: { family: family.family, size: size.size, ...(length ? { length } : {}), point: [inserted * 40, 0, 0], ...(inserted % 3 === 0 ? { direction: [1, 2, 3] } : {}) } }]);
        }
      }
    }
    const [listing] = await audit.batch([{ command: 'component.list', params: {} }]);
    // As the app's mirror asks: without waiting; `built` is where the app mirrors once more.
    let builtCalls = 0;
    const quiet: string[] = [];
    const store = cliReferences({ cli: () => CLI, dir: audit.dir, log: (message) => void logs.push(message), built: () => (builtCalls += 1) });
    const mirrorStart = performance.now();
    const atOnceTold = await boughtParts(requesterOf(audit), listing, { log: (message) => void quiet.push(message), references: store.known });
    const atOnce = atOnceTold.bought;
    const pendingAtOnce = atOnceTold.pending.length;
    const mirrorMs = performance.now() - mirrorStart;
    const started = performance.now();
    const { bought } = await boughtParts(requesterOf(audit), listing, { log: (message) => void logs.push(message), references: store.ready });
    const firstMs = performance.now() - started;
    const again = performance.now();
    // A new store, as after a restart: the references come from the file.
    const { bought: second } = await boughtParts(requesterOf(audit), listing, checksOf(audit, logs));
    const result = { families: library.families.length, inserted, atOnce: atOnce.length, pendingAtOnce, mirrorMs, builtCalls, bought: bought.length, firstMs, secondMs: performance.now() - again, second: second.length, log: logs, hardware: hardwareOf(bought, listing).length };
    await finish(audit, 'normteile-policy/library-sizes', result);
    expect(bought.length).toBe(inserted);
  } finally {
    await audit.close();
  }
}, 280_000);

// Review point 4: the list of parts to buy against what the assistant can write into the BOM.
test('the parts to buy do not follow part number or BOM type', async () => {
  const audit = await openAudit('normteile-policy/library-bom');
  const logs: string[] = [];
  try {
    await audit.batch([
      { command: 'solid.box', params: { length: '40 mm', width: '30 mm', height: '0.3 mm', corner: [0, 0, 30], operation: 'new', body_name: 'Deckel', name: 'Deckel' } },
      { command: 'component.from_bodies', params: { bodies: ['Deckel'] } },
      { command: 'parts.insert', params: { family: 'hex_nut', size: 'M3', point: [80, 0, 0], name: 'Nut' } },
      { command: 'component.create', params: { name: 'Sub' } },
      { command: 'parts.insert', params: { family: 'washer', size: 'M3', point: [0, 80, 0], name: 'Washer' } },
      { command: 'component.activate', params: { component: 0 } },
    ]);
    const [first] = (await audit.batch([{ command: 'component.list', params: {} }])) as [{ components: { name: string; occurrences: { id: number }[] }[] }];
    await audit.batch([{ command: 'occurrence.copy', params: { occurrence: first.components.find((entry) => entry.name === 'Sub')!.occurrences[0]!.id, translate: [0, 0, 50] } }]);
    const read = async () => {
      const [bom, listing] = await audit.batch([{ command: 'assembly.bom', params: {} }, { command: 'component.list', params: {} }]);
      return {
        bomRows: (bom as { rows: Record<string, unknown>[] }).rows.map((row) => [row.count, row.part_number, row.description, row.components]),
        hardware: hardwareOf((await boughtParts(requesterOf(audit), listing, checksOf(audit, logs))).bought, listing),
      };
    };
    const plain = await read();
    await audit.batch([{ command: 'component.metadata.set', params: { component: 'Deckel', part_number: 'ISO 4032 M3' } }]);
    const samePartNumber = await read();
    await audit.batch([{ command: 'component.metadata.set', params: { component: 'Nut', bom_type: 'reference' } }]);
    const reference = await read();
    await audit.batch([{ command: 'component.metadata.set', params: { component: 'Nut', bom_type: '', part_number: '' } }]);
    const noPartNumber = await read();
    const result = { plain, samePartNumber, reference, noPartNumber, log: logs };
    await finish(audit, 'normteile-policy/library-bom', result);
    const wanted = [{ count: 1, name: 'Hex nut M3', standard: 'ISO 4032 M3' }, { count: 2, name: 'Plain washer M3', standard: 'ISO 7089 M3' }];
    for (const state of [plain, samePartNumber, reference, noPartNumber]) expect(state.hardware).toEqual(wanted);
  } finally {
    await audit.close();
  }
}, 120_000);
