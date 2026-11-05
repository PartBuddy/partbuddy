import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { themeSchema, type Theme } from '../shared/contract';

/**
 * The colour theme the user chose (UI upgrade, 2026-11-04): follow Windows, light or dark. Kept per
 * installation in a small file; a missing or damaged file means "follow Windows".
 */
export class AppearanceSettings {
  constructor(private readonly file: string) {}

  theme(): Theme {
    try {
      const stored = (JSON.parse(readFileSync(this.file, 'utf8')) as { theme?: unknown }).theme;
      const parsed = themeSchema.safeParse(stored);
      return parsed.success ? parsed.data : 'system';
    } catch {
      return 'system';
    }
  }

  setTheme(theme: Theme): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ theme }));
  }
}
