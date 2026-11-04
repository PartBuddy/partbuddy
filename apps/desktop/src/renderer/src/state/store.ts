import type { ViewerModel } from '@partbuddy/geometry';
import { create } from 'zustand';

import type { ConnectionStatus } from '../../../shared/contract';

export interface BodyModel {
  name: string;
  model: ViewerModel;
}

export type ModelState =
  | { status: 'waiting' }
  | { status: 'ready'; documentId: string; revision: number; designName: string; bodies: BodyModel[] }
  | { status: 'error'; message: string };

/** Faces that changed in the latest revision of one body (indices in the new face table). */
export interface BodyChanges {
  body: number;
  faces: number[];
}

export interface LiveChanges {
  bodies: BodyChanges[];
  count: number;
  /** Bounds of the changed faces, for the camera to follow. */
  box: { min: [number, number, number]; max: [number, number, number] } | null;
  /** Increases with every revision that brought changes. */
  serial: number;
}

/** Time from asking SolidCraft for the export to the new model being on screen. */
export interface MirrorLatency {
  mirrorMs: number;
  parseMs: number;
}

export interface FaceRef {
  body: number;
  face: number;
}

export interface FacePick extends FaceRef {
  point: [number, number, number];
  normal: [number, number, number];
}

interface StudioState {
  connection: ConnectionStatus;
  model: ModelState;
  hover: FaceRef | null;
  selection: FacePick | null;
  changes: LiveChanges | null;
  followChanges: boolean;
  latency: MirrorLatency | null;
  setConnection: (status: ConnectionStatus) => void;
  setModel: (model: ModelState) => void;
  showRevision: (model: ModelState, changes: LiveChanges | null, latency: MirrorLatency) => void;
  clearChanges: () => void;
  setFollowChanges: (follow: boolean) => void;
  setHover: (face: FaceRef | null) => void;
  select: (pick: FacePick | null) => void;
}

export const useStudio = create<StudioState>()((set) => ({
  connection: { state: 'searching', owned: false, mirror: 'idle' },
  model: { status: 'waiting' },
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
    set({ hover });
  },
  select: (selection) => {
    set({ selection });
  },
}));

export function sameFace(a: FaceRef | null, b: FaceRef | null): boolean {
  return a !== null && b !== null && a.body === b.body && a.face === b.face;
}
