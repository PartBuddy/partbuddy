import { describe, expect, it } from 'vitest';

import de from '../src/renderer/src/i18n/de.json';
import en from '../src/renderer/src/i18n/en.json';
import { searchSettings, SETTINGS } from '../src/renderer/src/shell/settingsIndex';

function lookup(strings: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (typeof node === 'object' && node !== null ? (node as Record<string, unknown>)[part] : undefined), strings);
}

const german = (key: string) => {
  const text = lookup(de, key);
  return typeof text === 'string' ? text : key;
};

describe('settings index', () => {
  it('names every option, its section and group in German and English', () => {
    for (const entry of SETTINGS) {
      for (const key of [entry.label, entry.hint ?? entry.label, `settings.section.${entry.section}`, `settings.group.${entry.group}`]) {
        expect(typeof lookup(de, key), `de ${key}`).toBe('string');
        expect(typeof lookup(en, key), `en ${key}`).toBe('string');
      }
    }
    expect(new Set(SETTINGS.map((entry) => entry.id)).size).toBe(SETTINGS.length);
  });

  it('finds options by name, help text and section, without accents and case', () => {
    expect(searchSettings('', german)).toEqual([]);
    expect(searchSettings('dunkel', german).map((entry) => entry.id)).toEqual(['theme']);
    // More words people search with (audit N-04).
    expect(searchSettings('farbe', german).map((entry) => entry.id)).toContain('theme');
    expect(searchSettings('SPRACHE', german)[0]?.id).toBe('language');
    expect(searchSettings('uber', german).map((entry) => entry.section)).toContain('about');
    expect(searchSettings('ordner projekt', german)[0]?.id).toBe('projectsFolder');
    expect(searchSettings('gibtsnicht', german)).toEqual([]);
  });

  it('puts options whose name matches before those that only mention the word', () => {
    const ids = searchSettings('material', german).map((entry) => entry.id);
    expect(ids[0]).toBe('materials');
  });
});

describe('shortcut overview', () => {
  it('finds a shortcut by what it does', () => {
    expect(searchSettings('rückgängig', german).map((entry) => entry.id)).toContain('key.undo');
    expect(searchSettings('linie', german)[0]?.id).toBe('key.sketch.line');
  });
});
