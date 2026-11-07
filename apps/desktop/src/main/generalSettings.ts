import { existsSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import type { Language } from '../shared/contract';
import type { SettingsStore } from './settingsStore';

/**
 * General settings (plan step B6): the language of the interface (follow Windows, German or
 * English) and the project folder, kept in the settings file. The language is read before the
 * window opens (Chromium's `--lang`); a new project folder takes effect after a restart, because
 * SolidCraft gets its folders at its start.
 */
export class GeneralSettings {
  constructor(private readonly store: SettingsStore) {}

  language(): Language {
    return this.store.get('language');
  }

  setLanguage(language: Language): void {
    this.store.set('language', language);
  }

  /** The project folder the user chose, if it is still an absolute path to a folder. */
  projectsFolder(): string | null {
    const folder = this.store.get('projectsFolder');
    if (folder === null || !isAbsolute(folder)) return null;
    try {
      return existsSync(folder) && statSync(folder).isDirectory() ? folder : null;
    } catch {
      return null;
    }
  }

  setProjectsFolder(folder: string | null): void {
    this.store.set('projectsFolder', folder);
  }

  /** Whether the first-start setup (B9) was finished or skipped. */
  setupDone(): boolean {
    return this.store.get('setupDone');
  }

  finishSetup(): void {
    this.store.set('setupDone', true);
  }
}
