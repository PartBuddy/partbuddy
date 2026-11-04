import { describe, expect, it } from 'vitest';
import { createActor, fromCallback, fromPromise, type SnapshotFrom } from 'xstate';

import type { ControlEndpoint } from '../src/main/solidcraft/discovery';
import { supervisorMachine, type DiscoveryResult, type Launched, type SupervisorEvent } from '../src/main/solidcraft/machine';

const windowEndpoint: ControlEndpoint = { port: 7878, token: 't', pid: 1, writtenAt: 0 };

/**
 * "Open in SolidCraft" (ADR 0016): the headless design goes to the SolidCraft window, which the
 * user owns, and PartBuddy starts the engine again by itself once that window closes.
 */
describe('supervisor machine: handing the design to the SolidCraft window', () => {
  it('opens the window without owning it and returns to the headless engine when it closes', async () => {
    const launches: string[] = [];
    let handoffPending = false;
    const session: { lose: ((reason: string) => void) | null } = { lose: null };
    const machine = supervisorMachine.provide({
      delays: { pollInterval: 5, reconnectDelay: 5 },
      actors: {
        discover: fromPromise<DiscoveryResult>(() => Promise.resolve({ kind: 'notRunning' })),
        launch: fromPromise<Launched>(() => {
          const handoff = handoffPending;
          handoffPending = false;
          launches.push(handoff ? 'window' : 'headless');
          return Promise.resolve({ launchedAt: Date.now(), headless: !handoff, handoff });
        }),
        waitForApp: fromPromise<ControlEndpoint, { launchedAt: number }>(() => Promise.resolve(windowEndpoint)),
        connect: fromPromise<{ documentId: string; revision: number }, { endpoint: ControlEndpoint | null }>(() =>
          Promise.resolve({ documentId: 'd', revision: 1 }),
        ),
        session: fromCallback<SupervisorEvent>(({ sendBack }) => {
          session.lose = (reason) => {
            sendBack({ type: 'LOST', reason });
          };
          return () => {
            session.lose = null;
          };
        }),
      },
    });
    const actor = createActor(machine, { input: { autoStart: true } });
    const reached = (test: (snapshot: SnapshotFrom<typeof machine>) => boolean) =>
      new Promise<void>((resolve) => {
        const check = () => {
          if (test(actor.getSnapshot())) {
            subscription.unsubscribe();
            resolve();
          }
        };
        const subscription = actor.subscribe(check);
        check();
      });
    actor.start();

    await reached((s) => s.value === 'connected');
    expect(actor.getSnapshot().context).toMatchObject({ owned: true, endpoint: null, resume: false });

    handoffPending = true;
    actor.send({ type: 'HANDOFF' });
    await reached((s) => s.value === 'connected' && s.context.endpoint !== null);
    // The user's window: PartBuddy does not quit it on exit.
    expect(actor.getSnapshot().context).toMatchObject({ owned: false, resume: true, endpoint: windowEndpoint });

    // The user closes the SolidCraft window: PartBuddy runs the engine again, without being asked.
    session.lose?.('closed');
    await reached((s) => s.value === 'connected' && s.context.endpoint === null);
    expect(actor.getSnapshot().context).toMatchObject({ owned: true, resume: false });
    expect(launches).toEqual(['headless', 'window', 'headless']);

    // A later loss of the engine does not start it again by itself.
    session.lose?.('crashed');
    await reached((s) => s.value === 'notRunning');
    actor.stop();
  });
});
