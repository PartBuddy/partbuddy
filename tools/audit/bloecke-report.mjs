// Prints the measured values of the block cases from tools/audit/out/bloecke/*/result.json.
// Run after the cases: node tools/audit/bloecke-report.mjs [case...]
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const out = join(import.meta.dirname, 'out', 'bloecke');
const read = (name) => JSON.parse(readFileSync(join(out, name, 'result.json'), 'utf8'));
const r3 = (value) => Math.round(value * 1e3) / 1e3;
const span = (face, axis) => r3(face.max[axis] - face.min[axis]);
const short = (text, n = 200) => (text.length > n ? `${text.slice(0, n)}…` : text);
const wanted = process.argv.slice(2);
const want = (name) => wanted.length === 0 || wanted.includes(name);

function featureRows(name) {
  const result = read(`sizes-${name}`);
  console.log(`\n== sizes-${name}  printCheck: ${JSON.stringify(result.printCheck).slice(0, 400)}`);
  result.steps.forEach((step, i) => {
    console.log(`#${i + 2} ${JSON.stringify(step.args).slice(0, 150)}\n    -> ${step.reply.isError ? 'ERROR ' : ''}${short(step.reply.text)}  removed ${JSON.stringify(step.removed_mm3)}`);
  });
  for (const body of result.bodies) {
    console.log(`  body ${body.name}: closed ${body.closed}, shells ${body.shells}, volume ${r3(body.volume_mm3)}, bbox ${JSON.stringify(body.bbox)}`);
    for (const c of body.cylinders) if (!/:face:\d+$/.test(c.face)) console.log(`    cyl ${c.face} Ø ${c.diameter}`);
    for (const [feature, data] of Object.entries(body.features)) {
      for (const face of data.faces) console.log(`    ${face.face}  x ${span(face, 0)} y ${span(face, 1)} z ${face.min[2]}…${face.max[2]} (${span(face, 2)})${face.planeNormal ? ` n ${JSON.stringify(face.planeNormal.map(r3))}` : ''}`);
      if (data.numbered) console.log(`    ${feature} numbered faces ${data.numbered.count}: x ${span(data.numbered, 0)} y ${span(data.numbered, 1)} z ${data.numbered.min[2]}…${data.numbered.max[2]}`);
    }
  }
}

for (const name of ['screwhole-none', 'screwhole-cap', 'screwhole-countersunk', 'tappedhole', 'insertseat-boss', 'nuttrap', 'slot', 'text', 'lip', 'snapfit', 'keyhole', 'woodscrew', 'magnet', 'knob', 'screw-m2_5']) {
  if (want(name)) featureRows(name);
}
