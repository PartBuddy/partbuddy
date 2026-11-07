import { copyFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

import { isInside, safeDesignFileName } from '../solidcraft/headless';

/** Body names SolidCraft gives on its own; they say nothing about the part. */
const GENERIC_BODY = /^(body|körper|solid)\s*\d*$/i;
/** What SolidCraft calls a design that was never saved. */
const UNTITLED = 'Untitled';
/** Files that belong to a design and travel with it: the conversation and the print settings. */
const COMPANIONS = ['.chat.json', '.print.json'];
/** The picture of a project on the start page (B3), written by PartBuddy after a save. */
export const PREVIEW_FILE = 'preview.png';
/** The ready-to-print state the picture was taken with, for the light on the start page. */
const PREVIEW_NOTE = 'preview.json';
/** A preview is a small picture; anything larger is not one of PartBuddy's. */
export const MAX_PREVIEW_BYTES = 1024 * 1024;
/** More projects than the start page shows; the oldest are left out. */
const MAX_PROJECTS = 500;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type ProjectCheck = 'ready' | 'warn' | 'block';

/** A project as the start page shows it (B3). */
export interface ProjectEntry {
  name: string;
  folder: string;
  /** When the design file was last written, in milliseconds since 1970. */
  modified: number;
  /** When the project folder was made, in milliseconds since 1970. */
  created: number;
  /** The preview picture as a data URL, or null when there is none yet. */
  preview: string | null;
  /** The ready-to-print light at the last preview, or null when it is not known. */
  check: ProjectCheck | null;
}

/** `Grundplatte.sc` → `Grundplatte.chat.json` (as `chatFileOf` and `printFileOf` name them). */
function companionOf(design: string, suffix: string): string {
  return `${design.replace(/\.sc$/i, '')}${suffix}`;
}

/**
 * Projects (plan step B2, decided 2026-11-05): one visible folder per project in the user's
 * project folder (`Documents\\PartBuddy` by default), holding the design `<name>.sc` and next to it
 * the conversation, the print settings and the exports. A note in PartBuddy's state folder says
 * which project was open last. Names become folder and file names only through
 * `safeDesignFileName`, so no name leads out of the project folder.
 */
export class ProjectStore {
  constructor(
    /** The user's project folder; every project is a folder in it. */
    private readonly root: string,
    /** PartBuddy's own folder for the note of the last project (and, before B2, the designs). */
    private readonly stateDir: string,
    /** The name of a new part before it has one of its own ("Teil", "Part"). */
    private readonly fallbackName = 'Part',
  ) {}

  get folder(): string {
    return this.root;
  }

  /** The design file of a project folder: `<folder>\\<folder name>.sc`. */
  static designIn(folder: string): string {
    return join(folder, `${basename(folder)}.sc`);
  }

  /** The project folder of a design file. */
  static folderOf(design: string): string {
    return dirname(design);
  }

  /** A folder for a new project that no project has yet: `Name`, `Name 2` … */
  freeFolder(name: string): string {
    const safe = safeDesignFileName(name);
    for (let n = 1; n < 1000; n += 1) {
      const folder = join(this.root, n === 1 ? safe : `${safe} ${String(n)}`);
      if (!existsSync(folder)) return folder;
    }
    return join(this.root, `${safe} ${String(Date.now())}`);
  }

  /** The design file of a new project named `name`, in a folder of its own. */
  newDesignFile(name: string): string {
    return ProjectStore.designIn(this.freeFolder(name));
  }

  /**
   * Where the autosave of the open design goes: its own file once it has one. A new design is not
   * saved while it is empty; then it gets a project named after the design, the name the
   * assistant's plan gave the part, its first body with a real name, or the fallback name.
   */
  autosaveTarget(designFile: string | null, designName: string, bodyNames: string[], hasContent: boolean, planned: string | null = null): string | null {
    if (designFile) return designFile;
    if (!hasContent) return null;
    if (safeDesignFileName(designName) !== UNTITLED) return this.newDesignFile(designName);
    if (planned && safeDesignFileName(planned) !== UNTITLED) return this.newDesignFile(planned);
    const named = bodyNames.find((body) => !GENERIC_BODY.test(body.trim()) && safeDesignFileName(body) !== UNTITLED);
    return this.newDesignFile(named ?? this.fallbackName);
  }

  /**
   * The projects in the project folder, newest first (B3): every folder directly in it that holds
   * a design named like the folder. Folders without one are someone else's and are left out.
   */
  list(): ProjectEntry[] {
    let entries: string[];
    try {
      entries = readdirSync(this.root);
    } catch {
      return [];
    }
    const projects: Omit<ProjectEntry, 'preview' | 'check'>[] = [];
    for (const entry of entries) {
      const folder = join(this.root, entry);
      const design = ProjectStore.designIn(folder);
      try {
        const folderStats = statSync(folder);
        if (!folderStats.isDirectory()) continue;
        const stats = statSync(design);
        // Some file systems do not keep a birth time; the last change stands in for it.
        if (stats.isFile()) projects.push({ name: entry, folder, modified: stats.mtimeMs, created: folderStats.birthtimeMs || stats.mtimeMs });
      } catch {
        // No design in it: not a project.
      }
    }
    projects.sort((a, b) => b.modified - a.modified);
    return projects.slice(0, MAX_PROJECTS).map((project) => ({ ...project, ...readPreview(project.folder) }));
  }

  /** The design of a project folder from the start page, if it is a project of this store. */
  designOfFolder(folder: string): string | null {
    if (!isAbsolute(folder) || resolve(dirname(folder)) !== resolve(this.root)) return null;
    const design = ProjectStore.designIn(resolve(folder));
    return existsSync(design) && statSync(design).isFile() ? design : null;
  }

  /**
   * Writes the preview picture of a project and the light it was taken with (B3). Only a PNG of at
   * most 1 MiB goes into a project of this store; the files are replaced in one step each.
   */
  writePreview(design: string, png: Buffer, check: ProjectCheck | null): boolean {
    if (!this.holds(design) || !existsSync(design)) return false;
    if (png.length > MAX_PREVIEW_BYTES || png.length < PNG_SIGNATURE.length || !png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return false;
    const folder = ProjectStore.folderOf(design);
    replaceFile(join(folder, PREVIEW_FILE), png);
    replaceFile(join(folder, PREVIEW_NOTE), JSON.stringify({ check }));
    return true;
  }

  /** Whether a design file belongs to a project of this store. */
  holds(design: string): boolean {
    return isInside(this.root, design) && resolve(dirname(design)) !== resolve(this.root);
  }

  /** The project to open on start, if its design still exists. Notes from before B2 name a file in the state folder. */
  last(): string | undefined {
    try {
      const note = JSON.parse(readFileSync(join(this.stateDir, 'last.json'), 'utf8')) as { file?: unknown };
      if (typeof note.file !== 'string' || !note.file.toLowerCase().endsWith('.sc')) return undefined;
      const file = isAbsolute(note.file) ? resolve(note.file) : join(this.stateDir, note.file.replace(/[\\/]/g, ''));
      if (!isInside(this.root, file) && !isInside(this.stateDir, file)) return undefined;
      return existsSync(file) ? file : undefined;
    } catch {
      return undefined;
    }
  }

  remember(file: string): void {
    mkdirSync(this.stateDir, { recursive: true });
    writeFileSync(join(this.stateDir, 'last.json'), JSON.stringify({ file: resolve(file) }));
  }

  forget(): void {
    mkdirSync(this.stateDir, { recursive: true });
    writeFileSync(join(this.stateDir, 'last.json'), JSON.stringify({}));
  }

  /**
   * A project name the user typed, as it would become the folder name; null when nothing is left
   * of it or a project of that name exists already.
   */
  usableName(name: string, current?: string): { ok: true; name: string } | { ok: false; reason: 'empty' | 'exists' } {
    const safe = safeDesignFileName(name.trim());
    if (safe === UNTITLED && name.trim().toLowerCase() !== UNTITLED.toLowerCase()) return { ok: false, reason: 'empty' };
    const folder = join(this.root, safe);
    if (existsSync(folder) && (!current || resolve(folder) !== resolve(ProjectStore.folderOf(current)))) return { ok: false, reason: 'exists' };
    return { ok: true, name: safe };
  }

  /**
   * Renames a project: its folder and the design's files in it (design, backup, conversation, print
   * settings), while SolidCraft has the design closed. Returns the new design file.
   */
  async rename(design: string, name: string): Promise<string> {
    const folder = ProjectStore.folderOf(design);
    const target = join(this.root, safeDesignFileName(name));
    if (resolve(target) !== resolve(folder)) await whenFree(() => renameSync(folder, target));
    return whenFree(() => renameDesignFiles(target, basename(design, '.sc'), basename(target)));
  }

  /** Copies a project into a new folder named "<name> <suffix>" and returns the copy's design file. */
  duplicate(design: string, suffix: string): string {
    const folder = ProjectStore.folderOf(design);
    const target = this.freeFolder(`${basename(folder)} ${suffix}`);
    cpSync(folder, target, { recursive: true, errorOnExist: true });
    return renameDesignFiles(target, basename(design, '.sc'), basename(target));
  }

  /**
   * Copies a design file from anywhere into a new project, with its conversation and print
   * settings when they lie next to it. The original stays untouched (a design saved by SolidCraft
   * 0.40 cannot go back to 0.30, ADR 0024). Returns the new design file.
   */
  importDesign(source: string, name = basename(source, '.sc')): string {
    const target = this.newDesignFile(name);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
    for (const suffix of COMPANIONS) {
      const from = companionOf(source, suffix);
      if (existsSync(from) && statSync(from).isFile()) copyFileSync(from, companionOf(target, suffix));
    }
    return target;
  }
}

/** Writes a file next to its place first and then moves it there, so no reader sees half of it. */
function replaceFile(file: string, content: Buffer | string): void {
  const temporary = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(temporary, content);
  renameSync(temporary, file);
}

/** The preview of a project folder and its light; nothing when the files are missing or wrong. */
export function readPreview(folder: string): Pick<ProjectEntry, 'preview' | 'check'> {
  let preview: string | null = null;
  let check: ProjectCheck | null = null;
  try {
    const file = join(folder, PREVIEW_FILE);
    if (statSync(file).size <= MAX_PREVIEW_BYTES) {
      const png = readFileSync(file);
      if (png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) preview = `data:image/png;base64,${png.toString('base64')}`;
    }
  } catch {
    preview = null;
  }
  try {
    const note = JSON.parse(readFileSync(join(folder, PREVIEW_NOTE), 'utf8')) as { check?: unknown };
    if (note.check === 'ready' || note.check === 'warn' || note.check === 'block') check = note.check;
  } catch {
    check = null;
  }
  return { preview, check };
}

/**
 * Runs a file operation, again for up to five seconds while Windows still reports the files as in
 * use: the SolidCraft engine that had the design open may take a moment to exit.
 */
export async function whenFree<T>(work: () => T | Promise<T>, timeoutMs = 5000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    try {
      return await work();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if ((code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') || Date.now() > until) throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

/** Renames `<from>.sc` and its companions in a folder to `<to>…`; returns the design file. */
function renameDesignFiles(folder: string, from: string, to: string): string {
  if (from !== to) {
    for (const suffix of ['.sc', '.sc.bak', ...COMPANIONS]) {
      const old = join(folder, `${from}${suffix}`);
      if (existsSync(old)) renameSync(old, join(folder, `${to}${suffix}`));
    }
  }
  return join(folder, `${to}.sc`);
}

/**
 * Moves the designs PartBuddy kept in its own folder before projects existed (B2) into project
 * folders, once. They are copied, not moved: the originals stay as a backup. The note of the last
 * design follows its copy. Returns how many designs became projects.
 */
export function migrateDesigns(designsDir: string, store: ProjectStore, log: (message: string) => void): number {
  if (!existsSync(designsDir)) return 0;
  const doneFile = join(designsDir, 'migrated.json');
  let done: string[] = [];
  try {
    const parsed = JSON.parse(readFileSync(doneFile, 'utf8')) as { files?: unknown };
    if (Array.isArray(parsed.files)) done = parsed.files.filter((file): file is string => typeof file === 'string');
  } catch {
    done = [];
  }
  const last = store.last();
  let moved = 0;
  for (const entry of readdirSync(designsDir)) {
    if (!entry.toLowerCase().endsWith('.sc') || done.includes(entry)) continue;
    const source = join(designsDir, entry);
    if (!statSync(source).isFile()) continue;
    try {
      const target = store.importDesign(source);
      if (last && resolve(last) === resolve(source)) store.remember(target);
      done.push(entry);
      moved += 1;
      log(`design ${entry} became the project ${basename(dirname(target))}`);
    } catch (error) {
      log(`design ${entry} could not become a project: ${(error as Error).message}`);
    }
  }
  if (moved > 0) writeFileSync(doneFile, JSON.stringify({ files: done }));
  return moved;
}
