import type { MessageAnswer, Selection } from '../../../shared/contract';
import { platform } from '../platform';
import { useStudio } from '../state/store';

/**
 * Sends a message to the assistant with what goes along: the selection, and the strokes drawn on
 * the view as words, with a picture of the view only when the user ticked "Send as image"
 * (M2b-2, ADR 0020). The strokes are cleared once they went out.
 */
export async function sendToAssistant(text: string, selections: Selection[] = [], answer?: MessageAnswer): Promise<void> {
  const { strokes, drawingImage, captureView, clearStrokes } = useStudio.getState();
  if (strokes.length === 0) {
    await platform().agent.send(text, selections, answer);
    return;
  }
  const image = drawingImage && captureView ? await captureView().catch(() => null) : null;
  const drawing = { strokes: strokes.map((stroke) => stroke.summary), ...(image ? { image } : {}) };
  clearStrokes();
  await platform().agent.send(text, selections, answer, drawing);
}
