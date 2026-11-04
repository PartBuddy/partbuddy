import type { PartBuddyApi } from '../../shared/api';

declare global {
  interface Window {
    /** Exposed by the preload bridge (ADR 0013); the renderer uses no Electron API directly. */
    partbuddy?: PartBuddyApi;
  }
}

/**
 * The renderer's only access to the main process (ADR 0002: a thin platform adapter, so a later
 * move away from Electron changes the main-process layer only).
 */
export function platform(): PartBuddyApi {
  const api = window.partbuddy;
  if (!api) throw new Error('PartBuddy bridge is missing; the renderer runs outside the app');
  return api;
}
