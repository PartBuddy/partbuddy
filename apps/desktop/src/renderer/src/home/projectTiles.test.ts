import { describe, expect, it } from 'vitest';

import type { ProjectEntry } from '../../../shared/contract';
import { matching, parseTags, relativeTime, sortProjects, tagsOf } from './projectTiles';

const entry = (name: string): ProjectEntry => ({ name, folder: `projects/${name}`, modified: 0, created: 0, preview: null, check: null, favorite: false, tags: [], progress: null });

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

describe('sorting the start page (P1)', () => {
  const at = (name: string, modified: number, created: number): ProjectEntry => ({ name, folder: 'projects/' + name, modified, created, preview: null, check: null, favorite: false, tags: [], progress: null });
  const projects = [at('Zahnrad 10', 3, 1), at('Ärmel', 1, 3), at('Zahnrad 9', 2, 2)];
  it('sorts by last change, creation or name in the language order with numbers as numbers', () => {
    expect(sortProjects(projects, 'modified', 'de').map((p) => p.name)).toEqual(['Zahnrad 10', 'Zahnrad 9', 'Ärmel']);
    expect(sortProjects(projects, 'created', 'de').map((p) => p.name)).toEqual(['Ärmel', 'Zahnrad 9', 'Zahnrad 10']);
    expect(sortProjects(projects, 'name', 'de').map((p) => p.name)).toEqual(['Ärmel', 'Zahnrad 9', 'Zahnrad 10']);
    expect(projects[0]?.name).toBe('Zahnrad 10');
  });
});

describe('favourites and tags on the start page (P5)', () => {
  const at = (name: string, modified: number, favorite: boolean, tags: string[]): ProjectEntry => ({ name, folder: 'projects/' + name, modified, created: 0, preview: null, check: null, favorite, tags, progress: null });
  const projects = [at('Halter', 3, false, ['Garage']), at('Clip', 1, true, ['garage', 'Küche']), at('Box', 2, false, [])];
  it('keeps favourites on top, finds tags and lists each tag once', () => {
    expect(sortProjects(projects, 'modified', 'de').map((p) => p.name)).toEqual(['Clip', 'Halter', 'Box']);
    expect(sortProjects(projects, 'name', 'de').map((p) => p.name)).toEqual(['Clip', 'Box', 'Halter']);
    // Reversed, favourites still lead (audit A-18).
    expect(sortProjects(projects, 'name', 'de', true).map((p) => p.name)).toEqual(['Clip', 'Halter', 'Box']);
    expect(matching(projects, 'kuche').map((p) => p.name)).toEqual(['Clip']);
    expect(tagsOf(projects, 'de')).toEqual(['Garage', 'Küche']);
    expect(parseTags(' Garage, ,Küche ,')).toEqual(['Garage', 'Küche']);
  });
});
