import { create } from 'zustand';

import { parameters as initialParameters, type VerificationLevel } from '../mock/design';

export type Theme = 'light' | 'dark';
export type Locale = 'en' | 'de';
export type Vec3 = [number, number, number];

export interface FacePick {
  face: number;
  point: Vec3;
  normal: Vec3;
}

export type AnchorStatus = 'attached' | 'moved' | 'ambiguous' | 'orphaned';

export interface Note {
  id: string;
  text: string;
  anchor: FacePick & { faceName: string; status: AnchorStatus };
}

export type SolidCraftState = 'connected' | 'rebuilding' | 'disconnected';
export type LocalServerState = 'ready' | 'processing' | 'unreachable';
export type ProjectsState = 'ready' | 'loading' | 'empty';
export type ClarificationState = 'open' | 'answered';
export type ChangeState = 'none' | 'proposed' | 'applied' | 'discarded';

interface StudioState {
  theme: Theme;
  locale: Locale;
  hoverFace: number | null;
  selection: FacePick | null;
  highlightFeature: string | null;
  notes: Note[];
  noteDraft: FacePick | null;
  focusNoteId: string | null;
  providerId: string;
  solidcraft: SolidCraftState;
  localServer: LocalServerState;
  projectsState: ProjectsState;
  clarification: ClarificationState;
  answer: string | null;
  change: ChangeState;
  values: Record<string, number>;
  pendingValues: Record<string, number>;
  partLevels: VerificationLevel[];
  paletteOpen: boolean;
  userMessages: string[];

  setTheme: (theme: Theme) => void;
  setLocale: (locale: Locale) => void;
  setHoverFace: (face: number | null) => void;
  select: (pick: FacePick | null) => void;
  setHighlightFeature: (feature: string | null) => void;
  startNote: (pick: FacePick) => void;
  cancelNote: () => void;
  saveNote: (text: string, faceName: string) => void;
  removeNote: (id: string) => void;
  focusNote: (id: string | null) => void;
  setProvider: (id: string) => void;
  setSolidcraft: (state: SolidCraftState) => void;
  setLocalServer: (state: LocalServerState) => void;
  setProjectsState: (state: ProjectsState) => void;
  answerClarification: (answer: string) => void;
  applyChange: () => void;
  discardChange: () => void;
  setPendingValue: (name: string, value: number) => void;
  resetPendingValues: () => void;
  applyPendingValues: () => void;
  setPaletteOpen: (open: boolean) => void;
  sendMessage: (text: string) => void;
}

const initialValues = Object.fromEntries(initialParameters.map((p) => [p.name, p.value]));

export const proposedValues: Record<string, number> = { cable_d_nominal: 10, slot_width: 7.5 };

let noteCounter = 0;

export const useStudio = create<StudioState>((set, get) => ({
  theme: 'light',
  locale: 'en',
  hoverFace: null,
  selection: null,
  highlightFeature: null,
  notes: [],
  noteDraft: null,
  focusNoteId: null,
  providerId: 'anthropic',
  solidcraft: 'connected',
  localServer: 'ready',
  projectsState: 'ready',
  clarification: 'open',
  answer: null,
  change: 'none',
  values: initialValues,
  pendingValues: {},
  partLevels: ['L', 'TG', 'SC'],
  paletteOpen: false,
  userMessages: [],

  setTheme: (theme) => set({ theme }),
  setLocale: (locale) => set({ locale }),
  setHoverFace: (hoverFace) => {
    if (get().hoverFace !== hoverFace) set({ hoverFace });
  },
  select: (selection) => set({ selection }),
  setHighlightFeature: (highlightFeature) => set({ highlightFeature }),
  startNote: (noteDraft) => set({ noteDraft }),
  cancelNote: () => set({ noteDraft: null }),
  saveNote: (text, faceName) => {
    const draft = get().noteDraft;
    if (!draft) return;
    noteCounter += 1;
    const note: Note = {
      id: `note-${noteCounter}`,
      text,
      anchor: { ...draft, faceName, status: 'attached' },
    };
    set({ notes: [...get().notes, note], noteDraft: null, focusNoteId: note.id });
  },
  removeNote: (id) => set({ notes: get().notes.filter((n) => n.id !== id) }),
  focusNote: (focusNoteId) => set({ focusNoteId }),
  setProvider: (providerId) => set({ providerId }),
  setSolidcraft: (solidcraft) => set({ solidcraft }),
  setLocalServer: (localServer) => set({ localServer }),
  setProjectsState: (projectsState) => set({ projectsState }),
  answerClarification: (answer) => set({ clarification: 'answered', answer, change: 'proposed' }),
  applyChange: () =>
    set({
      change: 'applied',
      values: { ...get().values, ...proposedValues },
      partLevels: ['L'],
    }),
  discardChange: () => set({ change: 'discarded' }),
  setPendingValue: (name, value) => set({ pendingValues: { ...get().pendingValues, [name]: value } }),
  resetPendingValues: () => set({ pendingValues: {} }),
  applyPendingValues: () =>
    set({ values: { ...get().values, ...get().pendingValues }, pendingValues: {}, partLevels: ['L'] }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  sendMessage: (text) => set({ userMessages: [...get().userMessages, text] }),
}));
