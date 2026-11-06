#!/usr/bin/env node
// Takes the website pictures from the running app (apps/desktop/e2e/site-shots.spec.ts).
// Usage: pnpm site:shots [output-folder]   (default: src/assets/shots of the website partbuddy-web
// beside the main checkout, also when run from a worktree)
// Needs SolidCraft installed; the app window opens on the leftmost display without focus.
import { execFileSync, execSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// The main checkout holds the shared .git folder; a worktree's own folder lies elsewhere.
const main = dirname(execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: repo, encoding: 'utf8' }).trim());
const out = resolve(process.argv[2] ?? join(main, '..', 'partbuddy-web', 'src', 'assets', 'shots'));
const desktop = join(repo, 'apps', 'desktop');
const run = (command) => execSync(command, { cwd: desktop, stdio: 'inherit', env: { ...process.env, PARTBUDDY_SITE_SHOTS: out, PARTBUDDY_WINDOW_DISPLAY: 'leftmost' } });

run('pnpm build');
run('pnpm exec playwright test e2e/site-shots.spec.ts');
console.log(`Pictures in ${out}`);
