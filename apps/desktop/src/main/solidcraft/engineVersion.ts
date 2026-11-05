import { execFile } from 'node:child_process';

/**
 * Which SolidCraft version PartBuddy runs on (R0, ADR 0024). PartBuddy is developed against 0.40
 * with the solidcore kernel; 0.30.1 still works and stays selectable until 0.40.0 is released.
 */

export type EngineSupport = 'recommended' | 'supported' | 'tooOld' | 'unknown';

interface Version {
  major: number;
  minor: number;
  patch: number;
  /** Pre-release parts after the dash (`rc.2` → ['rc', 2]); empty for a release. */
  pre: (string | number)[];
}

/** The oldest version PartBuddy's contract tests pass on. */
export const MINIMUM_VERSION = '0.30.1';
/** The version PartBuddy is developed against. */
export const RECOMMENDED_VERSION = '0.40.0-rc.2';

/** `solidcraft-cli 0.40.0-rc.2` or `0.40.0-rc.2` → the version text; null when there is none. */
export function versionFromOutput(output: string): string | null {
  const match = /(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)/.exec(output);
  return match?.[1] ?? null;
}

function parse(text: string): Version | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(text.trim());
  if (!match) return null;
  const pre = match[4] ? match[4].split('.').map((part) => (/^\d+$/.test(part) ? Number(part) : part)) : [];
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]), pre };
}

/** Semantic-version order: negative when `a` is older than `b`. A pre-release comes before its release. */
export function compareVersions(a: string, b: string): number {
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) throw new Error(`not a version: ${left ? b : a}`);
  for (const key of ['major', 'minor', 'patch'] as const) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  if (left.pre.length === 0 || right.pre.length === 0) return right.pre.length - left.pre.length;
  for (let i = 0; i < Math.max(left.pre.length, right.pre.length); i++) {
    const x = left.pre[i];
    const y = right.pre[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    // Numeric identifiers come before text ones.
    if (typeof x === 'number') return -1;
    if (typeof y === 'number') return 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

export function supportOf(version: string | null): EngineSupport {
  if (!version || !parse(version)) return 'unknown';
  if (compareVersions(version, RECOMMENDED_VERSION) >= 0) return 'recommended';
  if (compareVersions(version, MINIMUM_VERSION) >= 0) return 'supported';
  return 'tooOld';
}

/** Asks `solidcraft-cli --version`; null when it does not answer within ten seconds. */
export function readVersion(cli: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(cli, ['--version'], { timeout: 10_000, windowsHide: true, shell: false }, (error, stdout) => {
      resolve(error ? null : versionFromOutput(stdout));
    });
  });
}
