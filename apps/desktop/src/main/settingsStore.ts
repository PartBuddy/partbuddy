import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { LEGACY_FILES, settingsSchema, type SettingKey, type Settings } from '../shared/settings';

type Raw = Record<string, unknown>;

function readObject(file: string): Raw | null {
  const parsed = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Raw) : null;
}

/**
 * The settings of the installation in one file (`settings.json`), read through `settingsSchema`.
 * On the first read it takes over the files of earlier versions; values it does not understand
 * stay in the file, and a damaged file is kept beside it before anything is written over it.
 */
export class SettingsStore {
  constructor(
    private readonly file: string,
    private readonly log: (line: string) => void = () => undefined,
  ) {}

  private raw(): Raw {
    if (!existsSync(this.file)) return this.migrate();
    try {
      const stored = readObject(this.file);
      if (stored) return stored;
    } catch {
      // Damaged: handled below.
    }
    const kept = `${this.file}.damaged`;
    copyFileSync(this.file, kept);
    this.log(`settings file was damaged; kept as ${kept}, using the defaults`);
    this.write({});
    return {};
  }

  /** Takes over the values of the files before 2026-11-07, as they were; nothing is dropped. */
  private migrate(): Raw {
    const folder = dirname(this.file);
    const taken: Raw = {};
    for (const [name, keys] of Object.entries(LEGACY_FILES)) {
      const file = join(folder, name);
      if (!existsSync(file)) continue;
      try {
        const old = readObject(file);
        if (!old) continue;
        for (const key of keys) if (key in old) taken[key] = old[key];
        this.log(`settings taken over from ${name}`);
      } catch {
        this.log(`settings in ${name} could not be read; left as they are`);
      }
    }
    this.write(taken);
    return taken;
  }

  private write(raw: Raw): void {
    mkdirSync(dirname(this.file), { recursive: true });
    // Written beside the file and renamed over it, so a crash never leaves half a file.
    const next = `${this.file}.tmp`;
    writeFileSync(next, JSON.stringify(raw, null, 2));
    renameSync(next, this.file);
  }

  all(): Settings {
    return settingsSchema.parse(this.raw());
  }

  get<K extends SettingKey>(key: K): Settings[K] {
    return this.all()[key];
  }

  set<K extends SettingKey>(key: K, value: Settings[K]): void {
    this.write({ ...this.raw(), [key]: value });
  }

  /** Back to the defaults: the keys leave the file. */
  reset(keys: readonly SettingKey[]): void {
    this.write(Object.fromEntries(Object.entries(this.raw()).filter(([key]) => !(keys as readonly string[]).includes(key))));
    this.log(`settings reset: ${keys.join(', ')}`);
  }
}
