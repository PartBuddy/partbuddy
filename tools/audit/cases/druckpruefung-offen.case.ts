import { deriveEdges } from '../../../packages/geometry/src/index';
import { scene, writeResult } from '../druckpruefung-helpers';
import { openAudit, type Step } from '../harness';

// Review of PR 353: closed bodies with degenerate triangles (a sphere's poles, a cone's tip, a modelled
// thread) must not read as open shells.
test('print check: sphere, cone and modelled thread are closed', async () => {
  const audit = await openAudit('druckpruefung/offen');
  const results: Record<string, unknown> = {};
  const cube: Step = { command: 'solid.box', params: { length: 20, width: 20, height: 20, corner: [0, 0, 0], operation: 'new', body_name: 'Cube', name: 'Cube' } };
  const cases: [string, Step[]][] = [
    ['kugel', [{ command: 'solid.sphere', params: { diameter: 20, center: [10, 10, 10], operation: 'new', body_name: 'Kugel', name: 'Kugel' } }]],
    ['kegel-spitze', [{ command: 'solid.cone', params: { diameter: 20, top_diameter: 0, height: 20, base: [10, 10, 0], operation: 'new', body_name: 'Kegel', name: 'Kegel' } }]],
    ['gewinde-m5', [cube, { command: 'solid.hole', params: { position: [10, 10, 20], thread: 'M5', modeled: true, depth: '10 mm', targets: ['Cube'] } }]],
  ];
  try {
    for (const [id, steps] of cases) {
      try {
        const s = await scene(audit, id, id, steps);
        results[id] = {
          bodies: s.measured.map((body) => {
            const degenerate = Array.from({ length: body.mesh.indices.length / 3 }, (_, t) => [body.mesh.indices[t * 3], body.mesh.indices[t * 3 + 1], body.mesh.indices[t * 3 + 2]]).filter(([a, b, c]) => a === b || b === c || a === c).length;
            return { name: body.name, closed: body.solidcraft.closed, triangles: body.mesh.indices.length / 3, degenerate, openEdges: deriveEdges(body.mesh).openEdges, modelOpenEdges: body.model.openEdges };
          }),
          check: s.check,
        };
      } catch (error) {
        results[id] = { error: String(error instanceof Error ? error.message : error) };
      }
    }
  } finally {
    writeResult(audit.dir, results);
    await audit.close();
  }
});
