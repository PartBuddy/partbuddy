import type { ProjectEntry } from '../../../shared/contract';

/** Lower case without accents, so "grundplatte" finds "Grundplatte" and "ubersicht" "Übersicht". */
export function searchable(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
}

/** The projects whose name holds every word of the query, in the list's order. */
export function matching(projects: ProjectEntry[], query: string): ProjectEntry[] {
  const words = searchable(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return projects;
  return projects.filter((project) => {
    const name = searchable(project.name);
    return words.every((word) => name.includes(word));
  });
}

/** "vor 5 Minuten", "gestern", "vor 3 Wochen"; older than a year as a date; null for under a minute. */
export function relativeTime(modified: number, now: number, language: string): string | null {
  const seconds = Math.round((modified - now) / 1000);
  if (Math.abs(seconds) < 60) return null;
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
  ];
  let value = seconds / 60;
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size) return format.format(Math.round(value), unit);
    value /= size;
  }
  return new Intl.DateTimeFormat(language, { dateStyle: 'medium' }).format(modified);
}
