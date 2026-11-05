import type {
  AgentEvent,
  AgentKind,
  AppInfo,
  AssistantState,
  ActionPreviewResult,
  ConnectionStatus,
  Drawing,
  DesignAction,
  DimensionApply,
  DimensionMark,
  DimensionProbe,
  DimensionProbeResult,
  ExportFormat,
  ExportResult,
  MeasureItem,
  MeasureResult,
  MessageAnswer,
  TimelineCommand,
  VisibilityCommand,
  Selection,
  MirrorRevision,
  NotesState,
  TitleBarColors,
  Theme,
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
    /** Rolls the timeline back or forward, or suppresses a feature (M1c). */
    timeline(command: TimelineCommand): Promise<void>;
    /** Shows or hides bodies and sketches. */
    visibility(command: VisibilityCommand): Promise<void>;
    /** "Go back to this state": undoes or redoes to a step of the work log (M2a). */
    goToStep(step: string): Promise<void>;
    /** The dimensions of these features, or of all, placed in the view (M2b-3). */
    dimensions(features: number[] | 'all'): Promise<DimensionMark[]>;
    /** Tries a value of a parameter for the ghost preview, without changing the design. */
    probeParameter(parameter: string, value: number, body: string | null): Promise<ActionPreviewResult>;
  };
  /** Notes on the model (M2b, ADR 0020), stored in the design file. */
  notes: {
    current(): Promise<NotesState>;
    /** Pins a note to the selected face, edge or vertex. */
    add(selection: Selection, text: string): Promise<void>;
    edit(id: string, text: string): Promise<void>;
    delete(id: string): Promise<void>;
    /** Accepts a foreign note from the design file, so the assistant may read it. */
    accept(id: string): Promise<void>;
    /** Pins a note to a new place. */
    reattach(id: string, selection: Selection): Promise<void>;
    /** Puts a note that undo or "go back" removed back into the design. */
    restore(id: string): Promise<void>;
    /** Removes a note from the restore list for good. */
    dismiss(id: string): Promise<void>;
    onChange(listener: (state: NotesState) => void): () => void;
  };
  viewer: {
    /** Reports what the 3D view shows, for the assistant's `partbuddy_view` tool. */
    report(state: ViewState): Promise<void>;
  };
  window: {
    /** Colours the native window buttons in the integrated title bar like the theme. */
    setTitleBarColors(colors: TitleBarColors): Promise<void>;
    /** The colour theme the user chose; `system` follows Windows. */
    theme(): Promise<Theme>;
    /** Sets and keeps the colour theme; the whole window, its buttons included, follows. */
    setTheme(theme: Theme): Promise<Theme>;
  };
  /** The assistant: the user's Claude Code or ChatGPT plan usage (ADR 0015). */
  agent: {
    status(): Promise<AssistantState>;
    /** Check installation and sign-in again, for example after signing in. */
    refresh(): Promise<AssistantState>;
    select(agent: AgentKind): Promise<AssistantState>;
    /** Let Claude Code run with an API key, billed separately; off by default. */
    allowApiBilling(allow: boolean): Promise<AssistantState>;
    /**
     * Sends a message; what is selected in the view goes with it as a short note, strokes drawn on
     * the view as words (and a picture when the user asked for one).
     */
    send(text: string, selections?: Selection[], answer?: MessageAnswer, drawing?: Drawing): Promise<void>;
    stop(): Promise<void>;
    /** Start the selected route's sign-in flow; it opens the browser. */
    signIn(): Promise<void>;
    /** Sign out of ChatGPT in PartBuddy; Claude Code keeps its own sign-in. */
    signOut(): Promise<void>;
    onStatus(listener: (state: AssistantState) => void): () => void;
    onEvent(listener: (event: AgentEvent) => void): () => void;
  };
}
