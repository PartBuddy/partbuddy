import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { edgeAnchor, faceAnchor, pointAnchor, resolveAnchor, type FaceTable, type NoteAnchor, type ResolvedAnchor } from '@partbuddy/geometry';
import { z } from 'zod';

import type { NotesState, NoteView, Selection } from '../../shared/contract';
import { selectionLabel } from '../agents/viewContext';
import { cleanText, createNote, isOwnNote, newNoteId, noteKey, notesFromMetadata, quoteForModel, signNote, storedNoteSchema, unsigned, type StoredNote } from './noteRecord';

/** What the notes need from the design (the supervisor, or a test double). */
export interface NotesDesign {
  /** Document id and `document.metadata` of the design right now. */
  read(): Promise<{ documentId: string; metadata: unknown }>;
  /** Sets or removes (null) metadata keys in one undo step; the change is mirrored as usual. */
  write(values: Record<string, StoredNote | null>): Promise<void>;
  /** Face tables of the bodies the view shows, from the newest mirrored revision. */
  tables(): FaceTable[];
  /** Name of the open design, to keep the restore list per design. */
  designName(): string;
}

export interface NotesOptions {
  design: NotesDesign;
  key: Buffer;
  /** Where the restore list survives a restart (the app's data folder). */
  restoreFile: string;
  emit(state: NotesState): void;
  /** Tells the work log what the user did, for the model's next message. */
  mention(text: string): void;
}

/** How many removed notes the restore list keeps, over all designs, and for how long. */
const MAX_RESTORABLE = 50;
const RESTORE_DAYS = 30;

const restoreFileSchema = z.object({
  entries: z.array(z.object({ design: z.string().max(200), removedAt: z.string().max(40), note: storedNoteSchema }).strict()).max(500),
});
type RestoreEntry = z.infer<typeof restoreFileSchema>['entries'][number];

interface Known {
  stored: StoredNote;
  own: boolean;
  resolved: ResolvedAnchor;
}

const targetOf = (anchor: NoteAnchor): string | null =>
  anchor.kind === 'face' ? anchor.face : anchor.kind === 'edge' ? [...anchor.faces].sort().join('|') : null;

const where = (note: Known): string => {
  const anchor = note.stored.anchor;
  const target = note.resolved.target ?? targetOf(anchor);
  if (anchor.kind === 'face') return `face "${target ?? ''}" of body "${anchor.body}"`;
  if (anchor.kind === 'edge') return `edge "${target ?? ''}" of body "${anchor.body}"`;
  return `the point ${anchor.world.map((v) => Math.round(v * 100) / 100).join(' ')} mm of body "${anchor.body}"`;
};

/**
 * The notes of the open design (ADR 0020): read from `document.metadata` after every revision,
 * placed on the model by their anchors (ADR 0006), signed with PartBuddy's key. Notes that undo
 * or "go back" removed go to a restore list, so nothing the user wrote is lost without notice.
 * The assistant reads own notes only, through this service.
 */
export class NotesService {
  private documentId: string | null = null;
  private known = new Map<string, Known>();
  private unreadable = 0;
  /** Notes the user deleted: their removal is not offered for restoring. */
  private readonly deleted = new Set<string>();
  private restore: RestoreEntry[];
  private queue: Promise<unknown> = Promise.resolve();
  private shown = '';

  constructor(private readonly options: NotesOptions) {
    this.restore = this.loadRestore();
  }

  /** Reads the notes again; called after every mirrored revision. */
  refresh(): Promise<void> {
    return this.serial(() => this.read());
  }

  /** Places the known notes on the newest face tables without reading the design. */
  reposition(): void {
    const tables = this.options.design.tables();
    for (const note of this.known.values()) note.resolved = resolveAnchor(note.stored.anchor, tables);
    this.publish();
  }

  state(): NotesState {
    const design = this.options.design.designName();
    const notes: NoteView[] = [...this.known.values()].map((note) => {
      const view: NoteView = {
        id: note.stored.id,
        text: note.stored.text,
        kind: note.stored.anchor.kind,
        body: note.stored.anchor.body,
        target: note.resolved.target ?? targetOf(note.stored.anchor),
        status: note.resolved.status,
        own: note.own,
        world: note.resolved.world,
        created: note.stored.created,
      };
      if (note.resolved.normal) view.normal = note.resolved.normal;
      return view;
    });
    const restorable = this.restore
      .filter((entry) => entry.design === design && !this.known.has(entry.note.id))
      .map((entry) => ({ id: entry.note.id, text: entry.note.text, target: targetOf(entry.note.anchor) }));
    return { documentId: this.documentId, notes, restorable, unreadable: this.unreadable };
  }

  add(selection: Selection, text: string): Promise<string> {
    return this.serial(async () => {
      const clean = cleanText(text);
      if (!clean) throw new Error('the note is empty');
      const anchor = this.anchorFor(selection);
      const note = createNote(this.options.key, newNoteId(), clean, anchor);
      await this.options.design.write({ [noteKey(note.id)]: note });
      this.options.mention(`added a note on ${selectionLabel(selection)}: ${quoteForModel(note.text, 300)}`);
      await this.read();
      return note.id;
    });
  }

  edit(id: string, text: string): Promise<void> {
    return this.serial(async () => {
      const note = this.find(id);
      if (!note.own) throw new Error('accept the foreign note before you change it');
      const clean = cleanText(text);
      if (!clean) throw new Error('the note is empty');
      if (clean === note.stored.text) return;
      const rest = unsigned(note.stored);
      await this.options.design.write({ [noteKey(id)]: signNote(this.options.key, { ...rest, text: clean }) });
      this.options.mention(`changed note ${id} to ${quoteForModel(clean, 300)}`);
      await this.read();
    });
  }

  remove(id: string): Promise<void> {
    return this.serial(async () => {
      const note = this.find(id);
      this.deleted.add(id);
      await this.options.design.write({ [noteKey(id)]: null });
      if (note.own) this.options.mention(`deleted note ${id}`);
      await this.read();
    });
  }

  /** The user accepts a foreign note: PartBuddy signs it, and the assistant may read it from now on. */
  accept(id: string): Promise<void> {
    return this.serial(async () => {
      const note = this.find(id);
      if (note.own) return;
      const rest = unsigned(note.stored);
      await this.options.design.write({ [noteKey(id)]: signNote(this.options.key, rest) });
      this.options.mention(`accepted note ${id} from the design file: ${quoteForModel(note.stored.text, 300)}`);
      await this.read();
    });
  }

  /** Pins a note to a new place (an orphaned or ambiguous one, or one the user moves). */
  reattach(id: string, selection: Selection): Promise<void> {
    return this.serial(async () => {
      const note = this.find(id);
      const rest = unsigned(note.stored);
      const moved = { ...rest, anchor: this.anchorFor(selection) };
      await this.options.design.write({ [noteKey(id)]: note.own ? signNote(this.options.key, moved) : { ...moved } });
      await this.read();
    });
  }

  /** Puts a note from the restore list back into the design, as it was. */
  restoreNote(id: string): Promise<void> {
    return this.serial(async () => {
      const entry = this.restore.find((candidate) => candidate.note.id === id && candidate.design === this.options.design.designName());
      if (!entry) throw new Error('this note is no longer in the restore list');
      await this.options.design.write({ [noteKey(id)]: entry.note });
      this.drop(id);
      await this.read();
    });
  }

  dismiss(id: string): Promise<void> {
    return this.serial(() => {
      this.drop(id);
      this.publish();
      return Promise.resolve();
    });
  }

  /** Own notes on the selected faces and edges, as lines for the model's next message; null when none. */
  selectionNote(selections: readonly Selection[]): string | null {
    const lines: string[] = [];
    for (const note of this.known.values()) {
      if (!note.own) continue;
      const anchor = note.stored.anchor;
      const target = note.resolved.target ?? targetOf(anchor);
      const hit = selections.some((selection) => {
        if (selection.body !== anchor.body) return false;
        if (selection.kind === 'face') return anchor.kind === 'face' && target === selection.face;
        if (selection.kind === 'edge') return anchor.kind === 'edge' && target === selection.edge;
        return anchor.kind === 'point' && Math.hypot(...anchor.world.map((v, i) => v - (selection.point[i] ?? 0))) < 0.5;
      });
      if (hit) lines.push(`[PartBuddy: note ${note.stored.id} on ${where(note)} (${note.resolved.status}): ${quoteForModel(note.stored.text)}]`);
    }
    return lines.length > 0 ? lines.join('\n') : null;
  }

  /** The notes part of `partbuddy_view`: own notes, short, and how many foreign ones wait. */
  forView(): { notes: { id: string; on: string; status: string; text: string }[]; foreignWaiting: number } {
    const own = [...this.known.values()].filter((note) => note.own);
    return {
      notes: own.map((note) => ({ id: note.stored.id, on: where(note), status: note.resolved.status, text: quoteForModel(note.stored.text, 200) })),
      foreignWaiting: this.known.size - own.length,
    };
  }

  private anchorFor(selection: Selection): NoteAnchor {
    const table = this.options.design.tables().find((candidate) => candidate.body === selection.body);
    if (selection.kind === 'vertex') return pointAnchor(selection.body, selection.point);
    if (!table) throw new Error(`body ${selection.body} is not shown`);
    const anchor =
      selection.kind === 'face'
        ? faceAnchor(table, selection.face, selection.point, selection.normal)
        : edgeAnchor(table, selection.edge, selection.point);
    if (!anchor) throw new Error('the selected element is no longer in the design');
    return anchor;
  }

  private find(id: string): Known {
    const note = this.known.get(id);
    if (!note) throw new Error('this note is no longer in the design');
    return note;
  }

  private async read(): Promise<void> {
    const { documentId, metadata } = await this.options.design.read();
    const { notes, unreadable } = notesFromMetadata(metadata);
    const tables = this.options.design.tables();
    const next = new Map<string, Known>();
    for (const stored of notes) {
      next.set(stored.id, { stored, own: isOwnNote(this.options.key, stored), resolved: resolveAnchor(stored.anchor, tables) });
    }
    if (documentId === this.documentId) {
      // A note the user did not delete is gone: undo or "go back" took it; offer it for restoring.
      for (const [id, note] of this.known) {
        if (next.has(id)) continue;
        if (this.deleted.delete(id)) continue;
        this.remember(note.stored);
      }
    } else {
      this.deleted.clear();
    }
    // A note that came back (redo, restore) leaves the restore list.
    for (const id of next.keys()) this.drop(id);
    this.documentId = documentId;
    this.known = next;
    this.unreadable = unreadable;
    this.publish();
  }

  private remember(note: StoredNote): void {
    const design = this.options.design.designName();
    this.restore = [{ design, removedAt: new Date().toISOString(), note }, ...this.restore.filter((entry) => entry.note.id !== note.id)].slice(0, MAX_RESTORABLE);
    this.saveRestore();
  }

  private drop(id: string): void {
    const before = this.restore.length;
    this.restore = this.restore.filter((entry) => entry.note.id !== id);
    if (before !== this.restore.length) this.saveRestore();
  }

  private loadRestore(): RestoreEntry[] {
    try {
      const parsed = restoreFileSchema.safeParse(JSON.parse(readFileSync(this.options.restoreFile, 'utf8')));
      if (!parsed.success) return [];
      const oldest = Date.now() - RESTORE_DAYS * 24 * 3600 * 1000;
      return parsed.data.entries.filter((entry) => Date.parse(entry.removedAt) >= oldest).slice(0, MAX_RESTORABLE);
    } catch {
      return [];
    }
  }

  private saveRestore(): void {
    try {
      mkdirSync(dirname(this.options.restoreFile), { recursive: true });
      writeFileSync(this.options.restoreFile, JSON.stringify({ entries: this.restore }));
    } catch {
      // The list still works for this session.
    }
  }

  private publish(): void {
    const state = this.state();
    const key = JSON.stringify(state);
    if (key === this.shown) return;
    this.shown = key;
    this.options.emit(state);
  }

  private serial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.queue.then(work, work);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
