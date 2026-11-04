import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, BrowserWindow, dialog, ipcMain, net, protocol, screen, session, shell } from 'electron';

import { invokeChannels, eventChannels } from '../shared/channels';
import type { AgentEvent, ExportFormat, ViewState } from '../shared/contract';
import { AgentService } from './agents/agentService';
import { Assistant } from './agents/assistant';
import { SolidCraftTools } from './agents/solidcraftTools';
import type { UpstreamTools } from './agents/gateProxy';
import { withViewTool } from './agents/viewContext';
import { ChatGptAccount } from './chatgpt/account';
import { ChatGptAgent } from './chatgpt/chatgptAgent';
import { hostId } from './chatgpt/oauth';
import { SecretStore } from './credentials/secretStore';
import { Bridge, trustedSender } from './bridge';
import { findExecutable, systemEnvironment } from './solidcraft/discovery';
import { safeDesignFileName } from './solidcraft/headless';
import { SolidCraftSupervisor } from './solidcraft/supervisor';

app.setName('PartBuddy');

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

/**
 * Test runs open the window on the leftmost display and without focus, so they do not cover the
 * developer's main screen or take the keyboard (PARTBUDDY_WINDOW_DISPLAY=leftmost, set by the E2E
 * launcher). The app itself opens where the system puts it.
 */
function testPlacement(): { x: number; y: number } | null {
  if (process.env.PARTBUDDY_WINDOW_DISPLAY !== 'leftmost') return null;
  const [leftmost] = [...screen.getAllDisplays()].sort((a, b) => a.bounds.x - b.bounds.x);
  return leftmost ? { x: leftmost.workArea.x + 24, y: leftmost.workArea.y + 24 } : null;
}

function createWindow(): BrowserWindow {
  const placement = testPlacement();
  const window = new BrowserWindow({
    ...(placement ?? {}),
    width: 1440,
    height: 900,
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

    const bridge = new Bridge(ipcMain, trustedSender(() => mainWindow?.webContents.id, rendererOrigin), !app.isPackaged);
    // The user's project folder: the only place the assistant's SolidCraft may read and write.
    // PARTBUDDY_PROJECTS_DIR: tests keep the user's documents untouched.
    const projects = process.env.PARTBUDDY_PROJECTS_DIR ?? join(app.getPath('documents'), 'PartBuddy');
    mkdirSync(projects, { recursive: true });
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
        },
        revision: (revision) => {
          bridge.emit(mainWindow?.webContents ?? null, eventChannels.mirrorRevision, revision);
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

    // SolidCraft's MCP tools for the assistant, bridged to the app the supervisor is connected to.
    // What the 3D view shows, as the renderer last reported it (for `partbuddy_view`).
    let viewState: ViewState | null = null;
    bridge.handle(invokeChannels.windowTitleBar, (colors) => {
      if (process.platform !== 'darwin') mainWindow?.setTitleBarOverlay(colors);
      return undefined;
    });
    bridge.handle(invokeChannels.viewerState, (state) => {
      viewState = state;
      return undefined;
    });
    let toolsCache: { port: number; tools: UpstreamTools; close(): Promise<void> } | null = null;
    const tools = async () => {
      const headless = supervisor.headlessTools();
      if (headless) return withViewTool(headless, () => viewState);
      const port = supervisor.connectedPort();
      const executable = findExecutable(systemEnvironment);
      if (port === null || !executable) return null;
      if (toolsCache?.port !== port) {
        await toolsCache?.close();
        const next = new SolidCraftTools({ solidcraftExe: executable, port, allowPath: projects, env: process.env });
        await next.connect();
        toolsCache = { port, tools: withViewTool(next, () => viewState), close: () => next.close() };
      }
      return toolsCache.tools;
    };
    const emitEvent = (event: AgentEvent) => {
      bridge.emit(mainWindow?.webContents ?? null, eventChannels.agentEvent, event);
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
      store: new SecretStore(),
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
    bridge.handle(invokeChannels.agentSelect, ({ agent: kind }) => agent.select(kind));
    bridge.handle(invokeChannels.agentAllowApiBilling, async ({ allow }) => {
      await claude.allowApiBilling(allow);
      return agent.state();
    });
    bridge.handle(invokeChannels.agentSend, async ({ text, selection }) => {
      await agent.send(text, selection);
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
      await supervisor.undo();
      return undefined;
    });
    bridge.handle(invokeChannels.designRedo, async () => {
      assistantIdle();
      await supervisor.redo();
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
    bridge.handle(invokeChannels.designApplyDimension, async ({ parameter, value, factor }) => {
      assistantIdle();
      await supervisor.applyDimension(parameter, value, factor);
      log('changed a dimension directly');
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
