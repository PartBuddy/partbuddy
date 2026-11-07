#!/usr/bin/env node
// Third-party notices of the desktop app (ADR 0007): every production dependency the app bundles,
// with its version, licence, home page and the licence and notice files it ships. MIT, BSD, ISC and
// Apache-2.0 ask for these texts in every copy, and the bundler strips them from the code.
// electron-builder runs this before packing (beforePack in electron-builder.yml), so the installer,
// `pnpm dist:dir` and the test version all carry resources/THIRD-PARTY-NOTICES.txt.
// By hand: `node tools/licenses/notices.mjs` writes apps/desktop/out/THIRD-PARTY-NOTICES.txt.

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'desktop');
/** Licence and notice files as packages name them: LICENSE, LICENCE.md, COPYING, NOTICE, … */
const LICENCE_FILE = /^(licen[cs]e|copying|notice)([-._].*)?$/i;

function pnpm(args, cwd) {
  const options = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, cwd };
  const path = process.env.npm_execpath;
  if (path && /\.[cm]?js$/.test(path)) return execFileSync(process.execPath, [path, ...args], options);
  if (path && /pnpm/i.test(path)) return execFileSync(path, args, options);
  return execSync(`pnpm ${args.join(' ')}`, options);
}

/** The licence and notice texts in a package folder, in a stable order. */
function licenceTexts(folder) {
  if (!existsSync(folder)) return [];
  return readdirSync(folder, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENCE_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .map((name) => readFileSync(join(folder, name), 'utf8').trim());
}

/** The notices as text; `report` is the JSON of `pnpm licenses list --prod --json`. */
export function noticesText(report, extra = []) {
  const entries = Object.entries(report)
    .flatMap(([license, list]) => list.map((entry) => ({ ...entry, license })))
    .filter((entry) => !entry.name.startsWith('@partbuddy/'))
    .sort((a, b) => a.name.localeCompare(b.name));
  const rule = '-'.repeat(78);
  const parts = [
    'PartBuddy – third-party notices',
    '',
    'PartBuddy is free software under GPL-3.0-or-later. It bundles the following libraries, each',
    'under its own licence. Their licence and notice texts follow as each package ships them.',
    '',
  ];
  for (const entry of entries) {
    const versions = (entry.versions ?? [entry.version]).filter(Boolean).join(', ');
    const texts = [...new Set((entry.paths ?? []).flatMap(licenceTexts))];
    parts.push(rule, `${entry.name} ${versions}`, `Licence: ${entry.license}${entry.homepage ? `\nHome: ${entry.homepage}` : ''}`, '');
    parts.push(...(texts.length > 0 ? texts.flatMap((text) => [text, '']) : [`The package ships no licence file; it is published under ${entry.license}.`, '']));
  }
  for (const { title, text } of extra) parts.push(rule, title, '', text.trim(), '');
  return `${parts.join('\n').trimEnd()}\n`;
}

/** Writes the notices into apps/desktop/out, where electron-builder takes them (extraResources). */
export function writeNotices() {
  const report = JSON.parse(pnpm(['licenses', 'list', '--prod', '--json'], desktop).trim() || '{}');
  const zoo = join(desktop, 'src', 'renderer', 'src', 'ui', 'zooIcons.LICENSE');
  const extra = [{ title: 'CAD operation icons from Zoo Design Studio (path data in the app)', text: readFileSync(zoo, 'utf8') }];
  const target = join(desktop, 'out', 'THIRD-PARTY-NOTICES.txt');
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, noticesText(report, extra));
  return target;
}

/** electron-builder's beforePack hook. */
export default async function beforePack() {
  const target = writeNotices();
  console.log(`  • third-party notices  file=${target}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(writeNotices());
