import { withoutFitMark } from '../../../shared/designFit';
import { PRINT_GROUP, groupOf, withoutGroup } from '../../../shared/parameterGroup';

/** "Base plate length [50..90]" → { min: 50, max: 90 }: the range the designer wrote into the comment. */
export function rangeOf(comment: string): { min: number; max: number } | null {
  const match = /\[\s*(-?\d+(?:[.,]\d+)?)\s*\.\.\s*(-?\d+(?:[.,]\d+)?)\s*\]/.exec(comment);
  if (!match) return null;
  const min = Number.parseFloat((match[1] ?? '').replace(',', '.'));
  const max = Number.parseFloat((match[2] ?? '').replace(',', '.'));
  return Number.isFinite(min) && Number.isFinite(max) && min <= max ? { min, max } : null;
}

/** The comment without its group, its range and the assistant's fit mark, which the panel shows on their own. */
export function commentText(comment: string): string {
  return withoutFitMark(withoutGroup(comment).replace(/\s*\[[^\]]*\.\.[^\]]*\]\s*/, ' '));
}

/** The row's label: the comment up to its first semicolon ("Outer length; the hinge is 40 mm" → "Outer length"). */
export function labelOf(comment: string): string {
  return commentText(comment).split(';')[0]?.trim() ?? '';
}

interface Listed {
  comment: string;
  favorite: boolean;
  editable: boolean;
  expression: string;
  unit: string;
}

/** A plain value in any unit ("30 deg", "2,5 mm", a text): set by hand, not worked out from others. */
const LITERAL = /^\s*-?\d+(?:[.,]\d+)?\s*(?:mm|cm|m|in|ft|deg|rad|°)?\s*$/;
const computed = (parameter: Listed) => !parameter.editable && parameter.unit !== 'text' && !LITERAL.test(parameter.expression);

export interface ParameterGroup<P> {
  /** The group from the comment; null for those without one ("Weitere", or no head at all when no parameter has a group). */
  name: string | null;
  values: P[];
  /** Formulas over other parameters, folded away under "Berechnet". */
  computed: P[];
}

/**
 * The panel's order (decided 2026-11-14): favourites first, then the groups in the order their first parameter
 * comes, the parameters without a group, then the sizes fitted to the printer ("Druck") last; within each the
 * values to set, then the computed ones. Groups are the same in any case ("[monitor]" is "[Monitor]"), named as first written.
 */
export function groupParameters<P extends Listed>(list: readonly P[]): { favorites: P[]; groups: ParameterGroup<P>[] } {
  const groups = new Map<string, ParameterGroup<P>>();
  for (const parameter of list) {
    if (parameter.favorite) continue;
    const name = groupOf(parameter.comment);
    const key = name?.toLowerCase() ?? '';
    const group = groups.get(key) ?? { name, values: [], computed: [] };
    groups.set(key, group);
    (computed(parameter) ? group.computed : group.values).push(parameter);
  }
  const last = ['', PRINT_GROUP.toLowerCase()].flatMap((key) => groups.get(key) ?? []);
  const first = [...groups.entries()].filter(([key]) => key !== '' && key !== PRINT_GROUP.toLowerCase()).map(([, group]) => group);
  return { favorites: list.filter((parameter) => parameter.favorite), groups: [...first, ...last] };
}
