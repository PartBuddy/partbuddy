#!/usr/bin/env node
// Builds the synthetic sample model with the SolidCraft CLI (headless) and writes the files
// the viewer pipeline consumes: a face-tagged 3MF and the face table from `model.faces`.
// The model is designed from scratch for this repository and contains no user data.
//
// Usage: node tools/fixtures/generate.mjs <output-directory> [path-to-solidcraft-cli]
// Requires SolidCraft (MIT OR Apache-2.0) installed locally; CI uses the committed outputs.

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = 'cable-clip';
const BODY = 'CableClip';
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

  const faceTable = {
    model: MODEL,
    body: BODY,
    units: 'mm',
    source: 'SolidCraft CLI, tools/fixtures/cable-clip.script.json',
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
  writeFileSync(join(outDir, `${MODEL}.faces.json`), `${JSON.stringify(faceTable, null, 2)}\n`);
  console.log(`Wrote ${MODEL}.3mf and ${MODEL}.faces.json (${faceTable.faces.length} faces) to ${outDir}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

function round(value) {
  return Math.round(value * 1e4) / 1e4;
}
