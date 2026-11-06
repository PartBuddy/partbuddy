import type { MessageAnswer, Selection } from '../../../shared/contract';
import type { SketchPicture } from './SketchPad';
import { platform } from '../platform';

/** Sends a message to the assistant with the selection that goes along. */
export async function sendToAssistant(text: string, selections: Selection[] = [], answer?: MessageAnswer, sketch?: SketchPicture, photo?: Uint8Array): Promise<void> {
  await platform().agent.send(text, selections, answer, sketch?.png, photo, sketch?.elements);
}
