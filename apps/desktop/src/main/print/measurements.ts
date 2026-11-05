import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { measurementsSchema, type Measurement, type StoredMeasurement } from '../../shared/contract';

/** Older entries go first once the file holds this many. */
const MAX_ENTRIES = 500;

/**
 * Measurements after printing (M7), for every material of this installation, in one small file in
 * the app's data folder. Read back as untrusted input: a damaged file starts empty.
 */
export class Measurements {
  private serial = 0;

  constructor(
    private readonly file: string,
    private readonly log: (message: string) => void,
  ) {}

  all(): StoredMeasurement[] {
    if (!existsSync(this.file)) return [];
    try {
      const parsed = measurementsSchema.safeParse(JSON.parse(readFileSync(this.file, 'utf8')));
      if (parsed.success) return parsed.data;
      this.log('the measurements do not match their format and are left out');
    } catch (error) {
      this.log(`the measurements could not be read: ${(error as Error).message}`);
    }
    return [];
  }

  add(material: string, measurement: Measurement, now = new Date()): StoredMeasurement[] {
    this.serial += 1;
    const id = `m-${now.getTime().toString(36)}${this.serial.toString(36)}`;
    const entry: StoredMeasurement = { ...measurement, id, material, at: now.toISOString() };
    return this.write([...this.all(), entry].slice(-MAX_ENTRIES));
  }

  remove(id: string): StoredMeasurement[] {
    return this.write(this.all().filter((entry) => entry.id !== id));
  }

  private write(entries: StoredMeasurement[]): StoredMeasurement[] {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(`${this.file}.tmp`, JSON.stringify(entries), 'utf8');
    renameSync(`${this.file}.tmp`, this.file);
    return entries;
  }
}
