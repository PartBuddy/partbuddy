import type { ViewerModel } from '@partbuddy/geometry';
import { create } from 'zustand';

import type { ConnectionStatus, MirroredSketch } from '../../../shared/contract';

export interface BodyModel {
  name: string;
  model: ViewerModel;
}

export type ModelState =
  | { status: 'waiting' }
  | { status: 'ready'; documentId: string; revision: number; designName: string; bodies: BodyModel[]; sketches: MirroredSketch[] }
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

interface StudioState {
  projection: Projection;
  /** The last standard view the user asked for; `serial` repeats the same view on request. */
  viewRequest: { view: StandardView; serial: number } | null;
  setProjection: (projection: Projection) => void;
  requestView: (view: StandardView) => void;
  connection: ConnectionStatus;
  history: History;
  notice: Notice | null;
  setHistory: (history: History) => void;
  setNotice: (notice: Notice | null) => void;
  model: ModelState;
  hover: Pick | null;
  selection: Pick | null;
  changes: LiveChanges | null;
  followChanges: boolean;
  latency: MirrorLatency | null;
  setConnection: (status: ConnectionStatus) => void;
  setModel: (model: ModelState) => void;
  showRevision: (model: ModelState, changes: LiveChanges | null, latency: MirrorLatency) => void;
  clearChanges: () => void;
  setFollowChanges: (follow: boolean) => void;
  setHover: (pick: Pick | null) => void;
  select: (pick: Pick | null) => void;
}

export const useStudio = create<StudioState>()((set) => ({
  connection: { state: 'searching', owned: false, mirror: 'idle' },
  model: { status: 'waiting' },
  projection: 'perspective',
  viewRequest: null,
  setProjection: (projection) => {
    set({ projection });
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
  hover: null,
  selection: null,
  changes: null,
  followChanges: false,
  latency: null,
  setConnection: (connection) => {
    set({ connection });
  },
  setModel: (model) => {
    // Face indices change on every rebuild (ADR 0004), so a selection does not survive one.
    set({ model, hover: null, selection: null });
  },
  showRevision: (model, changes, latency) => {
    set({ model, changes, latency, hover: null, selection: null });
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
    set({ selection });
  },
}));

export function samePick(a: Pick | null, b: Pick | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.body === b.body && pickIndex(a) === pickIndex(b);
}
