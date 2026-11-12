// Prints a result.json of the print-check cases in short lines: node tools/audit/druckpruefung-show.mjs befunde|gegenprobe
import { readFileSync } from 'node:fs';

const file = new URL(`./out/druckpruefung/${process.argv[2] ?? 'befunde'}/result.json`, import.meta.url);
for (const [id, v] of Object.entries(JSON.parse(readFileSync(file, 'utf8')))) {
  if (!v || typeof v !== 'object' || !('check' in v || 'error' in v)) {
    console.log(id, JSON.stringify(v));
    continue;
  }
  if (v.error) {
    console.log('!!', id, v.error);
    continue;
  }
  const bodies = (v.bodies ?? []).map((b) => `${b.name} V=${b.volumeMm3 ?? ''} tri=${b.triangles ?? ''} bed=${b.onBedMm2 ?? ''} sup=${b.supportMm2 ?? ''} bl=${b.borderlineMm2 ?? ''} closed=${b.closed}`);
  console.log(`## ${id} | ${bodies.join('; ')}`);
  console.log('   ', JSON.stringify(v.check));
  if (v.extra) console.log('    extra', JSON.stringify(v.extra).slice(0, 1200));
  if (v.tool) console.log('    tool', JSON.stringify(v.tool).slice(0, 1200));
}
