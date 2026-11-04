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
  design: {
    undo: () => ipcRenderer.invoke(invokeChannels.designUndo),
    redo: () => ipcRenderer.invoke(invokeChannels.designRedo),
    export: (format) => ipcRenderer.invoke(invokeChannels.designExport, { format }),
    openInSolidCraft: () => ipcRenderer.invoke(invokeChannels.designOpenInSolidCraft),
    probeDimension: (probe) => ipcRenderer.invoke(invokeChannels.designProbeDimension, probe),
    applyDimension: (apply) => ipcRenderer.invoke(invokeChannels.designApplyDimension, apply),
    previewAction: (action) => ipcRenderer.invoke(invokeChannels.designPreviewAction, action),
    applyAction: (action) => ipcRenderer.invoke(invokeChannels.designApplyAction, action),
    measure: (items) => ipcRenderer.invoke(invokeChannels.designMeasure, { items }),
    timeline: (command) => ipcRenderer.invoke(invokeChannels.designTimeline, command),
    visibility: (command) => ipcRenderer.invoke(invokeChannels.designVisibility, command),
    goToStep: (step) => ipcRenderer.invoke(invokeChannels.designGoToStep, { step }),
    dimensions: (features) => ipcRenderer.invoke(invokeChannels.designDimensions, { features }),
    probeParameter: (parameter, value, body) => ipcRenderer.invoke(invokeChannels.designProbeParameter, { parameter, value, body }),
  },
  notes: {
    current: () => ipcRenderer.invoke(invokeChannels.notesCurrent),
    add: (selection, text) => ipcRenderer.invoke(invokeChannels.notesAdd, { selection, text }),
    edit: (id, text) => ipcRenderer.invoke(invokeChannels.notesEdit, { id, text }),
    delete: (id) => ipcRenderer.invoke(invokeChannels.notesDelete, { id }),
    accept: (id) => ipcRenderer.invoke(invokeChannels.notesAccept, { id }),
    reattach: (id, selection) => ipcRenderer.invoke(invokeChannels.notesReattach, { id, selection }),
    restore: (id) => ipcRenderer.invoke(invokeChannels.notesRestore, { id }),
    dismiss: (id) => ipcRenderer.invoke(invokeChannels.notesDismiss, { id }),
    onChange: (listener) => subscribe(eventChannels.notesChanged, listener),
  },
  viewer: {
    report: (state) => ipcRenderer.invoke(invokeChannels.viewerState, state),
  },
  window: {
    setTitleBarColors: (colors) => ipcRenderer.invoke(invokeChannels.windowTitleBar, colors),
    theme: () => ipcRenderer.invoke(invokeChannels.windowTheme),
    setTheme: (theme) => ipcRenderer.invoke(invokeChannels.windowSetTheme, { theme }),
  },
  agent: {
    status: () => ipcRenderer.invoke(invokeChannels.agentStatus),
    refresh: () => ipcRenderer.invoke(invokeChannels.agentRefresh),
    send: (text, selections, answer, drawing) =>
      ipcRenderer.invoke(invokeChannels.agentSend, {
        text,
        ...(selections && selections.length > 0 ? { selections } : {}),
        ...(answer ? { answer } : {}),
        ...(drawing ? { drawing } : {}),
      }),
    stop: () => ipcRenderer.invoke(invokeChannels.agentStop),
    select: (agent) => ipcRenderer.invoke(invokeChannels.agentSelect, { agent }),
    allowApiBilling: (allow) => ipcRenderer.invoke(invokeChannels.agentAllowApiBilling, { allow }),
    signIn: () => ipcRenderer.invoke(invokeChannels.agentSignIn),
    signOut: () => ipcRenderer.invoke(invokeChannels.agentSignOut),
    onStatus: (listener) => subscribe(eventChannels.agentStatus, listener),
    onEvent: (listener) => subscribe(eventChannels.agentEvent, listener),
  },
};

contextBridge.exposeInMainWorld('partbuddy', api);
