import { describe, expect, it } from 'vitest';

import type { ProjectEntry } from '../../../shared/contract';
import { matching, relativeTime } from './projectTiles';

const entry = (name: string): ProjectEntry => ({ name, folder: `projects/${name}`, modified: 0, preview: null, check: null });

describe('project tiles (B3)', () => {
  const projects = ['Grundplatte', 'Übersicht Halter', 'Kabelclip groß'].map(entry);

  it('finds projects by every word, without case and accents', () => {
    expect(matching(projects, '').map((p) => p.name)).toEqual(['Grundplatte', 'Übersicht Halter', 'Kabelclip groß']);
    expect(matching(projects, 'grund').map((p) => p.name)).toEqual(['Grundplatte']);
    expect(matching(projects, 'ubersicht').map((p) => p.name)).toEqual(['Übersicht Halter']);
    expect(matching(projects, 'halter über').map((p) => p.name)).toEqual(['Übersicht Halter']);
    expect(matching(projects, 'Clip  GROSS')).toEqual([]);
    expect(matching(projects, 'clip groß').map((p) => p.name)).toEqual(['Kabelclip groß']);
  });

  it('says how long ago a project changed', () => {
    const now = Date.UTC(2026, 10, 5, 12);
    const minute = 60_000;
    expect(relativeTime(now - 20_000, now, 'de')).toBeNull();
    expect(relativeTime(now - 5 * minute, now, 'de')).toBe('vor 5 Minuten');
    expect(relativeTime(now - 3 * 60 * minute, now, 'en')).toBe('3 hours ago');
    expect(relativeTime(now - 24 * 60 * minute, now, 'de')).toBe('gestern');
    expect(relativeTime(now - 14 * 24 * 60 * minute, now, 'de')).toBe('vor 2 Wochen');
    expect(relativeTime(Date.UTC(2024, 0, 15), now, 'de')).toBe('15.01.2024');
  });
});
