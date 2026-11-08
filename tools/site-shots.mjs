#!/usr/bin/env node
// Takes the website pictures from the running app (apps/desktop/e2e/site-shots.spec.ts).
// Usage: pnpm site:shots [--only clarify,view] [output-folder]   (default folder: src/assets/shots of
// the website partbuddy-web beside the main checkout, also when run from a worktree)
// --only takes just these pictures and the steps they build on: one picture in a minute or two
// instead of all of them in eight.
// Needs SolidCraft installed; the app window stays off screen, without focus or taskbar button,
// and opens no Explorer window (rule of 2026-11-04: test runs never disturb the person at the server).
import { execFileSync, execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const at = args.indexOf('--only');
const only = at >= 0 ? (args.splice(at, 2)[1] ?? '') : '';
if (at >= 0 && !only) throw new Error('--only needs picture names, e.g. --only clarify,view');

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The main checkout holds the shared .git folder; a worktree's own folder lies elsewhere.
const main = dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repo, encoding: 'utf8' }).trim());
const out = resolve(args[0] ?? join(main, '..', 'partbuddy-web', 'src', 'assets', 'shots'));
const desktop = join(repo, 'apps', 'desktop');
const env = { ...process.env, PARTBUDDY_SITE_SHOTS: out, PARTBUDDY_SITE_SHOTS_ONLY: only, PARTBUDDY_WINDOW_DISPLAY: 'offscreen' };
const run = (command) => execSync(command, { cwd: desktop, stdio: 'inherit', env });

run('pnpm build');
run('pnpm exec playwright test e2e/site-shots.spec.ts');
console.log(`Pictures in ${out}`);
