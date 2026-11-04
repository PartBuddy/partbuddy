import { useEffect } from 'react';

import { platform } from '../platform';
import { useStudio } from '../state/store';

/** Keeps the store's notes in step with the main process (M2b, ADR 0020). */
export function useNotesBridge(): void {
  const setNotes = useStudio((s) => s.setNotes);
  useEffect(() => {
    const api = platform().notes;
    const off = api.onChange(setNotes);
    void api
      .current()
      .then(setNotes)
      .catch(() => undefined);
    return off;
  }, [setNotes]);
}
