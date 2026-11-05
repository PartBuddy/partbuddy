import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, BrowserWindow, dialog, ipcMain, nativeTheme, net, protocol, screen, session, shell } from 'electron';

import { invokeChannels, eventChannels } from '../shared/channels';
import type { AgentEvent, ExportFormat, ViewState } from '../shared/contract';
import { AgentService } from './agents/agentService';
import { AppearanceSettings } from './appearance';
import { Assistant } from './agents/assistant';
import { SolidCraftTools } from './agents/solidcraftTools';
import type { UpstreamTools } from './agents/gateProxy';
import { guardNotes } from './agents/noteGuard';
import { withViewTool } from './agents/viewContext';
import { Questions } from './agents/questions';
import { WorkLog } from './agents/workLog';
import { describeDrawing } from '../shared/drawing';
import { describeUserAction } from '../shared/stepPhrases';
import { ChatGptAccount } from './chatgpt/account';
import { ChatGptAgent } from './chatgpt/chatgptAgent';
import { hostId } from './chatgpt/oauth';
import { SecretStore } from './credentials/secretStore';
import { loadNoteKey } from './notes/noteRecord';
import { NotesService } from './notes/notesService';
import { Bridge, trustedSender } from './bridge';
import { findExecutable, systemEnvironment } from './solidcraft/discovery';
import { safeDesignFileName } from './solidcraft/headless';
import { SolidCraftSupervisor } from './solidcraft/supervisor';
import { ChatArchive } from './chat/chatArchive';

app.setName('PartBuddy');
// Windows counts a window beside all displays as covered and stops painting it; test runs
// (PARTBUDDY_WINDOW_DISPLAY=offscreen) keep it painting.
if (process.env.PARTBUDDY_WINDOW_DISPLAY === 'offscreen') app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');

/**
 * Builds are served from a privileged custom scheme instead of file:// (Electron security
 * checklist): one origin for the bridge's sender check, module workers allowed, and only files
 * inside the renderer folder can be read.
 */
const APP_SCHEME = 'partbuddy';
const APP_HOST = 'app';
protocol.registerSchemesAsPrivileged([
  { scheme: APP_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
const rendererRoot = resolve(__dirname, '../renderer');

function serveRenderer(request: Request): Response | Promise<Response> {
  const url = new URL(request.url);
  const file = resolve(rendererRoot, `.${decodeURIComponent(url.pathname)}`);
  if (url.host !== APP_HOST || !file.startsWith(rendererRoot + sep)) {
    return new Response('not found', { status: 404 });
  }
  return net.fetch(pathToFileURL(file).href);
}

const EXPORT_FILTERS: Record<ExportFormat, { name: string; extensions: string[] }> = {
  '3mf': { name: '3MF', extensions: ['3mf'] },
  stl: { name: 'STL', extensions: ['stl'] },
  step: { name: 'STEP', extensions: ['step', 'stp'] },
};

const devServerUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const rendererOrigin = devServerUrl ? new URL(devServerUrl).origin : `${APP_SCHEME}://${APP_HOST}`;

let mainWindow: BrowserWindow | null = null;

function log(message: string): void {
  // Logs carry no prompts, tokens or personal data (architecture: user data at runtime).
  console.log(`[partbuddy] ${message}`);
}

function cacheDirectory(): string {
  if (process.env.PARTBUDDY_CACHE_DIR) return process.env.PARTBUDDY_CACHE_DIR;
  const local = process.platform === 'win32' ? process.env.LOCALAPPDATA : undefined;
  return local ? join(local, 'PartBuddy', 'cache', 'mirror') : join(app.getPath('userData'), 'cache', 'mirror');
}

function launchPort(): number {
  const value = Number.parseInt(process.env.PARTBUDDY_SOLIDCRAFT_PORT ?? '', 10);
  return Number.isInteger(value) && value > 0 && value < 65536 ? value : 7878;
}

/** Height of the integrated title bar; the renderer's token `--cs-titlebar-height` confirms it. */
const TITLE_BAR_HEIGHT = 40;

const WINDOW_WIDTH = 1440;
const WINDOW_HEIGHT = 900;

/**
 * Test runs must not disturb the developer (rule of 2026-11-04): PARTBUDDY_WINDOW_DISPLAY=offscreen
 * (the E2E launcher's default) opens the window beside all displays, without focus and without a
 * taskbar button, so nothing of it is seen; `leftmost` puts it on the leftmost display, still
 * without focus, for watching a test on purpose. The app itself opens where the system puts it.
 */
type TestPlacement = { x: number; y: number; hidden: boolean };
function testPlacement(): TestPlacement | null {
  const mode = process.env.PARTBUDDY_WINDOW_DISPLAY;
  const displays = [...screen.getAllDisplays()].sort((a, b) => a.bounds.x - b.bounds.x);
  const [leftmost] = displays;
  if (!leftmost) return null;
  if (mode === 'offscreen') {
    const top = Math.min(...displays.map((display) => display.bounds.y));
    return { x: leftmost.bounds.x - WINDOW_WIDTH - 400, y: top, hidden: true };
  }
  if (mode === 'leftmost') return { x: leftmost.workArea.x + 24, y: leftmost.workArea.y + 24, hidden: false };
  return null;
}

function createWindow(): BrowserWindow {
  const placement = testPlacement();
  const window = new BrowserWindow({
    ...(placement ? { x: placement.x, y: placement.y, skipTaskbar: placement.hidden } : {}),
    width: WINDOW_WIDTH,
    height: WINDOW_HEIGHT,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'PartBuddy',
    autoHideMenuBar: true,
    // Integrated title bar: the app draws logo, wordmark and design name, the system keeps its
    // own window buttons (Snap layouts on Windows 11, traffic lights on macOS). The renderer
    // colours the buttons from the design tokens (window:title-bar).
    titleBarStyle: 'hidden',
    titleBarOverlay: process.platform === 'darwin' ? true : { height: TITLE_BAR_HEIGHT },
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 12, y: 12 } } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
      // Off screen the window must keep rendering, or the 3D view of a test stays empty.
      ...(placement?.hidden ? { backgroundThrottling: false } : {}),
    },
  });
  window.once('ready-to-show', () => {
    if (placement) window.showInactive();
    else window.show();
  });
  // No remote content and no new windows in the privileged window (architecture: security).
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(rendererOrigin)) event.preventDefault();
  });
  if (devServerUrl) void window.loadURL(devServerUrl);
  else void window.loadURL(`${rendererOrigin}/index.html`);
  return window;
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });

  void app.whenReady().then(() => {
    protocol.handle(APP_SCHEME, serveRenderer);
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });

    const appearance = new AppearanceSettings(join(app.getPath('userData'), 'appearance.json'));
    nativeTheme.themeSource = appearance.theme();

    const bridge = new Bridge(ipcMain, trustedSender(() => mainWindow?.webContents.id, rendererOrigin), !app.isPackaged);
    // The user's project folder: the only place the assistant's SolidCraft may read and write.
    // PARTBUDDY_PROJECTS_DIR: tests keep the user's documents untouched.
    const projects = process.env.PARTBUDDY_PROJECTS_DIR ?? join(app.getPath('documents'), 'PartBuddy');
    mkdirSync(projects, { recursive: true });
    // The work log of the conversation (M2a); made once the supervisor exists.
    let workLog: WorkLog | null = null;
    // Notes on the model (M2b, ADR 0020); made once the supervisor exists.
    let notes: NotesService | null = null;
    let chats: ChatArchive | null = null;
    const supervisor = new SolidCraftSupervisor(
      {
        environment: systemEnvironment,
        launchPort: launchPort(),
        autoStart: process.env.PARTBUDDY_SOLIDCRAFT_AUTOSTART !== '0',
        cacheDir: cacheDirectory(),
        // SolidCraft without a window by default (ADR 0016); the window only on purpose.
        launchMode: process.env.PARTBUDDY_SOLIDCRAFT_WINDOW === '1' ? 'window' : 'headless',
        designsDir: join(app.getPath('userData'), 'designs'),
        projectsDir: projects,
        log,
      },
      {
        status: (status) => {
          bridge.emit(mainWindow?.webContents ?? null, eventChannels.solidcraftStatus, status);
          // A conversation held before the design had a file goes next to it after the first save.
          if (status.state === 'connected' && status.save === 'saved') chats?.flush();
        },
        revision: (revision) => {
          bridge.emit(mainWindow?.webContents ?? null, eventChannels.mirrorRevision, revision);
          workLog?.observe({ documentId: revision.documentId, revision: revision.revision, ...revision.history });
          notes?.refresh().catch((error: unknown) => {
            log(`notes could not be read: ${(error as Error).message}`);
          });
        },
      },
    );

    bridge.handle(invokeChannels.appInfo, () => ({
      name: app.getName(),
      version: app.getVersion(),
      locale: app.getLocale(),
      platform: process.platform === 'win32' || process.platform === 'darwin' ? process.platform : 'linux',
    }));
    bridge.handle(invokeChannels.solidcraftStatus, () => supervisor.status());
    bridge.handle(invokeChannels.solidcraftRetry, () => {
      supervisor.retry();
      return undefined;
    });
    bridge.handle(invokeChannels.solidcraftStart, () => {
      supervisor.startSolidCraft();
      return undefined;
    });
    bridge.handle(invokeChannels.mirrorCurrent, () => supervisor.currentRevision());

    const secrets = new SecretStore();
    let noteKey: Buffer;
    try {
      noteKey = loadNoteKey(secrets);
    } catch (error) {
      // Without the credential store the key lasts for this run; notes count as foreign after a restart.
      log(`the note key could not be kept: ${(error as Error).message}`);
      noteKey = randomBytes(32);
    }
    const notesService = new NotesService({
      design: {
        read: () => supervisor.readMetadata(),
        write: (values) => supervisor.writeMetadata(values),
        tables: () => supervisor.currentRevision()?.bodies.map((body) => body.faces) ?? [],
        designName: () => supervisor.currentRevision()?.designName ?? '',
      },
      key: noteKey,
      restoreFile: join(app.getPath('userData'), 'notes-restore.json'),
      emit: (state) => {
        bridge.emit(mainWindow?.webContents ?? null, eventChannels.notesChanged, state);
      },
      mention: (text) => workLog?.mention(text),
    });
    notes = notesService;
    bridge.handle(invokeChannels.notesCurrent, () => notesService.state());

    // SolidCraft's MCP tools for the assistant, bridged to the app the supervisor is connected to.
    // What the 3D view shows, as the renderer last reported it (for `partbuddy_view`).
    let viewState: ViewState | null = null;
    bridge.handle(invokeChannels.windowTitleBar, (colors) => {
      if (process.platform !== 'darwin') mainWindow?.setTitleBarOverlay(colors);
      return undefined;
    });
    // The chosen theme drives Chromium's colour scheme, so the tokens and the window buttons follow.
    bridge.handle(invokeChannels.windowTheme, () => appearance.theme());
    bridge.handle(invokeChannels.windowSetTheme, ({ theme }) => {
      appearance.setTheme(theme);
      nativeTheme.themeSource = theme;
      return theme;
    });
    bridge.handle(invokeChannels.viewerState, (state) => {
      viewState = state;
      return undefined;
    });
    const emitEvent = (event: AgentEvent) => {
      bridge.emit(mainWindow?.webContents ?? null, eventChannels.agentEvent, event);
    };
    const steps = new WorkLog({
      history: () => supervisor.history(),
      travel: (command, count) => supervisor.travel(command, count),
      emit: emitEvent,
    });
    workLog = steps;
    // Questions and plans as cards (M2a); changes wait until the user answered.
    const questions = new Questions(emitEvent);
    // The model reads notes only through PartBuddy; results lose the note data, undo may not take a note (ADR 0020).
    const track = (upstream: UpstreamTools) =>
      questions.tools(steps.tools(withViewTool(guardNotes(upstream, (trial) => supervisor.trialSteps(trial)), () => viewState, () => notesService.forView())));
    let toolsCache: { port: number; tools: UpstreamTools; close(): Promise<void> } | null = null;
    const tools = async () => {
      const headless = supervisor.headlessTools();
      if (headless) return track(headless);
      const port = supervisor.connectedPort();
      const executable = findExecutable(systemEnvironment);
      if (port === null || !executable) return null;
      if (toolsCache?.port !== port) {
        await toolsCache?.close();
        const next = new SolidCraftTools({ solidcraftExe: executable, port, allowPath: projects, env: process.env });
        await next.connect();
        toolsCache = { port, tools: track(next), close: () => next.close() };
      }
      return toolsCache.tools;
    };
    let assistant: Assistant | null = null;
    const changed = () => assistant?.changed();
    // The user's choice to allow API billing for Claude Code (off by default), kept per installation.
    const assistantSettings = join(app.getPath('userData'), 'assistant-settings.json');
    const apiBilling = {
      get: (): boolean => {
        try {
          return (JSON.parse(readFileSync(assistantSettings, 'utf8')) as { claudeApiBilling?: unknown }).claudeApiBilling === true;
        } catch {
          return false;
        }
      },
      set: (allow: boolean) => {
        writeFileSync(assistantSettings, JSON.stringify({ claudeApiBilling: allow }));
      },
    };
    const claude = new AgentService(
      { env: process.env, home: homedir(), workDir: join(app.getPath('userData'), 'agent'), apiBilling, log, tools },
      { status: changed, event: emitEvent },
    );
    // ChatGPT tokens live only in the Windows credential store (ADR 0011, ADR 0015).
    const account = new ChatGptAccount({
      store: secrets,
      hostId: () => hostId(join(app.getPath('userData'), 'chatgpt-host-id')),
      openBrowser: async (url) => {
        if (!url.startsWith('https://auth.openai.com/')) throw new Error('refused to open an unexpected sign-in address');
        await shell.openExternal(url);
      },
      onStatus: changed,
    });
    account.load();
    const chatgpt = new ChatGptAgent({ account, tools, event: emitEvent, changed, log });
    assistant = new Assistant({ 'claude-code': claude, chatgpt }, (state) => {
      bridge.emit(mainWindow?.webContents ?? null, eventChannels.agentStatus, state);
    });
    const agent = assistant;
    bridge.handle(invokeChannels.agentStatus, () => agent.state());
    bridge.handle(invokeChannels.agentRefresh, () => agent.refresh());
    bridge.handle(invokeChannels.agentSelect, ({ agent: kind }) => {
      // The other route starts its own conversation, without the open question.
      questions.clear();
      return agent.select(kind);
    });
    bridge.handle(invokeChannels.agentAllowApiBilling, async ({ allow }) => {
      await claude.allowApiBilling(allow);
      return agent.state();
    });
    bridge.handle(invokeChannels.agentSend, async ({ text, selections, answer, drawing }) => {
      const lines = [
        // Once after a restart: what the earlier conversation about this design was about.
        chats?.takeDigest() ?? null,
        questions.answer(answer),
        steps.takeNote(),
        notesService.selectionNote(selections ?? []),
        // Strokes on the view as words (M2b-2, ADR 0020); a picture only when the user ticked it.
        drawing ? describeDrawing(drawing.strokes, drawing.image !== undefined) : null,
      ].filter((line): line is string => line !== null);
      const sent = drawing ? { strokes: drawing.strokes.length, image: drawing.image ?? null } : null;
      await agent.send(text, selections, lines.length > 0 ? lines.join('\n') : null, sent);
      return undefined;
    });
    bridge.handle(invokeChannels.agentStop, async () => {
      await agent.stop();
      return undefined;
    });
    bridge.handle(invokeChannels.agentSignIn, () => {
      agent.signIn();
      return undefined;
    });
    bridge.handle(invokeChannels.agentSignOut, async () => {
      await agent.signOut();
      return undefined;
    });
    void agent.refresh();

    // The user's own actions on the design (ADR 0016). They wait while the assistant works, so
    // the two never change the design at the same time.
    const assistantIdle = () => {
      if (agent.state().agents.some((status) => status.state === 'busy')) throw new Error('the assistant is working on the design');
    };
    bridge.handle(invokeChannels.designUndo, async () => {
      assistantIdle();
      await steps.userHistory('undo', () => supervisor.undo());
      return undefined;
    });
    bridge.handle(invokeChannels.designRedo, async () => {
      assistantIdle();
      await steps.userHistory('redo', () => supervisor.redo());
      return undefined;
    });
    bridge.handle(invokeChannels.designExport, async ({ format }) => {
      const name = safeDesignFileName(supervisor.currentRevision()?.designName ?? '');
      const options = { title: 'Export', defaultPath: join(projects, `${name}.${format}`), filters: [EXPORT_FILTERS[format]] };
      const choice = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
      if (choice.canceled || !choice.filePath) return null;
      await supervisor.exportDesign(format, choice.filePath);
      log(`exported the design as ${format}`);
      return { file: basename(choice.filePath) };
    });
    bridge.handle(invokeChannels.designProbeDimension, ({ target, current, value }) => {
      assistantIdle();
      return supervisor.probeDimension(target, current, value);
    });
    bridge.handle(invokeChannels.designApplyDimension, async ({ parameter, value, factor, label }) => {
      assistantIdle();
      await steps.recordUser(describeUserAction({ kind: 'dimension', parameter: label ?? parameter, value: value * factor }), () => supervisor.applyDimension(parameter, value, factor));
      log('changed a dimension directly');
      return undefined;
    });
    bridge.handle(invokeChannels.designPreviewAction, (action) => {
      assistantIdle();
      return supervisor.previewAction(action);
    });
    bridge.handle(invokeChannels.designApplyAction, async (action) => {
      assistantIdle();
      const phrase = describeUserAction({
        kind: 'action',
        action: action.action,
        size: action.size,
        count: action.points.length,
        depth: action.action === 'hole' ? action.depth : undefined,
      });
      await steps.recordUser(phrase, () => supervisor.applyAction(action));
      log(`applied ${action.action} directly`);
      return undefined;
    });
    bridge.handle(invokeChannels.designMeasure, ({ items }) => supervisor.measure(items));
    bridge.handle(invokeChannels.designTimeline, async (command) => {
      assistantIdle();
      const phrase =
        command.action === 'rollTo'
          ? describeUserAction({ kind: 'rollTo', position: command.position })
          : describeUserAction({ kind: 'suppress', suppressed: command.suppressed });
      await steps.recordUser(phrase, () => supervisor.timeline(command));
      return undefined;
    });
    bridge.handle(invokeChannels.designGoToStep, async ({ step }) => {
      assistantIdle();
      await steps.goTo(step);
      log('went back to a step of the work log');
      return undefined;
    });
    bridge.handle(invokeChannels.designDimensions, ({ features }) => supervisor.dimensionMarks(features));
    bridge.handle(invokeChannels.designParameters, () => supervisor.parameters());
    const chatArchive = new ChatArchive({ designFile: () => supervisor.designPath(), log });
    chats = chatArchive;
    bridge.handle(invokeChannels.chatLoad, () => chatArchive.load());
    bridge.handle(invokeChannels.chatSave, ({ items }) => {
      chatArchive.save(items);
      return undefined;
    });
    bridge.handle(invokeChannels.designProbeParameter, ({ parameter, value, body }) => {
      assistantIdle();
      return supervisor.probeParameter(parameter, value, body);
    });
    bridge.handle(invokeChannels.designVisibility, async (command) => {
      await supervisor.visibility(command);
      return undefined;
    });
    // The user's notes (M2b); like every change of the design they wait while the assistant works.
    bridge.handle(invokeChannels.notesAdd, async ({ selection, text }) => {
      assistantIdle();
      await notesService.add(selection, text);
      return undefined;
    });
    bridge.handle(invokeChannels.notesEdit, async ({ id, text }) => {
      assistantIdle();
      await notesService.edit(id, text);
      return undefined;
    });
    bridge.handle(invokeChannels.notesDelete, async ({ id }) => {
      assistantIdle();
      await notesService.remove(id);
      return undefined;
    });
    bridge.handle(invokeChannels.notesAccept, async ({ id }) => {
      assistantIdle();
      await notesService.accept(id);
      return undefined;
    });
    bridge.handle(invokeChannels.notesReattach, async ({ id, selection }) => {
      assistantIdle();
      await notesService.reattach(id, selection);
      return undefined;
    });
    bridge.handle(invokeChannels.notesRestore, async ({ id }) => {
      assistantIdle();
      await notesService.restoreNote(id);
      return undefined;
    });
    bridge.handle(invokeChannels.notesDismiss, async ({ id }) => {
      await notesService.dismiss(id);
      return undefined;
    });
    bridge.handle(invokeChannels.designOpenInSolidCraft, async () => {
      assistantIdle();
      await supervisor.openInSolidCraft();
      return undefined;
    });

    mainWindow = createWindow();
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
    supervisor.start();

    let quitting = false;
    app.on('before-quit', (event) => {
      if (quitting) return;
      quitting = true;
      event.preventDefault();
      void Promise.allSettled([agent.dispose(), toolsCache?.close()])
        .then(() => supervisor.shutdown())
        .finally(() => {
          app.quit();
        });
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
