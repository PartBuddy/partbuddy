import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, BrowserWindow, ipcMain, net, protocol, session, shell } from 'electron';

import { invokeChannels, eventChannels } from '../shared/channels';
import type { AgentEvent, ViewState } from '../shared/contract';
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

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'PartBuddy',
    autoHideMenuBar: true,
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
    window.show();
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
    const projects = join(app.getPath('documents'), 'PartBuddy');
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
        allowPaths: [projects],
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
