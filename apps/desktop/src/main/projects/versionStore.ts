import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { MAX_PREVIEW_BYTES, PREVIEW_FILE } from './projectStore';

/**
 * Why a version was saved (B5): by the user with a name, at an export, before a request to the
 * assistant, or as the state before a restore.
 */
export type VersionReason = 'manual' | 'export' | 'assistant' | 'restore';

/** A version as the list shows it. */
export interface VersionEntry {
  id: string;
  /** When it was saved, in milliseconds since 1970. */
  created: number;
  reason: VersionReason;
  /** The user's name, the export or the start of the request to the assistant. */
  label: string;
  /** The preview picture at the time, as a data URL, or null. */
  preview: string | null;
}

interface VersionNote {
  created: number;
  reason: VersionReason;
  label: string;
  /** SHA-256 of the design file: an automatic version of an unchanged design is not saved twice. */
  hash: string;
}

/** The folder of the versions in a project, next to the design. */
export const VERSIONS_FOLDER = 'versions';
const DESIGN = 'design.sc';
const NOTE = 'version.json';
const ID = /^v-[a-z0-9]{1,20}$/;
/** Automatic versions kept per project; the user's named ones are not counted and stay. */
export const MAX_AUTOMATIC = 30;
const MAX_LISTED = 300;
const REASONS: VersionReason[] = ['manual', 'export', 'assistant', 'restore'];

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readNote(folder: string): VersionNote | null {
  try {
    const note = JSON.parse(readFileSync(join(folder, NOTE), 'utf8')) as Partial<VersionNote>;
    if (typeof note.created !== 'number' || typeof note.label !== 'string' || typeof note.hash !== 'string') return null;
    if (!REASONS.includes(note.reason as VersionReason)) return null;
    return { created: note.created, reason: note.reason as VersionReason, label: note.label.slice(0, 200), hash: note.hash };
  } catch {
    return null;
  }
}

function previewOf(folder: string): string | null {
  try {
    const file = join(folder, PREVIEW_FILE);
    if (statSync(file).size > MAX_PREVIEW_BYTES) return null;
    const png = readFileSync(file);
    return png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE) ? `data:image/png;base64,${png.toString('base64')}` : null;
  } catch {
    return null;
  }
}

/**
 * Versions of a project (plan step B5): each one a copy of the saved design with the preview
 * picture of that moment, in `<project>\\versions\\<id>`. The design file must be saved before.
 */
export class VersionStore {
  constructor(private readonly now: () => number = Date.now) {}

  static folderOf(design: string): string {
    return join(dirname(design), VERSIONS_FOLDER);
  }

  /** The versions of a project, newest first. */
  list(design: string): VersionEntry[] {
    return this.notes(design)
      .slice(0, MAX_LISTED)
      .map(({ id, note }) => ({ id, created: note.created, reason: note.reason, label: note.label, preview: previewOf(join(VersionStore.folderOf(design), id)) }));
  }

  /**
   * Saves the design as it is on disk now. An automatic version (`skipUnchanged`) is left out when
   * the newest version holds the same design. Returns the new version's id, or null.
   */
  save(design: string, reason: VersionReason, label: string, skipUnchanged: boolean): string | null {
    const bytes = readFileSync(design);
    const hash = createHash('sha256').update(bytes).digest('hex');
    const notes = this.notes(design);
    if (skipUnchanged && notes[0]?.note.hash === hash) return null;
    const root = VersionStore.folderOf(design);
    let created = this.now();
    let id = `v-${created.toString(36)}`;
    while (existsSync(join(root, id))) {
      created += 1;
      id = `v-${created.toString(36)}`;
    }
    const folder = join(root, id);
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, DESIGN), bytes);
    const preview = join(dirname(design), PREVIEW_FILE);
    if (existsSync(preview) && statSync(preview).size <= MAX_PREVIEW_BYTES) copyFileSync(preview, join(folder, PREVIEW_FILE));
    const note: VersionNote = { created, reason, label: label.trim().slice(0, 200), hash };
    writeFileSync(join(folder, NOTE), JSON.stringify(note));
    this.prune(design);
    return id;
  }

  /** The design file of a version of this project, or null for an id that is not one. */
  fileOf(design: string, id: string): string | null {
    if (!ID.test(id)) return null;
    const file = join(VersionStore.folderOf(design), id, DESIGN);
    return existsSync(file) && statSync(file).isFile() ? file : null;
  }

  /** Removes the oldest automatic versions beyond the limit; named versions stay. */
  private prune(design: string): void {
    const automatic = this.notes(design).filter(({ note }) => note.reason !== 'manual');
    for (const { id } of automatic.slice(MAX_AUTOMATIC)) rmSync(join(VersionStore.folderOf(design), id), { recursive: true, force: true });
  }

  private notes(design: string): { id: string; note: VersionNote }[] {
    const root = VersionStore.folderOf(design);
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      return [];
    }
    const found: { id: string; note: VersionNote }[] = [];
    for (const id of entries) {
      if (!ID.test(id)) continue;
      const folder = join(root, id);
      const note = readNote(folder);
      if (note && existsSync(join(folder, DESIGN))) found.push({ id, note });
    }
    return found.sort((a, b) => b.note.created - a.note.created);
  }
}
