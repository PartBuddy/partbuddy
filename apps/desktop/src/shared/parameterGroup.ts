/**
 * The group of a parameter in the parameter panel (decided 2026-11-14). SolidCraft has no folders for
 * parameters (`parameters.move` only orders them, `browser.group` takes bodies, sketches and construction), so
 * the group leads the comment in brackets, as the assistant is told to write it: "[Monitor] Ultrawide-Höhe".
 * A range ("[50..90]") or the assistant's fit mark ("[auto 3×line]") at the start is not a group.
 */
const GROUP = /^\s*\[([^[\]]{1,40})\]\s*/;

/** "[Monitor] Ultrawide-Höhe [300..400]" → "Monitor"; null for a comment without a group. */
export function groupOf(comment: string): string | null {
  const name = GROUP.exec(comment)?.[1]?.trim();
  return name && !name.includes('..') && !/^auto\s/i.test(name) ? name : null;
}

/** The comment without its group, as the sharing package and the row show it. */
export function withoutGroup(comment: string): string {
  return groupOf(comment) === null ? comment : comment.replace(GROUP, '');
}
