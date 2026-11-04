import { randomBytes } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { join, relative, resolve } from 'node:path';

/**
 * Test double for SolidCraft's control channel (SolidCraft 0.30.1 docs/control-protocol.md). It
 * speaks the line protocol with token, `control.subscribe`, `design.changed`, `document.inspect`
 * and an `engine.batch` that exports the synthetic fixture (packages/geometry/fixtures). CI has
 * no SolidCraft; the local contract test runs the same checks against the real app.
 */

const fixtureDir = resolve(__dirname, '../../../packages/geometry/fixtures');

interface FixtureFace {
  index: number;
  name: string;
  exact: boolean;
  area: number;
  centroid: number[];
  point: number[];
  planeNormal?: number[];
  cylinder?: { origin: number[]; axis: number[]; radius: number };
}

/** The fixture's face table in the snake_case shape `model.faces` returns. */
function modelFaces(): { body: string; faces: Record<string, unknown>[] } {
  const table = JSON.parse(readFileSync(join(fixtureDir, 'cable-clip.faces.json'), 'utf8')) as {
    body: string;
    faces: FixtureFace[];
  };
  return {
    body: table.body,
    faces: table.faces.map((face) => ({
      index: face.index,
      name: face.name,
      exact: face.exact,
      area: face.area,
      centroid: face.centroid,
      point: face.point,
      plane_normal: face.planeNormal ?? null,
      cylinder: face.cylinder ?? null,
    })),
  };
}

export interface FakeOptions {
  controlDir: string;
  /** Write the discovery files (`current.port`, token, pid). Default true. */
  writeDiscovery?: boolean;
  /** Delay of every `engine.batch`, to observe the rebuilding state. */
  batchDelayMs?: number;
}

export class FakeSolidCraft {
  readonly token = randomBytes(32).toString('hex');
  readonly documentId = `fake-${randomBytes(4).toString('hex')}-1`;
  readonly methods: string[] = [];
  revision = 1;
  bodies = ['CableClip'];
  quitRequested = false;
  private server: Server | null = null;
  private readonly sockets = new Set<Socket>();
  private readonly subscribers = new Set<Socket>();
  port = 0;

  constructor(private readonly options: FakeOptions) {}

  async start(): Promise<void> {
    const server = createServer((socket) => {
      this.serve(socket);
    });
    this.server = server;
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    this.port = (server.address() as AddressInfo).port;
    if (this.options.writeDiscovery !== false) this.writeDiscovery();
  }

  writeDiscovery(): void {
    mkdirSync(this.options.controlDir, { recursive: true });
    writeFileSync(join(this.options.controlDir, `${this.port}.token`), `${this.token}\n`);
    writeFileSync(join(this.options.controlDir, `${this.port}.pid`), `${process.pid}\n`);
    writeFileSync(join(this.options.controlDir, 'current.port'), `${this.port}\n`);
  }

  /** Simulates a design change: a new revision and a `design.changed` line to subscribers. */
  change(): void {
    this.revision += 1;
    const line = `${JSON.stringify({ event: 'design.changed', params: { document_id: this.documentId, revision: this.revision } })}\n`;
    for (const socket of this.subscribers) socket.write(line);
  }

  async stop(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    await new Promise<void>((done) => {
      if (this.server) this.server.close(() => done());
      else done();
    });
    this.server = null;
    for (const name of [`${this.port}.token`, `${this.port}.pid`, 'current.port']) {
      rmSync(join(this.options.controlDir, name), { force: true });
    }
  }

  private serve(socket: Socket): void {
    this.sockets.add(socket);
    socket.setEncoding('utf8');
    let authenticated = false;
    let buffer = '';
    socket.on('close', () => {
      this.sockets.delete(socket);
      this.subscribers.delete(socket);
    });
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      let newline = buffer.indexOf('\n');
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf('\n');
        const request = JSON.parse(line) as { id: number; method: string; params?: Record<string, unknown>; token?: string };
        if (!authenticated) {
          if (request.token !== this.token) {
            socket.end(`${JSON.stringify({ ok: false, error: 'unauthorized: wrong token' })}\n`);
            return;
          }
          authenticated = true;
        }
        this.methods.push(request.method);
        void this.answer(socket, request.method, request.params ?? {}).then(
          (result) => socket.write(`${JSON.stringify({ id: request.id, ok: true, result })}\n`),
          (error: unknown) =>
            socket.write(`${JSON.stringify({ id: request.id, ok: false, error: (error as Error).message })}\n`),
        );
      }
    });
  }

  private async answer(socket: Socket, method: string, params: Record<string, unknown>): Promise<unknown> {
    const revision = { document_id: this.documentId, revision: this.revision };
    switch (method) {
      case 'control.subscribe':
        if (this.subscribers.has(socket)) throw new Error('already subscribed');
        this.subscribers.add(socket);
        return revision;
      case 'document.revision':
        return revision;
      case 'document.inspect':
        return { name: 'Cable clip', bodies: this.bodies.map((name) => ({ name, visible: true })), revision: 99 };
      case 'engine.batch': {
        if (this.options.batchDelayMs) await new Promise((done) => setTimeout(done, this.options.batchDelayMs));
        const allowed = (params.allow_paths as string[] | undefined) ?? [];
        const commands = params.commands as { command: string; params: Record<string, unknown> }[];
        const results = commands.map((step) => this.execute(step.command, step.params, allowed));
        return { completed: results.length, results, undone: 0 };
      }
      case 'app.quit':
        this.quitRequested = true;
        return 'quitting';
      default:
        throw new Error(`unknown method \`${method}\``);
    }
  }

  private execute(command: string, params: Record<string, unknown>, allowed: string[]): unknown {
    switch (command) {
      case 'document.revision':
        return { document_id: this.documentId, revision: this.revision };
      case 'model.faces':
        return modelFaces();
      case 'file.export': {
        const path = resolve(String(params.path));
        const inside = allowed.some((dir) => !relative(resolve(dir), path).startsWith('..'));
        if (allowed.length > 0 && !inside) throw new Error(`${path}: outside the folders this agent may use`);
        if (params.format !== '3mf-tagged') throw new Error('fake supports 3mf-tagged only');
        copyFileSync(join(fixtureDir, 'cable-clip.3mf'), path);
        return { path };
      }
      default:
        throw new Error(`unknown command ${command}`);
    }
  }
}
