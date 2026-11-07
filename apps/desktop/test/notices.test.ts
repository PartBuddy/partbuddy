import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

// @ts-expect-error -- a plain script of tools/licenses without types
import { noticesText } from '../../../tools/licenses/notices.mjs';

const folder = mkdtempSync(join(tmpdir(), 'partbuddy-notices-'));
afterAll(() => {
  rmSync(folder, { recursive: true, force: true });
});

describe('third-party notices (ADR 0007)', () => {
  it('list each bundled library with its licence text, leave PartBuddy out, and name a missing file', () => {
    writeFileSync(join(folder, 'LICENSE'), 'MIT License\nCopyright (c) Someone');
    writeFileSync(join(folder, 'README.md'), 'not a licence');
    const text = (noticesText as (report: unknown, extra?: { title: string; text: string }[]) => string)(
      {
        MIT: [
          { name: 'zeta', versions: ['1.0.0'], paths: [folder], homepage: 'https://example.org' },
          { name: '@partbuddy/geometry', versions: ['0.1.0'], paths: [folder] },
        ],
        'Apache-2.0': [{ name: 'alpha', versions: ['2.0.0'], paths: [join(folder, 'missing')] }],
      },
      [{ title: 'Icons', text: 'Icon licence' }],
    );
    expect(text).toContain('zeta 1.0.0\nLicence: MIT\nHome: https://example.org\n\nMIT License\nCopyright (c) Someone');
    expect(text).not.toContain('not a licence');
    expect(text).not.toContain('@partbuddy/geometry');
    expect(text.indexOf('alpha 2.0.0')).toBeLessThan(text.indexOf('zeta 1.0.0'));
    expect(text).toContain('The package ships no licence file; it is published under Apache-2.0.');
    expect(text).toContain('Icons\n\nIcon licence');
  });
});
