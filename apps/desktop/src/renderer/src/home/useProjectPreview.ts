import { useEffect, useRef } from 'react';

import { platform } from '../platform';
import { useStudio } from '../state/store';
import { renderThumbnail } from '../viewer/thumbnail';

/** Quiet time after a save before the picture is drawn, so a burst of steps gives one picture. */
const PREVIEW_DELAY_MS = 800;

/**
 * Keeps the start page's picture of the open project current (B3): after every revision of a design
 * with bodies, it draws the bodies from the isometric corner and hands the picture, with the
 * ready-to-print light of the same revision, to the main process, which puts it into the project.
 */
export function useProjectPreview(): void {
  const model = useStudio((s) => s.model);
  const save = useStudio((s) => s.connection.save);
  const check = useStudio((s) => s.printCheck);
  const sent = useRef<string | null>(null);
  useEffect(() => {
    // Also a design that was only opened or just made from a template, which is never saved: it got no
    // picture before (polish round 3). Only a save under way or a failed one waits.
    if (model.status !== 'ready' || save === 'saving' || save === 'failed' || model.bodies.length === 0) return;
    // Green only once all is measured (audit X-1): still measuring is no light yet, a measure that failed is yellow.
    const current = check && check.documentId === model.documentId && check.revision === model.revision && !check.measuring ? check : null;
    const light = !current ? null : current.result.status === 'ready' && (current.unmeasured?.length ?? 0) > 0 ? 'warn' : current.result.status;
    const key = `${model.documentId}:${String(model.revision)}:${light ?? ''}`;
    if (sent.current === key) return;
    const timer = setTimeout(() => {
      const png = renderThumbnail(model.bodies);
      if (!png) return;
      sent.current = key;
      void platform()
        .project.savePreview({ documentId: model.documentId, revision: model.revision, png, check: light })
        .catch(() => undefined);
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [model, save, check]);
}
