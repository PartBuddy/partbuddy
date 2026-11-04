import type { AgentEvent, AgentStatus, AppInfo, ConnectionStatus, MirrorRevision } from './contract';

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
  /** The user's own agent program, driven through the gate proxy (ADR 0015). */
  agent: {
    status(): Promise<AgentStatus>;
    /** Check installation and sign-in again, for example after signing in. */
    refresh(): Promise<AgentStatus>;
    send(text: string): Promise<void>;
    stop(): Promise<void>;
    /** Start the agent's own sign-in flow; it opens the browser. */
    signIn(): Promise<void>;
    onStatus(listener: (status: AgentStatus) => void): () => void;
    onEvent(listener: (event: AgentEvent) => void): () => void;
  };
}
