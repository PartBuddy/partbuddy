import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { createActor, fromCallback, fromPromise } from 'xstate';

import type { ConnectionStatus, ExportFormat, MirrorRevision } from '../../shared/contract';
import type { UpstreamTools } from '../agents/gateProxy';
import { ControlClient, ControlError } from './controlClient';
import { endpointForPort, findExecutable, findRunning, type ControlEndpoint, type Environment } from './discovery';
import type { DesignAction, MeasureItem, MeasureResult, TimelineCommand, VisibilityCommand } from '../../shared/contract';
import { ActionService, type ActionPreview } from './actions';
import { DimensionService, type DimensionTarget, type ProbeResult } from './dimensions';
import { featureMarks, pointExpressions, resolvePoints, sketchMarks, type RawFeature, type RawParameter, type RawSketch } from './dimensionMarks';
import type { DesignParameter, DimensionMark } from '../../shared/contract';
import { DesignStore, HeadlessEngine, isInside, safeDesignFileName } from './headless';
import { supervisorMachine, type DiscoveryResult, type Launched, type SupervisorActor, type SupervisorEvent } from './machine';
import type { DesignHistory } from '../agents/workLog';
import { count, mirrorActiveDesign, MirrorScheduler, type BatchResult, type ControlRequester } from './mirror';

export interface SupervisorOptions {
  environment: Environment;
  /** Control port used when PartBuddy starts SolidCraft (decided 2026-11-04: 7878). */
  launchPort: number;
  /** Start SolidCraft on the first search when none runs. */
  autoStart: boolean;
  /** Disposable folder for mirrored exports. */
  cacheDir: string;
  /** How long a started SolidCraft may take to open its control channel. */
  startTimeoutMs?: number;
  /**
   * What PartBuddy starts when no SolidCraft runs: the engine without a window (default in the
   * app, ADR 0016) or the SolidCraft window with its control channel. A window the user opened
   * is always used as it is.
   */
  launchMode?: 'headless' | 'window';
  /** Where the headless design is kept between runs. */
  designsDir?: string;
  /**
   * The user's project folder (`Documents\\PartBuddy`): the headless engine may read and write it,
   * and "Open in SolidCraft" saves the design there.
   */
  projectsDir?: string;
  /** Quiet time after a change before the headless design is saved. */
  autosaveDelayMs?: number;
  log(message: string): void;
}

export interface SupervisorListeners {
  status(status: ConnectionStatus): void;
  revision(revision: MirrorRevision): void;
}

type Mirror = ConnectionStatus['mirror'];
type SaveState = NonNullable<ConnectionStatus['save']>;

/**
 * SolidCraft supervisor (architecture: main process, own glue). Finds or starts SolidCraft,
 * holds one authenticated control connection with `control.subscribe`, and mirrors every new
 * revision to the renderer. It never models geometry itself.
 */
export class SolidCraftSupervisor {
  private readonly actor: SupervisorActor;
  private client: ControlClient | null = null;
  private child: ChildProcess | null = null;
  private engine: HeadlessEngine | null = null;
  private autosaveTimer: NodeJS.Timeout | null = null;
  private autosaving: Promise<void> = Promise.resolve();
  private readonly designs: DesignStore | null;
  /** The file the headless design was opened from, when it lies in the project folder. */
  private designFile: string | null = null;
  /** The file the open design was last opened from or saved to; the chat is kept next to it. */
  private currentFile: string | null = null;
  /** Set by openInSolidCraft(): the next launch opens this file in the SolidCraft window. */
  private handoffFile: string | null = null;
  private mirrorState: Mirror = 'idle';
  private mirrorDetail: string | null = null;
  private latest: MirrorRevision | null = null;
  /** Where the autosave of the headless design stands; none until the first save. */
  private saveState: SaveState | null = null;
  /** The file a new design was named into on its first autosave, until its name is mirrored. */
  private savedAs: { documentId: string; file: string } | null = null;
  private readonly scheduler: MirrorScheduler;
  private readonly dimensions: DimensionService;
  private readonly actions: ActionService;
  /** Probes run one after another; SolidCraft runs one batch at a time anyway. */
  private probing: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly options: SupervisorOptions,
    private readonly listeners: SupervisorListeners,
  ) {
    this.dimensions = new DimensionService(() => this.requester(), options.cacheDir);
    this.actions = new ActionService(() => this.requester(), options.cacheDir);
    this.designs = options.designsDir ? new DesignStore(options.designsDir, options.projectsDir ? [options.projectsDir] : []) : null;
    this.scheduler = new MirrorScheduler(
      () => {
        if (this.engine?.isOpen) return mirrorActiveDesign(this.engine.requester, options.cacheDir);
        const client = this.client;
        if (!client?.isOpen) return Promise.reject(new Error('not connected'));
        return mirrorActiveDesign(client, options.cacheDir);
      },
      {
        started: () => {
          this.setMirror('rebuilding', null);
        },
        delivered: (revision) => {
          this.latest = revision;
          this.listeners.revision(revision);
          this.scheduleAutosave();
        },
        failed: (error) => {
          this.options.log(`mirror failed: ${error.message}`);
          this.setMirror('failed', error.message);
        },
        idle: () => {
          this.setMirror('idle', null);
        },
      },
    );

    const machine = supervisorMachine.provide({
      actors: {
        discover: fromPromise(() => Promise.resolve(this.discover())),
        launch: fromPromise(() => this.launch()),
        waitForApp: fromPromise(({ input }) => this.waitForApp(input.launchedAt)),
        connect: fromPromise(({ input }) => this.connect(input.endpoint)),
        session: fromCallback<SupervisorEvent>(({ sendBack }) => this.watchSession(sendBack)),
      },
    });
    this.actor = createActor(machine, { input: { autoStart: options.autoStart } });
    this.actor.subscribe(() => {
      this.publish();
    });
  }

  start(): void {
    this.actor.start();
  }

  retry(): void {
    this.actor.send({ type: 'RETRY' });
  }

  startSolidCraft(): void {
    this.actor.send({ type: 'START' });
  }

  /** Control port of the connected SolidCraft window, for tools that bridge to the same app. */
  connectedPort(): number | null {
    const snapshot = this.actor.getSnapshot();
    return snapshot.value === 'connected' ? (snapshot.context.endpoint?.port ?? null) : null;
  }

  /** SolidCraft's tools on the headless engine, while it is connected; null with a window. */
  headlessTools(): UpstreamTools | null {
    return this.actor.getSnapshot().value === 'connected' && this.engine?.isOpen ? this.engine.tools : null;
  }

  currentRevision(): MirrorRevision | null {
    return this.latest;
  }

  /** Undoes SolidCraft's last change (the user's Undo, not the assistant's). */
  undo(): Promise<void> {
    return this.runEdit('edit.undo');
  }

  redo(): Promise<void> {
    return this.runEdit('edit.redo');
  }

  /**
   * Exports every visible body to `destination`, a file the user picked in the save dialog;
   * `prepare` may rewrite the exported file before it is copied there.
   * SolidCraft writes into the cache folder only (its allowed folders); PartBuddy copies the file
   * from there, so the user may save anywhere without widening what SolidCraft may write.
   */
  async exportDesign(format: ExportFormat, destination: string, prepare?: (file: string) => Promise<void>): Promise<void> {
    const requester = this.requester();
    const bodies = this.latest?.bodies.map((body) => body.name) ?? [];
    if (bodies.length === 0) throw new Error('the design has no body to export');
    await mkdir(this.options.cacheDir, { recursive: true });
    const temp = join(this.options.cacheDir, `export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${format}`);
    try {
      const batch = await requester.request<{ failed?: { error: string } }>(
        'engine.batch',
        { commands: [{ command: 'file.export', params: { path: temp, format, bodies } }], rollback: false, allow_paths: [this.options.cacheDir] },
        10 * 60 * 1000,
      );
      if (batch.failed) throw new Error(`export failed: ${batch.failed.error}`);
      // For example turned into the print orientation (M7), still in the cache folder.
      if (prepare) await prepare(temp);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(temp, destination);
    } finally {
      await rm(temp, { force: true });
    }
  }

  /**
   * Tries a new value for the selected edge length or radius without changing the design (the
   * dimension field, M1b). A probe moves SolidCraft's revision although the design is the same;
   * the headless engine records that quietly, so nothing is mirrored again.
   */
  probeDimension(target: DimensionTarget, current: number, value: number): Promise<ProbeResult> {
    const run = this.probing.then(async () => {
      try {
        return await this.dimensions.probe(target, current, value);
      } finally {
        await this.engine?.checkForChange(true).catch(() => undefined);
      }
    });
    this.probing = run.catch(() => undefined);
    return run;
  }

  /** Sets the parameter the probe found (the user pressed Enter); the change is mirrored as usual. */
  async applyDimension(parameter: string, value: number, factor: 1 | 2): Promise<void> {
    await this.probing;
    await this.dimensions.apply(parameter, value, factor);
    await this.engine?.checkForChange();
  }

  /** The user parameters of the design for the parameter panel; reading changes nothing. */
  async parameters(): Promise<DesignParameter[]> {
    await this.probing;
    return this.dimensions.userParameters();
  }

  /** One trial at a time, like the dimension probes; the headless engine records the moved revision quietly. */
  private trial<T>(work: () => Promise<T>): Promise<T> {
    const run = this.probing.then(async () => {
      try {
        return await work();
      } finally {
        await this.engine?.checkForChange(true).catch(() => undefined);
      }
    });
    this.probing = run.catch(() => undefined);
    return run;
  }

  previewAction(action: DesignAction): Promise<ActionPreview> {
    return this.trial(() => this.actions.preview(action));
  }

  async applyAction(action: DesignAction): Promise<void> {
    await this.probing;
    await this.actions.apply(action);
    await this.engine?.checkForChange();
  }

  measure(items: MeasureItem[]): Promise<MeasureResult> {
    return this.trial(() => this.actions.measure(items));
  }

  /**
   * Runs engine steps on trial (ADR 0017): a failing last step makes SolidCraft undo the whole
   * batch, undo history included, and still return the results before it. Null when one of the
   * given steps failed.
   */
  trialSteps(steps: { command: string; params: Record<string, unknown> }[]): Promise<unknown[] | null> {
    return this.trial(async () => {
      const reply = await this.requester().request<BatchResult & { failed?: { index: number } }>(
        'engine.batch',
        { commands: [...steps, { command: 'sketch.inspect', params: { sketch: 2147483647 } }], rollback: true },
        60_000,
      );
      return reply.failed?.index === steps.length ? reply.results.slice(0, steps.length) : null;
    });
  }

  /** The design's document id and `document.metadata`, where the notes live (ADR 0020). */
  async readMetadata(): Promise<{ documentId: string; metadata: unknown }> {
    const batch = await this.requester().request<BatchResult>(
      'engine.batch',
      { commands: [{ command: 'document.revision', params: {} }, { command: 'document.metadata', params: {} }], rollback: false },
      30_000,
    );
    if (batch.failed) throw new Error(`${batch.failed.command} failed: ${batch.failed.error}`);
    const head = batch.results[0] as { document_id?: unknown } | undefined;
    if (typeof head?.document_id !== 'string') throw new Error('document.revision returned no document id');
    return { documentId: head.document_id, metadata: (batch.results[1] as { metadata?: unknown } | undefined)?.metadata ?? {} };
  }

  /** Sets or removes (null) metadata keys in one undo step; mirrored like any change. */
  writeMetadata(values: Record<string, unknown>): Promise<void> {
    return this.run({ command: 'document.metadata.set', params: { values } });
  }

  /** Tries a parameter value for the ghost of a dimension label (M2b-3); the design stays as it is. */
  probeParameter(parameter: string, value: number, body: string | null): ReturnType<DimensionService['previewParameter']> {
    return this.trial(() => this.dimensions.previewParameter(parameter, value, body));
  }

  /**
   * The dimensions of the given features, or of every active one, placed in the view (M2b-3,
   * ADR 0020): their inputs from `timeline.inspect` and, for a sketch or a feature built on one,
   * the sketch's dimensions from `sketch.inspect`.
   */
  async dimensionMarks(features: number[] | 'all'): Promise<DimensionMark[]> {
    const requester = this.requester();
    const head = await requester.request<BatchResult>(
      'engine.batch',
      { commands: [{ command: 'document.inspect', params: {} }, { command: 'parameters.list', params: {} }], rollback: false },
      60_000,
    );
    if (head.failed) throw new Error(`${head.failed.command} failed: ${head.failed.error}`);
    const inspect = (head.results[0] ?? {}) as {
      timeline?: { id?: unknown; name?: unknown; type?: unknown; suppressed?: unknown; rolled_back?: unknown }[];
      sketches?: { id?: unknown; name?: unknown }[];
      bodies?: { name?: unknown; feature?: unknown; visible?: unknown }[];
    };
    const parameters = (((head.results[1] ?? {}) as { parameters?: unknown[] }).parameters ?? []).filter(
      (entry): entry is RawParameter =>
        typeof entry === 'object' && entry !== null && typeof (entry as RawParameter).name === 'string' && typeof (entry as RawParameter).expression === 'string',
    );
    const active = (inspect.timeline ?? []).filter((entry) => Number.isInteger(entry.id) && entry.suppressed !== true && entry.rolled_back !== true);
    const wanted = (features === 'all' ? active : active.filter((entry) => features.includes(entry.id as number))).slice(0, 60);
    if (wanted.length === 0) return [];
    const timeline = await requester.request<BatchResult>(
      'engine.batch',
      { commands: wanted.map((entry) => ({ command: 'timeline.inspect', params: { feature: entry.id } })), rollback: false },
      60_000,
    );
    const inspected: RawFeature[] = wanted.map((entry, i) => {
      const result = (timeline.results[i] ?? {}) as { inputs?: unknown; definition?: unknown };
      return {
        id: entry.id as number,
        name: typeof entry.name === 'string' ? entry.name : `#${String(entry.id)}`,
        type: typeof entry.type === 'string' ? entry.type : '',
        inputs: Array.isArray(result.inputs) ? result.inputs : [],
        definition: typeof result.definition === 'object' && result.definition !== null ? (result.definition as Record<string, unknown>) : {},
      };
    });
    // Points kept as expressions (a box corner at "wall + hook_width") are evaluated by SolidCraft.
    const expressions = pointExpressions(inspected);
    const values = new Map<string, number>();
    if (expressions.length > 0) {
      const evaluated = await requester.request<BatchResult>(
        'engine.batch',
        { commands: expressions.map((expression) => ({ command: 'expr.evaluate', params: { expression, kind: 'length' } })), rollback: false },
        60_000,
      );
      expressions.forEach((expression, i) => {
        const result = (evaluated.results[i] ?? {}) as { ok?: unknown; value?: unknown };
        if (result.ok !== false && typeof result.value === 'number' && Number.isFinite(result.value)) values.set(expression, result.value);
      });
    }
    const raw = inspected.map((feature) => resolvePoints(feature, values));
    // Sketch features name their sketch; features built on a sketch carry its id.
    const sketchIdOf = (feature: RawFeature): number | null => {
      if (feature.type === 'Sketch') {
        const sketch = (inspect.sketches ?? []).find((entry) => entry.name === feature.name);
        return Number.isInteger(sketch?.id) ? (sketch?.id as number) : null;
      }
      return Number.isInteger(feature.definition.sketch) ? (feature.definition.sketch as number) : null;
    };
    const sketchIds = [...new Set(raw.map(sketchIdOf).filter((id): id is number => id !== null))];
    const sketches = new Map<number, RawSketch>();
    if (sketchIds.length > 0) {
      const read = await requester.request<BatchResult>(
        'engine.batch',
        { commands: sketchIds.map((sketch) => ({ command: 'sketch.inspect', params: { sketch } })), rollback: false },
        60_000,
      );
      sketchIds.forEach((id, i) => {
        const result = read.results[i];
        if (typeof result === 'object' && result !== null) sketches.set(id, result);
      });
    }
    const visible = (inspect.bodies ?? []).filter((body) => typeof body.name === 'string' && body.visible !== false);
    const bodyOf = (feature: RawFeature): string | null => {
      const named = feature.definition.body_names;
      if (Array.isArray(named) && typeof named[0] === 'string') return named[0];
      const made = visible.find((body) => body.feature === feature.id);
      if (made) return made.name as string;
      return visible.length === 1 ? (visible[0]?.name as string) : null;
    };
    const marks = new Map<string, DimensionMark>();
    for (const feature of raw) {
      const sketchId = sketchIdOf(feature);
      const sketch = sketchId !== null ? (sketches.get(sketchId) ?? null) : null;
      const body = bodyOf(feature);
      // One mark per parameter: a sketch shown with the feature built on it is listed once.
      const found = [...featureMarks(feature, parameters, sketch, body), ...(sketch ? sketchMarks(sketch, { id: feature.id, name: feature.name }, parameters, body) : [])];
      for (const mark of found) if (!marks.has(mark.parameter)) marks.set(mark.parameter, mark);
    }
    return [...marks.values()].slice(0, 400);
  }

  /** The file of the open design, or null while it has none (a new design before its first save). */
  designPath(): string | null {
    return this.currentFile;
  }

  /** Whether "Open in SolidCraft" is possible: the headless engine runs and holds the design. */
  canOpenInSolidCraft(): boolean {
    return this.actor.getSnapshot().value === 'connected' && this.engine?.isOpen === true && Boolean(this.options.projectsDir);
  }

  /**
   * "Open in SolidCraft": saves the headless design to the project folder, ends the engine and
   * opens that file in the SolidCraft window, which PartBuddy then follows over the control
   * channel. The user owns that window; once it closes, PartBuddy runs the engine again with
   * the file. Returns the file.
   */
  async openInSolidCraft(): Promise<string> {
    const engine = this.engine;
    const projects = this.options.projectsDir;
    if (!this.canOpenInSolidCraft() || !engine || !projects) throw new Error('SolidCraft (headless) is not running');
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    await this.autosaving;
    const file = this.designFile ?? join(projects, `${safeDesignFileName(this.latest?.designName ?? '')}.sc`);
    await engine.save(file);
    this.designFile = file;
    this.designs?.remember(file);
    this.currentFile = file;
    this.handoffFile = file;
    this.actor.send({ type: 'HANDOFF' });
    return file;
  }

  status(): ConnectionStatus {
    const snapshot = this.actor.getSnapshot();
    const { context } = snapshot;
    // Nested states (starting.launching, starting.waiting) report as their parent.
    const state = typeof snapshot.value === 'string' ? snapshot.value : 'starting';
    const status: ConnectionStatus = { state, owned: context.owned, mirror: this.mirrorState };
    if (state === 'connected') status.engine = this.engine?.isOpen ? 'headless' : 'window';
    if (state === 'connected' && this.engine?.isOpen && this.saveState) status.save = this.saveState;
    if (context.endpoint) status.port = context.endpoint.port;
    if (context.documentId !== null) status.documentId = context.documentId;
    if (context.revision !== null) status.revision = context.revision;
    const detail = state === 'connected' ? this.mirrorDetail : context.detail;
    if (detail) status.detail = detail.slice(0, 500);
    return status;
  }

  /**
   * Closes the connection. A SolidCraft that PartBuddy started is asked to quit (decided
   * 2026-11-04); it still asks the user about unsaved designs. One started elsewhere keeps running.
   */
  async shutdown(): Promise<void> {
    const client = this.client;
    const owned = this.actor.getSnapshot().context.owned;
    const engine = this.engine;
    this.actor.stop();
    if (engine) {
      // Keep the last change: save now instead of after the quiet time.
      if (this.autosaveTimer) {
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = null;
        await this.autosave();
      }
      await this.autosaving;
      await engine.close();
      this.engine = null;
    }
    if (client?.isOpen && owned) {
      try {
        await client.request('app.quit', {}, 5000);
      } catch (error) {
        this.options.log(`app.quit not confirmed: ${(error as Error).message}`);
      }
    }
    client?.close();
    this.client = null;
  }

  /** The connected engine: the headless one, or the SolidCraft window's control channel. */
  private requester(): ControlRequester {
    if (this.actor.getSnapshot().value !== 'connected') throw new Error('SolidCraft is not connected');
    if (this.engine?.isOpen) return this.engine.requester;
    if (this.client?.isOpen) return this.client;
    throw new Error('SolidCraft is not connected');
  }

  private runEdit(command: 'edit.undo' | 'edit.redo'): Promise<void> {
    return this.run({ command, params: {} });
  }

  /** Rolls the timeline back or forward, or suppresses a feature (the user's timeline, M1c). */
  timeline(command: TimelineCommand): Promise<void> {
    if (command.action === 'rollTo') return this.run({ command: 'timeline.roll_to', params: { position: command.position } });
    return this.run({ command: 'timeline.suppress', params: { feature: command.feature, suppressed: command.suppressed } });
  }

  /** Shows or hides bodies and sketches; the mirror shows only visible ones. */
  visibility(command: VisibilityCommand): Promise<void> {
    return this.run({ command: 'browser.visibility', params: { visible: command.visible, items: [...command.bodies, ...command.sketches] } });
  }

  /** Revision and undo history right now, for the work log (M2a). */
  async history(): Promise<DesignHistory> {
    const batch = await this.requester().request<BatchResult>(
      'engine.batch',
      { commands: [{ command: 'document.revision', params: {} }, { command: 'document.inspect', params: {} }], rollback: false },
      30_000,
    );
    if (batch.failed) throw new Error(`${batch.failed.command} failed: ${batch.failed.error}`);
    const head = batch.results[0] as { document_id?: unknown; revision?: unknown } | undefined;
    const inspect = batch.results[1] as { undo?: unknown; redo?: unknown } | undefined;
    if (typeof head?.document_id !== 'string' || typeof head.revision !== 'number') throw new Error('document.revision returned no revision');
    return { documentId: head.document_id, revision: head.revision, undo: count(inspect?.undo), redo: count(inspect?.redo) };
  }

  /** Undo or Redo `count` times in one request ("go back to this state", M2a). */
  async travel(command: 'edit.undo' | 'edit.redo', count: number): Promise<void> {
    if (!Number.isInteger(count) || count < 1) return;
    await this.probing;
    const commands = Array.from({ length: count }, () => ({ command, params: {} }));
    const batch = await this.requester().request<{ failed?: { error: string } }>('engine.batch', { commands, rollback: false }, 10 * 60 * 1000);
    if (batch.failed) throw new Error(`${command} failed: ${batch.failed.error}`);
    await this.engine?.checkForChange();
  }

  /** One engine command of the user, after any running trial; the change is mirrored as usual. */
  private async run(step: { command: string; params: Record<string, unknown> }): Promise<void> {
    await this.probing;
    const batch = await this.requester().request<{ failed?: { error: string } }>('engine.batch', { commands: [step], rollback: false }, 10 * 60 * 1000);
    if (batch.failed) throw new Error(`${step.command} failed: ${batch.failed.error}`);
    // The window reports the change with design.changed; the headless engine is asked.
    await this.engine?.checkForChange();
  }

  private publish(): void {
    this.listeners.status(this.status());
  }

  private setSaveState(state: SaveState): void {
    if (this.saveState === state) return;
    this.saveState = state;
    this.publish();
  }

  private setMirror(state: Mirror, detail: string | null): void {
    this.mirrorState = state;
    this.mirrorDetail = detail;
    this.publish();
  }

  private discover(): DiscoveryResult {
    const running = findRunning(this.options.environment);
    if (running.found) return { kind: 'running', endpoint: running.endpoint };
    // The launch port may hold an app whose discovery file was replaced by a later one.
    const onLaunchPort = endpointForPort(this.options.environment, this.options.launchPort);
    if (onLaunchPort.found) return { kind: 'running', endpoint: onLaunchPort.endpoint };
    if (!findExecutable(this.options.environment)) return { kind: 'notInstalled' };
    return { kind: 'notRunning' };
  }

  private async launchHeadless(executable: string): Promise<Launched> {
    const launchedAt = Date.now();
    const cli = join(dirname(executable), process.platform === 'win32' ? 'solidcraft-cli.exe' : 'solidcraft-cli');
    if (!existsSync(cli)) throw new Error('SolidCraft is installed without solidcraft-cli');
    const allowPaths = [this.options.cacheDir, ...(this.options.projectsDir ? [this.options.projectsDir] : [])];
    if (this.designs) allowPaths.push(this.designs.folder);
    const design = this.designs?.last();
    const start = (file: string | undefined) => HeadlessEngine.start({ cli, allowPaths, design: file, env: this.options.environment.env });
    let engine: HeadlessEngine;
    const projects = this.options.projectsDir;
    try {
      engine = await start(design);
      this.designFile = design && projects && isInside(projects, design) ? design : null;
      this.currentFile = design ?? null;
    } catch (error) {
      if (!design) throw new Error(`SolidCraft (headless) could not be started: ${(error as Error).message}`, { cause: error });
      // The saved design did not open (moved, damaged, newer format): start empty, keep the file.
      this.options.log(`the last design did not open (${(error as Error).message}); starting a new one`);
      this.designs?.forget();
      this.designFile = null;
      this.currentFile = null;
      engine = await start(undefined);
    }
    this.engine = engine;
    this.options.log(`started SolidCraft headless${design ? ' with the last design' : ''}`);
    return { launchedAt, headless: true };
  }

  private scheduleAutosave(): void {
    if (!this.engine?.isOpen || !this.designs) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.autosave();
    }, this.options.autosaveDelayMs ?? 1500);
  }

  /** Saves the headless design under its name in the designs folder and notes it for the next start. */
  private autosave(): Promise<void> {
    const engine = this.engine;
    const designs = this.designs;
    if (!engine?.isOpen || !designs) return this.autosaving;
    // A design from the project folder is saved back to its own file; others go to the designs folder.
    const latest = this.latest;
    const named = this.savedAs && this.savedAs.documentId === latest?.documentId ? this.savedAs.file : null;
    const file = designs.autosaveTarget(this.designFile ?? named, latest?.designName ?? '', latest?.bodies.map((body) => body.name) ?? []);
    // A new design saved under a name of its own: SolidCraft now calls it by the file name.
    const renamed = latest !== null && basename(file, '.sc') !== safeDesignFileName(latest.designName);
    if (renamed) this.savedAs = { documentId: latest.documentId, file };
    this.setSaveState('saving');
    this.autosaving = this.autosaving
      .then(() => engine.save(file))
      .then(async () => {
        designs.remember(file);
        this.currentFile = file;
        this.setSaveState('saved');
        // Without a window SolidCraft announces nothing, so the new name is mirrored right away.
        if (renamed) this.scheduler.request(await engine.revision());
      })
      .catch((error: unknown) => {
        this.options.log(`autosave failed: ${(error as Error).message}`);
        this.setSaveState('failed');
      });
    return this.autosaving;
  }

  private async launch(): Promise<Launched> {
    const executable = findExecutable(this.options.environment);
    if (!executable) throw new Error('SolidCraft is not installed');
    const handoff = this.handoffFile;
    this.handoffFile = null;
    if (handoff) {
      // The design is saved; the engine ends before the window opens the same file.
      const engine = this.engine;
      this.engine = null;
      this.scheduler.reset();
      await engine?.close();
    } else if ((this.options.launchMode ?? 'window') === 'headless') {
      return this.launchHeadless(executable);
    }
    const launchedAt = Date.now();
    const args = ['--control', String(this.options.launchPort), ...(handoff ? [handoff] : [])];
    return new Promise((resolve, reject) => {
      // Argument array, no shell (architecture: security boundaries).
      const child = spawn(executable, args, {
        stdio: 'ignore',
        windowsHide: false,
        shell: false,
      });
      child.once('error', (error) => {
        reject(new Error(`SolidCraft could not be started: ${error.message}`));
      });
      child.once('spawn', () => {
        this.child = child;
        this.options.log(`started SolidCraft (pid ${child.pid ?? '?'}) on port ${this.options.launchPort}`);
        resolve({ launchedAt, headless: false, handoff: handoff !== null });
      });
      child.once('exit', (code) => {
        this.options.log(`SolidCraft exited with code ${code ?? 'null'}`);
        this.child = null;
      });
    });
  }

  private async waitForApp(launchedAt: number): Promise<ControlEndpoint> {
    const deadline = Date.now() + (this.options.startTimeoutMs ?? 90_000);
    // A token file older than the launch belongs to an earlier, force-quit app.
    while (Date.now() < deadline) {
      const lookup = endpointForPort(this.options.environment, this.options.launchPort);
      if (lookup.found && lookup.endpoint.writtenAt >= launchedAt - 1000) return lookup.endpoint;
      if (this.child === null && Date.now() - launchedAt > 2000) {
        throw new Error('SolidCraft closed before its control channel opened');
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('SolidCraft did not open its control channel in time');
  }

  private async connect(endpoint: ControlEndpoint | null): Promise<{ documentId: string; revision: number }> {
    if (!endpoint) {
      const engine = this.engine;
      if (!engine?.isOpen) throw new Error('SolidCraft (headless) is not running');
      const { documentId, revision } = await engine.revision();
      this.options.log('connected to SolidCraft headless');
      return { documentId, revision };
    }
    this.engine = null;
    this.client?.close();
    const client = await ControlClient.open({ port: endpoint.port, token: endpoint.token });
    try {
      const result = await client.request<{ document_id: string; revision: number }>('control.subscribe', {}, 15_000);
      if (typeof result.document_id !== 'string' || typeof result.revision !== 'number') {
        throw new ControlError('control.subscribe returned no revision', 'protocol');
      }
      this.client = client;
      this.options.log(`connected to SolidCraft on port ${endpoint.port}`);
      return { documentId: result.document_id, revision: result.revision };
    } catch (error) {
      client.close();
      throw error;
    }
  }

  private watchSession(sendBack: (event: SupervisorEvent) => void): () => void {
    const engine = this.engine;
    if (engine?.isOpen) {
      const { documentId, revision } = this.actor.getSnapshot().context;
      if (documentId !== null && revision !== null) this.scheduler.request({ documentId, revision });
      const offChange = engine.onChange((next) => {
        sendBack({ type: 'REVISION', documentId: next.documentId, revision: next.revision });
        this.scheduler.request(next);
      });
      const offClose = engine.onClose((reason) => {
        this.engine = null;
        this.scheduler.reset();
        sendBack({ type: 'LOST', reason });
      });
      return () => {
        offChange();
        offClose();
      };
    }
    const client = this.client;
    if (!client) {
      sendBack({ type: 'LOST', reason: 'no connection' });
      return () => undefined;
    }
    const { documentId, revision } = this.actor.getSnapshot().context;
    if (documentId !== null && revision !== null) this.scheduler.request({ documentId, revision });

    const offEvent = client.onEvent(({ event, params }) => {
      if (event !== 'design.changed') return;
      const p = params as { document_id?: unknown; revision?: unknown } | null;
      if (typeof p?.document_id !== 'string' || typeof p.revision !== 'number') return;
      sendBack({ type: 'REVISION', documentId: p.document_id, revision: p.revision });
      this.scheduler.request({ documentId: p.document_id, revision: p.revision });
    });
    const offClose = client.onClose((reason) => {
      this.client = null;
      this.scheduler.reset();
      sendBack({ type: 'LOST', reason });
    });
    return () => {
      offEvent();
      offClose();
    };
  }
}
