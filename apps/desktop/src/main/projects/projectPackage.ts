import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';

import { unzipSync, zipSync, type Zippable } from 'fflate';

import { isInside, safeDesignFileName } from '../solidcraft/headless';
import { ProjectStore } from './projectStore';

/**
 * A project as one file (plan step P3): `<name>.partbuddy` is a zip of the project folder with a
 * manifest, like Fusion's .f3z or Shapr3D's .shapr. Exports are left out (they are made again from
 * the design); versions, chat, sketches and the parts list travel with it. Importing always makes a
 * new project and checks every entry first, because the file may come from anyone.
 */

export const PACKAGE_EXTENSION = 'partbuddy';
const MANIFEST = 'partbuddy-package.json';
/** Left out of a package: files PartBuddy makes again, and half-written ones. */
const SKIPPED_FOLDERS = new Set(['exports']);
const MAX_ENTRIES = 20_000;
const MAX_UNPACKED = 2 * 1024 * 1024 * 1024;
const MAX_PACKAGE_BYTES = 512 * 1024 * 1024;
/** One path segment: no separators, no `..`, no drive letters or other characters Windows refuses. */
const SEGMENT = /^(?!\.{1,2}$)[^<>:"/\\|?*]{1,255}$/;
const safeSegment = (segment: string) => SEGMENT.test(segment) && !/\p{Cc}/u.test(segment);

function collect(folder: string, root: string, into: Zippable, prefix: string): void {
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) {
      if (folder === root && SKIPPED_FOLDERS.has(entry.name)) continue;
      collect(path, root, into, prefix);
    } else if (entry.isFile() && !entry.name.endsWith('.tmp')) {
      into[`${prefix}/${relative(root, path).split(sep).join('/')}`] = readFileSync(path);
    }
  }
}

/** Writes the project of `design` as one package file to `target`. */
export function exportPackage(design: string, target: string, appVersion: string): void {
  const folder = ProjectStore.folderOf(design);
  const name = basename(folder);
  const files: Zippable = { [MANIFEST]: Buffer.from(JSON.stringify({ schema: 1, name, app: appVersion })) };
  collect(folder, folder, files, name);
  const temporary = `${target}.${String(process.pid)}.tmp`;
  writeFileSync(temporary, zipSync(files, { level: 6 }));
  renameSync(temporary, target);
}

/** The project folder name and its entries of a package, after every check; throws with the reason. */
export function readPackage(bytes: Uint8Array): { name: string; files: Map<string, Uint8Array> } {
  let count = 0;
  let unpacked = 0;
  // shortcut: the sizes are those the zip declares; fflate stops at them, so a lying entry is cut short, not unbounded.
  const entries = unzipSync(bytes, {
    filter: (file) => {
      count += 1;
      unpacked += file.originalSize;
      if (count > MAX_ENTRIES || unpacked > MAX_UNPACKED) throw new Error('the package is too large');
      return true;
    },
  });
  const manifest = entries[MANIFEST];
  if (!manifest) throw new Error('not a PartBuddy project package');
  const files = new Map<string, Uint8Array>();
  let name: string | null = null;
  for (const [path, content] of Object.entries(entries)) {
    if (path === MANIFEST || path.endsWith('/')) continue;
    const segments = path.split('/');
    if (segments.length < 2 || !segments.every(safeSegment)) throw new Error(`the package holds an unsafe path: ${path.slice(0, 200)}`);
    const [top, ...rest] = segments as [string, ...string[]];
    if (name !== null && top !== name) throw new Error('the package holds more than one project');
    name = top;
    files.set(rest.join('/'), content);
  }
  if (name === null || safeDesignFileName(name) !== name || !files.has(`${name}.sc`)) throw new Error('the package holds no design');
  return { name, files };
}

/**
 * Makes a new project from a package file and returns its design file. The files are written to a
 * folder of their own first and move into the project folder in one step, under the package's name
 * or the next free one.
 */
export async function importPackage(file: string, store: ProjectStore): Promise<string> {
  if (statSync(file).size > MAX_PACKAGE_BYTES) throw new Error('the package is larger than 512 MB');
  const { name, files } = readPackage(readFileSync(file));
  const staging = join(store.folder, `.import-${String(process.pid)}-${Date.now().toString(36)}`);
  const project = join(staging, name);
  try {
    for (const [path, content] of files) {
      const target = join(project, ...path.split('/'));
      if (!isInside(project, target)) throw new Error('the package holds an unsafe path');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
    return await store.rename(ProjectStore.designIn(project), basename(store.freeFolder(name)));
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
