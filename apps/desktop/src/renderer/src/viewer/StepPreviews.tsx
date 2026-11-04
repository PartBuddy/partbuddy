import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';

import { useAssistant, type ChangedFaces } from '../assistant/store';
import { useStudio } from '../state/store';

/** Size of a work-log picture in pixels (16:10, sharp enough for high-DPI cards). */
const PREVIEW_WIDTH = 224;
const PREVIEW_HEIGHT = 140;
const PREVIEW_QUALITY = 0.8;
/** A view that just appeared frames its camera first; pictures wait this long after it. */
const SETTLE_MS = 600;

/** The faces the newest revision changed, by body and face name. */
function changedFaces(): ChangedFaces[] {
  const { model, changes } = useStudio.getState();
  if (model.status !== 'ready' || !changes) return [];
  return changes.bodies.flatMap((entry) => {
    const body = model.bodies[entry.body];
    if (!body) return [];
    const faces = entry.faces.flatMap((index) => body.model.table.faces[index]?.name ?? []);
    return faces.length > 0 ? [{ body: body.name, faces }] : [];
  });
}

/**
 * Takes the picture of each new work-log step (M2a) from PartBuddy's own view, once the step's
 * revision is on screen: one extra render into a small canvas, no screenshot from SolidCraft.
 * When the mirror skipped the step's revision, the next one stands in for it.
 */
export function StepPreviews() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);

  useEffect(() => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const mountedAt = performance.now();
    const waiting = () => {
      const { model } = useStudio.getState();
      if (model.status !== 'ready') return [];
      return useAssistant
        .getState()
        .items.filter((item) => item.kind === 'step' && item.preview === undefined && item.step.documentId === model.documentId && item.step.revision <= model.revision)
        .map((item) => (item.kind === 'step' ? item.step.id : ''));
    };
    const capture = () => {
      frame = 0;
      const ids = waiting();
      if (ids.length === 0) return;
      let preview: string | null = null;
      try {
        // Drawing right after the render reads the picture before the browser clears it.
        gl.render(scene, camera);
        const source = gl.domElement;
        const canvas = document.createElement('canvas');
        canvas.width = PREVIEW_WIDTH;
        canvas.height = PREVIEW_HEIGHT;
        const context = canvas.getContext('2d');
        if (context && source.width > 0 && source.height > 0) {
          // Crop the middle of the view to the card's 16:10.
          const scale = Math.min(source.width / PREVIEW_WIDTH, source.height / PREVIEW_HEIGHT);
          const width = PREVIEW_WIDTH * scale;
          const height = PREVIEW_HEIGHT * scale;
          context.drawImage(source, (source.width - width) / 2, (source.height - height) / 2, width, height, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
          preview = canvas.toDataURL('image/webp', PREVIEW_QUALITY);
        }
      } catch {
        preview = null;
      }
      const changed = changedFaces();
      for (const id of ids) useAssistant.getState().attachPreview(id, preview, changed);
    };
    // Two frames: the new model's colours are set in an effect and drawn in the next frame.
    const schedule = () => {
      if (frame !== 0 || timer !== null || waiting().length === 0) return;
      const settle = SETTLE_MS - (performance.now() - mountedAt);
      if (settle > 0) {
        timer = setTimeout(() => {
          timer = null;
          schedule();
        }, settle);
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(capture);
      });
    };
    const offAssistant = useAssistant.subscribe(schedule);
    const offStudio = useStudio.subscribe(schedule);
    schedule();
    return () => {
      offAssistant();
      offStudio();
      if (frame !== 0) cancelAnimationFrame(frame);
      if (timer !== null) clearTimeout(timer);
    };
  }, [gl, scene, camera]);

  return null;
}
