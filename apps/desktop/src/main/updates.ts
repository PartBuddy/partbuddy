import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

import type { UpdateState } from '../shared/contract';

/**
 * Updates through the GitHub releases of the repository (plan step B10, electron-updater). PartBuddy
 * looks once after the start and when the user asks; it downloads and installs only on the user's
 * word. Only the installed app checks: a development build and the tests never do.
 */
export class Updates {
  private state: UpdateState = { state: 'idle' };
  private readonly listeners = new Set<(state: UpdateState) => void>();

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

  /** Whether this build can update itself: the installed app, unless the environment says no. */
  get enabled(): boolean {
    return app.isPackaged && process.env.PARTBUDDY_UPDATES !== '0';
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
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      // Reported through the error event.
    }
    return this.current();
  }

  async download(): Promise<void> {
    if (this.enabled && this.state.state === 'available') await autoUpdater.downloadUpdate();
  }

  /** Quits and runs the downloaded installer; PartBuddy starts again afterwards. */
  install(): void {
    if (this.enabled && this.state.state === 'ready') autoUpdater.quitAndInstall(false, true);
  }

  private set(state: UpdateState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
