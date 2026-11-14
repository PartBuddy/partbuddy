import { minimumWall } from '../../../packages/geometry/src/printCheck';
import { brief, PLA_04, scene, stored, writeResult, type Scene } from '../druckpruefung-helpers';
import { openAudit, overhang, type Step } from '../harness';

// Findings D1 (=MG-03), D2 (=MG-02), D3, D4, D6, MG-01, MG-04, G1 of the full audit against checkPrint
// (packages/geometry/src/printCheck.ts), bodies built by SolidCraft 0.40.0-rc.4, profile bed 256³, nozzle 0.4, 45°.
const box = (name: string, size: [number, number, number], corner: [number, number, number] = [0, 0, 0], operation = 'new', extra: Record<string, unknown> = {}): Step => ({
  command: 'solid.box',
  params: { length: size[0], width: size[1], height: size[2], corner, operation, ...(operation === 'new' ? { body_name: name } : {}), name, ...extra },
});
/** A prism along −Y: the outline in X (right) and Z (up), `length` deep. */
const prism = (name: string, outline: [number, number][], length: number): Step[] => [
  { command: 'sketch.create', params: { plane: { origin: [0, 0, 0], x_dir: [1, 0, 0], y_dir: [0, 0, 1] }, project_edges: false, name: `${name} outline` } },
  { command: 'sketch.line', params: { points: outline, closed: true } },
  { command: 'sketch.finish', params: {} },
  { command: 'solid.extrude', params: { sketch: `${name} outline`, distance: length, operation: 'new', body_name: name, name } },
];

test('print check: findings D1, D2, D3, D4, D6, MG-01, MG-04, G1', async () => {
  const audit = await openAudit('druckpruefung/befunde');
  const results: Record<string, unknown> = { profile: PLA_04, minimumWall: minimumWall(0.4) };
  const run = async (id: string, input: string, steps: Step[], more?: (s: Scene) => unknown) => {
    try {
      const s = await scene(audit, id, input, steps);
      results[id] = { ...stored(s), ...(more ? { extra: more(s) } : {}) };
    } catch (error) {
      results[id] = { id, input, error: String(error instanceof Error ? error.message : error) };
    }
  };
  try {
    // D2 / MG-02: a bar that fits the bed only diagonally.
    await run('d2-stab-300x10x5', 'Quader 300 × 10 × 5 mm', [box('Stab', [300, 10, 5])]);
    await run('mg02-stab-300x20x10', 'Quader 300 × 20 × 10 mm', [box('Stab', [300, 20, 10])]);
    await run('d2-kontrolle-256x10x5', 'Quader 256 × 10 × 5 mm (passt gerade)', [box('Stab', [256, 10, 5])]);
    await run('d2-kontrolle-370x10x5', 'Quader 370 × 10 × 5 mm (passt in keiner Lage, Diagonale 362 mm)', [box('Stab', [370, 10, 5])]);

    // D1 / MG-03: bodies that each fit, designed far apart.
    await run('d1-zwei-wuerfel-300-auseinander', 'zwei Würfel 20 mm bei x = 0 und x = 300', [box('A', [20, 20, 20]), box('B', [20, 20, 20], [300, 0, 0])]);
    await run('mg03-zwei-platten-200', 'zwei Platten 200 × 200 × 3 mm, 100 mm Abstand in X', [box('A', [200, 200, 3]), box('B', [200, 200, 3], [300, 0, 0])]);

    // D3: one body with a large footprint hides one standing on a point.
    const sphere: Step = { command: 'solid.sphere', params: { diameter: 20, center: [50, 10, 10], operation: 'new', body_name: 'Kugel', name: 'Kugel' } };
    const tip: Step = { command: 'solid.cone', params: { diameter: 1, top_diameter: 20, height: 20, base: [90, 10, 0], operation: 'new', body_name: 'Kegel', name: 'Kegel' } };
    await run('d3-wuerfel-plus-kugel', 'Würfel 20 mm und Kugel Ø 20 mm daneben', [box('Wuerfel', [20, 20, 20]), sphere]);
    await run('d3-wuerfel-plus-kegel-auf-spitze', 'Würfel 20 mm und Kegel auf der Spitze (unten Ø 1 mm, oben Ø 20 mm, 20 hoch)', [box('Wuerfel', [20, 20, 20]), tip]);
    await run('d3-kontrolle-kugel-allein', 'Kugel Ø 20 mm allein', [sphere]);
    await run('d3-kontrolle-kegel-allein', 'Kegel auf der Spitze allein', [tip]);

    // D4: floors (thickness along Z) against walls (thickness across).
    for (const t of [0.2, 0.3, 0.4, 0.6, 0.8, 1]) await run(`d4-boden-${String(t)}`, `Platte 30 × 30 × ${String(t)} mm flach auf dem Bett`, [box('Boden', [30, 30, t])]);
    for (const t of [0.3, 0.6]) await run(`d4-wand-${String(t)}`, `Wand 30 × ${String(t)} × 20 mm stehend`, [box('Wand', [30, t, 20])]);
    await run('d4-dose-boden-0.3-wand-0.3', 'Dose 30 × 30 × 20 mm, Boden 0,3 mm, Wand 0,3 mm, oben offen', [box('Dose', [30, 30, 20]), box('Hohlraum', [29.4, 29.4, 19.7], [0.3, 0.3, 0.3], 'cut', { targets: ['Dose'] })]);
    await run('d4-dose-boden-0.8-wand-1.35', 'Dose 30 × 30 × 20 mm, Boden 0,8 mm (4 Schichten à 0,2), Wand 1,35 mm (3 Linien), oben offen', [box('Dose', [30, 30, 20]), box('Hohlraum', [27.3, 27.3, 19.2], [1.35, 1.35, 0.8], 'cut', { targets: ['Dose'] })]);

    // D6: a wall that tapers from 2.5 mm to 0.2 mm over 20 mm height, 30 mm long.
    await run('d6-keil-unten-0.2-oben-2.5', 'Wand 30 lang, 20 hoch, unten 0,2 mm, oben 2,5 mm dick (eine Seite senkrecht)', prism('Keil', [[0, 0], [0.2, 0], [2.5, 20], [0, 20]], 30));
    await run('d6-keil-unten-2.5-oben-0.2', 'Wand 30 lang, 20 hoch, unten 2,5 mm, oben 0,2 mm dick (eine Seite senkrecht)', prism('Keil', [[0, 0], [2.5, 0], [0.2, 20], [0, 20]], 30));
    await run('d6-keil-symmetrisch-2.5-auf-0.2', 'Wand 30 lang, 20 hoch, unten 2,5 mm, oben 0,2 mm, beide Seiten geneigt', prism('Keil', [[0, 0], [2.5, 0], [1.35, 20], [1.15, 20]], 30));
    await run('d6-kontrolle-wand-0.2-gleichmaessig', 'Wand 30 × 0,2 × 20 mm, überall 0,2 mm', [box('Wand', [30, 0.2, 20])]);

    // MG-01: ceilings and bridges whose corners all lie on walls.
    const table = (s: Scene) => s.measured.map((body) => ({ body: body.name, reach0: overhang(body, PLA_04, 0), reach1_8: overhang(body, PLA_04, 1.8) }));
    await run('mg01-kasten-decke-40x40', 'Hohlkasten 44 × 44 × 30 mm, unten offen, Wand 2, Decke 2 mm: Decke 40 × 40 mm frei', [box('Kasten', [44, 44, 30]), box('Hohlraum', [40, 40, 28], [2, 2, 0], 'cut', { targets: ['Kasten'] })], table);
    await run('mg01-bruecke-40', 'Brücke: zwei Wände 2 × 20 × 20 mm im Abstand 40 mm, Platte 44 × 20 × 2 mm darüber', [box('Bruecke', [44, 20, 22]), box('Durchgang', [40, 20, 20], [2, 0, 0], 'cut', { targets: ['Bruecke'] })], table);
    await run('mg01-kasten-decke-100x100', 'Hohlkasten 104 × 104 × 30 mm, unten offen, Decke 100 × 100 mm frei', [box('Kasten', [104, 104, 30]), box('Hohlraum', [100, 100, 28], [2, 2, 0], 'cut', { targets: ['Kasten'] })], table);
    await run('mg01-kontrolle-kragarm-40', 'Kragarm: Wand 2 × 20 × 22 mm, Platte 40 mm auskragend, 2 mm dick', [box('Arm', [42, 20, 22]), box('Luft', [40, 20, 20], [2, 0, 0], 'cut', { targets: ['Arm'] })], table);
    await run('mg01-kontrolle-bruecke-3', 'Brücke 3 mm Spannweite (zwei Wände 2 mm, Platte 7 × 20 × 2 mm)', [box('Bruecke', [7, 20, 22]), box('Durchgang', [3, 20, 20], [2, 0, 0], 'cut', { targets: ['Bruecke'] })], table);

    // MG-04: exactly the minimum of two lines.
    for (const t of [0.89, 0.9, 0.91, 1]) {
      await run(`mg04-platte-${String(t)}`, `Platte 20 × 20 × ${String(t)} mm`, [box('Platte', [20, 20, t])]);
      await run(`mg04-wand-${String(t)}`, `Wand 20 × ${String(t)} × 20 mm stehend`, [box('Wand', [20, t, 20])]);
    }

    // G1: a lid designed at the height where it closes the box; the check puts it on a bed of its own.
    await run('g1-dose-und-deckel-auf-27', 'Dose 40 × 30 × 30 mm, daneben Deckelplatte 40 × 30 × 3 mm auf z = 27…30', [box('Dose', [40, 30, 30]), box('Deckel', [40, 30, 3], [44, 0, 27])], (s) => {
      const lid = s.measured.find((body) => body.name === 'Deckel')!;
      return { lidLowestZ: lid.metrics.bbox.min[2], lidOnOwnBed: overhang(lid, PLA_04, 1.8) };
    });
    // The same two boxes as one body: there the lid starts 27 mm above the bed both share.
    await run('g1-kontrolle-ein-koerper', 'dieselben zwei Quader als EIN Körper (join, touching one_body): Deckel beginnt 27 mm über dem Bett', [box('Dose', [40, 30, 30]), box('Deckel', [40, 30, 3], [44, 0, 27], 'join', { targets: ['Dose'], touching: 'one_body' })]);
    // The hinge tool on the same scene: what it says about the bed.
    try {
      await audit.tool('new_design', {});
      await audit.batch([box('Dose', [40, 30, 30]), box('Deckel', [40, 30, 3], [44, 0, 27])]);
      const hinge = await audit.tool('partbuddy_mechanism', { kind: 'hinge', fixed: 'Dose', moving: 'Deckel', from: [42, 0, 28.5], to: [42, 30, 28.5] });
      const { bodies, check } = await audit.measure();
      results['g1-scharnier-dose-deckel'] = {
        input: 'partbuddy_mechanism hinge zwischen Dose und Deckel, Linie [42,0,28.5]–[42,30,28.5]',
        tool: hinge,
        check: brief(check(PLA_04)),
        bodies: bodies.map((body) => ({ name: body.name, lowestZ: body.metrics.bbox.min[2], ownBed: overhang(body, PLA_04, 1.8) })),
      };
    } catch (error) {
      results['g1-scharnier-dose-deckel'] = { error: String(error instanceof Error ? error.message : error) };
    }
  } finally {
    writeResult(audit.dir, results);
    await audit.close();
  }
  expect(Object.keys(results).length).toBeGreaterThan(40);
});
