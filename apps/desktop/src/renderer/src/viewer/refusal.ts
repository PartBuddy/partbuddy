import type { TFunction } from 'i18next';

import { PRINT_LIMIT } from '../../../shared/blocks';

/** Kinds of SolidCraft refusals that have a sentence of their own; `limit` is PartBuddy's own: a size that does not print. */
export type RefusalKind = 'limit' | 'check' | 'shell' | 'fillet' | 'chamfer' | 'boolean' | 'other';

/** Which known kind a raw SolidCraft error is (audit B-01); the raw text stays available as details. */
export function refusalKind(raw: string): RefusalKind {
  if (raw.startsWith(PRINT_LIMIT)) return 'limit';
  const text = raw.toLowerCase();
  // The kernel's own check of a finished shape; its report quotes values such as "offset=", which is no wall thickness.
  if (/check refuses the result|failed tests:/.test(text)) return 'check';
  if (/shell|hollow|thickness|offset/.test(text)) return 'shell';
  if (/fillet|blend|round/.test(text)) return 'fillet';
  if (/chamfer/.test(text)) return 'chamfer';
  if (/boolean|intersect|subtract|union|cut|fuse/.test(text)) return 'boolean';
  return 'other';
}

/** The refusal as a sentence in the interface language, with what to try. */
export function refusalText(t: TFunction, raw: string): string {
  return t(`hud.refused.${refusalKind(raw)}`);
}
