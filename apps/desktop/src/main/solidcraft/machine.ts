import { assign, fromCallback, fromPromise, setup, type ActorRefFrom } from 'xstate';

import type { ControlEndpoint } from './discovery';

/**
 * Connection states of the SolidCraft supervisor (XState, building blocks "Flows"). Side effects
 * are actors injected with `machine.provide`, so tests drive the machine with fakes.
 *
 * searching → connecting → connected, with the start of SolidCraft on the first search only:
 * after the user closes SolidCraft, PartBuddy does not start it again by itself.
 */

export type DiscoveryResult =
  | { kind: 'running'; endpoint: ControlEndpoint }
  | { kind: 'notRunning' }
  | { kind: 'notInstalled' };

export interface Session {
  documentId: string;
  revision: number;
}

export interface SupervisorContext {
  /** Start SolidCraft when none runs; true until the first search has finished. */
  autoStart: boolean;
  endpoint: ControlEndpoint | null;
  /** PartBuddy started this SolidCraft and closes it on quit. */
  owned: boolean;
  /** When PartBuddy started SolidCraft, to tell its fresh token file from a stale one. */
  launchedAt: number | null;
  documentId: string | null;
  revision: number | null;
  detail: string | null;
}

export type SupervisorEvent =
  | { type: 'RETRY' }
  | { type: 'START' }
  | { type: 'REVISION'; documentId: string; revision: number }
  | { type: 'LOST'; reason: string };

const notProvided = (name: string) => () => {
  throw new Error(`supervisor actor ${name} not provided`);
};

export const supervisorMachine = setup({
  types: {
    context: {} as SupervisorContext,
    events: {} as SupervisorEvent,
    input: {} as { autoStart: boolean },
  },
  actors: {
    discover: fromPromise<DiscoveryResult>(notProvided('discover')),
    launch: fromPromise<{ launchedAt: number }>(notProvided('launch')),
    waitForApp: fromPromise<ControlEndpoint, { launchedAt: number }>(notProvided('waitForApp')),
    connect: fromPromise<Session, { endpoint: ControlEndpoint }>(notProvided('connect')),
    session: fromCallback<SupervisorEvent>(notProvided('session')),
  },
  delays: {
    pollInterval: 3000,
    reconnectDelay: 2000,
  },
  guards: {
    isRunning: (_, result: DiscoveryResult) => result.kind === 'running',
    isNotInstalled: (_, result: DiscoveryResult) => result.kind === 'notInstalled',
    shouldStart: ({ context }) => context.autoStart,
  },
}).createMachine({
  id: 'solidcraft',
  context: ({ input }) => ({
    autoStart: input.autoStart,
    endpoint: null,
    owned: false,
    launchedAt: null,
    documentId: null,
    revision: null,
    detail: null,
  }),
  initial: 'searching',
  states: {
    searching: {
      invoke: {
        src: 'discover',
        onDone: [
          {
            guard: { type: 'isRunning', params: ({ event }) => event.output },
            target: 'connecting',
            actions: assign({
              endpoint: ({ event }) => (event.output.kind === 'running' ? event.output.endpoint : null),
              autoStart: false,
            }),
          },
          { guard: { type: 'isNotInstalled', params: ({ event }) => event.output }, target: 'notInstalled' },
          { guard: 'shouldStart', target: 'starting' },
          { target: 'notRunning' },
        ],
        onError: {
          target: 'failed',
          actions: assign({ detail: ({ event }) => errorText(event.error) }),
        },
      },
    },
    notInstalled: {
      on: { RETRY: 'searching' },
    },
    notRunning: {
      after: { pollInterval: 'searching' },
      on: { RETRY: 'searching', START: 'starting' },
    },
    starting: {
      entry: assign({ autoStart: false, detail: null }),
      initial: 'launching',
      states: {
        launching: {
          invoke: {
            src: 'launch',
            onDone: {
              target: 'waiting',
              actions: assign({ owned: true, launchedAt: ({ event }) => event.output.launchedAt }),
            },
            onError: {
              target: '#solidcraft.failed',
              actions: assign({ detail: ({ event }) => errorText(event.error) }),
            },
          },
        },
        waiting: {
          invoke: {
            src: 'waitForApp',
            input: ({ context }) => ({ launchedAt: context.launchedAt ?? 0 }),
            onDone: {
              target: '#solidcraft.connecting',
              actions: assign({ endpoint: ({ event }) => event.output }),
            },
            onError: {
              target: '#solidcraft.failed',
              actions: assign({ detail: ({ event }) => errorText(event.error) }),
            },
          },
        },
      },
    },
    connecting: {
      invoke: {
        src: 'connect',
        input: ({ context }) => {
          if (!context.endpoint) throw new Error('no endpoint to connect to');
          return { endpoint: context.endpoint };
        },
        onDone: {
          target: 'connected',
          actions: assign({
            documentId: ({ event }) => event.output.documentId,
            revision: ({ event }) => event.output.revision,
            detail: null,
          }),
        },
        onError: {
          target: 'lost',
          actions: assign({ detail: ({ event }) => errorText(event.error) }),
        },
      },
    },
    connected: {
      invoke: { src: 'session' },
      on: {
        REVISION: {
          actions: assign({
            documentId: ({ event }) => event.documentId,
            revision: ({ event }) => event.revision,
          }),
        },
        LOST: {
          target: 'lost',
          actions: assign({ detail: ({ event }) => event.reason }),
        },
      },
    },
    lost: {
      entry: assign({ endpoint: null, documentId: null, revision: null }),
      after: { reconnectDelay: 'searching' },
      on: { RETRY: 'searching' },
    },
    failed: {
      on: { RETRY: 'searching', START: 'starting' },
    },
  },
});

export type SupervisorActor = ActorRefFrom<typeof supervisorMachine>;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
