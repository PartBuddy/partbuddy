import { clearanceOf } from '../../../apps/desktop/src/main/solidcraft/actions';
import { withClearance } from '../../../packages/geometry/src/printCheck';
import { brief, checkPrint, PLA_04, quadBody, scene, stored, writeResult, type Point, type Scene } from '../druckpruefung-helpers';
import { openAudit, type Step } from '../harness';

// Phase 4, point 5 of the full audit: bodies with a fault must each be reported by the print check, five clean
// bodies must report nothing. SolidCraft 0.40.0-rc.4, profile bed 256³, nozzle 0.4, 45°; PLA push fit 0.15 mm.
const PUSH_FIT = 0.15;
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
const r3 = (value: number) => Math.round(value * 1e3) / 1e3;

test('print check: faulty bodies are reported, clean bodies are not', async () => {
  const audit = await openAudit('druckpruefung/gegenprobe');
  const results: Record<string, unknown> = { profile: PLA_04, pushFit: PUSH_FIT };
  const run = async (id: string, input: string, steps: Step[], more?: (s: Scene) => unknown) => {
    try {
      const s = await scene(audit, id, input, steps);
      results[id] = { ...stored(s), ...(more ? { extra: await more(s) } : {}) };
    } catch (error) {
      results[id] = { id, input, error: String(error instanceof Error ? error.message : error) };
    }
  };
  /** The check as the app completes it for several bodies: SolidCraft's inspect.clearance through withClearance. */
  const withMeasure = async (s: Scene) => {
    const [raw] = await audit.batch([{ command: 'inspect.clearance', params: { bodies: s.measured.map((body) => body.name), clearance: PUSH_FIT } }]);
    return { clearance: raw, withClearance: brief(withClearance(s.rawCheck, clearanceOf(raw), PUSH_FIT)) };
  };
  try {
    // --- Faulty: each must be reported. ---
    await run('fehler-wand-0.3', 'Dose 30 × 30 × 20 mm, Boden 1 mm, Wand 0,3 mm (zu dünn), oben offen', [box('Dose', [30, 30, 20]), box('Hohlraum', [29.4, 29.4, 19], [0.3, 0.3, 1], 'cut', { targets: ['Dose'] })]);
    await run('fehler-wand-0.6', 'Dose 30 × 30 × 20 mm, Boden 1 mm, Wand 0,6 mm (unter zwei Linien), oben offen', [box('Dose', [30, 30, 20]), box('Hohlraum', [28.8, 28.8, 19], [0.6, 0.6, 1], 'cut', { targets: ['Dose'] })]);

    // An overhanging face of 20 mm × 10 mm/cos(a), leaning `a` degrees from the vertical.
    for (const angle of [44, 45, 46, 47, 50, 60]) {
      const run10 = r3(10 * Math.tan((angle * Math.PI) / 180));
      await run(`fehler-ueberhang-${String(angle)}`, `Prisma 20 tief, 10 hoch, Fuß 10 breit, eine Seite ${String(angle)}° aus der Senkrechten (Fläche ${String(r3(200 / Math.cos((angle * Math.PI) / 180)))} mm²)`, prism('Schraege', [[0, 0], [10, 0], [10 + run10, 10], [0, 10]], 20));
    }

    // Floating: a body that starts above the bed.
    await run('fehler-schwebend-eigener-koerper', 'Würfel 20 mm auf dem Bett und zweiter Würfel 20 mm daneben auf z = 10…30 (schwebt 10 mm)', [box('Unten', [20, 20, 20]), box('Schwebt', [20, 20, 20], [30, 0, 10])]);
    await run('fehler-schwebend-allein', 'ein Würfel 20 mm auf z = 10…30, nichts darunter', [box('Schwebt', [20, 20, 20], [0, 0, 10])]);
    await run('fehler-schwebend-im-selben-koerper', 'ein Körper aus zwei Stücken: Würfel 20 mm auf dem Bett, Würfel 20 mm daneben auf z = 10…30 (join, touching one_body)', [box('Teil', [20, 20, 20]), box('Schwebt', [20, 20, 20], [30, 0, 10], 'join', { targets: ['Teil'], touching: 'one_body' })]);

    // Open: a box whose top face is taken out (a surface body), by SolidCraft.
    await run('fehler-offen-solidcraft-unstitch', 'Würfel 20 mm, alle Flächen gelöst (surface.unstitch): sechs Flächenkörper', [box('Offen', [20, 20, 20]), { command: 'surface.unstitch', params: { body: 'Offen' } }]);
    await run('fehler-offen-solidcraft-flaeche-weg', 'Würfel 20 mm, Deckfläche gelöst (surface.unstitch faces [10,10,20])', [box('Offen', [20, 20, 20]), { command: 'surface.unstitch', params: { body: 'Offen', faces: [[10, 10, 20]] } }]);
    await run('fehler-offen-solidcraft-rohr', 'Flächenkörper allein: Rechteck 20 × 20 mm als Fläche 20 mm hochgezogen (surface.extrude: vier Wände ohne Boden und Deckel)', [
      { command: 'sketch.create', params: { plane: 'XY', project_edges: false, name: 'Rand' } },
      { command: 'sketch.line', params: { points: [[0, 0], [20, 0], [20, 20], [0, 20]], closed: true } },
      { command: 'sketch.finish', params: {} },
      { command: 'surface.extrude', params: { sketch: 'Rand', distance: 20, body_name: 'Rohr', name: 'Rohr' } },
    ]);
    // The same as a mesh handed to checkPrint directly: five quads, the top missing.
    const p: Point[] = [[0, 0, 0], [20, 0, 0], [20, 20, 0], [0, 20, 0], [0, 0, 20], [20, 0, 20], [20, 20, 20], [0, 20, 20]];
    const open = quadBody('Offen', p, [
      { name: 'F1:-z', corners: [0, 3, 2, 1], normal: [0, 0, -1] },
      { name: 'F1:-y', corners: [0, 1, 5, 4], normal: [0, -1, 0] },
      { name: 'F1:+x', corners: [1, 2, 6, 5], normal: [1, 0, 0] },
      { name: 'F1:+y', corners: [2, 3, 7, 6], normal: [0, 1, 0] },
      { name: 'F1:-x', corners: [3, 0, 4, 7], normal: [-1, 0, 0] },
    ]);
    results['fehler-offen-netz'] = { input: 'Netz direkt: Würfel 20 mm aus fünf Flächen, Deckfläche fehlt', openEdges: open.openEdges, check: brief(checkPrint([open], PLA_04)) };

    // Bodies that run into each other.
    await run('fehler-durchdringung-10', 'zwei Würfel 20 mm, der zweite um 10 mm in X versetzt (gemeinsames Volumen 4000 mm³)', [box('A', [20, 20, 20]), box('B', [20, 20, 20], [10, 0, 0])], withMeasure);
    await run('fehler-durchdringung-innen', 'Würfel 30 mm und Würfel 10 mm ganz darin (bei [10,10,10])', [box('A', [30, 30, 30]), box('B', [10, 10, 10], [10, 10, 10])], withMeasure);
    await run('fehler-durchdringung-kreuz', 'zwei Stäbe 60 × 10 × 10 mm über Kreuz, kein Eckpunkt des einen im anderen', [box('A', [60, 10, 10], [0, 25, 0]), box('B', [10, 60, 10], [25, 0, 0])], withMeasure);
    await run('fehler-beruehrung-kreuz-gestapelt', 'zwei Stäbe 60 × 10 × 10 mm über Kreuz aufeinander (B liegt auf A, Berührfläche 100 mm²)', [box('A', [60, 10, 10], [0, 25, 0]), box('B', [10, 60, 10], [25, 0, 10])], withMeasure);
    await run('kontrolle-zwei-wuerfel-getrennt', 'zwei Würfel 20 mm mit 10 mm Abstand', [box('A', [20, 20, 20]), box('B', [20, 20, 20], [30, 0, 0])], withMeasure);

    // --- Clean: none may be reported. ---
    await run('gut-wuerfel', 'Würfel 20 mm', [box('Wuerfel', [20, 20, 20])]);
    await run('gut-dose', 'Dose 40 × 30 × 20 mm, Wand und Boden 2 mm, oben offen (solid.shell)', [box('Dose', [40, 30, 20]), { command: 'solid.shell', params: { faces: [[20, 15, 20]], thickness: 2, body: 'Dose' } }]);
    await run('gut-winkel-45-fase', 'Winkel: Fuß 40 × 20 × 4, Schenkel 4 × 20 × 30, Kopf 14 × 20 × 10 oben, dessen Unterkante mit 10 mm × 45° gefast', [
      box('Winkel', [40, 20, 4]),
      box('Schenkel', [4, 20, 26], [0, 0, 4], 'join', { targets: ['Winkel'] }),
      box('Kopf', [10, 20, 10], [4, 0, 20], 'join', { targets: ['Winkel'] }),
      { command: 'solid.chamfer', params: { edges: [[14, 10, 20]], distance: 10, body: 'Winkel', name: 'Fase 45' } },
    ]);
    await run('gut-zylinder-stehend', 'Zylinder Ø 20 × 30 mm stehend', [{ command: 'solid.cylinder', params: { diameter: 20, height: 30, base: [10, 10, 0], operation: 'new', body_name: 'Zylinder', name: 'Zylinder' } }]);
    await run('gut-platte-mit-loch', 'Platte 40 × 40 × 4 mm mit Durchgangsloch Ø 10 mm in der Mitte', [box('Platte', [40, 40, 4]), { command: 'solid.hole', params: { position: [20, 20, 4], diameter: 10 } }]);
  } finally {
    writeResult(audit.dir, results);
    await audit.close();
  }
  expect(Object.keys(results).length).toBeGreaterThan(20);
});
