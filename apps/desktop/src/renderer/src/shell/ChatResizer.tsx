import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { clampChatWidth, DEFAULT_CHAT_WIDTH, maxChatWidth, MIN_CHAT_WIDTH } from './chatWidth';

const KEY_STEP = 16;
/** Kept in the renderer's localStorage, which lives in the user's profile folder. */
const STORAGE_KEY = 'partbuddy.chatWidth';

function loadChatWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(STORAGE_KEY));
    return stored > 0 ? stored : DEFAULT_CHAT_WIDTH;
  } catch {
    return DEFAULT_CHAT_WIDTH;
  }
}

function saveChatWidth(width: number): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Math.round(width)));
  } catch {
    // Without storage the width lasts until the window closes.
  }
}

/** The chat's width, kept inside what the window allows and remembered for the next start. */
export function useChatWidth(): [number, (width: number) => void, number] {
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  const [wanted, setWanted] = useState(loadChatWidth);
  useEffect(() => {
    const onResize = () => {
      setWindowWidth(window.innerWidth);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
    };
  }, []);
  const set = (width: number) => {
    const next = clampChatWidth(width, window.innerWidth);
    setWanted(next);
    saveChatWidth(next);
  };
  return [clampChatWidth(wanted, windowWidth), set, maxChatWidth(windowWidth)];
}

/**
 * The handle on the chat's left edge: drag it, use the arrow keys (Shift for bigger steps), Home
 * and End, or double-click to go back to the standard width. A window splitter in the WAI-ARIA
 * sense: a focusable separator with its value.
 */
export function ChatResizer({ width, max, onChange }: { width: number; max: number; onChange: (width: number) => void }) {
  const { t } = useTranslation();
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t('assistant.resize')}
      aria-valuenow={width}
      aria-valuemin={MIN_CHAT_WIDTH}
      aria-valuemax={max}
      tabIndex={0}
      data-testid="chat-resizer"
      title={t('assistant.resizeHint')}
      className={`group absolute inset-y-0 -left-1 z-10 flex w-2 cursor-col-resize touch-none justify-center outline-none focus-visible:focus-ring ${dragging ? 'bg-accent-subtle' : ''}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        // The handle is on the chat's left edge: moving left makes the chat wider.
        if (drag.current) onChange(drag.current.width + drag.current.x - event.clientX);
      }}
      onPointerUp={() => {
        drag.current = null;
        setDragging(false);
      }}
      onPointerCancel={() => {
        drag.current = null;
        setDragging(false);
      }}
      onDoubleClick={() => {
        onChange(DEFAULT_CHAT_WIDTH);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
        if (event.key === 'ArrowLeft') onChange(width + step);
        else if (event.key === 'ArrowRight') onChange(width - step);
        else if (event.key === 'Home') onChange(MIN_CHAT_WIDTH);
        else if (event.key === 'End') onChange(max);
        else if (event.key === 'Enter') onChange(DEFAULT_CHAT_WIDTH);
        else return;
        event.preventDefault();
      }}
    >
      <span aria-hidden className={`h-full rounded-full transition-[width,background-color] ${dragging ? 'w-1 bg-accent' : 'w-px bg-transparent group-hover:w-1 group-hover:bg-accent group-focus-visible:w-1 group-focus-visible:bg-accent'}`} />
    </div>
  );
}
