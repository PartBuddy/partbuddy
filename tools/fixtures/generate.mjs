#!/usr/bin/env node
// Builds the synthetic sample model with the SolidCraft CLI (headless) and writes the files
// the viewer pipeline consumes: a face-tagged 3MF, the face table from `model.faces` and a
// sketch with every curve type (`sketch.inspect` and its DXF).
// The model is designed from scratch for this repository and contains no user data.
//
// Also the bodies of holes.script.json and hinge.script.json for the print check (one tagged 3MF each, holes-<body>.3mf).
// Usage: node tools/fixtures/generate.mjs <output-directory> [path-to-solidcraft-cli]
// Requires SolidCraft (MIT OR Apache-2.0) installed locally; CI uses the committed outputs.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = 'cable-clip';
const BODY = 'CableClip';
const SKETCH = 'sketch-curves';
const HOLES = 'holes';
const HINGE = 'hinge';
const DEFAULT_CLI =
  process.platform === 'win32'
    ? 'C:\\Program Files\\SolidCraft\\solidcraft-cli.exe'
    : 'solidcraft-cli';

const [outArg, cliArg] = process.argv.slice(2);
if (!outArg) {
  console.error('Usage: node tools/fixtures/generate.mjs <output-directory> [path-to-solidcraft-cli]');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(outArg);
const cli = cliArg ?? DEFAULT_CLI;
mkdirSync(outDir, { recursive: true });

const script = JSON.parse(readFileSync(join(here, `${MODEL}.script.json`), 'utf8'));
const tagged3mf = join(outDir, `${MODEL}.3mf`);
script.commands.push(
  { command: 'model.faces', params: { body: BODY } },
  { command: 'file.export', params: { path: tagged3mf, format: '3mf-tagged', quality: 'fine' } },
);

const work = mkdtempSync(join(tmpdir(), 'partbuddy-fixture-'));
try {
  const scriptPath = join(work, 'script.json');
  const resultPath = join(work, 'result.json');
  writeFileSync(scriptPath, JSON.stringify(script));
  execFileSync(cli, ['run', scriptPath, '--results', '--param-check', 'strict', '--json-out', resultPath], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });

  const results = JSON.parse(readFileSync(resultPath, 'utf8'));
  const faces = results[results.length - 2];
  if (!faces || !Array.isArray(faces.faces)) {
    throw new Error('model.faces returned no face table');
  }

  const faceTable = tableOf(faces, MODEL, BODY, 'SolidCraft CLI, tools/fixtures/cable-clip.script.json');
  writeFileSync(join(outDir, `${MODEL}.faces.json`), `${JSON.stringify(faceTable, null, 2)}\n`);
  console.log(`Wrote ${MODEL}.3mf and ${MODEL}.faces.json (${faceTable.faces.length} faces) to ${outDir}`);

  // Holes for the print check (review of PR #365), and the print-in-place hinge of the mechanism tool (hingeSteps of
  // apps/desktop/src/shared/mechanisms.ts, audit G1): one body each, a tagged 3MF per body (flat, so Git LFS takes them) and their face tables.
  for (const set of [HOLES, HINGE]) {
    const script = JSON.parse(readFileSync(join(here, `${set}.script.json`), 'utf8'));
    const bodies = script.commands.filter((step) => step.params.operation === 'new').map((step) => step.params.body_name);
    for (const body of bodies) {
      script.commands.push(
        { command: 'model.faces', params: { body } },
        { command: 'file.export', params: { path: join(outDir, `${set}-${body}.3mf`), format: '3mf-tagged', bodies: [body], quality: 'standard' } },
      );
    }
    const scriptPath = join(work, `${set}.json`);
    const resultPath = join(work, `${set}-result.json`);
    writeFileSync(scriptPath, JSON.stringify(script));
    execFileSync(cli, ['run', scriptPath, '--results', '--param-check', 'strict', '--json-out', resultPath], { stdio: ['ignore', 'ignore', 'inherit'] });
    const found = JSON.parse(readFileSync(resultPath, 'utf8')).filter((result) => Array.isArray(result?.faces));
    const tables = Object.fromEntries(bodies.map((body, i) => [body, tableOf(found[i], set, body, `SolidCraft CLI, tools/fixtures/${set}.script.json`)]));
    writeFileSync(join(outDir, `${set}.faces.json`), `${JSON.stringify(tables, null, 2)}
`);
    console.log(`Wrote ${String(bodies.length)} bodies of ${set} to ${outDir}`);
  }

  // Sketch fixture (issue #21): one sketch with every curve type, as `sketch.inspect` returns it,
  // and SolidCraft's own DXF of it as the reference for the tessellation.
  const sketchScript = join(here, `${SKETCH}.script.json`);
  const sketchResult = join(work, 'sketch.json');
  execFileSync(cli, ['run', sketchScript, '--results', '--param-check', 'strict', '--json-out', sketchResult], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const sketchResults = JSON.parse(readFileSync(sketchResult, 'utf8'));
  const inspect = sketchResults[sketchResults.length - 2];
  const dxf = sketchResults[sketchResults.length - 1];
  if (!inspect || !Array.isArray(inspect.curves) || typeof dxf?.dxf !== 'string') {
    throw new Error('sketch.inspect or sketch.export_dxf returned nothing');
  }
  writeFileSync(join(outDir, `${SKETCH}.inspect.json`), `${JSON.stringify(inspect, null, 2)}\n`);
  writeFileSync(join(outDir, `${SKETCH}.dxf`), dxf.dxf);
  console.log(`Wrote ${SKETCH}.inspect.json and ${SKETCH}.dxf (${inspect.curves.length} curves) to ${outDir}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

/** `model.faces` of one body as the face table the viewer reads. */
function tableOf(faces, model, body, source) {
  return {
    model,
    body,
    units: 'mm',
    source,
    faces: faces.faces.map((face) => ({
      index: face.index,
      name: face.name,
      exact: face.exact,
      area: round(face.area),
      centroid: face.centroid.map(round),
      point: face.point.map(round),
      ...(face.plane_normal ? { planeNormal: face.plane_normal.map(round) } : {}),
      ...(face.cylinder
        ? {
            cylinder: {
              origin: face.cylinder.origin.map(round),
              axis: face.cylinder.axis.map(round),
              radius: round(face.cylinder.radius),
            },
          }
        : {}),
    })),
  };
}

function round(value) {
  return Math.round(value * 1e4) / 1e4;
}
