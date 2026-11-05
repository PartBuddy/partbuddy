/**
 * Width of the assistant panel (UI upgrade, chat): the user drags it between a narrow chat and
 * half the window; the 3D view keeps at least `MIN_VIEW` pixels beside it and the structure panel.
 * Pure; ChatResizer remembers the width per user profile.
 */

export const DEFAULT_CHAT_WIDTH = 420;
export const MIN_CHAT_WIDTH = 320;
export const MAX_CHAT_WIDTH = 760;
/** What the structure panel and the 3D view need at least beside the chat. */
const MIN_VIEW = 240 + 480;

/** The width the panel can take in a window this wide. */
export function clampChatWidth(width: number, windowWidth: number): number {
  const max = Math.max(MIN_CHAT_WIDTH, Math.min(MAX_CHAT_WIDTH, windowWidth - MIN_VIEW));
  if (!Number.isFinite(width)) return Math.min(DEFAULT_CHAT_WIDTH, max);
  return Math.round(Math.min(max, Math.max(MIN_CHAT_WIDTH, width)));
}
