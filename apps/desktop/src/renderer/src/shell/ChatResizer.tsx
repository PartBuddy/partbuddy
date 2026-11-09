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

/** Width limits of the structure panel on the left (audit N-09). */
export const MIN_SIDE_WIDTH = 200;
export const MAX_SIDE_WIDTH = 480;
export const DEFAULT_SIDE_WIDTH = 240;
const SIDE_KEY = 'partbuddy.sideWidth';

/** The structure panel's width, dragged by the user and remembered for the next start. */
export function useSideWidth(): [number, (width: number) => void] {
  const [width, setWidth] = useState(() => {
    try {
      const stored = Number(window.localStorage.getItem(SIDE_KEY));
      return stored > 0 ? Math.min(MAX_SIDE_WIDTH, Math.max(MIN_SIDE_WIDTH, stored)) : DEFAULT_SIDE_WIDTH;
    } catch {
      return DEFAULT_SIDE_WIDTH;
    }
  });
  const set = (next: number) => {
    const clamped = Math.round(Math.min(MAX_SIDE_WIDTH, Math.max(MIN_SIDE_WIDTH, next)));
    setWidth(clamped);
    try {
      window.localStorage.setItem(SIDE_KEY, String(clamped));
    } catch {
      // Without storage the width lasts until the window closes.
    }
  };
  return [width, set];
}

/**
 * The handle on a panel's inner edge: drag it, use the arrow keys (Shift for bigger steps), Home
 * and End, or double-click to go back to the standard width. A window splitter in the WAI-ARIA
 * sense: a focusable separator with its value. On the chat (`edge` left) moving left widens it;
 * on the structure panel (`edge` right) moving right does.
 */
export function ChatResizer({
  width,
  max,
  onChange,
  edge = 'left',
  min = MIN_CHAT_WIDTH,
  standard = DEFAULT_CHAT_WIDTH,
  label,
  testId = 'chat-resizer',
}: {
  width: number;
  max: number;
  onChange: (width: number) => void;
  edge?: 'left' | 'right';
  min?: number;
  standard?: number;
  label?: string;
  testId?: string;
}) {
  const { t } = useTranslation();
  const grow = edge === 'left' ? -1 : 1;
  const drag = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label ?? t('assistant.resize')}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      data-testid={testId}
      title={t('assistant.resizeHint')}
      className={`group absolute inset-y-0 ${edge === 'left' ? '-left-1' : '-right-1'} z-10 flex w-2 cursor-col-resize touch-none justify-center outline-none focus-visible:focus-ring ${dragging ? 'bg-accent-subtle' : ''}`}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { x: event.clientX, width };
        setDragging(true);
      }}
      onPointerMove={(event) => {
        if (drag.current) onChange(drag.current.width + grow * (event.clientX - drag.current.x));
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
        onChange(standard);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? KEY_STEP * 4 : KEY_STEP;
        if (event.key === 'ArrowLeft') onChange(width - grow * step);
        else if (event.key === 'ArrowRight') onChange(width + grow * step);
        else if (event.key === 'Home') onChange(min);
        else if (event.key === 'End') onChange(max);
        else if (event.key === 'Enter') onChange(standard);
        else return;
        event.preventDefault();
      }}
    >
      <span aria-hidden className={`h-full rounded-full transition-[width,background-color] ${dragging ? 'w-1 bg-accent' : 'w-px bg-transparent group-hover:w-1 group-hover:bg-accent group-focus-visible:w-1 group-focus-visible:bg-accent'}`} />
    </div>
  );
}
