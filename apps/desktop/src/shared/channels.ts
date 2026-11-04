/**
 * Names of every channel between renderer and main process (ADR 0013). Kept free of schema code
 * so the sandboxed preload stays small; the schemas live in `contract.ts`.
 */
export const invokeChannels = {
  appInfo: 'app:info',
  solidcraftStatus: 'solidcraft:status',
  solidcraftRetry: 'solidcraft:retry',
  solidcraftStart: 'solidcraft:start',
  mirrorCurrent: 'mirror:current',
} as const;

export const eventChannels = {
  solidcraftStatus: 'solidcraft:status-changed',
  mirrorRevision: 'mirror:revision',
} as const;

export type InvokeChannel = (typeof invokeChannels)[keyof typeof invokeChannels];
export type EventChannel = (typeof eventChannels)[keyof typeof eventChannels];
