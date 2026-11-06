import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** A folder that does not exist yet: `name`, else `name (2)`, `name (3)` … (F5: packages never overwrite). */
export function freeFolder(parent: string, name: string, exists: (path: string) => boolean = existsSync): string {
  let candidate = join(parent, name);
  for (let n = 2; exists(candidate); n += 1) candidate = join(parent, `${name} (${String(n)})`);
  return candidate;
}
