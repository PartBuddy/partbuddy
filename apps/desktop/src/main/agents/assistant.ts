import type { AgentKind, AgentStatus, AssistantState, ModelChoice, Selection } from '../../shared/contract';
import type { SelectionSummary } from './viewContext';

/** What a picture that goes along with a message is: a rough sketch (F4), a photo (F6) or an SVG drawing. */
export type PictureKind = 'sketch' | 'photo' | 'drawing';

/** The user event of a message, with the selection and the kind of picture that went along. */
export function userEvent(text: string, label: string | undefined, summary?: SelectionSummary, picture?: PictureKind) {
  return {
    type: 'user' as const,
    text,
    ...(label ? { selection: label } : {}),
    ...(summary ? { selected: summary } : {}),
    ...(picture === 'sketch' ? { sketch: true as const } : {}),
    ...(picture === 'photo' ? { photo: true as const } : {}),
    ...(picture === 'drawing' ? { drawing: true as const } : {}),
  };
}

/** One assistant route (ADR 0015). */
export interface AgentBackend {
  status(): AgentStatus;
  refresh(): Promise<AgentStatus>;
  /**
   * `selections`: what the user selected in PartBuddy's view, sent along as a short note.
   * `note`: what the user changed or undid since the model's last turn (work log, M2a) and notes.
   * `image`: a PNG that goes along as a picture, a rough sketch (F4) or a photo (F6) as `kind` says.
   */
  send(text: string, selections?: Selection[], note?: string | null, image?: Uint8Array | null, kind?: PictureKind): Promise<void>;
  stop(): Promise<void>;
  /** Ends the conversation; the next message starts a new one (another project, B2). */
  newConversation(): Promise<void>;
  /** Model and effort from the next turn on; with `asDefault` also kept for new chats (B1). */
  chooseModel(choice: ModelChoice, asDefault: boolean): Promise<void>;
  /** True when the next message starts a new conversation that knows nothing of earlier ones. */
  freshConversation(): boolean;
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
    const switched = agent !== this.selected;
    if (switched) await this.current().stop();
    this.selected = agent;
    this.changed();
    // The picked route looks again: a server started after the last look is found without "Check again"
    // (Manuel, 2026-11-06: Strata with Qwen showed only after pressing it).
    if (switched) await this.current().refresh();
    return this.state();
  }

  send(text: string, selections: Selection[] = [], note: string | null = null, image: Uint8Array | null = null, kind: PictureKind = 'sketch'): Promise<void> {
    return this.current().send(text, selections, note, image, kind);
  }

  stop(): Promise<void> {
    return this.current().stop();
  }

  /** Every route starts a new conversation with the next message (another project, B2). */
  async newConversation(): Promise<void> {
    await Promise.all(Object.values(this.backends).map((backend) => backend.newConversation()));
  }

  async chooseModel(choice: ModelChoice, asDefault: boolean): Promise<AssistantState> {
    await this.current().chooseModel(choice, asDefault);
    return this.state();
  }

  /** Which route the next message goes to, and whether it starts a new conversation there. */
  conversation(): { route: AgentKind; fresh: boolean } {
    return { route: this.selected, fresh: this.current().freshConversation() };
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
