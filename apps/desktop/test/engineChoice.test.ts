import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { Environment } from '../src/main/solidcraft/discovery';
import { locateExecutable } from '../src/main/solidcraft/discovery';
import { EngineChoice } from '../src/main/solidcraft/engineChoice';
import { compareVersions, supportOf, versionFromOutput } from '../src/main/solidcraft/engineVersion';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function folder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'partbuddy-engine-'));
  dirs.push(dir);
  return dir;
}

describe('SolidCraft versions', () => {
  it('reads the version from the command-line output', () => {
    expect(versionFromOutput('solidcraft-cli 0.40.0-rc.2\n')).toBe('0.40.0-rc.2');
    expect(versionFromOutput('solidcraft-cli 0.30.1')).toBe('0.30.1');
    expect(versionFromOutput('no version here')).toBeNull();
  });

  it('orders releases and pre-releases like semantic versions', () => {
    expect(compareVersions('0.30.1', '0.40.0-rc.2')).toBeLessThan(0);
    expect(compareVersions('0.40.0-rc.1', '0.40.0-rc.2')).toBeLessThan(0);
    expect(compareVersions('0.40.0-rc.2', '0.40.0')).toBeLessThan(0);
    expect(compareVersions('0.40.0-rc.10', '0.40.0-rc.2')).toBeGreaterThan(0);
    expect(compareVersions('0.40.0-nightly.1', '0.40.0-rc.1')).toBeLessThan(0);
    expect(compareVersions('1.0.0', '0.99.9')).toBeGreaterThan(0);
    expect(compareVersions('0.30.1', '0.30.1')).toBe(0);
  });

  it('rates a version against what PartBuddy is developed with', () => {
    expect(supportOf('0.40.0-rc.4')).toBe('recommended');
    expect(supportOf('0.40.0-rc.3')).toBe('supported');
    expect(supportOf('0.40.0-rc.2')).toBe('supported');
    expect(supportOf('0.40.0')).toBe('recommended');
    expect(supportOf('0.40.0-rc.1')).toBe('supported');
    expect(supportOf('0.30.1')).toBe('supported');
    expect(supportOf('0.30.0')).toBe('tooOld');
    expect(supportOf(null)).toBe('unknown');
    expect(supportOf('soon')).toBe('unknown');
  });
});

describe('Choosing the SolidCraft program', () => {
  /** A fake installation: a desktop app and, unless left out, solidcraft-cli beside it. */
  function install(withCli = true): string {
    const dir = folder();
    const exe = join(dir, 'solidcraft.exe');
    writeFileSync(exe, '');
    if (withCli) writeFileSync(join(dir, 'solidcraft-cli.exe'), '');
    return exe;
  }

  function setup(versions: Record<string, string | null>, env: NodeJS.ProcessEnv = {}) {
    const settings = join(folder(), 'solidcraft-settings.json');
    const environment: Environment = { platform: 'win32', env, home: folder(), isAlive: () => true };
    const choice = new EngineChoice({
      file: settings,
      environment,
      platform: 'win32',
      readVersion: (cli) => Promise.resolve(versions[cli] ?? null),
    });
    return { choice, settings };
  }

  it('keeps a valid program and reports it after a restart', async () => {
    const exe = install();
    const { choice, settings } = setup({ [join(exe, '..', 'solidcraft-cli.exe')]: '0.40.0-rc.4' });
    const result = await choice.choose(exe);
    expect(result.error).toBeNull();
    expect(result.info).toMatchObject({ path: exe, source: 'setting', version: '0.40.0-rc.4', support: 'recommended', restartNeeded: true });
    expect(JSON.parse(readFileSync(settings, 'utf8'))).toEqual({ path: exe });
    // The supervisor's environment follows the choice.
    expect(locateExecutable(choice.environment())).toEqual({ path: exe, source: 'setting' });
  });

  it('refuses files that are not a usable SolidCraft', async () => {
    const noCli = install(false);
    const old = install();
    const { choice } = setup({ [join(old, '..', 'solidcraft-cli.exe')]: '0.29.0' });
    const other = join(folder(), 'notepad.exe');
    writeFileSync(other, '');
    expect((await choice.choose(other)).error).toBe('notSolidCraft');
    expect((await choice.choose('solidcraft.exe')).error).toBe('notSolidCraft');
    expect((await choice.choose(noCli)).error).toBe('noCli');
    expect((await choice.choose(old)).error).toBe('tooOld');
    const silent = install();
    expect((await choice.choose(silent)).error).toBe('noVersion');
    expect((await choice.info()).source).toBe('automatic');
  });

  it('goes back to the automatic search, and a damaged settings file means automatic', async () => {
    const exe = install();
    const { choice, settings } = setup({ [join(exe, '..', 'solidcraft-cli.exe')]: '0.30.1' });
    await choice.choose(exe);
    const back = await choice.choose(null);
    expect(back.info.source).toBe('automatic');
    writeFileSync(settings, '{not json');
    expect(choice.configured()).toBeNull();
  });

  it('reports a chosen program that was removed as missing instead of using another one', async () => {
    const exe = install();
    const { choice, settings } = setup({});
    writeFileSync(settings, JSON.stringify({ path: join(exe, '..', 'gone', 'solidcraft.exe') }));
    expect(await choice.info()).toMatchObject({ path: null, source: 'setting', support: 'unknown' });
  });

  it('lets the test override win over the choice', async () => {
    const exe = install();
    const override = install();
    const { choice, settings } = setup({}, { PARTBUDDY_SOLIDCRAFT_EXE: override });
    writeFileSync(settings, JSON.stringify({ path: exe }));
    expect(await choice.info()).toMatchObject({ path: override, source: 'override', restartNeeded: false });
  });
});
