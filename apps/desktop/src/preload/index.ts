import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

import type { PartBuddyApi } from '../shared/api';
import { eventChannels, invokeChannels, type EventChannel } from '../shared/channels';
import type { EventPayload } from '../shared/contract';

// Sandboxed preload (ADR 0013): only named channels are exposed, never ipcRenderer itself.

function subscribe<C extends EventChannel>(channel: C, listener: (payload: EventPayload<C>) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: EventPayload<C>) => {
    listener(payload);
  };
  ipcRenderer.on(channel, handler);
  return () => {
    ipcRenderer.removeListener(channel, handler);
  };
}

const api: PartBuddyApi = {
  appInfo: () => ipcRenderer.invoke(invokeChannels.appInfo),
  solidcraft: {
    status: () => ipcRenderer.invoke(invokeChannels.solidcraftStatus),
    retry: () => ipcRenderer.invoke(invokeChannels.solidcraftRetry),
    start: () => ipcRenderer.invoke(invokeChannels.solidcraftStart),
    onStatus: (listener) => subscribe(eventChannels.solidcraftStatus, listener),
  },
  mirror: {
    current: () => ipcRenderer.invoke(invokeChannels.mirrorCurrent),
    onRevision: (listener) => subscribe(eventChannels.mirrorRevision, listener),
  },
};

contextBridge.exposeInMainWorld('partbuddy', api);
