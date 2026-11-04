import type { EventChannel, InvokeChannel } from '../shared/channels';
import {
  eventContract,
  invokeContract,
  type EventPayload,
  type InvokeRequest,
  type InvokeResponse,
} from '../shared/contract';

/** The part of an IPC invoke event the bridge looks at (Electron's IpcMainInvokeEvent). */
export interface SenderEvent {
  sender: { id: number };
  senderFrame: { url: string; parent: unknown } | null;
}

/** The part of `ipcMain` the bridge needs; injected so contract tests run without Electron. */
export interface IpcRegistry {
  handle(channel: string, listener: (event: SenderEvent, payload: unknown) => unknown): void;
}

export interface EventTarget {
  send(channel: string, payload: unknown): void;
}

export type Handler<C extends InvokeChannel> = (
  request: InvokeRequest<C>,
) => InvokeResponse<C> | Promise<InvokeResponse<C>>;

/**
 * Main-process side of the typed bridge (ADR 0013): validates every request against the
 * contract, accepts calls only from the app's own top-level renderer frame, and validates
 * responses and events in development builds.
 */
export class Bridge {
  constructor(
    private readonly ipc: IpcRegistry,
    private readonly isTrustedSender: (event: SenderEvent) => boolean,
    private readonly validateOutgoing: boolean,
  ) {}

  handle<C extends InvokeChannel>(channel: C, handler: Handler<C>): void {
    const schema = invokeContract[channel];
    this.ipc.handle(channel, async (event, payload) => {
      if (!this.isTrustedSender(event)) throw new Error(`${channel}: refused, untrusted sender`);
      const parsed = schema.request.safeParse(payload);
      if (!parsed.success) throw new Error(`${channel}: invalid request`);
      const response = await handler(parsed.data as InvokeRequest<C>);
      return this.validateOutgoing ? schema.response.parse(response) : response;
    });
  }

  emit<C extends EventChannel>(target: EventTarget | null, channel: C, payload: EventPayload<C>): void {
    if (this.validateOutgoing) eventContract[channel].parse(payload);
    target?.send(channel, payload);
  }
}

/** Accepts only the top-level frame of the given window, loaded from the app's own origin. */
export function trustedSender(
  webContentsId: () => number | undefined,
  rendererOrigin: string,
): (event: SenderEvent) => boolean {
  return (event) => {
    const frame = event.senderFrame;
    if (!frame || frame.parent !== null) return false;
    if (event.sender.id !== webContentsId()) return false;
    return frame.url === rendererOrigin || frame.url.startsWith(`${rendererOrigin}/`) || frame.url.startsWith(`${rendererOrigin}?`);
  };
}
