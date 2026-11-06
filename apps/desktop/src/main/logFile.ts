import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * PartBuddy's log on disk: each line with its time, so a problem on another computer can be read
 * afterwards instead of reproduced. Kept small: past `maxBytes` the file becomes `<name>.old` (the
 * one before is dropped) and a new one starts. Writing never fails the app.
 */
export class LogFile {
  private failed = false;

  constructor(
    readonly file: string,
    private readonly maxBytes = 1024 * 1024,
  ) {}

  write(message: string, when = new Date()): void {
    if (this.failed) return;
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      if (this.size() >= this.maxBytes) renameSync(this.file, `${this.file}.old`);
      appendFileSync(this.file, `${when.toISOString()} ${message.replace(/\r?\n/g, ' ⏎ ')}\n`);
    } catch (error) {
      // One note on the console, then the log stays on the console only.
      this.failed = true;
      console.warn(`[partbuddy] log file not writable: ${(error as Error).message}`);
    }
  }

  private size(): number {
    try {
      return statSync(this.file).size;
    } catch {
      return 0;
    }
  }
}
