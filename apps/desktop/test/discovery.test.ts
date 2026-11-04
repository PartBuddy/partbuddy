import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { controlDirectory, findExecutable, findRunning, type Environment } from '../src/main/solidcraft/discovery';

const token = 'ab'.repeat(32);
const dirs: string[] = [];

function environment(alive: number[]): Environment {
  const dir = mkdtempSync(join(tmpdir(), 'partbuddy-discovery-'));
  dirs.push(dir);
  return {
    platform: 'win32',
    env: { SOLIDCRAFT_CONTROL_DIR: dir },
    home: dir,
    isAlive: (pid) => alive.includes(pid),
  };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('SolidCraft discovery', () => {
  it('uses the documented control folders per platform', () => {
    // Synthetic folders built at run time; the repository holds no user paths (ADR 0009).
    const home = join(tmpdir(), 'partbuddy-home');
    const local = join(home, 'AppData', 'Local');
    const base = { home, isAlive: () => true };
    expect(controlDirectory({ ...base, platform: 'win32', env: { LOCALAPPDATA: local } })).toBe(
      join(local, 'SolidCraft', 'control'),
    );
    expect(controlDirectory({ ...base, platform: 'linux', env: {} })).toBe(join(home, '.local', 'share', 'solidcraft', 'control'));
    expect(controlDirectory({ ...base, platform: 'darwin', env: {} })).toBe(
      join(home, 'Library', 'Application Support', 'SolidCraft', 'control'),
    );
  });

  it('finds the app named in current.port', () => {
    const env = environment([4242]);
    const dir = env.env.SOLIDCRAFT_CONTROL_DIR ?? '';
    writeFileSync(join(dir, 'current.port'), '7878\n');
    writeFileSync(join(dir, '7878.token'), `${token}\n`);
    writeFileSync(join(dir, '7878.pid'), '4242 123456\n');
    const lookup = findRunning(env);
    expect(lookup.found).toBe(true);
    if (lookup.found) expect(lookup.endpoint).toMatchObject({ port: 7878, token, pid: 4242 });
  });

  it('reports files of a force-quit app as stale', () => {
    const env = environment([]);
    const dir = env.env.SOLIDCRAFT_CONTROL_DIR ?? '';
    writeFileSync(join(dir, 'current.port'), '7878');
    writeFileSync(join(dir, '7878.token'), token);
    writeFileSync(join(dir, '7878.pid'), '4242');
    expect(findRunning(env)).toEqual({ found: false, reason: 'stale' });
  });

  it('rejects a token that is not hex', () => {
    const env = environment([4242]);
    const dir = env.env.SOLIDCRAFT_CONTROL_DIR ?? '';
    writeFileSync(join(dir, 'current.port'), '7878');
    writeFileSync(join(dir, '7878.token'), 'not a token');
    writeFileSync(join(dir, '7878.pid'), '4242');
    expect(findRunning(env)).toEqual({ found: false, reason: 'unreadable' });
  });

  it('reports no files when nothing runs', () => {
    expect(findRunning(environment([]))).toEqual({ found: false, reason: 'noFiles' });
  });

  it('finds the executable in Program Files, on PATH or from the override', () => {
    const exists = (path: string) => path === join('C:\\Program Files', 'SolidCraft', 'solidcraft.exe');
    const base = { platform: 'win32' as const, home: tmpdir(), isAlive: () => true };
    const override = join(tmpdir(), 'sc.exe');
    expect(findExecutable({ ...base, env: { ProgramFiles: 'C:\\Program Files' } }, exists)).toBe(
      join('C:\\Program Files', 'SolidCraft', 'solidcraft.exe'),
    );
    expect(findExecutable({ ...base, env: {} }, exists)).toBeNull();
    expect(findExecutable({ ...base, env: { PARTBUDDY_SOLIDCRAFT_EXE: override } }, (p) => p === override)).toBe(override);
  });
});
