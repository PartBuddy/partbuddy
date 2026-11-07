import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** How far from the end still counts as "at the newest message". */
const NEAR_END = 32;
/** How long a project's saved position waits for its conversation to come back. */
const RESTORE_WAIT_MS = 2000;

/** Where each project's chat was left: a scroll offset, or null at the newest message. */
const positions = new Map<string, number | null>();

const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Scrolling of the chat (chat polish): it stays at the newest message while the user is there,
 * also while words stream in or a picture loads; scrolled up, it stays put and offers a way back.
 * Each project keeps its position for the next time it opens in this window.
 */
export function useChatScroll(documentId: string | null) {
  const list = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const jumping = useRef(false);
  // Only the user's own scrolling lets go of the end; content that grows or shrinks never does.
  const userScrolls = useRef(false);
  // A project's saved position, applied once its conversation is long enough to hold it.
  const pending = useRef<number | null>(null);
  const project = useRef<string | null>(null);
  const [atEnd, setAtEnd] = useState(true);

  const toEnd = useCallback((smooth = false) => {
    const element = list.current;
    if (!element) return;
    stick.current = true;
    pending.current = null;
    setAtEnd(true);
    jumping.current = smooth && !reducedMotion();
    element.scrollTo({ top: element.scrollHeight, behavior: jumping.current ? 'smooth' : 'auto' });
  }, []);

  // Another project: back to where its chat was left, or to its newest message.
  useLayoutEffect(() => {
    if (!documentId || documentId === project.current) return;
    project.current = documentId;
    const saved = positions.get(documentId) ?? null;
    pending.current = saved;
    stick.current = saved === null;
    setAtEnd(saved === null);
    if (saved === null) return;
    // shortcut: a conversation that never grows long enough gives up its old position after a wait.
    const timer = setTimeout(() => {
      pending.current = null;
    }, RESTORE_WAIT_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [documentId]);

  useEffect(() => {
    const element = list.current;
    const inner = content.current;
    if (!element || !inner) return;
    const follow = () => {
      if (pending.current !== null) {
        if (element.scrollHeight - element.clientHeight < pending.current) return;
        element.scrollTop = pending.current;
        pending.current = null;
        return;
      }
      if (stick.current && !jumping.current) element.scrollTop = element.scrollHeight;
    };
    const observer = new ResizeObserver(follow);
    observer.observe(inner);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);

  const measure = () => {
    const element = list.current;
    if (!element || pending.current !== null || jumping.current) return;
    const end = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_END;
    if (end) stick.current = true;
    else if (userScrolls.current) stick.current = false;
    setAtEnd(end);
    if (project.current) positions.set(project.current, stick.current ? null : element.scrollTop);
  };
  const intent = () => {
    userScrolls.current = true;
  };
  // The scrollbar is grabbed on the list itself; a click on its content is no scrolling.
  const grab = (event: React.PointerEvent) => {
    if (event.target === event.currentTarget) intent();
  };
  const key = (event: React.KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key)) intent();
  };
  const onScrollEnd = () => {
    if (jumping.current) {
      jumping.current = false;
      // The end may have moved while the smooth jump ran.
      if (list.current) list.current.scrollTop = list.current.scrollHeight;
    }
    measure();
    userScrolls.current = false;
  };

  /** Spread on the scrolling element. */
  const handlers = { onScroll: measure, onScrollEnd, onWheel: intent, onTouchStart: intent, onPointerDown: grab, onKeyDown: key };
  return { list, content, atEnd, toEnd, handlers };
}
