import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { cliBeside, locateExecutable, type Environment } from '../src/main/solidcraft/discovery';
import { EngineChoice } from '../src/main/solidcraft/engineChoice';
import { readVersion } from '../src/main/solidcraft/engineVersion';

const folders: string[] = [];
afterEach(() => { for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function setup() {
  const home = mkdtempSync(join(tmpdir(), 'partbuddy-appimage-'));
  folders.push(home);
  const data = join(home, 'data');
  const applications = join(data, 'applications');
  mkdirSync(applications, { recursive: true });
  const image = join(home, 'SolidCraft installed elsewhere.AppImage');
  writeFileSync(image, '');
  const environment: Environment = { platform: 'linux', home, env: { XDG_DATA_HOME: data, XDG_DATA_DIRS: join(home, 'system'), XDG_CACHE_HOME: join(home, 'cache') }, isAlive: () => false };
  return { home, applications, image, environment };
}

describe('Linux AppImage installations', () => {
  it('finds a Gear Lever installation through its desktop entry, outside PATH', () => {
    const { applications, image, environment } = setup();
    writeFileSync(join(applications, 'solidcraft.desktop'), `[Desktop Entry]\nType=Application\nName=SolidCraft\nTryExec=${image}\nExec=env DESKTOPINTEGRATION=1 "${image}" %f\n`);
    expect(locateExecutable(environment)).toEqual({ path: image, source: 'automatic' });
  });

  it('reads quoted Exec paths and env assignments when TryExec is absent or stale', () => {
    const { applications, image, environment } = setup();
    writeFileSync(join(applications, 'custom.desktop'), `[Desktop Entry]\nType=Application\nName=SolidCraft\nTryExec=${image}.removed\nExec=/usr/bin/env DESKTOPINTEGRATION=1 "${image}" %F\n`);
    expect(locateExecutable(environment).path).toBe(image);
  });

  it('ignores deleted, hidden, unrelated and malformed entries', () => {
    const { applications, image, environment } = setup();
    for (const [name, body] of Object.entries({
      deleted: `Name=SolidCraft\nExec="${image}.removed.AppImage"`,
      hidden: `Name=SolidCraft\nHidden=true\nTryExec=${image}`,
      other: `Name=Other CAD\nTryExec=${image}`,
      malformed: `Name=SolidCraft\nExec="${image}`,
      action: `Name=Other CAD\n[Desktop Action SolidCraft]\nName=SolidCraft\nExec="${image}"`,
    })) writeFileSync(join(applications, `${name}.desktop`), `[Desktop Entry]\nType=Application\n${body}\n`);
    expect(locateExecutable(environment).path).toBeNull();
  });

  it('keeps native PATH installs and explicit choices ahead of desktop discovery', () => {
    const { home, applications, image, environment } = setup();
    writeFileSync(join(applications, 'solidcraft.desktop'), `[Desktop Entry]\nType=Application\nName=SolidCraft\nTryExec=${image}\n`);
    const native = join(home, 'solidcraft');
    writeFileSync(native, '');
    expect(locateExecutable({ ...environment, env: { ...environment.env, PATH: home } }).path).toBe(native);
    expect(locateExecutable({ ...environment, configured: () => `${image}.removed` })).toEqual({ path: null, source: 'setting' });
    expect(locateExecutable({ ...environment, env: { ...environment.env, PARTBUDDY_SOLIDCRAFT_EXE: image } })).toEqual({ path: image, source: 'override' });
  });

  it.skipIf(process.platform !== 'linux')('runs the bundled CLI with literal paths and arguments, without desktop integration', () => {
    const { home } = setup();
    const image = join(home, "SolidCraft's $(touch injected).AppImage");
    writeFileSync(image, '#!/bin/sh\nprintf "%s\\n" "$SOLIDCRAFT_APPIMAGE_CLI" "$SOLIDCRAFT_NO_DESKTOP_INTEGRATION" "$@"\n');
    chmodSync(image, 0o700);
    const cli = cliBeside(image, 'linux', join(home, 'cache'));
    expect(execFileSync(cli, ['--version', 'path with spaces', '$(touch injected)'], { cwd: home, encoding: 'utf8' })).toBe('1\n1\n--version\npath with spaces\n$(touch injected)\n');
    expect(existsSync(join(home, 'injected'))).toBe(false);
    expect(cliBeside(image, 'linux', join(home, 'cache'))).toBe(cli);
  });

  it.skipIf(process.platform !== 'linux')('accepts selecting an AppImage and reports its bundled CLI version', async () => {
    const { home, image, environment } = setup();
    writeFileSync(image, '#!/bin/sh\n[ "$SOLIDCRAFT_APPIMAGE_CLI" = 1 ] || exit 1\nprintf "solidcraft-cli 0.50.0\\n"\n');
    chmodSync(image, 0o700);
    const file = join(home, 'engine-settings.json');
    const choice = new EngineChoice({ file, environment, readVersion });
    const result = await choice.choose(image);
    expect(result.error).toBeNull();
    expect(result.info).toMatchObject({ path: image, source: 'setting', version: '0.50.0', support: 'recommended' });
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({ path: image });
  });
});
