import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// The design tokens replace Tailwind's spacing with steps 0–7 (tailwind-theme.css). Any other number,
// such as `bottom-14` or `py-0.5`, is dropped from the CSS without a warning: the toast stood at the top.
const SPACING = /(?<![\w-])-?(?:p[xytrblse]?|m[xytrblse]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|bottom|left|right|start|end|w|h|size|min-[wh]|max-[wh]|basis|translate-[xy]|scroll-[mp][xytrbl]?)-(\d+(?:\.\d+)?)(?![\w.[-])/g;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sources(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe('spacing classes', () => {
  it('use only the token steps 0–7, which Tailwind generates', () => {
    const wrong: string[] = [];
    for (const file of sources(join(__dirname, '..', 'src', 'renderer', 'src'))) {
      for (const [line, text] of readFileSync(file, 'utf8').split('\n').entries()) {
        for (const match of text.matchAll(SPACING)) {
          const value = Number(match[1]);
          if (!Number.isInteger(value) || value > 7) wrong.push(`${file}:${line + 1} ${match[0]}`);
        }
      }
    }
    expect(wrong).toEqual([]);
  });

  it('finds a class outside the steps', () => {
    expect([...'a bottom-14 py-0.5 gap-2 z-30 h-px'.matchAll(SPACING)].map((m) => m[0])).toEqual(['bottom-14', 'py-0.5', 'gap-2']);
  });
});
