import { useEffect } from 'react';

import { platform } from '../platform';
import { useStudio } from '../state/store';
import { toStored, useAssistant } from './store';

/** Quiet time before the conversation is written next to the design. */
const SAVE_DELAY_MS = 1000;
/** The saved conversation comes back once per app start, even when the effect runs twice. */
let restored = false;

/**
 * Keeps the conversation with the design (decided 2026-11-05): once the first design is on
 * screen, the conversation saved with it comes back above anything new; after that every change
 * is written next to the design file, a second after the chat went quiet.
 */
export function useChatPersistence(): void {
  // Loaded once per app start, with the first design; later designs keep the open conversation.
  const ready = useStudio((s) => s.model.status === 'ready');
  useEffect(() => {
    if (!ready) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let off: (() => void) | null = null;
    void platform()
      .chat.load()
      .catch(() => null)
      .then((chat) => {
        if (!live) return;
        if (chat && !restored) useAssistant.getState().restore(chat);
        restored = true;
        // Saving starts only now, so an empty chat never overwrites the saved one.
        off = useAssistant.subscribe((state, previous) => {
          if (state.items === previous.items || state.items.length === 0) return;
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            void platform().chat.save(toStored(useAssistant.getState().items)).catch(() => undefined);
          }, SAVE_DELAY_MS);
        });
      });
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
      off?.();
    };
  }, [ready]);
}

/** Follows the agent status and event stream from the main process. */
export function useAssistantBridge(): void {
  useEffect(() => {
    const api = platform().agent;
    const offStatus = api.onStatus((status) => {
      useAssistant.getState().setState(status);
    });
    const offEvent = api.onEvent((event) => {
      useAssistant.getState().apply(event);
    });
    void api.status().then((status) => {
      useAssistant.getState().setState(status);
    });
    return () => {
      offStatus();
      offEvent();
    };
  }, []);
}
