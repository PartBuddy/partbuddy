import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';

import { languageSchema, type Language } from '../shared/contract';

interface Stored {
  language?: unknown;
  projectsFolder?: unknown;
  setupDone?: unknown;
}

/**
 * General settings (plan step B6): the language of the interface (follow Windows, German or
 * English) and the project folder. Kept per installation in a small file; a missing or damaged file
 * means the defaults. The language is read before the window opens (Chromium's `--lang`); a new
 * project folder takes effect after a restart, because SolidCraft gets its folders at its start.
 */
export class GeneralSettings {
  constructor(private readonly file: string) {}

  private read(): Stored {
    try {
      const stored = JSON.parse(readFileSync(this.file, 'utf8')) as unknown;
      return typeof stored === 'object' && stored !== null ? (stored) : {};
    } catch {
      return {};
    }
  }

  private write(next: Stored): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ ...this.read(), ...next }));
  }

  language(): Language {
    const parsed = languageSchema.safeParse(this.read().language);
    return parsed.success ? parsed.data : 'system';
  }

  setLanguage(language: Language): void {
    this.write({ language });
  }

  /** The project folder the user chose, if it is still an absolute path to a folder. */
  projectsFolder(): string | null {
    const folder = this.read().projectsFolder;
    if (typeof folder !== 'string' || !isAbsolute(folder)) return null;
    try {
      return existsSync(folder) && statSync(folder).isDirectory() ? folder : null;
    } catch {
      return null;
    }
  }

  setProjectsFolder(folder: string | null): void {
    this.write({ projectsFolder: folder });
  }

  /** Whether the first-start setup (B9) was finished or skipped. */
  setupDone(): boolean {
    return this.read().setupDone === true;
  }

  finishSetup(): void {
    this.write({ setupDone: true });
  }
}
