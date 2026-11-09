import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import de0 from '../src/renderer/src/i18n/de.json';
import en0 from '../src/renderer/src/i18n/en.json';
import { stepMessages } from '../src/shared/stepPhrases';

// The app adds the work-log phrases from shared/ under steps (i18n/index.ts).
const de = { ...de0, steps: stepMessages.de };
const en = { ...en0, steps: stepMessages.en };

function lookup(strings: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined), strings);
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

describe('translations', () => {
  // Audit X-02: a missing key shows the raw key ("viewer.kind.face") in the interface.
  it('has every static t() key and every key prefix of a template t() in German and English', () => {
    const missing: string[] = [];
    for (const file of sources(join(__dirname, '../src/renderer/src'))) {
      const text = readFileSync(file, 'utf8');
      for (const [, key = ''] of text.matchAll(/\bt\('([a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+)'/g)) {
        for (const [name, strings] of [['de', de], ['en', en]] as const) {
          const value = lookup(strings, key);
          // A plural or nested group (key_one, key_other, or an object) counts as present.
          const plural = lookup(strings, `${key}_one`) ?? lookup(strings, `${key}_other`);
          if (value === undefined && plural === undefined) missing.push(`${name} ${key} (${file})`);
        }
      }
      for (const [, prefix = '', rest] of text.matchAll(/\bt\(`([a-zA-Z0-9_.]+)\.\$\{[^}]+\}([a-zA-Z0-9_.]*)`/g)) {
        for (const [name, strings] of [['de', de], ['en', en]] as const) {
          const group = lookup(strings, prefix);
          if (typeof group !== 'object' || group === null) missing.push(`${name} ${prefix}.* (${file})`);
          else if (rest === '' && prefix === 'viewer.kind') {
            for (const kind of ['face', 'edge', 'vertex']) if (lookup(group, kind) === undefined) missing.push(`${name} viewer.kind.${kind}`);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
