import { create } from 'zustand';

import type { AgentEvent, AgentQuestion, AgentStatus, AssistantState, WorkStep, WorkStepState } from '../../../shared/contract';

/** Faces a step changed, by body and SolidCraft face name (indices change on rebuilds, ADR 0004). */
export interface ChangedFaces {
  body: string;
  faces: string[];
}

export type ConversationItem =
  | {
      kind: 'user';
      key: number;
      text: string;
      selection?: string | undefined;
      drawing?: { strokes: number; image: boolean } | undefined;
      variant?: { index: number; count: number } | undefined;
    }
  | { kind: 'assistant'; key: number; text: string; open: boolean }
  | {
      kind: 'tool';
      key: number;
      id: string;
      name: string;
      summary: string;
      decision: 'allowed' | 'denied';
      reason?: string | undefined;
      ok?: boolean | undefined;
      /** The work-log step this call made, shown inside that step's card. */
      step?: string | undefined;
    }
  | {
      kind: 'step';
      key: number;
      step: WorkStep;
      state: WorkStepState;
      /** The design is in this step's state. */
      current: boolean;
      /** Small picture of PartBuddy's view right after the step (data URL). */
      preview?: string | undefined;
      changed?: ChangedFaces[] | undefined;
    }
  | {
      kind: 'question';
      key: number;
      question: AgentQuestion;
      /** Answered by the next message; `choice` names the pressed button. */
      answered: boolean;
      choice: string | null;
    }
  | { kind: 'stopped'; key: number; detail: string | null }
  | { kind: 'error'; key: number; message: string };

interface AssistantStore {
  state: AssistantState;
  items: ConversationItem[];
  setState: (state: AssistantState) => void;
  apply: (event: AgentEvent) => void;
  /** The view's picture and changed faces of a step, taken once its revision is on screen. */
  attachPreview: (step: string, preview: string | null, changed: ChangedFaces[]) => void;
}

let nextKey = 1;

/** Folds the agent's event stream into conversation items (pure, so it is unit-testable). */
export function reduce(items: ConversationItem[], event: AgentEvent): ConversationItem[] {
  const last = items.at(-1);
  const key = nextKey++;
  switch (event.type) {
    case 'user':
      return [...items, { kind: 'user', key, text: event.text, selection: event.selection, drawing: event.drawing, variant: event.variant }];
    case 'textDelta':
      if (last?.kind === 'assistant' && last.open) return [...items.slice(0, -1), { ...last, text: last.text + event.text }];
      return [...items, { kind: 'assistant', key, text: event.text, open: true }];
    case 'text':
      if (last?.kind === 'assistant' && last.open) return [...items.slice(0, -1), { ...last, text: event.text, open: false }];
      return [...items, { kind: 'assistant', key, text: event.text, open: false }];
    case 'tool': {
      const index = items.findIndex((item) => item.kind === 'tool' && item.id === event.id);
      const tool: ConversationItem = {
        kind: 'tool',
        key,
        id: event.id,
        name: event.name,
        summary: event.summary,
        decision: event.decision,
        reason: event.reason,
        ok: event.ok,
      };
      if (index < 0) return [...items, tool];
      return items.map((item, i) => (i === index && item.kind === 'tool' ? { ...tool, key: item.key, step: item.step } : item));
    }
    case 'step': {
      const card: ConversationItem = { kind: 'step', key, step: event.step, state: 'applied', current: true };
      const others = items.map((item) => (item.kind === 'step' && item.current ? { ...item, current: false } : item));
      const index = event.step.toolId ? others.findIndex((item) => item.kind === 'tool' && item.id === event.step.toolId) : -1;
      if (index < 0) return [...others, card];
      // The card takes the place of its tool call, which moves into the card's details.
      return [...others.slice(0, index), card, ...others.slice(index).map((item, i) => (i === 0 && item.kind === 'tool' ? { ...item, step: event.step.id } : item))];
    }
    case 'question':
      return [...items, { kind: 'question', key, question: event.question, answered: false, choice: null }];
    case 'answered':
      return items.map((item) => (item.kind === 'question' && item.question.id === event.id ? { ...item, answered: true, choice: event.choice } : item));
    case 'steps': {
      const states = new Map(event.states.map((entry) => [entry.id, entry.state]));
      return items.map((item) =>
        item.kind === 'step' ? { ...item, state: states.get(item.step.id) ?? 'discarded', current: item.step.id === event.current } : item,
      );
    }
    case 'done': {
      const closed = items.map((item) => (item.kind === 'assistant' && item.open ? { ...item, open: false } : item));
      return event.ok ? closed : [...closed, { kind: 'stopped', key, detail: event.detail }];
    }
    case 'error':
      return [...items, { kind: 'error', key, message: event.message }];
  }
}

export const useAssistant = create<AssistantStore>()((set) => ({
  state: { selected: 'claude-code', agents: [] },
  items: [],
  setState: (state) => {
    set({ state });
  },
  apply: (event) => {
    set((state) => ({ items: reduce(state.items, event) }));
  },
  attachPreview: (step, preview, changed) => {
    set((state) => ({
      items: state.items.map((item) => (item.kind === 'step' && item.step.id === step ? { ...item, preview: preview ?? '', changed } : item)),
    }));
  },
}));

/** Status of the route the user picked. */
export function selectedStatus(state: AssistantState): AgentStatus {
  return state.agents.find((agent) => agent.agent === state.selected) ?? { agent: state.selected, state: 'checking' };
}
