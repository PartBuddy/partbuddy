import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SURFACES } from '../e2e/surfaces';

// Every renderer file that opens an overlay is in the surface inventory (UI audit 2026-11-09), so the
// audit run pictures it and no new menu, popover or dialog stays unchecked. The gallery is a demo page.
const root = join(__dirname, '..', 'src', 'renderer', 'src');
const OVERLAY = /<(MenuTrigger|SubmenuTrigger|Popover|DialogTrigger|ModalOverlay|Modal|TooltipTrigger|Tip|Select|ComboBox)[\s>]|role="(dialog|alertdialog)"|onContextMenu=/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(dir, entry.name)) : entry.name.endsWith('.tsx') && !entry.name.includes('.test.') ? [join(dir, entry.name)] : [],
  );
}

describe('surface inventory', () => {
  it('lists every file that opens an overlay', () => {
    const listed = new Set(SURFACES.map((surface) => surface.file));
    const missing = files(root)
      .filter((file) => OVERLAY.test(readFileSync(file, 'utf8')))
      .map((file) => relative(root, file).replaceAll('\\', '/'))
      .filter((file) => file !== 'ui/Gallery.tsx' && file !== 'ui/Button.tsx' && !listed.has(file));
    expect(missing).toEqual([]);
  });

  it('names only files that exist', () => {
    const all = new Set(files(root).map((file) => relative(root, file).replaceAll('\\', '/')));
    expect(SURFACES.filter((surface) => surface.file !== '—' && !all.has(surface.file)).map((surface) => surface.file)).toEqual([]);
  });
});
