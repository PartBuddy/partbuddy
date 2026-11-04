import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { MirrorScheduler } from '../src/main/solidcraft/mirror';
import { SolidCraftSupervisor } from '../src/main/solidcraft/supervisor';
import type { ConnectionStatus, MirrorRevision } from '../src/shared/contract';
import { FakeSolidCraft } from './fakeSolidCraft';

const cleanups: (() => Promise<void> | void)[] = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

function setup(options: { installed?: boolean; autoStart?: boolean } = {}) {
  const controlDir = mkdtempSync(join(tmpdir(), 'partbuddy-control-'));
  const cacheDir = mkdtempSync(join(tmpdir(), 'partbuddy-cache-'));
  cleanups.push(() => {
    rmSync(controlDir, { recursive: true, force: true });
    rmSync(cacheDir, { recursive: true, force: true });
  });
  const statuses: ConnectionStatus[] = [];
  const revisions: MirrorRevision[] = [];
  const supervisor = new SolidCraftSupervisor(
    {
      environment: {
        platform: process.platform,
        env: {
          SOLIDCRAFT_CONTROL_DIR: controlDir,
          // An executable that exists, or one that does not.
          PARTBUDDY_SOLIDCRAFT_EXE: options.installed === false ? join(controlDir, 'missing.exe') : process.execPath,
        },
        home: controlDir,
        isAlive: (pid) => pid === process.pid,
      },
      launchPort: 65000,
      autoStart: options.autoStart ?? false,
      cacheDir,
      log: () => undefined,
    },
    {
      status: (status) => statuses.push(status),
      revision: (revision) => revisions.push(revision),
    },
  );
  cleanups.push(() => supervisor.shutdown());
  return { supervisor, statuses, revisions, controlDir, cacheDir };
}

async function startFake(controlDir: string, batchDelayMs = 0) {
  const fake = new FakeSolidCraft({ controlDir, batchDelayMs });
  await fake.start();
  cleanups.push(() => fake.stop());
  return fake;
}

describe('SolidCraft supervisor', () => {
  it('connects to a running SolidCraft and mirrors the design', async () => {
    const { supervisor, statuses, revisions, controlDir, cacheDir } = setup();
    const fake = await startFake(controlDir);
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    const [revision] = revisions;
    expect(revision).toMatchObject({ documentId: fake.documentId, revision: 1, designName: 'Cable clip' });
    expect(revision?.bodies[0]?.name).toBe('CableClip');
    expect(revision?.bodies[0]?.faces.faces.length).toBeGreaterThan(10);
    expect(revision?.bodies[0]?.mesh.byteLength).toBeGreaterThan(1000);
    expect(statuses.at(-1)).toMatchObject({ state: 'connected', mirror: 'idle', owned: false, port: fake.port });
    // Exports are removed from the cache after reading.
    expect(readdirSync(cacheDir)).toEqual([]);
  });

  it('mirrors again on design.changed and coalesces bursts', async () => {
    const { supervisor, revisions, controlDir } = setup();
    const fake = await startFake(controlDir, 150);
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    for (let i = 0; i < 5; i += 1) fake.change();
    await vi.waitFor(() => expect(revisions.at(-1)?.revision).toBe(6), { timeout: 5000 });
    // One mirror for the first change, at most one more for the rest of the burst.
    expect(revisions.length).toBeLessThanOrEqual(3);
    expect(supervisor.status()).toMatchObject({ state: 'connected', revision: 6 });
  });

  it('reports a lost connection and reconnects when SolidCraft returns', async () => {
    const { supervisor, statuses, revisions, controlDir } = setup();
    const fake = await startFake(controlDir);
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    await fake.stop();
    await vi.waitFor(() => expect(statuses.some((s) => s.state === 'lost')).toBe(true), { timeout: 5000 });
    await startFake(controlDir);
    await vi.waitFor(() => expect(supervisor.status().state).toBe('connected'), { timeout: 15000 });
  }, 20000);

  it('says when SolidCraft is not running, and finds it once it starts', async () => {
    const { supervisor, controlDir } = setup();
    supervisor.start();
    await vi.waitFor(() => expect(supervisor.status().state).toBe('notRunning'), { timeout: 5000 });
    await startFake(controlDir);
    supervisor.retry();
    await vi.waitFor(() => expect(supervisor.status().state).toBe('connected'), { timeout: 5000 });
  });

  it('says when SolidCraft is not installed', async () => {
    const { supervisor } = setup({ installed: false });
    supervisor.start();
    await vi.waitFor(() => expect(supervisor.status().state).toBe('notInstalled'), { timeout: 5000 });
  });

  it('does not ask a SolidCraft it did not start to quit', async () => {
    const { supervisor, revisions, controlDir } = setup();
    const fake = await startFake(controlDir);
    supervisor.start();
    await vi.waitFor(() => expect(revisions).toHaveLength(1), { timeout: 5000 });
    await supervisor.shutdown();
    expect(fake.quitRequested).toBe(false);
  });
});

describe('mirror scheduler', () => {
  it('runs one mirror at a time and keeps only the newest request', async () => {
    let calls = 0;
    let release: (() => void) | null = null;
    const delivered: number[] = [];
    const scheduler = new MirrorScheduler(
      async () => {
        calls += 1;
        const revision = calls === 1 ? 1 : 4;
        await new Promise<void>((done) => {
          release = done;
        });
        return { documentId: 'd', revision, designName: '', bodies: [], mirrorMs: 1 };
      },
      { started: () => undefined, delivered: (r) => delivered.push(r.revision), failed: () => undefined, idle: () => undefined },
    );
    scheduler.request({ documentId: 'd', revision: 1 });
    scheduler.request({ documentId: 'd', revision: 2 });
    scheduler.request({ documentId: 'd', revision: 3 });
    scheduler.request({ documentId: 'd', revision: 4 });
    await vi.waitFor(() => expect(release).not.toBeNull());
    (release as unknown as () => void)();
    await vi.waitFor(() => expect(calls).toBe(2));
    (release as unknown as () => void)();
    await vi.waitFor(() => expect(delivered).toEqual([1, 4]));
  });
});
