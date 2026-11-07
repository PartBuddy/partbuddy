import type { FindingBox, PrintCheck, ViewerModel } from '@partbuddy/geometry';
import { create } from 'zustand';

import type { AssemblyPlan } from '../../../shared/assembly';
import type { ConnectionStatus, DimensionMark, ExportFormat, MirroredSketch, NotesState, PartPrint, Structure } from '../../../shared/contract';

/** What goes out: a file format, or a slicer by its id (B8). */
export type ExportTarget = ExportFormat | `slicer:${string}` | 'share';

/** A section of the settings (B6). */
export type SettingsSection = 'general' | 'solidcraft' | 'assistant' | 'print' | 'about';

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
/** Fit everything, fit the selection, or look from one of the standard directions (viewer/camera.ts). */
export type StandardView = 'fit' | 'selection' | 'iso' | 'front' | 'back' | 'right' | 'left' | 'top' | 'bottom';
/** How bodies are drawn (UI upgrade step 9): faces and edges, faces only, see-through, edges only. */
/** The tabs of the printer and material dialog (M7). */
export type ProfilesTab = 'printer' | 'material';

/** Plus "hidden edges": shaded with edges, and the edges behind the faces dashed (viewport CAD round). */
export type DisplayMode = 'shadedEdges' | 'shaded' | 'hiddenEdges' | 'xray' | 'wireframe';
/**
 * A section through the design along one axis: `position` from 0 to 1 across the bodies' box,
 * `flip` keeps the other side. Picks never reach the part that is cut away.
 */
export interface Section {
  axis: 'x' | 'y' | 'z';
  position: number;
  flip: boolean;
  /**
   * A section aligned to a picked flat face (viewport CAD round): the plane through `origin` with
   * `normal`, moved `position` mm along the normal; the axis is then not used.
   */
  face?: { origin: Vec3; normal: Vec3 } | undefined;
}

/** How several printed parts are shown: assembled as designed, or laid out on the printer's bed. */
export type ViewMode = 'assembled' | 'plate';

/** The assembly playback: `position` runs from 0 (nothing placed) to the number of steps. */
export interface Playback {
  position: number;
  playing: boolean;
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
  /** Exploded view (F7): 0 assembled to 1 fully apart, null while closed; it and a section exclude each other. */
  explode: number | null;
  setExplode: (explode: number | null) => void;
  requestView: (view: StandardView) => void;
  /** Assembled or on the plate; the plate, the exploded view, the playback and a section exclude each other. */
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  /** The plate shown in the plate view (0 first). */
  plate: number;
  setPlate: (plate: number) => void;
  /** The assembly playback, null while closed. */
  playback: Playback | null;
  setPlayback: (playback: Playback | null) => void;
  /** The assembly order the assistant set for the open project (ADR 0026); null: proposed from the geometry. */
  assembly: AssemblyPlan | null;
  setAssembly: (plan: AssemblyPlan | null) => void;
  /** The print face of each body, by face name, as PartBuddy set it (B8); bodies without one lie as designed. */
  printFaces: Record<string, string>;
  setPrintFaces: (faces: Record<string, string>) => void;
  connection: ConnectionStatus;
  history: History;
  notice: Notice | null;
  setHistory: (history: History) => void;
  setNotice: (notice: Notice | null) => void;
  /** Ghost of a value typed into the parameter panel: the body with the new value (face-tagged 3MF). */
  parameterGhost: Uint8Array | null;
  setParameterGhost: (ghost: Uint8Array | null) => void;
  /** The printer in use and the open part's material (M7); null until the main process answered. */
  print: PartPrint | null;
  setPrint: (print: PartPrint | null) => void;
  /** The start page with the project tiles (B3), over the work area; the logo opens it. */
  homeOpen: boolean;
  setHomeOpen: (open: boolean) => void;
  /** The settings (B6) at this section, or null while they are closed. */
  settingsSection: SettingsSection | null;
  setSettingsSection: (section: SettingsSection | null) => void;
  /** Which tab of the printer and material profiles shows. */
  profilesTab: ProfilesTab;
  setProfilesTab: (tab: ProfilesTab) => void;
  /** The ready-to-print check of the bodies on screen (M7); null until it ran. */
  printCheck: { revision: number; result: PrintCheck } | null;
  setPrintCheck: (check: { revision: number; result: PrintCheck } | null) => void;
  /** A place the camera should move to (a finding of the check), with a serial to repeat it. */
  focusRequest: { box: FindingBox; serial: number } | null;
  requestFocus: (box: FindingBox) => void;
  /** An export waiting for the user to confirm it despite a red check. */
  exportConfirm: ExportTarget | null;
  setExportConfirm: (target: ExportTarget | null) => void;
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
  /**
   * How strongly the faces the latest step changed are tinted, 0 to 1: a short glow after each
   * change that fades out, and again while the pointer is on the change chip that names them.
   */
  changeGlow: number;
  setChangeGlow: (glow: number) => void;
  /** Faces of the work-log step under the pointer (M2a), by body and face name. */
  stepHighlight: { body: string; faces: string[] }[] | null;
  setStepHighlight: (highlight: { body: string; faces: string[] }[] | null) => void;
  followChanges: boolean;
  latency: MirrorLatency | null;
  setConnection: (status: ConnectionStatus) => void;
  setModel: (model: ModelState) => void;
  showRevision: (model: ModelState, changes: LiveChanges | null, latency: MirrorLatency) => void;
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

/** As many as one message to the assistant may carry (contract: 20). */
const MAX_SELECTIONS = 20;

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
    set(section ? { section, explode: null, viewMode: 'assembled', playback: null } : { section });
  },
  explode: null,
  setExplode: (explode) => {
    set(explode === null ? { explode } : { explode, section: null, viewMode: 'assembled', playback: null });
  },
  viewMode: 'assembled',
  setViewMode: (viewMode) => {
    set(viewMode === 'plate' ? { viewMode, plate: 0, section: null, explode: null, playback: null } : { viewMode });
  },
  plate: 0,
  setPlate: (plate) => {
    set({ plate });
  },
  playback: null,
  setPlayback: (playback) => {
    set(playback ? { playback, section: null, explode: null, viewMode: 'assembled' } : { playback });
  },
  assembly: null,
  setAssembly: (assembly) => {
    set({ assembly });
  },
  printFaces: {},
  setPrintFaces: (printFaces) => {
    set({ printFaces });
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
  print: null,
  setPrint: (print) => {
    set({ print });
  },
  // PartBuddy starts on the start page (B3); tests that start in the work area turn it off.
  homeOpen: true,
  setHomeOpen: (homeOpen) => {
    set({ homeOpen });
  },
  settingsSection: null,
  setSettingsSection: (settingsSection) => {
    set({ settingsSection });
  },
  profilesTab: 'printer',
  setProfilesTab: (profilesTab) => {
    set({ profilesTab });
  },
  printCheck: null,
  setPrintCheck: (printCheck) => {
    set({ printCheck });
  },
  focusRequest: null,
  requestFocus: (box) => {
    set((state) => ({ focusRequest: { box, serial: (state.focusRequest?.serial ?? 0) + 1 } }));
  },
  exportConfirm: null,
  setExportConfirm: (exportConfirm) => {
    set({ exportConfirm });
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
  changeGlow: 0,
  setChangeGlow: (changeGlow) => {
    set({ changeGlow });
  },
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
  showRevision: (model, changes, latency) => {
    // A revision that changed no geometry of the same design (a save that renamed it, B2) keeps
    // what the user selected; anything else starts without a selection.
    const unchanged = changes !== null && changes.count === 0 && changes.sketchCurves === 0;
    set(unchanged ? { model, latency } : { model, changes, latency, hover: null, selection: null, selections: [] });
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
