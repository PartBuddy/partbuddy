// Renders the preview pictures of the templates (plan step F3) with SolidCraft's own renderer:
//   node tools/templates/render-previews.mjs <path to solidcraft-cli>
// Each template's script is built headless and photographed from the isometric corner; the
// pictures go next to the start page that shows them. Run it again when a template changes.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = process.argv[2];
if (!cli) {
  console.error('usage: node tools/templates/render-previews.mjs <path to solidcraft-cli>');
  process.exit(2);
}
const { TEMPLATE_IDS, templateSteps } = await import(new URL('../../apps/desktop/src/shared/templates.ts', import.meta.url).href);
const out = join(root, 'apps', 'desktop', 'src', 'renderer', 'src', 'home', 'templates');
const work = mkdtempSync(join(tmpdir(), 'partbuddy-templates-'));
try {
  for (const id of TEMPLATE_IDS) {
    const script = join(work, `${id}.json`);
    writeFileSync(script, JSON.stringify(templateSteps(id)));
    // Arguments as an array, no shell.
    execFileSync(cli, ['snapshot', script, '--out', join(out, `${id}.png`), '--view', 'iso', '--width', '480', '--height', '360', '--no-grid', '--no-axes'], { stdio: 'inherit' });
    console.log(`rendered ${id}`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
