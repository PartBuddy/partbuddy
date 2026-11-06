#!/usr/bin/env node
// Takes the website pictures from the running app (apps/desktop/e2e/site-shots.spec.ts).
// Usage: pnpm site:shots [output-folder]   (default: the website's src/assets/shots beside this repo)
// Needs SolidCraft installed; the app window opens on the leftmost display without focus.
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(process.argv[2] ?? join(repo, '..', 'partbuddy-web', 'src', 'assets', 'shots'));
const desktop = join(repo, 'apps', 'desktop');
const run = (args) => execFileSync('pnpm', args, { cwd: desktop, stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, PARTBUDDY_SITE_SHOTS: out, PARTBUDDY_WINDOW_DISPLAY: 'leftmost' } });

run(['build']);
run(['exec', 'playwright', 'test', 'e2e/site-shots.spec.ts']);
console.log(`Pictures in ${out}`);
