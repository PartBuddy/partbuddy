/**
 * The group of a parameter in the parameter panel (decided 2026-11-14). SolidCraft has no folders for
 * parameters (`parameters.move` only orders them, `browser.group` takes bodies, sketches and construction), so
 * the group leads the comment in brackets, as the assistant is told to write it: "[Monitor] Ultrawide-Höhe".
 * The assistant's fit mark may stand before it ("[auto 3×line] [Druck] Wand"). A bracket with a digit is never
 * a group: a range ("[50..90]", "[50-90]"), a size ("[M3] Schraubenloch") or the fit mark itself.
 */
const GROUP = /^(\s*(?:\[auto\s[^\]]*\]\s*)?)\[([^[\]\d]{1,40})\]\s*/i;

/** The group of the sizes PartBuddy fits to the printer (`[auto …]`); the panel shows it last. */
export const PRINT_GROUP = 'Druck';

/** "[Monitor] Ultrawide-Höhe [300..400]" → "Monitor"; null for a comment without a group. */
export function groupOf(comment: string): string | null {
  const name = GROUP.exec(comment)?.[2]?.trim() ?? '';
  return name === '' ? null : name;
}

/** The comment without its group, as the sharing package and the row show it. */
export function withoutGroup(comment: string): string {
  return groupOf(comment) === null ? comment : comment.replace(GROUP, (_, mark: string) => mark);
}
