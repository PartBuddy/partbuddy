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
export type CloudState = 'ready' | 'missingKey' | 'rateLimited';
export type ProjectsState = 'ready' | 'loading' | 'empty';
export type TimelineState = 'ok' | 'featureError';
export type ModelFault = 'none' | 'unreadable';
export type ChangeState = 'none' | 'proposed' | 'applied' | 'discarded';

/** Options of the clarification card: snap opening for the 10 mm cable, in mm. */
export const openingOptions = { opening75: 7.5, opening80: 8, opening70: 7 } as const;
export type OpeningOption = keyof typeof openingOptions;
export type ClarificationAnswer = { kind: 'option'; id: OpeningOption } | { kind: 'other'; value: number };

export const targetCableDiameter = 10;

export function answerValue(answer: ClarificationAnswer): number {
  return answer.kind === 'option' ? openingOptions[answer.id] : answer.value;
}

/** The proposal follows the answer: new cable diameter and the chosen snap opening. */
export function proposalFor(answer: ClarificationAnswer): Record<string, number> {
  return { cable_d_nominal: targetCableDiameter, slot_width: answerValue(answer) };
}

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
  cloud: CloudState;
  projectsState: ProjectsState;
  timelineState: TimelineState;
  modelFault: ModelFault;
  answer: ClarificationAnswer | null;
  /** Committed values when the proposal was made; the "before" column of the proposal. */
  proposalBase: Record<string, number>;
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
  setAnchorStatus: (status: AnchorStatus) => void;
  setProvider: (id: string) => void;
  setSolidcraft: (state: SolidCraftState) => void;
  setLocalServer: (state: LocalServerState) => void;
  setCloud: (state: CloudState) => void;
  setProjectsState: (state: ProjectsState) => void;
  setTimelineState: (state: TimelineState) => void;
  setModelFault: (fault: ModelFault) => void;
  answerClarification: (answer: ClarificationAnswer) => void;
  applyChange: () => void;
  discardChange: () => void;
  setPendingValue: (name: string, value: number) => void;
  resetPendingValues: () => void;
  applyPendingValues: () => void;
  setPaletteOpen: (open: boolean) => void;
  sendMessage: (text: string) => void;
}

const initialValues = Object.fromEntries(initialParameters.map((p) => [p.name, p.value]));

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
  cloud: 'ready',
  projectsState: 'ready',
  timelineState: 'ok',
  modelFault: 'none',
  answer: null,
  proposalBase: {},
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
  removeNote: (id) =>
    set({
      notes: get().notes.filter((n) => n.id !== id),
      focusNoteId: get().focusNoteId === id ? null : get().focusNoteId,
    }),
  focusNote: (focusNoteId) => set({ focusNoteId }),
  setAnchorStatus: (status) =>
    set({ notes: get().notes.map((n) => ({ ...n, anchor: { ...n.anchor, status } })) }),
  setProvider: (providerId) => set({ providerId }),
  setSolidcraft: (solidcraft) => set({ solidcraft }),
  setLocalServer: (localServer) => set({ localServer }),
  setCloud: (cloud) => set({ cloud }),
  setProjectsState: (projectsState) => set({ projectsState }),
  setTimelineState: (timelineState) => set({ timelineState }),
  setModelFault: (modelFault) => set({ modelFault }),
  answerClarification: (answer) => set({ answer, change: 'proposed', proposalBase: { ...get().values } }),
  applyChange: () => {
    const answer = get().answer;
    if (!answer) return;
    set({ change: 'applied', values: { ...get().values, ...proposalFor(answer) }, partLevels: ['L'] });
  },
  discardChange: () => set({ change: 'discarded' }),
  setPendingValue: (name, value) => {
    const rest = Object.fromEntries(Object.entries(get().pendingValues).filter(([key]) => key !== name));
    set({ pendingValues: get().values[name] === value ? rest : { ...rest, [name]: value } });
  },
  resetPendingValues: () => set({ pendingValues: {} }),
  applyPendingValues: () =>
    set({ values: { ...get().values, ...get().pendingValues }, pendingValues: {}, partLevels: ['L'] }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  sendMessage: (text) => set({ userMessages: [...get().userMessages, text] }),
}));
