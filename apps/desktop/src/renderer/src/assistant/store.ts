import { create } from 'zustand';

import type { SketchState } from '../../../shared/sketch';
import type { AgentEvent, AgentQuestion, AgentStatus, AssistantState, ResearchSource, StoredChat, StoredChatItem, WorkStep, WorkStepState } from '../../../shared/contract';

/** Faces a step changed, by body and SolidCraft face name (indices change on rebuilds, ADR 0004). */
export interface ChangedFaces {
  body: string;
  faces: string[];
}

/**
 * The picture a message took along, as this window sent it (polish round 1): a small picture for the
 * chat, and the sketch to open again or the photo to show large. Not kept in the chat archive.
 */
export interface Attachment {
  thumbnail: string;
  sketch?: SketchState | undefined;
  photo?: Uint8Array | undefined;
}

export type ConversationItem =
  | {
      kind: 'user';
      key: number;
      text: string;
      selection?: string | undefined;
      selected?: { faces: number; edges: number; vertices: number; bodies: string[] } | undefined;
      sketch?: true | undefined;
      photo?: true | undefined;
      drawing?: true | undefined;
      attachments?: Attachment[] | undefined;
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
      /** From an earlier session: read only, SolidCraft no longer knows its undo state. */
      archived?: boolean | undefined;
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
  /** The review before "done" ran with its pictures, sent the assistant back, or the turn ended without it. Not kept in the archive. */
  | ({ kind: 'review'; key: number } & Omit<Extract<AgentEvent, { type: 'review' }>, 'type'>)
  /** Where the conversation of an earlier session ends (restored with the design). */
  | { kind: 'session'; key: number; savedAt: string }
  | { kind: 'error'; key: number; message: string }
  /** A web search or a page the assistant read (B7), as a card with its link. */
  | { kind: 'source'; key: number; source: ResearchSource };

interface AssistantStore {
  state: AssistantState;
  items: ConversationItem[];
  setState: (state: AssistantState) => void;
  apply: (event: AgentEvent) => void;
  /** Puts back the conversation saved with the design, before anything new was said. */
  restore: (chat: StoredChat) => void;
  /** Empties the conversation (another project opens, B2). */
  reset: () => void;
  /** The view's picture and changed faces of a step, taken once its revision is on screen. */
  attachPreview: (step: string, preview: string | null, changed: ChangedFaces[]) => void;
  /** The picture the next message with a sketch or photo goes with, set when it is sent. */
  nextAttachment: Attachment[] | null;
  attachNext: (attachments: Attachment[] | null) => void;
}

let nextKey = 1;

/** Folds the agent's event stream into conversation items (pure, so it is unit-testable). */
export function reduce(items: ConversationItem[], event: AgentEvent): ConversationItem[] {
  const last = items.at(-1);
  const key = nextKey++;
  switch (event.type) {
    case 'user':
      return [...items, { kind: 'user', key, text: event.text, selection: event.selection, selected: event.selected, sketch: event.sketch, photo: event.photo, drawing: event.drawing }];
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
    case 'review':
      return [...items, { kind: 'review', key, outcome: event.outcome, pictures: event.pictures }];
    case 'answered':
      return items.map((item) => (item.kind === 'question' && item.question.id === event.id ? { ...item, answered: true, choice: event.choice } : item));
    case 'steps': {
      const states = new Map(event.states.map((entry) => [entry.id, entry.state]));
      // Steps of an earlier session keep what they were; this session's log does not know them.
      return items.map((item) =>
        item.kind === 'step' && !item.archived ? { ...item, state: states.get(item.step.id) ?? 'discarded', current: item.step.id === event.current } : item,
      );
    }
    case 'done': {
      const closed = items.map((item) => (item.kind === 'assistant' && item.open ? { ...item, open: false } : item));
      return event.ok ? closed : [...closed, { kind: 'stopped', key, detail: event.detail }];
    }
    case 'error':
      return [...items, { kind: 'error', key, message: event.message }];
    case 'source': {
      // Claude Code reports a search when it starts and again with the pages it found: one card. Several
      // searches run side by side, so the results come after all the starts; the card of the same query in
      // this request takes them (real research run 2026-11-10 showed every search twice).
      const found = event.source;
      if (found.kind === 'search') {
        for (let i = items.length - 1; i >= 0; i -= 1) {
          const item = items[i];
          if (!item || item.kind === 'user') break;
          if (item.kind === 'source' && item.source.kind === 'search' && item.source.query === found.query) {
            if (!found.links) return items;
            return [...items.slice(0, i), { ...item, source: found }, ...items.slice(i + 1)];
          }
        }
      }
      return [...items, { kind: 'source', key, source: found }];
    }
  }
}

/** The conversation as it is kept with the design: what the chat shows, without tool details and pictures. */
export function toStored(items: readonly ConversationItem[]): StoredChatItem[] {
  return items
    .flatMap((item): StoredChatItem[] => {
      switch (item.kind) {
        case 'user':
          return [{ kind: 'user', text: item.text, ...(item.selection ? { selection: item.selection } : {}), ...(item.selected ? { selected: item.selected } : {}), ...(item.sketch ? { sketch: true as const } : {}), ...(item.photo ? { photo: true as const } : {}), ...(item.drawing ? { drawing: true as const } : {}) }];
        case 'assistant':
          return item.open || item.text.trim() === '' ? [] : [{ kind: 'assistant', text: item.text }];
        case 'step':
          return [{ kind: 'step', step: item.step, state: item.state }];
        case 'question':
          return [{ kind: 'question', question: item.question, choice: item.choice }];
        case 'error':
          return [{ kind: 'error', message: item.message.slice(0, 2000) }];
        case 'source':
          return [{ kind: 'source', source: item.source }];
        default:
          return [];
      }
    })
    .slice(-400);
}

/** A saved conversation as items: steps and questions read only, a line where it ends. */
export function fromStored(chat: StoredChat): ConversationItem[] {
  if (chat.items.length === 0) return [];
  const items = chat.items.map((item): ConversationItem => {
    const key = nextKey++;
    switch (item.kind) {
      case 'user':
        return { kind: 'user', key, text: item.text, selection: item.selection, selected: item.selected, sketch: item.sketch, photo: item.photo, drawing: item.drawing };
      case 'assistant':
        return { kind: 'assistant', key, text: item.text, open: false };
      case 'step':
        return { kind: 'step', key, step: item.step, state: item.state, current: false, archived: true };
      case 'question':
        return { kind: 'question', key, question: item.question, answered: true, choice: item.choice };
      case 'error':
        return { kind: 'error', key, message: item.message };
      case 'source':
        return { kind: 'source', key, source: item.source };
    }
  });
  return [...items, { kind: 'session', key: nextKey++, savedAt: chat.savedAt }];
}

export const useAssistant = create<AssistantStore>()((set) => ({
  state: { selected: 'claude-code', agents: [] },
  items: [],
  setState: (state) => {
    set({ state });
  },
  apply: (event) => {
    set((state) => {
      const items = reduce(state.items, event);
      // The message with a picture takes the picture this window sent with it.
      const last = items.at(-1);
      if (event.type !== 'user' || !state.nextAttachment || last?.kind !== 'user' || !(last.sketch || last.photo || last.drawing)) return { items };
      return { items: [...items.slice(0, -1), { ...last, attachments: state.nextAttachment }], nextAttachment: null };
    });
  },
  nextAttachment: null,
  attachNext: (attachments) => {
    set({ nextAttachment: attachments });
  },
  restore: (chat) => {
    set((state) => ({ items: [...fromStored(chat), ...state.items] }));
  },
  reset: () => {
    set({ items: [] });
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
