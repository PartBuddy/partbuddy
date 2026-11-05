import { useEffect } from 'react';

import { platform } from '../platform';
import { useStudio } from '../state/store';

/**
 * Keeps the printer and the open part's material (M7) in the store: read again whenever another
 * design is on screen, and pushed by the main process after every change.
 */
export function usePrintBridge(): void {
  const documentId = useStudio((s) => (s.model.status === 'ready' ? s.model.documentId : null));
  useEffect(() => {
    let live = true;
    void platform()
      .print.part()
      .then((part) => {
        if (live) useStudio.getState().setPrint(part);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [documentId]);
  useEffect(
    () =>
      platform().print.onChange((part) => {
        useStudio.getState().setPrint(part);
      }),
    [],
  );
}
