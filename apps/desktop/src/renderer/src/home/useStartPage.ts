import { useEffect } from 'react';

import { platform } from '../platform';
import { useStudio } from '../state/store';

/**
 * PartBuddy opens on the start page and no project on its own (B3, decided 2026-11-05): the store
 * starts with the page open, so it shows from the first frame. Only when the main process says it
 * starts in the work area (tests) does it close.
 */
export function useStartPage(): void {
  useEffect(() => {
    void platform()
      .appInfo()
      .then((info) => {
        if (!info.startOnHome) useStudio.getState().setHomeOpen(false);
      })
      .catch(() => undefined);
  }, []);
}
