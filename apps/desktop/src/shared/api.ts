import type {
  AgentEvent,
  AgentKind,
  AppInfo,
  AssistantState,
  ActionPreviewResult,
  ConnectionStatus,
  DesignAction,
  DimensionApply,
  DimensionProbe,
  DimensionProbeResult,
  ExportFormat,
  ExportResult,
  MeasureItem,
  MeasureResult,
  Selection,
  MirrorRevision,
  TitleBarColors,
  ViewState,
} from './contract';

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
  /** The user's own actions on the design, without the assistant (ADR 0016). */
  design: {
    undo(): Promise<void>;
    redo(): Promise<void>;
    /** Asks where to save, then exports all bodies; null when the user cancelled. */
    export(format: ExportFormat): Promise<ExportResult>;
    /** Saves the design to the project folder and opens it in the SolidCraft window. */
    openInSolidCraft(): Promise<void>;
    /** Tries a new edge length or radius without changing the design (the dimension field, M1b). */
    probeDimension(probe: DimensionProbe): Promise<DimensionProbeResult>;
    /** Sets the parameter a probe found. */
    applyDimension(apply: DimensionApply): Promise<void>;
    /** Builds an action (fillet, chamfer, extrude, hole, shell) on trial for the ghost preview. */
    previewAction(action: DesignAction): Promise<ActionPreviewResult>;
    applyAction(action: DesignAction): Promise<void>;
    /** Distance and angle between two selections. */
    measure(items: MeasureItem[]): Promise<MeasureResult>;
  };
  viewer: {
    /** Reports what the 3D view shows, for the assistant's `partbuddy_view` tool. */
    report(state: ViewState): Promise<void>;
  };
  window: {
    /** Colours the native window buttons in the integrated title bar like the theme. */
    setTitleBarColors(colors: TitleBarColors): Promise<void>;
  };
  /** The assistant: the user's Claude Code or ChatGPT plan usage (ADR 0015). */
  agent: {
    status(): Promise<AssistantState>;
    /** Check installation and sign-in again, for example after signing in. */
    refresh(): Promise<AssistantState>;
    select(agent: AgentKind): Promise<AssistantState>;
    /** Let Claude Code run with an API key, billed separately; off by default. */
    allowApiBilling(allow: boolean): Promise<AssistantState>;
    /** Sends a message; what is selected in the view goes with it as a short note. */
    send(text: string, selections?: Selection[]): Promise<void>;
    stop(): Promise<void>;
    /** Start the selected route's sign-in flow; it opens the browser. */
    signIn(): Promise<void>;
    /** Sign out of ChatGPT in PartBuddy; Claude Code keeps its own sign-in. */
    signOut(): Promise<void>;
    onStatus(listener: (state: AssistantState) => void): () => void;
    onEvent(listener: (event: AgentEvent) => void): () => void;
  };
}
