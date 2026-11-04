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
  setConnection: (status: ConnectionStatus) => void;
  setModel: (model: ModelState) => void;
  setHover: (face: FaceRef | null) => void;
  select: (pick: FacePick | null) => void;
}

export const useStudio = create<StudioState>()((set) => ({
  connection: { state: 'searching', owned: false, mirror: 'idle' },
  model: { status: 'waiting' },
  hover: null,
  selection: null,
  setConnection: (connection) => {
    set({ connection });
  },
  setModel: (model) => {
    // Face indices change on every rebuild (ADR 0004), so a selection does not survive one.
    set({ model, hover: null, selection: null });
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
