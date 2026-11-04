import { create } from 'zustand';

import type { AgentEvent, AgentStatus, AssistantState } from '../../../shared/contract';

export type ConversationItem =
  | { kind: 'user'; key: number; text: string }
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
    }
  | { kind: 'stopped'; key: number; detail: string | null }
  | { kind: 'error'; key: number; message: string };

interface AssistantStore {
  state: AssistantState;
  items: ConversationItem[];
  setState: (state: AssistantState) => void;
  apply: (event: AgentEvent) => void;
}

let nextKey = 1;

/** Folds the agent's event stream into conversation items (pure, so it is unit-testable). */
export function reduce(items: ConversationItem[], event: AgentEvent): ConversationItem[] {
  const last = items.at(-1);
  const key = nextKey++;
  switch (event.type) {
    case 'user':
      return [...items, { kind: 'user', key, text: event.text }];
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
      return items.map((item, i) => (i === index ? { ...tool, key: item.key } : item));
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
}));

/** Status of the route the user picked. */
export function selectedStatus(state: AssistantState): AgentStatus {
  return state.agents.find((agent) => agent.agent === state.selected) ?? { agent: state.selected, state: 'checking' };
}
