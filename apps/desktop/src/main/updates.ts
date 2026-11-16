import { app, net, shell } from 'electron';
import { autoUpdater } from 'electron-updater';

import type { UpdateState } from '../shared/contract';
import { compareVersions } from './solidcraft/engineVersion';

const LATEST_RELEASE = 'https://api.github.com/repos/PartBuddy/partbuddy/releases/latest';

/** The newer version in a GitHub "latest release" answer, null when it is not newer or not readable. */
export function newerRelease(release: unknown, installed: string): { version: string; page: string } | null {
  if (typeof release !== 'object' || release === null) return null;
  const { tag_name: tag, html_url: page } = release as { tag_name?: unknown; html_url?: unknown };
  if (typeof tag !== 'string' || typeof page !== 'string' || !page.startsWith('https://github.com/')) return null;
  const version = tag.replace(/^v/, '').slice(0, 40);
  try {
    return compareVersions(version, installed) > 0 ? { version, page } : null;
  } catch {
    return null;
  }
}

/**
 * Updates through the GitHub releases of the repository (plan step B10, electron-updater). PartBuddy
 * looks once after the start and when the user asks; it downloads and installs only on the user's
 * word. Only the installed app checks: a development build and the tests never do.
 */
export class Updates {
  private state: UpdateState = { state: 'idle' };
  private readonly listeners = new Set<(state: UpdateState) => void>();
  /** macOS: the release page of the newer version, opened instead of a download. */
  private releasePage: string | null = null;

  constructor(private readonly log: (message: string) => void) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('checking-for-update', () => this.set({ state: 'checking' }));
    autoUpdater.on('update-available', (info) => this.set({ state: 'available', version: info.version.slice(0, 40) }));
    autoUpdater.on('update-not-available', () => this.set({ state: 'current', version: app.getVersion() }));
    autoUpdater.on('download-progress', (progress) => this.set({ state: 'downloading', percent: Math.max(0, Math.min(100, Math.round(progress.percent))) }));
    autoUpdater.on('update-downloaded', (info) => this.set({ state: 'ready', version: info.version.slice(0, 40) }));
    autoUpdater.on('error', (error) => {
      this.log(`update check failed: ${error.message.slice(0, 300)}`);
      this.set({ state: 'error' });
    });
  }

  /** Whether this build looks for new versions: the installed app, unless the environment says no. */
  get enabled(): boolean {
    return app.isPackaged && process.env.PARTBUDDY_UPDATES !== '0';
  }

  /** macOS: the test build is signed ad hoc and no release carries a latest-mac.yml, so it only tells of a new version. */
  private get notifyOnly(): boolean {
    return process.platform === 'darwin';
  }

  current(): UpdateState {
    return this.enabled ? this.state : { state: 'unavailable' };
  }

  onChange(listener: (state: UpdateState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async check(): Promise<UpdateState> {
    if (!this.enabled) return this.current();
    if (this.notifyOnly) {
      await this.checkRelease();
      return this.current();
    }
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // Reported through the error event.
    }
    return this.current();
  }

  async download(): Promise<void> {
    if (!this.enabled || this.state.state !== 'available') return;
    if (this.notifyOnly) {
      if (this.releasePage) await shell.openExternal(this.releasePage);
      return;
    }
    await autoUpdater.downloadUpdate();
  }

  /** Quits and runs the downloaded installer; PartBuddy starts again afterwards. */
  install(): void {
    if (this.enabled && !this.notifyOnly && this.state.state === 'ready') autoUpdater.quitAndInstall(false, true);
  }

  private async checkRelease(): Promise<void> {
    this.set({ state: 'checking' });
    try {
      const response = await net.fetch(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      const newer = newerRelease(await response.json(), app.getVersion());
      this.releasePage = newer?.page ?? null;
      this.set(newer ? { state: 'available', version: newer.version } : { state: 'current', version: app.getVersion() });
    } catch (error) {
      this.log(`update check failed: ${(error as Error).message.slice(0, 300)}`);
      this.set({ state: 'error' });
    }
  }

  private set(state: UpdateState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
