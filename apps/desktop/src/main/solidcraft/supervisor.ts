import { spawn, type ChildProcess } from 'node:child_process';

import { createActor, fromCallback, fromPromise } from 'xstate';

import type { ConnectionStatus, MirrorRevision } from '../../shared/contract';
import { ControlClient, ControlError } from './controlClient';
import { endpointForPort, findExecutable, findRunning, type ControlEndpoint, type Environment } from './discovery';
import { supervisorMachine, type DiscoveryResult, type SupervisorActor, type SupervisorEvent } from './machine';
import { mirrorActiveDesign, MirrorScheduler } from './mirror';

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
  log(message: string): void;
}

export interface SupervisorListeners {
  status(status: ConnectionStatus): void;
  revision(revision: MirrorRevision): void;
}

type Mirror = ConnectionStatus['mirror'];

/**
 * SolidCraft supervisor (architecture: main process, own glue). Finds or starts SolidCraft,
 * holds one authenticated control connection with `control.subscribe`, and mirrors every new
 * revision to the renderer. It never models geometry itself.
 */
export class SolidCraftSupervisor {
  private readonly actor: SupervisorActor;
  private client: ControlClient | null = null;
  private child: ChildProcess | null = null;
  private mirrorState: Mirror = 'idle';
  private mirrorDetail: string | null = null;
  private latest: MirrorRevision | null = null;
  private readonly scheduler: MirrorScheduler;

  constructor(
    private readonly options: SupervisorOptions,
    private readonly listeners: SupervisorListeners,
  ) {
    this.scheduler = new MirrorScheduler(
      () => {
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

  currentRevision(): MirrorRevision | null {
    return this.latest;
  }

  status(): ConnectionStatus {
    const snapshot = this.actor.getSnapshot();
    const { context } = snapshot;
    // Nested states (starting.launching, starting.waiting) report as their parent.
    const state = typeof snapshot.value === 'string' ? snapshot.value : 'starting';
    const status: ConnectionStatus = { state, owned: context.owned, mirror: this.mirrorState };
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
    this.actor.stop();
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

  private publish(): void {
    this.listeners.status(this.status());
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

  private launch(): Promise<{ launchedAt: number }> {
    const executable = findExecutable(this.options.environment);
    if (!executable) return Promise.reject(new Error('SolidCraft is not installed'));
    const launchedAt = Date.now();
    return new Promise((resolve, reject) => {
      // Argument array, no shell (architecture: security boundaries).
      const child = spawn(executable, ['--control', String(this.options.launchPort)], {
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
        resolve({ launchedAt });
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

  private async connect(endpoint: ControlEndpoint): Promise<{ documentId: string; revision: number }> {
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
