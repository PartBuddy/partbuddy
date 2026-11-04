import { describe, expect, it } from 'vitest';

import { Bridge, trustedSender, type IpcRegistry, type SenderEvent } from '../src/main/bridge';
import { eventChannels, invokeChannels } from '../src/shared/channels';
import { invokeContract } from '../src/shared/contract';

type Listener = (event: SenderEvent, payload: unknown) => unknown;

function fakeIpc() {
  const handlers = new Map<string, Listener>();
  const ipc: IpcRegistry = {
    handle(channel, listener) {
      handlers.set(channel, listener);
    },
  };
  return { ipc, handlers };
}

const origin = 'partbuddy://app';
const goodEvent: SenderEvent = { sender: { id: 7 }, senderFrame: { url: `${origin}/index.html`, parent: null } };
const isTrusted = trustedSender(() => 7, origin);

describe('typed IPC bridge (ADR 0013)', () => {
  it('lists a request and a response schema for every invoke channel', () => {
    for (const channel of Object.values(invokeChannels)) {
      expect(invokeContract[channel], channel).toBeDefined();
    }
  });

  it('runs a handler for a valid request from the app frame', async () => {
    const { ipc, handlers } = fakeIpc();
    new Bridge(ipc, isTrusted, true).handle(invokeChannels.solidcraftStatus, () => ({
      state: 'connected',
      owned: false,
      mirror: 'idle',
      revision: 3,
      documentId: 'd-1',
    }));
    await expect(handlers.get(invokeChannels.solidcraftStatus)?.(goodEvent, undefined)).resolves.toMatchObject({
      state: 'connected',
    });
  });

  it('rejects payloads the contract does not allow', async () => {
    const { ipc, handlers } = fakeIpc();
    new Bridge(ipc, isTrusted, true).handle(invokeChannels.solidcraftRetry, () => undefined);
    await expect(handlers.get(invokeChannels.solidcraftRetry)?.(goodEvent, { path: 'C:/Windows' })).rejects.toThrow(
      /invalid request/,
    );
  });

  it('refuses foreign senders, sub-frames and other origins', async () => {
    const { ipc, handlers } = fakeIpc();
    new Bridge(ipc, isTrusted, true).handle(invokeChannels.solidcraftRetry, () => undefined);
    const call = handlers.get(invokeChannels.solidcraftRetry);
    const foreign: SenderEvent[] = [
      { ...goodEvent, sender: { id: 8 } },
      { ...goodEvent, senderFrame: { url: `${origin}/index.html`, parent: {} } },
      { ...goodEvent, senderFrame: { url: 'https://example.com/', parent: null } },
      { ...goodEvent, senderFrame: { url: 'partbuddy://app.evil/index.html', parent: null } },
      { ...goodEvent, senderFrame: null },
    ];
    for (const event of foreign) {
      await expect(call?.(event, undefined)).rejects.toThrow(/untrusted sender/);
    }
  });

  it('validates responses in development builds', async () => {
    const { ipc, handlers } = fakeIpc();
    // A handler that leaks a field the contract does not know is stopped before the renderer sees it.
    new Bridge(ipc, isTrusted, true).handle(invokeChannels.solidcraftStatus, () => ({
      state: 'connected',
      owned: false,
      mirror: 'idle',
      token: 'secret',
    }) as never);
    await expect(handlers.get(invokeChannels.solidcraftStatus)?.(goodEvent, undefined)).rejects.toThrow();
  });

  it('validates events before sending them', () => {
    const { ipc } = fakeIpc();
    const bridge = new Bridge(ipc, isTrusted, true);
    const sent: unknown[] = [];
    const target = { send: (_channel: string, payload: unknown) => sent.push(payload) };
    bridge.emit(target, eventChannels.solidcraftStatus, { state: 'lost', owned: false, mirror: 'idle' });
    expect(sent).toHaveLength(1);
    expect(() => {
      bridge.emit(target, eventChannels.solidcraftStatus, { state: 'weird', owned: false, mirror: 'idle' } as never);
    }).toThrow();
  });
});
