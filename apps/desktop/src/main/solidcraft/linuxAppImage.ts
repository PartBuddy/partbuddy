import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

export const isAppImage = (path: string): boolean => /\.appimage$/i.test(path);

/** Parse Exec as desktop-entry arguments, never as a shell command. */
function desktopExecutable(value: string): string | null {
  const args: string[] = [];
  let word = '';
  let quoted = false;
  let escaped = false;
  for (const char of value) {
    if (escaped) { word += char; escaped = false; }
    else if (char === '\\') escaped = true;
    else if (char === '"') quoted = !quoted;
    else if (/\s/.test(char) && !quoted) {
      if (word) args.push(word);
      word = '';
    } else word += char;
  }
  if (escaped || quoted) return null;
  if (word) args.push(word);
  if (args[0] === 'env' || args[0] === '/usr/bin/env') {
    args.shift();
    while (/^[A-Za-z_][A-Za-z0-9_]*=/.test(args.at(0) ?? '')) args.shift();
  }
  return args[0] ?? null;
}

/** Gear Lever and other AppImage managers register their actual install path in a desktop entry. */
export function findLinuxAppImage(home: string, env: NodeJS.ProcessEnv, exists: (path: string) => boolean): string | null {
  const roots = [env.XDG_DATA_HOME ?? join(home, '.local', 'share'), ...(env.XDG_DATA_DIRS ?? '/usr/local/share:/usr/share').split(':')];
  for (const root of roots.filter(isAbsolute)) {
    const folder = join(root, 'applications');
    let names: string[];
    try { names = readdirSync(folder).filter((name) => name.endsWith('.desktop')).sort(); }
    catch { continue; }
    for (const name of names) {
      try {
        const fields = new Map<string, string>();
        let entry = false;
        for (const line of readFileSync(join(folder, name), 'utf8').split(/\r?\n/)) {
          if (line.startsWith('[')) entry = line.trim() === '[Desktop Entry]';
          if (!entry || line.startsWith('#')) continue;
          const match = /^([^=]+)=(.*)$/.exec(line);
          if (match?.[1]) fields.set(match[1], match[2] ?? '');
        }
        if (fields.get('Type') !== 'Application' || fields.get('Hidden') === 'true') continue;
        if (![fields.get('Name'), fields.get('X-AppImage-Name')].some((value) => value?.toLowerCase() === 'solidcraft')) continue;
        const candidates = [fields.get('TryExec'), desktopExecutable(fields.get('Exec') ?? '')];
        for (const candidate of candidates) {
          if (candidate && isAbsolute(candidate) && isAppImage(candidate) && exists(candidate)) return candidate;
        }
      } catch {
        // A stale or unreadable menu entry must not prevent the rest of the search.
      }
    }
  }
  return null;
}

/** A private CLI launcher for the CLI already bundled in SolidCraft's AppImage. */
export function appImageCli(image: string, cacheHome: string): string {
  const id = createHash('sha256').update(image).digest('hex').slice(0, 24);
  const folder = join(cacheHome, 'PartBuddy', 'solidcraft-appimages', id);
  const cli = join(folder, 'solidcraft-cli');
  const quotedImage = `'${image.replaceAll("'", "'\\''")}'`;
  const script = `#!/bin/sh\nSOLIDCRAFT_APPIMAGE_CLI=1 SOLIDCRAFT_NO_DESKTOP_INTEGRATION=1 exec ${quotedImage} "$@"\n`;
  if (existsSync(cli) && readFileSync(cli, 'utf8') === script) return cli;
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const pending = `${cli}.${process.pid}.tmp`;
  writeFileSync(pending, script, { mode: 0o700 });
  renameSync(pending, cli);
  return cli;
}
