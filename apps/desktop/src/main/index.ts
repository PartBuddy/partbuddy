import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { app, BrowserWindow, ipcMain, net, protocol, session, shell } from 'electron';

import { invokeChannels, eventChannels } from '../shared/channels';
import { Bridge, trustedSender } from './bridge';
import { systemEnvironment } from './solidcraft/discovery';
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
    const supervisor = new SolidCraftSupervisor(
      {
        environment: systemEnvironment,
        launchPort: launchPort(),
        autoStart: process.env.PARTBUDDY_SOLIDCRAFT_AUTOSTART !== '0',
        cacheDir: cacheDirectory(),
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
      void supervisor.shutdown().finally(() => {
        app.quit();
      });
    });
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
