import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

import { ProjectStore, readPreview, whenFree } from './projectStore';

/**
 * PartBuddy's own recycle bin (plan step P2, decided 2026-11-07): a deleted project folder moves
 * whole into `<projects>\\.trash\\<id>\\<name>` with a note when it went. The start page restores it;
 * after 30 days, or when the user empties the bin, the folder goes on to the Windows recycle bin, so
 * nothing is ever removed for good by PartBuddy. `.trash` can never be a project: names lose their
 * dots (`safeDesignFileName`) and the folder holds no `.trash.sc`.
 */

export const TRASH_FOLDER = '.trash';
export const TRASH_DAYS = 30;
const NOTE = 'trashed.json';
const ID = /^t-[a-z0-9]{1,20}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The start page shows the newest; older entries stay in the folder until they expire. */
const MAX_LISTED = 200;

export interface TrashEntry {
  id: string;
  name: string;
  /** When it was deleted, in milliseconds since 1970. */
  trashed: number;
  preview: string | null;
}

export class ProjectTrash {
  constructor(
    private readonly store: ProjectStore,
    /** Hands a folder to the system's recycle bin (Electron's `shell.trashItem`). */
    private readonly discard: (folder: string) => Promise<void>,
    private readonly now: () => number = Date.now,
  ) {}

  get folder(): string {
    return join(this.store.folder, TRASH_FOLDER);
  }

  /** Moves a project folder of the store into the bin and returns its id. */
  async put(design: string): Promise<string> {
    if (!this.store.holds(design)) throw new Error('not a project in the project folder');
    const project = ProjectStore.folderOf(design);
    let time = this.now();
    let id = `t-${time.toString(36)}`;
    while (existsSync(join(this.folder, id))) {
      time += 1;
      id = `t-${time.toString(36)}`;
    }
    const slot = join(this.folder, id);
    mkdirSync(slot, { recursive: true });
    const name = basename(project);
    writeFileSync(join(slot, NOTE), JSON.stringify({ name, trashed: this.now() }));
    try {
      await whenFree(() => renameSync(project, join(slot, name)));
    } catch (error) {
      rmSync(slot, { recursive: true, force: true });
      throw error;
    }
    return id;
  }

  /** The deleted projects, newest first; slots without a readable note or folder are left out. */
  list(): TrashEntry[] {
    let ids: string[];
    try {
      ids = readdirSync(this.folder);
    } catch {
      return [];
    }
    const entries: TrashEntry[] = [];
    for (const id of ids) {
      const entry = this.read(id);
      if (entry) entries.push({ id, name: entry.name, trashed: entry.trashed, preview: readPreview(entry.project).preview });
    }
    return entries.sort((a, b) => b.trashed - a.trashed).slice(0, MAX_LISTED);
  }

  /** Puts a deleted project back under its name, or the next free one; returns its design file. */
  async restore(id: string): Promise<string> {
    const entry = this.read(id);
    if (!entry) throw new Error('not a project in the recycle bin');
    const name = basename(this.store.freeFolder(entry.name));
    const design = await this.store.rename(ProjectStore.designIn(entry.project), name);
    rmSync(join(this.folder, id), { recursive: true, force: true });
    return design;
  }

  /** Hands entries to the system's recycle bin: all of them, or those older than 30 days. */
  async empty(onlyExpired = false): Promise<number> {
    let handed = 0;
    for (const entry of this.list()) {
      if (onlyExpired && this.now() - entry.trashed < TRASH_DAYS * DAY_MS) continue;
      await whenFree(() => this.discard(join(this.folder, entry.id)));
      handed += 1;
    }
    return handed;
  }

  private read(id: string): { name: string; trashed: number; project: string } | null {
    if (!ID.test(id)) return null;
    try {
      const note = JSON.parse(readFileSync(join(this.folder, id, NOTE), 'utf8')) as { name?: unknown; trashed?: unknown };
      if (typeof note.name !== 'string' || typeof note.trashed !== 'number') return null;
      // The note's name is only trusted as one folder inside the slot.
      const name = basename(note.name);
      const project = join(this.folder, id, name);
      return name && name !== '.' && name !== '..' && existsSync(ProjectStore.designIn(project)) ? { name, trashed: note.trashed, project } : null;
    } catch {
      return null;
    }
  }
}
