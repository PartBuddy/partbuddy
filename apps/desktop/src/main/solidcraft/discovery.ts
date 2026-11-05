import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';

/**
 * Finds a running SolidCraft through the files its control channel writes (SolidCraft 0.30.1,
 * docs/control-protocol.md "Token" and "Finding the port"): `current.port`, `<port>.token` and
 * `<port>.pid` in the control folder. The token is only read, never logged or passed on.
 */

export interface Environment {
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  home: string;
  /** True when a process with this id exists. */
  isAlive(pid: number): boolean;
  /** The SolidCraft program the user chose in the settings (R0), or null for the automatic search. */
  configured?: () => string | null;
}

export const systemEnvironment: Environment = {
  platform: process.platform,
  env: process.env,
  home: homedir(),
  isAlive(pid) {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      // EPERM: the process exists but belongs to someone else.
      return (error as NodeJS.ErrnoException).code === 'EPERM';
    }
  },
};

export function controlDirectory(environment: Environment): string {
  const { env, platform, home } = environment;
  if (env.SOLIDCRAFT_CONTROL_DIR) return env.SOLIDCRAFT_CONTROL_DIR;
  if (platform === 'win32') return join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'SolidCraft', 'control');
  if (platform === 'darwin') return join(home, 'Library', 'Application Support', 'SolidCraft', 'control');
  return join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'solidcraft', 'control');
}

export interface ControlEndpoint {
  port: number;
  token: string;
  pid: number;
  /** When the token file was written, in milliseconds since the epoch. */
  writtenAt: number;
}

export type EndpointLookup =
  | { found: true; endpoint: ControlEndpoint }
  | { found: false; reason: 'noFiles' | 'stale' | 'unreadable' };

const TOKEN_PATTERN = /^[0-9a-fA-F]{32,}$/;

function readInteger(path: string): number | null {
  if (!existsSync(path)) return null;
  // Linux adds the start time after the pid; only the first number is the pid.
  const value = Number.parseInt(readFileSync(path, 'utf8').trim().split(/\s+/)[0] ?? '', 10);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Reads the endpoint of the app that listens on `port`, if its files are present and its process lives. */
export function endpointForPort(environment: Environment, port: number): EndpointLookup {
  const dir = controlDirectory(environment);
  const tokenPath = join(dir, `${port}.token`);
  const pid = readInteger(join(dir, `${port}.pid`));
  if (!existsSync(tokenPath) || pid === null) return { found: false, reason: 'noFiles' };
  if (!environment.isAlive(pid)) return { found: false, reason: 'stale' };
  try {
    const token = (environment.env.SOLIDCRAFT_CONTROL_TOKEN ?? readFileSync(tokenPath, 'utf8')).trim();
    if (!TOKEN_PATTERN.test(token)) return { found: false, reason: 'unreadable' };
    return { found: true, endpoint: { port, token, pid, writtenAt: statSync(tokenPath).mtimeMs } };
  } catch {
    return { found: false, reason: 'unreadable' };
  }
}

/** The most recently started SolidCraft with an open control channel, from `current.port`. */
export function findRunning(environment: Environment): EndpointLookup {
  const port = readInteger(join(controlDirectory(environment), 'current.port'));
  if (port === null || port > 65535) return { found: false, reason: 'noFiles' };
  return endpointForPort(environment, port);
}

/** Where the SolidCraft program came from: a test override, the user's choice, or the automatic search. */
export type ExecutableSource = 'override' | 'setting' | 'automatic';

/**
 * The SolidCraft desktop app PartBuddy uses, or null when none is found. A test override wins, then
 * the program the user chose; a chosen program that no longer exists counts as missing instead of
 * silently falling back to another version.
 */
export function locateExecutable(
  environment: Environment,
  exists: (path: string) => boolean = existsSync,
): { path: string | null; source: ExecutableSource } {
  const { env, platform } = environment;
  const override = env.PARTBUDDY_SOLIDCRAFT_EXE;
  if (override) return { path: exists(override) ? override : null, source: 'override' };
  const configured = environment.configured?.() ?? null;
  if (configured) return { path: exists(configured) ? configured : null, source: 'setting' };
  const name = platform === 'win32' ? 'solidcraft.exe' : 'solidcraft';
  const candidates: string[] = [];
  if (platform === 'win32') {
    for (const root of [env.ProgramFiles, env.LOCALAPPDATA && join(env.LOCALAPPDATA, 'Programs')]) {
      if (root) candidates.push(join(root, 'SolidCraft', name));
    }
  }
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (dir) candidates.push(join(dir, name));
  }
  return { path: candidates.find((path) => exists(path)) ?? null, source: 'automatic' };
}

/** Path of the SolidCraft desktop app, or null when it is not installed. */
export function findExecutable(environment: Environment, exists: (path: string) => boolean = existsSync): string | null {
  return locateExecutable(environment, exists).path;
}

/** The command-line program next to the desktop app (`solidcraft-cli`), which runs the headless engine. */
export function cliBeside(executable: string, platform: NodeJS.Platform = process.platform): string {
  return join(dirname(executable), platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli');
}
