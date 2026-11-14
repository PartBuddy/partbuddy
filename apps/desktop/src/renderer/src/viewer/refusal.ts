import type { TFunction } from 'i18next';

import { PRINT_LIMIT, type BlockLimit } from '../../../shared/blocks';

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

/** The limit a refusal of PartBuddy's print limits carries; null when it is none or cannot be read. */
export function limitOf(raw: string): BlockLimit | null {
  if (!raw.startsWith(PRINT_LIMIT)) return null;
  try {
    const limit = JSON.parse(raw.slice(PRINT_LIMIT.length)) as BlockLimit;
    return typeof limit.reason === 'string' ? limit : null;
  } catch {
    return null;
  }
}

/** The refusal as a sentence in the interface language, with what to try; a print limit with its size, why and what to give. */
export function refusalText(t: TFunction, raw: string): string {
  const limit = limitOf(raw);
  if (limit) return t(`blocks.limit.${limit.reason}`, limit as unknown as Record<string, unknown>);
  return t(`hud.refused.${refusalKind(raw)}`);
}
