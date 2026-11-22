import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';

import type { PartBuddyApi } from '../shared/api';
import { eventChannels, invokeChannels, type EventChannel } from '../shared/channels';
import type { AppSettingRequest, EventPayload, SettingsReset } from '../shared/contract';

// Sandboxed preload (ADR 0013): only named channels are exposed, never ipcRenderer itself.

/**
 * ipcRenderer.invoke without Electron's prefix: a failure reads "SolidCraft is not connected", not "Error invoking
 * remote method 'design:apply-dimension': Error: SolidCraft is not connected" (usability U-24).
 */
function invoke(channel: string, ...args: unknown[]): Promise<never> {
  return ipcRenderer.invoke(channel, ...args).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message.replace(/^Error invoking remote method '[^']*': (?:\w*Error: )?/, ''));
  }) as Promise<never>;
}

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
  appInfo: () => invoke(invokeChannels.appInfo),
  relaunch: () => invoke(invokeChannels.appRelaunch),
  settings: {
    general: () => invoke(invokeChannels.settingsGeneral),
    setLanguage: (language) => invoke(invokeChannels.settingsSetLanguage, { language }),
    chooseProjectsFolder: () => invoke(invokeChannels.settingsChooseProjectsFolder),
    resetProjectsFolder: () => invoke(invokeChannels.settingsResetProjectsFolder),
    finishSetup: () => invoke(invokeChannels.settingsFinishSetup),
    reset: (section: SettingsReset) => invoke(invokeChannels.settingsReset, { section }),
    app: () => invoke(invokeChannels.settingsApp),
    setApp: (request: AppSettingRequest) => invoke(invokeChannels.settingsSetApp, request),
    revealLog: () => invoke(invokeChannels.settingsRevealLog),
  },
  updates: {
    state: () => invoke(invokeChannels.updatesState),
    check: () => invoke(invokeChannels.updatesCheck),
    download: () => invoke(invokeChannels.updatesDownload),
    install: () => invoke(invokeChannels.updatesInstall),
    onState: (listener) => subscribe(eventChannels.updatesState, listener),
  },
  project: {
    info: () => invoke(invokeChannels.projectInfo),
    create: () => invoke(invokeChannels.projectNew),
    open: () => invoke(invokeChannels.projectOpen),
    rename: (name, folder) => invoke(invokeChannels.projectRename, folder === undefined ? { name } : { name, folder }),
    duplicate: (folder) => invoke(invokeChannels.projectDuplicate, folder === undefined ? {} : { folder }),
    reveal: (folder) => invoke(invokeChannels.projectReveal, folder === undefined ? {} : { folder }),
    trash: (folder) => invoke(invokeChannels.projectTrash, folder === undefined ? {} : { folder }),
    list: () => invoke(invokeChannels.projectList),
    openFolder: (folder) => invoke(invokeChannels.projectOpenFolder, { folder }),
    import: (path) => invoke(invokeChannels.projectImport, path === undefined ? {} : { path }),
    fromTemplate: (template, name) => invoke(invokeChannels.projectFromTemplate, { template, name }),
    pathOfFile: (file) => webUtils.getPathForFile(file),
    savePreview: (preview) => invoke(invokeChannels.projectSavePreview, preview),
    versions: () => invoke(invokeChannels.projectVersions),
    saveVersion: (label) => invoke(invokeChannels.projectSaveVersion, { label }),
    restoreVersion: (id) => invoke(invokeChannels.projectRestoreVersion, { id }),
    compareVersion: (id) => invoke(invokeChannels.projectCompareVersion, { id }),
    nameVersion: (id, label) => invoke(invokeChannels.projectNameVersion, { id, label }),
    versionAsProject: (id) => invoke(invokeChannels.projectVersionAsProject, { id }),
    trashList: () => invoke(invokeChannels.projectTrashList),
    parts: () => invoke(invokeChannels.projectParts),
    setPart: (body, note, bodies) => invoke(invokeChannels.projectSetPart, { body, note, bodies }),
    setMeta: (folder, change) => invoke(invokeChannels.projectSetMeta, { folder, ...change }),
    exportPackage: (folder) => invoke(invokeChannels.projectExportPackage, folder === undefined ? {} : { folder }),
    restoreTrashed: (id) => invoke(invokeChannels.projectTrashRestore, { id }),
    emptyTrash: () => invoke(invokeChannels.projectTrashEmpty),
  },
  solidcraft: {
    engine: () => invoke(invokeChannels.solidcraftEngine),
    chooseEngine: (automatic) => invoke(invokeChannels.solidcraftChooseEngine, { automatic }),
    status: () => invoke(invokeChannels.solidcraftStatus),
    retry: () => invoke(invokeChannels.solidcraftRetry),
    start: () => invoke(invokeChannels.solidcraftStart),
    onStatus: (listener) => subscribe(eventChannels.solidcraftStatus, listener),
  },
  mirror: {
    current: () => invoke(invokeChannels.mirrorCurrent),
    onRevision: (listener) => subscribe(eventChannels.mirrorRevision, listener),
  },
  design: {
    undo: () => invoke(invokeChannels.designUndo),
    redo: () => invoke(invokeChannels.designRedo),
    export: (format) => invoke(invokeChannels.designExport, { format }),
    revealExport: () => invoke(invokeChannels.designRevealExport),
    saveVideo: (video) => invoke(invokeChannels.designSaveVideo, video),
    share: () => invoke(invokeChannels.designShare),
    openInSolidCraft: () => invoke(invokeChannels.designOpenInSolidCraft),
    probeDimension: (probe) => invoke(invokeChannels.designProbeDimension, probe),
    applyDimension: (apply) => invoke(invokeChannels.designApplyDimension, apply),
    previewAction: (action) => invoke(invokeChannels.designPreviewAction, action),
    applyAction: (action) => invoke(invokeChannels.designApplyAction, action),
    partsLibrary: () => invoke(invokeChannels.designPartsLibrary),
    previewBlock: (block) => invoke(invokeChannels.designPreviewBlock, block),
    applyBlock: (block) => invoke(invokeChannels.designApplyBlock, block),
    logoAt: (point) => invoke(invokeChannels.designLogoAt, { point }),
    previewLogoMove: (move) => invoke(invokeChannels.designPreviewLogoMove, move),
    moveLogo: (move) => invoke(invokeChannels.designMoveLogo, move),
    slicers: () => invoke(invokeChannels.designSlicers),
    sendToSlicer: (slicer) => invoke(invokeChannels.designSendToSlicer, { slicer }),
    setPrintFace: (body, point, face) => invoke(invokeChannels.designPrintFace, { body, point, ...(face ? { face } : {}) }),
    printFaces: () => invoke(invokeChannels.designPrintFaces),
    onPrintFaces: (listener) => subscribe(eventChannels.printFacesChanged, listener),
    insertPart: (part) => invoke(invokeChannels.designInsertPart, part),
    measure: (items) => invoke(invokeChannels.designMeasure, { items }),
    clearance: (bodies, gap) => invoke(invokeChannels.designClearance, { bodies, gap }),
    driveJoint: (drive) => invoke(invokeChannels.designDriveJoint, drive),
    sweepJoints: (sweeps) => invoke(invokeChannels.designSweepJoints, { sweeps }),
    timeline: (command) => invoke(invokeChannels.designTimeline, command),
    visibility: (command) => invoke(invokeChannels.designVisibility, command),
    renameBody: (body, name) => invoke(invokeChannels.designRenameBody, { body, name }),
    insert: (path) => invoke(invokeChannels.designInsert, path === undefined ? {} : { path }),
    convertMesh: (body) => invoke(invokeChannels.designRepair, { body }),
    repairBody: (body) => invoke(invokeChannels.designRepairBody, { body }),
    goToStep: (step) => invoke(invokeChannels.designGoToStep, { step }),
    dimensions: (features) => invoke(invokeChannels.designDimensions, { features }),
    probeParameter: (parameter, value, body) => invoke(invokeChannels.designProbeParameter, { parameter, value, body }),
    parameters: () => invoke(invokeChannels.designParameters),
  },
  notes: {
    current: () => invoke(invokeChannels.notesCurrent),
    add: (selection, text) => invoke(invokeChannels.notesAdd, { selection, text }),
    edit: (id, text) => invoke(invokeChannels.notesEdit, { id, text }),
    delete: (id) => invoke(invokeChannels.notesDelete, { id }),
    accept: (id) => invoke(invokeChannels.notesAccept, { id }),
    reattach: (id, selection) => invoke(invokeChannels.notesReattach, { id, selection }),
    restore: (id) => invoke(invokeChannels.notesRestore, { id }),
    dismiss: (id) => invoke(invokeChannels.notesDismiss, { id }),
    onChange: (listener) => subscribe(eventChannels.notesChanged, listener),
  },
  print: {
    settings: () => invoke(invokeChannels.printSettings),
    saveSettings: (settings) => invoke(invokeChannels.printSaveSettings, settings),
    part: () => invoke(invokeChannels.printPart),
    setMaterial: (material) => invoke(invokeChannels.printSetMaterial, { material }),
    onChange: (listener) => subscribe(eventChannels.printChanged, listener),
    reportCheck: (report) => invoke(invokeChannels.printReportCheck, report),
    testPiecesPicture: (printer) => invoke(invokeChannels.printTestPiecesPicture, printer),
    exportTestPieces: (request) => invoke(invokeChannels.printTestPiecesExport, request),
  },
  viewer: {
    report: (state) => invoke(invokeChannels.viewerState, state),
  },
  window: {
    setTitleBarColors: (colors) => invoke(invokeChannels.windowTitleBar, colors),
    theme: () => invoke(invokeChannels.windowTheme),
    setTheme: (theme) => invoke(invokeChannels.windowSetTheme, { theme }),
  },
  chat: {
    load: () => invoke(invokeChannels.chatLoad),
    save: (items) => invoke(invokeChannels.chatSave, { items }),
  },
  assembly: {
    get: () => invoke(invokeChannels.assemblyGet),
    onChange: (listener) => subscribe(eventChannels.assemblyChanged, listener),
  },
  sketches: {
    list: () => invoke(invokeChannels.sketchList),
    load: (id) => invoke(invokeChannels.sketchLoad, { id }),
  },
  agent: {
    status: () => invoke(invokeChannels.agentStatus),
    refresh: () => invoke(invokeChannels.agentRefresh),
    send: (text, selections, answer, sketch, photos, drawing) =>
      invoke(invokeChannels.agentSend, {
        text,
        ...(selections && selections.length > 0 ? { selections } : {}),
        ...(answer ? { answer } : {}),
        ...(sketch ? { sketch: sketch.png } : {}),
        ...(sketch?.elements ? { sketchElements: sketch.elements } : {}),
        ...(sketch?.state ? { sketchState: sketch.state } : {}),
        ...(photos && photos.length > 0 ? { photos } : {}),
        ...(drawing ? { drawing } : {}),
      }),
    stop: () => invoke(invokeChannels.agentStop),
    select: (agent) => invoke(invokeChannels.agentSelect, { agent }),
    allowApiBilling: (allow) => invoke(invokeChannels.agentAllowApiBilling, { allow }),
    chooseModel: (choice, asDefault) => invoke(invokeChannels.agentChooseModel, { choice, asDefault }),
    phaseModel: (phase, choice) => invoke(invokeChannels.agentPhaseModel, { phase, choice }),
    automatic: () => invoke(invokeChannels.agentAutomatic),
    research: () => invoke(invokeChannels.agentResearch),
    setResearch: (allow) => invoke(invokeChannels.agentSetResearch, { allow }),
    signIn: () => invoke(invokeChannels.agentSignIn),
    signOut: () => invoke(invokeChannels.agentSignOut),
    onStatus: (listener) => subscribe(eventChannels.agentStatus, listener),
    onEvent: (listener) => subscribe(eventChannels.agentEvent, listener),
  },
};

contextBridge.exposeInMainWorld('partbuddy', api);
