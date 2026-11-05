import type { AgentKind, AgentStatus, AssistantState, Selection } from '../../shared/contract';
import type { SelectionSummary } from './viewContext';

/** Strokes drawn on the view that go with a message (M2b-2): their count, and the picture if the user asked for it. */
export interface SentDrawing {
  strokes: number;
  image: Uint8Array | null;
}

/** The user event of a message, with what went along (selection label, drawing). */
export function userEvent(text: string, label: string | undefined, drawing: SentDrawing | null, summary?: SelectionSummary) {
  return {
    type: 'user' as const,
    text,
    ...(label ? { selection: label } : {}),
    ...(summary ? { selected: summary } : {}),
    ...(drawing ? { drawing: { strokes: drawing.strokes, image: drawing.image !== null } } : {}),
  };
}

/** One assistant route (ADR 0015). */
export interface AgentBackend {
  status(): AgentStatus;
  refresh(): Promise<AgentStatus>;
  /**
   * `selections`: what the user selected in PartBuddy's view, sent along as a short note.
   * `note`: what the user changed or undid since the model's last turn (work log, M2a), notes and drawings.
   * `drawing`: strokes on the view that went with it; their words are in `note`, a picture in `image`.
   */
  send(text: string, selections?: Selection[], note?: string | null, drawing?: SentDrawing | null): Promise<void>;
  stop(): Promise<void>;
  signIn(): void;
  signOut(): Promise<void>;
  dispose(): Promise<void>;
}

/** Holds the routes and which one the user picked; every call goes to the picked route. */
export class Assistant {
  private selected: AgentKind;

  constructor(
    private readonly backends: Record<AgentKind, AgentBackend>,
    private readonly onState: (state: AssistantState) => void,
    initial: AgentKind = 'claude-code',
  ) {
    this.selected = initial;
  }

  state(): AssistantState {
    return { selected: this.selected, agents: Object.values(this.backends).map((backend) => backend.status()) };
  }

  /** Called by a backend whenever its status changes. */
  changed(): void {
    this.onState(this.state());
  }

  async refresh(): Promise<AssistantState> {
    await Promise.all(Object.values(this.backends).map((backend) => backend.refresh()));
    return this.state();
  }

  async select(agent: AgentKind): Promise<AssistantState> {
    if (agent !== this.selected) await this.current().stop();
    this.selected = agent;
    this.changed();
    return this.state();
  }

  send(text: string, selections: Selection[] = [], note: string | null = null, drawing: SentDrawing | null = null): Promise<void> {
    return this.current().send(text, selections, note, drawing);
  }

  stop(): Promise<void> {
    return this.current().stop();
  }

  signIn(): void {
    this.current().signIn();
  }

  signOut(): Promise<void> {
    return this.current().signOut();
  }

  async dispose(): Promise<void> {
    await Promise.allSettled(Object.values(this.backends).map((backend) => backend.dispose()));
  }

  private current(): AgentBackend {
    return this.backends[this.selected];
  }
}
