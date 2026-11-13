import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync } from 'node:fs';
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';

import { createActor, fromCallback, fromPromise } from 'xstate';

import type { ConnectionStatus, ExportFormat, MirrorRevision } from '../../shared/contract';
import type { UpstreamTools } from '../agents/gateProxy';
import { ControlClient, ControlError } from './controlClient';
import { cliBeside, endpointForPort, findExecutable, findRunning, type ControlEndpoint, type Environment } from './discovery';
import type { ClearanceResult, DesignAction, JointSweep, JointSweepResult, MeasureItem, MeasureResult, PartInsert, PartsLibrary, TimelineCommand, VisibilityCommand } from '../../shared/contract';
import { ActionService, type ActionPreview } from './actions';
import { DimensionService, type DimensionTarget, type ProbeResult } from './dimensions';
import { featureMarks, pointExpressions, resolvePoints, sketchMarks, type RawFeature, type RawParameter, type RawSketch } from './dimensionMarks';
import type { DesignParameter, DimensionMark, LogoMoveRequest, LogoSpot } from '../../shared/contract';
import { logoAt, planLogoMove } from './logoMove';
import { blockBodies, colourLayers, planeAt, stepsOf, type FeatureBlock } from '../../shared/blocks';
import { centring, hostFace, movedPlane, TEXT_PREFIX, uniqueLogoName } from '../../shared/drawingPlacement';
import { insertCommand, type ImportKind } from '../projects/importFile';
import { freeBodyName, libraryOf } from './standardParts';
import { cliReferences, type PartReferences } from './partReference';
import { ProjectStore } from '../projects/projectStore';
import { HeadlessEngine, safeDesignFileName } from './headless';
import { supervisorMachine, type DiscoveryResult, type Launched, type SupervisorActor, type SupervisorEvent } from './machine';
import type { DesignHistory } from '../agents/workLog';
import { boughtParts, count, hardwareOf, mirrorActiveDesign, MirrorScheduler, type BatchResult, type BoughtPart, type ControlRequester, type PartChecks } from './mirror';

export interface SupervisorOptions {
  environment: Environment;
  /** For tests: the standard part references instead of `solidcraft-cli`'s; `built` is to be called when one arrives. */
  partReferences?: (built: () => void) => PartReferences;
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
  /** PartBuddy's own folder for the note of the last project; before B2 it held the designs. */
  designsDir?: string;
  /** The name of a new part before it has one of its own, in the user's language ("Teil"). */
  newPartName?: string;
  /**
   * The user's project folder (`Documents\\PartBuddy`): the headless engine may read and write it,
   * and "Open in SolidCraft" saves the design there.
   */
  projectsDir?: string;
  /** Quiet time after a change before the headless design is saved. */
  autosaveDelayMs?: number;
  /**
   * Whether the first start of the engine opens the last project. The app starts on the start
   * page with an empty design instead (B3, decided 2026-11-05); later starts of the engine (after
   * the SolidCraft window closed, after a crash) reopen the design open at that time.
   */
  openLastOnStart?: boolean;
  log(message: string): void;
}

/**
 * The folder in its long form, created when missing. SolidCraft refuses 8.3 short names such as
 * `ADMINI~1`, which `tmpdir()` returns for user names longer than eight characters.
 */
export function longPath(folder: string): string {
  mkdirSync(folder, { recursive: true });
  return realpathSync.native(folder);
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
  private readonly designs: ProjectStore | null;
  /** Set by switchProject(): the next launch closes the design and opens the project this returns. */
  private reopen: ((current: string | null) => Promise<string | null>) | null = null;
  /** The file the headless design was opened from, when it lies in the project folder. */
  private designFile: string | null = null;
  /** Whether the engine ran before in this session (see `openLastOnStart`). */
  private launchedBefore = false;
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
  /** The name the assistant's plan gave a new design (a body like "Base" names a case badly), until it has a project. */
  private plannedName: string | null = null;
  private readonly scheduler: MirrorScheduler;
  /**
   * How the mirror tells standard parts: the log, and each part as `solidcraft-cli` builds it. The
   * mirror does not wait for a part being built (its body counts as printed until the mirror that
   * follows); what leaves PartBuddy does (`settledChecks`): an export must not go out with a screw in it.
   */
  private readonly partChecks: PartChecks;
  private readonly settledChecks: PartChecks;
  private readonly references: PartReferences;
  private readonly dimensions: DimensionService;
  private readonly actions: ActionService;
  /** Probes run one after another; SolidCraft runs one batch at a time anyway. */
  private probing: Promise<unknown> = Promise.resolve();

  private readonly options: SupervisorOptions;

  constructor(
    options: SupervisorOptions,
    private readonly listeners: SupervisorListeners,
  ) {
    // Every path PartBuddy hands SolidCraft is made from the cache folder (exports, scripts, allow_paths).
    this.options = { ...options, cacheDir: longPath(options.cacheDir) };
    const { cacheDir } = this.options;
    const log = (message: string) => options.log(message);
    const references = options.partReferences?.(() => this.scheduler.refresh()) ?? cliReferences({ cli: () => this.cli(), dir: cacheDir, log, env: options.environment.env, built: () => this.scheduler.refresh() });
    this.references = references;
    this.partChecks = { log, references: references.known };
    this.settledChecks = { log, references: references.ready };
    this.dimensions = new DimensionService(() => this.requester(), cacheDir);
    this.actions = new ActionService(() => this.requester(), cacheDir);
    this.designs = options.designsDir && options.projectsDir ? new ProjectStore(options.projectsDir, options.designsDir, options.newPartName) : null;
    this.scheduler = new MirrorScheduler(
      () => {
        if (this.engine?.isOpen) return mirrorActiveDesign(this.engine.requester, cacheDir, this.partChecks);
        const client = this.client;
        if (!client?.isOpen) return Promise.reject(new Error('not connected'));
        return mirrorActiveDesign(client, cacheDir, this.partChecks);
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

  /** Names the open design after the assistant's plan, if it has no project yet. */
  nameNewDesign(name: string): void {
    if (!this.designFile) this.plannedName = name;
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
  async exportDesign(format: ExportFormat, destination: string): Promise<{ unverified: string[] }> {
    const requester = this.requester();
    const { bodies, unverified } = await this.printedBodies();
    if (bodies.length === 0) throw new Error('the design has no body to export');
    // The file keeps the name the user chose: STEP and 3MF carry it as the part's name.
    const folder = join(this.options.cacheDir, `export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(folder, { recursive: true });
    const temp = join(folder, `${safeDesignFileName(basename(destination).replace(/\.[^.]*$/, ''))}.${format}`);
    try {
      const batch = await requester.request<{ failed?: { error: string } }>(
        'engine.batch',
        { commands: [{ command: 'file.export', params: { path: temp, format, bodies } }], rollback: false, allow_paths: [this.options.cacheDir] },
        10 * 60 * 1000,
      );
      if (batch.failed) throw new Error(`export failed: ${batch.failed.error}`);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(temp, destination);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
    return { unverified };
  }

  /**
   * Inserts a STEP, IGES or mesh file into the open design (B4) as SolidCraft's import feature in
   * a component named after the file. SolidCraft reads only its allowed folders, so the file is
   * copied into the cache first; the design keeps the geometry, not the path, so the copy goes
   * again afterwards. Returns the bodies the file brought.
   */
  async insertFile(source: string, kind: Exclude<ImportKind, 'design' | 'package'>): Promise<string[]> {
    await this.probing;
    const folder = join(this.options.cacheDir, `import-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(folder, { recursive: true });
    const copy = join(folder, basename(source));
    try {
      await copyFile(source, copy);
      const batch = await this.requester().request<BatchResult>(
        'engine.batch',
        { commands: [insertCommand(kind, copy)], rollback: false, allow_paths: [this.options.cacheDir] },
        10 * 60 * 1000,
      );
      if (batch.failed) throw new Error(batch.failed.error);
      await this.engine?.changed();
      const created = (batch.results[0] as { created_bodies?: unknown } | undefined)?.created_bodies;
      return Array.isArray(created) ? created.filter((name): name is string => typeof name === 'string') : [];
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }

  /**
   * Makes a new design file from a STEP, IGES or mesh file (B4: import as a new project) with
   * `solidcraft-cli run`, without touching the open design; the project opens it afterwards.
   */
  async designFromFile(source: string, kind: Exclude<ImportKind, 'design' | 'package'>, target: string): Promise<void> {
    await this.designFromSteps([insertCommand(kind, source)], target);
  }

  /**
   * Makes a new design file from engine steps with `solidcraft-cli run` (B4 import, F3 templates); a
   * target that is no `.sc` is written as that format instead (the tolerance assistant's 3MF).
   */
  async designFromSteps(steps: { command: string; params: Record<string, unknown> }[], target: string): Promise<void> {
    const cli = this.cli();
    await mkdir(this.options.cacheDir, { recursive: true });
    await mkdir(dirname(target), { recursive: true });
    const script = join(this.options.cacheDir, `script-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.json`);
    await writeFile(script, JSON.stringify(steps));
    try {
      await this.runCli(cli, ['run', script, /\.sc$/i.test(target) ? '--save' : '--out', target, '--quiet']);
      if (!existsSync(target)) throw new Error('SolidCraft wrote no design');
    } finally {
      await rm(script, { force: true });
    }
  }

  /**
   * A picture of a saved design from one of SolidCraft's views (F5), rendered by `solidcraft-cli
   * snapshot` without a window, so the open design and the user's screen stay as they are.
   */
  async snapshot(design: string, view: 'iso' | 'front' | 'top' | 'right', target: string): Promise<void> {
    await mkdir(dirname(target), { recursive: true });
    await this.runCli(this.cli(), ['snapshot', '--in', design, '--out', target, '--view', view, '--width', '1600', '--height', '1200', '--no-grid', '--no-axes']);
    if (!existsSync(target)) throw new Error('SolidCraft wrote no picture');
  }

  /** The size of each printed body (F5), from `inspect.measure`; null where SolidCraft gave none. */
  async bodySizes(): Promise<{ name: string; size: [number, number, number] | null }[]> {
    const { bodies } = await this.printedBodies();
    if (bodies.length === 0) return [];
    const reply = await this.requester().request<BatchResult>('engine.batch', { commands: [{ command: 'inspect.measure', params: { bodies } }], rollback: false }, 60_000);
    const measured = reply.failed ? [] : ((reply.results[0] as { bodies?: unknown } | undefined)?.bodies ?? []);
    const list = Array.isArray(measured) ? (measured as { name?: unknown; bbox?: { min?: unknown; max?: unknown } }[]) : [];
    return bodies.map((name) => {
      const box = list.find((entry) => entry.name === name)?.bbox;
      const min = box?.min;
      const max = box?.max;
      const ok = (value: unknown): value is number[] => Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === 'number' && Number.isFinite(item));
      if (!ok(min) || !ok(max)) return { name, size: null };
      return { name, size: [0, 1, 2].map((i) => Math.round(((max[i] ?? 0) - (min[i] ?? 0)) * 100) / 100) as [number, number, number] };
    });
  }

  /**
   * The standard parts to buy, counted, for the sharing package: the parts the mirror keeps out of
   * print check and export, read anew by the same recognition, so nothing is listed both to print
   * and to buy and no bought part is missing.
   */
  async hardware(): Promise<{ count: number; name: string; standard: string }[]> {
    const { parts, listing } = await this.standardParts();
    return hardwareOf(parts, listing);
  }

  /**
   * The standard parts as the design stands now, every reference waited for, with the
   * `component.list` they were read from. It fails, naming the bodies, when one could not be
   * checked for now: an export must not go out with a screw in it without a word. Where no part can
   * be checked at all (`solidcraft-cli` is missing) nothing would ever go out, so those bodies count
   * as printed, are exported, and are named in `unverified` for a word to the user.
   */
  private async standardParts(): Promise<{ parts: BoughtPart[]; listing: unknown; unverified: string[] }> {
    const requester = this.requester();
    const reply = await requester.request<BatchResult>('engine.batch', { commands: [{ command: 'component.list', params: {} }], rollback: false }, 60_000);
    if (reply.failed) throw new Error(reply.failed.error);
    const told = await boughtParts(requester, reply.results[0], this.settledChecks);
    const open = [...told.unchecked, ...told.pending.map((body) => `"${body}": its part is still being built`)];
    if (open.length > 0) {
      this.options.log(`not exported: standard parts could not be told from printed bodies (${open.join('; ')})`);
      throw new Error(`nothing was written, because it is not known whether these are bought standard parts: ${open.slice(0, 3).join('; ').slice(0, 130)}`);
    }
    if (told.unverified.length > 0) this.options.log(`exported as printed bodies, not checked as standard parts: ${told.unverified.join(', ')}`);
    return { parts: told.bought, listing: reply.results[0], unverified: told.unverified };
  }

  /**
   * The mirrored bodies that are printed: all but the standard parts (B7), which are counterparts.
   * Read anew rather than from the last mirror, which may still wait for a part's reference.
   */
  private async printedBodies(): Promise<{ bodies: string[]; unverified: string[] }> {
    const { parts, unverified } = await this.standardParts();
    const standard = new Set(parts.map((part) => part.body));
    return { bodies: this.latest?.bodies.map((body) => body.name).filter((name) => !standard.has(name)) ?? [], unverified };
  }

  /** `solidcraft-cli` beside the SolidCraft PartBuddy uses. */
  private cli(): string {
    const executable = findExecutable(this.options.environment);
    if (!executable) throw new Error('SolidCraft is not installed');
    const cli = cliBeside(executable);
    if (!existsSync(cli)) throw new Error('SolidCraft is installed without solidcraft-cli');
    return cli;
  }

  private runCli(cli: string, args: string[]): Promise<void> {
    return new Promise<void>((done, fail) => {
      // Argument array, no shell (architecture: security boundaries).
      execFile(cli, args, { env: this.options.environment.env, windowsHide: true, timeout: 10 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 }, (error, _stdout, stderr) => {
        if (!error) done();
        else fail(new Error(stderr.trim().replace(/^error:\s*/i, '').slice(0, 500) || error.message));
      });
    });
  }

  /**
   * Saves the open design now instead of after the quiet time (B5: a version copies the file).
   * Returns the design file, or null while the design has no project yet.
   */
  async saveNow(): Promise<string | null> {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
      await this.autosave();
    }
    await this.autosaving;
    return this.designFile;
  }

  /**
   * Compares a saved version with the open design (B5). The version's bodies are written as STEP
   * by `solidcraft-cli` (a design cannot be linked into itself), inserted on trial and compared
   * body by body with `inspect.compare`; the trial leaves the design as it was. Bodies are paired
   * by name: SolidCraft names an inserted body that exists already `Name (2)`.
   */
  async compareWith(versionFile: string): Promise<{ pairs: { body: string; result: unknown }[]; onlyInVersion: string[]; onlyNow: string[] }> {
    const cli = this.cli();
    const folder = join(this.options.cacheDir, `compare-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
    await mkdir(folder, { recursive: true });
    try {
      const step = join(folder, 'version.step');
      await this.runCli(cli, ['run', '--in', versionFile, '--out', step, '--quiet']);
      const insert = { command: 'file.insert_step', params: { path: step, name: 'PartBuddy version', names: 'solid' } };
      const first = await this.trialInCache([insert]);
      const created = (first?.[0] as { created_bodies?: unknown } | undefined)?.created_bodies;
      const versionBodies = Array.isArray(created) ? created.filter((name): name is string => typeof name === 'string') : [];
      const current = this.latest?.structure.bodies.map((body) => body.name) ?? [];
      const pairs: { version: string; body: string }[] = [];
      const onlyInVersion: string[] = [];
      for (const name of versionBodies) {
        const base = name.replace(/ \(\d+\)$/, '');
        if (base !== name && current.includes(base)) pairs.push({ version: name, body: base });
        else onlyInVersion.push(name);
      }
      const paired = new Set(pairs.map((pair) => pair.body));
      const onlyNow = current.filter((name) => !paired.has(name));
      if (pairs.length === 0) return { pairs: [], onlyInVersion, onlyNow };
      const second = await this.trialInCache([insert, ...pairs.map((pair) => ({ command: 'inspect.compare', params: { a: pair.version, b: pair.body } }))]);
      if (!second) throw new Error('the versions could not be compared');
      return { pairs: pairs.map((pair, i) => ({ body: pair.body, result: second[i + 1] })), onlyInVersion, onlyNow };
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  }

  /** Like `trialSteps`, for steps that read files from the cache folder. */
  private trialInCache(steps: { command: string; params: Record<string, unknown> }[]): Promise<unknown[] | null> {
    return this.trial('cached steps', async () => {
      const reply = await this.requester().request<BatchResult & { failed?: { index: number; error: string } }>(
        'engine.batch',
        { commands: [...steps, { command: 'sketch.inspect', params: { sketch: 2147483647 } }], rollback: true, allow_paths: [this.options.cacheDir] },
        10 * 60 * 1000,
      );
      if (reply.failed && reply.failed.index < steps.length) throw new Error(reply.failed.error);
      return reply.failed?.index === steps.length ? reply.results.slice(0, steps.length) : null;
    });
  }

  /** The slicers SolidCraft found on this computer (B8), by id and name. */
  async slicers(): Promise<{ id: string; name: string }[]> {
    return (await this.foundSlicers()).map(({ id, name }) => ({ id, name }));
  }

  /**
   * Opens a 3MF file that is not the open design in a slicer SolidCraft found, by starting the
   * program SolidCraft names for it with the file; PartBuddy does not wait for it.
   */
  async openInSlicer(slicer: string, file: string): Promise<string> {
    const found = (await this.foundSlicers()).find((candidate) => candidate.id === slicer);
    if (!found?.program || !existsSync(found.program)) throw new Error('this slicer is not installed');
    // Argument array, no shell (architecture: security boundaries).
    spawn(found.program, [file], { detached: true, stdio: 'ignore' }).unref();
    return found.name;
  }

  private async foundSlicers(): Promise<{ id: string; name: string; program: string | null }[]> {
    const reply = await this.requester().request<BatchResult>('engine.batch', { commands: [{ command: 'file.slicers', params: {} }], rollback: false }, 30_000);
    if (reply.failed) throw new Error(reply.failed.error);
    const found = (reply.results[0] as { slicers?: unknown } | undefined)?.slicers;
    return (Array.isArray(found) ? (found as Record<string, unknown>[]) : [])
      .filter((slicer) => typeof slicer.id === 'string' && typeof slicer.name === 'string')
      .slice(0, 20)
      .map((slicer) => ({ id: (slicer.id as string).slice(0, 80), name: (slicer.name as string).slice(0, 120), program: typeof slicer.program === 'string' ? slicer.program : null }));
  }

  /**
   * Opens the printable bodies in a slicer SolidCraft found (B8, `file.send_to_slicer`): standard
   * parts stay out, each body lies on its print face. The slicer is started without waiting for it.
   */
  async sendToSlicer(slicer: string): Promise<{ name: string; unverified: string[] }> {
    const found = (await this.slicers()).find((candidate) => candidate.id === slicer);
    if (!found) throw new Error('this slicer is not installed');
    const { bodies, unverified } = await this.printedBodies();
    if (bodies.length === 0) throw new Error('the design has no body to print');
    const reply = await this.requester().request<BatchResult>(
      'engine.batch',
      { commands: [{ command: 'file.send_to_slicer', params: { slicer: found.id, bodies, wait: 'return' } }], rollback: false },
      2 * 60 * 1000,
    );
    if (reply.failed) throw new Error(reply.failed.error);
    return { name: found.name, unverified };
  }

  /**
   * The name of the face a body's print face lies on: SolidCraft keeps print faces but does not list them, so the face
   * is marked once more and the answer read. For print faces a script set (a template), which the plate view needs too.
   */
  async printFaceName(body: string, point: [number, number, number]): Promise<string | null> {
    await this.probing;
    // Right after a project switch the engine is still connecting: wait for it, five seconds at most.
    for (let tries = 0; tries < 20 && this.actor.getSnapshot().value !== 'connected'; tries += 1) await new Promise((resolve) => setTimeout(resolve, 250));
    const reply = await this.requester().request<BatchResult>('engine.batch', { commands: [{ command: 'body.print_face', params: { body, point } }], rollback: false }, 60_000);
    if (reply.failed) throw new Error(reply.failed.error);
    const face = (reply.results[0] as { face?: unknown } | undefined)?.face;
    return typeof face === 'string' ? face : null;
  }

  /** Marks or clears the body's print face (B8, `body.print_face`), which the slicer export uses. */
  setPrintFace(body: string, point: [number, number, number] | null): Promise<void> {
    return this.run({ command: 'body.print_face', params: { body, ...(point ? { point } : {}) } });
  }

  private library: PartsLibrary | null = null;

  /** SolidCraft's standard parts (B7), read once. */
  async partsLibrary(): Promise<PartsLibrary> {
    if (this.library) return this.library;
    const reply = await this.requester().request<BatchResult>('engine.batch', { commands: [{ command: 'parts.library', params: {} }], rollback: false }, 30_000);
    if (reply.failed) throw new Error(reply.failed.error);
    this.library = libraryOf(reply.results[0]);
    return this.library;
  }

  /**
   * Seats a standard part in the hole at a point of its wall (B7, `parts.insert` with a rigid
   * joint). Its body gets the part's name (`SHCS M3x12`); that it is a standard part the mirror tells
   * from the component SolidCraft made, as for a part the assistant put in. Returns the body name.
   */
  async insertPart(part: PartInsert): Promise<string | null> {
    await this.probing;
    const requester = this.requester();
    const before = new Set(this.latest?.structure.bodies.map((body) => body.name) ?? []);
    const params = { family: part.family, size: part.size, ...(part.length ? { length: part.length } : {}), at: part.point };
    const reply = await requester.request<BatchResult>(
      'engine.batch',
      { commands: [{ command: 'parts.insert', params }, { command: 'document.inspect', params: {} }], rollback: false },
      10 * 60 * 1000,
    );
    if (reply.failed) throw new Error(reply.failed.error);
    const inserted = reply.results[0] as { name?: unknown } | undefined;
    const inspect = reply.results[1] as { bodies?: { name?: unknown }[] } | undefined;
    const names = (inspect?.bodies ?? []).map((body) => body.name).filter((name): name is string => typeof name === 'string');
    const added = names.filter((name) => !before.has(name));
    let body: string | null = added[0] ?? null;
    if (body && added.length === 1 && typeof inserted?.name === 'string') {
      const wanted = freeBodyName(inserted.name, names);
      const naming = await requester.request<BatchResult>('engine.batch', { commands: [{ command: 'body.rename', params: { body, name: wanted } }], rollback: false }, 60_000);
      if (naming.failed) this.options.log(`the standard part was not named: ${naming.failed.error}`);
      else body = wanted;
    }
    await this.engine?.changed();
    return body;
  }

  /** Turns a mesh body into faces (`mesh.convert`), one undoable feature (B4). */
  convertMesh(body: string): Promise<void> {
    return this.run({ command: 'mesh.convert', params: { body } });
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
        await this.engine?.unchanged().catch(() => undefined);
      }
    });
    this.probing = run.catch(() => undefined);
    return run;
  }

  /** Sets the parameter the probe found (the user pressed Enter); the change is mirrored as usual. */
  async applyDimension(parameter: string, value: number, factor: 1 | 2, keepFitMark = false): Promise<void> {
    await this.probing;
    await this.dimensions.apply(parameter, value, factor, keepFitMark);
    await this.engine?.changed();
  }

  /** The user parameters of the design for the parameter panel; reading changes nothing. */
  async parameters(): Promise<DesignParameter[]> {
    await this.probing;
    return this.dimensions.userParameters();
  }

  /** One trial at a time, like the dimension probes; the headless engine records the moved revision quietly. */
  private trial<T>(what: string, work: () => Promise<T>): Promise<T> {
    const run = this.probing.then(async () => {
      // Everything after a trial waits for it: one that hangs is worth a line in the log.
      const started = performance.now();
      const slow = setTimeout(() => {
        this.options.log(`a trial (${what}) is still running after 20 s`);
      }, 20_000);
      try {
        return await work();
      } finally {
        await this.engine?.unchanged().catch(() => undefined);
        clearTimeout(slow);
        const took = performance.now() - started;
        if (took > 20_000) this.options.log(`a trial (${what}) took ${String(Math.round(took / 1000))} s`);
      }
    });
    this.probing = run.catch(() => undefined);
    return run;
  }

  previewAction(action: DesignAction): Promise<ActionPreview> {
    return this.trial('action preview', () => this.actions.preview(action));
  }

  async applyAction(action: DesignAction): Promise<void> {
    await this.probing;
    await this.actions.apply(action);
    await this.engine?.changed();
  }

  /**
   * How a bold text is set in a family (decided 2026-11-09): SolidCraft takes some families with
   * `bold` (Bahnschrift, a variable font, whose "Bahnschrift Bold" it does not know) and others only
   * by their bold face's full name (Segoe Print). Tried once per family, the answer kept.
   */
  private boldFonts = new Map<string, { font: string; bold: boolean }>();

  private async boldFont(font: string | undefined, bold: boolean | undefined, boldFace: string | undefined): Promise<{ font?: string; bold?: boolean }> {
    if (!font || !bold || !boldFace) return { ...(font !== undefined ? { font } : {}), ...(bold !== undefined ? { bold } : {}) };
    const known = this.boldFonts.get(font);
    if (known) return known;
    const tried = await this.trialSteps([
      { command: 'sketch.create', params: { plane: { origin: [0, 0, 0], x_dir: [1, 0, 0], y_dir: [0, 1, 0] }, project_edges: false } },
      { command: 'sketch.text', params: { text: 'A', at: [0, 0], height: 5, font, bold: true } },
    ]);
    const chosen = tried ? { font, bold: true } : { font: boldFace, bold: false };
    this.options.log(`bold text in ${font}: ${tried ? 'the family with bold' : `its face "${boldFace}"`}`);
    this.boldFonts.set(font, chosen);
    return chosen;
  }

  /** A text block with its bold font settled; other blocks as they are. */
  private async boldBlock(block: FeatureBlock): Promise<FeatureBlock> {
    if (block.block !== 'text') return block;
    const { boldFace, ...rest } = block;
    return { ...rest, ...(await this.boldFont(block.font, block.bold, boldFace)) };
  }

  /** A text change with its bold font settled. */
  private async boldMove(move: LogoMoveRequest): Promise<LogoMoveRequest> {
    if (!move.text) return move;
    const { boldFace, ...text } = move.text;
    return { ...move, text: { ...text, ...(await this.boldFont(text.font, text.bold, boldFace)) } };
  }

  /** A function block (F1) on trial for the ghost, like an action. */
  async previewBlock(given: FeatureBlock): Promise<ActionPreview> {
    const block = await this.boldBlock(given);
    return this.trial('block preview', async () => {
      const placed = await this.centredBlock(block);
      const preview = await this.actions.previewSteps(await this.actions.inComponentOf(placed.body, stepsOf(placed)), blockBodies(placed));
      // The panel shows a short reason; the log keeps SolidCraft's own words.
      if (!preview.ok) this.options.log(`${block.block} preview refused: ${preview.error}`);
      return preview;
    });
  }

  /** A logo "on the face's middle": its point moved there before it is built, so the ghost shows it there too. */
  private async centredBlock(block: FeatureBlock): Promise<FeatureBlock> {
    if (block.block !== 'logo' || !block.centre) return block;
    const plane = planeAt(block.point, block.normal);
    const [faces, edges] = await this.actions.run([
      { command: 'model.faces', params: { body: block.body } },
      { command: 'model.edges', params: { body: block.body } },
    ]);
    const host = hostFace(plane, [{ body: block.body, faces, edges }]);
    if (!host) throw new Error('no flat face at the point to centre the logo on');
    const [du, dv] = centring(host.extent, 'both');
    return { ...block, point: movedPlane(plane, du, dv).origin };
  }

  async applyBlock(given: FeatureBlock): Promise<void> {
    let block = await this.boldBlock(given);
    await this.probing;
    // A logo's sketches get a name no other logo has, so it can be moved on its own later.
    const sketch =
      block.block === 'logo' ? uniqueLogoName(block.name, await this.actions.sketchNames()) : block.block === 'text' ? uniqueLogoName(block.text, await this.actions.sketchNames(), TEXT_PREFIX) : undefined;
    block = await this.centredBlock(block);
    await this.actions.applySteps(await this.actions.inComponentOf(block.body, stepsOf(block, sketch)));
    // A logo in colours: pieces a cut split off get their colour too.
    const layers = block.block === 'logo' ? colourLayers(block) : [];
    if (layers.length > 0) {
      const coloured = await this.actions.colourSplitPieces(layers);
      if (coloured > 0) this.options.log(`coloured the pieces of ${String(coloured)} split logo bodies`);
    }
    await this.engine?.changed();
  }

  /** The placed logo at a picked point, for the logo controls of the selection dock; reading changes nothing. */
  private logoReads = 0;

  logoAt(point: [number, number, number]): Promise<LogoSpot | null> {
    // In line with the trials: a read between a trial's steps and its undo would see the trial.
    // Only the newest pick is read; picks clicked meanwhile are already gone from the dock.
    const id = ++this.logoReads;
    const read = this.probing.then(async () => {
      if (id !== this.logoReads) return null;
      const started = performance.now();
      let calls = 0;
      const spot = await logoAt((commands) => {
        calls += commands.length;
        return this.actions.run(commands);
      }, point).catch((error: unknown) => {
        this.options.log(`logo read failed after ${String(Math.round(performance.now() - started))} ms: ${(error as Error).message}`);
        throw error;
      });
      this.options.log(`logo read: ${spot ? spot.logo : 'none'}, ${String(calls)} engine commands in ${String(Math.round(performance.now() - started))} ms`);
      return spot && { logo: spot.logo, offset: spot.offset, origin: spot.plane.origin, xDir: spot.plane.x_dir, yDir: spot.plane.y_dir, box: spot.box, depth: spot.depth, angle: spot.angle, outline: spot.outline, text: spot.text };
    });
    this.probing = read.catch(() => undefined);
    return read;
  }

  /** A logo moved on trial: its sketches redefined, the part and its colour bodies exported for the ghost. */
  async previewLogoMove(given: LogoMoveRequest): Promise<ActionPreview> {
    const move = await this.boldMove(given);
    return this.trial('logo preview', async () => {
      const planned = await planLogoMove((commands) => this.actions.run(commands), move.logo, move);
      return this.actions.previewSteps(planned.steps, planned.bodies);
    });
  }

  async moveLogo(given: LogoMoveRequest): Promise<void> {
    const move = await this.boldMove(given);
    await this.probing;
    const planned = await planLogoMove((commands) => this.actions.run(commands), move.logo, move);
    // Already where it should be (centred twice): nothing to do.
    if (planned.steps.length === 0) return;
    await this.actions.applySteps(planned.steps);
    await this.engine?.changed();
  }

  measure(items: MeasureItem[]): Promise<MeasureResult> {
    return this.trial('measure', () => this.actions.measure(items));
  }

  /** Drives one value of a joint (ADR 0027); SolidCraft clamps it to the limits and the mirror shows where the parts stand. */
  async driveJoint(joint: number, index: number, value: number): Promise<void> {
    // In line with the trials, not only after the one running: a sweep that tries a snap fit poses the joint at its
    // limit and puts it back where it stood, and a drive between its steps would be taken back with it.
    const run = this.probing.then(() => this.actions.applySteps([{ command: 'joint.drive', params: { joint, index, value, quiet: true } }]));
    this.probing = run.then(
      () => undefined,
      () => undefined,
    );
    await run;
    await this.engine?.changed();
  }

  /** Where parts stop each joint value on its way to a limit (ADR 0027, `joint.sweep`); the design stays as it is. */
  sweepJoints(sweeps: JointSweep[]): Promise<JointSweepResult> {
    return this.trial('joint sweep', () => this.actions.sweepJoints(sweeps));
  }

  /** Overlaps and gaps narrower than `gap` between the bodies (F2, `inspect.clearance`). */
  clearance(bodies: string[], gap: number): Promise<ClearanceResult> {
    return this.trial('clearance', () => this.actions.clearance(bodies, gap));
  }

  /**
   * Runs engine steps on trial (ADR 0017): a failing last step makes SolidCraft undo the whole
   * batch, undo history included, and still return the results before it. Null when one of the
   * given steps failed.
   */
  trialSteps(steps: { command: string; params: Record<string, unknown> }[]): Promise<unknown[] | null> {
    return this.trial('steps', async () => {
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
    return this.trial('parameter probe', () => this.dimensions.previewParameter(parameter, value, body));
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
    const file = this.designFile ?? this.designs?.newDesignFile(this.latest?.designName ?? '') ?? join(projects, 'Untitled.sc');
    await engine.save(file);
    this.designFile = file;
    this.designs?.remember(file);
    this.currentFile = file;
    this.handoffFile = file;
    this.actor.send({ type: 'HANDOFF' });
    return file;
  }

  /**
   * Opens another project (B2): saves the open design, closes it, lets `prepare` work on the files
   * while nothing holds them (rename, copy, trash) and opens the project it returns, or a new empty
   * design for null. Only while PartBuddy runs SolidCraft without a window. When `prepare` fails,
   * the previous project opens again.
   */
  async switchProject(prepare: (current: string | null) => Promise<string | null>): Promise<void> {
    if (this.actor.getSnapshot().value !== 'connected' || !this.engine?.isOpen || !this.designs) {
      throw new Error('projects can be switched only while PartBuddy runs SolidCraft without a window');
    }
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
      await this.autosave();
    }
    await this.autosaving;
    this.reopen = prepare;
    this.actor.send({ type: 'REOPEN' });
  }

  /** The design file of the open project, once it has one. */
  projectFile(): string | null {
    return this.designFile;
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

  /** Renames a body (the user's structure tree). */
  renameBody(body: string, name: string): Promise<void> {
    return this.run({ command: 'body.rename', params: { body, name } });
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
    const inspect = batch.results[1] as { undo?: unknown; redo?: unknown; marker?: unknown } | undefined;
    if (typeof head?.document_id !== 'string' || typeof head.revision !== 'number') throw new Error('document.revision returned no revision');
    return { documentId: head.document_id, revision: head.revision, undo: count(inspect?.undo), redo: count(inspect?.redo), ...(Number.isInteger(inspect?.marker) ? { marker: inspect?.marker as number } : {}) };
  }

  /** Undo or Redo `count` times in one request ("go back to this state", M2a). */
  async travel(command: 'edit.undo' | 'edit.redo', count: number): Promise<void> {
    if (!Number.isInteger(count) || count < 1) return;
    await this.probing;
    const commands = Array.from({ length: count }, () => ({ command, params: {} }));
    const batch = await this.requester().request<{ failed?: { error: string } }>('engine.batch', { commands, rollback: false }, 10 * 60 * 1000);
    if (batch.failed) throw new Error(`${command} failed: ${batch.failed.error}`);
    await this.engine?.changed();
  }

  /** One engine command of the user, after any running trial; the change is mirrored as usual. */
  private async run(step: { command: string; params: Record<string, unknown> }): Promise<void> {
    await this.probing;
    const batch = await this.requester().request<{ failed?: { error: string } }>('engine.batch', { commands: [step], rollback: false }, 10 * 60 * 1000);
    if (batch.failed) throw new Error(`${step.command} failed: ${batch.failed.error}`);
    // The window reports the change with design.changed; the headless engine is asked.
    await this.engine?.changed();
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
    const cli = cliBeside(executable);
    if (!existsSync(cli)) throw new Error('SolidCraft is installed without solidcraft-cli');
    const allowPaths = [this.options.cacheDir, ...(this.options.projectsDir ? [this.options.projectsDir] : [])];
    // Notes from before projects (B2) may name a design in PartBuddy's own folder.
    if (this.options.designsDir) allowPaths.push(this.options.designsDir);
    // The first start opens no project when the app starts on the start page; the note of the last
    // project is cleared, so a restart of the engine before the user chose one stays empty as well.
    if (!this.launchedBefore && this.options.openLastOnStart === false) this.designs?.forget();
    this.launchedBefore = true;
    const design = this.designs?.last();
    const start = (file: string | undefined) => HeadlessEngine.start({ cli, allowPaths, design: file, env: this.options.environment.env, log: (message) => this.options.log(message) });
    let engine: HeadlessEngine;
    try {
      engine = await start(design);
      // A design outside the projects (an earlier one in PartBuddy's folder) becomes a project on its first save.
      this.designFile = design && this.designs?.holds(design) ? design : null;
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

  /** Saves the headless design into its project and notes it for the next start; an empty new design waits. */
  private autosave(): Promise<void> {
    const engine = this.engine;
    const designs = this.designs;
    if (!engine?.isOpen || !designs) return this.autosaving;
    // A project's design goes back to its own file; a new one gets a project once it has content.
    const latest = this.latest;
    const named = this.savedAs && this.savedAs.documentId === latest?.documentId ? this.savedAs.file : null;
    const hasContent = (latest?.bodies.length ?? 0) > 0 || (latest?.sketches.length ?? 0) > 0;
    const file = designs.autosaveTarget(this.designFile ?? named, latest?.designName ?? '', latest?.bodies.map((body) => body.name) ?? [], hasContent, this.plannedName);
    if (!file) return this.autosaving;
    // The project is chosen once: saves that follow quickly must not each make a new one.
    if (!this.designFile && designs.holds(file)) {
      this.designFile = file;
      this.plannedName = null;
    }
    // A new design saved under a name of its own: SolidCraft now calls it by the file name.
    const renamed = latest !== null && basename(file, '.sc') !== safeDesignFileName(latest.designName);
    if (renamed) this.savedAs = { documentId: latest.documentId, file };
    this.setSaveState('saving');
    this.autosaving = this.autosaving
      .then(async () => {
        // SolidCraft names a design after the file only when it saves to another path, so a design
        // whose file was renamed, copied or imported (B2) is saved once under its new name in the
        // cache first; it has no command to rename a design.
        if (renamed && resolve(file) === resolve(this.currentFile ?? '')) {
          const scratch = join(this.options.cacheDir, 'rename', basename(file));
          await engine.save(scratch);
          await rm(scratch, { force: true });
        }
        await engine.save(file);
      })
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

  /** One command in the headless engine; false (and logged) when SolidCraft refuses it or does not answer. */
  private async inEngine(engine: HeadlessEngine, step: { command: string; params: Record<string, unknown> }): Promise<boolean> {
    try {
      const batch = await engine.requester.request<BatchResult>('engine.batch', { commands: [step], rollback: false }, 60_000);
      if (!batch.failed) return true;
      this.options.log(`${step.command} failed in the running SolidCraft: ${batch.failed.error}; starting it again`);
    } catch (error) {
      this.options.log(`${step.command} failed in the running SolidCraft: ${(error as Error).message}; starting it again`);
    }
    return false;
  }

  private async launch(): Promise<Launched> {
    const executable = findExecutable(this.options.environment);
    if (!executable) throw new Error('SolidCraft is not installed');
    const reopen = this.reopen;
    this.reopen = null;
    if (reopen) {
      // The design is saved. The running engine takes an empty design, so nothing holds the files
      // while they change, and opens the next project itself: no new process (audit P-02, P-07).
      // Only when that fails does the engine end and start again with the next project.
      const engine = this.engine;
      this.scheduler.reset();
      this.references.forget();
      this.latest = null;
      this.savedAs = null;
      this.plannedName = null;
      const kept = engine?.isOpen === true && (await this.inEngine(engine, { command: 'file.new', params: {} }));
      if (!kept) {
        this.engine = null;
        await engine?.close();
      }
      const previous = this.designFile;
      let next: string | null;
      try {
        next = await reopen(previous);
      } catch (error) {
        this.options.log(`the project could not be switched: ${(error as Error).message}`);
        next = previous;
      }
      if (next) this.designs?.remember(next);
      else this.designs?.forget();
      this.designFile = null;
      this.currentFile = null;
      if (kept && (next === null || (await this.inEngine(engine, { command: 'doc.open', params: { path: next } })))) {
        this.designFile = next && this.designs?.holds(next) ? next : null;
        this.currentFile = next;
        this.options.log(`switched the project in the running SolidCraft${next ? '' : ' to a new design'}`);
        return { launchedAt: Date.now(), headless: true };
      }
      if (kept) {
        this.engine = null;
        await engine.close();
      }
      return this.launchHeadless(executable);
    }
    const handoff = this.handoffFile;
    this.handoffFile = null;
    if (handoff) {
      // The design is saved; the engine ends before the window opens the same file.
      const engine = this.engine;
      this.engine = null;
      this.scheduler.reset();
      this.references.forget();
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
        this.references.forget();
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
      this.references.forget();
      sendBack({ type: 'LOST', reason });
    });
    return () => {
      offEvent();
      offClose();
    };
  }
}
