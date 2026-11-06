import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { LogFile } from '../src/main/logFile';

const folders: string[] = [];
const folder = () => {
  const dir = mkdtempSync(join(tmpdir(), 'partbuddy-log-'));
  folders.push(dir);
  return dir;
};
afterEach(() => {
  for (const dir of folders.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe('the log file', () => {
  it('writes each line with its time, one line per message, in a folder it creates', () => {
    const file = join(folder(), 'logs', 'partbuddy.log');
    const log = new LogFile(file);
    log.write('SolidCraft connected', new Date('2026-11-06T15:00:00Z'));
    log.write('first\nsecond', new Date('2026-11-06T15:00:01Z'));
    expect(readFileSync(file, 'utf8')).toBe('2026-11-06T15:00:00.000Z SolidCraft connected\n2026-11-06T15:00:01.000Z first ⏎ second\n');
  });

  it('starts a new file past its size and keeps only the one before', () => {
    const file = join(folder(), 'partbuddy.log');
    const log = new LogFile(file, 60);
    log.write('a'.repeat(50));
    log.write('b'.repeat(50));
    log.write('c'.repeat(50));
    expect(readFileSync(`${file}.old`, 'utf8')).toContain('b'.repeat(50));
    expect(readFileSync(file, 'utf8')).toContain('c'.repeat(50));
    expect(readFileSync(`${file}.old`, 'utf8')).not.toContain('a'.repeat(50));
  });

  it('never fails the app when the file cannot be written, and says so once', () => {
    const dir = folder();
    // A file where the folder should be: the log cannot be created.
    writeFileSync(join(dir, 'blocked'), '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const log = new LogFile(join(dir, 'blocked', 'partbuddy.log'));
    expect(() => {
      log.write('one');
      log.write('two');
    }).not.toThrow();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(existsSync(join(dir, 'blocked', 'partbuddy.log'))).toBe(false);
  });
});
