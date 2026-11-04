import { useEffect } from 'react';

import { platform } from '../platform';
import { useAssistant } from './store';

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
