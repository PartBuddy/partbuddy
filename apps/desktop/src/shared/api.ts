import type { AgentEvent, AgentKind, AppInfo, AssistantState, ConnectionStatus, MirrorRevision } from './contract';

/**
 * What the preload exposes as `window.partbuddy`. Each member is bound to one channel of the
 * contract; there is no generic invoke (ADR 0013).
 */
export interface PartBuddyApi {
  appInfo(): Promise<AppInfo>;
  solidcraft: {
    status(): Promise<ConnectionStatus>;
    /** Look for SolidCraft again now instead of waiting for the next poll. */
    retry(): Promise<void>;
    /** Start SolidCraft with the control channel (the user pressed "Start SolidCraft"). */
    start(): Promise<void>;
    onStatus(listener: (status: ConnectionStatus) => void): () => void;
  };
  mirror: {
    current(): Promise<MirrorRevision | null>;
    onRevision(listener: (revision: MirrorRevision) => void): () => void;
  };
  /** The assistant: the user's Claude Code or ChatGPT plan usage (ADR 0015). */
  agent: {
    status(): Promise<AssistantState>;
    /** Check installation and sign-in again, for example after signing in. */
    refresh(): Promise<AssistantState>;
    select(agent: AgentKind): Promise<AssistantState>;
    /** Let Claude Code run with an API key, billed separately; off by default. */
    allowApiBilling(allow: boolean): Promise<AssistantState>;
    send(text: string): Promise<void>;
    stop(): Promise<void>;
    /** Start the selected route's sign-in flow; it opens the browser. */
    signIn(): Promise<void>;
    /** Sign out of ChatGPT in PartBuddy; Claude Code keeps its own sign-in. */
    signOut(): Promise<void>;
    onStatus(listener: (state: AssistantState) => void): () => void;
    onEvent(listener: (event: AgentEvent) => void): () => void;
  };
}
