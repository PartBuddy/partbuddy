import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute } from 'node:path';

import type { EngineChoiceError, EngineInfo } from '../../shared/contract';
import { cliBeside, locateExecutable, type Environment } from './discovery';
import { MINIMUM_VERSION, RECOMMENDED_VERSION, supportOf } from './engineVersion';

export interface EngineChoiceOptions {
  /** The small settings file that keeps the user's choice. */
  file: string;
  environment: Environment;
  readVersion: (cli: string) => Promise<string | null>;
  exists?: (path: string) => boolean;
  platform?: NodeJS.Platform;
}

/**
 * Which SolidCraft program PartBuddy runs (R0, ADR 0024): the automatic search or a program the
 * user chose, such as a portable copy next to an installed one. The choice takes effect when
 * PartBuddy starts again, so a running design is never moved between kernels.
 */
export class EngineChoice {
  private readonly exists: (path: string) => boolean;
  private readonly platform: NodeJS.Platform;
  private readonly versions = new Map<string, Promise<string | null>>();
  /** The program PartBuddy started with; a different one needs a restart. */
  private readonly startedWith: string | null;

  constructor(private readonly options: EngineChoiceOptions) {
    this.exists = options.exists ?? existsSync;
    this.platform = options.platform ?? process.platform;
    this.startedWith = this.locate().path;
  }

  /** The environment the supervisor uses: the system's, plus the user's choice. */
  environment(): Environment {
    return { ...this.options.environment, configured: () => this.configured() };
  }

  /** The program the user chose, or null for the automatic search. A damaged file means automatic. */
  configured(): string | null {
    try {
      const stored = (JSON.parse(readFileSync(this.options.file, 'utf8')) as { path?: unknown }).path;
      return typeof stored === 'string' && isAbsolute(stored) ? stored : null;
    } catch {
      return null;
    }
  }

  async info(): Promise<EngineInfo> {
    const { path, source } = this.locate();
    const version = path ? await this.version(path) : null;
    return {
      path,
      source,
      version,
      support: path ? supportOf(version) : 'unknown',
      minimum: MINIMUM_VERSION,
      recommended: RECOMMENDED_VERSION,
      restartNeeded: path !== this.startedWith,
    };
  }

  /**
   * Keeps `path` as the program to use (null: the automatic search again). A path is checked
   * before it is kept: the SolidCraft desktop app, with solidcraft-cli beside it, that tells its
   * version and is not older than the minimum.
   */
  async choose(path: string | null): Promise<{ info: EngineInfo; error: EngineChoiceError | null }> {
    if (path !== null) {
      const error = await this.check(path);
      if (error) return { info: await this.info(), error };
    }
    mkdirSync(dirname(this.options.file), { recursive: true });
    writeFileSync(this.options.file, JSON.stringify({ path }));
    return { info: await this.info(), error: null };
  }

  private async check(path: string): Promise<EngineChoiceError | null> {
    const name = this.platform === 'win32' ? 'solidcraft.exe' : 'solidcraft';
    if (!isAbsolute(path) || basename(path).toLowerCase() !== name || !this.isFile(path)) return 'notSolidCraft';
    if (!this.exists(cliBeside(path, this.platform))) return 'noCli';
    const version = await this.version(path);
    if (!version) return 'noVersion';
    return supportOf(version) === 'tooOld' ? 'tooOld' : null;
  }

  private isFile(path: string): boolean {
    if (!this.exists(path)) return false;
    if (this.options.exists) return true;
    try {
      return statSync(path).isFile();
    } catch {
      return false;
    }
  }

  private locate() {
    return locateExecutable(this.environment(), this.exists);
  }

  private version(path: string): Promise<string | null> {
    let version = this.versions.get(path);
    if (!version) {
      version = this.options.readVersion(cliBeside(path, this.platform));
      this.versions.set(path, version);
    }
    return version;
  }
}
