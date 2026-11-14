// Prints the results of the mechanism scenes compactly: node tools/audit/mechanik-print.mjs [name-prefix]
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, 'out', 'mechanik');
const prefix = process.argv[2] ?? '';
const short = (value, n = 400) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text === undefined ? 'undefined' : text.length > n ? `${text.slice(0, n)}…` : text;
};
const down = (d) => `bedZ ${d.bedZ} bed ${d.bedArea} max ${d.maxAngle}° >35 ${d.over35} >40 ${d.over40} >45 ${d.over45} flat ${d.flat} span ${d.longestFlatSpan} | ${d.faces.slice(0, 5).map((f) => `${f.face}:${f.maxAngle}°/${f.over45}${f.flat > 0 ? `/flat ${f.flat} ${f.flatSpan.join('x')} z${f.flatZ}` : ''}`).join('; ')}`;
const check = (c) => `${c.status} ${c.findings.map((f) => `${f.kind}${f.thickness !== undefined ? ` ${f.thickness}<${f.minimum}` : ''}${f.area !== undefined ? ` area ${f.area}` : ''}${f.severity === 'block' ? ' BLOCK' : ''}${f.places ? ` [${f.places.map((p) => `${p.body}:${p.faces.slice(0, 4).join(',')}`).join(' | ')}]` : ''}${f.message ? ` ${short(f.message, 120)}` : ''}${f.feature ? ` (${f.feature})` : ''}`).join(' ;; ')}`;

function show(r, indent = '') {
  if (r.tool) console.log(`${indent}tool${r.tool.isError ? ' (ERROR)' : ''}: ${short(r.tool.text, 700)}`);
  if (r.bodies) console.log(`${indent}bodies ${r.bodyCount}: ${r.bodies.map((b) => `${b.name} V=${b.volume} closed=${b.closed} shells=${b.shells} z=${short([b.bbox?.min?.[2], b.bbox?.max?.[2]])}`).join(' | ')}`);
  if (r.smallestGap !== undefined) console.log(`${indent}gap ${short(r.smallestGap)} overlaps ${short(r.clearanceOverlaps, 200)} interference ${short(r.interference)}`);
  if (r.joints) console.log(`${indent}joints ${short(r.joints, 300)}`);
  for (const [name, d] of Object.entries(r.down ?? {})) {
    console.log(`${indent}down ${name} own: ${down(d.ownBed)}`);
    if (d.commonBed) console.log(`${indent}down ${name} common: ${down(d.commonBed)}`);
  }
  for (const [name, c] of Object.entries(r.check ?? {})) console.log(`${indent}check ${name}: ${check(c)}`);
  for (const [name, segs] of Object.entries(r.rays ?? {})) console.log(`${indent}ray ${name}: ${segs.map((s) => `${s.length}${s.inside.length ? `[${s.inside.join('+')}]` : '[gap]'}`).join(' ')}`);
  for (const call of r.refused ?? []) console.log(`${indent}refused ${short(call.args, 160)} -> ${call.isError ? 'ERROR' : 'BUILT'} unchanged=${call.unchanged}: ${short(call.text, 330)}`);
  for (const [key, value] of Object.entries(r)) {
    if (['tool', 'bodies', 'bodyCount', 'smallestGap', 'clearanceOverlaps', 'interference', 'joints', 'down', 'check', 'rays', 'refused', 'args'].includes(key)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && (value.bodies || value.tool || value.refused)) {
      console.log(`${indent}${key}:`);
      show(value, `${indent}  `);
    } else console.log(`${indent}${key}: ${short(value, Number(process.argv[3] ?? 600))}`);
  }
}

for (const name of readdirSync(root).filter((entry) => entry.startsWith(prefix)).sort()) {
  console.log(`\n=== ${name}`);
  show(JSON.parse(readFileSync(join(root, name, 'result.json'), 'utf8')));
}
