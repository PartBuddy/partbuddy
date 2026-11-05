import type { ViewerModel } from '@partbuddy/geometry';
import { create } from 'zustand';

import type { DrawingStroke } from '../../../shared/drawing';

import type { ConnectionStatus, DimensionMark, MirroredSketch, NotesState, Structure } from '../../../shared/contract';

export interface BodyModel {
  name: string;
  model: ViewerModel;
}

export type ModelState =
  | { status: 'waiting' }
  | { status: 'ready'; documentId: string; revision: number; designName: string; bodies: BodyModel[]; sketches: MirroredSketch[]; structure: Structure }
  | { status: 'error'; message: string };

/** Faces that changed in the latest revision of one body (indices in the new face table). */
export interface BodyChanges {
  body: number;
  faces: number[];
}

/** Curves that the latest revision added or moved in one sketch (#21), by curve id. */
export interface SketchChanges {
  sketch: number;
  curves: string[];
}

export interface LiveChanges {
  bodies: BodyChanges[];
  /** Changed faces over all bodies. */
  count: number;
  sketches: SketchChanges[];
  /** Changed sketch curves over all sketches. */
  sketchCurves: number;
  /** Bounds of the changed faces and sketch curves, for the camera to follow. */
  box: { min: [number, number, number]; max: [number, number, number] } | null;
  /** Increases with every revision that brought changes. */
  serial: number;
}

/** Time from asking SolidCraft for the export to the new model being on screen. */
export interface MirrorLatency {
  mirrorMs: number;
  parseMs: number;
}

type Vec3 = [number, number, number];

/** What the pointer is over or the user selected: a face, a B-rep edge or a vertex of one body. */
export type Pick =
  | { kind: 'face'; body: number; face: number; point: Vec3; normal: Vec3 }
  | { kind: 'edge'; body: number; edge: number; point: Vec3 }
  | { kind: 'vertex'; body: number; vertex: number; point: Vec3 };

/** The index of the picked face, edge or vertex within its body. */
export function pickIndex(pick: Pick): number {
  return pick.kind === 'face' ? pick.face : pick.kind === 'edge' ? pick.edge : pick.vertex;
}

/** How many steps SolidCraft can undo and redo, from the newest mirrored revision. */
export interface History {
  undo: number;
  redo: number;
}

/** A short message about the user's own action (export saved, undo failed), read by screen readers. */
export interface Notice {
  tone: 'success' | 'danger';
  text: string;
}

export type Projection = 'perspective' | 'orthographic';
export type StandardView = 'fit' | 'iso' | 'front' | 'right' | 'top';
/** How bodies are drawn (UI upgrade step 9): faces and edges, faces only, see-through, edges only. */
export type DisplayMode = 'shadedEdges' | 'shaded' | 'xray' | 'wireframe';
/**
 * A section through the design along one axis: `position` from 0 to 1 across the bodies' box,
 * `flip` keeps the other side. Picks and pen strokes never reach the part that is cut away.
 */
export interface Section {
  axis: 'x' | 'y' | 'z';
  position: number;
  flip: boolean;
}

interface StudioState {
  projection: Projection;
  /** The last standard view the user asked for; `serial` repeats the same view on request. */
  viewRequest: { view: StandardView; serial: number } | null;
  setProjection: (projection: Projection) => void;
  displayMode: DisplayMode;
  setDisplayMode: (mode: DisplayMode) => void;
  section: Section | null;
  setSection: (section: Section | null) => void;
  requestView: (view: StandardView) => void;
  connection: ConnectionStatus;
  history: History;
  notice: Notice | null;
  setHistory: (history: History) => void;
  setNotice: (notice: Notice | null) => void;
  /** Ghost of a value typed into the parameter panel: the body with the new value (face-tagged 3MF). */
  parameterGhost: Uint8Array | null;
  setParameterGhost: (ghost: Uint8Array | null) => void;
  /** Faces coloured by how far they overhang when printed along +Z (UI upgrade step 12). */
  overhang: boolean;
  setOverhang: (overhang: boolean) => void;
  /** The ghost of a value or action typed into the selection dock (UI upgrade step 11). */
  selectionGhost: Uint8Array | null;
  setSelectionGhost: (ghost: Uint8Array | null) => void;
  model: ModelState;
  hover: Pick | null;
  /** The latest picked element; the dimension field and the HUD belong to it. */
  selection: Pick | null;
  /** Everything selected, in picking order (Ctrl- or Shift-click adds and removes, M1b-2). */
  selections: Pick[];
  changes: LiveChanges | null;
  /** Faces of the work-log step under the pointer (M2a), by body and face name. */
  stepHighlight: { body: string; faces: string[] }[] | null;
  setStepHighlight: (highlight: { body: string; faces: string[] }[] | null) => void;
  followChanges: boolean;
  latency: MirrorLatency | null;
  setConnection: (status: ConnectionStatus) => void;
  setModel: (model: ModelState) => void;
  showRevision: (model: ModelState, changes: LiveChanges | null, latency: MirrorLatency, before?: BodyModel[] | null) => void;
  /** The bodies before the latest change, kept for comparing (UI upgrade step 13). */
  before: BodyModel[] | null;
  /**
   * Before/after (UI upgrade step 13): how far the view shows the new state, 0 the old one, 1 the
   * new one. `compare` is on while the user compares with the state before the latest change;
   * `previewBlend` weighs the ghost of a tried value against the part.
   */
  compare: number | null;
  setCompare: (compare: number | null) => void;
  previewBlend: number;
  setPreviewBlend: (blend: number) => void;
  /** The ghost of a value typed into a dimension label's field. */
  markGhost: Uint8Array | null;
  setMarkGhost: (ghost: Uint8Array | null) => void;
  clearChanges: () => void;
  setFollowChanges: (follow: boolean) => void;
  setHover: (pick: Pick | null) => void;
  select: (pick: Pick | null) => void;
  /** Adds the pick to the selection, or removes it when it is selected already. */
  toggle: (pick: Pick) => void;
  deselect: (pick: Pick) => void;
  /** The notes of the open design (M2b, ADR 0020), as the main process reports them. */
  notes: NotesState;
  setNotes: (notes: NotesState) => void;
  /** The note whose card is open at its pin, or null. */
  openNote: string | null;
  setOpenNote: (id: string | null) => void;
  /** Pen mode (M2b-2): the pointer draws strokes on the view instead of selecting and turning. */
  pen: boolean;
  setPen: (pen: boolean) => void;
  /** Strokes drawn since the last message; they go with the next one. */
  strokes: DrawnStroke[];
  addStroke: (stroke: DrawnStroke) => void;
  clearStrokes: () => void;
  /** Send a picture of the view with the strokes too (off by default, ADR 0020). */
  drawingImage: boolean;
  setDrawingImage: (image: boolean) => void;
  /** Renders the view with the strokes to a PNG; set by the 3D view while it is shown. */
  captureView: (() => Promise<Uint8Array<ArrayBuffer> | null>) | null;
  setCaptureView: (capture: (() => Promise<Uint8Array<ArrayBuffer> | null>) | null) => void;
  /** Dimensions in the view (M2b-3): off, those of the selected feature, or all. */
  dimensions: 'off' | 'feature' | 'all';
  setDimensions: (dimensions: 'off' | 'feature' | 'all') => void;
  /** The dimensions shown, as the main process placed them. */
  marks: DimensionMark[];
  setMarks: (marks: DimensionMark[]) => void;
  /** The dimension whose field is open, by mark id. */
  openMark: string | null;
  setOpenMark: (id: string | null) => void;
}

/** A stroke on the view: its summary for the assistant and its line on the model, lifted off the faces. */
export interface DrawnStroke {
  id: number;
  summary: DrawingStroke;
  line: [number, number, number][];
}

/** As many as one message to the assistant may carry (contract: 20). */
const MAX_SELECTIONS = 20;
/** As many strokes as one message may carry (contract: 20). */
const MAX_STROKES = 20;

export const useStudio = create<StudioState>()((set) => ({
  connection: { state: 'searching', owned: false, mirror: 'idle' },
  model: { status: 'waiting' },
  projection: 'perspective',
  viewRequest: null,
  setProjection: (projection) => {
    set({ projection });
  },
  displayMode: 'shadedEdges',
  setDisplayMode: (displayMode) => {
    set({ displayMode });
  },
  section: null,
  setSection: (section) => {
    set({ section });
  },
  requestView: (view) => {
    set((state) => ({ viewRequest: { view, serial: (state.viewRequest?.serial ?? 0) + 1 } }));
  },
  history: { undo: 0, redo: 0 },
  notice: null,
  setHistory: (history) => {
    set({ history });
  },
  setNotice: (notice) => {
    set({ notice });
  },
  overhang: false,
  setOverhang: (overhang) => {
    set({ overhang });
  },
  selectionGhost: null,
  setSelectionGhost: (selectionGhost) => {
    set({ selectionGhost });
  },
  parameterGhost: null,
  setParameterGhost: (parameterGhost) => {
    set({ parameterGhost });
  },
  hover: null,
  selection: null,
  selections: [],
  changes: null,
  stepHighlight: null,
  setStepHighlight: (stepHighlight) => {
    set({ stepHighlight });
  },
  followChanges: false,
  latency: null,
  setConnection: (connection) => {
    set({ connection });
  },
  setModel: (model) => {
    // Face indices change on every rebuild (ADR 0004), so a selection does not survive one.
    set({ model, hover: null, selection: null, selections: [] });
  },
  showRevision: (model, changes, latency, before = null) => {
    set({ model, changes, latency, before, compare: null, hover: null, selection: null, selections: [] });
  },
  before: null,
  compare: null,
  setCompare: (compare) => {
    set({ compare });
  },
  previewBlend: 0.25,
  setPreviewBlend: (previewBlend) => {
    set({ previewBlend });
  },
  markGhost: null,
  setMarkGhost: (markGhost) => {
    set({ markGhost });
  },
  clearChanges: () => {
    set({ changes: null });
  },
  setFollowChanges: (followChanges) => {
    set({ followChanges });
  },
  setHover: (hover) => {
    // Pointer moves report the same pick many times; only a different one re-renders.
    if (!samePick(hover, useStudio.getState().hover)) set({ hover });
  },
  select: (selection) => {
    set({ selection, selections: selection ? [selection] : [] });
  },
  toggle: (pick) => {
    const current = useStudio.getState().selections;
    const selections = current.some((entry) => samePick(entry, pick))
      ? current.filter((entry) => !samePick(entry, pick))
      : [...current, pick].slice(-MAX_SELECTIONS);
    set({ selections, selection: selections.at(-1) ?? null });
  },
  deselect: (pick) => {
    const selections = useStudio.getState().selections.filter((entry) => !samePick(entry, pick));
    set({ selections, selection: selections.at(-1) ?? null });
  },
  notes: { documentId: null, notes: [], restorable: [], unreadable: 0 },
  setNotes: (notes) => {
    const open = useStudio.getState().openNote;
    set({ notes, openNote: open && notes.notes.some((note) => note.id === open) ? open : null });
  },
  openNote: null,
  setOpenNote: (openNote) => {
    set({ openNote });
  },
  pen: false,
  setPen: (pen) => {
    set(pen ? { pen, hover: null, selection: null, selections: [] } : { pen });
  },
  strokes: [],
  addStroke: (stroke) => {
    set((state) => ({ strokes: [...state.strokes, stroke].slice(-MAX_STROKES) }));
  },
  clearStrokes: () => {
    set({ strokes: [] });
  },
  drawingImage: false,
  setDrawingImage: (drawingImage) => {
    set({ drawingImage });
  },
  captureView: null,
  setCaptureView: (captureView) => {
    set({ captureView });
  },
  dimensions: 'off',
  setDimensions: (dimensions) => {
    set(dimensions === 'off' ? { dimensions, marks: [], openMark: null } : { dimensions });
  },
  marks: [],
  setMarks: (marks) => {
    const open = useStudio.getState().openMark;
    set({ marks, openMark: open && marks.some((mark) => mark.id === open) ? open : null });
  },
  openMark: null,
  setOpenMark: (openMark) => {
    set({ openMark });
  },
}));


export function samePick(a: Pick | null, b: Pick | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.body === b.body && pickIndex(a) === pickIndex(b);
}
